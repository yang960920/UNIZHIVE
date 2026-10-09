import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  actor: null as CurrentUser | null,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => ({
    user: boundary.actor,
    status: boundary.actor ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("../src/lib/server/steam-overview", () => ({
  getSteamOverview: async () => ({ news: { items: [] } }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});
import {
  accounts,
  announcements,
  communityPosts,
  eq,
  memberProfiles,
  operationParticipants,
  operations,
  scenarios,
  seasonMemberships,
  seasons,
  servers,
  users,
} from "@uniz/db";
import { getOperationalPageData } from "../src/lib/server/operational-repository";
import { getUnifiedSearch } from "../src/lib/server/unified-search";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const target = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/uniz_hive"
)
  throw new Error("Home verification requires local uniz_hive PostgreSQL.");

describe("home privacy and community publication filters", () => {
  it("keeps showcase out of home but searchable in its own space while preserving privacy and moderation filters", async () => {
    const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
    const rollback = new Error("Intentional home fixture rollback");
    const actors: CurrentUser[] = ["ADMIN", "OFFICER", "MEMBER"].map((role) => ({
      id: randomUUID(),
      name: `Home Fixture ${role}`,
      role: role as CurrentUser["role"],
      isMock: false,
    }));
    try {
      await actual.getDb().transaction(async (tx) => {
        boundary.transaction = tx;
        for (const [index, actor] of actors.entries()) {
          await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
          await tx.insert(accounts).values({
            userId: actor.id,
            provider: "discord",
            providerAccountId: `home-fixture-${actor.id}`,
          });
          await tx.insert(memberProfiles).values({
            userId: actor.id,
            handle: `hf-${actor.id.slice(0, 18)}`,
            displayName: actor.name,
            onceHumanNickname: `Fixture${index}`,
            onceHumanUid: "HOME_PRIVATE_UID_FIXTURE",
          });
        }
        const [scenario] = await tx
          .insert(scenarios)
          .values({ slug: `home-${randomUUID()}`, name: "Home Fixture Scenario" })
          .returning();
        const [server] = await tx
          .insert(servers)
          .values({ scenarioId: scenario.id, name: `Home-${randomUUID()}`, region: "TEST" })
          .returning();
        const [season] = await tx
          .insert(seasons)
          .values({
            scenarioId: scenario.id,
            serverId: server.id,
            seasonNumber: 1,
            name: "Home Fixture",
            status: "PLANNED",
            startsAt: new Date(),
          })
          .returning();
        await tx
          .insert(seasonMemberships)
          .values(actors.map((actor) => ({ seasonId: season.id, userId: actor.id })));
        const [party] = await tx
          .insert(operations)
          .values({
            seasonId: season.id,
            createdById: actors[0].id,
            title: "Home Fixture Party",
            type: "RAID",
            contentKey: "raid",
            capacity: 4,
            startsAt: new Date(Date.now() + 3600000),
          })
          .returning();
        await tx.insert(operationParticipants).values(
          actors.map((actor) => ({
            operationId: party.id,
            userId: actor.id,
            status: "GOING" as const,
          })),
        );
        const notices = await tx
          .insert(announcements)
          .values([
            {
              title: "Home visible notice",
              content: "Fixture content",
              authorId: actors[0].id,
              isPinned: true,
              publishedAt: new Date(Date.now() - 1),
            },
            {
              title: "Home reserved notice",
              content: "Future content",
              authorId: actors[0].id,
              publishedAt: new Date(Date.now() + 86400000),
            },
            {
              title: "Home archived notice",
              content: "Archived content",
              authorId: actors[0].id,
              archivedAt: new Date(),
            },
          ])
          .returning();
        const posts = await tx
          .insert(communityPosts)
          .values([
            {
              title: "Home visible post",
              body: "Fixture body",
              category: "TIP",
              authorId: actors[2].id,
              isPinned: true,
            },
            {
              title: "Home hidden post",
              body: "Hidden body",
              category: "TIP",
              authorId: actors[2].id,
              hiddenAt: new Date(),
            },
            {
              title: "Home archived post",
              body: "Archived body",
              category: "TIP",
              authorId: actors[2].id,
              archivedAt: new Date(),
            },
            {
              title: "Home showcase post",
              body: "SHOWCASE_BODY_PRIVATE_FROM_HOME",
              category: "SHOWCASE",
              authorId: actors[2].id,
              isPinned: true,
              createdAt: new Date(Date.now() + 1),
              bodyDocument: {
                schemaVersion: "uniz-content.v1",
                type: "doc",
                content: [
                  { type: "image", attrs: { imageId: randomUUID(), alt: "별도 사진 공간" } },
                ],
              },
            },
          ])
          .returning();
        for (const actor of actors) {
          const page = await getOperationalPageData({ ...actor, role: "ADMIN" });
          expect(page.mode).toBe("LIVE");
          if (page.mode !== "LIVE") throw new Error("Home fixture must remain live");
          expect(page.role).toBe(actor.role);
          expect(page.data.nextOperation?.id).toBe(party.id);
          expect(page.data.nextOperation?.members).toHaveLength(3);
          for (const member of page.data.nextOperation!.members) {
            expect(member.name).toContain("Home Fixture");
            expect(member.handle).toBe(
              actor.role === "ADMIN" ? `hf-${member.id.slice(0, 18)}` : null,
            );
          }
          expect(page.data.announcements.map((row) => row.id)).toContain(notices[0].id);
          expect(
            page.data.announcements.some(
              (row) => row.id === notices[1].id || row.id === notices[2].id,
            ),
          ).toBe(false);
          expect(page.data.announcements.length).toBeLessThanOrEqual(5);
          expect(page.data.recentCommunityPosts?.map((row) => row.id)).toContain(posts[0].id);
          expect(
            page.data.recentCommunityPosts?.some(
              (row) => row.id === posts[1].id || row.id === posts[2].id || row.id === posts[3].id,
            ),
          ).toBe(false);
          expect(page.data.recentCommunityPosts!.length).toBeLessThanOrEqual(4);
          expect(JSON.stringify(page.data)).not.toContain("HOME_PRIVATE_UID_FIXTURE");
          expect(JSON.stringify(page.data)).not.toContain("SHOWCASE_BODY_PRIVATE_FROM_HOME");
          if (actor.role !== "ADMIN") expect(page.data.pendingCount).toBeNull();
          boundary.actor = actor;
          const search = await getUnifiedSearch({ q: "Home", category: "community" });
          expect(search.mode).toBe("LIVE");
          const results = search.groups.flatMap((group) => group.items);
          expect(results.find((row) => row.id === posts[0].id)?.href).toBe(
            `/community/${posts[0].id}`,
          );
          expect(results.find((row) => row.id === posts[3].id)).toMatchObject({
            detail: "자랑하기",
            href: `/community/${posts[3].id}?section=SHOWCASE`,
          });
          expect(results.some((row) => row.id === posts[1].id || row.id === posts[2].id)).toBe(
            false,
          );
          expect(JSON.stringify(search)).not.toContain("HOME_PRIVATE_UID_FIXTURE");
          expect(JSON.stringify(search)).not.toContain("bodyDocument");
        }
        boundary.actor = null;
        expect((await getUnifiedSearch({ q: "Home", category: "community" })).groups).toHaveLength(
          0,
        );
        await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, actors[2].id));
        boundary.actor = { ...actors[2], role: "ADMIN" };
        const unapprovedSearch = await getUnifiedSearch({ q: "Home", category: "community" });
        expect(unapprovedSearch.mode).toBe("LIMITED");
        expect(unapprovedSearch.groups).toHaveLength(0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      boundary.transaction = null;
      boundary.actor = null;
    }
    expect(
      await actual.getDb().select().from(users).where(eq(users.id, actors[0].id)),
    ).toHaveLength(0);
  });
});
