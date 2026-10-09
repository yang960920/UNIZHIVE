import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPlannerLoadout } from "@uniz/build-engine";
import type { CurrentAuthState } from "../src/lib/auth-policy";
import type { PlannerBuildDetail } from "../src/lib/data/build-planner-types";

const boundary = vi.hoisted(() => ({
  access: { user: null, status: "GUEST", preview: false, mayCreate: false } as CurrentAuthState & {
    preview: boolean;
    mayCreate: boolean;
  },
  detail: vi.fn(),
  library: vi.fn(),
  notFound: vi.fn((): never => {
    throw new Error("NOT_FOUND");
  }),
  retry: function AuthRetryNotice() {
    return null;
  },
  blocked: function OperationalAccessNotice() {
    return null;
  },
  editor: function PlannerEditor() {
    return null;
  },
  loadout: function LoadoutView() {
    return null;
  },
  ownerControls: function BuildOwnerControls() {
    return null;
  },
  contentBody: function ContentBody() {
    return null;
  },
  video: function VideoReference() {
    return null;
  },
  like: function LikeButton() {
    return null;
  },
}));

vi.mock("next/navigation", () => ({ notFound: boundary.notFound }));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: function Link() {
    return null;
  },
}));
vi.mock("@/lib/server/build-planner-access", () => ({
  getPlannerAccess: async () => boundary.access,
}));
vi.mock("@/lib/server/build-planner", () => ({
  getBuildDetailData: boundary.detail,
  getBuildLibraryData: boundary.library,
}));
vi.mock("@/components/auth-retry-notice", () => ({ AuthRetryNotice: boundary.retry }));
vi.mock("@/components/live-operations", () => ({ OperationalAccessNotice: boundary.blocked }));
vi.mock("@/components/build-planner/editor", () => ({ PlannerEditor: boundary.editor }));
vi.mock("@/components/build-planner/presentation", () => ({
  LoadoutView: boundary.loadout,
  visibilityLabels: { PRIVATE: "나만 보기", HIVE: "하이브 멤버에게 공개", PUBLIC: "전체 공개" },
}));
vi.mock("@/components/build-planner/owner-controls", () => ({
  BuildOwnerControls: boundary.ownerControls,
  CopyBuildVersionLink: function CopyBuildVersionLink() {
    return null;
  },
}));
vi.mock("@/components/content/presentation", () => ({
  ContentBody: boundary.contentBody,
  VideoReference: boundary.video,
}));
vi.mock("@/components/like-button", () => ({ LikeButton: boundary.like }));
vi.mock("@uniz/ui", () => ({
  Card: function Card() {
    return null;
  },
  Badge: function Badge() {
    return null;
  },
  PageHeader: function PageHeader() {
    return null;
  },
  EmptyState: function EmptyState() {
    return null;
  },
}));

import NewBuildPage from "../src/app/lab/new/page";
import BuildPage from "../src/app/lab/b/[id]/page";
import EditBuildPage from "../src/app/lab/b/[id]/edit/page";
import BuildLabPage from "../src/app/lab/page";

const id = "86db12c5-deaf-42c8-8ff7-07e8ab9f6678";
const member = {
  id: "7fe923ec-0b11-4bd4-8812-6d3bbd900128",
  name: "Route fixture member",
  role: "MEMBER" as const,
  isMock: false,
};
const detailPage = (version?: string | string[], buildId = id) =>
  BuildPage({
    params: Promise.resolve({ id: buildId }),
    searchParams: Promise.resolve({ version }),
  });
const editPage = (from?: string | string[], buildId = id) =>
  EditBuildPage({
    params: Promise.resolve({ id: buildId }),
    searchParams: Promise.resolve({ from }),
  });
const pages = [
  ["new", () => NewBuildPage()],
  ["detail", () => detailPage()],
  ["edit", () => editPage()],
] as const;

