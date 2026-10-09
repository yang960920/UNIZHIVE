import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchFixture } from "./dps-research-fixture";
const boundary = vi.hoisted(() => ({
  editor: vi.fn(),
  mine: vi.fn(),
  reviews: vi.fn(),
  detail: vi.fn(),
  admin: vi.fn(),
  Form: function Form() {},
  My: function My() {},
  Review: function Review() {},
  Detail: function Detail() {},
  Failure: function Failure() {},
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND_BOUNDARY");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: boundary.notFound }));
vi.mock("@/components/game-info/research-forms", () => ({ DpsResearchForm: boundary.Form }));
vi.mock("@/components/game-info/research-views", () => ({
  MyDpsDirectory: boundary.My,
  AdminDpsDirectory: boundary.Review,
  AdminDpsDetail: boundary.Detail,
  DpsResearchFailure: boundary.Failure,
}));
vi.mock("@/lib/server/admin", () => ({ requireAdmin: boundary.admin }));
vi.mock("@/lib/server/dps-research-repository", () => ({
  getDpsEditorData: boundary.editor,
  getMyDpsRecords: boundary.mine,
  getDpsReviewDirectory: boundary.reviews,
  getDpsDetail: boundary.detail,
  DpsResearchError: class DpsResearchError extends Error {
    code: string;
    constructor(code: string) {
      super("안전한 연결 안내");
      this.code = code;
    }
  },
}));
import NewPage from "../src/app/db/new/page";
import MyPage from "../src/app/db/mine/page";
import EditPage from "../src/app/db/[category]/[slug]/edit/page";
import AdminPage from "../src/app/admin/database/page";
import AdminDetail from "../src/app/admin/database/[id]/page";
import { DpsResearchError } from "../src/lib/server/dps-research-repository";
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.editor.mockResolvedValue({ initial: null, buildVersions: [] });
  boundary.mine.mockResolvedValue({ items: [], page: 1, hasNext: false });
  boundary.reviews.mockResolvedValue({ items: [], page: 1, hasNext: false });
  boundary.detail.mockResolvedValue(researchFixture({ isOwner: false, canReview: true }));
  boundary.admin.mockResolvedValue({ id: "officer", role: "OFFICER" });
});
describe("DPS route ownership and version boundaries", () => {
  it("renders the new-record form from authorized editor data without creating or seeding a record", async () => {
    const rendered = nodes(await NewPage());
    expect(boundary.editor).toHaveBeenCalledWith();
    expect(rendered.find((node) => node.type === boundary.Form)?.props.data).toEqual({
      initial: null,
      buildVersions: [],
    });
  });
  it("returns a safe retry surface when editor or own-record access fails", async () => {
    boundary.editor.mockRejectedValueOnce(new DpsResearchError("FORBIDDEN"));
    expect(
      nodes(await NewPage()).find((node) => node.type === boundary.Failure)?.props.message,
    ).toBe("안전한 연결 안내");
    boundary.mine.mockRejectedValueOnce(new Error("postgres-private-diagnostics"));
    expect(
      nodes(await MyPage({})).find((node) => node.type === boundary.Failure)?.props.message,
    ).not.toContain("postgres");
  });
  it("uses only the requested owner-record page and rejects invalid or non-DPS editing URLs", async () => {
    await MyPage({ searchParams: Promise.resolve({ page: "3" }) });
    expect(boundary.mine).toHaveBeenCalledWith({ page: 3 });
    await expect(
      EditPage({ params: Promise.resolve({ category: "effect", slug: researchFixture().id }) }),
    ).rejects.toThrow("NOT_FOUND_BOUNDARY");
    await expect(
      EditPage({ params: Promise.resolve({ category: "dps", slug: "unknown" }) }),
    ).rejects.toThrow("NOT_FOUND_BOUNDARY");
    expect(boundary.editor).not.toHaveBeenCalled();
  });
  it("requires owner editing permission from the fresh editor DTO and handles denied record lookup as not-found", async () => {
    const record = researchFixture();
    boundary.editor.mockResolvedValueOnce({ initial: record, buildVersions: [] });
    const output = nodes(
      await EditPage({ params: Promise.resolve({ category: "dps", slug: record.id }) }),
    );
    expect(output.find((node) => node.type === boundary.Form)?.props.data).toMatchObject({
      initial: { id: record.id, recordUpdatedAt: record.recordUpdatedAt },
    });
    boundary.editor.mockResolvedValueOnce({
      initial: { ...record, isOwner: false },
      buildVersions: [],
    });
    await expect(
      EditPage({ params: Promise.resolve({ category: "dps", slug: record.id }) }),
    ).rejects.toThrow("NOT_FOUND_BOUNDARY");
  });
  it("guards the review queue independently and never offers a private-draft queue", async () => {
    await AdminPage({ searchParams: Promise.resolve({ status: "DRAFT", page: "2" }) });
    expect(boundary.admin).toHaveBeenCalledWith("database");
    expect(boundary.reviews).toHaveBeenCalledWith({ status: "PENDING", page: 2 });
    boundary.admin.mockRejectedValueOnce(new Error("DENIED"));
    await expect(AdminPage({})).rejects.toThrow("DENIED");
    expect(boundary.reviews).toHaveBeenCalledOnce();
  });
  it("reads the exact fixed version and keeps OFFICER review controls read-only", async () => {
    const record = researchFixture();
    const rendered = nodes(
      await AdminDetail({
        params: Promise.resolve({ id: record.id }),
        searchParams: Promise.resolve({ version: "2" }),
      }),
    );
    expect(boundary.detail).toHaveBeenCalledWith(record.id, 2);
    expect(rendered.find((node) => node.type === boundary.Detail)?.props).toMatchObject({
      administrator: false,
      reviewerId: "officer",
    });
    await expect(
      AdminDetail({
        params: Promise.resolve({ id: record.id }),
        searchParams: Promise.resolve({ version: "1.5" }),
      }),
    ).rejects.toThrow("NOT_FOUND_BOUNDARY");
    expect(boundary.detail).toHaveBeenCalledOnce();
  });
});
