import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, CurrentUser } from "../src/lib/auth-policy";

// Substitute the external identity boundary only. Administration and member repositories use SQL.
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  status: "GUEST" as AuthStatus,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentUser: async () => auth.user,
  getCurrentAuthState: async () => ({ user: auth.user, status: auth.status }),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getLiveGuildEligibility: async () => "MEMBER",
}));

import {
  accounts,
  and,
  auditLogs,
  eq,
  getDb,
  memberProfiles,
  operationParticipants,
  operationRoles,
  operations,
  scenarios,
  seasonMemberships,
  seasonPhases,
  seasons,
  seasonVoteCandidates,
  seasonVotes,
  servers,
  sql,
  users,
} from "@uniz/db";
import {
  getSeasonAdminData,
  getSeasonAdminDetail,
  mutateSeasonAdministration,
} from "../src/lib/server/season-administration";
import {
  getOperationAdminData,
  getOperationAdminDetail,
  mutateOperationAdministration,
} from "../src/lib/server/operation-administration";
import {
  getOperationalPageData,
  persistOperationalMutation,
} from "../src/lib/server/operational-repository";
import {
  getOperationDirectory,
  getOperationDirectoryDetail,
} from "../src/lib/server/operation-directory";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Administration verification requires the local uniz_hive database.");
}

const privateUid = "private-cms-verification-uid";
const privateAccessToken = "private-cms-verification-access-token";
const privateRefreshToken = "private-cms-verification-refresh-token";
let actors: { admin: CurrentUser; officer: CurrentUser; member: CurrentUser; other: CurrentUser };
let tracked: {
  seasons: Set<string>;
  operations: Set<string>;
  scenarios: Set<string>;
  servers: Set<string>;
};
let fixtureInstalled = false;
let now: number;
const iso = (offset: number) => new Date(now + offset).toISOString();
const hour = 3_600_000;

beforeEach(async () => {
  now = Date.now();
  tracked = {
    seasons: new Set(),
    operations: new Set(),
    scenarios: new Set(),
    servers: new Set(),
  };
  actors = {
    admin: { id: randomUUID(), name: "CMS Verification Admin", role: "ADMIN", isMock: false },
    officer: { id: randomUUID(), name: "CMS Verification Officer", role: "OFFICER", isMock: false },
    member: { id: randomUUID(), name: "CMS Verification Member", role: "MEMBER", isMock: false },
    other: { id: randomUUID(), name: "CMS Verification Other", role: "MEMBER", isMock: false },
  };
  auth.user = actors.admin;
  auth.status = "AUTHENTICATED";
  await getDb().transaction(async (tx) => {
    const principals = Object.values(actors);
    await tx.insert(users).values(principals.map(({ id, name, role }) => ({ id, name, role })));
    for (const actor of principals) {
      await tx.insert(accounts).values({
        userId: actor.id,
        provider: "discord",
        providerAccountId: `cms-verification-${actor.id}`,
        access_token: privateAccessToken,
        refresh_token: privateRefreshToken,
      });
      await tx.insert(memberProfiles).values({
        userId: actor.id,
        handle: `v-${actor.id.replaceAll("-", "").slice(0, 20)}`,
        displayName: actor.name,
        onceHumanNickname: "Verification Character",
        onceHumanUid: privateUid,
      });
    }
  });
  fixtureInstalled = true;
});

afterEach(async () => {
  auth.user = null;
  auth.status = "GUEST";
  if (!fixtureInstalled) return;
  await getDb().transaction(async (tx) => {
    const ownedActorIds = Object.values(actors).map((actor) => actor.id);
    // Every predicate uses identifiers created by this test. Actual guild data is never changed.
    for (const actorId of ownedActorIds) {
      await tx.delete(auditLogs).where(eq(auditLogs.actorId, actorId));
    }
    for (const operationId of tracked.operations) {
      await tx
        .delete(operationParticipants)
        .where(eq(operationParticipants.operationId, operationId));
      await tx.delete(operationRoles).where(eq(operationRoles.operationId, operationId));
      await tx.delete(operations).where(eq(operations.id, operationId));
    }
    for (const seasonId of tracked.seasons) {
      await tx.delete(seasonVotes).where(eq(seasonVotes.seasonId, seasonId));
      await tx.delete(seasonVoteCandidates).where(eq(seasonVoteCandidates.seasonId, seasonId));
      await tx.delete(seasonMemberships).where(eq(seasonMemberships.seasonId, seasonId));
      await tx.delete(seasonPhases).where(eq(seasonPhases.seasonId, seasonId));
      await tx.delete(seasons).where(eq(seasons.id, seasonId));
    }
    for (const serverId of tracked.servers)
      await tx.delete(servers).where(eq(servers.id, serverId));
    for (const scenarioId of tracked.scenarios)
      await tx.delete(scenarios).where(eq(scenarios.id, scenarioId));
    for (const actorId of ownedActorIds) await tx.delete(users).where(eq(users.id, actorId));
  });
  fixtureInstalled = false;
});

