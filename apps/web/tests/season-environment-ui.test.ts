import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { SeasonRecord } from "../src/lib/server/season-administration";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (value: unknown) => [value, vi.fn()],
  useRef: () => ({ current: null }),
  useEffect: vi.fn(),
}));
vi.mock("@/lib/admin-format", () => import("../src/lib/admin-format"));
vi.mock("@/lib/scenario-presets", () => import("../src/lib/scenario-presets"));
vi.mock("../src/app/admin/admin-form", () => ({ AdminForm: "AdminForm" }));
vi.mock("../src/app/admin/calendar-field", () => ({ CalendarField: "CalendarField" }));
vi.mock("../src/app/admin/seasons/actions", () => ({ saveSeasonAdministration: vi.fn() }));

import { SeasonSetupForm } from "../src/app/admin/seasons/season-setup-form";

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
function fixture(patch: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    id: "season-a",
    seasonNumber: 70,
    name: "UNIZ",
    scenarioId: "endless-dream",
    serverId: "server-a",
    status: "ACTIVE",
    startsAt: "2026-10-08T00:30:00.000Z",
    settlementAt: null,
    voteClosesAt: null,
    updatedAt: "2026-10-08T00:00:00.000Z",
    approvalStatus: "APPROVED",
    createdById: null,
    reviewedById: null,
    reviewedAt: null,
    currentPhaseOrder: 1,
    gravityContentEnabled: false,
    serverType: "PERMANENT",
    trancePhenomenon: "GRAVITY_ABYSS",
    migrationOpen: false,
    ...patch,
  };
}
function options(nodes: Element[], name: string) {
  const select = nodes.find((node) => node.type === "select" && node.props.name === name)!;
  return elements(select.props.children)
    .filter((node) => node.type === "option")
    .map((node) => node.props.value);
}

beforeEach(() => vi.clearAllMocks());

describe("season environment controls", () => {
  it("creates explicit seasonal and no-trance defaults with all five named themes", () => {
    const nodes = elements(SeasonSetupForm({}));
    expect(nodes.find((node) => node.props.name === "serverType")?.props.value).toBe("SEASONAL");
    expect(nodes.find((node) => node.props.name === "trancePhenomenon")?.props.value).toBe("NONE");
    expect(options(nodes, "trancePhenomenon")).toEqual([
      "NONE",
      "LUNAR_ORACLE",
      "STARFALL_INVERSION",
      "LUNAR_REVELRY",
      "ABERRANT_PROGENY",
      "GRAVITY_ABYSS",
    ]);
    expect(options(nodes, "serverType")).toEqual(["SEASONAL", "PERMANENT"]);
    expect(nodes.some((node) => node.props.name === "gravityContentEnabled")).toBe(false);
  });

  it("retains unknown legacy selections without interpreting the old gravity flag", () => {
    const nodes = elements(
      SeasonSetupForm({
        season: fixture({
          serverType: "UNKNOWN",
          trancePhenomenon: "UNKNOWN",
          gravityContentEnabled: true,
        }),
      }),
    );
    expect(nodes.find((node) => node.props.name === "serverType")?.props.value).toBe("UNKNOWN");
    expect(nodes.find((node) => node.props.name === "trancePhenomenon")?.props.value).toBe(
      "UNKNOWN",
    );
    expect(options(nodes, "trancePhenomenon")).toContain("UNKNOWN");
  });

  it("hides permanent phase and settlement controls and lets active permanent records archive", () => {
    const tree = SeasonSetupForm({ season: fixture() });
    const nodes = elements(tree);
    expect(text(tree)).toContain("영구 운영 · 휴식기");
    expect(text(tree)).not.toContain("단계 자동 구성");
    expect(text(tree)).not.toContain("정산일 추가");
    expect(nodes.find((node) => node.props.name === "settlementAt")?.props).toMatchObject({
      type: "hidden",
      value: "",
    });
    expect(options(nodes, "status")).toEqual(["ACTIVE", "ARCHIVED"]);
  });

  it("exposes the migration toggle only to an administrator editing an approved permanent record", () => {
    expect(
      elements(SeasonSetupForm({ season: fixture(), canManageMigration: true })).some(
        (node) => node.props.name === "migrationOpen",
      ),
    ).toBe(true);
    for (const props of [
      { season: fixture() },
      { season: fixture(), canManageMigration: true, request: true },
      { season: fixture({ serverType: "SEASONAL" }), canManageMigration: true },
      { season: fixture({ approvalStatus: "PENDING" }), canManageMigration: true },
      { season: fixture({ status: "ARCHIVED" }), canManageMigration: true },
      { canManageMigration: true },
    ]) {
      expect(
        elements(SeasonSetupForm(props)).some((node) => node.props.name === "migrationOpen"),
      ).toBe(false);
    }
  });
});
