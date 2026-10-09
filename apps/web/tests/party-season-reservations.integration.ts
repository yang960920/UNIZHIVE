import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  user: null as CurrentUser | null,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => ({
    user: boundary.user,
    status: boundary.user ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: "MEMBER", retryAfterSeconds: null }),
  getLiveGuildEligibility: async () => "MEMBER",
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});
import {
  accounts,
  eq,
  getDb,
  operationParticipants,
  operations,
  scenarios,
  seasonMemberships,
  seasons,
  servers,
  users,
} from "@uniz/db";
import { persistOperationalMutation } from "../src/lib/server/operational-repository";
import {
  mutateSeasonAdministration,
  getSeasonAdminDetail,
} from "../src/lib/server/season-administration";
import { joinSeason } from "../src/lib/server/season-participation";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Party reservation verification requires local uniz_hive PostgreSQL.");

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function withRollback(
  verify: (
    tx: Transaction,
    fixture: {
      admin: CurrentUser;
      member: CurrentUser;
      seasonId: string;
      otherSeasonId: string;
      futureId: string;
      pastId: string;
      otherId: string;
    },
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const rollback = new Error("Intentional party reservation rollback");
  const admin: CurrentUser = {
    id: randomUUID(),
    name: "Reservation Fixture Admin",
    role: "ADMIN",
    isMock: false,
  };
  const member: CurrentUser = {
    id: randomUUID(),
    name: "Reservation Fixture Member",
    role: "MEMBER",
    isMock: false,
  };
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      boundary.user = admin;
      for (const actor of [admin, member]) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `party-reservation-${actor.id}`,
        });
      }
      const [scenario] = await tx
        .insert(scenarios)
        .values({ slug: `party-reservation-${randomUUID()}`, name: "Reservation Fixture" })
        .returning();
      const [server] = await tx
        .insert(servers)
        .values({ scenarioId: scenario.id, name: `Fixture-${randomUUID()}`, region: "TEST" })
        .returning();
      const now = Date.now();
      const [season, otherSeason] = await tx
        .insert(seasons)
        .values(
          [1, 2].map((seasonNumber) => ({
            scenarioId: scenario.id,
            serverId: server.id,
            seasonNumber,
            name: "Reservation Fixture Hive",
            status: "PLANNED" as const,
            approvalStatus: "APPROVED" as const,
            startsAt: new Date(now + 3_600_000),
          })),
        )
        .returning();
      const [future, past, other] = await tx
        .insert(operations)
        .values(
          [
            { seasonId: season.id, startsAt: new Date(now + 7_200_000) },
            { seasonId: season.id, startsAt: new Date(now - 7_200_000) },
            { seasonId: otherSeason.id, startsAt: new Date(now + 7_200_000) },
          ].map((row) => ({
            ...row,
            title: "Reservation Fixture Party",
            type: "RAID" as const,
            contentKey: "raid",
            createdById: admin.id,
            capacity: 1,
          })),
        )
        .returning();
      await verify(tx, {
        admin,
        member,
        seasonId: season.id,
        otherSeasonId: otherSeason.id,
        futureId: future.id,
        pastId: past.id,
        otherId: other.id,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.user = null;
  }
  expect(await actual.getDb().select().from(users).where(eq(users.id, admin.id))).toHaveLength(0);
  expect(await actual.getDb().select().from(users).where(eq(users.id, member.id))).toHaveLength(0);
}

