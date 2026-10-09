import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { OperationalData, OperationalSeason } from "../src/lib/data/operational-types";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (value: unknown) => [value, vi.fn()],
  useTransition: () => [false, vi.fn()],
}));
vi.mock("next/link", () => ({ default: "Link" }));
vi.mock("@/lib/operational-actions", () => ({ mutateOperationalData: vi.fn() }));
vi.mock("@/lib/admin-format", () => import("../src/lib/admin-format"));
vi.mock("@/lib/party-content", () => import("../src/lib/party-content"));
vi.mock("../src/components/auth-retry-notice", () => ({ AuthRetryNotice: "AuthRetryNotice" }));

import { LiveDashboard } from "../src/components/live-operations";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Element).props.children);
}
function data(): OperationalData {
  return {
    source: "POSTGRESQL",
    asOf: "2026-10-08T00:00:00.000Z",
    currentSeason: null,
    nextOperation: {
      id: "party-a",
      title: "응축기 파티",
      description: "모집",
      type: "OTHER",
      contentKey: "CONDENSER",
      startsAt: "2026-10-08T12:00:00.000Z",
      capacity: 4,
      goingCount: 1,
      maybeCount: 0,
      myRsvp: "GOING",
      members: [],
      mayRespond: true,
      mayGo: false,
      mayMaybe: false,
      responseNotice:
        "트랜스 변경으로 모집이 중단되었습니다. 기존 참가자는 불참으로 변경할 수 있습니다.",
    },
    migration: {
      total: 0,
      ready: 0,
      percent: 0,
      counts: { UNDECIDED: 0, JOINING: 0, PRE_REGISTERED: 0, READY: 0, MIGRATED: 0 },
      myStatus: null,
      mayChange: false,
      members: [],
    },
    vote: null,
    announcements: [],
    memberCount: 0,
    pendingCount: 0,
    recentBuilds: [],
    history: [],
  };
}
function section(model: OperationalData, name: string) {
  const tree = LiveDashboard({ data: model, role: "MEMBER" });
  const child = elements(tree).find(
    (node) => typeof node.type === "function" && node.type.name === name,
  )!;
  return (child.type as (props: Record<string, unknown>) => unknown)(child.props);
}

describe("live season summary and party responses", () => {
  it("offers only withdrawal after a content theme becomes unavailable", () => {
    const model = data();
    const tree = section(model, "NextOperation");
    const buttons = elements(tree).filter((node) => node.type === "button");
    expect(buttons.map((node) => [text(node), node.props.disabled])).toEqual([
      ["참가", true],
      ["미정", true],
      ["불참", false],
    ]);
    expect(text(tree)).toContain(model.nextOperation!.responseNotice);
    model.nextOperation!.mayRespond = false;
    expect(
      elements(section(model, "NextOperation"))
        .filter((node) => node.type === "button")
        .every((node) => node.props.disabled),
    ).toBe(true);
  });

  it("shows permanent operation and rest without a settlement or phase strip", () => {
    const model = data();
    model.currentSeason = {
      id: "season-a",
      seasonNumber: 70,
      name: "UNIZ",
      status: "ACTIVE",
      serverType: "PERMANENT",
      trancePhenomenon: "GRAVITY_ABYSS",
      scenario: "무한의 꿈",
      server: "E_Dream-X0070",
      startsAt: "2026-10-08T00:00:00.000Z",
      settlementAt: "2026-11-01T00:00:00.000Z",
      daysRemaining: 24,
      phases: [{ id: "old-phase", name: "옛 단계", order: 3, startsAt: null, endsAt: null }],
      currentPhaseId: "old-phase",
      currentPhaseOrder: 3,
      myMembership: true,
    } satisfies OperationalSeason;
    const tree = section(model, "CurrentSeason");
    expect(text(tree)).toContain("영구 운영 · 휴식기");
    expect(text(tree)).toContain("운영 시작");
    expect(text(tree)).toContain("중력의 심연");
    expect(text(tree)).not.toContain("SETTLEMENT");
    expect(text(tree)).not.toContain("옛 단계");
    expect(elements(tree).some((node) => node.type === "ol")).toBe(false);
    expect(text(section(model, "Migration"))).toContain(
      "운영진이 하이브 이동 신청을 열면 등록할 수 있습니다.",
    );
    expect(text(section(model, "Migration"))).not.toContain("현재 시즌 단계");
  });
});
