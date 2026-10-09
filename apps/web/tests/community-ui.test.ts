import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CommunityDirectoryData,
  CommunityPostData,
  CommunityPostSummary,
  CommunityEditorData,
  CommunityComment,
  AnnouncementDetail,
} from "../src/lib/server/community-repository";
import type { AdministrationActionState } from "../src/lib/admin-format";

const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  reset: vi.fn(),
  action: null as
    | ((state: AdministrationActionState, form: FormData) => Promise<AdministrationActionState>)
    | null,
  dispatch: vi.fn(),
  transition: vi.fn((task: () => void) => task()),
  dispatched: null as Promise<AdministrationActionState> | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (initial: unknown) => ({
    current: initial === null ? { reset: boundary.reset } : initial,
  }),
  useActionState: (action: typeof boundary.action) => {
    boundary.action = action;
    return [{ ok: false, message: "" }, boundary.dispatch, false];
  },
  startTransition: boundary.transition,
}));
vi.mock("../src/app/community/actions", () => ({
  saveCommunityPostForm: vi.fn(),
  archiveCommunityPostForm: vi.fn(),
  moderateCommunityPostForm: vi.fn(),
  saveCommunityCommentForm: vi.fn(),
  archiveCommunityCommentForm: vi.fn(),
  moderateCommunityCommentForm: vi.fn(),
  saveAnnouncementForm: vi.fn(),
  archiveAnnouncementForm: vi.fn(),
}));
vi.mock("../src/lib/reaction-actions", () => ({ saveReaction: vi.fn() }));
vi.mock("../src/lib/content-media-actions", () => ({ uploadContentImage: vi.fn() }));

