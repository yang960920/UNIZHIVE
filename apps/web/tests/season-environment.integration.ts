import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";
import { SCENARIO_PRESETS, type ScenarioPresetKey } from "../src/lib/scenario-presets";
import { getScenarioPhaseTemplate, hasGravityContent } from "@uniz/domain";

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
  and,
  auditLogs,
  eq,
  getDb,
  operationParticipants,
  operations,
  scenarios,
  seasonMemberships,
  seasonPhases,
  seasons,
  seasonVoteCandidates,
  seasonVotes,
  servers,
  users,
} from "@uniz/db";
import {
  getSeasonAdminData,
  getSeasonAdminDetail,
  mutateSeasonAdministration,
} from "../src/lib/server/season-administration";
import {
  getPublicSeasonDetail,
  getSeasonParticipationData,
} from "../src/lib/server/season-participation";
import {
  getOperationalPageData,
  persistOperationalMutation,
} from "../src/lib/server/operational-repository";
import { getOperationDirectoryDetail } from "../src/lib/server/operation-directory";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Season environment verification requires local uniz_hive PostgreSQL.");

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Actors = { admin: CurrentUser; member: CurrentUser; officer: CurrentUser };

const draft = {
  action: "CREATE_SEASON_SETUP",
  scenarioKey: "ENDLESS_DREAM",
  serverNumber: "0000",
  serverType: "SEASONAL",
  trancePhenomenon: "LUNAR_REVELRY",
  migrationOpen: false,
  region: "TEST",
  name: "Season Environment Verification",
  startsAt: "2026-10-01T00:00:00.000Z",
  settlementAt: null,
};

async function snapshot(database: Database | Transaction) {
  return {
    scenarios: await database.select().from(scenarios).orderBy(scenarios.id),
    servers: await database.select().from(servers).orderBy(servers.id),
    seasons: await database.select().from(seasons).orderBy(seasons.id),
    phases: await database.select().from(seasonPhases).orderBy(seasonPhases.id),
    memberships: await database.select().from(seasonMemberships).orderBy(seasonMemberships.id),
    votes: await database.select().from(seasonVotes).orderBy(seasonVotes.id),
    candidates: await database.select().from(seasonVoteCandidates).orderBy(seasonVoteCandidates.id),
    operations: await database.select().from(operations).orderBy(operations.id),
    participants: await database
      .select()
      .from(operationParticipants)
      .orderBy(operationParticipants.id),
    audits: await database.select().from(auditLogs).orderBy(auditLogs.id),
  };
}

async function unusedNumber(transaction: Transaction, key: ScenarioPresetKey) {
  const preset = SCENARIO_PRESETS.find((row) => row.key === key)!;
  const occupied = new Set(
    (
      await transaction
        .select({ number: seasons.seasonNumber })
        .from(seasons)
        .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
        .where(eq(scenarios.slug, preset.slug))
    ).map((row) => row.number),
  );
  for (let number = 0; number < 10_000; number += 1)
    if (!occupied.has(number)) return String(number).padStart(4, "0");
  throw new Error("No unused season environment fixture address.");
}

async function seasonRow(transaction: Transaction, id: string) {
  const [row] = await transaction.select().from(seasons).where(eq(seasons.id, id));
  return row!;
}

async function saveEnvironment(
  transaction: Transaction,
  id: string,
  input: typeof draft,
  changes: Record<string, unknown>,
) {
  const current = await seasonRow(transaction, id);
  return mutateSeasonAdministration({
    ...input,
    action: "SAVE_SEASON_SETUP",
    id,
    expectedUpdatedAt: current.updatedAt.toISOString(),
    status: current.status,
    voteClosesAt: current.voteClosesAt?.toISOString() ?? null,
    ...changes,
  });
}