async function createScenario() {
  const result = await mutateSeasonAdministration({
    action: "CREATE_SCENARIO",
    slug: `cms-${randomUUID()}`,
    name: "CMS Verification Scenario",
    description: "Synthetic administration verification record",
  });
  tracked.scenarios.add(result.id);
  return result.id;
}

async function createCatalog() {
  const scenarioId = await createScenario();
  const result = await mutateSeasonAdministration({
    action: "CREATE_SERVER",
    scenarioId,
    name: `CMS Verification Server ${randomUUID()}`,
    region: "TEST",
  });
  tracked.servers.add(result.id);
  return { scenarioId, serverId: result.id };
}

async function createSeason(catalog?: { scenarioId: string; serverId: string }) {
  const target = catalog ?? (await createCatalog());
  const result = await mutateSeasonAdministration({
    action: "SAVE_SEASON",
    seasonNumber: 900_000 + Math.floor(Math.random() * 99_999),
    name: "CMS Verification Season",
    ...target,
    status: "PLANNED",
    startsAt: iso(-2 * hour),
    settlementAt: iso(24 * hour),
    voteClosesAt: null,
  });
  tracked.seasons.add(result.id);
  return result.id;
}

async function detail(seasonId: string) {
  const result = await getSeasonAdminDetail(seasonId);
  if (!result) throw new Error("Synthetic season detail was not found.");
  return result;
}

async function editSeason(seasonId: string, updates: Record<string, unknown> = {}) {
  const { season } = await detail(seasonId);
  return mutateSeasonAdministration({
    action: "SAVE_SEASON",
    id: season.id,
    expectedUpdatedAt: season.updatedAt,
    seasonNumber: season.seasonNumber,
    name: season.name,
    scenarioId: season.scenarioId,
    serverId: season.serverId,
    status: season.status,
    startsAt: season.startsAt,
    settlementAt: season.settlementAt,
    voteClosesAt: season.voteClosesAt,
    ...updates,
  });
}

async function createPhase(seasonId: string) {
  return mutateSeasonAdministration({
    action: "SAVE_PHASE",
    seasonId,
    name: "CMS Verification Phase",
    order: 1,
    startsAt: iso(-2 * hour),
    endsAt: iso(24 * hour),
  });
}

async function createOperation(seasonId: string | null = null, capacity = 2) {
  const result = await mutateOperationAdministration({
    action: "SAVE_OPERATION",
    seasonId,
    title: "CMS Verification Operation",
    type: "PRIME_WAR",
    description: "Synthetic operation verification record",
    startsAt: iso(2 * hour),
    endsAt: iso(3 * hour),
    capacity,
    status: "SCHEDULED",
  });
  tracked.operations.add(result.id);
  return result.id;
}

async function operationEditInput(operationId: string, updates: Record<string, unknown> = {}) {
  const [operation] = await getDb().select().from(operations).where(eq(operations.id, operationId));
  if (!operation) throw new Error("Synthetic operation was not found.");
  return {
    action: "SAVE_OPERATION",
    id: operation.id,
    expectedUpdatedAt: operation.updatedAt.toISOString(),
    seasonId: operation.seasonId,
    title: operation.title,
    type: operation.type,
    description: operation.description,
    startsAt: operation.startsAt.toISOString(),
    endsAt: operation.endsAt?.toISOString() ?? null,
    capacity: operation.capacity,
    status: operation.status,
    ...updates,
  };
}

