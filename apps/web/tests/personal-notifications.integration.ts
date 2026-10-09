import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "../src/lib/user-preferences";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  lastError: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  preferences: null as UserPreferences | null,
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/user-preferences", () => ({
  getUserPreferences: async () => boundary.preferences,
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return {
    ...actual,
    getDb: () => {
      if (!boundary.transaction) return actual.getDb();
      const outer = boundary.transaction as ReturnType<typeof actual.getDb>;
      return {
        transaction: async (work: Parameters<typeof outer.transaction>[0]) => {
          try {
            return await outer.transaction(work);
          } catch (error) {
            boundary.lastError = error;
            throw error;
          }
        },
      };
    },
  };
});
import {
  accounts,
  announcements,
  auditLogs,
  communityComments,
  communityPosts,
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
  users,
} from "@uniz/db";
import { getPersonalNotifications } from "../src/lib/server/personal-notifications";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const target = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/uniz_hive"
)
  throw new Error("Notification verification requires local uniz_hive PostgreSQL.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function fixture(
  work: (
    tx: Transaction,
    member: CurrentUser,
    other: CurrentUser,
    admin: CurrentUser,
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const rollback = new Error("Intentional notification fixture rollback");
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      boundary.lastError = null;
      boundary.preferences = { ...DEFAULT_USER_PREFERENCES };
      const actors = ["MEMBER", "MEMBER", "ADMIN"].map((role) => ({
        id: randomUUID(),
        name: `Notification ${role}`,
        role: role as CurrentUser["role"],
        isMock: false,
      }));
      for (const actor of actors) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx
          .insert(accounts)
          .values({
            userId: actor.id,
            provider: "discord",
            providerAccountId: `notification-${actor.id}`,
            access_token: "NOTIFICATION_TOKEN_CANARY",
          });
        await tx
          .insert(memberProfiles)
          .values({
            userId: actor.id,
            handle: `n-${actor.id.slice(0, 20)}`,
            displayName: actor.name,
            onceHumanNickname: "Fixture",
            onceHumanUid: "NOTIFICATION_UID_CANARY",
          });
      }
      boundary.state = { user: actors[0], status: "AUTHENTICATED" };
      await work(tx, actors[0], actors[1], actors[2]);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
  }
}
async function feed() {
  const result = await getPersonalNotifications();
  if (result.mode !== "LIVE")
    throw boundary.lastError ?? new Error(`Unexpected notification mode ${result.mode}`);
  return result.data;
}