async function withRollback(verify: (transaction: Transaction, actors: Actors) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const database = actual.getDb();
  const before = await snapshot(database);
  const actors: Actors = {
    admin: { id: randomUUID(), name: "Environment Admin", role: "ADMIN", isMock: false },
    member: { id: randomUUID(), name: "Environment Member", role: "MEMBER", isMock: false },
    officer: { id: randomUUID(), name: "Environment Officer", role: "OFFICER", isMock: false },
  };
  const rollback = new Error("Intentional season environment verification rollback");
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
          providerAccountId: `season-environment-${actor.id}`,
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
  for (const actor of Object.values(actors))
    expect(await database.select().from(users).where(eq(users.id, actor.id))).toHaveLength(0);
}

describe("Independent server type and trance phenomenon against local PostgreSQL", () => {
  it("registers the same Endless Dream number separately for seasonal and permanent servers and exposes their distinct environments", async () => {
    await withRollback(async (transaction) => {
      const number = await unusedNumber(transaction, "ENDLESS_DREAM");
      const seasonalInput = { ...draft, serverNumber: number, trancePhenomenon: "GRAVITY_ABYSS" };
      const permanentInput = { ...draft, serverNumber: number, serverType: "PERMANENT" };
      const seasonal = await mutateSeasonAdministration(seasonalInput);
      const permanent = await mutateSeasonAdministration(permanentInput);
      const seasonalRow = await seasonRow(transaction, seasonal.id);
      const permanentRow = await seasonRow(transaction, permanent.id);
      expect(seasonalRow).toMatchObject({
        scenarioId: permanentRow.scenarioId,
        seasonNumber: Number(number),
        serverType: "SEASONAL",
        trancePhenomenon: "GRAVITY_ABYSS",
        migrationOpen: false,
        settlementAt: null,
      });
      expect(permanentRow).toMatchObject({
        seasonNumber: Number(number),
        serverType: "PERMANENT",
        trancePhenomenon: "LUNAR_REVELRY",
        migrationOpen: false,
        settlementAt: null,
      });
      const seasonalDetail = await getSeasonAdminDetail(seasonal.id);
      const permanentDetail = await getSeasonAdminDetail(permanent.id);
      expect(seasonalDetail?.phases.map((phase) => phase.name)).toEqual(
        getScenarioPhaseTemplate("endless-dream"),
      );
      expect(permanentDetail).toMatchObject({ phases: [], currentPhase: null });
      for (const [id, serverType, trancePhenomenon] of [
        [seasonal.id, "SEASONAL", "GRAVITY_ABYSS"],
        [permanent.id, "PERMANENT", "LUNAR_REVELRY"],
      ]) {
        const environment = { serverType, trancePhenomenon, migrationOpen: false };
        expect((await getSeasonAdminDetail(id!))?.season).toMatchObject(environment);
        expect((await getSeasonAdminData()).seasons.find((row) => row.id === id)).toMatchObject(
          environment,
        );
        expect((await getPublicSeasonDetail(id!))?.season).toMatchObject(environment);
        expect(
          (await getSeasonParticipationData()).seasons.find((row) => row.id === id),
        ).toMatchObject(environment);
      }
      const beforeDuplicate = await snapshot(transaction);
      await expect(mutateSeasonAdministration(permanentInput)).rejects.toMatchObject({
        code: "DUPLICATE",
      });
      expect(await snapshot(transaction)).toEqual(beforeDuplicate);
    });
  });

  it("changes the trance phenomenon without resetting phases, participation, votes or earlier audit history", async () => {
    await withRollback(async (transaction, { member }) => {
      const input = { ...draft, serverNumber: await unusedNumber(transaction, "ENDLESS_DREAM") };
      const { id } = await mutateSeasonAdministration(input);
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: id,
        userIds: [member.id],
      });
      const detail = await getSeasonAdminDetail(id);
      await mutateSeasonAdministration({
        action: "UPDATE_MEMBERSHIP",
        seasonId: id,
        userId: member.id,
        expectedUpdatedAt: detail!.memberships[0]!.updatedAt,
        migrationStatus: "READY",
      });
      await mutateSeasonAdministration({
        action: "CHANGE_SEASON_PHASE",
        seasonId: id,
        expectedUpdatedAt: (await seasonRow(transaction, id)).updatedAt.toISOString(),
        direction: "NEXT",
      });
      const candidate = await mutateSeasonAdministration({
        action: "ADD_PRESET_CANDIDATE",
        seasonId: id,
        scenarioKey: "MANIBUS",
        label: "Preserved destination",
      });
      await mutateSeasonAdministration({
        action: "ADD_PRESET_CANDIDATE",
        seasonId: id,
        scenarioKey: "WINTER",
        label: "Second preserved destination",
      });
      await saveEnvironment(transaction, id, input, {
        voteClosesAt: "2030-01-01T00:00:00.000Z",
      });
      await transaction
        .insert(seasonVotes)
        .values({ seasonId: id, userId: member.id, candidateId: candidate.id });
      const before = await snapshot(transaction);
      const oldSeason = await seasonRow(transaction, id);
      await saveEnvironment(transaction, id, input, { trancePhenomenon: "GRAVITY_ABYSS" });
      const after = await snapshot(transaction);
      const saved = await seasonRow(transaction, id);
      expect(saved).toMatchObject({
        serverType: oldSeason.serverType,
        trancePhenomenon: "GRAVITY_ABYSS",
        currentPhaseOrder: oldSeason.currentPhaseOrder,
        migrationOpen: false,
        status: oldSeason.status,
      });
      expect(after.phases).toEqual(before.phases);
      expect(after.memberships).toEqual(before.memberships);
      expect(after.votes).toEqual(before.votes);
      expect(after.candidates).toEqual(before.candidates);
      expect(after.audits).toEqual(expect.arrayContaining(before.audits));
      const environmentAudits = after.audits.filter(
        (row) =>
          row.entityId === id &&
          row.action === "season.environment.changed" &&
          !before.audits.some((previous) => previous.id === row.id),
      );
      expect(environmentAudits).toHaveLength(1);
      const recorded = JSON.stringify(environmentAudits[0]!.metadata);
      expect(recorded).toContain("LUNAR_REVELRY");
      expect(recorded).toContain("GRAVITY_ABYSS");
      expect(recorded).toContain("SEASONAL");
      const changedDetail = await getSeasonAdminDetail(id);
      expect(changedDetail?.environmentHistory).toHaveLength(2);
      expect(changedDetail?.environmentHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            previousServerType: null,
            previousTrancePhenomenon: null,
            serverType: "SEASONAL",
            trancePhenomenon: "LUNAR_REVELRY",
          }),
          expect.objectContaining({
            previousServerType: "SEASONAL",
            previousTrancePhenomenon: "LUNAR_REVELRY",
            serverType: "SEASONAL",
            trancePhenomenon: "GRAVITY_ABYSS",
          }),
        ]),
      );
      expect((await getPublicSeasonDetail(id))?.season).toMatchObject({
        trancePhenomenon: "GRAVITY_ABYSS",
        currentPhaseOrder: 2,
        participantCount: 1,
      });
    });
  });

  it("keeps permanent migration closed initially and lets an administrator open and close it independently of phases", async () => {
    await withRollback(async (transaction, { admin, member }) => {
      const input = {
        ...draft,
        serverNumber: await unusedNumber(transaction, "ENDLESS_DREAM"),
        serverType: "PERMANENT",
        trancePhenomenon: "NONE",
      };
      const { id } = await mutateSeasonAdministration(input);
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: id,
        userIds: [member.id],
      });
      boundary.user = member;
      expect(await getPublicSeasonDetail(id)).toMatchObject({
        phases: [],
        finalPhase: false,
        mayUpdateMigration: false,
        season: { currentPhaseName: "휴식기", migrationOpen: false },
      });
      await expect(
        persistOperationalMutation(member, { action: "MIGRATION", seasonId: id, status: "READY" }),
      ).rejects.toMatchObject({ code: "PERMANENT_MIGRATION_NOT_OPEN" });
      boundary.user = admin;
      await saveEnvironment(transaction, id, input, { migrationOpen: true });
      boundary.user = member;
      expect(await getPublicSeasonDetail(id)).toMatchObject({
        phases: [],
        finalPhase: false,
        mayUpdateMigration: true,
        season: { currentPhaseName: "휴식기", migrationOpen: true },
      });
      await persistOperationalMutation(member, {
        action: "MIGRATION",
        seasonId: id,
        status: "READY",
      });
      const [membership] = await transaction
        .select()
        .from(seasonMemberships)
        .where(and(eq(seasonMemberships.seasonId, id), eq(seasonMemberships.userId, member.id)));
      boundary.user = admin;
      await saveEnvironment(transaction, id, input, { migrationOpen: false });
      expect((await getSeasonAdminDetail(id))?.environmentHistory).toHaveLength(1);
      boundary.user = member;
      expect(await getPublicSeasonDetail(id)).toMatchObject({
        finalPhase: false,
        mayUpdateMigration: false,
        ownMigrationStatus: "READY",
        season: { currentPhaseName: "휴식기", migrationOpen: false },
      });
      expect(
        await transaction
          .select()
          .from(seasonMemberships)
          .where(eq(seasonMemberships.id, membership!.id)),
      ).toEqual([membership]);
      await expect(
        persistOperationalMutation(member, {
          action: "MIGRATION",
          seasonId: id,
          status: "MIGRATED",
        }),
      ).rejects.toMatchObject({ code: "PERMANENT_MIGRATION_NOT_OPEN" });
      expect(await seasonRow(transaction, id)).toMatchObject({
        serverType: "PERMANENT",
        trancePhenomenon: "NONE",
        status: "PLANNED",
        settlementAt: null,
      });
    });
  });

  it("rejects permanent phase changes, settlement dates and non-admin migration opening atomically", async () => {
    await withRollback(async (transaction, { officer }) => {
      const input = {
        ...draft,
        serverNumber: await unusedNumber(transaction, "ENDLESS_DREAM"),
        serverType: "PERMANENT",
      };
      const { id } = await mutateSeasonAdministration(input);
      const before = await snapshot(transaction);
      for (const direction of ["NEXT", "PREVIOUS"] as const) {
        await expect(
          mutateSeasonAdministration({
            action: "CHANGE_SEASON_PHASE",
            seasonId: id,
            expectedUpdatedAt: (await seasonRow(transaction, id)).updatedAt.toISOString(),
            direction,
          }),
        ).rejects.toMatchObject({ code: "PERMANENT_PHASES" });
      }
      await expect(
        saveEnvironment(transaction, id, input, { settlementAt: "2026-11-01T00:00:00.000Z" }),
      ).rejects.toBeDefined();
      boundary.user = officer;
      await expect(
        saveEnvironment(transaction, id, input, { migrationOpen: true }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await snapshot(transaction)).toEqual(before);
    });
  });

  it("preserves unclassified legacy environments and their gravity setting until the phenomenon is explicitly confirmed", async () => {
    await withRollback(async (transaction) => {
      const input = { ...draft, serverNumber: await unusedNumber(transaction, "ENDLESS_DREAM") };
      const { id } = await mutateSeasonAdministration(input);
      await transaction
        .update(seasons)
        .set({ serverType: "UNKNOWN", trancePhenomenon: "UNKNOWN", gravityContentEnabled: true })
        .where(eq(seasons.id, id));
      const legacy = await seasonRow(transaction, id);
      await mutateSeasonAdministration({
        action: "SAVE_SEASON_SETUP",
        id,
        expectedUpdatedAt: legacy.updatedAt.toISOString(),
        scenarioKey: input.scenarioKey,
        serverNumber: input.serverNumber,
        region: input.region,
        name: "Confirmed legacy name",
        startsAt: input.startsAt,
        settlementAt: null,
        status: "PLANNED",
        voteClosesAt: null,
      });
      const unclassified = await seasonRow(transaction, id);
      expect(unclassified).toMatchObject({
        serverType: "UNKNOWN",
        trancePhenomenon: "UNKNOWN",
        gravityContentEnabled: true,
        migrationOpen: false,
      });
      expect(
        hasGravityContent(unclassified.trancePhenomenon, unclassified.gravityContentEnabled),
      ).toBe(true);
      const phases = await transaction
        .select()
        .from(seasonPhases)
        .where(eq(seasonPhases.seasonId, id));
      await saveEnvironment(transaction, id, input, {
        serverType: "SEASONAL",
        trancePhenomenon: "NONE",
      });
      const classified = await seasonRow(transaction, id);
      expect(classified).toMatchObject({ serverType: "SEASONAL", trancePhenomenon: "NONE" });
      expect(hasGravityContent(classified.trancePhenomenon, classified.gravityContentEnabled)).toBe(
        false,
      );
      expect(
        await transaction.select().from(seasonPhases).where(eq(seasonPhases.seasonId, id)),
      ).toEqual(phases);
    });
  });

  it("blocks new condenser responses after a theme change while keeping existing members able to withdraw", async () => {
    await withRollback(async (transaction, { admin, member }) => {
      const input = {
        ...draft,
        serverNumber: await unusedNumber(transaction, "ENDLESS_DREAM"),
        trancePhenomenon: "GRAVITY_ABYSS",
      };
      const { id } = await mutateSeasonAdministration(input);
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: id,
        userIds: [member.id],
      });
      const [party] = await transaction
        .insert(operations)
        .values({
          seasonId: id,
          title: "Condenser environment verification",
          type: "RAID",
          contentKey: "gravity-condenser",
          startsAt: new Date(Date.now() + 120_000),
          capacity: 2,
          createdById: admin.id,
        })
        .returning();
      boundary.user = member;
      await persistOperationalMutation(member, {
        action: "RSVP",
        operationId: party!.id,
        status: "GOING",
      });
      expect(await getOperationDirectoryDetail(party!.id)).toMatchObject({
        mode: "LIVE",
        data: { mayRespond: true, mayGo: true, mayMaybe: true },
      });
      boundary.user = admin;
      await saveEnvironment(transaction, id, input, { trancePhenomenon: "LUNAR_REVELRY" });
      const [prior] = await transaction
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.operationId, party!.id));
      expect(prior?.status).toBe("GOING");
      boundary.user = member;
      expect(await getOperationDirectoryDetail(party!.id)).toMatchObject({
        mode: "LIVE",
        data: { mayRespond: true, mayGo: false, mayMaybe: false, canCancelParticipation: true },
      });
      expect(await getOperationalPageData(member, "AUTHENTICATED")).toMatchObject({
        mode: "LIVE",
        data: { nextOperation: { id: party!.id, mayRespond: true, mayGo: false, mayMaybe: false } },
      });
      for (const status of ["GOING", "MAYBE"] as const)
        await expect(
          persistOperationalMutation(member, { action: "RSVP", operationId: party!.id, status }),
        ).rejects.toMatchObject({ code: "CONTENT_UNAVAILABLE" });
      expect(
        await transaction
          .select()
          .from(operationParticipants)
          .where(eq(operationParticipants.id, prior!.id)),
      ).toEqual([prior]);
      await persistOperationalMutation(member, {
        action: "RSVP",
        operationId: party!.id,
        status: "UNAVAILABLE",
      });
      expect(
        await transaction
          .select()
          .from(operationParticipants)
          .where(eq(operationParticipants.id, prior!.id)),
      ).toEqual([
        expect.objectContaining({ id: prior!.id, userId: member.id, status: "UNAVAILABLE" }),
      ]);
    });
  });
});