function build(): PlannerBuildDetail {
  const version = {
    id: "a23040b5-ed76-48c2-a8a6-2c05d6e9eb6a",
    version: 1,
    createdAt: "2026-10-07T00:00:00Z",
    notes: "",
  };
  return {
    id,
    title: "Fixture build",
    description: "Recorded loadout",
    visibility: "PUBLIC",
    owner: { id: member.id, name: member.name, handle: null },
    latestVersion: 1,
    updatedAt: version.createdAt,
    createdAt: version.createdAt,
    isOwner: true,
    archivedAt: null,
    mayEdit: true,
    versions: [version],
    selectedVersion: {
      ...version,
      schemaVersion: "uniz-planner.v1",
      loadout: createEmptyPlannerLoadout(),
      approvedVisibility: "PUBLIC",
    },
  };
}
type Element = { type: unknown; props: Record<string, unknown> };
function flatten(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...flatten(element.props.children)];
}

beforeEach(() => {
  boundary.access = { user: member, status: "AUTHENTICATED", preview: false, mayCreate: true };
  boundary.detail.mockReset().mockResolvedValue(build());
  boundary.library.mockReset().mockResolvedValue({ owned: [], hive: [], public: [] });
  boundary.notFound.mockClear();
});

describe("Planner library archive navigation", () => {
  it.each([undefined, "0", "true", "01", ["1"], ["1", "0"]])(
    "defaults unsupported archived input %s to active owned builds",
    async (archived) => {
      const rendered = flatten(await BuildLabPage({ searchParams: Promise.resolve({ archived }) }));
      expect(boundary.library).toHaveBeenCalledExactlyOnceWith(member, {
        query: "",
        archived: false,
        ownedCursor: undefined,
        hiveCursor: undefined,
        publicCursor: undefined,
      });
      expect(rendered.find((element) => element.props.children === "보관함")?.props.href).toBe(
        "/lab?archived=1",
      );
    },
  );

  it("preserves the archive and query for search, reset and every group pager while switching own views from page one", async () => {
    boundary.library.mockResolvedValueOnce({
      owned: [],
      hive: [],
      public: [],
      nextCursors: { owned: "owned-next", hive: "hive-next", public: "public-next" },
    });
    const rendered = flatten(
      await BuildLabPage({
        searchParams: Promise.resolve({
          archived: "1",
          q: " #보스 ",
          ownedCursor: "owned-current",
          hiveCursor: "hive-current",
          publicCursor: "public-current",
        }),
      }),
    );
    expect(boundary.library).toHaveBeenCalledExactlyOnceWith(member, {
      query: "보스",
      archived: true,
      ownedCursor: "owned-current",
      hiveCursor: "hive-current",
      publicCursor: "public-current",
    });
    expect(
      rendered.find((element) => element.type === "input" && element.props.name === "archived")
        ?.props,
    ).toMatchObject({ type: "hidden", value: "1" });
    expect(rendered.find((element) => element.props.children === "검색 초기화")?.props.href).toBe(
      "/lab?archived=1",
    );
    for (const title of ["보관한 빌드", "하이브 공유", "공개 빌드"]) {
      const list = rendered.find((element) => element.props.title === title)!;
      for (const name of ["nextHref", "firstHref"]) {
        const url = new URL(list.props[name] as string, "https://hive.example");
        expect(url.searchParams.get("q")).toBe("보스");
        expect(url.searchParams.get("archived")).toBe("1");
      }
    }
    for (const label of ["내 빌드", "보관함"]) {
      const link = rendered.find((element) => element.props.children === label)!;
      const url = new URL(link.props.href as string, "https://hive.example");
      expect(url.searchParams.has("ownedCursor")).toBe(false);
      expect(url.searchParams.get("q")).toBe("보스");
      expect(url.searchParams.get("hiveCursor")).toBe("hive-current");
      expect(url.searchParams.get("publicCursor")).toBe("public-current");
      expect(url.searchParams.get("archived")).toBe(label === "보관함" ? "1" : null);
    }
  });

  it("does not offer a personal archive view to anonymous visitors", async () => {
    boundary.access = { user: null, status: "GUEST", preview: false, mayCreate: false };
    const rendered = flatten(
      await BuildLabPage({ searchParams: Promise.resolve({ archived: "1" }) }),
    );
    expect(rendered.some((element) => element.props.children === "보관함")).toBe(false);
    expect(rendered.some((element) => element.props.title === "보관한 빌드")).toBe(false);
    expect(rendered.some((element) => element.props.title === "공개 빌드")).toBe(true);
  });
});

