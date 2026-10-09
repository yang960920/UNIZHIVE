import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createEmptyPlannerLoadout,
  PLANNER_SCHEMA_VERSION,
  type PlannerLoadout,
  type PlannerGearLoadout,
  createEmptyGearLoadout,
  createGearSelection,
  GEAR_CATALOG,
} from "@uniz/build-engine";
import type { CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
// Repository calls still execute real PostgreSQL statements. Delegate them to an
// outer test transaction so immutable versions can be rolled back, never deleted.
const database = vi.hoisted(() => ({
  active: null as ReturnType<typeof getDb> | null,
  original: null as typeof getDb | null,
  actor: null as CurrentUser | null,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => ({
    user: database.actor,
    status: database.actor ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("@uniz/db", async () => {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  database.original = actual.getDb;
  return { ...actual, getDb: () => database.active ?? actual.getDb() };
});

import {
  accounts,
  auditLogs,
  builds,
  buildVersions,
  buildShareRequests,
  buildPublications,
  contentImages,
  contentImageReferences,
  eq,
  getDb,
  memberProfiles,
  sql,
  users,
} from "@uniz/db";
import {
  getBuildDetailData,
  getBuildLibraryData,
  persistBuildMutation,
} from "../src/lib/server/build-planner";
import {
  getBuildShareReview,
  listBuildShareRequests,
  reviewBuildSharing,
} from "../src/lib/server/build-sharing";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Build Planner verification requires the local uniz_hive database.");
}

const uid = "private-build-verification-uid";
const accessToken = "private-build-verification-access-token";
const refreshToken = "private-build-verification-refresh-token";
class FixtureRollback extends Error {}
interface Fixture {
  owner: CurrentUser;
  other: CurrentUser;
  admin: CurrentUser;
  applicant: CurrentUser;
}

async function withFixture(check: (fixture: Fixture) => Promise<void>): Promise<void> {
  const original = database.original!();
  const fixture: Fixture = {
    owner: { id: randomUUID(), name: "Build Verification Owner", role: "MEMBER", isMock: false },
    other: { id: randomUUID(), name: "Build Verification Other", role: "MEMBER", isMock: false },
    admin: { id: randomUUID(), name: "Build Verification Admin", role: "ADMIN", isMock: false },
    applicant: {
      id: randomUUID(),
      name: "Build Verification Applicant",
      role: "APPLICANT",
      isMock: false,
    },
  };
  try {
    await original.transaction(async (transaction) => {
      // PostgreSQL nested transactions below are savepoints within this real transaction.
      database.active = transaction as unknown as ReturnType<typeof getDb>;
      await transaction
        .insert(users)
        .values(Object.values(fixture).map(({ id, name, role }) => ({ id, name, role })));
      for (const actor of Object.values(fixture)) {
        await transaction.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `build-verification-${actor.id}`,
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        await transaction.insert(memberProfiles).values({
          userId: actor.id,
          handle: `v-${actor.id.replaceAll("-", "").slice(0, 20)}`,
          displayName: actor.name,
          onceHumanNickname: "Verification Character",
          onceHumanUid: uid,
        });
      }
      await check(fixture);
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    database.active = null;
    database.actor = null;
  }
  for (const actor of Object.values(fixture)) {
    expect(
      await original.select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(
      await original.select({ id: builds.id }).from(builds).where(eq(builds.ownerId, actor.id)),
    ).toHaveLength(0);
    expect(
      await original
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, actor.id)),
    ).toHaveLength(0);
  }
}

function loadout(name = "Recorded equipment", tier: number | null = null): PlannerLoadout {
  const result = createEmptyPlannerLoadout();
  result.entries.push({
    id: randomUUID(),
    category: "WEAPON",
    slotLabel: "Primary",
    name,
    linkedEntryId: null,
    reference: null,
    instance: {
      tier,
      stars: null,
      calibration: null,
      level: null,
      rolls: [{ label: "Recorded roll", value: null, unit: null }],
    },
    notes: "User-recorded equipment without calculated stats",
  });
  return result;
}

function saveInput(
  snapshot: PlannerLoadout | PlannerGearLoadout = loadout(),
  visibility: "PRIVATE" | "HIVE" | "PUBLIC" = "PRIVATE",
) {
  return {
    action: "SAVE_BUILD",
    title: "Verification build",
    description: "Recorded configuration",
    visibility,
    loadout: snapshot,
    notes: "First saved version",
  };
}

async function detail(owner: CurrentUser, id: string, version?: number) {
  const result = await getBuildDetailData(owner, id, version);
  if (!result) throw new Error("Synthetic build detail was not found.");
  return result;
}
async function approve(admin: CurrentUser, buildId: string) {
  const [request] = await getDb()
    .select()
    .from(buildShareRequests)
    .where(
      sql`${buildShareRequests.buildId} = ${buildId} and ${buildShareRequests.status} = 'PENDING'`,
    )
    .limit(1);
  if (!request) throw new Error("No submitted request");
  database.actor = admin;
  await reviewBuildSharing({
    requestId: request.id,
    expectedUpdatedAt: request.updatedAt.toISOString(),
    action: "APPROVE",
    recommendationScore: 4,
    recommendationNote: "검토한 승인 버전",
  });
  database.actor = null;
  return request.id;
}

describe("Build Planner repositories against local PostgreSQL with full rollback", () => {
  it("keeps approved v1 frozen while the owner saves a private v2 and hides every unapproved version", async () => {
    await withFixture(async ({ owner, other, admin }) => {
      const first = await persistBuildMutation(owner, {
        ...saveInput(loadout("Approved gear"), "PUBLIC"),
        title: "Approved title",
        description: "Approved description",
      });
      const requestId = await approve(admin, first.id);
      const before = await detail(owner, first.id);
      await persistBuildMutation(owner, {
        ...saveInput(loadout("Private gear")),
        buildId: first.id,
        expectedUpdatedAt: before.updatedAt,
        title: "Private draft canary",
        description: "Private body canary",
        notes: "Private notes canary",
      });
      const published = await getBuildDetailData(null, first.id);
      expect(published).toMatchObject({
        title: "Approved title",
        description: "Approved description",
        latestVersion: 1,
        recommendationScore: 4,
        selectedVersion: { version: 1 },
        canLike: false,
      });
      expect(published?.versions.map((entry) => entry.version)).toEqual([1]);
      expect(JSON.stringify(published)).not.toContain("Private");
      expect(await getBuildDetailData(other, first.id, 2)).toBeNull();
      expect(await getBuildDetailData(admin, first.id, 2)).toBeNull();
      expect((await detail(owner, first.id)).sharing?.published?.version).toBe(1);
      expect((await detail(owner, first.id)).selectedVersion.version).toBe(2);
      database.actor = admin;
      expect((await getBuildShareReview(requestId))?.share.title).toBe("Approved title");
      expect(
        await getBuildShareReview((await detail(owner, first.id)).selectedVersion.id),
      ).toBeNull();
      const latest = await detail(owner, first.id);
      await persistBuildMutation(owner, {
        action: "SET_VISIBILITY",
        buildId: first.id,
        expectedUpdatedAt: latest.updatedAt,
        visibility: "PUBLIC",
      });
      expect((await getBuildDetailData(null, first.id))?.selectedVersion.version).toBe(1);
      await approve(admin, first.id);
      expect((await getBuildDetailData(null, first.id))?.selectedVersion.version).toBe(2);
      expect((await getBuildDetailData(null, first.id, 1))?.title).toBe("Approved title");
      expect(
        (await getBuildDetailData(null, first.id, 1))?.versions.map((entry) => entry.version),
      ).toEqual([2, 1]);
    });
  });

  it("confines approval to a currently connected ADMIN and submitted snapshots", async () => {
    await withFixture(async ({ owner, other, admin, applicant }) => {
      const saved = await persistBuildMutation(owner, saveInput(loadout(), "PUBLIC"));
      const request = (await detail(owner, saved.id)).sharing!.latestRequest!;
      const payload = {
        requestId: request.id,
        expectedUpdatedAt: request.updatedAt,
        action: "APPROVE",
      };
      for (const actor of [null, owner, applicant, { ...admin, isMock: true }]) {
        database.actor = actor;
        await expect(reviewBuildSharing(payload)).rejects.toThrow();
      }
      await getDb().update(users).set({ role: "OFFICER" }).where(eq(users.id, other.id));
      database.actor = { ...other, role: "OFFICER" };
      await expect(reviewBuildSharing(payload)).rejects.toThrow();
      await expect(listBuildShareRequests()).rejects.toThrow();
      await getDb().update(users).set({ role: "MEMBER" }).where(eq(users.id, admin.id));
      database.actor = admin;
      await expect(reviewBuildSharing(payload)).rejects.toThrow();
      await getDb().update(users).set({ role: "ADMIN" }).where(eq(users.id, admin.id));
      await getDb().transaction(async (tx) => {
        await tx.execute(
          sql`update ${accounts} set provider='build-review-disconnected' where ${accounts.userId}=${admin.id}`,
        );
      });
      await expect(reviewBuildSharing(payload)).rejects.toThrow();
      expect(
        await getDb()
          .select()
          .from(buildPublications)
          .where(eq(buildPublications.buildId, saved.id)),
      ).toHaveLength(0);
      expect((await detail(owner, saved.id)).sharing?.latestRequest?.status).toBe("PENDING");
    });
  });

  it("cancels replaced requests, freezes request metadata, rejects stale review and preserves the current publication on rejection", async () => {
    await withFixture(async ({ owner, admin }) => {
      const saved = await persistBuildMutation(owner, saveInput(loadout(), "PUBLIC"));
      const first = (await detail(owner, saved.id)).sharing!.latestRequest!;
      const before = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        ...saveInput(loadout(), "PUBLIC"),
        buildId: saved.id,
        expectedUpdatedAt: before.updatedAt,
        title: "Second submitted title",
      });
      database.actor = admin;
      await expect(
        reviewBuildSharing({
          requestId: first.id,
          expectedUpdatedAt: first.updatedAt,
          action: "APPROVE",
        }),
      ).rejects.toThrow();
      const current = (await detail(owner, saved.id)).sharing!.latestRequest!;
      await expect(
        getDb().transaction(async (tx) => {
          await tx
            .update(buildShareRequests)
            .set({ title: "Tampered title" })
            .where(eq(buildShareRequests.id, current.id));
        }),
      ).rejects.toThrow();
      await expect(
        reviewBuildSharing({
          requestId: current.id,
          expectedUpdatedAt: current.updatedAt,
          action: "APPROVE",
          recommendationScore: 6,
        }),
      ).rejects.toThrow();
      await approve(admin, saved.id);
      const approved = (await detail(owner, saved.id)).sharing!.published!;
      database.actor = admin;
      await expect(
        reviewBuildSharing({
          requestId: current.id,
          expectedUpdatedAt: current.updatedAt,
          action: "RATE",
          recommendationScore: 2,
        }),
      ).rejects.toThrow();
      const latest = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        ...saveInput(loadout(), "PUBLIC"),
        buildId: saved.id,
        expectedUpdatedAt: latest.updatedAt,
        title: "Rejected draft",
      });
      const pending = (await detail(owner, saved.id)).sharing!.latestRequest!;
      await reviewBuildSharing({
        requestId: pending.id,
        expectedUpdatedAt: pending.updatedAt,
        action: "REJECT",
        reviewNote: "보완 필요",
      });
      const own = await detail(owner, saved.id);
      expect(own.sharing?.latestRequest).toMatchObject({
        status: "REJECTED",
        reviewNote: "보완 필요",
      });
      expect((await getBuildDetailData(null, saved.id))?.selectedVersion.version).toBe(
        approved.version,
      );
      expect(JSON.stringify(await getBuildDetailData(null, saved.id))).not.toContain("보완 필요");
    });
  });

  it("enforces both current and historical approved audiences and revokes repeated approvals of the same version", async () => {
    await withFixture(async ({ owner, other, admin }) => {
      const saved = await persistBuildMutation(owner, saveInput(loadout(), "HIVE"));
      await approve(admin, saved.id);
      const before = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        ...saveInput(loadout(), "PUBLIC"),
        buildId: saved.id,
        expectedUpdatedAt: before.updatedAt,
      });
      const publicRequestId = await approve(admin, saved.id);
      expect(await getBuildDetailData(null, saved.id, 1)).toBeNull();
      expect((await getBuildDetailData(other, saved.id, 1))?.selectedVersion.version).toBe(1);
      expect((await getBuildDetailData(null, saved.id))?.selectedVersion.version).toBe(2);
      const current = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        action: "SET_VISIBILITY",
        buildId: saved.id,
        expectedUpdatedAt: current.updatedAt,
        visibility: "HIVE",
      });
      await approve(admin, saved.id);
      expect(await getBuildDetailData(null, saved.id, 2)).toBeNull();
      const [oldRequest] = await getDb()
        .select()
        .from(buildShareRequests)
        .where(eq(buildShareRequests.id, publicRequestId));
      database.actor = admin;
      await reviewBuildSharing({
        requestId: publicRequestId,
        expectedUpdatedAt: oldRequest.updatedAt.toISOString(),
        action: "REVOKE",
        reviewNote: "승인 해제",
      });
      expect(await getBuildDetailData(other, saved.id, 2)).toBeNull();
      expect(
        await getDb()
          .select()
          .from(buildPublications)
          .where(eq(buildPublications.buildId, saved.id)),
      ).toHaveLength(0);
      const requests = await getDb()
        .select()
        .from(buildShareRequests)
        .where(eq(buildShareRequests.buildId, saved.id));
      expect(
        requests
          .filter((request) => request.buildVersionId === oldRequest.buildVersionId)
          .every((request) => request.status === "REVOKED"),
      ).toBe(true);
    });
  });

  it("binds version images and canonical video atomically while rejecting another owner's image without creating a version", async () => {
    await withFixture(async ({ owner, other, admin }) => {
      const imageId = randomUUID();
      await getDb()
        .insert(contentImages)
        .values({
          id: imageId,
          ownerId: owner.id,
          revision: "a".repeat(64),
          content: Buffer.from([1, 2]),
          width: 2,
          height: 2,
        });
      const bodyDocument = {
        schemaVersion: "uniz-content.v1",
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Formatted body" }] },
          { type: "image", attrs: { imageId, alt: "Gear screenshot" } },
        ],
      };
      const saved = await persistBuildMutation(owner, {
        ...saveInput(loadout(), "PUBLIC"),
        bodyDocument,
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ?t=30",
      });
      const own = await detail(owner, saved.id);
      expect(own.description).toContain("Formatted body");
      expect(own.selectedVersion).toMatchObject({
        bodyDocument,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
      });
      expect(
        await getDb()
          .select()
          .from(contentImageReferences)
          .where(eq(contentImageReferences.buildVersionId, own.selectedVersion.id)),
      ).toHaveLength(1);
      await expect(
        persistBuildMutation(other, { ...saveInput(), bodyDocument }),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(await getDb().select().from(builds).where(eq(builds.ownerId, other.id))).toHaveLength(
        0,
      );
      await approve(admin, saved.id);
      expect((await getBuildDetailData(null, saved.id))?.selectedVersion.bodyDocument).toEqual(
        bodyDocument,
      );
    });
  });
  it("allows two authorization readers while keeping exclusive permission changes behind the gate", async () => {
    const original = database.original!();
    let opened!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = original.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
      opened();
      await hold;
    });
    await ready;
    try {
      await original.transaction(async (transaction) => {
        const result = await transaction.execute(
          sql`select pg_try_advisory_xact_lock_shared(912743110) as shared, pg_try_advisory_xact_lock(912743110) as exclusive`,
        );
        expect(result[0]).toMatchObject({ shared: true, exclusive: false });
      });
    } finally {
      release();
      await first;
    }
  });
  it("saves icon gear with canonical names and preserves a prior manual snapshot", async () => {
    await withFixture(async ({ owner }) => {
      const old = loadout("Original manual name");
      const first = await persistBuildMutation(owner, saveInput(old));
      const before = await detail(owner, first.id);
      const weapon = GEAR_CATALOG.find(
        (item) => item.kind === "WEAPON" && item.allowedSlots.includes("primary"),
      );
      expect(weapon).toBeDefined();
      const gear = createEmptyGearLoadout();
      gear.slots.push(createGearSelection("primary", weapon!.id));
      gear.catalogNames = { [weapon!.id]: "Forged label" };
      gear.recommendation = {
        rating: 4,
        contents: ["보스"],
        tags: ["#지원", "지원"],
        notes: "콘텐츠별 추천",
      };
      const saved = await persistBuildMutation(owner, {
        ...saveInput(gear),
        buildId: first.id,
        expectedUpdatedAt: before.updatedAt,
      });
      expect(saved.version).toBe(2);
      const result = (await detail(owner, first.id)).selectedVersion;
      expect(result.schemaVersion).toBe("uniz-gear.v2");
      expect(result.loadout).toMatchObject({
        catalogNames: { [weapon!.id]: weapon!.name },
        recommendation: { rating: 4, tags: ["지원"] },
      });
      expect((await detail(owner, first.id, 1)).selectedVersion.loadout).toEqual(old);
    });
  });

  it("persists Chef doping separately by kind, rejects excess after a class change and preserves versions", async () => {
    await withFixture(async ({ owner }) => {
      const original = createEmptyGearLoadout();
      delete original.consumables;
      const first = await persistBuildMutation(owner, saveInput(original));
      const firstDetail = await detail(owner, first.id);
      const chef = createEmptyGearLoadout();
      chef.context.characterClass = "셰프";
      chef.consumables = {
        foodIds: ["consumable-30110345", "consumable-30110330"],
        drinkIds: ["consumable-30110401", "consumable-30110344"],
        notes: "사슴고기 / 제작 강화는 게임에서 확인",
      };
      const second = await persistBuildMutation(owner, {
        ...saveInput(chef),
        buildId: first.id,
        expectedUpdatedAt: firstDetail.updatedAt,
      });
      expect(second.version).toBe(2);
      const secondDetail = await detail(owner, first.id);
      expect(secondDetail.selectedVersion.loadout).toMatchObject({
        consumables: chef.consumables,
        catalogNames: { "consumable-30110345": "부서진 빵" },
      });
      const excess = structuredClone(chef);
      excess.context.characterClass = "정원사";
      await expect(
        persistBuildMutation(owner, {
          ...saveInput(excess),
          buildId: first.id,
          expectedUpdatedAt: secondDetail.updatedAt,
        }),
      ).rejects.toThrow("셰프는 음식과 음료를 각각 2개");
      expect((await detail(owner, first.id)).versions).toHaveLength(2);
      excess.consumables!.foodIds.pop();
      excess.consumables!.drinkIds.pop();
      const third = await persistBuildMutation(owner, {
        ...saveInput(excess),
        buildId: first.id,
        expectedUpdatedAt: secondDetail.updatedAt,
      });
      expect(third.version).toBe(3);
      expect((await detail(owner, first.id, 2)).selectedVersion.loadout).toMatchObject({
        context: { characterClass: "셰프" },
        consumables: chef.consumables,
      });
      expect((await detail(owner, first.id, 1)).selectedVersion.loadout).toMatchObject({
        slots: [],
      });
      expect((await detail(owner, first.id, 1)).selectedVersion.loadout).not.toHaveProperty(
        "consumables",
      );
    });
  });

  it("searches recommendation tags only within the caller's visible builds and latest version", async () => {
    await withFixture(async ({ owner, other, admin }) => {
      const marker = `tag-${randomUUID()}`;
      const gear = createEmptyGearLoadout();
      gear.recommendation.tags = [marker];
      const privateBuild = await persistBuildMutation(owner, saveInput(gear));
      expect(
        (await getBuildLibraryData(owner, { query: marker })).owned.map((item) => item.id),
      ).toContain(privateBuild.id);
      expect((await getBuildLibraryData(other, { query: marker })).owned).toHaveLength(0);
      expect((await getBuildLibraryData(null, { query: marker })).public).toHaveLength(0);
      const shared = await persistBuildMutation(owner, saveInput(gear, "PUBLIC"));
      expect((await getBuildLibraryData(null, { query: marker })).public).toHaveLength(0);
      await approve(admin, shared.id);
      expect(
        (await getBuildLibraryData(null, { query: `#${marker}` })).public.map((item) => item.id),
      ).toContain(shared.id);
      const before = await detail(owner, shared.id);
      await persistBuildMutation(owner, {
        ...saveInput(createEmptyGearLoadout(), "PUBLIC"),
        buildId: shared.id,
        expectedUpdatedAt: before.updatedAt,
      });
      expect(
        (await getBuildLibraryData(null, { query: marker })).public.map((item) => item.id),
      ).toContain(shared.id);
      await approve(admin, shared.id);
      expect(
        (await getBuildLibraryData(null, { query: marker })).public.map((item) => item.id),
      ).not.toContain(shared.id);
    });
  });

  it("paginates searched owner archives separately from active and approved shared builds", async () => {
    await withFixture(async ({ owner, other, admin }) => {
      const marker = `archive-page-${randomUUID()}`;
      const archivedIds = new Set<string>();
      for (let index = 0; index < 10; index++) {
        const saved = await persistBuildMutation(owner, {
          ...saveInput(createEmptyGearLoadout()),
          title: `${marker}-${index}`,
        });
        const current = await detail(owner, saved.id);
        await persistBuildMutation(owner, {
          action: "ARCHIVE",
          buildId: saved.id,
          expectedUpdatedAt: current.updatedAt,
        });
        archivedIds.add(saved.id);
      }
      const activeIds = new Set<string>();
      for (const visibility of ["PRIVATE", "HIVE", "PUBLIC"] as const) {
        const saved = await persistBuildMutation(owner, {
          ...saveInput(createEmptyGearLoadout(), visibility),
          title: `${marker}-active-${visibility}`,
        });
        activeIds.add(saved.id);
        if (visibility !== "PRIVATE") await approve(admin, saved.id);
      }
      const active = await getBuildLibraryData(owner, { query: marker });
      expect(new Set(active.owned.map((build) => build.id))).toEqual(activeIds);
      const first = await getBuildLibraryData(owner, { query: marker, archived: true });
      expect(first.owned).toHaveLength(9);
      expect(first.owned.every((build) => build.archivedAt && archivedIds.has(build.id))).toBe(
        true,
      );
      expect(first.nextCursors?.owned).toBeTruthy();
      expect(first.hive).toEqual(active.hive);
      expect(first.public).toEqual(active.public);
      const second = await getBuildLibraryData(owner, {
        query: marker,
        archived: true,
        ownedCursor: first.nextCursors!.owned!,
      });
      expect(second.owned).toHaveLength(1);
      expect(second.nextCursors?.owned).toBeNull();
      expect(new Set([...first.owned, ...second.owned].map((build) => build.id))).toEqual(
        archivedIds,
      );
      expect(
        (await getBuildLibraryData(owner, { archived: true, query: `${marker}-missing` })).owned,
      ).toHaveLength(0);
      expect(
        (await getBuildLibraryData(other, { archived: true, query: marker })).owned,
      ).toHaveLength(0);
      expect(
        (
          await getBuildLibraryData(owner, { query: marker, archived: "1" as unknown as boolean })
        ).owned.map((build) => build.id),
      ).toEqual(active.owned.map((build) => build.id));
    });
  });

  it("limits library and version pages while keeping a selected old snapshot available", async () => {
    await withFixture(async ({ owner }) => {
      const marker = `page-${randomUUID()}`;
      for (let index = 0; index < 12; index++)
        await persistBuildMutation(owner, {
          ...saveInput(createEmptyGearLoadout()),
          title: `${marker}-${index}`,
        });
      const first = await getBuildLibraryData(owner, { query: marker });
      expect(first.owned).toHaveLength(9);
      expect(first.nextCursors?.owned).toBeTruthy();
      const second = await getBuildLibraryData(owner, {
        query: marker,
        ownedCursor: first.nextCursors!.owned!,
      });
      expect(second.owned).toHaveLength(3);
      expect(second.nextCursors?.owned).toBeNull();
      expect(new Set([...first.owned, ...second.owned].map((item) => item.id)).size).toBe(12);
      const id = first.owned[0].id;
      for (let index = 0; index < 22; index++) {
        const before = await detail(owner, id);
        await persistBuildMutation(owner, {
          ...saveInput(createEmptyGearLoadout()),
          buildId: id,
          expectedUpdatedAt: before.updatedAt,
        });
      }
      const current = await detail(owner, id, 1);
      expect(current.selectedVersion.version).toBe(1);
      expect(current.versions).toHaveLength(20);
      expect(current.versionsNext).toBe(4);
      const older = await getBuildDetailData(owner, id, 1, current.versionsNext!);
      expect(older?.versions.map((item) => item.version)).toEqual([3, 2, 1]);
      expect(older?.selectedVersion.loadout).toEqual(createEmptyGearLoadout());
    });
  });

  it.each(["HIVE", "PUBLIC"] as const)(
    "paginates %s builds nine at a time including the viewer's own shared builds",
    async (visibility) => {
      await withFixture(async ({ owner, admin }) => {
        const marker = `shared-page-${randomUUID()}`;
        const expectedIds = new Set<string>();
        for (let index = 0; index < 12; index++) {
          const saved = await persistBuildMutation(owner, {
            ...saveInput(createEmptyGearLoadout(), visibility),
            title: `${marker}-${index}`,
          });
          expectedIds.add(saved.id);
          await approve(admin, saved.id);
        }
        const group = visibility === "HIVE" ? "hive" : "public";
        const first = await getBuildLibraryData(owner, { query: marker });
        expect(first[group]).toHaveLength(9);
        expect(first[group].every((build) => build.isOwner)).toBe(true);
        expect(first.nextCursors?.[group]).toBeTruthy();
        const second = await getBuildLibraryData(owner, {
          query: marker,
          [`${group}Cursor`]: first.nextCursors![group]!,
        });
        expect(second[group]).toHaveLength(3);
        expect(second.nextCursors?.[group]).toBeNull();
        const returnedIds = [...first[group], ...second[group]].map((build) => build.id);
        expect(returnedIds).toHaveLength(12);
        expect(new Set(returnedIds)).toEqual(expectedIds);
      });
    },
  );

  it("atomically saves v1/v2 and preserves the exact older loadout and notes", async () => {
    await withFixture(async ({ owner }) => {
      const firstLoadout = loadout("First recorded equipment", null);
      const first = await persistBuildMutation(owner, saveInput(firstLoadout));
      expect(first.version).toBe(1);
      const before = await detail(owner, first.id);
      await persistBuildMutation(owner, {
        ...saveInput(loadout("Second recorded equipment", 0)),
        buildId: first.id,
        expectedUpdatedAt: before.updatedAt,
        title: "Updated metadata",
        notes: "Second saved version",
      });
      const latest = await detail(owner, first.id);
      const old = await detail(owner, first.id, 1);
      expect(latest.latestVersion).toBe(2);
      expect(latest.selectedVersion.version).toBe(2);
      expect(latest.selectedVersion.loadout?.entries[0]?.instance.tier).toBe(0);
      expect(old.selectedVersion.loadout).toEqual(firstLoadout);
      expect(old.selectedVersion.notes).toBe("First saved version");
      expect(old.title).toBe("Verification build");
      const audits = await getDb()
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, owner.id));
      expect(audits).toHaveLength(2);
      const serialized = JSON.stringify({
        latest,
        old,
        library: await getBuildLibraryData(owner),
        audits,
      });
      for (const secret of [uid, accessToken, refreshToken])
        expect(serialized).not.toContain(secret);
    });
  });

  it("gates PRIVATE by ownership, HIVE by approved live membership and PUBLIC by current visibility", async () => {
    await withFixture(async ({ owner, other, admin, applicant }) => {
      const privateBuild = await persistBuildMutation(owner, saveInput());
      expect(await getBuildDetailData(other, privateBuild.id)).toBeNull();
      expect(await getBuildDetailData(admin, privateBuild.id)).toBeNull();
      expect(await getBuildDetailData(null, privateBuild.id)).toBeNull();
      const hiveBuild = await persistBuildMutation(owner, saveInput(loadout(), "HIVE"));
      expect(await getBuildDetailData(other, hiveBuild.id)).toBeNull();
      await approve(admin, hiveBuild.id);
      expect(await getBuildDetailData(other, hiveBuild.id)).not.toBeNull();
      expect(await getBuildDetailData(null, hiveBuild.id)).toBeNull();
      expect(await getBuildDetailData(applicant, hiveBuild.id)).toBeNull();
      const publicBuild = await persistBuildMutation(owner, saveInput(loadout(), "PUBLIC"));
      expect(await getBuildDetailData(null, publicBuild.id)).toBeNull();
      await approve(admin, publicBuild.id);
      expect(await getBuildDetailData(null, publicBuild.id)).not.toBeNull();
      const publicLibrary = await getBuildLibraryData(null);
      expect(publicLibrary.owned).toHaveLength(0);
      expect(publicLibrary.hive).toHaveLength(0);
      expect(publicLibrary.public.some((build) => build.id === publicBuild.id)).toBe(true);
      const fixtureIds = [privateBuild.id, hiveBuild.id, publicBuild.id];
      const ownerLibrary = await getBuildLibraryData(owner);
      expect(ownerLibrary.owned.filter((build) => fixtureIds.includes(build.id))).toHaveLength(3);
      expect(ownerLibrary.hive.filter((build) => fixtureIds.includes(build.id))).toMatchObject([
        { id: hiveBuild.id, isOwner: true },
      ]);
      expect(ownerLibrary.public.filter((build) => fixtureIds.includes(build.id))).toMatchObject([
        { id: publicBuild.id, isOwner: true },
      ]);
      const otherLibrary = await getBuildLibraryData(other);
      expect(otherLibrary.hive.filter((build) => fixtureIds.includes(build.id))).toMatchObject([
        { id: hiveBuild.id, isOwner: false },
      ]);
      const applicantLibrary = await getBuildLibraryData(applicant);
      expect(applicantLibrary.owned).toHaveLength(0);
      expect(applicantLibrary.hive).toHaveLength(0);
      expect(applicantLibrary.public.some((build) => build.id === publicBuild.id)).toBe(true);
      await getDb().update(users).set({ role: "GUEST" }).where(eq(users.id, owner.id));
      expect(await getBuildDetailData(null, publicBuild.id)).toBeNull();
      expect(
        (await getBuildLibraryData(null)).public.some((build) => build.id === publicBuild.id),
      ).toBe(false);
    });
  });

  it("shares only the approved submitted version and withdraws every fixed link together", async () => {
    await withFixture(async ({ owner, admin }) => {
      const saved = await persistBuildMutation(owner, saveInput());
      const v1 = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        ...saveInput(),
        buildId: saved.id,
        expectedUpdatedAt: v1.updatedAt,
      });
      const v2 = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        action: "SET_VISIBILITY",
        buildId: saved.id,
        expectedUpdatedAt: v2.updatedAt,
        visibility: "PUBLIC",
      });
      expect(await getBuildDetailData(null, saved.id, 1)).toBeNull();
      expect(await getBuildDetailData(null, saved.id, 2)).toBeNull();
      await approve(admin, saved.id);
      expect(await getBuildDetailData(null, saved.id, 1)).toBeNull();
      expect((await getBuildDetailData(null, saved.id, 2))?.selectedVersion.version).toBe(2);
      await expect(
        persistBuildMutation(owner, {
          action: "SET_VISIBILITY",
          buildId: saved.id,
          expectedUpdatedAt: v2.updatedAt,
          visibility: "HIVE",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const visible = await detail(owner, saved.id);
      await persistBuildMutation(owner, {
        action: "SET_VISIBILITY",
        buildId: saved.id,
        expectedUpdatedAt: visible.updatedAt,
        visibility: "PRIVATE",
      });
      expect(await getBuildDetailData(null, saved.id, 1)).toBeNull();
      expect((await detail(owner, saved.id)).versions).toHaveLength(2);
    });
  });

  it("archives and restores only by owner while retaining all version history", async () => {
    await withFixture(async ({ owner, other, admin }) => {
      const saved = await persistBuildMutation(owner, saveInput(loadout(), "PUBLIC"));
      await approve(admin, saved.id);
      const initial = await detail(owner, saved.id);
      await expect(
        persistBuildMutation(admin, {
          action: "ARCHIVE",
          buildId: saved.id,
          expectedUpdatedAt: initial.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await persistBuildMutation(owner, {
        action: "ARCHIVE",
        buildId: saved.id,
        expectedUpdatedAt: initial.updatedAt,
      });
      const archived = await detail(owner, saved.id);
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.mayEdit).toBe(false);
      expect(archived.versions).toHaveLength(1);
      expect(await getBuildDetailData(null, saved.id)).toBeNull();
      expect((await getBuildLibraryData(owner)).owned.some((build) => build.id === saved.id)).toBe(
        false,
      );
      expect(
        (await getBuildLibraryData(owner, { archived: true })).owned.find(
          (build) => build.id === saved.id,
        )?.archivedAt,
      ).toBeTruthy();
      for (const viewer of [other, admin, null])
        expect(
          (await getBuildLibraryData(viewer, { archived: true })).owned.some(
            (build) => build.id === saved.id,
          ),
        ).toBe(false);
      expect((await getBuildLibraryData(owner)).public.some((build) => build.id === saved.id)).toBe(
        false,
      );
      for (const input of [
        { ...saveInput(), buildId: saved.id, expectedUpdatedAt: archived.updatedAt },
        {
          action: "SET_VISIBILITY",
          buildId: saved.id,
          expectedUpdatedAt: archived.updatedAt,
          visibility: "PUBLIC",
        },
        { action: "ARCHIVE", buildId: saved.id, expectedUpdatedAt: archived.updatedAt },
      ])
        await expect(persistBuildMutation(owner, input)).rejects.toMatchObject({
          code: "ARCHIVED",
        });
      await expect(
        persistBuildMutation(admin, {
          action: "RESTORE",
          buildId: saved.id,
          expectedUpdatedAt: archived.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await persistBuildMutation(owner, {
        action: "RESTORE",
        buildId: saved.id,
        expectedUpdatedAt: archived.updatedAt,
      });
      const restored = await detail(owner, saved.id);
      expect(restored.archivedAt).toBeNull();
      expect(restored.mayEdit).toBe(true);
      expect(restored.versions).toEqual(archived.versions);
      expect((await getBuildLibraryData(owner)).owned.some((build) => build.id === saved.id)).toBe(
        true,
      );
      expect(
        (await getBuildLibraryData(owner, { archived: true })).owned.some(
          (build) => build.id === saved.id,
        ),
      ).toBe(false);
      expect(
        (await getBuildLibraryData(owner)).public.find((build) => build.id === saved.id),
      ).toBeUndefined();
      expect(restored.visibility).toBe("PRIVATE");
      expect(await getBuildDetailData(null, saved.id)).toBeNull();
      await expect(
        persistBuildMutation(owner, {
          action: "RESTORE",
          buildId: saved.id,
          expectedUpdatedAt: restored.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "NOT_ARCHIVED" });
    });
  });

  it("denies stale roles, Mock identities and missing Discord accounts without creating rows", async () => {
    await withFixture(async ({ owner, admin, applicant }) => {
      await expect(persistBuildMutation(null, saveInput())).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      await expect(persistBuildMutation(applicant, saveInput())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        persistBuildMutation({ ...admin, isMock: true }, saveInput()),
      ).rejects.toMatchObject({ code: "MOCK_ACTOR" });
      await getDb().update(users).set({ role: "GUEST" }).where(eq(users.id, admin.id));
      await expect(persistBuildMutation(admin, saveInput())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await getDb().transaction(async (tx) => {
        await tx.execute(
          sql`update ${accounts} set provider = 'verification-missing-discord' where ${accounts.userId} = ${owner.id}`,
        );
      });
      await expect(persistBuildMutation(owner, saveInput())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await getDb().select().from(builds).where(eq(builds.ownerId, owner.id))).toHaveLength(
        0,
      );
    });
  });

  it("checks profile completion privately and never promotes an incomplete actor to edit access", async () => {
    await withFixture(async ({ owner }) => {
      const saved = await persistBuildMutation(owner, saveInput());
      await getDb()
        .update(memberProfiles)
        .set({ onceHumanUid: null })
        .where(eq(memberProfiles.userId, owner.id));
      const existing = await detail(owner, saved.id);
      expect(existing.mayEdit).toBe(false);
      expect(JSON.stringify(existing)).not.toContain(uid);
      await expect(
        persistBuildMutation(owner, {
          ...saveInput(),
          buildId: saved.id,
          expectedUpdatedAt: existing.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "PROFILE_REQUIRED" });
      expect(existing.versions).toHaveLength(1);
    });
  });

  it("rejects invalid snapshots and injected identities before creating a build", async () => {
    await withFixture(async ({ owner }) => {
      const invalid = loadout();
      invalid.entries[0]!.reference = {
        recordId: "not-a-known-record",
        revision: "made-up-revision",
      };
      await expect(persistBuildMutation(owner, saveInput(invalid))).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      await expect(
        persistBuildMutation(owner, { ...saveInput(), ownerId: owner.id }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(await getDb().select().from(builds).where(eq(builds.ownerId, owner.id))).toHaveLength(
        0,
      );
      expect(
        await getDb().select().from(auditLogs).where(eq(auditLogs.actorId, owner.id)),
      ).toHaveLength(0);
    });
  });

  it("rejects a stale save while retaining consecutively numbered immutable versions", async () => {
    await withFixture(async ({ owner }) => {
      const saved = await persistBuildMutation(owner, saveInput());
      const before = await detail(owner, saved.id);
      const update = {
        ...saveInput(loadout("New equipment")),
        buildId: saved.id,
        expectedUpdatedAt: before.updatedAt,
      };
      await persistBuildMutation(owner, update);
      await expect(persistBuildMutation(owner, update)).rejects.toMatchObject({ code: "CONFLICT" });
      const after = await detail(owner, saved.id);
      expect(after.versions.map((version) => version.version)).toEqual([2, 1]);
      expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(
        new Date(before.updatedAt).getTime(),
      );
      expect(after.selectedVersion.loadout?.entries[0]?.name).toBe("New equipment");
    });
  });

  it("preserves unsupported legacy JSON, excludes its raw values, and keeps PostgreSQL immutability", async () => {
    await withFixture(async ({ owner, admin }) => {
      const buildId = randomUUID();
      const versionId = randomUUID();
      await getDb().insert(builds).values({
        id: buildId,
        ownerId: owner.id,
        title: "Legacy verification build",
        visibility: "PUBLIC",
      });
      await getDb()
        .insert(buildVersions)
        .values({
          id: versionId,
          buildId,
          version: 1,
          schemaVersion: "legacy-unrecognized",
          loadoutSnapshot: { onceHumanUid: uid, token: accessToken },
        });
      const legacy = await detail(owner, buildId);
      expect(legacy.selectedVersion.loadout).toBeNull();
      expect(JSON.stringify(await getBuildDetailData(null, buildId))).not.toContain(uid);
      expect(JSON.stringify(legacy)).not.toContain(accessToken);
      const [legacyRequest] = await getDb()
        .insert(buildShareRequests)
        .values({
          buildId,
          buildVersionId: versionId,
          title: "Legacy submitted build",
          description: "",
          requestedVisibility: "PUBLIC",
        })
        .returning({ id: buildShareRequests.id });
      database.actor = admin;
      const review = await getBuildShareReview(legacyRequest.id);
      expect(review?.loadout).toBeNull();
      expect(review?.share).not.toHaveProperty("snapshot");
      expect(JSON.stringify(review)).not.toContain(accessToken);
      expect(JSON.stringify(review)).not.toContain(uid);
      const [request] = await getDb()
        .select()
        .from(buildShareRequests)
        .where(eq(buildShareRequests.id, legacyRequest.id));
      await expect(
        reviewBuildSharing({
          requestId: request.id,
          expectedUpdatedAt: request.updatedAt.toISOString(),
          action: "APPROVE",
        }),
      ).rejects.toThrow("읽을 수 없는 장비 구성");
      await persistBuildMutation(owner, {
        ...saveInput(),
        buildId,
        expectedUpdatedAt: legacy.updatedAt,
      });
      const [preserved] = await getDb()
        .select({ snapshot: buildVersions.loadoutSnapshot })
        .from(buildVersions)
        .where(eq(buildVersions.id, versionId));
      expect(preserved?.snapshot).toEqual({ onceHumanUid: uid, token: accessToken });
      await expect(
        getDb().transaction(async (tx) => {
          await tx
            .update(buildVersions)
            .set({ notes: "Attempted overwrite" })
            .where(eq(buildVersions.id, versionId));
        }),
      ).rejects.toThrow();
      // This deliberately rejected SQL command verifies the trigger, rather than serving as cleanup.
      await expect(
        getDb().transaction(async (tx) => {
          await tx.execute(
            sql`delete from ${buildVersions} where ${buildVersions.id} = ${versionId}`,
          );
        }),
      ).rejects.toThrow();
      expect((await detail(owner, buildId)).versions).toHaveLength(2);
    });
  });

  it("reads an older catalog reference structurally but requires a valid current reference for a new save", async () => {
    await withFixture(async ({ owner }) => {
      const buildId = randomUUID();
      const snapshot = loadout("Historical recorded name");
      snapshot.entries[0]!.reference = {
        recordId: "retired-record",
        revision: `sha256:${"0".repeat(64)}`,
      };
      await getDb()
        .insert(builds)
        .values({ id: buildId, ownerId: owner.id, title: "Historical reference build" });
      await getDb().insert(buildVersions).values({
        buildId,
        version: 1,
        schemaVersion: PLANNER_SCHEMA_VERSION,
        loadoutSnapshot: snapshot,
      });
      const historical = await detail(owner, buildId);
      expect(historical.selectedVersion.loadout).toEqual(snapshot);
      await expect(
        persistBuildMutation(owner, {
          ...saveInput(snapshot),
          buildId,
          expectedUpdatedAt: historical.updatedAt,
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      const manual = structuredClone(snapshot);
      manual.entries[0]!.reference = null;
      await persistBuildMutation(owner, {
        ...saveInput(manual),
        buildId,
        expectedUpdatedAt: historical.updatedAt,
      });
      expect((await detail(owner, buildId, 1)).selectedVersion.loadout).toEqual(snapshot);
    });
  });

  it("excludes metadata without a saved version and rejects invalid route or version parameters", async () => {
    await withFixture(async ({ owner }) => {
      const emptyId = randomUUID();
      await getDb().insert(builds).values({
        id: emptyId,
        ownerId: owner.id,
        title: "No saved version",
        visibility: "PUBLIC",
      });
      expect(await getBuildDetailData(null, emptyId)).toBeNull();
      expect((await getBuildLibraryData(null)).public.some((build) => build.id === emptyId)).toBe(
        false,
      );
      const saved = await persistBuildMutation(owner, saveInput());
      expect(await getBuildDetailData(owner, "not-a-build-id")).toBeNull();
      expect(await getBuildDetailData(owner, saved.id, 0)).toBeNull();
      expect(await getBuildDetailData(owner, saved.id, 1.5)).toBeNull();
      expect(await getBuildDetailData(owner, saved.id, 99)).toBeNull();
    });
  });
});
