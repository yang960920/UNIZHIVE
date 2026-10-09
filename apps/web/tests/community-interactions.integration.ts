import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  guild: "MEMBER",
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: boundary.guild }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});
import {
  accounts,
  auditLogs,
  buildLikes,
  buildPublications,
  builds,
  buildShareRequests,
  buildVersions,
  communityCommentLikes,
  communityComments,
  communityPostLikes,
  communityPosts,
  contentImageReferences,
  contentImages,
  eq,
  getDb,
  memberProfiles,
  memberProfileImages,
  users,
} from "@uniz/db";
import {
  archiveCommunityComment,
  getCommunityDirectory,
  getCommunityEditorData,
  getCommunityPost,
  moderateCommunityComment,
  moderateCommunityPost,
  saveCommunityComment,
  saveCommunityPost,
  saveAnnouncement,
  getAnnouncement,
} from "../src/lib/server/community-repository";
import { getBuildLikeSummaries, setReaction } from "../src/lib/server/reactions";
import { getPersonalNotifications } from "../src/lib/server/personal-notifications";
import { normalizeContentImage, readContentImage } from "../src/lib/server/content-media";
import { normalizeProfileImage } from "../src/lib/server/profile-image-processing";
import { readProfileImage } from "../src/lib/server/profile-images";
import { type ContentDocument } from "../src/lib/content-document";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw Error("Interaction verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Fixture = {
  owner: CurrentUser;
  other: CurrentUser;
  third: CurrentUser;
  admin: CurrentUser;
  applicant: CurrentUser;
};
class FixtureRollback extends Error {}
function authenticate(user: CurrentUser) {
  boundary.state = { user, status: "AUTHENTICATED" };
}
async function fixture(check: (transaction: Transaction, actors: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const actors = Object.fromEntries(
    [
      ["owner", "MEMBER"],
      ["other", "MEMBER"],
      ["third", "MEMBER"],
      ["admin", "ADMIN"],
      ["applicant", "APPLICANT"],
    ].map(([name, role]) => [
      name,
      { id: randomUUID(), name: `Interactions ${name}`, role, isMock: false },
    ]),
  ) as Fixture;
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      boundary.guild = "MEMBER";
      for (const actor of Object.values(actors)) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `interaction-${actor.id}`,
          access_token: "private-interaction-token",
        });
        await tx.insert(memberProfiles).values({
          userId: actor.id,
          handle: `in_${actor.id.replaceAll("-", "").slice(0, 16)}`,
          displayName: actor.name,
          onceHumanNickname: "테스트 캐릭터",
          onceHumanUid: "private-interaction-uid",
        });
      }
      authenticate(actors.owner);
      await check(tx, actors);
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
    boundary.guild = "MEMBER";
  }
  for (const actor of Object.values(actors)) {
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, actor.id)),
    ).toHaveLength(0);
  }
}
const input = (title = `게시글-${randomUUID()}`) => ({
  title,
  body: "하이브 경험을 공유합니다.",
  category: "GENERAL" as const,
  buildVersionId: null,
  isPinned: false,
});
async function version(tx: Transaction, id: string, comment = false) {
  const table = comment ? communityComments : communityPosts;
  const [row] = await tx.select({ updatedAt: table.updatedAt }).from(table).where(eq(table.id, id));
  return row.updatedAt.toISOString();
}
async function detail(postId: string, query: Parameters<typeof getCommunityPost>[1] = {}) {
  const result = await getCommunityPost(postId, query);
  expect(result.mode).toBe("LIVE");
  if (result.mode !== "LIVE" || !result.data) throw Error("Missing authorized thread");
  return result.data;
}
async function publishedBuild(tx: Transaction, f: Fixture) {
  const [build] = await tx
    .insert(builds)
    .values({ ownerId: f.owner.id, title: "공개되면 안 되는 초안", visibility: "PRIVATE" })
    .returning();
  const [version] = await tx
    .insert(buildVersions)
    .values({ buildId: build.id, version: 1, schemaVersion: "uniz-gear.v2", loadoutSnapshot: {} })
    .returning();
  const [request] = await tx
    .insert(buildShareRequests)
    .values({
      buildId: build.id,
      buildVersionId: version.id,
      title: "승인된 빌드 제목",
      description: "승인된 설명",
      requestedVisibility: "PUBLIC",
      status: "APPROVED",
      reviewerId: f.admin.id,
      reviewedAt: new Date(),
    })
    .returning();
  await tx.insert(buildPublications).values({ buildId: build.id, requestId: request.id });
  return { build, version, request };
}

