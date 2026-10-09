import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createEmptyGearLoadout } from "@uniz/build-engine";
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
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: "MEMBER" }),
  getLiveGuildEligibility: async () => "MEMBER",
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
  builds,
  buildPublications,
  buildShareRequests,
  buildVersions,
  eq,
  getDb,
  memberProfiles,
  users,
} from "@uniz/db";
import { getUnifiedSearch } from "../src/lib/server/unified-search";
import { getOperationalPageData } from "../src/lib/server/operational-repository";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Exposure verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
class FixtureRollback extends Error {}
type Fixture = {
  owner: CurrentUser;
  member: CurrentUser;
  admin: CurrentUser;
  buildId: string;
  versionId: string;
  suffix: string;
};

async function withFixture(check: (tx: Transaction, fixture: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const principals = {
    owner: { id: randomUUID(), name: "Exposure owner", role: "MEMBER", isMock: false },
    member: { id: randomUUID(), name: "Exposure member", role: "MEMBER", isMock: false },
    admin: { id: randomUUID(), name: "Exposure administrator", role: "ADMIN", isMock: false },
  } as const;
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const buildId = randomUUID();
  const versionId = randomUUID();
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      for (const actor of Object.values(principals)) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `exposure-${actor.id}`,
          access_token: "private-exposure-token",
        });
        await tx.insert(memberProfiles).values({
          userId: actor.id,
          handle: `ex-${actor.id.replaceAll("-", "").slice(0, 16)}`,
          displayName: actor.name,
          onceHumanNickname: "Exposure character",
          onceHumanUid: "private-exposure-uid",
        });
      }
      await tx.insert(builds).values({
        id: buildId,
        ownerId: principals.owner.id,
        title: `public-${suffix}`,
        description: `Approved explanation ${suffix}`,
        visibility: "PRIVATE",
      });
      await tx.insert(buildVersions).values({
        id: versionId,
        buildId,
        version: 1,
        schemaVersion: "uniz-gear.v2",
        loadoutSnapshot: createEmptyGearLoadout(),
      });
      await check(tx, { ...principals, buildId, versionId, suffix });
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.transaction = null;
    boundary.actor = null;
  }
  expect(
    await actual.getDb().select({ id: builds.id }).from(builds).where(eq(builds.id, buildId)),
  ).toHaveLength(0);
  for (const actor of Object.values(principals))
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
}

async function request(
  tx: Transaction,
  fixture: Fixture,
  status: "PENDING" | "APPROVED",
  visibility: "HIVE" | "PUBLIC",
) {
  const [row] = await tx
    .insert(buildShareRequests)
    .values({
      buildId: fixture.buildId,
      buildVersionId: fixture.versionId,
      title: `public-${fixture.suffix}`,
      description: `Approved explanation ${fixture.suffix}`,
      requestedVisibility: visibility,
      status,
      ...(status === "APPROVED" ? { reviewerId: fixture.admin.id, reviewedAt: new Date() } : {}),
    })
    .returning({ id: buildShareRequests.id });
  if (status === "APPROVED")
    await tx.insert(buildPublications).values({ buildId: fixture.buildId, requestId: row.id });
  return row.id;
}
async function search(actor: CurrentUser | null, q: string) {
  boundary.actor = actor;
  return (await getUnifiedSearch({ q, category: "build" })).groups.flatMap((group) => group.items);
}

