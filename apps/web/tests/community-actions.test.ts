import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({
  refresh: vi.fn(),
  savePost: vi.fn(),
  archivePost: vi.fn(),
  moderatePost: vi.fn(),
  saveComment: vi.fn(),
  archiveComment: vi.fn(),
  moderateComment: vi.fn(),
  saveNotice: vi.fn(),
  archiveNotice: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.refresh }));
vi.mock("@/lib/admin-format", () => import("../src/lib/admin-format"));
vi.mock(
  "@/components/community/presentation",
  () => import("../src/components/community/presentation"),
);
vi.mock("@/lib/server/community-repository", () => ({
  saveCommunityPost: boundary.savePost,
  archiveCommunityPost: boundary.archivePost,
  moderateCommunityPost: boundary.moderatePost,
  saveCommunityComment: boundary.saveComment,
  archiveCommunityComment: boundary.archiveComment,
  moderateCommunityComment: boundary.moderateComment,
  saveAnnouncement: boundary.saveNotice,
  archiveAnnouncement: boundary.archiveNotice,
  CommunityError: class CommunityError extends Error {},
}));
import {
  saveCommunityPostForm,
  archiveCommunityPostForm,
  moderateCommunityPostForm,
  saveCommunityCommentForm,
  archiveCommunityCommentForm,
  moderateCommunityCommentForm,
  saveAnnouncementForm,
  archiveAnnouncementForm,
} from "../src/app/community/actions";
const previous = { ok: false, message: "" };
function form(values: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
beforeEach(() => {
  for (const fn of Object.values(boundary)) fn.mockReset();
  boundary.savePost.mockResolvedValue({ id: "post-id" });
  boundary.saveComment.mockResolvedValue({ id: "comment-id" });
  boundary.saveNotice.mockResolvedValue({ id: "notice-id" });
});

describe("community form write boundary", () => {
  it("preserves showcase context on post, reply and archive navigation", async () => {
    const saved = await saveCommunityPostForm(
      previous,
      form({ title: "사진", body: "설명", category: "SHOWCASE", returnSection: "SHOWCASE" }),
    );
    expect(saved.href).toBe("/community/post-id?section=SHOWCASE");
    const archived = await archiveCommunityPostForm(
      previous,
      form({ id: "post-id", expectedUpdatedAt: "v1", returnSection: "SHOWCASE" }),
    );
    expect(archived.href).toBe("/community/showcase");
    const reply = await saveCommunityCommentForm(
      previous,
      form({ postId: "post-id", parentId: "parent-id", body: "답글", returnSection: "SHOWCASE" }),
    );
    expect(reply.href).toBe(
      "/community/post-id?section=SHOWCASE&replyRoot=parent-id&replyPage=100000#comment-comment-id",
    );
  });
  it("keeps an unfinished photo upload from saving the post", async () => {
    const result = await saveCommunityPostForm(
      previous,
      form({ title: "제목", body: "본문", contentMediaReady: "false" }),
    );
    expect(result.ok).toBe(false);
    expect(boundary.savePost).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("forwards structured content and a video reference to the server's strict parser", async () => {
    const document = JSON.stringify({
      schemaVersion: "uniz-content.v1",
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }],
    });
    const result = await saveCommunityPostForm(
      previous,
      form({
        title: "제목",
        body: "본문",
        category: "GENERAL",
        bodyDocument: document,
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        contentMediaReady: "true",
      }),
    );
    expect(result.ok).toBe(true);
    expect(boundary.savePost).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyDocument: document,
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      }),
    );
  });
  it("returns a newly created reply to its parent thread and last reply page", async () => {
    const result = await saveCommunityCommentForm(
      previous,
      form({ postId: "post-id", parentId: "parent-id", body: "답글" }),
    );
    expect(boundary.saveComment).toHaveBeenCalledWith({
      postId: "post-id",
      parentId: "parent-id",
      body: "답글",
    });
    expect(result.href).toContain("replyRoot=parent-id&replyPage=100000#comment-comment-id");
    expect(result.message).toContain("답글");
  });
  it("links the exact build version, preserves an edit version and drops spoofed author/visibility fields", async () => {
    const result = await saveCommunityPostForm(
      previous,
      form({
        id: "post-id",
        expectedUpdatedAt: "current-version",
        title: "공유 세팅",
        body: "설명",
        category: "BUILD",
        buildVersionId: "exact-version-id",
        isPinned: "on",
        authorId: "another-user",
        visibility: "PUBLIC",
        returnQ: "약점",
        returnCategory: "BUILD",
        returnPage: "2",
      }),
    );
    expect(boundary.savePost).toHaveBeenCalledWith({
      id: "post-id",
      expectedUpdatedAt: "current-version",
      title: "공유 세팅",
      body: "설명",
      category: "BUILD",
      buildVersionId: "exact-version-id",
      isPinned: true,
    });
    expect(result.href).toBe("/community/post-id?q=%EC%95%BD%EC%A0%90&category=BUILD&page=2");
    expect(boundary.refresh).toHaveBeenCalledWith("/");
  });
  it("keeps absent optional build links null and cannot be redirected by a submitted href", async () => {
    const result = await saveCommunityPostForm(
      previous,
      form({
        title: "질문",
        body: "질문 내용",
        category: "QUESTION",
        buildVersionId: "",
        href: "https://example.invalid/steal",
      }),
    );
    expect(boundary.savePost.mock.calls[0][0].buildVersionId).toBeNull();
    expect(result.href).toBe("/community/post-id");
  });
  it("archives only the identified current post and preserves list filters", async () => {
    const result = await archiveCommunityPostForm(
      previous,
      form({
        id: "post-id",
        expectedUpdatedAt: "current-version",
        returnQ: "검색",
        returnCategory: "TIP",
        returnPage: "3",
        role: "ADMIN",
      }),
    );
    expect(boundary.archivePost).toHaveBeenCalledWith({
      id: "post-id",
      expectedUpdatedAt: "current-version",
    });
    expect(result.href).toBe("/community?q=%EA%B2%80%EC%83%89&category=TIP&page=3");
  });
  it("passes one explicit moderation command with a concurrency version", async () => {
    await moderateCommunityPostForm(
      previous,
      form({ id: "post-id", expectedUpdatedAt: "v1", action: "HIDE", title: "spoofed rewrite" }),
    );
    expect(boundary.moderatePost).toHaveBeenCalledWith({
      id: "post-id",
      expectedUpdatedAt: "v1",
      action: "HIDE",
    });
  });
  it("keeps comment edits on the current page and new comments return to the newest page", async () => {
    const edited = await saveCommunityCommentForm(
      previous,
      form({ id: "comment-id", expectedUpdatedAt: "v1", postId: "post-id", body: "수정한 댓글" }),
    );
    expect(edited.href).toBeUndefined();
    expect(boundary.saveComment).toHaveBeenCalledWith({
      id: "comment-id",
      expectedUpdatedAt: "v1",
      postId: "post-id",
      body: "수정한 댓글",
    });
    const created = await saveCommunityCommentForm(
      previous,
      form({
        postId: "post-id",
        body: "새 댓글",
        commentPage: "8",
        returnCategory: "QUESTION",
        returnPage: "2",
      }),
    );
    expect(created.href).toBe("/community/post-id?category=QUESTION&page=2");
    expect(created.href).not.toContain("commentPage");
  });
  it("soft-removes and moderates comments through their own current IDs", async () => {
    await archiveCommunityCommentForm(
      previous,
      form({ id: "comment-id", expectedUpdatedAt: "v1", postId: "another-post" }),
    );
    expect(boundary.archiveComment).toHaveBeenCalledWith({
      id: "comment-id",
      expectedUpdatedAt: "v1",
    });
    await moderateCommunityCommentForm(
      previous,
      form({ id: "comment-id", expectedUpdatedAt: "v1", action: "SHOW" }),
    );
    expect(boundary.moderateComment).toHaveBeenCalledWith({
      id: "comment-id",
      expectedUpdatedAt: "v1",
      action: "SHOW",
    });
  });
  it("writes notices with staff-controlled fields and refreshes home after archiving", async () => {
    const saved = await saveAnnouncementForm(
      previous,
      form({
        title: "새 공지",
        content: "공지 내용",
        isPinned: "on",
        authorId: "spoofed",
      }),
    );
    expect(boundary.saveNotice).toHaveBeenCalledWith({
      title: "새 공지",
      content: "공지 내용",
      isPinned: true,
    });
    expect(saved.href).toBe("/announcements/notice-id");
    const archived = await archiveAnnouncementForm(
      previous,
      form({ id: "notice-id", expectedUpdatedAt: "v1" }),
    );
    expect(archived.href).toBe("/admin/community");
    expect(boundary.archiveNotice).toHaveBeenCalledWith({
      id: "notice-id",
      expectedUpdatedAt: "v1",
    });
  });
  it("converts scheduled notice time from Korea to UTC and preserves unchanged edit precision", async () => {
    await saveAnnouncementForm(
      previous,
      form({ title: "예약 공지", content: "공지 내용", publishedAt: "2026-10-08T00:30" }),
    );
    expect(boundary.saveNotice).toHaveBeenCalledWith({
      title: "예약 공지",
      content: "공지 내용",
      isPinned: false,
      publishedAt: "2026-10-07T15:30:00.000Z",
    });
    await saveAnnouncementForm(
      previous,
      form({
        id: "notice-id",
        expectedUpdatedAt: "v2",
        title: "수정 공지",
        content: "수정 내용",
        publishedAt: "2026-10-08T00:30",
        originalPublishedAt: "2026-10-07T15:30:04.123Z",
      }),
    );
    expect(boundary.saveNotice).toHaveBeenLastCalledWith({
      id: "notice-id",
      expectedUpdatedAt: "v2",
      title: "수정 공지",
      content: "수정 내용",
      isPinned: false,
      publishedAt: "2026-10-07T15:30:04.123Z",
    });
  });
  it("leaves a blank notice publication time to the backend for immediate create or unchanged edit", async () => {
    for (const extra of [{}, { id: "notice-id", expectedUpdatedAt: "v3" }]) {
      await saveAnnouncementForm(
        previous,
        form({ ...extra, title: "공지", content: "내용", publishedAt: "" }),
      );
      expect(boundary.saveNotice).toHaveBeenLastCalledWith({
        ...extra,
        title: "공지",
        content: "내용",
        isPinned: false,
      });
      expect(boundary.saveNotice.mock.calls.at(-1)![0]).not.toHaveProperty("publishedAt");
    }
  });
  it.each([
    "2026-02-30T19:00",
    "2026-10-08T24:00",
    "2026-10-08T19:60",
    "2026-10-08T19:00:00Z",
    "2026-10-08",
    "잘못된 시간",
  ])(
    "rejects invalid or nonlocal notice publication time %s without writing",
    async (publishedAt) => {
      const input = form({ title: "유지할 제목", content: "유지할 본문", publishedAt });
      const result = await saveAnnouncementForm(previous, input);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("발행일시");
      expect(result.href).toBeUndefined();
      expect(boundary.saveNotice).not.toHaveBeenCalled();
      expect(boundary.refresh).not.toHaveBeenCalled();
      expect(input.get("publishedAt")).toBe(publishedAt);
      expect(input.get("content")).toBe("유지할 본문");
    },
  );
  it("hides unexpected storage details and does not refresh on a rejected write", async () => {
    boundary.savePost.mockRejectedValue(new Error("private SQL/token details"));
    const result = await saveCommunityPostForm(
      previous,
      form({ title: "글", body: "내용", category: "GENERAL" }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("private");
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
});