describe("party reservations follow later season enrollment", () => {
  it("denies disabled content but preserves withdrawal and allows it after enabling", async () => {
    await withRollback(async (tx, f) => {
      await tx.insert(seasonMemberships).values({ seasonId: f.seasonId, userId: f.member.id });
      await tx
        .update(operations)
        .set({ contentKey: "gravity-condenser" })
        .where(eq(operations.id, f.futureId));
      for (const status of ["GOING", "MAYBE"] as const)
        await expect(
          persistOperationalMutation(f.member, {
            action: "RSVP",
            operationId: f.futureId,
            status,
          }),
        ).rejects.toThrow("사용할 수 없는 콘텐츠");
      await persistOperationalMutation(f.member, {
        action: "RSVP",
        operationId: f.futureId,
        status: "UNAVAILABLE",
      });
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: true })
        .where(eq(seasons.id, f.seasonId));
      await persistOperationalMutation(f.member, {
        action: "RSVP",
        operationId: f.futureId,
        status: "GOING",
      });
      expect(
        (
          await tx
            .select()
            .from(operationParticipants)
            .where(eq(operationParticipants.operationId, f.futureId))
        )[0].status,
      ).toBe("GOING");
    });
  });
  it("rejects a nonmember then allows a later join in a planned season with no phase rows", async () => {
    await withRollback(async (tx, f) => {
      await expect(
        persistOperationalMutation(f.member, {
          action: "RSVP",
          operationId: f.futureId,
          status: "GOING",
        }),
      ).rejects.toThrow("참가 명단");
      boundary.user = f.member;
      await joinSeason({ seasonId: f.seasonId });
      await persistOperationalMutation(f.member, {
        action: "RSVP",
        operationId: f.futureId,
        status: "GOING",
      });
      const [reservation] = await tx
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.operationId, f.futureId));
      expect(reservation).toMatchObject({ userId: f.member.id, status: "GOING" });
    });
  });
  it("releases only future reservations in the removed season and preserves past/other-season history", async () => {
    await withRollback(async (tx, f) => {
      const [membership] = await tx
        .insert(seasonMemberships)
        .values({ seasonId: f.seasonId, userId: f.member.id })
        .returning();
      await tx.insert(seasonMemberships).values({ seasonId: f.otherSeasonId, userId: f.member.id });
      await tx.insert(operationParticipants).values(
        [f.futureId, f.pastId, f.otherId].map((operationId) => ({
          operationId,
          userId: f.member.id,
          status: "GOING" as const,
        })),
      );
      await mutateSeasonAdministration({
        action: "REMOVE_MEMBER",
        seasonId: f.seasonId,
        userId: f.member.id,
        expectedUpdatedAt: membership.updatedAt.toISOString(),
      });
      const rows = await tx
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.userId, f.member.id));
      expect(rows.find((row) => row.operationId === f.futureId)).toMatchObject({
        status: "UNAVAILABLE",
        roleId: null,
      });
      expect(rows.find((row) => row.operationId === f.pastId)?.status).toBe("GOING");
      expect(rows.find((row) => row.operationId === f.otherId)?.status).toBe("GOING");
      await expect(
        persistOperationalMutation(f.member, {
          action: "RSVP",
          operationId: f.futureId,
          status: "GOING",
        }),
      ).rejects.toThrow("참가 명단");
      boundary.user = f.member;
      await joinSeason({ seasonId: f.seasonId });
      const afterJoin = await tx
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.operationId, f.futureId));
      expect(afterJoin[0].status).toBe("UNAVAILABLE");
      await persistOperationalMutation(f.member, {
        action: "RSVP",
        operationId: f.futureId,
        status: "GOING",
      });
    });
  });
  it("persists the content availability setting and preserves it in older save payloads", async () => {
    await withRollback(async (tx, f) => {
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: true, startsAt: new Date(Date.now() - 10_800_000) })
        .where(eq(seasons.id, f.seasonId));
      const detail = await getSeasonAdminDetail(f.seasonId);
      expect(detail?.season.gravityContentEnabled).toBe(true);
      const row = (await tx.select().from(seasons).where(eq(seasons.id, f.seasonId)))[0];
      await mutateSeasonAdministration({
        action: "SAVE_SEASON",
        id: row.id,
        expectedUpdatedAt: row.updatedAt.toISOString(),
        seasonNumber: row.seasonNumber,
        name: row.name,
        scenarioId: row.scenarioId,
        serverId: row.serverId,
        status: row.status,
        startsAt: row.startsAt.toISOString(),
        settlementAt: null,
        voteClosesAt: null,
      });
      expect((await getSeasonAdminDetail(f.seasonId))?.season.gravityContentEnabled).toBe(true);
    });
  });
});
