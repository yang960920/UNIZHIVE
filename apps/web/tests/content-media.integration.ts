import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createEmptyGearLoadout } from "@uniz/build-engine";
import type { CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({ transaction: null as unknown, guild: "MEMBER" }));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => ({ user: null, status: "GUEST" }),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: boundary.guild }),
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
  communityPosts,
  contentImageReferences,
  contentImages,
  eq,
  getDb,
  users,
} from "@uniz/db";
import {
  bindContentImages,
  normalizeContentImage,
  readContentImage,
  stageContentImage,
} from "../src/lib/server/content-media";
import {
  CONTENT_SCHEMA_VERSION,
  contentImageUrl,
  contentPlainText,
  type ContentDocument,
} from "../src/lib/content-document";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Content media verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Fixture = {
  owner: CurrentUser;
  other: CurrentUser;
  admin: CurrentUser;
  applicant: CurrentUser;
  guest: CurrentUser;
};
class FixtureRollback extends Error {}

async function withFixture(check: (transaction: Transaction, fixture: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const fixture = Object.fromEntries(
    [
      ["owner", "MEMBER"],
      ["other", "MEMBER"],
      ["admin", "ADMIN"],
      ["applicant", "APPLICANT"],
      ["guest", "GUEST"],
    ].map(([name, role]) => [
      name,
      { id: randomUUID(), name: `Content Media ${name}`, role, isMock: false },
    ]),
  ) as Fixture;
  try {
    await actual.getDb().transaction(async (transaction) => {
      boundary.transaction = transaction;
      boundary.guild = "MEMBER";
      for (const actor of Object.values(fixture)) {
        await transaction
          .insert(users)
          .values({ id: actor.id, name: actor.name, role: actor.role });
        await transaction
          .insert(accounts)
          .values({
            userId: actor.id,
            provider: "discord",
            providerAccountId: `content-media-${actor.id}`,
            access_token: "private-content-fixture-token",
          });
      }
      await check(transaction, fixture);
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.transaction = null;
    boundary.guild = "MEMBER";
  }
  for (const actor of Object.values(fixture)) {
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: contentImages.id })
        .from(contentImages)
        .where(eq(contentImages.ownerId, actor.id)),
    ).toHaveLength(0);
  }
}
async function file(color = "#4488cc88", width = 240, height = 120) {
  const source = await sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
  return new File([new Uint8Array(source)], "article.png", { type: "image/png" });
}
function documentWith(...ids: string[]): ContentDocument {
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "이미지 앞의 설명" }] },
      ...ids.map((imageId) => ({ type: "image" as const, attrs: { imageId, alt: "파밍 지도" } })),
      { type: "paragraph", content: [{ type: "text", text: "이미지 뒤의 설명" }] },
    ],
  };
}
async function post(tx: Transaction, owner: CurrentUser, document: ContentDocument) {
  const [row] = await tx
    .insert(communityPosts)
    .values({
      authorId: owner.id,
      category: "GENERAL",
      title: "이미지 본문 검증",
      body: contentPlainText(document),
      bodyDocument: document,
    })
    .returning({ id: communityPosts.id });
  await bindContentImages(tx, owner.id, { postId: row.id }, document);
  return row.id;
}
async function version(tx: Transaction, owner: CurrentUser, document: ContentDocument) {
  const [build] = await tx
    .insert(builds)
    .values({ ownerId: owner.id, title: "이미지 빌드 검증", visibility: "PRIVATE" })
    .returning({ id: builds.id });
  const [row] = await tx
    .insert(buildVersions)
    .values({
      buildId: build.id,
      version: 1,
      schemaVersion: "uniz-gear.v2",
      loadoutSnapshot: createEmptyGearLoadout(),
      title: "이미지 빌드 검증",
      description: contentPlainText(document),
      bodyDocument: document,
    })
    .returning({ id: buildVersions.id });
  await bindContentImages(tx, owner.id, { buildVersionId: row.id }, document);
  return { buildId: build.id, versionId: row.id };
}
async function request(
  tx: Transaction,
  fixture: Fixture,
  target: { buildId: string; versionId: string },
  visibility: "HIVE" | "PUBLIC",
  status: "PENDING" | "APPROVED" = "APPROVED",
) {
  const [row] = await tx
    .insert(buildShareRequests)
    .values({
      buildId: target.buildId,
      buildVersionId: target.versionId,
      title: "이미지 빌드 검증",
      requestedVisibility: visibility,
      status,
      ...(status === "APPROVED" ? { reviewerId: fixture.admin.id, reviewedAt: new Date() } : {}),
    })
    .returning({ id: buildShareRequests.id });
  if (status === "APPROVED")
    await tx.insert(buildPublications).values({ buildId: target.buildId, requestId: row.id });
  return row.id;
}