describe("community replies, reactions and content against local PostgreSQL", () => {
  it("separates paginated board and showcase sections while preserving staff management and text search", async () => {
    await fixture(async (tx, f) => {
      const prefix = `구역검증-${randomUUID()}`;
      const rows = await tx
        .insert(communityPosts)
        .values(
          (["TIP", "SHOWCASE"] as const).flatMap((category) =>
            Array.from({ length: 23 }, (_, index) => ({
              authorId: f.owner.id,
              category,
              title: `${prefix}-${category}-${index}`,
              body: `${prefix}-${category}-본문검색`,
            })),
          ),
        )
        .returning({
          id: communityPosts.id,
          category: communityPosts.category,
          title: communityPosts.title,
        });
      authenticate(f.other);
      const sectionIds = new Map<string, string[]>();
      for (const section of ["BOARD", "SHOWCASE"] as const) {
        const first = await getCommunityDirectory({ q: prefix, section });
        const second = await getCommunityDirectory({ q: prefix, section, page: 2 });
        if (first.mode !== "LIVE" || second.mode !== "LIVE") throw Error("Missing section pages");
        expect(first.data.section).toBe(section);
        expect(first.data.posts).toHaveLength(20);
        expect(first.data.pagination).toMatchObject({ totalCount: 23, hasNextPage: true });
        expect(second.data.posts).toHaveLength(3);
        expect(second.data.pagination).toMatchObject({
          page: 2,
          totalCount: 23,
          hasNextPage: false,
        });
        const posts = [...first.data.posts, ...second.data.posts];
        expect(
          posts.every((post) => post.category === (section === "BOARD" ? "TIP" : "SHOWCASE")),
        ).toBe(true);
        sectionIds.set(
          section,
          posts.map((post) => post.id),
        );
        expect(new Set(posts.map((post) => post.id)).size).toBe(23);
      }
      expect(sectionIds.get("BOARD")!.some((id) => sectionIds.get("SHOWCASE")!.includes(id))).toBe(
        false,
      );
      const defaultBoard = await getCommunityDirectory({ q: prefix, category: "SHOWCASE" });
      if (defaultBoard.mode !== "LIVE") throw Error("Missing default board");
      expect(defaultBoard.data).toMatchObject({ section: "BOARD", category: null });
      expect(defaultBoard.data.posts.every((post) => post.category !== "SHOWCASE")).toBe(true);
      const boardSearch = await getCommunityDirectory({ q: `${prefix}-SHOWCASE-본문검색` });
      const showcaseSearch = await getCommunityDirectory({
        q: `${prefix}-SHOWCASE-본문검색`,
        section: "SHOWCASE",
        category: "TIP",
      });
      if (boardSearch.mode !== "LIVE" || showcaseSearch.mode !== "LIVE")
        throw Error("Missing section search");
      expect(boardSearch.data.pagination.totalCount).toBe(0);
      expect(showcaseSearch.data).toMatchObject({
        category: "SHOWCASE",
        pagination: { totalCount: 23 },
      });
      for (const category of ["TIP", "SHOWCASE"]) {
        await tx
          .update(communityPosts)
          .set({ hiddenAt: new Date() })
          .where(eq(communityPosts.id, rows.find((row) => row.category === category)!.id));
      }
      const unprivilegedManagement = await getCommunityDirectory({
        q: prefix,
        includeModerated: true,
      });
      const visibleShowcase = await getCommunityDirectory({ q: prefix, section: "SHOWCASE" });
      if (unprivilegedManagement.mode !== "LIVE" || visibleShowcase.mode !== "LIVE")
        throw Error("Missing visible section lists");
      expect(unprivilegedManagement.data.pagination.totalCount).toBe(22);
      expect(visibleShowcase.data.pagination.totalCount).toBe(22);
      expect(
        unprivilegedManagement.data.posts.every(
          (post) => !post.hiddenAt && post.category !== "SHOWCASE",
        ),
      ).toBe(true);
      authenticate(f.admin);
      const management = await getCommunityDirectory({ q: prefix, includeModerated: true });
      const filteredManagement = await getCommunityDirectory({
        q: prefix,
        category: "SHOWCASE",
        includeModerated: true,
      });
      if (management.mode !== "LIVE" || filteredManagement.mode !== "LIVE")
        throw Error("Missing staff management");
      expect(management.data.pagination.totalCount).toBe(46);
      expect(filteredManagement.data.pagination.totalCount).toBe(23);
      expect(filteredManagement.data.posts.every((post) => post.category === "SHOWCASE")).toBe(
        true,
      );
      const hidden = rows.find((row) => row.category === "SHOWCASE")!;
      const managedHidden = await getCommunityDirectory({
        q: hidden.title,
        includeModerated: true,
      });
      if (managedHidden.mode !== "LIVE") throw Error("Missing managed hidden showcase");
      expect(managedHidden.data.posts[0]).toMatchObject({ id: hidden.id, canModerate: true });
      expect(managedHidden.data.posts[0].hiddenAt).not.toBeNull();
    });
  });
  it("saves searchable showcase photos and exposes only authorized preview metadata", async () => {
    await fixture(async (tx, f) => {
      const png = await sharp({
        create: { width: 16, height: 12, channels: 4, background: "#22ddaa" },
      })
        .png()
        .toBuffer();
      const image = await normalizeContentImage(
        new File([new Uint8Array(png)], "showcase.png", { type: "image/png" }),
      );
      const [asset] = await tx
        .insert(contentImages)
        .values({ ownerId: f.owner.id, ...image })
        .returning();
      const title = `사진자랑-${randomUUID()}`;
      const doc: ContentDocument = {
        schemaVersion: "uniz-content.v1",
        type: "doc",
        content: [
          { type: "image", attrs: { imageId: asset.id, alt: "테라스" } },
          { type: "paragraph", content: [{ type: "text", text: "짧은 자랑 설명" }] },
        ],
      };
      const post = await saveCommunityPost({
        ...input(title),
        category: "SHOWCASE",
        bodyDocument: doc,
      });
      authenticate(f.other);
      const directory = await getCommunityDirectory({ q: title, section: "SHOWCASE" });
      if (directory.mode !== "LIVE") throw Error("Missing showcase directory");
      expect(directory.data.category).toBe("SHOWCASE");
      expect(directory.data.section).toBe("SHOWCASE");
      expect(directory.data.posts).toHaveLength(1);
      expect(directory.data.posts[0]).toMatchObject({
        id: post.id,
        excerpt: "짧은 자랑 설명",
        coverImage: { url: `/api/content/image/${asset.id}`, alt: "테라스" },
        imageCount: 1,
      });
      expect(JSON.stringify(directory)).not.toMatch(
        /bodyDocument|"content":|private-interaction-(uid|token)/,
      );
      expect(await readContentImage(f.other, asset.id)).toEqual(image.content);
      expect(await readContentImage(null, asset.id)).toBeNull();
      authenticate(f.admin);
      await moderateCommunityPost({
        id: post.id,
        expectedUpdatedAt: await version(tx, post.id),
        action: "HIDE",
      });
      authenticate(f.other);
      const hidden = await getCommunityDirectory({ q: title, section: "SHOWCASE" });
      if (hidden.mode !== "LIVE") throw Error("Missing showcase directory");
      expect(hidden.data.posts).toHaveLength(0);
      expect(await readContentImage(f.other, asset.id)).toBeNull();
    });
  });
  it("omits image-only excerpts while preserving storage, search, image binding and legacy text fallbacks", async () => {
    await fixture(async (tx, f) => {
      const png = await sharp({
        create: { width: 12, height: 12, channels: 4, background: "#22ddaa" },
      })
        .png()
        .toBuffer();
      const image = await normalizeContentImage(
        new File([new Uint8Array(png)], "excerpt.png", { type: "image/png" }),
      );
      const [asset] = await tx
        .insert(contentImages)
        .values({ ownerId: f.owner.id, ...image })
        .returning();
      const prefix = `요약검증-${randomUUID()}`;
      const imageOnly: ContentDocument = {
        schemaVersion: "uniz-content.v1",
        type: "doc",
        content: [{ type: "image", attrs: { imageId: asset.id, alt: "" } }],
      };
      const photos = [];
      for (const category of ["SHOWCASE", "GENERAL"] as const) {
        photos.push(
          await saveCommunityPost({
            ...input(`${prefix}-${category}`),
            category,
            bodyDocument: imageOnly,
          }),
        );
      }
      const legacy = await saveCommunityPost({
        ...input(`${prefix}-기존`),
        body: "기존 본문 요약",
      });
      const damaged = await saveCommunityPost({
        ...input(`${prefix}-손상`),
        category: "SHOWCASE",
        body: "손상 문서의 기존 텍스트",
      });
      await tx
        .update(communityPosts)
        .set({ bodyDocument: { type: "unsupported" } })
        .where(eq(communityPosts.id, damaged.id));
      authenticate(f.other);
      const directory = await getCommunityDirectory({ q: prefix });
      const showcase = await getCommunityDirectory({ q: prefix, section: "SHOWCASE" });
      if (directory.mode !== "LIVE" || showcase.mode !== "LIVE")
        throw Error("Missing excerpt directory");
      const summaries = [...directory.data.posts, ...showcase.data.posts];
      expect(directory.data.posts).toHaveLength(2);
      expect(showcase.data.posts).toHaveLength(2);
      for (const photo of photos) {
        const summary = summaries.find((row) => row.id === photo.id)!;
        expect(summary.excerpt).toBe("");
        const saved = await detail(photo.id);
        expect(saved.post.body).toBe("[이미지]");
        expect(saved.post.bodyDocument).toEqual(imageOnly);
        expect(
          await tx
            .select({ imageId: contentImageReferences.imageId })
            .from(contentImageReferences)
            .where(eq(contentImageReferences.postId, photo.id)),
        ).toEqual([{ imageId: asset.id }]);
      }
      expect(summaries.find((row) => row.id === photos[0].id)?.coverImage?.url).toBe(
        `/api/content/image/${asset.id}`,
      );
      expect(summaries.find((row) => row.id === legacy.id)?.excerpt).toBe("기존 본문 요약");
      expect(summaries.find((row) => row.id === damaged.id)).toMatchObject({
        excerpt: "손상 문서의 기존 텍스트",
        coverImage: null,
        imageCount: 0,
      });
      const mirroredSearch = await getCommunityDirectory({ q: "[이미지]" });
      const showcaseSearch = await getCommunityDirectory({ q: "[이미지]", section: "SHOWCASE" });
      if (mirroredSearch.mode !== "LIVE" || showcaseSearch.mode !== "LIVE")
        throw Error("Missing stored mirror search");
      expect(
        [...mirroredSearch.data.posts, ...showcaseSearch.data.posts].map((row) => row.id),
      ).toEqual(expect.arrayContaining(photos.map((photo) => photo.id)));
      expect(await readContentImage(f.other, asset.id)).toEqual(image.content);
    });
  });
  it("connects current custom avatars to posts, replies and notices without exposing bytes or deleted-parent identities", async () => {
    await fixture(async (tx, f) => {
      const source = await sharp({
        create: { width: 24, height: 24, channels: 4, background: "#22ddaa" },
      })
        .png()
        .toBuffer();
      const normalized = await normalizeProfileImage(
        new File([new Uint8Array(source)], "profile.png", { type: "image/png" }),
      );
      const images = await tx
        .insert(memberProfileImages)
        .values([f.owner, f.other, f.admin].map((actor) => ({ userId: actor.id, ...normalized })))
        .returning({ id: memberProfileImages.id, userId: memberProfileImages.userId });
      const imageUrl = (userId: string) =>
        `/api/profile/image/${images.find((image) => image.userId === userId)!.id}?v=${normalized.revision}`;
      const title = `프로필조회-${randomUUID()}`;
      const post = await saveCommunityPost(input(title));
      const root = await saveCommunityComment({ postId: post.id, body: "삭제 전 댓글" });
      authenticate(f.other);
      await saveCommunityComment({ postId: post.id, parentId: root.id, body: "프로필 답글" });
      authenticate(f.admin);
      const notice = await saveAnnouncement({
        title: "프로필 공지",
        content: "공지 내용",
        isPinned: false,
      });
      authenticate(f.third);
      const data = await detail(post.id);
      expect(data.post.id).toBe(post.id);
      expect(data.post.author.imageUrl).toBe(imageUrl(f.owner.id));
      expect(data.comments[0].author.imageUrl).toBe(imageUrl(f.owner.id));
      expect(data.comments[0].replies?.[0].author.imageUrl).toBe(imageUrl(f.other.id));
      const directory = await getCommunityDirectory({ q: title });
      if (directory.mode !== "LIVE") throw Error("Missing author directory");
      expect(directory.data.posts.find((item) => item.id === post.id)?.author.imageUrl).toBe(
        imageUrl(f.owner.id),
      );
      const announcement = await getAnnouncement(notice.id);
      if (announcement.mode !== "LIVE") throw Error("Missing author announcement");
      expect(announcement.data?.author.imageUrl).toBe(imageUrl(f.admin.id));
      expect(
        await readProfileImage(
          f.third,
          images.find((image) => image.userId === f.owner.id)!.id,
          normalized.revision,
        ),
      ).toEqual(normalized.content);
      expect(JSON.stringify(data)).not.toMatch(
        /private-interaction-(uid|token)|authorAvatarId|authorAvatarRevision|"content":/,
      );
      authenticate(f.owner);
      await archiveCommunityComment({
        id: root.id,
        expectedUpdatedAt: await version(tx, root.id, true),
      });
      authenticate(f.third);
      expect((await detail(post.id)).comments[0].author).toEqual({
        id: "",
        name: "삭제된 댓글",
        handle: null,
        imageUrl: null,
      });
      await tx.delete(memberProfileImages).where(eq(memberProfileImages.userId, f.owner.id));
      expect((await detail(post.id)).post.author.imageUrl).toBeNull();
      expect((await detail(post.id)).comments[0].replies?.[0].author.imageUrl).toBe(
        imageUrl(f.other.id),
      );
    });
  });
  it("adds exactly one reply level, preserves ownership on edits and blocks cross-post reparenting", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      const another = await saveCommunityPost(input());
      const root = await saveCommunityComment({ postId: post.id, body: "질문 댓글" });
      authenticate(f.other);
      const reply = await saveCommunityComment({
        postId: post.id,
        parentId: root.id,
        body: "답글 내용",
      });
      expect((await detail(post.id)).comments[0].replies?.[0]).toMatchObject({
        id: reply.id,
        parentId: root.id,
        canReply: false,
        canLike: true,
      });
      await expect(
        saveCommunityComment({ postId: post.id, parentId: reply.id, body: "두 단계 답글" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        saveCommunityComment({ postId: another.id, parentId: root.id, body: "다른 게시글 답글" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        saveCommunityComment({
          id: reply.id,
          postId: post.id,
          parentId: null,
          body: "부모 변경",
          expectedUpdatedAt: await version(tx, reply.id, true),
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await saveCommunityComment({
        id: reply.id,
        postId: post.id,
        parentId: root.id,
        body: "변경된 답글",
        expectedUpdatedAt: await version(tx, reply.id, true),
      });
      authenticate(f.owner);
      await expect(
        saveCommunityComment({
          id: reply.id,
          postId: post.id,
          body: "타인 수정",
          expectedUpdatedAt: await version(tx, reply.id, true),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await detail(post.id)).comments[0].replies?.[0].body).toBe("변경된 답글");
    });
  });

  it("keeps replies after parent deletion without exposing its body or author and prevents new replies", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      const root = await saveCommunityComment({
        postId: post.id,
        body: "deleted-parent-private-body",
      });
      authenticate(f.other);
      const reply = await saveCommunityComment({
        postId: post.id,
        parentId: root.id,
        body: "남아야 하는 답글",
      });
      authenticate(f.owner);
      await archiveCommunityComment({
        id: root.id,
        expectedUpdatedAt: await version(tx, root.id, true),
      });
      authenticate(f.third);
      const data = await detail(post.id);
      expect(data.comments[0]).toMatchObject({
        isPlaceholder: true,
        body: "",
        author: { id: "", handle: null },
        canReply: false,
        canLike: false,
      });
      expect(data.comments[0].replies?.[0]).toMatchObject({
        id: reply.id,
        body: "남아야 하는 답글",
        canLike: true,
      });
      expect(JSON.stringify(data)).not.toContain("deleted-parent-private-body");
      await expect(
        saveCommunityComment({ postId: post.id, parentId: root.id, body: "삭제 뒤 답글" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(
        await setReaction({ kind: "COMMUNITY_COMMENT", targetId: reply.id, liked: true }),
      ).toEqual({ likeCount: 1, likedByMe: true });
      authenticate(f.admin);
      expect((await detail(post.id)).comments[0].body).toBe("deleted-parent-private-body");
    });
  });

  it("hides an entire moderated parent thread from peers and blocks reacting to its replies", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      const root = await saveCommunityComment({ postId: post.id, body: "숨길 댓글" });
      authenticate(f.other);
      const reply = await saveCommunityComment({
        postId: post.id,
        parentId: root.id,
        body: "함께 숨길 답글",
      });
      authenticate(f.admin);
      await moderateCommunityComment({
        id: root.id,
        expectedUpdatedAt: await version(tx, root.id, true),
        action: "HIDE",
      });
      authenticate(f.third);
      expect((await detail(post.id)).comments).toHaveLength(0);
      await expect(
        setReaction({ kind: "COMMUNITY_COMMENT", targetId: reply.id, liked: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      authenticate(f.owner);
      expect((await detail(post.id)).comments[0].replies).toHaveLength(0);
      authenticate(f.admin);
      expect((await detail(post.id)).comments[0].replies).toHaveLength(1);
    });
  });

  it("bounds each thread to ten replies and focuses an older root/reply on the correct pages", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      const base = Date.now() - 86400000;
      const roots = await tx
        .insert(communityComments)
        .values(
          Array.from({ length: 22 }, (_, index) => ({
            postId: post.id,
            authorId: f.owner.id,
            body: `최상위 ${index}`,
            createdAt: new Date(base + index * 1000),
          })),
        )
        .returning();
      const replies = await tx
        .insert(communityComments)
        .values(
          roots.flatMap((root) =>
            Array.from({ length: 12 }, (_, index) => ({
              postId: post.id,
              parentId: root.id,
              authorId: f.other.id,
              body: `답글 ${index}`,
              createdAt: new Date(base + 40000 + index * 1000),
            })),
          ),
        )
        .returning();
      const first = await detail(post.id);
      expect(first.comments).toHaveLength(20);
      expect(
        first.comments.every(
          (root) => root.replies?.length === 10 && root.replyPagination?.totalCount === 12,
        ),
      ).toBe(true);
      expect((await detail(post.id, { commentPage: 2 })).comments).toHaveLength(2);
      const lastReply = replies.filter((reply) => reply.parentId === roots[0].id).at(-1)!;
      const focused = await detail(post.id, { replyRoot: roots[0].id, replyTarget: lastReply.id });
      expect(focused.commentPagination.page).toBe(2);
      const focusedRoot = focused.comments.find((root) => root.id === roots[0].id)!;
      expect(focusedRoot.replyPagination?.page).toBe(2);
      expect(focusedRoot.replies?.map((reply) => reply.id)).toContain(lastReply.id);
    });
  });

  it("makes post, comment, reply and published-build likes idempotent without changing content versions", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      const root = await saveCommunityComment({ postId: post.id, body: "좋아요 댓글" });
      const reply = await saveCommunityComment({
        postId: post.id,
        parentId: root.id,
        body: "좋아요 답글",
      });
      const published = await publishedBuild(tx, f);
      const before = [
        await version(tx, post.id),
        await version(tx, root.id, true),
        await version(tx, reply.id, true),
        published.build.updatedAt.toISOString(),
      ];
      const targets = [
        { kind: "COMMUNITY_POST", targetId: post.id },
        { kind: "COMMUNITY_COMMENT", targetId: root.id },
        { kind: "COMMUNITY_COMMENT", targetId: reply.id },
        { kind: "BUILD", targetId: published.build.id },
      ];
      for (const target of targets) {
        authenticate(f.other);
        expect(await setReaction({ ...target, liked: true })).toEqual({
          likeCount: 1,
          likedByMe: true,
        });
        expect(await setReaction({ ...target, liked: true })).toEqual({
          likeCount: 1,
          likedByMe: true,
        });
        authenticate(f.third);
        expect(await setReaction({ ...target, liked: true })).toEqual({
          likeCount: 2,
          likedByMe: true,
        });
        authenticate(f.other);
        expect(await setReaction({ ...target, liked: false })).toEqual({
          likeCount: 1,
          likedByMe: false,
        });
        expect(await setReaction({ ...target, liked: false })).toEqual({
          likeCount: 1,
          likedByMe: false,
        });
      }
      expect(await version(tx, post.id)).toBe(before[0]);
      expect(await version(tx, root.id, true)).toBe(before[1]);
      expect(await version(tx, reply.id, true)).toBe(before[2]);
      const [build] = await tx
        .select({ updatedAt: builds.updatedAt })
        .from(builds)
        .where(eq(builds.id, published.build.id));
      expect(build.updatedAt.toISOString()).toBe(before[3]);
      expect(
        (await getBuildLikeSummaries(tx, [published.build.id], null)).get(published.build.id),
      ).toEqual({ likeCount: 1, likedByMe: false });
      expect(
        await tx
          .select({ id: communityPostLikes.id })
          .from(communityPostLikes)
          .where(eq(communityPostLikes.postId, post.id)),
      ).toHaveLength(1);
      expect(
        await tx
          .select({ id: communityCommentLikes.id })
          .from(communityCommentLikes)
          .where(eq(communityCommentLikes.commentId, root.id)),
      ).toHaveLength(1);
      expect(
        await tx
          .select({ id: buildLikes.id })
          .from(buildLikes)
          .where(eq(buildLikes.buildId, published.build.id)),
      ).toHaveLength(1);
    });
  });

  it("rechecks fresh roles, hidden targets and active build publication before liking", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      const published = await publishedBuild(tx, f);
      authenticate(f.other);
      await setReaction({ kind: "COMMUNITY_POST", targetId: post.id, liked: true });
      await tx.update(users).set({ role: "APPLICANT" }).where(eq(users.id, f.other.id));
      await expect(
        setReaction({ kind: "COMMUNITY_POST", targetId: post.id, liked: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      authenticate(f.third);
      expect((await detail(post.id)).post.likeCount).toBe(0);
      authenticate(f.admin);
      await moderateCommunityPost({
        id: post.id,
        expectedUpdatedAt: await version(tx, post.id),
        action: "HIDE",
      });
      await expect(
        setReaction({ kind: "COMMUNITY_POST", targetId: post.id, liked: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await tx.delete(buildPublications).where(eq(buildPublications.buildId, published.build.id));
      await expect(
        setReaction({ kind: "BUILD", targetId: published.build.id, liked: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      authenticate(f.applicant);
      await expect(
        setReaction({ kind: "BUILD", targetId: published.build.id, liked: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("notifies the post and parent-comment owners once each and suppresses hidden-thread events", async () => {
    await fixture(async (tx, f) => {
      const post = await saveCommunityPost(input());
      authenticate(f.other);
      const root = await saveCommunityComment({ postId: post.id, body: "다른 작성자의 댓글" });
      authenticate(f.third);
      const reply = await saveCommunityComment({
        postId: post.id,
        parentId: root.id,
        body: "두 소유자에게 알릴 답글",
      });
      for (const recipient of [f.owner, f.other]) {
        authenticate(recipient);
        const result = await getPersonalNotifications();
        if (result.mode !== "LIVE") throw Error("Missing notifications");
        expect(result.data.items.filter((item) => item.id === `comment:${reply.id}`)).toHaveLength(
          1,
        );
        expect(result.data.items.find((item) => item.id === `comment:${reply.id}`)?.href).toContain(
          `replyRoot=${root.id}&replyTarget=${reply.id}`,
        );
      }
      authenticate(f.admin);
      await moderateCommunityComment({
        id: root.id,
        expectedUpdatedAt: await version(tx, root.id, true),
        action: "HIDE",
      });
      authenticate(f.owner);
      const result = await getPersonalNotifications();
      if (result.mode !== "LIVE") throw Error("Missing notifications");
      expect(result.data.items.some((item) => item.id === `comment:${reply.id}`)).toBe(false);
    });
  });

  it("binds owned inline images and canonical video references atomically while keeping plain-text search", async () => {
    await fixture(async (tx, f) => {
      const png = await sharp({
        create: { width: 12, height: 12, channels: 4, background: "transparent" },
      })
        .png()
        .toBuffer();
      const image = await normalizeContentImage(
        new File([new Uint8Array(png)], "inline.png", { type: "image/png" }),
      );
      const [asset] = await tx
        .insert(contentImages)
        .values({ ownerId: f.owner.id, ...image })
        .returning();
      const doc: ContentDocument = {
        schemaVersion: "uniz-content.v1",
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "검색되는 서식본문", marks: [{ type: "bold" }] }],
          },
          { type: "image", attrs: { imageId: asset.id, alt: "파밍 사진" } },
        ],
      };
      const post = await saveCommunityPost({
        ...input(),
        body: "위장 미러 문자열",
        bodyDocument: doc,
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      });
      const data = await detail(post.id);
      expect(data.post.body).toBe("검색되는 서식본문\n\n파밍 사진");
      expect(data.post.bodyDocument).toEqual(doc);
      expect(data.post.youtubeUrl).toContain("dQw4w9WgXcQ");
      expect(
        await tx
          .select({ imageId: contentImageReferences.imageId })
          .from(contentImageReferences)
          .where(eq(contentImageReferences.postId, post.id)),
      ).toEqual([{ imageId: asset.id }]);
      const directory = await getCommunityDirectory({ q: "검색되는 서식본문" });
      if (directory.mode !== "LIVE") throw Error("Missing search");
      expect(directory.data.posts.some((row) => row.id === post.id)).toBe(true);
      authenticate(f.other);
      const invalidTitle = `외부사진-${randomUUID()}`;
      await expect(
        saveCommunityPost({ ...input(invalidTitle), bodyDocument: doc }),
      ).rejects.toThrow();
      expect(
        await tx
          .select({ id: communityPosts.id })
          .from(communityPosts)
          .where(eq(communityPosts.title, invalidTitle)),
      ).toHaveLength(0);
      expect(JSON.stringify(data)).not.toMatch(/private-interaction-(uid|token)/);
    });
  });

  it("keeps fixed approved build versions and reviewed titles accessible while rejecting pending versions", async () => {
    await fixture(async (tx, f) => {
      const approved = await publishedBuild(tx, f);
      const [pendingVersion] = await tx
        .insert(buildVersions)
        .values({
          buildId: approved.build.id,
          version: 2,
          schemaVersion: "uniz-gear.v2",
          loadoutSnapshot: {},
        })
        .returning();
      const post = await saveCommunityPost({
        ...input(),
        category: "BUILD",
        buildVersionId: approved.version.id,
      });
      await expect(
        saveCommunityPost({ ...input(), category: "BUILD", buildVersionId: pendingVersion.id }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      const linked = (await detail(post.id)).linkedBuildVersion;
      expect(linked).toMatchObject({ title: "승인된 빌드 제목", visibility: "PUBLIC", version: 1 });
      const editor = await getCommunityEditorData(post.id);
      expect(editor.buildVersions.some((row) => row.id === pendingVersion.id)).toBe(false);
      expect(JSON.stringify(linked)).not.toContain("공개되면 안 되는 초안");
      const [secondRequest] = await tx
        .insert(buildShareRequests)
        .values({
          buildId: approved.build.id,
          buildVersionId: pendingVersion.id,
          title: "승인된 두 번째 제목",
          requestedVisibility: "HIVE",
          status: "APPROVED",
          reviewerId: f.admin.id,
          reviewedAt: new Date(),
        })
        .returning();
      await tx
        .update(buildPublications)
        .set({ requestId: secondRequest.id })
        .where(eq(buildPublications.buildId, approved.build.id));
      authenticate(f.other);
      expect((await detail(post.id)).linkedBuildVersion).toMatchObject({
        title: "승인된 빌드 제목",
        version: 1,
      });
      await tx.delete(buildPublications).where(eq(buildPublications.buildId, approved.build.id));
      expect((await detail(post.id)).linkedBuildVersion).toBeNull();
    });
  });
});