describe("Planner route authorization boundaries", () => {
  it("renders the selected approved content, moderator rating and visitor-only like count", async () => {
    const data = build();
    data.isOwner = false;
    data.mayEdit = false;
    data.recommendationScore = 4;
    data.recommendationNote = "검토한 버전";
    data.likeCount = 3;
    data.canLike = false;
    data.selectedVersion.bodyDocument = {
      schemaVersion: "uniz-content.v1",
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Approved body" }] }],
    };
    data.selectedVersion.youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    boundary.detail.mockResolvedValueOnce(data);
    const rendered = flatten(await detailPage());
    expect(rendered.find((element) => element.type === boundary.contentBody)?.props).toMatchObject({
      document: data.selectedVersion.bodyDocument,
      text: data.description,
    });
    expect(rendered.find((element) => element.type === boundary.video)?.props).toEqual({
      url: data.selectedVersion.youtubeUrl,
    });
    expect(rendered.find((element) => element.type === boundary.like)?.props).toMatchObject({
      kind: "BUILD",
      targetId: id,
      initialCount: 3,
      canLike: false,
    });
  });
  it.each(pages)(
    "keeps %s verification outages on retry UI before repository access",
    async (_name, page) => {
      boundary.access = { ...boundary.access, status: "UNAVAILABLE", retryAfterSeconds: 75 };
      const result = await page();
      expect(result.type).toBe(boundary.retry);
      expect(result.props).toEqual({ retryAfterSeconds: 75 });
      expect(boundary.detail).not.toHaveBeenCalled();
      expect(boundary.notFound).not.toHaveBeenCalled();
    },
  );

  it.each(["LEFT", "REAUTH_REQUIRED"] as const)(
    "keeps %s blocked on all routes without reading builds",
    async (status) => {
      boundary.access = { ...boundary.access, status };
      for (const [, page] of pages) {
        const result = await page();
        expect(result.type).toBe(boundary.blocked);
        expect(result.props).toMatchObject({ mode: status === "LEFT" ? "LEFT" : "REAUTH" });
      }
      expect(boundary.detail).not.toHaveBeenCalled();
    },
  );

  it.each(["missing", "other-owner", "unsupported"] as const)(
    "returns 404 for %s editing instead of rendering an editable loadout",
    async (kind) => {
      const data = build();
      if (kind === "other-owner") data.mayEdit = false;
      if (kind === "unsupported") data.selectedVersion.loadout = null;
      boundary.detail.mockResolvedValueOnce(kind === "missing" ? null : data);
      await expect(editPage()).rejects.toThrow("NOT_FOUND");
      expect(boundary.notFound).toHaveBeenCalledTimes(1);
    },
  );

  it("forwards a guest's selected PUBLIC version with no fabricated identity or owner controls", async () => {
    boundary.access = { user: null, status: "GUEST", preview: false, mayCreate: false };
    const data = build();
    data.isOwner = false;
    data.mayEdit = false;
    boundary.detail.mockResolvedValueOnce(data);
    const rendered = flatten(await detailPage("1"));
    expect(boundary.detail).toHaveBeenCalledExactlyOnceWith(null, id, 1);
    expect(rendered.some((element) => element.type === boundary.loadout)).toBe(true);
    expect(
      rendered.some(
        (element) => element.type === boundary.ownerControls || element.type === boundary.editor,
      ),
    ).toBe(false);
  });

  it("preserves an unsupported saved version as a readable fallback without exposing an editor", async () => {
    const data = build();
    data.selectedVersion.loadout = null;
    boundary.detail.mockResolvedValueOnce(data);
    const rendered = flatten(await detailPage());
    expect(boundary.notFound).not.toHaveBeenCalled();
    expect(
      rendered.some(
        (element) => element.type === boundary.loadout || element.type === boundary.editor,
      ),
    ).toBe(false);
    expect(rendered.some((element) => element.props.title === "이전 형식의 빌드 기록입니다")).toBe(
      true,
    );
  });

  it.each([
    ["detail", () => detailPage()],
    ["edit", () => editPage()],
  ] as const)(
    "renders retry UI when the %s repository is temporarily unavailable",
    async (_name, page) => {
      boundary.detail.mockRejectedValueOnce(new Error("Storage unavailable"));
      expect((await page()).type).toBe(boundary.retry);
      expect(boundary.notFound).not.toHaveBeenCalled();
    },
  );
});

