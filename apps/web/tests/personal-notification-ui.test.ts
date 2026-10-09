import { describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/mocks/announcements", () => ({
  mockAnnouncements: [
    {
      id: "demo-season",
      title: "예시 시즌 공지",
      tag: "SEASON",
      publishedAt: new Date("2026-10-06T09:00:00Z"),
    },
    {
      id: "demo-party",
      title: "예시 파티 공지",
      tag: "OPS",
      publishedAt: new Date("2026-10-06T09:00:00Z"),
    },
  ],
}));
vi.mock("@/lib/mocks/current-season", () => import("../src/lib/mocks/current-season"));
import { PersonalNotifications } from "../src/components/personal-notifications";
import type { PersonalNotificationResult } from "../src/lib/personal-notification-types";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node
    ? text((node as Element).props.children)
    : "";
}
function render(result: PersonalNotificationResult | null) {
  const onRetry = vi.fn();
  const onNavigate = vi.fn();
  const tree = PersonalNotifications({ result, onRetry, onNavigate });
  return { nodes: elements(tree), content: text(tree), onRetry, onNavigate };
}

describe("on-site personal notification presentation", () => {
  it("links exact records and closes on navigation without unread or delivery claims", () => {
    const view = render({
      mode: "LIVE",
      data: {
        items: [
          {
            id: "party-change:event-one",
            kind: "PARTY_CHANGE",
            title: "모집 변경",
            description: "내 파티 모집 정보 변경",
            href: "/ops/exact-party",
            occurredAt: "2026-10-08T09:00:00Z",
          },
        ],
        enabledKinds: ["PARTY_CHANGE"],
        asOf: "2026-10-08T10:00:00Z",
      },
    });
    const link = view.nodes.find((node) => node.props.href === "/ops/exact-party")!;
    (link.props.onClick as () => void)();
    expect(view.onNavigate).toHaveBeenCalledTimes(1);
    expect(view.content).toContain("알림 창을 열 때");
    expect(view.content).not.toMatch(/읽지 않|읽지않|웹 푸시|Discord 발송/);
    expect(view.content).not.toContain("KST KST");
    expect(view.nodes.some((node) => node.props.href === "/settings#notifications")).toBe(true);
  });
  it("explains disabled preferences and provides an accessible settings path", () => {
    const view = render({
      mode: "LIVE",
      data: { items: [], enabledKinds: [], asOf: "2026-10-08T10:00:00Z" },
    });
    expect(view.content).toContain("모두 꺼두었습니다");
    expect(
      view.nodes.find((node) => node.props.href === "/settings#notifications")?.props.prefetch,
    ).toBe(false);
  });
  it("clearly labels examples and respects the preview announcement preference", () => {
    const demo = render({ mode: "DEMO", enabledKinds: ["ANNOUNCEMENT"] });
    expect(demo.content).toContain("실제 개인 알림이 아닌 예시");
    expect(demo.nodes.filter((node) => node.type === "li")).toHaveLength(2);
    const disabled = render({ mode: "DEMO", enabledKinds: [] });
    expect(disabled.content).toContain("예시 공지 알림을 꺼두었습니다");
    expect(disabled.nodes.filter((node) => node.type === "li")).toHaveLength(0);
  });
  it("announces loading and keeps temporary failures away from example data", () => {
    const loading = render(null);
    expect(loading.nodes.some((node) => node.props.role === "status")).toBe(true);
    const failure = render({ mode: "ERROR" });
    expect(failure.content).toContain("로그인은 유지됩니다");
    expect(failure.content).not.toContain("예시 시즌 공지");
    const retry = failure.nodes.find((node) => node.type === "button")!;
    (retry.props.onClick as () => void)();
    expect(failure.onRetry).toHaveBeenCalledTimes(1);
  });
  it.each(["PENDING", "LEFT", "REAUTH"] as const)(
    "shows %s authorization state without live content or misleading retry",
    (mode) => {
      const view = render({ mode });
      expect(view.nodes.some((node) => node.props.role === "status")).toBe(true);
      expect(view.nodes.some((node) => node.type === "li")).toBe(false);
      expect(view.nodes.some((node) => node.type === "button")).toBe(false);
    },
  );
});
