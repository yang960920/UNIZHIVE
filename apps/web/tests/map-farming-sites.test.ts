import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnceHumanMapKey } from "@uniz/integrations";
import type { MapLocation } from "../src/lib/map-locations";
import { DUNGEON_LOCATIONS } from "../src/lib/map-location-dungeon-data";
import { MONOLITH_LOCATIONS } from "../src/lib/map-location-monolith-data";
import { FARMING_TARGETS } from "../src/lib/map-farming-targets";
import { getFarmingSites } from "../src/lib/map-farming-sites";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("../src/lib/map-locations", () => ({ getMapLocation: lookup }));

const mapKeys = ["MANIBUS", "WINTER", "ENDLESS_DREAM", "DEVIATION"] as const;
function fixture(key: string): MapLocation {
  return {
    key,
    label: key,
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: Object.fromEntries(mapKeys.map((map) => [map, ["securementsilos"]])),
    cameras: Object.fromEntries(
      mapKeys.map((map) => [map, { center: [10, 20] as const, zoom: 2 }]),
    ),
    guide: {
      summary: "획득 기회를 확인하는 장소입니다.",
      scopeLabel: "검사 자료",
      rewards: [],
      conditions: [],
      sources: [],
    },
    verifiedGuideScenarios: [],
  };
}

describe("scenario-scoped named farming sites", () => {
  beforeEach(() => lookup.mockReset().mockImplementation(fixture));

  it("resolves Teddy's winter PSI separately from the southern THETA routes", () => {
    expect(getFarmingSites("dr-teddy", "MANIBUS").map((site) => site.key)).toEqual([
      "silo-theta-manibus",
    ]);
    expect(getFarmingSites("dr-teddy", "ENDLESS_DREAM").map((site) => site.key)).toEqual([
      "silo-theta-manibus",
    ]);
    expect(getFarmingSites("dr-teddy", "WINTER").map((site) => site.key)).toEqual([
      "silo-psi-winter",
    ]);
    expect(getFarmingSites("dr-teddy", "DEVIATION")).toEqual([]);
  });

  it("keeps Delta in ED/winter and EX1 in Manibus/ED without cross-scenario fallbacks", () => {
    expect(getFarmingSites("99000026", "ENDLESS_DREAM")[0]?.key).toBe("silo-delta-winter");
    expect(getFarmingSites("99000026", "WINTER")[0]?.key).toBe("silo-delta-winter");
    expect(getFarmingSites("99000026", "MANIBUS")).toEqual([]);
    expect(getFarmingSites("99000066", "MANIBUS")[0]?.key).toBe("silo-ex1-manibus");
    expect(getFarmingSites("99000066", "WINTER")).toEqual([]);
    expect(getFarmingSites("99000040", "WINTER")[0]?.key).toBe("monolith-secret-servitor");
  });

  it("uses registered named places rather than broad provider-category filters", () => {
    const registered = new Set(
      [...DUNGEON_LOCATIONS, ...MONOLITH_LOCATIONS].map((site) => site.key),
    );
    let mappedRoutes = 0;
    for (const target of FARMING_TARGETS) {
      for (const map of mapKeys) {
        for (const site of getFarmingSites(target.key, map)) {
          mappedRoutes += 1;
          expect(registered.has(site.key), target.key + "/" + map).toBe(true);
          expect(site.key).not.toMatch(/^locations-/);
        }
      }
    }
    expect(mappedRoutes).toBe(23);
  });

  it("does not connect unresolved field routes or conflicting Butterfly ED guidance", () => {
    for (const target of [
      "butterfly",
      "99000003",
      "99000035",
      "99000038",
      "99000047",
      "99000049",
      "99000050",
      "99000053",
      "99000032",
    ]) {
      expect(getFarmingSites(target, "ENDLESS_DREAM")).toEqual([]);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(getFarmingSites("99000040", "MANIBUS")).toEqual([]);
  });

  it("hides a site until its scenario filter and focused camera are both available", () => {
    const site = fixture("silo-alpha-manibus");
    delete site.cameras!.ENDLESS_DREAM;
    lookup.mockReturnValue(site);
    expect(getFarmingSites("99000059", "ENDLESS_DREAM")).toEqual([]);
    expect(getFarmingSites("99000059", "MANIBUS")).toEqual([site]);
    site.cameras!.ENDLESS_DREAM = { center: [10, 20], zoom: 2 };
    delete site.markerTypes.ENDLESS_DREAM;
    expect(getFarmingSites("99000059", "ENDLESS_DREAM")).toEqual([]);
    site.markerTypes.ENDLESS_DREAM = [];
    expect(getFarmingSites("99000059", "ENDLESS_DREAM")).toEqual([]);
  });

  it("returns the actual location record and skips a missing registry entry", () => {
    const site = fixture("monolith-shadow-hound");
    lookup.mockReturnValue(site);
    expect(getFarmingSites("99000011", "ENDLESS_DREAM")[0]).toBe(site);
    lookup.mockReturnValue(null);
    expect(getFarmingSites("99000011", "ENDLESS_DREAM")).toEqual([]);
  });

  it("fails closed for unknown keys and inherited object properties", () => {
    for (const target of ["unknown", "__proto__", "constructor", "toString"]) {
      expect(getFarmingSites(target, "MANIBUS")).toEqual([]);
    }
    for (const invalid of ["unknown", "__proto__", "constructor", "toString"]) {
      expect(getFarmingSites("dr-teddy", invalid as OnceHumanMapKey)).toEqual([]);
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
