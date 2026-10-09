import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

// Only the external identity/Guild API boundary is substituted. Repositories use real PostgreSQL.
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ user: null as CurrentUser | null, eligible: "MEMBER" }));
vi.mock("../src/lib/auth", () => ({
  getCurrentUser: async () => auth.user,
  getCurrentAuthState: async () => ({
    user: auth.user,
    status: auth.user ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getLiveGuildEligibility: async () => auth.eligible,
}));

import {
  accounts,
  auditLogs,
  eq,
  getDb,
  memberProfiles,
  operationParticipants,
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
  changeMemberRole,
  getMemberDirectory,
  saveMemberProfile,
} from "../src/lib/server/member-management";
import {
  getOperationalPageData,
  persistOperationalMutation,
} from "../src/lib/server/operational-repository";
import { mutateSeasonAdministration } from "../src/lib/server/season-administration";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Operational verification requires the local uniz_hive database.");
}

let ids: {
  admin: string;
  member: string;
  other: string;
  applicant: string;
  season: string;
  server: string;
  scenario: string;
  scenario2: string;
  candidate1: string;
  candidate2: string;
  operation: string;
};
let actors: { admin: CurrentUser; member: CurrentUser; other: CurrentUser };
let fixtureInstalled = false;
const uid = "private-integration-fixture-uid";

beforeEach(async () => {
  ids = {
    admin: randomUUID(),
    member: randomUUID(),
    other: randomUUID(),
    applicant: randomUUID(),
    season: randomUUID(),
    server: randomUUID(),
    scenario: randomUUID(),
    scenario2: randomUUID(),
    candidate1: randomUUID(),
    candidate2: randomUUID(),
    operation: randomUUID(),
  };
  actors = {
    admin: { id: ids.admin, name: "Verification Admin", role: "ADMIN", isMock: false },
    member: { id: ids.member, name: "Verification Member", role: "MEMBER", isMock: false },
    other: { id: ids.other, name: "Verification Other", role: "MEMBER", isMock: false },
  };
  auth.user = actors.admin;
  auth.eligible = "MEMBER";
  const now = Date.now();
  await getDb().transaction(async (tx) => {
    await tx.insert(users).values([
      { id: ids.admin, name: actors.admin.name, role: "ADMIN" },
      { id: ids.member, name: actors.member.name, role: "MEMBER" },
      { id: ids.other, name: actors.other.name, role: "MEMBER" },
      { id: ids.applicant, name: "Verification Applicant", role: "APPLICANT" },
    ]);
    const userIds = [ids.admin, ids.member, ids.other, ids.applicant];
    for (const userId of userIds) {
      await tx
        .insert(accounts)
        .values({ userId, provider: "discord", providerAccountId: `verification-${userId}` });
      await tx.insert(memberProfiles).values({
        userId,
        handle: `v-${userId.replaceAll("-", "").slice(0, 20)}`,
        displayName: "Verification Profile",
        onceHumanNickname: "Verification Character",
        onceHumanUid: uid,
      });
    }
    await tx.insert(scenarios).values([
      { id: ids.scenario, slug: `verify-${ids.scenario}`, name: "Verification scenario" },
      { id: ids.scenario2, slug: `verify-${ids.scenario2}`, name: "Verification alternative" },
    ]);
    await tx.insert(servers).values({
      id: ids.server,
      scenarioId: ids.scenario,
      name: "Verification server",
      region: "TEST",
    });
    // Random large season numbers avoid changing existing operational seasons.
    await tx.insert(seasons).values({
      id: ids.season,
      seasonNumber: 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000),
      scenarioId: ids.scenario,
      serverId: ids.server,
      name: "Verification season",
      status: "ACTIVE",
      startsAt: new Date(now - 86_400_000),
      settlementAt: new Date(now + 86_400_000),
      voteClosesAt: new Date(now + 3_600_000),
    });
    await tx.insert(seasonPhases).values({
      seasonId: ids.season,
      name: "Verification phase",
      order: 1,
      startsAt: new Date(now - 86_400_000),
      endsAt: new Date(now + 86_400_000),
    });
    await tx
      .insert(seasonMemberships)
      .values(userIds.slice(0, 3).map((userId) => ({ seasonId: ids.season, userId })));
    await tx.insert(seasonVoteCandidates).values([
      {
        id: ids.candidate1,
        seasonId: ids.season,
        scenarioId: ids.scenario,
        label: "Candidate one",
      },
      {
        id: ids.candidate2,
        seasonId: ids.season,
        scenarioId: ids.scenario2,
        label: "Candidate two",
      },
    ]);
    await tx.insert(operations).values({
      id: ids.operation,
      seasonId: ids.season,
      title: "Verification operation",
      type: "PRIME_WAR",
      startsAt: new Date(now + 7_200_000),
      capacity: 1,
      createdById: ids.admin,
    });
  });
  fixtureInstalled = true;
});