describe("approval metadata isolation in search and the home dashboard", () => {
  it("keeps a pending build out of other members and administrators' search/home while preserving owner access", async () => {
    await withFixture(async (tx, fixture) => {
      await request(tx, fixture, "PENDING", "PUBLIC");
      for (const viewer of [null, fixture.member, fixture.admin])
        expect(
          (await search(viewer, fixture.suffix)).some((item) => item.id === fixture.buildId),
        ).toBe(false);
      expect(
        (await search(fixture.owner, fixture.suffix)).some((item) => item.id === fixture.buildId),
      ).toBe(true);
      for (const viewer of [fixture.member, fixture.admin]) {
        const home = await getOperationalPageData(viewer, "AUTHENTICATED");
        expect(home.mode).toBe("LIVE");
        expect(home.data?.recentBuilds.some((item) => item.id === fixture.buildId)).toBe(false);
      }
    });
  });
  it("searches and presents approved metadata instead of a newer private title, description or tags", async () => {
    await withFixture(async (tx, fixture) => {
      await request(tx, fixture, "APPROVED", "PUBLIC");
      const draft = createEmptyGearLoadout();
      draft.recommendation.tags = [`private-tag-${fixture.suffix}`];
      await tx.insert(buildVersions).values({
        buildId: fixture.buildId,
        version: 2,
        schemaVersion: "uniz-gear.v2",
        loadoutSnapshot: draft,
      });
      await tx
        .update(builds)
        .set({
          title: `private-${fixture.suffix}`,
          description: `private-description-${fixture.suffix}`,
          visibility: "PRIVATE",
        })
        .where(eq(builds.id, fixture.buildId));
      for (const viewer of [null, fixture.member, fixture.admin]) {
        const visible = (await search(viewer, `public-${fixture.suffix}`)).find(
          (item) => item.id === fixture.buildId,
        );
        expect(visible?.title).toBe(`public-${fixture.suffix}`);
        expect(visible?.excerpt).toContain("Approved explanation");
        for (const q of [
          `private-${fixture.suffix}`,
          `private-description-${fixture.suffix}`,
          `private-tag-${fixture.suffix}`,
        ])
          expect((await search(viewer, q)).some((item) => item.id === fixture.buildId)).toBe(false);
      }
      expect(
        (await search(fixture.owner, `private-${fixture.suffix}`)).find(
          (item) => item.id === fixture.buildId,
        )?.title,
      ).toBe(`private-${fixture.suffix}`);
      const sharedHome = await getOperationalPageData(fixture.member, "AUTHENTICATED");
      expect(sharedHome.mode).toBe("LIVE");
      expect(
        sharedHome.data?.recentBuilds.find((item) => item.id === fixture.buildId),
      ).toMatchObject({ title: `public-${fixture.suffix}`, version: 1 });
      const ownerHome = await getOperationalPageData(fixture.owner, "AUTHENTICATED");
      expect(
        ownerHome.data?.recentBuilds.find((item) => item.id === fixture.buildId),
      ).toMatchObject({ title: `private-${fixture.suffix}`, version: 2 });
      expect(JSON.stringify(sharedHome.data?.recentBuilds)).not.toContain("private-exposure-uid");
    });
  });
  it("requires member access for approved hive sharing and removes sharing when publication is withdrawn", async () => {
    await withFixture(async (tx, fixture) => {
      await request(tx, fixture, "APPROVED", "HIVE");
      expect((await search(null, fixture.suffix)).some((item) => item.id === fixture.buildId)).toBe(
        false,
      );
      expect(
        (await search(fixture.member, fixture.suffix)).some((item) => item.id === fixture.buildId),
      ).toBe(true);
      await tx.delete(buildPublications).where(eq(buildPublications.buildId, fixture.buildId));
      expect(
        (await search(fixture.member, fixture.suffix)).some((item) => item.id === fixture.buildId),
      ).toBe(false);
      expect(
        (await search(fixture.owner, fixture.suffix)).some((item) => item.id === fixture.buildId),
      ).toBe(true);
    });
  });
  it("blocks approved sharing after the author loses member status or Discord connection", async () => {
    await withFixture(async (tx, fixture) => {
      await request(tx, fixture, "APPROVED", "PUBLIC");
      await tx.update(users).set({ role: "GUEST" }).where(eq(users.id, fixture.owner.id));
      expect((await search(null, fixture.suffix)).some((item) => item.id === fixture.buildId)).toBe(
        false,
      );
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, fixture.owner.id));
      await tx.delete(accounts).where(eq(accounts.userId, fixture.owner.id));
      expect(
        (await search(fixture.member, fixture.suffix)).some((item) => item.id === fixture.buildId),
      ).toBe(false);
      const home = await getOperationalPageData(fixture.member, "AUTHENTICATED");
      expect(home.data?.recentBuilds.some((item) => item.id === fixture.buildId)).toBe(false);
    });
  });
});
