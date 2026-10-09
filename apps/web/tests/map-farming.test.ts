import { describe, expect, it } from "vitest";
import { GEAR_CATALOG } from "@uniz/build-engine";
import { ONCE_HUMAN_MAPS } from "@uniz/integrations";
import {
  FARMING_TARGETS,
  getFarmingMapLink,
  getFarmingTarget,
  getFarmingTargets,
} from "../src/lib/map-farming";
import { getMapView, mapHref } from "../src/lib/map-navigation";
import fusionMaterials from "../../../packages/build-engine/data/fusion-guide-materials.json";

describe("verified farming filters", () => {
  it("links an exact catalog ID to its item-specific map filter", () => {
    const link = getFarmingMapLink({
      kind: "deviant",
      id: "deviant-dr-teddy",
      scenario: "MANIBUS",
    });
    expect(link).toEqual({ href: "/map?scenario=MANIBUS&target=dr-teddy", label: "지도에서 찾기" });
    const view = getMapView({ scenario: "MANIBUS", target: "dr-teddy" });
    expect(view.farmingTarget?.label).toBe("닥터 테디");
    expect(new URL(view.embedUrl).searchParams.get("types")).toBe(
      "deviations_dr._teddy,securementsilos",
    );
    expect(new URL(view.originalUrl).searchParams.get("types")).toBe(
      "deviations_dr._teddy,securementsilos",
    );
    expect(view.href).toBe(link?.href);
  });

  it("does not match an unknown item or a furniture item by its display name", () => {
    expect(getFarmingMapLink({ kind: "deviant", id: "retired-id", name: "닥터 테디" })).toBeNull();
    expect(
      getFarmingMapLink({ kind: "material", id: "furniture-1210111", name: "토끼" }),
    ).toBeNull();
    expect(getFarmingTarget("<script>")).toBeNull();
    expect(mapHref("WINTER", null, "bad&types=all")).toBe("/map?scenario=WINTER");
  });

  it("identifies an automatically selected map when the build has no scenario", () => {
    expect(getFarmingMapLink({ kind: "deviant", id: "deviant-dr-teddy", scenario: null })).toEqual({
      href: "/map?scenario=MANIBUS&target=dr-teddy",
      label: "지도에서 찾기 · 땃쥐",
    });
  });

  it("labels shared animal distributions instead of pretending to filter by sex", () => {
    const stag = getFarmingMapLink({
      kind: "material",
      id: "fusion-material-30001121",
      scenario: "MANIBUS",
    });
    const doe = getFarmingMapLink({
      kind: "material",
      id: "fusion-material-30001122",
      scenario: "MANIBUS",
    });
    expect(stag?.href).toBe("/map?scenario=MANIBUS&target=animal-deer");
    expect(doe).toEqual(stag);
    expect(stag?.label).toBe("지도에서 찾기 · 사슴 공통");
    expect(
      getMapView({ scenario: "MANIBUS", target: "animal-deer" }).farmingTarget?.scopeNote,
    ).toContain("수사슴·어미 사슴");
    expect(
      getFarmingMapLink({ kind: "material", id: "fusion-material-30001141", scenario: "MANIBUS" })
        ?.label,
    ).toBe("지도에서 찾기 · 염소·양 공통");
  });

  it("filters a mineral target without fabricating a local ingredient catalog ID", () => {
    const view = getMapView({ scenario: "MANIBUS", target: "resource-gold-ore" });
    expect(view.farmingTarget?.label).toBe("금광석");
    expect(new URL(view.embedUrl).searchParams.get("types")).toBe("gold_ore");
    expect(view.farmingTarget?.itemIds).toEqual([]);
  });

  it("normalizes repeated values and safely rejects arbitrary target queries", () => {
    expect(
      getMapView({ scenario: "MANIBUS", target: [" dr-teddy ", "bad"] }).farmingTarget?.key,
    ).toBe("dr-teddy");
    const view = getMapView({ scenario: "WINTER", target: "https://evil.example/?types=all" });
    expect(view.invalidTarget).toBe(true);
    expect(view.farmingTarget).toBeNull();
    expect(new URL(view.embedUrl).search).toBe("");
    expect(view.href).toBe("/map?scenario=WINTER");
    expect(
      getMapView({ scenario: "WINTER", target: "unverified", share: "route_1" }).shareCode,
    ).toBeNull();
  });

  it("URL-encodes apostrophes in real provider IDs without changing the marker type", () => {
    const view = getMapView({ scenario: "ENDLESS_DREAM", target: "butterfly" });
    expect(new URL(view.embedUrl).searchParams.get("types")?.split(",")).toContain(
      "deviations_butterfly's_emissary",
    );
    expect(view.embedUrl).toContain("%27");
  });

  it("isolates farming markers from shared drawings and preserves the selected target", () => {
    const view = getMapView({ scenario: "MANIBUS", target: "dr-teddy", share: "route_1" });
    expect(view.shareOverridden).toBe(true);
    expect(view.shareCode).toBeNull();
    expect(new URL(view.embedUrl).searchParams.has("share")).toBe(false);
    expect(new URL(view.embedUrl).searchParams.get("types")).toBe(
      "deviations_dr._teddy,securementsilos",
    );
    expect(mapHref("WINTER", "route_1", "dr-teddy")).toBe("/map?scenario=WINTER&target=dr-teddy");
  });

  it("keeps registry IDs unique and only links existing combat catalog entries", () => {
    expect(FARMING_TARGETS.length).toBeGreaterThan(0);
    expect(new Set(FARMING_TARGETS.map((target) => target.key)).size).toBe(FARMING_TARGETS.length);
    for (const target of FARMING_TARGETS) {
      expect(Object.values(target.markerTypes).flat().length).toBeGreaterThan(0);
      for (const type of Object.values(target.markerTypes).flat())
        expect(type).toMatch(/^[a-zA-Z0-9_.'-]{1,128}$/);
      if (target.kind === "deviant") {
        for (const id of target.itemIds) {
          expect(GEAR_CATALOG.find((item) => item.id === id)?.kind).toBe("DEVIANT");
        }
      }
      if (target.kind === "material") {
        for (const id of target.itemIds) {
          expect(fusionMaterials.materials.find((item) => item.id === id)?.type).toBe("ANIMAL");
        }
      }
    }
    for (const map of ONCE_HUMAN_MAPS) {
      for (const target of getFarmingTargets(map.key)) {
        expect(getMapView({ scenario: map.key, target: target.key }).farmingTarget).toBe(target);
      }
    }
    for (const furniture of fusionMaterials.materials.filter((item) => item.type === "FURNITURE")) {
      expect(getFarmingMapLink({ kind: "material", id: furniture.id })).toBeNull();
    }
  });
});
