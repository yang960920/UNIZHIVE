import type { OnceHumanMapKey } from "@uniz/integrations";
import { MAP_LOCATIONS } from "./map-location-data";

export type LocationEvidence = "OFFICIAL" | "COMMUNITY" | "REFERENCE" | "UNVERIFIED";
export interface LocationReward {
  kind: string;
  label: string;
  condition: string;
  evidence: LocationEvidence;
}
export interface LocationDropGuide {
  summary: string;
  scopeLabel: string;
  rewards: readonly LocationReward[];
  conditions: readonly string[];
  sources: readonly { label: string; url: string }[];
}
export interface MapLocation {
  key: string;
  label: string;
  group: "DUNGEON" | "ACTIVITY" | "EXPLORATION" | "FACILITY";
  categoryLabel: string;
  markerTypes: Partial<Record<OnceHumanMapKey, readonly string[]>>;
  markerNote?: string;
  /** Only a camera manually focused on this named place and copied from the Embed dialog. */
  cameras?: Partial<Record<OnceHumanMapKey, { center: readonly [number, number]; zoom: number }>>;
  guide: LocationDropGuide;
  verifiedGuideScenarios: readonly OnceHumanMapKey[];
  scenarios?: Partial<Record<OnceHumanMapKey, LocationDropGuide>>;
}

export { MAP_LOCATIONS };
export function getMapLocation(key: string): MapLocation | null {
  return MAP_LOCATIONS.find((location) => location.key === key) ?? null;
}
export function getMapLocations(scenario: OnceHumanMapKey): readonly MapLocation[] {
  return MAP_LOCATIONS.filter((location) => location.markerTypes[scenario]?.length);
}
export function isSiloLocation(location: MapLocation): boolean {
  return location.key.startsWith("silo-");
}
/** The category selector has one silo filter; named silos live in the reward panel. */
export function getMapLocationChoices(scenario: OnceHumanMapKey): readonly MapLocation[] {
  return getMapLocations(scenario).filter((location) => !isSiloLocation(location));
}
export function getSiloLocations(scenario: OnceHumanMapKey): readonly MapLocation[] {
  return getMapLocations(scenario).filter(isSiloLocation);
}
export function mapLocationHref(scenario: OnceHumanMapKey, key: string): string {
  const params = new URLSearchParams({ scenario });
  if (getMapLocation(key)) params.set("location", key);
  return `/map?${params}`;
}
export function getLocationGuide(
  location: MapLocation,
  scenario: OnceHumanMapKey,
): LocationDropGuide {
  const specific = location.scenarios?.[scenario];
  if (specific) return specific;
  if (location.verifiedGuideScenarios.includes(scenario)) return location.guide;
  return {
    ...location.guide,
    scopeLabel: `선택한 시나리오의 세부 보상은 미확인 · ${location.guide.scopeLabel}`,
  };
}
