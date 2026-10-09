import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  auth: { user: null, status: "GUEST" } as CurrentAuthState,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => boundary.auth,
  getCurrentUser: async () => boundary.auth.user,
}));
vi.mock("@uniz/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});

import {
  accounts,
  and,
  auditLogs,
  eq,
  getDb,
  memberProfiles,
  scenarios,
  seasonMemberships,
  seasonPhases,
  seasons,
  servers,
  users,
} from "@uniz/db";
import {
  getOwnSeasonRequest,
  getPublicSeasonDetail,
  getSeasonParticipationData,
  joinSeason,
} from "../src/lib/server/season-participation";
import { mutateSeasonAdministration } from "../src/lib/server/season-administration";
import { persistOperationalMutation } from "../src/lib/server/operational-repository";
import { getScenarioPhaseTemplate } from "@uniz/domain";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Season participation verification requires the local uniz_hive database.");

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
interface Fixture {
  member: CurrentUser;
  admin: CurrentUser;
  other: CurrentUser;
  approved: string;
  pending: string;
  rejected: string;
  otherPending: string;
}
function authenticate(user: CurrentUser) {
  boundary.auth = { user, status: "AUTHENTICATED" };
}

async function withRollback(verify: (transaction: Transaction, fixture: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const database = actual.getDb();
  const member: CurrentUser = {
    id: randomUUID(),
    name: "Participation Fixture Member",
    role: "MEMBER",
    isMock: false,
  };
  const admin: CurrentUser = {
    id: randomUUID(),
    name: "Participation Fixture Admin",
    role: "ADMIN",
    isMock: false,
  };
  const other: CurrentUser = {
    id: randomUUID(),
    name: "Participation Fixture Other",
    role: "MEMBER",
    isMock: false,
  };
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const rollback = new Error("Intentional participation verification rollback");
  try {
    await database.transaction(async (transaction) => {
      boundary.transaction = transaction;
      authenticate(member);
      for (const actor of [member, admin, other]) {
        await transaction
          .insert(users)
          .values({ id: actor.id, name: actor.name, role: actor.role });
        await transaction.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `participation-${actor.id}`,
        });
      }
      await transaction.insert(memberProfiles).values({
        userId: member.id,
        handle: `verify_${member.id.slice(0, 8)}`,
        displayName: "Participation Fixture",
        onceHumanNickname: "Verification",
        onceHumanUid: "participation-private-fixture",
      });
      const [scenario] = await transaction
        .insert(scenarios)
        .values({ slug: `participation-${randomUUID()}`, name: "Participation Scenario" })
        .returning();
      const [server] = await transaction
        .insert(servers)
        .values({ scenarioId: scenario!.id, name: "Participation-X0001", region: "한국" })
        .returning();
      for (const [index, id] of ids.entries()) {
        await transaction.insert(seasons).values({
          id,
          scenarioId: scenario!.id,
          serverId: server!.id,
          seasonNumber: index + 1,
          name: `Participation Hive ${index + 1}`,
          startsAt: new Date("2030-01-01T00:00:00Z"),
          settlementAt: null,
          status: "PLANNED",
          approvalStatus: index === 0 ? "APPROVED" : index === 2 ? "REJECTED" : "PENDING",
          createdById: index === 3 ? other.id : member.id,
        });
      }
      await verify(transaction, {
        member,
        admin,
        other,
        approved: ids[0]!,
        pending: ids[1]!,
        rejected: ids[2]!,
        otherPending: ids[3]!,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.auth = { user: null, status: "GUEST" };
  }
  expect(
    await database.select({ id: users.id }).from(users).where(eq(users.id, member.id)),
  ).toHaveLength(0);
  expect(
    await database.select({ id: seasons.id }).from(seasons).where(eq(seasons.id, ids[0]!)),
  ).toHaveLength(0);
  expect(
    await database
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorId, member.id)),
  ).toHaveLength(0);
}

async function prepareManualWinterSeason(transaction: Transaction, fixture: Fixture) {
  let [scenario] = await transaction
    .select()
    .from(scenarios)
    .where(eq(scenarios.slug, "the-way-of-winter"));
  if (!scenario)
    [scenario] = await transaction
      .insert(scenarios)
      .values({ slug: "the-way-of-winter", name: "설산(The Way Of Winter)" })
      .returning();
  const [server] = await transaction
    .insert(servers)
    .values({
      scenarioId: scenario!.id,
      name: `Winter Public Detail ${randomUUID()}`,
      region: "한국",
    })
    .returning();
  const occupied = new Set(
    (
      await transaction
        .select({ number: seasons.seasonNumber })
        .from(seasons)
        .where(eq(seasons.scenarioId, scenario!.id))
    ).map((season) => season.number),
  );
  let number = 9000;
  while (occupied.has(number)) number += 1;
  await transaction
    .update(seasons)
    .set({
      scenarioId: scenario!.id,
      serverId: server!.id,
      seasonNumber: number,
      currentPhaseOrder: 4,
    })
    .where(eq(seasons.id, fixture.approved));
  await transaction.insert(seasonPhases).values(
    Array.from({ length: 6 }, (_, index) => ({
      seasonId: fixture.approved,
      name: `Retained historical phase ${index + 1}`,
      order: index + 1,
      startsAt: null,
      endsAt: null,
    })),
  );
  await transaction.insert(seasonMemberships).values([
    { seasonId: fixture.approved, userId: fixture.member.id, migrationStatus: "JOINING" },
    {
      seasonId: fixture.approved,
      userId: fixture.other.id,
      migrationStatus: "MIGRATED",
      removedAt: new Date(),
    },
    { seasonId: fixture.otherPending, userId: fixture.other.id, migrationStatus: "READY" },
  ]);
}

describe("Member season participation against local PostgreSQL", () => {
  it("reads the selected approved season with fixed bounded stages and no global or pending data", async () => {
    await withRollback(async (transaction, fixture) => {
      await prepareManualWinterSeason(transaction, fixture);
      const detail = await getPublicSeasonDetail(fixture.approved);
      expect(detail?.season).toMatchObject({
        id: fixture.approved,
        status: "PLANNED",
        currentPhaseOrder: 4,
        participantCount: 1,
        joined: true,
        settlementAt: null,
      });
      expect(detail?.phases.map((phase) => phase.name)).toEqual(
        getScenarioPhaseTemplate("the-way-of-winter"),
      );
      expect(detail?.phases).toHaveLength(4);
      expect(detail).toMatchObject({
        finalPhase: true,
        mayUpdateMigration: true,
        ownMigrationStatus: "JOINING",
        migrationCounts: { JOINING: 1, READY: 0, MIGRATED: 0 },
      });
      expect(JSON.stringify(detail)).not.toContain("participation-private-fixture");
      expect(await getPublicSeasonDetail(fixture.pending)).toBeNull();
      expect(await getPublicSeasonDetail(fixture.rejected)).toBeNull();
      expect(await getPublicSeasonDetail(fixture.otherPending)).toBeNull();
      expect(
        await transaction
          .select()
          .from(seasonPhases)
          .where(eq(seasonPhases.seasonId, fixture.approved)),
      ).toHaveLength(6);
    });
  });

  it("opens scoped migration on the last manual phase and preserves requests when an administrator moves back", async () => {
    await withRollback(async (transaction, fixture) => {
      await prepareManualWinterSeason(transaction, fixture);
      await persistOperationalMutation(fixture.member, {
        action: "MIGRATION",
        seasonId: fixture.approved,
        status: "READY",
      });
      expect((await getPublicSeasonDetail(fixture.approved))?.ownMigrationStatus).toBe("READY");
      const [season] = await transaction
        .select()
        .from(seasons)
        .where(eq(seasons.id, fixture.approved));
      authenticate(fixture.admin);
      await mutateSeasonAdministration({
        action: "CHANGE_SEASON_PHASE",
        seasonId: fixture.approved,
        expectedUpdatedAt: season!.updatedAt.toISOString(),
        direction: "PREVIOUS",
      });
      authenticate(fixture.member);
      const previous = await getPublicSeasonDetail(fixture.approved);
      expect(previous).toMatchObject({
        finalPhase: false,
        mayUpdateMigration: false,
        ownMigrationStatus: "READY",
      });
      await expect(
        persistOperationalMutation(fixture.member, {
          action: "MIGRATION",
          seasonId: fixture.approved,
          status: "MIGRATED",
        }),
      ).rejects.toMatchObject({ code: "MIGRATION_NOT_OPEN" });
      await transaction
        .update(seasons)
        .set({ currentPhaseOrder: 4, status: "ARCHIVED" })
        .where(eq(seasons.id, fixture.approved));
      expect((await getPublicSeasonDetail(fixture.approved))?.mayUpdateMigration).toBe(false);
      expect((await getPublicSeasonDetail(fixture.approved))?.ownMigrationStatus).toBe("READY");
    });
  });

  it("shows approved seasons without an active season, keeps pending requests private, and omits UID", async () => {
    await withRollback(async (transaction, fixture) => {
      await transaction.insert(seasonMemberships).values([
        { seasonId: fixture.approved, userId: fixture.member.id },
        { seasonId: fixture.approved, userId: fixture.other.id, removedAt: new Date() },
      ]);
      const data = await getSeasonParticipationData();
      const registered = data.seasons.find((season) => season.id === fixture.approved)!;
      expect(registered).toMatchObject({
        status: "PLANNED",
        settlementAt: null,
        joined: true,
        participantCount: 1,
      });
      expect(
        data.seasons.some((season) =>
          [fixture.pending, fixture.rejected, fixture.otherPending].includes(season.id),
        ),
      ).toBe(false);
      expect(data.requests.map((request) => request.id)).toEqual(
        expect.arrayContaining([fixture.pending, fixture.rejected]),
      );
      expect(data.requests.some((request) => request.id === fixture.otherPending)).toBe(false);
      expect(JSON.stringify(data)).not.toContain("participation-private-fixture");
      expect((await getOwnSeasonRequest(fixture.pending))?.season.approvalStatus).toBe("PENDING");
      expect((await getOwnSeasonRequest(fixture.rejected))?.season.approvalStatus).toBe("REJECTED");
      expect(await getOwnSeasonRequest(fixture.otherPending)).toBeNull();
      expect(await getOwnSeasonRequest(fixture.approved)).toBeNull();
    });
  });

  it("joins once, lets an administrator remove participation, and restores the same membership without losing its original join date", async () => {
    await withRollback(async (transaction, fixture) => {
      expect(await joinSeason({ seasonId: fixture.approved })).toEqual({ joined: true });
      const [initial] = await transaction
        .select()
        .from(seasonMemberships)
        .where(
          and(
            eq(seasonMemberships.seasonId, fixture.approved),
            eq(seasonMemberships.userId, fixture.member.id),
          ),
        );
      await joinSeason({ seasonId: fixture.approved });
      expect(
        await transaction
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.actorId, fixture.member.id),
              eq(auditLogs.action, "season.participation.joined"),
            ),
          ),
      ).toHaveLength(1);
      authenticate(fixture.admin);
      await mutateSeasonAdministration({
        action: "REMOVE_MEMBER",
        seasonId: fixture.approved,
        userId: fixture.member.id,
        expectedUpdatedAt: initial!.updatedAt.toISOString(),
      });
      authenticate(fixture.member);
      expect(
        (await getSeasonParticipationData()).seasons.find(
          (season) => season.id === fixture.approved,
        )?.joined,
      ).toBe(false);
      await joinSeason({ seasonId: fixture.approved });
      const [restored] = await transaction
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.id, initial!.id));
      expect(restored).toMatchObject({
        id: initial!.id,
        removedAt: null,
        removedById: null,
        migrationStatus: "UNDECIDED",
      });
      expect(restored!.joinedAt).toEqual(initial!.joinedAt);
      expect(
        await transaction
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.actorId, fixture.member.id),
              eq(auditLogs.action, "season.participation.joined"),
            ),
          ),
      ).toHaveLength(2);
      await transaction
        .update(seasons)
        .set({ status: "SETTLEMENT" })
        .where(eq(seasons.id, fixture.approved));
      await expect(joinSeason({ seasonId: fixture.approved })).rejects.toMatchObject({
        code: "CLOSED",
      });
    });
  });

  it("allows participation only after administrator approval", async () => {
    await withRollback(async (transaction, fixture) => {
      await expect(joinSeason({ seasonId: fixture.pending })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(joinSeason({ seasonId: fixture.rejected })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      const [pending] = await transaction
        .select()
        .from(seasons)
        .where(eq(seasons.id, fixture.pending));
      authenticate(fixture.admin);
      await mutateSeasonAdministration({
        action: "REVIEW_SEASON",
        seasonId: fixture.pending,
        expectedUpdatedAt: pending!.updatedAt.toISOString(),
        decision: "APPROVE",
      });
      authenticate(fixture.member);
      expect(
        (await getSeasonParticipationData()).seasons.some(
          (season) => season.id === fixture.pending,
        ),
      ).toBe(true);
      expect(
        (await getSeasonParticipationData()).requests.some(
          (request) => request.id === fixture.pending,
        ),
      ).toBe(false);
      await expect(joinSeason({ seasonId: fixture.pending })).resolves.toEqual({ joined: true });
    });
  });

  it("rechecks database roles and Discord linkage and rejects mock, unavailable and injected identities", async () => {
    await withRollback(async (transaction, fixture) => {
      await expect(
        joinSeason({ seasonId: fixture.approved, userId: fixture.other.id }),
      ).rejects.toMatchObject({ code: "INVALID" });
      boundary.auth = { user: fixture.member, status: "UNAVAILABLE" };
      await expect(joinSeason({ seasonId: fixture.approved })).rejects.toMatchObject({
        code: "UNAVAILABLE",
      });
      authenticate({ ...fixture.member, isMock: true });
      await expect(joinSeason({ seasonId: fixture.approved })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      authenticate(fixture.member);
      await transaction
        .update(users)
        .set({ role: "APPLICANT" })
        .where(eq(users.id, fixture.member.id));
      await expect(getSeasonParticipationData()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(joinSeason({ seasonId: fixture.approved })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await transaction
        .update(users)
        .set({ role: "MEMBER" })
        .where(eq(users.id, fixture.member.id));
      await transaction.delete(accounts).where(eq(accounts.userId, fixture.member.id));
      await expect(joinSeason({ seasonId: fixture.approved })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(
        await transaction
          .select()
          .from(seasonMemberships)
          .where(eq(seasonMemberships.userId, fixture.member.id)),
      ).toHaveLength(0);
    });
  });
});
