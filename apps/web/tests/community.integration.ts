import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  lastError: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  guild: "MEMBER",
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: boundary.guild }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return {
    ...actual,
    getDb: () => {
      if (!boundary.transaction) return actual.getDb();
      const transaction = boundary.transaction as ReturnType<typeof actual.getDb>;
      return {
        transaction: async (callback: Parameters<typeof transaction.transaction>[0]) => {
          try {
            return await transaction.transaction(callback);
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
  builds,
  buildPublications,
  buildShareRequests,
  buildVersions,
  communityComments,
  communityPosts,
  eq,
  getDb,
  memberProfiles,
  users,
} from "@uniz/db";
import {
  archiveAnnouncement,
  archiveCommunityComment,
  archiveCommunityPost,
  getAnnouncement,
  getAnnouncementAdminData,
  getCommunityDirectory,
  getCommunityEditorData,
  getCommunityPost,
  getRecentAnnouncements,
  moderateCommunityComment,
  moderateCommunityPost,
  saveAnnouncement,
  saveCommunityComment,
  saveCommunityPost,
} from "../src/lib/server/community-repository";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw Error("Community verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function fixture(
  work: (
    transaction: Transaction,
    data: {
      member: CurrentUser;
      other: CurrentUser;
      officer: CurrentUser;
      admin: CurrentUser;
      tag: string;
    },
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const rollback = new Error("Intentional community fixture rollback");
  try {
    await actual.getDb().transaction(async (transaction) => {
      boundary.transaction = transaction;
      boundary.lastError = null;
      boundary.guild = "MEMBER";
      const actors = {
        member: { id: randomUUID(), name: "Community Member", role: "MEMBER", isMock: false },
        other: { id: randomUUID(), name: "Community Other", role: "MEMBER", isMock: false },
        officer: { id: randomUUID(), name: "Community Officer", role: "OFFICER", isMock: false },
        admin: { id: randomUUID(), name: "Community Admin", role: "ADMIN", isMock: false },
      } satisfies Record<string, CurrentUser>;
      for (const actor of Object.values(actors)) {
        await transaction
          .insert(users)
          .values({ id: actor.id, name: actor.name, role: actor.role });
        await transaction.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `community-${actor.id}`,
          access_token: "private-community-token",
        });
        await transaction.insert(memberProfiles).values({
          userId: actor.id,
          displayName: actor.name,
          handle: `c-${actor.id.slice(0, 20)}`,
          onceHumanNickname: "Fixture",
          onceHumanUid: "private-community-uid",
        });
      }
      boundary.state = { user: actors.member, status: "AUTHENTICATED" };
      await work(transaction, { ...actors, tag: `커뮤니티-${randomUUID()}` });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
  }
}
function authenticate(user: CurrentUser) {
  boundary.state = { user, status: "AUTHENTICATED" };
}
function requireLive<T extends { mode: string }>(result: T): void {
  if (result.mode !== "LIVE") throw boundary.lastError ?? Error(`Community mode ${result.mode}`);
}
async function postVersion(transaction: Transaction, id: string) {
  const [row] = await transaction.select().from(communityPosts).where(eq(communityPosts.id, id));
  return row.updatedAt.toISOString();
}
async function commentVersion(transaction: Transaction, id: string) {
  const [row] = await transaction
    .select()
    .from(communityComments)
    .where(eq(communityComments.id, id));
  return row.updatedAt.toISOString();
}
async function approveVersions(
  transaction: Transaction,
  buildId: string,
  versions: { id: string }[],
  title: string,
  reviewerId: string,
  visibility: "HIVE" | "PUBLIC" = "HIVE",
) {
  const approved = await transaction
    .insert(buildShareRequests)
    .values(
      versions.map((version) => ({
        buildId,
        buildVersionId: version.id,
        title,
        requestedVisibility: visibility,
        status: "APPROVED" as const,
        reviewerId,
        reviewedAt: new Date(),
      })),
    )
    .returning({ id: buildShareRequests.id, versionId: buildShareRequests.buildVersionId });
  const latest = approved.find((row) => row.versionId === versions.at(-1)!.id)!;
  await transaction.insert(buildPublications).values({ buildId, requestId: latest.id });
}
const postInput = (title: string) => ({
  title,
  body: "일반 텍스트 <script>literal</script>",
  category: "GENERAL",
  buildVersionId: null,
  isPinned: false,
});
describe("HIVE community transactional SQL verification", () => {
  it("creates posts/comments/notices with identical timestamps while preserving immediate real edits", async () => {
    await fixture(async (transaction, f) => {
      const post = await saveCommunityPost(postInput(f.tag));
      const comment = await saveCommunityComment({ postId: post.id, body: "처음 댓글" });
      const [postBefore] = await transaction
        .select()
        .from(communityPosts)
        .where(eq(communityPosts.id, post.id));
      const [commentBefore] = await transaction
        .select()
        .from(communityComments)
        .where(eq(communityComments.id, comment.id));
      expect(postBefore.createdAt.getTime()).toBe(postBefore.updatedAt.getTime());
      expect(commentBefore.createdAt.getTime()).toBe(commentBefore.updatedAt.getTime());
      await saveCommunityPost({
        ...postInput(f.tag),
        id: post.id,
        expectedUpdatedAt: postBefore.updatedAt.toISOString(),
        body: "바로 수정",
      });
      await saveCommunityComment({
        id: comment.id,
        postId: post.id,
        expectedUpdatedAt: commentBefore.updatedAt.toISOString(),
        body: "바로 수정 댓글",
      });
      const [postAfter] = await transaction
        .select()
        .from(communityPosts)
        .where(eq(communityPosts.id, post.id));
      const [commentAfter] = await transaction
        .select()
        .from(communityComments)
        .where(eq(communityComments.id, comment.id));
      expect(postAfter.createdAt.getTime()).toBe(postBefore.createdAt.getTime());
      expect(postAfter.updatedAt.getTime()).toBeGreaterThan(postAfter.createdAt.getTime());
      expect(commentAfter.createdAt.getTime()).toBe(commentBefore.createdAt.getTime());
      expect(commentAfter.updatedAt.getTime()).toBeGreaterThan(commentAfter.createdAt.getTime());
      authenticate(f.officer);
      const notice = await saveAnnouncement({
        title: f.tag,
        content: "처음 공지",
        isPinned: false,
      });
      const [noticeBefore] = await transaction
        .select()
        .from(announcements)
        .where(eq(announcements.id, notice.id));
      expect(noticeBefore.createdAt.getTime()).toBe(noticeBefore.updatedAt.getTime());
      await saveAnnouncement({
        id: notice.id,
        expectedUpdatedAt: noticeBefore.updatedAt.toISOString(),
        title: f.tag,
        content: "바로 수정 공지",
        isPinned: false,
      });
      const [noticeAfter] = await transaction
        .select()
        .from(announcements)
        .where(eq(announcements.id, notice.id));
      expect(noticeAfter.createdAt.getTime()).toBe(noticeBefore.createdAt.getTime());
      expect(noticeAfter.updatedAt.getTime()).toBeGreaterThan(noticeAfter.createdAt.getTime());
    });
  });
  it("bounds shared-version choices to 100 while preserving an explicitly linked older version", async () => {
    await fixture(async (transaction, f) => {
      const [build] = await transaction
        .insert(builds)
        .values({ ownerId: f.member.id, title: f.tag, visibility: "HIVE" })
        .returning();
      const versions = await transaction
        .insert(buildVersions)
        .values(
          Array.from({ length: 105 }, (_, index) => ({
            buildId: build.id,
            version: index + 1,
            schemaVersion: "uniz-gear.v2",
            loadoutSnapshot: {},
            createdAt: new Date(Date.now() - (105 - index) * 1000),
          })),
        )
        .returning();
      await approveVersions(transaction, build.id, versions, f.tag, f.admin.id);
      const created = await saveCommunityPost({
        ...postInput(f.tag),
        category: "BUILD",
        buildVersionId: versions[0].id,
      });
      const editor = await getCommunityEditorData(created.id);
      expect(editor.buildVersions).toHaveLength(100);
      expect(editor.buildOptionsTruncated).toBe(true);
      expect(editor.buildVersions.some((version) => version.id === versions[0].id)).toBe(true);
      expect(editor.buildVersions.some((version) => version.version === 105)).toBe(true);
      expect(editor.initial?.buildVersionId).toBe(versions[0].id);
    });
  });
  it("enforces own edits, staff-only moderation, stale versions and nonstaff pin preservation", async () => {
    await fixture(async (transaction, f) => {
      const created = await saveCommunityPost(postInput(f.tag));
      const firstVersion = await postVersion(transaction, created.id);
      authenticate(f.other);
      await expect(
        saveCommunityPost({ ...postInput(f.tag), id: created.id, expectedUpdatedAt: firstVersion }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        moderateCommunityPost({ id: created.id, expectedUpdatedAt: firstVersion, action: "PIN" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      authenticate(f.officer);
      await moderateCommunityPost({
        id: created.id,
        expectedUpdatedAt: firstVersion,
        action: "PIN",
      });
      authenticate(f.member);
      await expect(
        saveCommunityPost({ ...postInput(f.tag), id: created.id, expectedUpdatedAt: firstVersion }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await saveCommunityPost({
        ...postInput(f.tag),
        id: created.id,
        expectedUpdatedAt: await postVersion(transaction, created.id),
        body: "새 내용",
        isPinned: false,
      });
      const detail = await getCommunityPost(created.id);
      requireLive(detail);
      if (detail.mode !== "LIVE" || !detail.data) throw Error("Missing community post");
      expect(detail.data.post.isPinned).toBe(true);
      expect(detail.data.post.body).toBe("새 내용");
      expect(detail.data.post.author.handle).toBeNull();
      expect(JSON.stringify(detail)).not.toMatch(/private-community-(?:uid|token)/);
      authenticate(f.officer);
      await moderateCommunityPost({
        id: created.id,
        expectedUpdatedAt: await postVersion(transaction, created.id),
        action: "HIDE",
      });
      authenticate(f.other);
      expect(await getCommunityPost(created.id)).toMatchObject({ mode: "LIVE", data: null });
      authenticate(f.officer);
      const hidden = await getCommunityDirectory({ q: f.tag, includeModerated: true });
      requireLive(hidden);
      if (hidden.mode !== "LIVE") throw Error("Not live");
      expect(hidden.data.posts[0].hiddenAt).not.toBeNull();
      expect(hidden.data.posts[0].author.handle).toBeNull();
      await moderateCommunityPost({
        id: created.id,
        expectedUpdatedAt: await postVersion(transaction, created.id),
        action: "SHOW",
      });
      authenticate(f.admin);
      const admin = await getCommunityPost(created.id);
      expect(admin).toMatchObject({
        mode: "LIVE",
        data: { post: { author: { handle: expect.any(String) } } },
      });
      await archiveCommunityPost({
        id: created.id,
        expectedUpdatedAt: await postVersion(transaction, created.id),
      });
      authenticate(f.other);
      expect(await getCommunityPost(created.id)).toMatchObject({ mode: "LIVE", data: null });
    });
  });
  it("validates owner/approved immutable versions, never changes build visibility and hides withdrawn links", async () => {
    await fixture(async (transaction, f) => {
      const records = await transaction
        .insert(builds)
        .values([
          { ownerId: f.member.id, title: "공유 세팅", visibility: "HIVE" as const },
          { ownerId: f.member.id, title: "private-title-sentinel", visibility: "PRIVATE" as const },
          { ownerId: f.other.id, title: "다른 작성자", visibility: "PUBLIC" as const },
        ])
        .returning();
      const versions = await transaction
        .insert(buildVersions)
        .values([
          {
            buildId: records[0].id,
            version: 1,
            schemaVersion: "uniz-gear.v2",
            loadoutSnapshot: { privateSnapshotSentinel: "not-returned" },
          },
          {
            buildId: records[0].id,
            version: 2,
            schemaVersion: "uniz-gear.v2",
            loadoutSnapshot: {},
          },
          {
            buildId: records[1].id,
            version: 1,
            schemaVersion: "uniz-gear.v2",
            loadoutSnapshot: {},
          },
          {
            buildId: records[2].id,
            version: 1,
            schemaVersion: "uniz-gear.v2",
            loadoutSnapshot: {},
          },
        ])
        .returning();
      await approveVersions(
        transaction,
        records[0].id,
        versions.slice(0, 2),
        "공유 세팅",
        f.admin.id,
      );
      await approveVersions(
        transaction,
        records[2].id,
        versions.slice(3),
        "다른 작성자",
        f.admin.id,
        "PUBLIC",
      );
      for (const id of [versions[2].id, versions[3].id])
        await expect(
          saveCommunityPost({ ...postInput(f.tag), category: "BUILD", buildVersionId: id }),
        ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      const post = await saveCommunityPost({
        ...postInput(f.tag),
        category: "BUILD",
        buildVersionId: versions[0].id,
      });
      const detail = await getCommunityPost(post.id);
      requireLive(detail);
      if (detail.mode !== "LIVE" || !detail.data) throw Error("Missing build link");
      expect(detail.data.linkedBuildVersion?.version).toBe(1);
      expect(detail.data.linkedBuildVersion?.href).toBe(`/lab/b/${records[0].id}?version=1`);
      expect(JSON.stringify(detail)).not.toContain("privateSnapshotSentinel");
      const editor = await getCommunityEditorData(post.id);
      expect(editor.buildVersions.map((version) => version.id)).not.toContain(versions[2].id);
      expect(editor.buildVersions.map((version) => version.id)).not.toContain(versions[3].id);
      await transaction
        .update(builds)
        .set({ visibility: "PRIVATE" })
        .where(eq(builds.id, records[0].id));
      await transaction
        .delete(buildPublications)
        .where(eq(buildPublications.buildId, records[0].id));
      authenticate(f.other);
      const privateLink = await getCommunityPost(post.id);
      expect(privateLink).toMatchObject({
        mode: "LIVE",
        data: { linkedBuildVersion: null, buildLinkNotice: expect.any(String) },
      });
      expect(JSON.stringify(privateLink)).not.toContain("공유 세팅");
      expect(
        (await transaction.select().from(builds).where(eq(builds.id, records[1].id)))[0].visibility,
      ).toBe("PRIVATE");
    });
  });
  it("supports newest-first paged comments and own/staff soft removal without cross-post edits", async () => {
    await fixture(async (transaction, f) => {
      const first = await saveCommunityPost(postInput(f.tag));
      const second = await saveCommunityPost(postInput(`${f.tag}-다른글`));
      const comments = await transaction
        .insert(communityComments)
        .values(
          Array.from({ length: 24 }, (_, index) => ({
            postId: first.id,
            authorId: f.member.id,
            body: `댓글 ${index}`,
            createdAt: new Date(Date.now() - (24 - index) * 1000),
          })),
        )
        .returning();
      const recent = await saveCommunityComment({ postId: first.id, body: "최신 댓글" });
      const detail = await getCommunityPost(first.id);
      requireLive(detail);
      if (detail.mode !== "LIVE" || !detail.data) throw Error("Missing comments");
      expect(detail.data.comments).toHaveLength(20);
      expect(detail.data.comments[0].id).toBe(recent.id);
      expect(detail.data.commentPagination.totalCount).toBe(25);
      const otherPage = await getCommunityPost(first.id, { commentPage: 2 });
      expect(otherPage).toMatchObject({
        mode: "LIVE",
        data: { comments: expect.any(Array), commentPagination: { page: 2 } },
      });
      await expect(
        saveCommunityComment({
          id: comments[0].id,
          expectedUpdatedAt: await commentVersion(transaction, comments[0].id),
          postId: second.id,
          body: "이동 금지",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      authenticate(f.other);
      await expect(
        archiveCommunityComment({
          id: recent.id,
          expectedUpdatedAt: await commentVersion(transaction, recent.id),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      authenticate(f.officer);
      await moderateCommunityComment({
        id: recent.id,
        expectedUpdatedAt: await commentVersion(transaction, recent.id),
        action: "HIDE",
      });
      authenticate(f.other);
      const hidden = await getCommunityPost(first.id);
      if (hidden.mode !== "LIVE" || !hidden.data) throw Error("Missing filtered comments");
      expect(hidden.data.comments.some((comment) => comment.id === recent.id)).toBe(false);
      authenticate(f.member);
      await archiveCommunityPost({
        id: first.id,
        expectedUpdatedAt: await postVersion(transaction, first.id),
      });
      await archiveCommunityComment({
        id: recent.id,
        expectedUpdatedAt: await commentVersion(transaction, recent.id),
      });
      expect(
        (
          await transaction
            .select()
            .from(communityComments)
            .where(eq(communityComments.id, recent.id))
        )[0].archivedAt,
      ).not.toBeNull();
      await expect(
        saveCommunityComment({ postId: first.id, body: "보관 뒤 댓글" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
  it("paginates directory/search literally and excludes unapproved authors and fresh demotions", async () => {
    await fixture(async (transaction, f) => {
      await transaction.insert(communityPosts).values(
        Array.from({ length: 23 }, (_, index) => ({
          title: `${f.tag}-${index}`,
          body: index === 0 ? "찾을 값 100%_" : "10000 일반",
          category: "TIP" as const,
          authorId: f.member.id,
          createdAt: new Date(Date.now() - index * 1000),
        })),
      );
      const first = await getCommunityDirectory({ q: f.tag, category: "TIP" });
      requireLive(first);
      if (first.mode !== "LIVE") throw Error("Not live");
      expect(first.data.posts).toHaveLength(20);
      expect(first.data.pagination).toMatchObject({ totalCount: 23, hasNextPage: true });
      const second = await getCommunityDirectory({ q: f.tag, category: "TIP", page: 2 });
      expect(second).toMatchObject({
        mode: "LIVE",
        data: { posts: expect.any(Array), pagination: { page: 2, totalCount: 23 } },
      });
      const literal = await getCommunityDirectory({ q: "100%_" });
      if (literal.mode !== "LIVE") throw boundary.lastError ?? Error("Missing search");
      expect(
        literal.data.posts.map((post) => post.title).filter((title) => title.startsWith(f.tag)),
      ).toHaveLength(1);
      await transaction.update(users).set({ role: "GUEST" }).where(eq(users.id, f.member.id));
      expect((await getCommunityDirectory()).mode).toBe("PENDING");
      await expect(saveCommunityPost(postInput(f.tag))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      authenticate(f.other);
      const departed = await getCommunityDirectory({ q: f.tag });
      expect(departed).toMatchObject({
        mode: "LIVE",
        data: { posts: [], pagination: { totalCount: 0 } },
      });
    });
  });
  it("preserves announcement rows, staff author/version rules and filters archived/future bells", async () => {
    await fixture(async (transaction, f) => {
      await expect(
        saveAnnouncement({ title: f.tag, content: "공지", isPinned: true }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      authenticate(f.officer);
      const created = await saveAnnouncement({
        title: f.tag,
        content: "일반 텍스트",
        isPinned: true,
      });
      const future = await saveAnnouncement({
        title: `${f.tag}-예약`,
        content: "예약",
        isPinned: false,
        publishedAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const [stored] = await transaction
        .select()
        .from(announcements)
        .where(eq(announcements.id, created.id));
      await saveAnnouncement({
        id: created.id,
        expectedUpdatedAt: stored.updatedAt.toISOString(),
        title: f.tag,
        content: "수정",
        isPinned: true,
      });
      await expect(
        archiveAnnouncement({ id: created.id, expectedUpdatedAt: stored.updatedAt.toISOString() }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const admin = await getAnnouncementAdminData();
      expect(admin.announcements.some((row) => row.id === future.id)).toBe(true);
      authenticate(f.member);
      expect(await getAnnouncement(future.id)).toMatchObject({ mode: "LIVE", data: null });
      const bell = await getRecentAnnouncements();
      requireLive(bell);
      if (bell.mode !== "LIVE") throw Error("Missing bell");
      expect(bell.data.announcements).toHaveLength(Math.min(5, bell.data.announcements.length));
      expect(bell.data.announcements.some((row) => row.id === created.id)).toBe(true);
      expect(bell.data.announcements.some((row) => row.id === future.id)).toBe(false);
      expect(JSON.stringify(bell)).not.toContain("content");
      const detail = await getAnnouncement(created.id);
      expect(detail).toMatchObject({
        mode: "LIVE",
        data: { author: { handle: null }, content: "수정" },
      });
      authenticate(f.admin);
      const [latest] = await transaction
        .select()
        .from(announcements)
        .where(eq(announcements.id, created.id));
      await archiveAnnouncement({
        id: created.id,
        expectedUpdatedAt: latest.updatedAt.toISOString(),
      });
      authenticate(f.member);
      expect(await getAnnouncement(created.id)).toMatchObject({ mode: "LIVE", data: null });
      const [preserved] = await transaction
        .select()
        .from(announcements)
        .where(eq(announcements.id, created.id));
      expect(preserved.authorId).toBe(f.officer.id);
      expect(preserved.archivedAt).not.toBeNull();
    });
  });
});
