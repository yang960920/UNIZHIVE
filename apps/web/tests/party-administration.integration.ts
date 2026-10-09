import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  targetGuild: "MEMBER",
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({
    status: boundary.targetGuild,
    retryAfterSeconds: null,
  }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});
import {
  accounts,
  and,
  auditLogs,
  eq,
  getDb,
  operations,
  operationParticipants,
  operationRoles,
  scenarios,
  seasonMemberships,
  seasons,
  servers,
  users,
} from "@uniz/db";
import {
  getPartyEditorData,
  managePartyParticipant,
  saveParty,
} from "../src/lib/server/party-administration";
import { mutateOperationAdministration } from "../src/lib/server/operation-administration";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Party verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const hour = 3_600_000;
function authenticate(user: CurrentUser) {
  boundary.state = { user, status: "AUTHENTICATED" };
}
async function withRollback(
  verify: (
    tx: Transaction,
    data: {
      member: CurrentUser;
      other: CurrentUser;
      officer: CurrentUser;
      seasonId: string;
      input: {
        seasonId: string;
        title: string;
        contentKey: "raid";
        meetingPoint: string;
        description: string;
        startsAt: string;
        endsAt: string;
        capacity: number;
        status: "SCHEDULED";
      };
    },
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const rollback = new Error("Intentional party fixture rollback");
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      boundary.targetGuild = "MEMBER";
      const member: CurrentUser = {
        id: randomUUID(),
        name: "Party Fixture Member",
        role: "MEMBER",
        isMock: false,
      };
      const other: CurrentUser = { ...member, id: randomUUID(), name: "Party Fixture Other" };
      const officer: CurrentUser = {
        ...member,
        id: randomUUID(),
        name: "Party Fixture Officer",
        role: "OFFICER",
      };
      for (const actor of [member, other, officer]) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `party-${actor.id}`,
        });
      }
      const [scenario] = await tx
        .insert(scenarios)
        .values({ slug: `party-${randomUUID()}`, name: "Party Fixture" })
        .returning();
      const [server] = await tx
        .insert(servers)
        .values({ scenarioId: scenario.id, name: `Party-${randomUUID()}`, region: "TEST" })
        .returning();
      const now = Date.now();
      const [season] = await tx
        .insert(seasons)
        .values({
          scenarioId: scenario.id,
          serverId: server.id,
          seasonNumber: 1,
          name: "Party Fixture Season",
          status: "PLANNED",
          approvalStatus: "APPROVED",
          startsAt: new Date(now - hour),
          settlementAt: new Date(now + 48 * hour),
        })
        .returning();
      await tx.insert(seasonMemberships).values([
        { seasonId: season.id, userId: member.id },
        { seasonId: season.id, userId: other.id },
      ]);
      authenticate(member);
      await verify(tx, {
        member,
        other,
        officer,
        seasonId: season.id,
        input: {
          seasonId: season.id,
          title: "검증 파티",
          contentKey: "raid",
          meetingPoint: "입구",
          description: "Fixture",
          startsAt: new Date(now + 2 * hour).toISOString(),
          endsAt: new Date(now + 3 * hour).toISOString(),
          capacity: 2,
          status: "SCHEDULED",
        },
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
  }
}
async function version(tx: Transaction, id: string) {
  const [party] = await tx.select().from(operations).where(eq(operations.id, id));
  return party.updatedAt.toISOString();
}
describe("party administration rollback verification", () => {
  it("blocks legacy admin edits of new parties while preserving legacy operation edits", async () => {
    await withRollback(async (tx, f) => {
      const created = await saveParty(f.input);
      const [before] = await tx.select().from(operations).where(eq(operations.id, created.id));
      const logsBefore = await tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, created.id));
      authenticate(f.officer);
      const legacyInput = {
        action: "SAVE_OPERATION",
        id: created.id,
        expectedUpdatedAt: before.updatedAt.toISOString(),
        seasonId: f.seasonId,
        title: "기존 경로 수정",
        type: "FARM",
        description: "Legacy edit",
        startsAt: f.input.startsAt,
        endsAt: f.input.endsAt,
        capacity: f.input.capacity,
        status: "SCHEDULED",
      };
      await expect(mutateOperationAdministration(legacyInput)).rejects.toThrow("파티 모집");
      const [after] = await tx.select().from(operations).where(eq(operations.id, created.id));
      expect(after).toEqual(before);
      expect(await tx.select().from(auditLogs).where(eq(auditLogs.entityId, created.id))).toEqual(
        logsBefore,
      );
      const [legacy] = await tx
        .insert(operations)
        .values({
          seasonId: f.seasonId,
          title: "기존 작전",
          type: "RAID",
          startsAt: new Date(f.input.startsAt),
          endsAt: new Date(f.input.endsAt),
          capacity: f.input.capacity,
          createdById: f.officer.id,
        })
        .returning();
      await mutateOperationAdministration({
        ...legacyInput,
        id: legacy.id,
        expectedUpdatedAt: legacy.updatedAt.toISOString(),
      });
      const [legacyAfter] = await tx.select().from(operations).where(eq(operations.id, legacy.id));
      expect(legacyAfter.contentKey).toBeNull();
      expect(legacyAfter.type).toBe("FARM");
      expect(legacyAfter.title).toBe(legacyInput.title);
    });
  });
  it("rejects positive staff responses when condenser content is disabled while allowing reservation release", async () => {
    await withRollback(async (tx, f) => {
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: true })
        .where(eq(seasons.id, f.seasonId));
      const created = await saveParty({ ...f.input, contentKey: "gravity-condenser" });
      await tx
        .insert(operationParticipants)
        .values({ operationId: created.id, userId: f.member.id, status: "GOING" });
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: false })
        .where(eq(seasons.id, f.seasonId));
      authenticate(f.officer);
      const stale = await version(tx, created.id);
      for (const status of ["GOING", "MAYBE"])
        await expect(
          managePartyParticipant({
            operationId: created.id,
            userId: f.other.id,
            action: "SET_STATUS",
            status,
            expectedUpdatedAt: stale,
          }),
        ).rejects.toThrow("콘텐츠");
      await managePartyParticipant({
        operationId: created.id,
        userId: f.member.id,
        action: "SET_STATUS",
        status: "UNAVAILABLE",
        expectedUpdatedAt: stale,
      });
      await managePartyParticipant({
        operationId: created.id,
        userId: f.member.id,
        action: "REMOVE",
        expectedUpdatedAt: await version(tx, created.id),
      });
      const [reservation] = await tx
        .select()
        .from(operationParticipants)
        .where(
          and(
            eq(operationParticipants.operationId, created.id),
            eq(operationParticipants.userId, f.member.id),
          ),
        );
      expect(reservation.status).toBe("UNAVAILABLE");
      expect(reservation.roleId).toBeNull();
      expect(await version(tx, created.id)).not.toBe(stale);
    });
  });
  it("allows cancelling a retained condenser party after the season stops offering that content", async () => {
    await withRollback(async (tx, f) => {
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: true })
        .where(eq(seasons.id, f.seasonId));
      const created = await saveParty({ ...f.input, contentKey: "gravity-condenser" });
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: false })
        .where(eq(seasons.id, f.seasonId));
      await saveParty({
        ...f.input,
        contentKey: "gravity-condenser",
        id: created.id,
        expectedUpdatedAt: await version(tx, created.id),
        status: "CANCELLED",
      });
      const [party] = await tx.select().from(operations).where(eq(operations.id, created.id));
      expect(party.contentKey).toBe("gravity-condenser");
      expect(party.status).toBe("CANCELLED");
    });
  });
  it("lets an enrolled member create/edit/cancel without altering season participation or auto attendance", async () => {
    await withRollback(async (tx, f) => {
      const created = await saveParty(f.input);
      const data = await getPartyEditorData(created.id);
      expect(data.initial?.meetingPoint).toBe("입구");
      expect(data.seasons.find((season) => season.id === f.seasonId)?.serverAddress).toContain(
        "Party-",
      );
      const attendees = await tx
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.operationId, created.id));
      expect(attendees).toHaveLength(0);
      await saveParty({
        ...f.input,
        id: created.id,
        expectedUpdatedAt: data.initial!.updatedAt,
        status: "CANCELLED",
      });
      const [membership] = await tx
        .select()
        .from(seasonMemberships)
        .where(
          and(
            eq(seasonMemberships.userId, f.member.id),
            eq(seasonMemberships.seasonId, f.seasonId),
          ),
        );
      expect(membership.removedAt).toBeNull();
    });
  });
  it("rejects another author, removed enrollment, and stale edits while letting an officer manage", async () => {
    await withRollback(async (tx, f) => {
      const created = await saveParty(f.input);
      const old = await version(tx, created.id);
      authenticate(f.other);
      await expect(getPartyEditorData(created.id)).rejects.toThrow("권한");
      await expect(
        saveParty({ ...f.input, id: created.id, expectedUpdatedAt: old }),
      ).rejects.toThrow("본인");
      authenticate(f.officer);
      await saveParty({ ...f.input, id: created.id, expectedUpdatedAt: old, title: "운영진 수정" });
      await expect(
        saveParty({ ...f.input, id: created.id, expectedUpdatedAt: old }),
      ).rejects.toThrow("변경");
      authenticate(f.member);
      await tx
        .update(seasonMemberships)
        .set({ removedAt: new Date() })
        .where(eq(seasonMemberships.userId, f.member.id));
      await expect(saveParty(f.input)).rejects.toThrow("참가 중인 시즌");
    });
  });
  it("rechecks persisted approval and scenario content rather than trusting session or form", async () => {
    await withRollback(async (tx, f) => {
      await expect(saveParty({ ...f.input, contentKey: "endless-deep" })).rejects.toThrow("콘텐츠");
      await expect(saveParty({ ...f.input, contentKey: "gravity-condenser" })).rejects.toThrow(
        "콘텐츠",
      );
      await tx
        .update(seasons)
        .set({ gravityContentEnabled: true })
        .where(eq(seasons.id, f.seasonId));
      await saveParty({ ...f.input, contentKey: "gravity-condenser" });
      await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, f.member.id));
      await expect(saveParty(f.input)).rejects.toThrow("승인된");
    });
  });
  it("protects attendee capacity and version, permits officer removal, and preserves historical rows", async () => {
    await withRollback(async (tx, f) => {
      const created = await saveParty({ ...f.input, capacity: 1 });
      const [role] = await tx
        .insert(operationRoles)
        .values({ operationId: created.id, name: "Fixture role", capacity: 1 })
        .returning();
      await tx
        .insert(operationParticipants)
        .values({ operationId: created.id, userId: f.member.id, status: "GOING", roleId: role.id });
      const old = await version(tx, created.id);
      await expect(
        managePartyParticipant({
          operationId: created.id,
          userId: f.other.id,
          action: "SET_STATUS",
          status: "MAYBE",
          expectedUpdatedAt: old,
        }),
      ).rejects.toThrow("운영진");
      authenticate(f.officer);
      await expect(
        managePartyParticipant({
          operationId: created.id,
          userId: f.other.id,
          action: "SET_STATUS",
          status: "GOING",
          expectedUpdatedAt: old,
        }),
      ).rejects.toThrow("정원");
      await managePartyParticipant({
        operationId: created.id,
        userId: f.member.id,
        action: "REMOVE",
        expectedUpdatedAt: old,
      });
      const [removed] = await tx
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.userId, f.member.id));
      expect(removed.status).toBe("UNAVAILABLE");
      expect(removed.roleId).toBeNull();
      await expect(
        managePartyParticipant({
          operationId: created.id,
          userId: f.other.id,
          action: "SET_STATUS",
          status: "GOING",
          expectedUpdatedAt: old,
        }),
      ).rejects.toThrow("변경");
      await managePartyParticipant({
        operationId: created.id,
        userId: f.other.id,
        action: "SET_STATUS",
        status: "GOING",
        expectedUpdatedAt: await version(tx, created.id),
      });
    });
  });
  it("rejects participant promotion without enrollment or verified Guild eligibility", async () => {
    await withRollback(async (tx, f) => {
      const created = await saveParty(f.input);
      authenticate(f.officer);
      const args = {
        operationId: created.id,
        userId: f.officer.id,
        action: "SET_STATUS",
        status: "GOING",
        expectedUpdatedAt: await version(tx, created.id),
      };
      await expect(managePartyParticipant(args)).rejects.toThrow("등록된");
      boundary.targetGuild = "LEFT";
      await expect(managePartyParticipant({ ...args, userId: f.other.id })).rejects.toThrow(
        "Discord",
      );
    });
  });
});