describe("Season and operation administration against local PostgreSQL", () => {
  it("round-trips catalog, season configuration, live participation and archived history", async (context) => {
    const existingCurrent = await getDb()
      .select({ id: seasons.id })
      .from(seasons)
      .where(sql`${seasons.status} in ('ACTIVE', 'SETTLEMENT')`)
      .limit(1);
    // Avoid claiming the guild's current season if a real administrator has already registered it.
    if (existingCurrent.length) return context.skip();
    const seasonId = await createSeason();
    await createPhase(seasonId);
    const scenario2 = await createScenario();
    const first = await mutateSeasonAdministration({
      action: "ADD_CANDIDATE",
      seasonId,
      scenarioId: (await detail(seasonId)).season.scenarioId,
      label: "First destination",
    });
    await mutateSeasonAdministration({
      action: "ADD_CANDIDATE",
      seasonId,
      scenarioId: scenario2,
      label: "Second destination",
    });
    await mutateSeasonAdministration({
      action: "ENROL_MEMBERS",
      seasonId,
      userIds: [actors.admin.id, actors.member.id, actors.other.id],
    });
    await editSeason(seasonId, { voteClosesAt: iso(4 * hour) });
    await editSeason(seasonId, { status: "ACTIVE" });

    const anotherSeasonId = await createSeason();
    await createPhase(anotherSeasonId);
    await expect(editSeason(anotherSeasonId, { status: "ACTIVE" })).rejects.toMatchObject({
      code: "ACTIVE_EXISTS",
    });
    const operationId = await createOperation(seasonId);
    await persistOperationalMutation(actors.member, {
      action: "VOTE",
      seasonId,
      candidateId: first.id,
    });
    await persistOperationalMutation(actors.member, {
      action: "MIGRATION",
      seasonId,
      status: "READY",
    });
    await persistOperationalMutation(actors.member, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    const live = await getOperationalPageData(actors.member);
    expect(live.mode).toBe("LIVE");
    if (live.mode !== "LIVE") throw new Error("Synthetic live participation could not be read.");
    expect(live.data.currentSeason?.id).toBe(seasonId);
    expect(live.data.currentSeason?.myMembership).toBe(true);
    expect(
      live.data.vote?.candidates.find((candidate) => candidate.id === first.id)?.selected,
    ).toBe(true);
    expect(live.data.migration.myStatus).toBe("READY");
    const next = await getDb()
      .select()
      .from(operationParticipants)
      .where(eq(operationParticipants.operationId, operationId));
    expect(next).toHaveLength(1);
    const third = await createScenario();
    await expect(
      mutateSeasonAdministration({
        action: "ADD_CANDIDATE",
        seasonId,
        scenarioId: third,
        label: "Too late",
      }),
    ).rejects.toThrow();

    // Operators resolve scheduled operations before closing the season; rows remain as history.
    await expect(editSeason(seasonId, { status: "SETTLEMENT" })).rejects.toMatchObject({
      code: "OPERATIONS_OPEN",
    });
    await mutateOperationAdministration(
      await operationEditInput(operationId, { status: "CANCELLED" }),
    );
    await editSeason(seasonId, { status: "SETTLEMENT" });
    await editSeason(seasonId, { status: "ARCHIVED" });
    await expect(editSeason(seasonId, { name: "Attempted history rewrite" })).rejects.toMatchObject(
      { code: "ARCHIVED" },
    );
    const archivedMemberships = await getDb()
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, seasonId));
    await expect(
      mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId,
        userIds: [actors.officer.id],
      }),
    ).resolves.toEqual({ id: seasonId });
    const adjustedMemberships = await getDb()
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, seasonId));
    expect(adjustedMemberships).toHaveLength(archivedMemberships.length + 1);
    expect(adjustedMemberships).toEqual(expect.arrayContaining(archivedMemberships));
    expect(
      adjustedMemberships.find((membership) => membership.userId === actors.officer.id),
    ).toMatchObject({ removedAt: null, migrationStatus: "UNDECIDED" });
    expect((await detail(seasonId)).season.status).toBe("ARCHIVED");
    await expect(
      persistOperationalMutation(actors.member, {
        action: "VOTE",
        seasonId,
        candidateId: first.id,
      }),
    ).rejects.toThrow();
    const history = await getOperationalPageData(actors.member);
    expect(history.mode).toBe("LIVE");
    if (history.mode !== "LIVE") throw new Error("Synthetic season history could not be read.");
    expect(history.data.history.find((season) => season.id === seasonId)?.status).toBe("ARCHIVED");
    expect(
      await getDb().select().from(seasonVotes).where(eq(seasonVotes.seasonId, seasonId)),
    ).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(operationParticipants)
        .where(eq(operationParticipants.operationId, operationId)),
    ).toHaveLength(1);
    const audits = await getDb()
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(sql`${auditLogs.actorId} in (${actors.admin.id}, ${actors.member.id})`);
    expect(audits.length).toBeGreaterThan(5);
    const serialized = JSON.stringify({
      live,
      history,
      catalog: await getSeasonAdminData(),
      audits,
    });
    for (const secret of [privateUid, privateAccessToken, privateRefreshToken])
      expect(serialized).not.toContain(secret);
  });

  it("rejects overlapping phases and detects stale season and phase editors", async () => {
    const seasonId = await createSeason();
    const first = await mutateSeasonAdministration({
      action: "SAVE_PHASE",
      seasonId,
      name: "First phase",
      order: 1,
      startsAt: iso(-2 * hour),
      endsAt: iso(12 * hour),
    });
    await expect(
      mutateSeasonAdministration({
        action: "SAVE_PHASE",
        seasonId,
        name: "Overlapping phase",
        order: 2,
        startsAt: iso(10 * hour),
        endsAt: iso(20 * hour),
      }),
    ).rejects.toThrow();
    const snapshot = await detail(seasonId);
    expect(snapshot.phases).toHaveLength(1);
    const phase = snapshot.phases.find((entry) => entry.id === first.id)!;
    const phaseInput = {
      action: "SAVE_PHASE",
      id: phase.id,
      seasonId,
      expectedUpdatedAt: phase.updatedAt,
      name: "Renamed phase",
      order: phase.order,
      startsAt: phase.startsAt,
      endsAt: phase.endsAt,
    };
    await mutateSeasonAdministration(phaseInput);
    await expect(
      mutateSeasonAdministration({ ...phaseInput, name: "Stale phase overwrite" }),
    ).rejects.toThrow();
    const fresh = await detail(seasonId);
    const seasonInput = {
      action: "SAVE_SEASON",
      id: seasonId,
      expectedUpdatedAt: fresh.season.updatedAt,
      seasonNumber: fresh.season.seasonNumber,
      name: "Renamed season",
      scenarioId: fresh.season.scenarioId,
      serverId: fresh.season.serverId,
      status: fresh.season.status,
      startsAt: fresh.season.startsAt,
      settlementAt: fresh.season.settlementAt,
      voteClosesAt: fresh.season.voteClosesAt,
    };
    await mutateSeasonAdministration(seasonInput);
    await expect(
      mutateSeasonAdministration({ ...seasonInput, name: "Stale season overwrite" }),
    ).rejects.toThrow();
    expect((await detail(seasonId)).season.name).toBe("Renamed season");
  });

  it("preserves enrolled member state and rejects identity changes after enrolment", async () => {
    const seasonId = await createSeason();
    await mutateSeasonAdministration({
      action: "ENROL_MEMBERS",
      seasonId,
      userIds: [actors.member.id],
    });
    await getDb()
      .update(seasonMemberships)
      .set({ migrationStatus: "READY" })
      .where(
        and(
          eq(seasonMemberships.seasonId, seasonId),
          eq(seasonMemberships.userId, actors.member.id),
        ),
      );
    await mutateSeasonAdministration({
      action: "ENROL_MEMBERS",
      seasonId,
      userIds: [actors.member.id, actors.other.id],
    });
    const memberships = await getDb()
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, seasonId));
    expect(memberships).toHaveLength(2);
    expect(memberships.find((entry) => entry.userId === actors.member.id)?.migrationStatus).toBe(
      "READY",
    );
    const previous = (await detail(seasonId)).season;
    await expect(
      editSeason(seasonId, { seasonNumber: previous.seasonNumber + 1 }),
    ).rejects.toThrow();
    const another = await createCatalog();
    await expect(editSeason(seasonId, another)).rejects.toThrow();
    expect((await detail(seasonId)).season.scenarioId).toBe(previous.scenarioId);
  });

  it("denies members, mocks, stale officer roles, missing Discord accounts and injected actor fields", async () => {
    auth.user = actors.member;
    await expect(createScenario()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createOperation()).rejects.toThrow();
    await expect(getSeasonAdminData()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getOperationAdminData()).rejects.toThrow();
    auth.user = { ...actors.admin, isMock: true };
    await expect(createScenario()).rejects.toMatchObject({ code: "MOCK_ACTOR" });
    await expect(createOperation()).rejects.toThrow();
    await expect(getSeasonAdminData()).rejects.toMatchObject({ code: "MOCK_ACTOR" });
    await expect(getOperationAdminData()).rejects.toThrow();
    auth.user = actors.officer;
    await createScenario();
    await createOperation();
    const previousOfficerAudits = await getDb()
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorId, actors.officer.id));
    expect(previousOfficerAudits).toHaveLength(2);
    await getDb().update(users).set({ role: "MEMBER" }).where(eq(users.id, actors.officer.id));
    await expect(createScenario()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createOperation()).rejects.toThrow();
    await expect(getSeasonAdminData()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getOperationAdminData()).rejects.toThrow();
    auth.user = actors.admin;
    await expect(
      mutateSeasonAdministration({
        action: "CREATE_SCENARIO",
        slug: `cms-${randomUUID()}`,
        name: "Injected actor",
        actorId: actors.admin.id,
      }),
    ).rejects.toThrow();
    await getDb().delete(accounts).where(eq(accounts.userId, actors.admin.id));
    await expect(createScenario()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createOperation()).rejects.toThrow();
    await expect(getSeasonAdminData()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getOperationAdminData()).rejects.toThrow();
    expect(
      await getDb().select().from(auditLogs).where(eq(auditLogs.actorId, actors.officer.id)),
    ).toHaveLength(previousOfficerAudits.length);
  });

  it("rejects mismatched catalog identities and an unconfigured activation", async () => {
    const first = await createCatalog();
    const second = await createCatalog();
    await expect(
      createSeason({ scenarioId: first.scenarioId, serverId: second.serverId }),
    ).rejects.toMatchObject({ code: "SERVER_MISMATCH" });
    const seasonId = await createSeason(first);
    await expect(editSeason(seasonId, { status: "ACTIVE" })).rejects.toThrow();
    await expect(editSeason(seasonId, { voteClosesAt: iso(4 * hour) })).rejects.toThrow();
    expect((await detail(seasonId)).season.status).toBe("PLANNED");
  });

  it("enforces optimistic operation edits and preserves terminal participation history", async () => {
    const operationId = await createOperation();
    const edit = await operationEditInput(operationId, { title: "Edited operation" });
    await mutateOperationAdministration(edit);
    await expect(
      mutateOperationAdministration({ ...edit, title: "Stale overwrite" }),
    ).rejects.toThrow();
    await persistOperationalMutation(actors.member, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    const seasonId = await createSeason();
    await expect(
      mutateOperationAdministration(await operationEditInput(operationId, { seasonId })),
    ).rejects.toThrow();
    await expect(
      mutateOperationAdministration(await operationEditInput(operationId, { status: "COMPLETED" })),
    ).rejects.toThrow();
    await mutateOperationAdministration(
      await operationEditInput(operationId, { status: "CANCELLED" }),
    );
    await expect(
      mutateOperationAdministration(await operationEditInput(operationId, { status: "SCHEDULED" })),
    ).rejects.toThrow();
    await expect(
      persistOperationalMutation(actors.member, { action: "RSVP", operationId, status: "MAYBE" }),
    ).rejects.toThrow();
    const participants = await getDb()
      .select()
      .from(operationParticipants)
      .where(eq(operationParticipants.operationId, operationId));
    expect(participants).toHaveLength(1);
    expect(participants[0]?.status).toBe("GOING");
    const operation = await getOperationAdminDetail(operationId);
    expect(operation?.status).toBe("CANCELLED");
    expect(operation?.attendees[0]?.userId).toBe(actors.member.id);
    expect(
      (await getOperationAdminData()).operations.find((entry) => entry.id === operationId)
        ?.goingCount,
    ).toBe(1);
    for (const secret of [privateUid, privateAccessToken, privateRefreshToken])
      expect(JSON.stringify(operation)).not.toContain(secret);
  });

  it("counts retained participants when rejecting a capacity shrink", async () => {
    const operationId = await createOperation(null, 2);
    await persistOperationalMutation(actors.member, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    await persistOperationalMutation(actors.other, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    await getDb().update(users).set({ role: "GUEST" }).where(eq(users.id, actors.other.id));
    await expect(
      mutateOperationAdministration(await operationEditInput(operationId, { capacity: 1 })),
    ).rejects.toThrow();
    const [operation] = await getDb()
      .select()
      .from(operations)
      .where(eq(operations.id, operationId));
    expect(operation?.capacity).toBe(2);
  });

  it("serializes concurrent capacity edits and RSVPs without exceeding the saved capacity", async () => {
    const operationId = await createOperation(null, 2);
    await persistOperationalMutation(actors.member, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    const shrink = await operationEditInput(operationId, { capacity: 1 });
    const results = await Promise.allSettled([
      mutateOperationAdministration(shrink),
      persistOperationalMutation(actors.other, { action: "RSVP", operationId, status: "GOING" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [operation] = await getDb()
      .select()
      .from(operations)
      .where(eq(operations.id, operationId));
    const going = await getDb()
      .select()
      .from(operationParticipants)
      .where(
        and(
          eq(operationParticipants.operationId, operationId),
          eq(operationParticipants.status, "GOING"),
        ),
      );
    expect(going.length).toBeLessThanOrEqual(operation!.capacity);
  });

  it("serves a private-data-free member operation directory and preserves blocked authorization modes", async () => {
    const operationId = await createOperation(null, 2);
    await persistOperationalMutation(actors.member, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    await persistOperationalMutation(actors.other, {
      action: "RSVP",
      operationId,
      status: "GOING",
    });
    await getDb().update(users).set({ role: "GUEST" }).where(eq(users.id, actors.other.id));
    auth.user = actors.member;
    const directory = await getOperationDirectory();
    const result = await getOperationDirectoryDetail(operationId);
    expect(directory.mode).toBe("LIVE");
    expect(result.mode).toBe("LIVE");
    if (directory.mode !== "LIVE" || result.mode !== "LIVE" || !result.data) {
      throw new Error("Synthetic member operation detail could not be read.");
    }
    expect(directory.data.canManage).toBe(false);
    expect(directory.data.operations.find((entry) => entry.id === operationId)?.myRsvp).toBe(
      "GOING",
    );
    expect(result.data.goingCount).toBe(2);
    expect(result.data.attendees).toHaveLength(1);
    expect(result.data.attendees[0]?.displayName).toBe(actors.member.name);
    expect(result.data.canManage).toBe(false);
    for (const secret of [privateUid, privateAccessToken, privateRefreshToken]) {
      expect(JSON.stringify({ directory, result })).not.toContain(secret);
    }
    auth.user = null;
    for (const [status, mode] of [
      ["UNAVAILABLE", "ERROR"],
      ["REAUTH_REQUIRED", "REAUTH"],
      ["LEFT", "LEFT"],
    ] as const) {
      auth.status = status;
      expect((await getOperationDirectory()).mode).toBe(mode);
      expect((await getOperationDirectoryDetail(operationId)).mode).toBe(mode);
    }
    auth.status = "GUEST";
    expect((await getOperationDirectory()).mode).toBe("DEMO");
    auth.user = { ...actors.member, isMock: true };
    auth.status = "AUTHENTICATED";
    expect((await getOperationDirectory()).mode).toBe("DEMO");
    auth.user = actors.member;
    await getDb().delete(accounts).where(eq(accounts.userId, actors.member.id));
    expect((await getOperationDirectory()).mode).toBe("REAUTH");
    await getDb().update(users).set({ role: "GUEST" }).where(eq(users.id, actors.member.id));
    expect((await getOperationDirectory()).mode).toBe("PENDING");
  });
});