describe("Planner route version input", () => {
  it.each(["0", "-1", "1.5", "2147483648", ["2"]])(
    "rejects invalid version-list cursor %s before repository access",
    async (before) => {
      await expect(
        BuildPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ before }) }),
      ).rejects.toThrow("NOT_FOUND");
      expect(boundary.detail).not.toHaveBeenCalled();
    },
  );

  it("keeps the chosen fixed version while paging only version metadata", async () => {
    await BuildPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ version: "2", before: "20" }),
    });
    expect(boundary.detail).toHaveBeenCalledExactlyOnceWith(member, id, 2, 20);
  });
  it.each([
    ["version", detailPage],
    ["from", editPage],
  ] as const)("accepts and forwards the maximum PostgreSQL %s number", async (_name, page) => {
    await page("2147483647");
    expect(boundary.detail).toHaveBeenCalledExactlyOnceWith(member, id, 2_147_483_647);
  });

  it.each([
    ["version", detailPage],
    ["from", editPage],
  ] as const)(
    "rejects zero, repeated %s and overflowing input before repository access",
    async (_name, page) => {
      for (const value of ["0", ["1", "2"], "2147483648"] as (string | string[])[]) {
        await expect(page(value)).rejects.toThrow("NOT_FOUND");
      }
      expect(boundary.detail).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["detail", detailPage],
    ["edit", editPage],
  ] as const)("rejects a malformed %s build ID before repository access", async (_name, page) => {
    await expect(page(undefined, "malformed-build-id")).rejects.toThrow("NOT_FOUND");
    expect(boundary.detail).not.toHaveBeenCalled();
  });
});

describe("Planner creation access", () => {
  it("renders an approved member editor with live saving enabled", async () => {
    const editor = flatten(await NewBuildPage()).find(
      (element) => element.type === boundary.editor,
    );
    expect(editor?.props).toEqual({ preview: false });
    expect(boundary.detail).not.toHaveBeenCalled();
  });

  it("renders a mock editor only as preview and does not query live builds", async () => {
    boundary.access = {
      user: { ...member, id: "demo-member", isMock: true },
      status: "AUTHENTICATED",
      preview: true,
      mayCreate: false,
    };
    const editor = flatten(await NewBuildPage()).find(
      (element) => element.type === boundary.editor,
    );
    expect(editor?.props).toEqual({ preview: true });
    expect(boundary.detail).not.toHaveBeenCalled();
  });

  it("keeps applicants and anonymous users out of the saving editor", async () => {
    boundary.access = {
      user: { ...member, role: "APPLICANT" },
      status: "AUTHENTICATED",
      preview: false,
      mayCreate: false,
    };
    const pending = await NewBuildPage();
    expect(pending.type).toBe(boundary.blocked);
    expect(pending.props.mode).toBe("PENDING");
    boundary.access = { user: null, status: "GUEST", preview: false, mayCreate: false };
    const guest = await NewBuildPage();
    expect(guest.type).toBe(boundary.blocked);
    expect(guest.props.mode).toBe("REAUTH");
    expect(boundary.detail).not.toHaveBeenCalled();
  });
});
