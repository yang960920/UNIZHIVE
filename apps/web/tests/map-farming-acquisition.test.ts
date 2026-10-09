import { describe, expect, it } from "vitest";
import { ONCE_HUMAN_MAPS } from "@uniz/integrations";
import { FARMING_TARGETS } from "../src/lib/map-farming";
import {
  getFarmingAcquisition,
  getFarmingItemAcquisition,
} from "../src/lib/map-farming-acquisition";
import { FarmingAcquisitionNote } from "../src/components/farming-acquisition-note";
import { GearFarmingMapLink } from "../src/components/build-planner/gear-farming-map-link";
import { getMapView } from "../src/lib/map-navigation";
import type { ReactElement } from "react";
import { vi } from "vitest";

vi.mock("@/lib/map-farming", () => import("../src/lib/map-farming"));

type Element = ReactElement<Record<string, unknown>>;
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...nodes(element.props.children)];
}

describe("source-grounded acquisition guidance", () => {
  it("covers every registered combat deviant with scoped guidance and readable sources", () => {
    for (const target of FARMING_TARGETS.filter((target) => target.kind === "deviant")) {
      for (const map of ONCE_HUMAN_MAPS) {
        const guide = getFarmingAcquisition(target.key, map.key);
        expect(guide?.summary.trim().length, `${target.label}/${map.key}`).toBeGreaterThan(0);
        expect(guide?.sources.length).toBeGreaterThan(0);
        for (const source of guide!.sources) {
          expect(new URL(source.url).protocol).toBe("https:");
          expect(source.label.trim().length).toBeGreaterThan(0);
        }
        expect(getMapView({ scenario: map.key, target: target.key }).farmingGuide).toEqual(guide);
      }
    }
  });

  it("keeps the animal wolf's variable distribution separate from the combat deviant", () => {
    const animal = getFarmingItemAcquisition({
      kind: "material",
      id: "fusion-material-30001131",
      scenario: "MANIBUS",
    });
    const combat = getFarmingItemAcquisition({
      kind: "deviant",
      id: "deviant-99000011",
      scenario: "MANIBUS",
    });
    expect(animal?.summary).toContain("항상 있는 것은 아닙니다");
    expect(animal?.summary).toContain("자원 추적");
    expect(animal?.scopeLabel).toContain("재출현 시간 미확인");
    expect(combat?.summary).toContain("섀도우 하운드");
    expect(combat?.summary).not.toContain("자원 추적");
  });

  it("distinguishes Teddy's hidden reward and the other scenarios' reported routes", () => {
    const manibus = getFarmingAcquisition("dr-teddy", "MANIBUS")!;
    expect(manibus.summary).toMatch(/히든 (구역|스테이지)/);
    expect(manibus.summary).toContain("쓰레기 채집");
    expect(manibus.summary).not.toMatch(/PvP 전용|[1-6]단계|[1-6]페이즈/);
    expect(getFarmingAcquisition("dr-teddy", "WINTER")?.summary).toContain("PSI");
    expect(getFarmingAcquisition("dr-teddy", "ENDLESS_DREAM")?.scopeLabel).toContain("사례");
    expect(getFarmingAcquisition("dr-teddy", "ENDLESS_DREAM")?.summary).toContain("마스터 히든");
    expect(getFarmingAcquisition("dr-teddy", "ENDLESS_DREAM")?.summary).toContain("영구 서버");
    expect(getFarmingAcquisition("dr-teddy", "DEVIATION")?.summary).toContain("직접 포획");
    const locationUrl = new URL(manibus.locationUrl!);
    expect(locationUrl.hostname).toBe("oncehuman.th.gl");
    expect(locationUrl.searchParams.get("types")).toBe("securementsilos");
    expect(manibus.location?.label).toContain("전체");
  });

  it("does not carry a different scenario's source-map shortcut into unverified guidance", () => {
    const winter = getFarmingAcquisition("99000026", "WINTER")!;
    const manibus = getFarmingAcquisition("99000026", "MANIBUS")!;
    expect(winter.locationUrl).toBeTruthy();
    expect(manibus.scopeLabel).toContain("세부 경로 미확인");
    expect(manibus.locationUrl).toBeUndefined();
    expect(manibus.location).toBeUndefined();
  });

  it("rejects unknown lookups including inherited object properties", () => {
    for (const key of ["unknown", "__proto__", "constructor", "<script>"]) {
      expect(getFarmingAcquisition(key, "MANIBUS")).toBeNull();
    }
    expect(getFarmingItemAcquisition({ kind: "material", id: "furniture-unknown" })).toBeNull();
    expect(FarmingAcquisitionNote({ guide: null })).toBeNull();
  });

  it("renders short guidance alongside the item link and safely opens its evidence", () => {
    const tree = GearFarmingMapLink({
      kind: "deviant",
      id: "deviant-dr-teddy",
      scenario: "MANIBUS",
    });
    const note = nodes(tree).find((element) => element.type === FarmingAcquisitionNote)!;
    expect(note.props.guide).toEqual(getFarmingAcquisition("dr-teddy", "MANIBUS"));
    const links = nodes(
      FarmingAcquisitionNote({
        guide: note.props.guide as ReturnType<typeof getFarmingAcquisition>,
      }),
    ).filter((element) => element.type === "a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.props).toMatchObject({ target: "_blank", rel: "noopener noreferrer" });
    }
  });
});
