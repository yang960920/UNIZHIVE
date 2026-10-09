import { ONCE_HUMAN_MAPS, type OnceHumanMapKey } from "@uniz/integrations";
import { FARMING_TARGETS } from "./map-farming-targets";
import { FARMING_ACQUISITION_GUIDES } from "./map-farming-acquisition-data";

export interface FarmingAcquisitionSource {
  label: string;
  url: string;
  title?: string;
}

export interface FarmingAcquisitionGuide {
  summary: string;
  scopeLabel?: string;
  sources: readonly FarmingAcquisitionSource[];
  location?: { label: string; markerTypes: readonly string[] };
  locationUrl?: string;
}

export interface FarmingAcquisitionRecord {
  default: FarmingAcquisitionGuide;
  /** These are acquisition evidence scopes, independent of provider filter support. */
  verifiedScenarios: readonly OnceHumanMapKey[];
  scenarios?: Partial<Record<OnceHumanMapKey, FarmingAcquisitionGuide>>;
}

// Copied from the official filter UI/Embed dialogs for all four maps, 2026-10-08.
// Evidence: outputs/map-farming-acquisition-marker-research.json.
const acquisitionLocationTypes = new Set([
  "securementsilos",
  "juxie",
  "raidlea",
  "boss_ravenous_hunter",
  "boss_shadow_hound",
  "boss_arachsiam",
  "boss_treant",
  "boss_secret_servitor",
  "boss_the_forsaken_giant",
]);

function withLocation(
  guide: FarmingAcquisitionGuide,
  scenario: OnceHumanMapKey,
): FarmingAcquisitionGuide {
  if (!guide.location?.markerTypes.length) return guide;
  if (!guide.location.markerTypes.every((type) => acquisitionLocationTypes.has(type))) return guide;
  const map = ONCE_HUMAN_MAPS.find((map) => map.key === scenario)!;
  const url = new URL(map.originalUrl);
  url.searchParams.set("types", guide.location.markerTypes.join(","));
  return { ...guide, locationUrl: url.toString() };
}

export function getFarmingAcquisition(
  targetKey: string,
  scenario: OnceHumanMapKey,
): FarmingAcquisitionGuide | null {
  if (!Object.hasOwn(FARMING_ACQUISITION_GUIDES, targetKey)) return null;
  const record = FARMING_ACQUISITION_GUIDES[targetKey];
  if (!record) return null;
  const specific = record.scenarios?.[scenario];
  if (specific) return withLocation(specific, scenario);
  if (record.verifiedScenarios.includes(scenario)) return withLocation(record.default, scenario);
  const scenarioLabel = ONCE_HUMAN_MAPS.find((map) => map.key === scenario)!.label.split(" (")[0];
  return {
    ...record.default,
    location: undefined,
    locationUrl: undefined,
    scopeLabel: `${scenarioLabel} 세부 경로 미확인 · ${record.default.scopeLabel ?? "다른 시나리오 자료 참고"}`,
  };
}

export function getFarmingItemAcquisition({
  kind,
  id,
  scenario,
}: {
  kind: "deviant" | "material";
  id: string;
  scenario?: OnceHumanMapKey | null;
}): FarmingAcquisitionGuide | null {
  const target = FARMING_TARGETS.find(
    (target) => target.kind === kind && target.itemIds.includes(id),
  );
  if (!target) return null;
  const mapKey =
    scenario ??
    (["MANIBUS", "WINTER", "ENDLESS_DREAM", "DEVIATION"] as const).find(
      (key) => target.markerTypes[key]?.length,
    );
  return mapKey ? getFarmingAcquisition(target.key, mapKey) : null;
}
