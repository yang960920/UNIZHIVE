import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ONCE_HUMAN_MAPS } from "@uniz/integrations";
import { getMapView, mapHref } from "../src/lib/map-navigation";
import {
  MAP_LOCATIONS,
  getLocationGuide,
  getMapLocation,
  getMapLocations,
  getMapLocationChoices,
  getSiloLocations,
  mapLocationHref,
} from "../src/lib/map-locations";
import { DUNGEON_COMMON_RULES } from "../src/lib/map-location-dungeon-rules";
import { getFarmingAcquisition } from "../src/lib/map-farming-acquisition";

const provider = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/map-evidence/map-location-provider-research.json", import.meta.url),
    "utf8",
  ),
);
const auxiliary = JSON.parse(
  fs.readFileSync(
    new URL(
      "./fixtures/map-evidence/map-farming-acquisition-marker-research.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("evidence-backed location filters and rewards", () => {
  it("covers all 38 provider categories plus named dungeon and boss guides without invented types", () => {
    expect(provider.categories).toHaveLength(38);
    expect(MAP_LOCATIONS).toHaveLength(55);
    expect(new Set(MAP_LOCATIONS.map((location) => location.key)).size).toBe(MAP_LOCATIONS.length);
    const verifiedTypes = new Set<string>([
      ...provider.categories.flatMap((category: { typeIds: string[] }) => category.typeIds),
      ...auxiliary.filters.flatMap((filter: { typeIds: string[] }) => filter.typeIds),
    ]);
    const usedTypes = new Set<string>();
    for (const location of MAP_LOCATIONS) {
      for (const types of Object.values(location.markerTypes)) {
        for (const type of types!) {
          expect(verifiedTypes.has(type), `${location.key}: ${type}`).toBe(true);
          usedTypes.add(type);
        }
      }
      expect(location.guide.summary).toBeTruthy();
      expect(location.guide.sources.length).toBeGreaterThan(0);
      for (const guide of [location.guide, ...Object.values(location.scenarios ?? {})]) {
        for (const source of guide!.sources) expect(new URL(source.url).protocol).toBe("https:");
        for (const reward of guide!.rewards) {
          expect(reward.condition).toBeTruthy();
          expect(["OFFICIAL", "COMMUNITY", "REFERENCE", "UNVERIFIED"]).toContain(reward.evidence);
        }
      }
    }
    for (const category of provider.categories)
      expect(category.typeIds.every((type: string) => usedTypes.has(type))).toBe(true);
    for (const category of provider.categories) {
      for (const scenario of category.verifiedMapKeys) {
        const selectedTypes = getMapLocations(scenario).flatMap(
          (location) => location.markerTypes[scenario as keyof typeof location.markerTypes] ?? [],
        );
        expect(category.typeIds.every((type: string) => selectedTypes.includes(type))).toBe(true);
      }
    }
  });

  it.each(ONCE_HUMAN_MAPS)(
    "shows only registered filters on $key and keeps embed/source/link synchronized",
    (map) => {
      for (const location of getMapLocations(map.key)) {
        const view = getMapView({
          scenario: map.key,
          location: location.key,
          target: "animal-wolf",
          share: "old-route",
        });
        expect(view.mapLocation?.key).toBe(location.key);
        expect(view.farmingTarget).toBeNull();
        expect(view.shareCode).toBeNull();
        expect(view.shareOverridden).toBe(true);
        expect(new URL(view.embedUrl).searchParams.get("types")).toBe(
          location.markerTypes[map.key]!.join(","),
        );
        expect(new URL(view.originalUrl).searchParams.get("types")).toBe(
          new URL(view.embedUrl).searchParams.get("types"),
        );
        expect(view.href).toBe(mapLocationHref(map.key, location.key));
        expect(mapHref(map.key, "old-route", "animal-wolf", location.key)).toBe(view.href);
      }
    },
  );

  it.each(["__proto__", "constructor", "https://evil.example", "silo&types=evil"])(
    "fails closed for invalid location %s",
    (location) => {
      expect(getMapLocation(location)).toBeNull();
      const view = getMapView({ location, target: "animal-wolf", share: "old-route" });
      expect(view.invalidLocation).toBe(true);
      expect(view.farmingTarget).toBeNull();
      expect(new URL(view.embedUrl).search).toBe("");
      expect(view.href).toBe("/map?scenario=MANIBUS");
    },
  );

  it("normalizes repeated inputs and distinguishes unsupported named locations from supported filters", () => {
    const view = getMapView({
      scenario: ["MANIBUS", "WINTER"],
      location: [" monolith-shadow-hound ", "unknown"],
    });
    expect(view.mapLocation?.key).toBe("monolith-shadow-hound");
    const unsupported = getMapView({ scenario: "DEVIATION", location: "monolith-shadow-hound" });
    expect(unsupported.requestedLocation?.key).toBe("monolith-shadow-hound");
    expect(unsupported.mapLocation).toBeNull();
    expect(unsupported.locationGuide).toBeNull();
    expect(new URL(unsupported.embedUrl).searchParams.has("types")).toBe(false);
  });

  it("does not copy a Manibus silo pool into Endless Dream or another scenario", () => {
    const theta = getMapLocation("silo-theta-manibus")!;
    expect(
      getLocationGuide(theta, "MANIBUS").rewards.some((reward) => reward.label.includes("테디")),
    ).toBe(true);
    const endless = getLocationGuide(theta, "ENDLESS_DREAM");
    expect(endless.scopeLabel).toContain("무한");
    expect(endless.rewards.some((reward) => reward.label.includes("테디"))).toBe(true);
    expect(endless.rewards.find((reward) => reward.label.includes("흑묘"))?.evidence).toBe(
      "REFERENCE",
    );
    expect(endless.rewards.find((reward) => reward.label.includes("모듈"))?.evidence).toBe(
      "UNVERIFIED",
    );
    expect(getLocationGuide(theta, "DEVIATION").scopeLabel).toContain("미확인");
    expect(theta.markerNote).toContain("중심으로 이동");
  });

  it("keeps current reward rules and removes the obsolete Controller requirement", () => {
    expect(DUNGEON_COMMON_RULES.controllerRequired).toBe(false);
    expect(DUNGEON_COMMON_RULES.modLevelRanges.map(({ min, max }) => [min, max])).toEqual([
      [1, 12],
      [7, 15],
      [8, 17],
      [9, 17],
      [12, 17],
    ]);
    expect(JSON.stringify(DUNGEON_COMMON_RULES)).toContain("스타크롬");
    expect(getFarmingAcquisition("99000032", "MANIBUS")!.summary).toContain(
      "컨트롤러는 필요하지 않습니다",
    );
  });
  it("has one silo category while preserving individually focused silo rewards", () => {
    const choices = getMapLocationChoices("ENDLESS_DREAM");
    expect(choices.filter((location) => location.key.includes("silo"))).toEqual([
      getMapLocation("locations-silos"),
    ]);
    expect(getSiloLocations("ENDLESS_DREAM")).toHaveLength(10);
    const theta = getMapView({ scenario: "ENDLESS_DREAM", location: "silo-theta-manibus" });
    const alpha = getMapView({ scenario: "ENDLESS_DREAM", location: "silo-alpha-manibus" });
    expect(new URL(theta.embedUrl).searchParams.get("center")).not.toBe(
      new URL(alpha.embedUrl).searchParams.get("center"),
    );
    expect(theta.locationGuide?.rewards.some((reward) => reward.label === "닥터 테디")).toBe(true);
    expect(alpha.locationGuide?.rewards.some((reward) => reward.label.includes("스파크맨더"))).toBe(
      true,
    );
  });
  it("focuses an identified farming dungeon and keeps random candidates unfocused", () => {
    const teddy = getMapView({ scenario: "ENDLESS_DREAM", target: "dr-teddy" });
    expect(teddy.farmingSite?.key).toBe("silo-theta-manibus");
    expect(new URL(teddy.embedUrl).searchParams.get("center")).toBe("-509.55,5493.05");
    expect(new URL(teddy.originalUrl).searchParams.get("center")).toBe(
      new URL(teddy.embedUrl).searchParams.get("center"),
    );
    expect(teddy.href).toBe("/map?scenario=ENDLESS_DREAM&target=dr-teddy");
    for (const target of ["animal-wolf", "butterfly", "resource-gold-ore"]) {
      const view = getMapView({ scenario: "ENDLESS_DREAM", target });
      expect(view.farmingSite).toBeNull();
      expect(new URL(view.embedUrl).searchParams.has("center")).toBe(false);
    }
  });
  it("focuses reviewed ED bosses without borrowing unsupported scenario cameras", () => {
    const wolf = getMapView({ scenario: "ENDLESS_DREAM", target: "99000011" });
    expect(wolf.farmingSite?.key).toBe("monolith-shadow-hound");
    expect(new URL(wolf.embedUrl).searchParams.get("center")).toBe("-4726.72,1642.68");
    expect(new URL(wolf.embedUrl).searchParams.get("types")?.split(",")).toContain(
      "boss_shadow_hound",
    );
    expect(wolf.farmingSiteGuide?.rewards.find((reward) => reward.kind === "모듈")?.evidence).toBe(
      "UNVERIFIED",
    );
    const george = getMapView({ scenario: "ENDLESS_DREAM", target: "99000067" });
    expect(george.farmingSite).toBeNull();
    expect(new URL(george.embedUrl).searchParams.has("center")).toBe(false);
    expect(new URL(george.embedUrl).searchParams.get("types")?.split(",")).toContain(
      "boss_the_forsaken_giant",
    );
    const snapshot = getMapView({ scenario: "MANIBUS", target: "99000040" });
    expect(snapshot.farmingSite).toBeNull();
    expect(snapshot.farmingGuide?.location).toBeUndefined();
    expect(new URL(snapshot.embedUrl).searchParams.has("center")).toBe(false);
  });
});