afterEach(async () => {
  auth.user = null;
  if (!fixtureInstalled) return;
  await getDb().transaction(async (tx) => {
    // Delete only identifiers created by this test, in foreign-key order.
    await tx
      .delete(auditLogs)
      .where(
        sql`${auditLogs.actorId} in (${ids.admin}, ${ids.member}, ${ids.other}, ${ids.applicant})`,
      );
    await tx
      .delete(operationParticipants)
      .where(eq(operationParticipants.operationId, ids.operation));
    await tx.delete(operations).where(eq(operations.id, ids.operation));
    await tx.delete(seasonVotes).where(eq(seasonVotes.seasonId, ids.season));
    await tx.delete(seasonVoteCandidates).where(eq(seasonVoteCandidates.seasonId, ids.season));
    await tx.delete(seasonMemberships).where(eq(seasonMemberships.seasonId, ids.season));
    await tx.delete(seasonPhases).where(eq(seasonPhases.seasonId, ids.season));
    await tx.delete(seasons).where(eq(seasons.id, ids.season));
    await tx.delete(servers).where(eq(servers.id, ids.server));
    await tx.delete(scenarios).where(sql`${scenarios.id} in (${ids.scenario}, ${ids.scenario2})`);
    await tx
      .delete(users)
      .where(sql`${users.id} in (${ids.admin}, ${ids.member}, ${ids.other}, ${ids.applicant})`);
  });
  fixtureInstalled = false;
});