import {
  CommunityBody,
  CommunityDirectory,
  CommunityPostDetail,
  PostManagement,
  CommunityAccessNotice,
  AnnouncementList,
} from "../src/components/community/views";
import {
  CommunityActionForm,
  CommunityPostForm,
  CommunityCommentForm,
  PostArchiveForm,
  PostModerationForm,
  AnnouncementForm,
} from "../src/components/community/forms";
import {
  communityHref,
  communityPostHref,
  communityReturnFilters,
  communityParagraphs,
  announcementIsScheduled,
} from "../src/components/community/presentation";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  if (
    typeof element.type === "function" &&
    ["CommunityPaginationLinks", "CommunitySectionLinks", "VersionFields", "ReturnFields"].includes(
      element.type.name,
    )
  ) {
    return [
      element,
      ...elements((element.type as (props: Record<string, unknown>) => unknown)(element.props)),
    ];
  }
  return [element, ...elements(element.props.children), ...elements(element.props.action)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Element).props.children);
}
const author = { id: "author-id", name: "하이브 멤버", handle: "member" };
function post(): CommunityPostSummary {
  return {
    id: "post-id",
    title: "공유 공략",
    category: "GUIDE",
    excerpt: "설명",
    author,
    isPinned: false,
    hiddenAt: null,
    archivedAt: null,
    createdAt: "2026-10-07T10:00:00Z",
    updatedAt: "2026-10-07T10:00:00Z",
    commentCount: 0,
    canEdit: true,
    canArchive: true,
    canModerate: false,
    hasBuildLink: false,
  };
}
function directory(): CommunityDirectoryData {
  return {
    posts: [post()],
    announcements: [],
    q: "약점",
    category: "GUIDE",
    pagination: { page: 2, pageSize: 20, totalCount: 50, hasNextPage: true },
    canCreate: true,
    canModerate: false,
    asOf: "2026-10-07T10:00:00Z",
  };
}
function detail(): CommunityPostData {
  return {
    post: { ...post(), body: "내용" },
    comments: [],
    commentPagination: { page: 1, pageSize: 20, totalCount: 0, hasNextPage: false },
    linkedBuildVersion: null,
    buildLinkNotice: null,
    canComment: true,
    asOf: "2026-10-07T10:00:00Z",
  };
}
function announcement(): AnnouncementDetail {
  return {
    id: "notice-id",
    title: "예약 공지",
    excerpt: "내용",
    content: "내용",
    author,
    isPinned: false,
    publishedAt: "2026-10-07T15:30:04.123Z",
    createdAt: "2026-10-07T10:00:00Z",
    updatedAt: "v2",
    archivedAt: null,
    canManage: true,
  };
}
beforeEach(() => {
  boundary.push.mockClear();
  boundary.reset.mockClear();
  boundary.action = null;
  boundary.dispatch.mockReset();
  boundary.transition.mockClear();
  boundary.dispatched = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("community text, list and permissions", () => {
  it("uses a photo gallery for showcase posts while preserving text lists and filter links", () => {
    const data = directory();
    data.category = "SHOWCASE";
    data.posts = [
      {
        ...post(),
        category: "SHOWCASE",
        title: "우리 집 테라스",
        coverImage: { url: "/api/content/image/photo-id", alt: "우리 집" },
        imageCount: 3,
      },
      { ...post(), id: "text-only", category: "SHOWCASE" },
    ];
    const tree = CommunityDirectory({ data });
    const nodes = elements(tree);
    expect(nodes.some((node) => String(node.props.className).includes("community-gallery"))).toBe(
      true,
    );
    const image = nodes.find((node) => node.props.src === "/api/content/image/photo-id")!;
    expect(image.props.unoptimized).toBe(true);
    expect(image.props.loading).toBe("lazy");
    expect(image.props.alt).toBe("우리 집");
    expect(text(tree)).toContain("사진 3장");
    expect(
      nodes.some(
        (node) =>
          node.props.href === "/community/post-id?q=%EC%95%BD%EC%A0%90&page=2&section=SHOWCASE",
      ),
    ).toBe(true);
    expect(nodes.some((node) => node.props.action === "/community/showcase")).toBe(true);
    expect(
      nodes.some((node) => node.props.href === "/community/showcase" && text(node) === "자랑하기"),
    ).toBe(true);
    expect(
      nodes.some(
        (node) => node.props.href === "/community/new?q=%EC%95%BD%EC%A0%90&page=2&section=SHOWCASE",
      ),
    ).toBe(true);
    expect(
      nodes.filter((node) => node.props.className === "community-showcase-cover"),
    ).toHaveLength(1);
    expect(
      elements(CommunityDirectory({ data: directory() })).some((node) =>
        String(node.props.className).includes("community-gallery"),
      ),
    ).toBe(false);
  });
  it("keeps showcase outside ordinary board filters and derives its return link from the stored post", () => {
    const board = elements(CommunityDirectory({ data: directory() }));
    expect(
      board.some((node) => node.props.href === "/community/showcase" && text(node) === "자랑하기"),
    ).toBe(true);
    expect(board.some((node) => String(node.props.href).includes("category=SHOWCASE"))).toBe(false);
    const data = detail();
    data.post.category = "SHOWCASE";
    const nodes = elements(CommunityPostDetail({ data }));
    expect(
      nodes.some(
        (node) => node.props.href === "/community/showcase" && text(node).includes("자랑하기 목록"),
      ),
    ).toBe(true);
    const commentForm = nodes.find((node) => node.type === CommunityCommentForm);
    expect(commentForm?.props.filters).toMatchObject({ section: "SHOWCASE" });
  });
  it("labels only active future admin notices as scheduled using the same directory snapshot", () => {
    const asOf = "2026-10-07T15:30:00.000Z";
    const future = announcement();
    const visible = { ...future, id: "current", title: "발행된 공지", publishedAt: asOf };
    const archived = {
      ...future,
      id: "archive",
      title: "보관된 공지",
      archivedAt: "2026-10-07T10:00:00Z",
    };
    expect(announcementIsScheduled(future.publishedAt, asOf)).toBe(true);
    expect(announcementIsScheduled("2026-10-08T00:30:00+09:00", asOf)).toBe(false);
    const admin = AnnouncementList({
      announcements: [future, visible, archived],
      admin: true,
      asOf,
    });
    expect(text(admin).match(/발행 예약/g)).toHaveLength(1);
    expect(text(admin)).toContain("보관됨");
    expect(text(AnnouncementList({ announcements: [visible], asOf }))).not.toContain("발행 예약");
  });
  it("renders Windows CRLF and legacy CR paragraphs without changing their stored text", () => {
    const stored =
      "첫 문단\r\n같은 문단의 다음 줄\r\n\r\n둘째 문단\r\n \t\r\n<script>셋째 문단</script>";
    expect(communityParagraphs(stored)).toEqual([
      "첫 문단\n같은 문단의 다음 줄",
      "둘째 문단",
      "<script>셋째 문단</script>",
    ]);
    const output = renderToStaticMarkup(createElement(CommunityBody, { text: stored }));
    expect(output.match(/<p>/g)).toHaveLength(3);
    expect(output).toContain("같은 문단의 다음 줄");
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>");
    expect(stored).toContain("\r\n\r\n");
    expect(communityParagraphs("첫 줄\r다음 줄\r\r다른 문단")).toEqual([
      "첫 줄\n다음 줄",
      "다른 문단",
    ]);
  });
  it("escapes executable markup and preserves paragraph and line breaks as text", () => {
    const output = renderToStaticMarkup(
      createElement(CommunityBody, {
        text: '<script>alert("unsafe")</script>\n다음 줄\n\n<img src=x onerror=alert(1)>',
      }),
    );
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("<img ");
    expect(output).toContain("&lt;script&gt;");
    expect(output).toContain("다음 줄");
    expect(output.match(/<p>/g)).toHaveLength(2);
  });
  it("preserves filters in post links and paging while resetting page on category change", () => {
    const nodes = elements(CommunityDirectory({ data: directory() }));
    expect(
      nodes.some(
        (node) =>
          node.props.href === "/community/post-id?q=%EC%95%BD%EC%A0%90&category=GUIDE&page=2",
      ),
    ).toBe(true);
    expect(
      nodes.some(
        (node) => node.props.href === "/community?q=%EC%95%BD%EC%A0%90&category=GUIDE&page=3",
      ),
    ).toBe(true);
    expect(
      nodes.some((node) => node.props.href === "/community?q=%EC%95%BD%EC%A0%90&category=TIP"),
    ).toBe(true);
    expect(communityReturnFilters({ q: "  검색   조건  ", category: "BAD", page: "-2" })).toEqual({
      q: "검색 조건",
      category: null,
      page: 1,
    });
    expect(communityHref({ q: "<&", category: "TIP" })).toContain("q=%3C%26");
  });
  it("separates authors' edit/archive controls from staff moderation", () => {
    const own = elements(PostManagement({ post: post() }));
    expect(own.some((node) => node.type === PostArchiveForm)).toBe(true);
    expect(own.some((node) => node.type === PostModerationForm)).toBe(false);
    const other = elements(
      PostManagement({ post: { ...post(), canEdit: false, canArchive: false } }),
    );
    expect(other.some((node) => node.props.href || node.type === PostArchiveForm)).toBe(false);
    const staff = elements(
      PostManagement({ post: { ...post(), canEdit: false, canModerate: true } }),
    );
    expect(
      staff.filter((node) => node.type === PostModerationForm).map((node) => node.props.action),
    ).toEqual(["HIDE", "PIN"]);
  });
  it("uses the exact backend-provided version href and conceals unavailable build metadata", () => {
    const data = detail();
    data.linkedBuildVersion = {
      id: "version-id",
      buildId: "build-id",
      title: "특정 빌드",
      version: 3,
      visibility: "HIVE",
      href: "/lab/b/build-id?version=3",
    };
    expect(
      elements(CommunityPostDetail({ data })).some(
        (node) => node.props.href === "/lab/b/build-id?version=3",
      ),
    ).toBe(true);
    data.linkedBuildVersion = null;
    data.buildLinkNotice = "이 빌드는 현재 공유되지 않습니다.";
    const unavailable = CommunityPostDetail({ data });
    expect(text(unavailable)).toContain("현재 공유되지 않습니다");
    expect(text(unavailable)).not.toContain("특정 빌드");
    expect(
      elements(unavailable).some((node) => String(node.props.href).startsWith("/lab/b/")),
    ).toBe(false);
  });
  it("keeps closed post comment entry unavailable and offers approval/login access notices", () => {
    const data = detail();
    data.canComment = false;
    expect(
      elements(CommunityPostDetail({ data })).some((node) => node.type === CommunityCommentForm),
    ).toBe(false);
    expect(
      elements(CommunityAccessNotice({ mode: "PENDING" })).some((node) =>
        String(node.props.title).includes("멤버 승인을"),
      ),
    ).toBe(true);
    const guest = elements(CommunityAccessNotice({ mode: "DEMO", retryHref: "/community/new" }));
    expect(guest.some((node) => node.props.href === "/login?callbackUrl=%2Fcommunity%2Fnew")).toBe(
      true,
    );
  });
});

describe("community editor snapshots and write feedback", () => {
  it("starts new showcase posts in the selected category and explains the first-photo cover", () => {
    const tree = CommunityPostForm({
      data: { buildVersions: [], canPin: false, buildOptionsTruncated: false },
      filters: { category: "SHOWCASE" },
    });
    const nodes = elements(tree);
    expect(nodes.find((node) => node.props.name === "category")?.props.defaultValue).toBe(
      "SHOWCASE",
    );
    expect(nodes.some((node) => node.type === "option" && node.props.value === "SHOWCASE")).toBe(
      true,
    );
    expect(text(tree)).toContain("첫 사진이 목록의 대표 사진");
    expect(nodes.find((node) => node.props.name === "returnSection")?.props.value).toBe("SHOWCASE");
  });
  it("separates writer categories and uses an existing post's category when an edit query conflicts", () => {
    const data: CommunityEditorData = {
      buildVersions: [],
      canPin: false,
      buildOptionsTruncated: false,
    };
    const ordinary = elements(CommunityPostForm({ data }));
    expect(ordinary.some((node) => node.type === "option" && node.props.value === "SHOWCASE")).toBe(
      false,
    );
    const existing = {
      ...data,
      initial: {
        id: "post-id",
        title: "공략",
        body: "설명",
        category: "GUIDE" as const,
        buildVersionId: null,
        isPinned: false,
        updatedAt: "v1",
      },
    };
    const edited = elements(
      CommunityPostForm({ data: existing, filters: { section: "SHOWCASE" } }),
    );
    expect(edited.find((node) => node.props.name === "category")?.props.defaultValue).toBe("GUIDE");
    expect(edited.find((node) => node.props.name === "returnSection")?.props.value).toBe("BOARD");
    expect(edited.some((node) => node.type === "option" && node.props.value === "SHOWCASE")).toBe(
      false,
    );
  });
  it("offers optional Korean notice publication time with edit precision and no failure reset", () => {
    const created = AnnouncementForm({});
    const newInput = elements(created).find((node) => node.props.name === "publishedAt")!;
    expect(newInput.props.type).toBe("datetime-local");
    expect(newInput.props.required).toBeUndefined();
    expect(newInput.props.defaultValue).toBe("");
    expect(text(created)).toContain("비워두면 바로 발행");
    expect(created.props.resetOnSuccess).toBeUndefined();
    const edited = AnnouncementForm({ initial: announcement() });
    const fields = elements(edited);
    expect(fields.find((node) => node.props.name === "publishedAt")?.props.defaultValue).toBe(
      "2026-10-08T00:30",
    );
    expect(fields.find((node) => node.props.name === "originalPublishedAt")?.props.value).toBe(
      announcement().publishedAt,
    );
    expect(fields.find((node) => node.props.name === "expectedUpdatedAt")?.props.value).toBe("v2");
    expect(text(edited)).toContain("기존 발행일시를 유지");
    expect(edited.props.resetOnSuccess).toBeUndefined();
  });
  it("dispatches inside a transition once and has no automatic form action reset", async () => {
    const NativeFormData = FormData;
    vi.stubGlobal(
      "FormData",
      class extends NativeFormData {
        constructor() {
          super();
        }
      },
    );
    let finish: (value: AdministrationActionState) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<AdministrationActionState>((resolve) => {
          finish = resolve;
        }),
    );
    const tree = CommunityActionForm({ action, label: "저장", children: null });
    expect(tree.props.action).toBeUndefined();
    boundary.dispatch.mockImplementation((form: FormData) => {
      boundary.dispatched = boundary.action!({ ok: false, message: "" }, form);
    });
    const event = { preventDefault: vi.fn(), currentTarget: {} };
    const submit = tree.props.onSubmit as (event: unknown) => void;
    submit(event);
    submit(event);
    expect(boundary.dispatch).toHaveBeenCalledTimes(1);
    expect(boundary.transition).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    finish({ ok: false, message: "입력 확인" });
    await boundary.dispatched;
    expect(boundary.reset).not.toHaveBeenCalled();
    submit(event);
    expect(boundary.dispatch).toHaveBeenCalledTimes(2);
    finish({ ok: false, message: "입력 확인" });
    await boundary.dispatched;
  });
  it("submits exact version IDs and keeps inaccessible prior links explicit", () => {
    const data: CommunityEditorData = {
      initial: {
        id: "post-id",
        title: "제목",
        body: "내용",
        category: "BUILD",
        buildVersionId: "older-version",
        isPinned: true,
        updatedAt: "v1",
      },
      buildVersions: [
        {
          id: "available-version",
          buildId: "build-id",
          title: "현재 공유",
          version: 4,
          visibility: "HIVE",
          href: "/lab/b/build-id?version=4",
        },
      ],
      canPin: false,
      buildOptionsTruncated: false,
    };
    const nodes = elements(CommunityPostForm({ data }));
    expect(nodes.find((node) => node.props.name === "buildVersionId")?.props.defaultValue).toBe(
      "older-version",
    );
    expect(
      nodes.some((node) => node.type === "option" && node.props.value === "available-version"),
    ).toBe(true);
    expect(nodes.find((node) => node.props.name === "expectedUpdatedAt")?.props.value).toBe("v1");
    expect(nodes.some((node) => node.props.name === "isPinned")).toBe(false);
    expect(text(CommunityPostForm({ data }))).toContain("현재 접근 상태 변경");
  });
  it("rekeys edited comment text to its saved version and retains surrounding form identity", () => {
    const comment: CommunityComment = {
      id: "comment-id",
      postId: "post-id",
      body: "저장된 댓글",
      author,
      hiddenAt: null,
      archivedAt: null,
      createdAt: "2026-10-07T10:00:00Z",
      updatedAt: "v2",
      canEdit: true,
      canArchive: true,
      canModerate: false,
    };
    const tree = CommunityCommentForm({ postId: comment.postId, comment });
    expect(tree.key).toBeNull();
    const textarea = elements(tree).find((node) => node.type === "textarea")!;
    expect(textarea.key).toBe("v2");
    expect(textarea.props.defaultValue).toBe("저장된 댓글");
  });
  it("keeps typed content on rejected or interrupted writes and resets only a successful new comment", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, message: "변경 충돌" });
    CommunityActionForm({ action, label: "저장", children: null, resetOnSuccess: true });
    await boundary.action!({ ok: false, message: "" }, new FormData());
    expect(boundary.reset).not.toHaveBeenCalled();
    action.mockRejectedValue(new Error("network failure"));
    const failed = await boundary.action!({ ok: false, message: "" }, new FormData());
    expect(failed.ok).toBe(false);
    expect(failed.message).toContain("입력한 내용은 그대로 유지");
    expect(boundary.reset).not.toHaveBeenCalled();
    action.mockResolvedValue({ ok: true, message: "저장됨", href: communityPostHref("post-id") });
    await boundary.action!({ ok: false, message: "" }, new FormData());
    expect(boundary.reset).toHaveBeenCalledTimes(1);
    expect(boundary.push).toHaveBeenCalledWith("/community/post-id");
    boundary.reset.mockClear();
    CommunityActionForm({ action, label: "글 수정", children: null });
    await boundary.action!({ ok: false, message: "" }, new FormData());
    expect(boundary.reset).not.toHaveBeenCalled();
  });
});