describe("article images against local PostgreSQL with full rollback", () => {
  it("decodes a real transparent file, stages private pixels, deduplicates per owner and binds the editor image ID to a post", async () => {
    await withFixture(async (tx, { owner, other, applicant, guest }) => {
      const imageFile = await file();
      const asset = await stageContentImage(owner, imageFile);
      expect(asset).toEqual({
        id: expect.any(String),
        url: contentImageUrl(asset.id),
        width: 240,
        height: 120,
      });
      expect((await stageContentImage(owner, imageFile)).id).toBe(asset.id);
      expect((await stageContentImage(other, imageFile)).id).not.toBe(asset.id);
      const [stored] = await tx.select().from(contentImages).where(eq(contentImages.id, asset.id));
      expect(stored.content.length).toBeLessThanOrEqual(512 * 1024);
      expect(stored.revision).toMatch(/^[a-f0-9]{64}$/);
      const metadata = await sharp(Buffer.from(stored.content)).metadata();
      expect(metadata).toMatchObject({ format: "webp", width: 240, height: 120, hasAlpha: true });
      expect(metadata.exif).toBeUndefined();
      expect(await readContentImage(owner, asset.id)).toEqual(Buffer.from(stored.content));
      for (const reader of [null, other, applicant, guest])
        expect(await readContentImage(reader, asset.id)).toBeNull();
      const document = documentWith(asset.id);
      const postId = await post(tx, owner, document);
      expect(
        await tx
          .select({ imageId: contentImageReferences.imageId })
          .from(contentImageReferences)
          .where(eq(contentImageReferences.postId, postId)),
      ).toEqual([{ imageId: asset.id }]);
      expect(await readContentImage(other, asset.id)).toEqual(Buffer.from(stored.content));
      expect(await readContentImage(null, asset.id)).toBeNull();
      expect(JSON.stringify(document)).not.toContain("blob:");
      expect(JSON.stringify(asset)).not.toContain("private-content-fixture-token");
    });
  });

  it("refuses guessed or somebody else's image IDs and preserves references to historical versions when a post image is removed", async () => {
    await withFixture(async (tx, { owner, other }) => {
      const asset = await stageContentImage(owner, await file());
      const document = documentWith(asset.id);
      const postId = await post(tx, owner, document);
      const build = await version(tx, owner, document);
      const [otherPost] = await tx
        .insert(communityPosts)
        .values({
          authorId: other.id,
          category: "GENERAL",
          title: "다른 멤버 글",
          body: "독립된 글",
        })
        .returning({ id: communityPosts.id });
      await expect(
        bindContentImages(tx, other.id, { postId: otherPost.id }, document),
      ).rejects.toThrow("등록 계정");
      await expect(
        bindContentImages(tx, owner.id, { postId }, documentWith(randomUUID())),
      ).rejects.toThrow("등록 계정");
      expect(
        await tx
          .select({ imageId: contentImageReferences.imageId })
          .from(contentImageReferences)
          .where(eq(contentImageReferences.postId, postId)),
      ).toEqual([{ imageId: asset.id }]);
      await bindContentImages(tx, owner.id, { postId }, null);
      expect(
        await tx
          .select({ imageId: contentImageReferences.imageId })
          .from(contentImageReferences)
          .where(eq(contentImageReferences.postId, postId)),
      ).toHaveLength(0);
      expect(
        await tx
          .select({ imageId: contentImageReferences.imageId })
          .from(contentImageReferences)
          .where(eq(contentImageReferences.buildVersionId, build.versionId)),
      ).toEqual([{ imageId: asset.id }]);
      expect(
        await tx
          .select({ id: contentImages.id })
          .from(contentImages)
          .where(eq(contentImages.id, asset.id)),
      ).toHaveLength(1);
    });
  });

  it("allows an anonymous, applicant or guest to read only approved PUBLIC images while ADMIN can review an explicitly submitted version", async () => {
    await withFixture(async (tx, fixture) => {
      const asset = await stageContentImage(fixture.owner, await file());
      const bytes = await readContentImage(fixture.owner, asset.id);
      const target = await version(tx, fixture.owner, documentWith(asset.id));
      for (const reader of [null, fixture.other, fixture.admin, fixture.applicant, fixture.guest])
        expect(await readContentImage(reader, asset.id)).toBeNull();
      const requestId = await request(tx, fixture, target, "PUBLIC", "PENDING");
      expect(await readContentImage(fixture.admin, asset.id)).toEqual(bytes);
      for (const reader of [null, fixture.other, fixture.applicant, fixture.guest])
        expect(await readContentImage(reader, asset.id)).toBeNull();
      await tx
        .update(buildShareRequests)
        .set({ status: "APPROVED", reviewerId: fixture.admin.id, reviewedAt: new Date() })
        .where(eq(buildShareRequests.id, requestId));
      await tx.insert(buildPublications).values({ buildId: target.buildId, requestId });
      for (const reader of [null, fixture.other, fixture.applicant, fixture.guest])
        expect(await readContentImage(reader, asset.id)).toEqual(bytes);
      await tx.update(users).set({ role: "GUEST" }).where(eq(users.id, fixture.other.id));
      expect(await readContentImage(fixture.other, asset.id)).toEqual(bytes);
      await tx.delete(accounts).where(eq(accounts.userId, fixture.other.id));
      expect(await readContentImage(fixture.other, asset.id)).toEqual(bytes);
      expect(await readContentImage({ ...fixture.other, isMock: true }, asset.id)).toBeNull();
      await tx.delete(buildPublications).where(eq(buildPublications.buildId, target.buildId));
      for (const reader of [null, fixture.other, fixture.applicant, fixture.guest])
        expect(await readContentImage(reader, asset.id)).toBeNull();
    });
  });

  it("requires a fresh approved and connected member for HIVE images and blocks sharing when the owner disconnects or the build is archived", async () => {
    await withFixture(async (tx, fixture) => {
      const asset = await stageContentImage(fixture.owner, await file());
      const bytes = await readContentImage(fixture.owner, asset.id);
      const target = await version(tx, fixture.owner, documentWith(asset.id));
      await request(tx, fixture, target, "HIVE");
      expect(await readContentImage(fixture.other, asset.id)).toEqual(bytes);
      for (const reader of [null, fixture.applicant, fixture.guest])
        expect(await readContentImage(reader, asset.id)).toBeNull();
      await tx.update(users).set({ role: "GUEST" }).where(eq(users.id, fixture.other.id));
      expect(await readContentImage(fixture.other, asset.id)).toBeNull();
      await tx.update(builds).set({ archivedAt: new Date() }).where(eq(builds.id, target.buildId));
      expect(await readContentImage(fixture.applicant, asset.id)).toBeNull();
      await tx.update(builds).set({ archivedAt: null }).where(eq(builds.id, target.buildId));
      await tx.delete(accounts).where(eq(accounts.userId, fixture.owner.id));
      expect(await readContentImage(null, asset.id)).toBeNull();
      expect(await readContentImage(fixture.other, asset.id)).toBeNull();
    });
  });

  it("rejects staged writes from unapproved, mock, stale-role and disconnected accounts without changing stored images", async () => {
    await withFixture(async (tx, fixture) => {
      const imageFile = await file();
      const asset = await stageContentImage(fixture.owner, imageFile);
      for (const actor of [fixture.applicant, fixture.guest, { ...fixture.owner, isMock: true }])
        await expect(stageContentImage(actor, imageFile)).rejects.toThrow("실제 계정");
      for (const guild of ["LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"]) {
        boundary.guild = guild;
        await expect(stageContentImage(fixture.owner, imageFile)).rejects.toThrow("Discord 연결");
      }
      boundary.guild = "MEMBER";
      await tx.update(users).set({ role: "GUEST" }).where(eq(users.id, fixture.owner.id));
      await expect(stageContentImage(fixture.owner, imageFile)).rejects.toThrow("승인된 Discord");
      expect(await readContentImage(fixture.owner, asset.id)).toBeNull();
      expect(
        await tx
          .select({ id: contentImages.id })
          .from(contentImages)
          .where(eq(contentImages.ownerId, fixture.owner.id)),
      ).toEqual([{ id: asset.id }]);
    });
  });

  it("cleans only the owner's expired unreferenced uploads and retains recent deduplicated or historically referenced assets", async () => {
    await withFixture(async (tx, { owner, other }) => {
      const stale = new Date(Date.now() - 49 * 60 * 60 * 1000);
      const recentlyUsed = new Date(Date.now() - 60 * 1000);
      const first = await normalizeContentImage(await file("red"));
      const second = await normalizeContentImage(await file("blue"));
      const third = await normalizeContentImage(await file("green"));
      const [abandoned] = await tx
        .insert(contentImages)
        .values({ ownerId: owner.id, ...first, createdAt: stale, updatedAt: stale })
        .returning({ id: contentImages.id });
      const [referenced] = await tx
        .insert(contentImages)
        .values({ ownerId: owner.id, ...second, createdAt: stale, updatedAt: stale })
        .returning({ id: contentImages.id });
      const [reused] = await tx
        .insert(contentImages)
        .values({ ownerId: owner.id, ...third, createdAt: stale, updatedAt: recentlyUsed })
        .returning({ id: contentImages.id });
      const [otherAbandoned] = await tx
        .insert(contentImages)
        .values({ ownerId: other.id, ...first, createdAt: stale, updatedAt: stale })
        .returning({ id: contentImages.id });
      await version(tx, owner, documentWith(referenced.id));
      expect((await stageContentImage(owner, await file("green"))).id).toBe(reused.id);
      await stageContentImage(owner, await file("yellow"));
      const retained = await tx
        .select({ id: contentImages.id })
        .from(contentImages)
        .where(eq(contentImages.ownerId, owner.id));
      expect(retained.map((row) => row.id)).not.toContain(abandoned.id);
      expect(retained.map((row) => row.id)).toEqual(
        expect.arrayContaining([referenced.id, reused.id]),
      );
      expect(
        await tx
          .select({ id: contentImages.id })
          .from(contentImages)
          .where(eq(contentImages.id, otherAbandoned.id)),
      ).toHaveLength(1);
    });
  });
});