describe("Live repositories against local PostgreSQL", () => {
  it("advances migration versions monotonically and rejects a previously loaded administrator edit", async () => {
    const priorVersion = new Date(Date.now() + 60_000);
    await getDb()
      .update(seasonMemberships)
      .set({ updatedAt: priorVersion })
      .where(
        sql`${seasonMemberships.seasonId} = ${ids.season} and ${seasonMemberships.userId} = ${ids.member}`,
      );
    await persistOperationalMutation(actors.member, {
      action: "MIGRATION",
      seasonId: ids.season,
      status: "READY",
    });
    const [saved] = await getDb()
      .select()
      .from(seasonMemberships)
      .where(
        sql`${seasonMemberships.seasonId} = ${ids.season} and ${seasonMemberships.userId} = ${ids.member}`,
      );
    expect(saved!.updatedAt.getTime()).toBe(priorVersion.getTime() + 1);
    auth.user = actors.admin;
    await expect(
      mutateSeasonAdministration({
        action: "UPDATE_MEMBERSHIP",
        seasonId: ids.season,
        userId: ids.member,
        expectedUpdatedAt: priorVersion.toISOString(),
        migrationStatus: "JOINING",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [unchanged] = await getDb()
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.id, saved!.id));
    expect(unchanged!.migrationStatus).toBe("READY");
    expect(unchanged!.updatedAt).toEqual(saved!.updatedAt);
  });

  it("hides pending seasons and their operations and rejects operational writes before approval", async () => {
    await getDb()
      .update(seasons)
      .set({ approvalStatus: "PENDING" })
      .where(eq(seasons.id, ids.season));
    const page = await getOperationalPageData(actors.member);
    expect(page.mode).toBe("LIVE");
    if (page.mode !== "LIVE") throw new Error("Expected live approved-member data");
    expect(page.data.currentSeason?.id).not.toBe(ids.season);
    expect(page.data.history.some((season) => season.id === ids.season)).toBe(false);
    expect(page.data.nextOperation?.id).not.toBe(ids.operation);
    for (const input of [
      { action: "MIGRATION", seasonId: ids.season, status: "READY" },
      { action: "VOTE", seasonId: ids.season, candidateId: ids.candidate1 },
      { action: "RSVP", operationId: ids.operation, status: "GOING" },
    ] as const)
      await expect(persistOperationalMutation(actors.member, input)).rejects.toMatchObject({
        code: "SEASON_CLOSED",
      });
  });

  it("removes participant permissions and current totals while retaining an earlier ballot", async () => {
    await persistOperationalMutation(actors.member, {
      action: "VOTE",
      seasonId: ids.season,
      candidateId: ids.candidate1,
    });
    await getDb()
      .update(seasonMemberships)
      .set({ removedAt: new Date(), removedById: ids.admin })
      .where(
        sql`${seasonMemberships.seasonId} = ${ids.season} and ${seasonMemberships.userId} = ${ids.member}`,
      );
    for (const input of [
      { action: "MIGRATION", seasonId: ids.season, status: "READY" },
      { action: "VOTE", seasonId: ids.season, candidateId: ids.candidate2 },
      { action: "RSVP", operationId: ids.operation, status: "GOING" },
    ] as const)
      await expect(persistOperationalMutation(actors.member, input)).rejects.toMatchObject({
        code: "NOT_A_SEASON_MEMBER",
      });
    const page = await getOperationalPageData(actors.member);
    expect(page.mode).toBe("LIVE");
    if (page.mode !== "LIVE") throw new Error("Expected live approved-member data");
    expect(page.data.currentSeason?.id).toBe(ids.season);
    expect(page.data.currentSeason?.myMembership).toBe(false);
    expect(page.data.migration.total).toBe(2);
    expect(page.data.vote?.totalEligible).toBe(2);
    expect(page.data.vote?.totalVotes).toBe(0);
    const history = await getDb()
      .select()
      .from(seasonVotes)
      .where(eq(seasonVotes.seasonId, ids.season));
    expect(history).toHaveLength(1);
    expect(history[0]?.candidateId).toBe(ids.candidate1);
  });

  it("returns optional settlement without a fabricated date or countdown", async () => {
    await getDb().update(seasons).set({ settlementAt: null }).where(eq(seasons.id, ids.season));
    const page = await getOperationalPageData(actors.member);
    expect(page.mode).toBe("LIVE");
    if (page.mode !== "LIVE") throw new Error("Expected live approved-member data");
    expect(page.data.currentSeason?.id).toBe(ids.season);
    expect(page.data.currentSeason?.settlementAt).toBeNull();
    expect(page.data.currentSeason?.daysRemaining).toBeNull();
    await expect(
      persistOperationalMutation(actors.member, {
        action: "MIGRATION",
        seasonId: ids.season,
        status: "JOINING",
      }),
    ).resolves.toBeUndefined();
  });

  it("shows blocked live authorization states instead of falling back to demo records", async () => {
    expect((await getOperationalPageData(null, "UNAVAILABLE")).mode).toBe("ERROR");
    expect((await getOperationalPageData(null, "REAUTH_REQUIRED")).mode).toBe("REAUTH");
    expect((await getOperationalPageData(null, "LEFT")).mode).toBe("LEFT");
    expect((await getOperationalPageData(null, "GUEST")).mode).toBe("DEMO");
  });

  it("approves a complete applicant, audits the decision and never returns private UID", async () => {
    await changeMemberRole({ action: "approve", targetId: ids.applicant, reason: "VERIFIED" });
    const [applicant] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, ids.applicant));
    expect(applicant?.role).toBe("MEMBER");
    const audit = await getDb()
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, ids.applicant));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe("member.approve");
    expect(JSON.stringify(audit)).not.toContain(uid);
    const directory = await getMemberDirectory();
    expect(directory.mode).toBe("LIVE");
    expect(directory.members.some((member) => member.userId === ids.applicant)).toBe(true);
    expect(JSON.stringify(directory)).not.toContain(uid);
  });

  it("rejects mock writes, stale admin claims and unavailable target membership", async () => {
    auth.user = { ...actors.admin, isMock: true };
    await expect(
      changeMemberRole({ action: "approve", targetId: ids.applicant, reason: "VERIFIED" }),
    ).rejects.toThrow();
    auth.user = actors.admin;
    auth.eligible = "UNAVAILABLE";
    await expect(
      changeMemberRole({ action: "approve", targetId: ids.applicant, reason: "VERIFIED" }),
    ).rejects.toThrow();
    auth.eligible = "MEMBER";
    await getDb().update(users).set({ role: "MEMBER" }).where(eq(users.id, ids.admin));
    await expect(
      changeMemberRole({ action: "approve", targetId: ids.applicant, reason: "VERIFIED" }),
    ).rejects.toThrow();
    const [applicant] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, ids.applicant));
    expect(applicant?.role).toBe("APPLICANT");
  });

  it("serializes concurrent RSVPs so a one-person operation never exceeds capacity", async () => {
    const outcomes = await Promise.allSettled([
      persistOperationalMutation(actors.member, {
        action: "RSVP",
        operationId: ids.operation,
        status: "GOING",
      }),
      persistOperationalMutation(actors.other, {
        action: "RSVP",
        operationId: ids.operation,
        status: "GOING",
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const participants = await getDb()
      .select()
      .from(operationParticipants)
      .where(eq(operationParticipants.operationId, ids.operation));
    expect(participants).toHaveLength(1);
    expect(participants[0]?.status).toBe("GOING");
  });

  it("replaces one member's vote and saves migration status to PostgreSQL", async () => {
    await persistOperationalMutation(actors.member, {
      action: "VOTE",
      seasonId: ids.season,
      candidateId: ids.candidate1,
    });
    await persistOperationalMutation(actors.member, {
      action: "VOTE",
      seasonId: ids.season,
      candidateId: ids.candidate2,
    });
    const ballots = await getDb()
      .select()
      .from(seasonVotes)
      .where(eq(seasonVotes.seasonId, ids.season));
    expect(ballots).toHaveLength(1);
    expect(ballots[0]?.candidateId).toBe(ids.candidate2);
    await persistOperationalMutation(actors.member, {
      action: "MIGRATION",
      seasonId: ids.season,
      status: "READY",
    });
    const memberships = await getDb()
      .select()
      .from(seasonMemberships)
      .where(eq(seasonMemberships.seasonId, ids.season));
    expect(memberships.find((member) => member.userId === ids.member)?.migrationStatus).toBe(
      "READY",
    );
  });

  it("denies stale member roles, ended votes, unrelated candidates and mock provider writes", async () => {
    await expect(
      persistOperationalMutation(
        { ...actors.member, isMock: true },
        { action: "MIGRATION", seasonId: ids.season, status: "READY" },
      ),
    ).rejects.toThrow();
    await expect(
      persistOperationalMutation(actors.member, {
        action: "VOTE",
        seasonId: ids.season,
        candidateId: randomUUID(),
      }),
    ).rejects.toThrow();
    await getDb()
      .update(seasons)
      .set({ voteClosesAt: new Date(Date.now() - 1000) })
      .where(eq(seasons.id, ids.season));
    await expect(
      persistOperationalMutation(actors.member, {
        action: "VOTE",
        seasonId: ids.season,
        candidateId: ids.candidate1,
      }),
    ).rejects.toThrow();
    await getDb().update(users).set({ role: "GUEST" }).where(eq(users.id, ids.member));
    await expect(
      persistOperationalMutation(actors.member, {
        action: "MIGRATION",
        seasonId: ids.season,
        status: "READY",
      }),
    ).rejects.toThrow();
    expect((await getOperationalPageData(actors.member)).mode).toBe("PENDING");
  });

  it("updates an owned profile privately and audits without storing its UID in metadata", async () => {
    auth.user = actors.member;
    const handle = `v-${ids.member.replaceAll("-", "").slice(0, 20)}`;
    await saveMemberProfile({
      targetId: ids.member,
      handle,
      displayName: "Updated Public Name",
      nickname: "Updated Character",
      uid,
      bio: "Updated introduction",
    });
    const [profile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, ids.member));
    expect(profile?.displayName).toBe("Updated Public Name");
    const audit = await getDb()
      .select({ metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.actorId, ids.member));
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(uid);
  });
});
