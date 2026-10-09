import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";
import { SCENARIO_PRESETS, type ScenarioPresetKey } from "../src/lib/scenario-presets";
import { getScenarioPhaseTemplate } from "@uniz/domain";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  user: null as CurrentUser | null,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentUser: async () => boundary.user,
  getCurrentAuthState: async () => ({
    user: boundary.user,
    status: boundary.user ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("@uniz/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});

import {
  accounts,
  auditLogs,
  eq,
  getDb,
  scenarios,
  seasons,
  seasonMemberships,
  seasonPhases,
  seasonVotes,
  seasonVoteCandidates,
  servers,
  users,
} from "@uniz/db";
import {
  getSeasonAdminDetail,
  mutateSeasonAdministration,
} from "../src/lib/server/season-administration";
import { getPublicSeasonDetail } from "../src/lib/server/season-participation";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Season evolution verification requires local uniz_hive PostgreSQL.");
type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const draft = {
  action: "CREATE_SEASON_SETUP",
  scenarioKey: "DEVIATION",
  serverNumber: "0000",
  region: "TEST",
  name: "Season Evolution Hive",
  startsAt: "2026-10-01T00:00:00.000Z",
  settlementAt: null,
};

async function snapshot(database: Database | Transaction) {
  return {
    scenarios: await database.select().from(scenarios).orderBy(scenarios.id),
    servers: await database.select().from(servers).orderBy(servers.id),
    seasons: await database.select().from(seasons).orderBy(seasons.id),
    memberships: await database.select().from(seasonMemberships).orderBy(seasonMemberships.id),
    votes: await database.select().from(seasonVotes).orderBy(seasonVotes.id),
    phases: await database.select().from(seasonPhases).orderBy(seasonPhases.id),
  };
}
async function unusedNumber(transaction: Transaction, key: ScenarioPresetKey): Promise<string> {
  const preset = SCENARIO_PRESETS.find((row) => row.key === key)!;
  const rows = await transaction
    .select({ name: servers.name })
    .from(servers)
    .innerJoin(scenarios, eq(scenarios.id, servers.scenarioId))
    .where(eq(scenarios.slug, preset.slug));
  const occupied = new Set(rows.map((row) => row.name));
  for (let number = 0; number < 10000; number++) {
    const digits = String(number).padStart(4, "0");
    if (!occupied.has(`${preset.serverPrefix}${digits}`)) return digits;
  }
  throw new Error("No free fixture address.");
}
async function seasonRow(transaction: Transaction, id: string) {
  const [row] = await transaction.select().from(seasons).where(eq(seasons.id, id));
  return row!;
}
async function withRollback(
  verify: (
    transaction: Transaction,
    actors: { admin: CurrentUser; member: CurrentUser; officer: CurrentUser; other: CurrentUser },
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const database = actual.getDb();
  const before = await snapshot(database);
  const actors = {
    admin: { id: randomUUID(), name: "Evolution Admin", role: "ADMIN", isMock: false },
    member: { id: randomUUID(), name: "Evolution Member", role: "MEMBER", isMock: false },
    officer: { id: randomUUID(), name: "Evolution Officer", role: "OFFICER", isMock: false },
    other: { id: randomUUID(), name: "Other Member", role: "MEMBER", isMock: false },
  } as const;
  const rollback = new Error("Intentional season evolution rollback");
  try {
    await database.transaction(async (transaction) => {
      boundary.transaction = transaction;
      boundary.user = actors.admin;
      for (const actor of Object.values(actors)) {
        await transaction
          .insert(users)
          .values({ id: actor.id, name: actor.name, role: actor.role });
        await transaction.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `season-evolution-${actor.id}`,
        });
      }
      await verify(transaction, actors);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.user = null;
  }
  expect(await snapshot(database)).toEqual(before);
  for (const actor of Object.values(actors)) {
    expect(await database.select().from(users).where(eq(users.id, actor.id))).toHaveLength(0);
    expect(
      await database.select().from(auditLogs).where(eq(auditLogs.actorId, actor.id)),
    ).toHaveLength(0);
  }
}

describe("Editable seasons, member requests and managed participation", () => {
  it("keeps rapid next/previous changes, reloaded public/admin details and another season's phase independent", async () => {
    await withRollback(async (transaction) => {
      const { id } = await mutateSeasonAdministration({
        ...draft,
        serverNumber: await unusedNumber(transaction, "DEVIATION"),
      });
      const other = await mutateSeasonAdministration({
        ...draft,
        scenarioKey: "MANIBUS",
        serverNumber: await unusedNumber(transaction, "MANIBUS"),
      });
      const untouched = await getSeasonAdminDetail(other.id);
      let detail = await getSeasonAdminDetail(id);
      let expectedOrder = 1;
      for (const direction of ["NEXT", "PREVIOUS", "NEXT", "PREVIOUS"] as const) {
        const previousVersion = detail!.season.updatedAt;
        await mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: previousVersion,
          direction,
        });
        expectedOrder += direction === "NEXT" ? 1 : -1;
        detail = await getSeasonAdminDetail(id);
        const publicDetail = await getPublicSeasonDetail(id);
        expect(detail!.season).toMatchObject({
          currentPhaseOrder: expectedOrder,
          approvalStatus: "APPROVED",
        });
        expect(new Date(detail!.season.updatedAt).getTime()).toBeGreaterThan(
          new Date(previousVersion).getTime(),
        );
        expect(publicDetail!.season).toMatchObject({
          id,
          currentPhaseOrder: expectedOrder,
          updatedAt: detail!.season.updatedAt,
          currentPhaseName: detail!.currentPhase!.name,
        });
        expect(publicDetail!.phases.map((phase) => phase.id)).toEqual(
          detail!.phases.map((phase) => phase.id),
        );
        expect(await getSeasonAdminDetail(other.id)).toEqual(untouched);
      }
      expect(detail!.season.currentPhaseOrder).toBe(1);
    });
  });
  it("creates fixed stages and lets only administrators move the stored phase without changing participation history", async () => {
    await withRollback(async (transaction, { member, officer }) => {
      const input = { ...draft, serverNumber: await unusedNumber(transaction, "DEVIATION") };
      const { id } = await mutateSeasonAdministration(input);
      let detail = await getSeasonAdminDetail(id);
      expect(detail!.phases.map((phase) => phase.name)).toEqual(
        getScenarioPhaseTemplate("deviation"),
      );
      expect(detail!.phases.every((phase) => !phase.startsAt && !phase.endsAt)).toBe(true);
      expect(detail!.season.currentPhaseOrder).toBe(1);
      await expect(
        mutateSeasonAdministration({
          action: "SAVE_PHASE",
          seasonId: id,
          name: "Manual stage",
          order: 4,
          startsAt: null,
          endsAt: null,
        }),
      ).rejects.toMatchObject({ code: "FIXED_PHASES" });
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: detail!.season.updatedAt,
          direction: "PREVIOUS",
        }),
      ).rejects.toMatchObject({ code: "PHASE_BOUNDS" });
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: id,
        userIds: [member.id],
      });
      detail = await getSeasonAdminDetail(id);
      await mutateSeasonAdministration({
        action: "UPDATE_MEMBERSHIP",
        seasonId: id,
        userId: member.id,
        expectedUpdatedAt: detail!.memberships[0]!.updatedAt,
        migrationStatus: "READY",
      });
      const first = await mutateSeasonAdministration({
        action: "ADD_PRESET_CANDIDATE",
        seasonId: id,
        scenarioKey: "MANIBUS",
        label: "First destination",
      });
      await mutateSeasonAdministration({
        action: "ADD_PRESET_CANDIDATE",
        seasonId: id,
        scenarioKey: "WINTER",
        label: "Second destination",
      });
      detail = await getSeasonAdminDetail(id);
      await mutateSeasonAdministration({
        ...input,
        action: "SAVE_SEASON_SETUP",
        id,
        expectedUpdatedAt: detail!.season.updatedAt,
        status: "ACTIVE",
        voteClosesAt: "2026-11-01T00:00:00.000Z",
      });
      await transaction.insert(seasonVotes).values({
        seasonId: id,
        userId: member.id,
        candidateId: first.id,
        createdAt: new Date("2026-10-02T00:00:00Z"),
        updatedAt: new Date("2026-10-02T00:00:00Z"),
      });
      const membershipBefore = await transaction
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, id));
      const votesBefore = await transaction
        .select()
        .from(seasonVotes)
        .where(eq(seasonVotes.seasonId, id));
      detail = await getSeasonAdminDetail(id);
      const staleVersion = detail!.season.updatedAt;
      const admin = boundary.user;
      boundary.user = officer;
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: staleVersion,
          direction: "NEXT",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      boundary.user = admin;
      await mutateSeasonAdministration({
        action: "CHANGE_SEASON_PHASE",
        seasonId: id,
        expectedUpdatedAt: staleVersion,
        direction: "NEXT",
      });
      expect((await seasonRow(transaction, id)).currentPhaseOrder).toBe(2);
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: staleVersion,
          direction: "NEXT",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      detail = await getSeasonAdminDetail(id);
      await mutateSeasonAdministration({
        action: "CHANGE_SEASON_PHASE",
        seasonId: id,
        expectedUpdatedAt: detail!.season.updatedAt,
        direction: "NEXT",
      });
      detail = await getSeasonAdminDetail(id);
      expect(detail!.season).toMatchObject({ currentPhaseOrder: 3, status: "ACTIVE" });
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: detail!.season.updatedAt,
          direction: "NEXT",
        }),
      ).rejects.toMatchObject({ code: "PHASE_BOUNDS" });
      await mutateSeasonAdministration({
        action: "CHANGE_SEASON_PHASE",
        seasonId: id,
        expectedUpdatedAt: detail!.season.updatedAt,
        direction: "PREVIOUS",
      });
      detail = await getSeasonAdminDetail(id);
      await mutateSeasonAdministration({
        ...input,
        action: "SAVE_SEASON_SETUP",
        id,
        expectedUpdatedAt: detail!.season.updatedAt,
        scenarioKey: "WINTER",
        serverNumber: await unusedNumber(transaction, "WINTER"),
        name: "Updated scenario hive",
      });
      detail = await getSeasonAdminDetail(id);
      expect(detail!.season).toMatchObject({ currentPhaseOrder: 1, status: "ACTIVE" });
      expect(detail!.phases.map((phase) => phase.name)).toEqual(
        getScenarioPhaseTemplate("the-way-of-winter"),
      );
      expect(
        await transaction
          .select()
          .from(seasonMemberships)
          .where(eq(seasonMemberships.seasonId, id)),
      ).toEqual(membershipBefore);
      expect(
        await transaction.select().from(seasonVotes).where(eq(seasonVotes.seasonId, id)),
      ).toEqual(votesBefore);
      expect(
        await transaction
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, id)),
      ).toEqual(
        expect.arrayContaining([
          { action: "season.phase.changed" },
          { action: "season.phases.reconfigured" },
        ]),
      );
    });
  });

  it("rejects phase movement before approval and preserves the phase selection when reviewing a request", async () => {
    await withRollback(async (transaction, { admin, member }) => {
      boundary.user = member;
      const { id } = await mutateSeasonAdministration({
        ...draft,
        serverNumber: await unusedNumber(transaction, "DEVIATION"),
      });
      boundary.user = admin;
      let current = await seasonRow(transaction, id);
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
          direction: "NEXT",
        }),
      ).rejects.toMatchObject({ code: "APPROVAL" });
      await transaction.update(seasons).set({ currentPhaseOrder: 2 }).where(eq(seasons.id, id));
      current = await seasonRow(transaction, id);
      await mutateSeasonAdministration({
        action: "REVIEW_SEASON",
        seasonId: id,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        decision: "APPROVE",
      });
      current = await seasonRow(transaction, id);
      expect(current).toMatchObject({ approvalStatus: "APPROVED", currentPhaseOrder: 2 });
      await transaction.update(seasons).set({ status: "ARCHIVED" }).where(eq(seasons.id, id));
      current = await seasonRow(transaction, id);
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
          direction: "PREVIOUS",
        }),
      ).rejects.toMatchObject({ code: "ARCHIVED" });
    });
  });
  it("derives one number from the address, creates administrators immediately and permits omitted settlement", async () => {
    await withRollback(async (transaction, { admin }) => {
      const digits = await unusedNumber(transaction, "DEVIATION");
      const result = await mutateSeasonAdministration({ ...draft, serverNumber: digits });
      expect(result.approvalStatus).toBe("APPROVED");
      const { id } = result;
      expect(await seasonRow(transaction, id)).toMatchObject({
        seasonNumber: Number(digits),
        approvalStatus: "APPROVED",
        status: "PLANNED",
        settlementAt: null,
        createdById: admin.id,
      });
      await expect(
        mutateSeasonAdministration({ ...draft, serverNumber: digits }),
      ).rejects.toMatchObject({ code: "DUPLICATE" });
      // A number belongs to its scenario rather than a global sequential season counter.
      const [otherScenario] = await transaction
        .insert(scenarios)
        .values({ slug: `same-number-${randomUUID()}`, name: "Other scenario" })
        .returning();
      const [otherServer] = await transaction
        .insert(servers)
        .values({ scenarioId: otherScenario!.id, name: `Other-X${digits}`, region: "TEST" })
        .returning();
      await expect(
        transaction.insert(seasons).values({
          seasonNumber: Number(digits),
          scenarioId: otherScenario!.id,
          serverId: otherServer!.id,
          name: "Same digits",
          startsAt: new Date(draft.startsAt),
          settlementAt: null,
        }),
      ).resolves.toBeDefined();
    });
  });

  it("uses current roles, requires administrator review and lets the author revise a rejected request", async () => {
    await withRollback(async (transaction, { admin, member, officer, other }) => {
      boundary.user = member;
      const input = { ...draft, serverNumber: await unusedNumber(transaction, "DEVIATION") };
      const result = await mutateSeasonAdministration(input);
      expect(result.approvalStatus).toBe("PENDING");
      const { id } = result;
      let current = await seasonRow(transaction, id);
      expect(current).toMatchObject({ approvalStatus: "PENDING", createdById: member.id });
      boundary.user = admin;
      await expect(
        mutateSeasonAdministration({ action: "ENROL_MEMBERS", seasonId: id, userIds: [member.id] }),
      ).rejects.toMatchObject({ code: "APPROVAL" });
      boundary.user = officer;
      await expect(
        mutateSeasonAdministration({
          action: "REVIEW_SEASON",
          seasonId: id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
          decision: "APPROVE",
        }),
      ).rejects.toMatchObject({ code: "REVIEW" });
      boundary.user = other;
      await expect(
        mutateSeasonAdministration({
          ...input,
          action: "SAVE_SEASON_SETUP",
          id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
          name: "Unauthorized rename",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      boundary.user = admin;
      await mutateSeasonAdministration({
        action: "REVIEW_SEASON",
        seasonId: id,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        decision: "REJECT",
      });
      current = await seasonRow(transaction, id);
      expect(current.approvalStatus).toBe("REJECTED");
      boundary.user = member;
      await mutateSeasonAdministration({
        ...input,
        action: "SAVE_SEASON_SETUP",
        id,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        name: "Revised hive name",
      });
      current = await seasonRow(transaction, id);
      expect(current).toMatchObject({
        approvalStatus: "PENDING",
        name: "Revised hive name",
        reviewedAt: null,
        reviewedById: null,
      });
      boundary.user = admin;
      await mutateSeasonAdministration({
        action: "REVIEW_SEASON",
        seasonId: id,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        decision: "APPROVE",
      });
      current = await seasonRow(transaction, id);
      expect(current).toMatchObject({ approvalStatus: "APPROVED", reviewedById: admin.id });
      boundary.user = member;
      await expect(
        mutateSeasonAdministration({
          ...input,
          action: "SAVE_SEASON_SETUP",
          id,
          expectedUpdatedAt: current.updatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      // A stale administrator session cannot grant its previous role to a fresh member.
      boundary.user = admin;
      await transaction.update(users).set({ role: "MEMBER" }).where(eq(users.id, admin.id));
      const freshRoleResult = await mutateSeasonAdministration({
        ...draft,
        scenarioKey: "MANIBUS",
        serverNumber: await unusedNumber(transaction, "MANIBUS"),
      });
      expect((await seasonRow(transaction, freshRoleResult.id)).approvalStatus).toBe("PENDING");
    });
  });

  it("edits archived metadata and participant status, removes participation while preserving votes, then restores it", async () => {
    await withRollback(async (transaction, { member }) => {
      const input = { ...draft, serverNumber: await unusedNumber(transaction, "DEVIATION") };
      const { id } = await mutateSeasonAdministration(input);
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: id,
        userIds: [member.id],
      });
      const [membership] = await transaction
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, id));
      await mutateSeasonAdministration({
        action: "UPDATE_MEMBERSHIP",
        seasonId: id,
        userId: member.id,
        expectedUpdatedAt: membership!.updatedAt.toISOString(),
        migrationStatus: "MIGRATED",
      });
      await expect(
        mutateSeasonAdministration({
          action: "REMOVE_MEMBER",
          seasonId: id,
          userId: member.id,
          expectedUpdatedAt: membership!.updatedAt.toISOString(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const candidate = await mutateSeasonAdministration({
        action: "ADD_PRESET_CANDIDATE",
        seasonId: id,
        scenarioKey: "MANIBUS",
        label: "Next scenario",
      });
      await mutateSeasonAdministration({
        action: "ADD_PRESET_CANDIDATE",
        seasonId: id,
        scenarioKey: "WINTER",
        label: "Second scenario",
      });
      await transaction.insert(seasonVotes).values({
        seasonId: id,
        userId: member.id,
        candidateId: candidate.id,
        createdAt: new Date("2026-10-02T00:00:00Z"),
        updatedAt: new Date("2026-10-02T00:00:00Z"),
      });
      await transaction
        .update(seasons)
        .set({ status: "ARCHIVED", voteClosesAt: new Date("2026-11-01T00:00:00Z") })
        .where(eq(seasons.id, id));
      let current = await seasonRow(transaction, id);
      await mutateSeasonAdministration({
        ...input,
        action: "SAVE_SEASON_SETUP",
        id,
        expectedUpdatedAt: current.updatedAt.toISOString(),
        serverNumber: await unusedNumber(transaction, "DEVIATION"),
        name: "Renamed archived hive",
        region: "Updated Region",
        status: "ARCHIVED",
      });
      current = await seasonRow(transaction, id);
      expect(current).toMatchObject({
        status: "ARCHIVED",
        name: "Renamed archived hive",
        settlementAt: null,
      });
      let detail = await getSeasonAdminDetail(id);
      expect(detail?.memberships[0]?.migrationStatus).toBe("MIGRATED");
      await mutateSeasonAdministration({
        action: "REMOVE_MEMBER",
        seasonId: id,
        userId: member.id,
        expectedUpdatedAt: detail!.memberships[0]!.updatedAt,
      });
      detail = await getSeasonAdminDetail(id);
      expect(detail?.memberships).toHaveLength(0);
      expect(detail?.enrolledMemberIds).toHaveLength(0);
      expect(
        await transaction.select().from(seasonVotes).where(eq(seasonVotes.seasonId, id)),
      ).toHaveLength(1);
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: id,
        userIds: [member.id],
      });
      detail = await getSeasonAdminDetail(id);
      expect(detail?.memberships).toHaveLength(1);
      expect(detail?.memberships[0]).toMatchObject({
        id: membership!.id,
        migrationStatus: "UNDECIDED",
      });
      const [restored] = await transaction
        .select()
        .from(seasonMemberships)
        .where(eq(seasonMemberships.id, membership!.id));
      expect(restored?.joinedAt).toEqual(membership!.joinedAt);
      expect(
        await transaction
          .select()
          .from(seasonVoteCandidates)
          .where(eq(seasonVoteCandidates.id, candidate.id)),
      ).toHaveLength(1);
    });
  });
});