describe("actual personal notification SQL and privacy", () => {
  it("reads only my visible events and honors every preference without leaking private fields", async () =>
    fixture(async (tx, member, other, admin) => {
      const now = new Date();
      const prior = new Date(now.getTime() - 3_600_000);
      const joined = new Date(now.getTime() - 86_400_000);
      const [scenario] = await tx
        .insert(scenarios)
        .values({ slug: `notification-${randomUUID()}`, name: "Notification Scenario" })
        .returning();
      const [server] = await tx
        .insert(servers)
        .values({ scenarioId: scenario.id, name: `Notification-${randomUUID()}`, region: "TEST" })
        .returning();
      const [season] = await tx
        .insert(seasons)
        .values({
          scenarioId: scenario.id,
          serverId: server.id,
          seasonNumber: 987654321,
          name: "Notification Season",
          status: "ACTIVE",
          startsAt: joined,
          voteClosesAt: new Date(now.getTime() + 3_600_000),
        })
        .returning();
      await tx
        .insert(seasonPhases)
        .values({ seasonId: season.id, name: "Fixture Phase", order: 1 });
      await tx.insert(seasonMemberships).values({ seasonId: season.id, userId: member.id });
      const [candidate] = await tx
        .insert(seasonVoteCandidates)
        .values({ seasonId: season.id, scenarioId: scenario.id, label: "Candidate" })
        .returning();
      const notices = await tx
        .insert(announcements)
        .values([
          {
            title: "Notification visible notice",
            content: "NOTIFICATION_BODY_CANARY",
            authorId: admin.id,
            isPinned: true,
            publishedAt: prior,
          },
          {
            title: "Notification future notice",
            content: "future",
            authorId: admin.id,
            publishedAt: new Date(now.getTime() + 86_400_000),
          },
          {
            title: "Notification archived notice",
            content: "archived",
            authorId: admin.id,
            archivedAt: prior,
            publishedAt: prior,
          },
        ])
        .returning();
      const parties = await tx
        .insert(operations)
        .values([
          {
            title: "Notification changed party",
            createdById: admin.id,
            seasonId: season.id,
            type: "FARM",
            contentKey: "farm",
            capacity: 4,
            startsAt: new Date(now.getTime() + 20 * 60_000),
          },
          {
            title: "Notification cancelled party",
            createdById: admin.id,
            seasonId: season.id,
            type: "FARM",
            contentKey: "farm",
            capacity: 4,
            startsAt: new Date(now.getTime() + 20 * 60_000),
            status: "CANCELLED",
          },
          {
            title: "Notification disabled condenser",
            createdById: admin.id,
            seasonId: season.id,
            type: "RAID",
            contentKey: "gravity-condenser",
            capacity: 4,
            startsAt: new Date(now.getTime() + 20 * 60_000),
          },
          {
            title: "Notification RSVP-only update",
            createdById: admin.id,
            seasonId: season.id,
            type: "FARM",
            contentKey: "farm",
            capacity: 4,
            startsAt: new Date(now.getTime() + 2 * 3_600_000),
            updatedAt: prior,
          },
          {
            title: "Notification somebody else party",
            createdById: admin.id,
            seasonId: season.id,
            type: "FARM",
            contentKey: "farm",
            capacity: 4,
            startsAt: new Date(now.getTime() + 20 * 60_000),
          },
        ])
        .returning();
      await tx
        .insert(operationParticipants)
        .values(
          parties.map((party, index) => ({
            operationId: party.id,
            userId: index === 4 ? other.id : member.id,
            status: "GOING" as const,
            createdAt: joined,
          })),
        );
      await tx
        .insert(auditLogs)
        .values(
          parties
            .slice(0, 2)
            .map((party) => ({
              actorId: admin.id,
              entityType: "operation",
              entityId: party.id,
              action: "party.updated",
              createdAt: prior,
            })),
        );
      await tx
        .insert(auditLogs)
        .values({
          actorId: other.id,
          entityType: "operation",
          entityId: parties[3].id,
          action: "OPERATION_RSVP_CHANGED",
          createdAt: prior,
        });
      const posts = await tx
        .insert(communityPosts)
        .values([
          {
            authorId: member.id,
            category: "QUESTION",
            title: "Notification my post",
            body: "NOTIFICATION_POST_BODY_CANARY",
          },
          {
            authorId: member.id,
            category: "QUESTION",
            title: "Notification hidden post",
            body: "hidden",
            hiddenAt: prior,
          },
          {
            authorId: member.id,
            category: "QUESTION",
            title: "Notification archived post",
            body: "archived",
            archivedAt: prior,
          },
          {
            authorId: other.id,
            category: "QUESTION",
            title: "Notification other post",
            body: "other",
          },
        ])
        .returning();
      const comments = await tx
        .insert(communityComments)
        .values([
          {
            postId: posts[0].id,
            authorId: other.id,
            body: "NOTIFICATION_COMMENT_BODY_CANARY",
            createdAt: prior,
          },
          { postId: posts[0].id, authorId: member.id, body: "self", createdAt: prior },
          {
            postId: posts[0].id,
            authorId: other.id,
            body: "hidden",
            hiddenAt: prior,
            createdAt: prior,
          },
          {
            postId: posts[0].id,
            authorId: other.id,
            body: "archived",
            archivedAt: prior,
            createdAt: prior,
          },
          { postId: posts[1].id, authorId: other.id, body: "hidden post", createdAt: prior },
          { postId: posts[2].id, authorId: other.id, body: "archived post", createdAt: prior },
          { postId: posts[3].id, authorId: admin.id, body: "other post", createdAt: prior },
        ])
        .returning();
      const first = await feed();
      expect(new Set(first.items.map((item) => item.kind))).toEqual(
        new Set(["ANNOUNCEMENT", "PARTY_CHANGE", "PARTY_REMINDER", "VOTE_DEADLINE", "COMMENT"]),
      );
      expect(first.items.find((item) => item.kind === "PARTY_REMINDER")?.href).toBe(
        `/ops/${parties[0].id}`,
      );
      expect(
        first.items.some(
          (item) => item.title.includes("취소") && item.href.endsWith(parties[1].id),
        ),
      ).toBe(true);
      for (const excluded of [
        notices[1].id,
        notices[2].id,
        parties[2].id,
        parties[3].id,
        parties[4].id,
        ...comments.slice(1).map((row) => row.id),
      ])
        expect(JSON.stringify(first.items)).not.toContain(excluded);
      expect(JSON.stringify(first)).not.toMatch(/CANARY|access_token|onceHumanUid|unread/);
      expect((await feed()).items.map((item) => item.id)).toEqual(
        first.items.map((item) => item.id),
      );
      await tx
        .insert(seasonVotes)
        .values({ seasonId: season.id, candidateId: candidate.id, userId: member.id });
      expect((await feed()).items.some((item) => item.kind === "VOTE_DEADLINE")).toBe(false);
      await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, other.id));
      expect((await feed()).items.some((item) => item.kind === "COMMENT")).toBe(false);
      await tx
        .update(seasonMemberships)
        .set({ removedAt: now })
        .where(eq(seasonMemberships.userId, member.id));
      expect((await feed()).items.some((item) => item.kind.startsWith("PARTY_"))).toBe(false);
      boundary.preferences = {
        ...DEFAULT_USER_PREFERENCES,
        notifyAnnouncements: false,
        notifyPartyChanges: false,
        notifyPartyReminders: false,
        notifyVoteDeadlines: false,
        notifyComments: false,
      };
      expect(await feed()).toMatchObject({ items: [], enabledKinds: [] });
    }));
  it("rejects a stale administrator session and removed Discord connection after fresh DB checks", async () =>
    fixture(async (tx, member) => {
      boundary.state = { user: { ...member, role: "ADMIN" }, status: "AUTHENTICATED" };
      await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, member.id));
      expect(await getPersonalNotifications()).toEqual({ mode: "PENDING" });
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, member.id));
      await tx.delete(accounts).where(eq(accounts.userId, member.id));
      expect(await getPersonalNotifications()).toEqual({ mode: "REAUTH" });
    }));
});
