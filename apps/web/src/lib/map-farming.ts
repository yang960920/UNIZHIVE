import { ONCE_HUMAN_MAPS, type OnceHumanMapKey } from "@uniz/integrations";
import { FARMING_TARGETS } from "./map-farming-targets";

export type FarmingKind = "deviant" | "material" | "resource";
export interface FarmingTarget {
  key: string;
  kind: FarmingKind;
  itemIds: readonly string[];
  label: string;
  linkDetail?: string;
  scopeNote?: string;
  markerTypes: Partial<Record<OnceHumanMapKey, readonly string[]>>;
}

export { FARMING_TARGETS };

export function getFarmingTarget(key: string): FarmingTarget | null {
  return FARMING_TARGETS.find((target) => target.key === key) ?? null;
}

export function getFarmingTargets(scenario: OnceHumanMapKey): readonly FarmingTarget[] {
  return FARMING_TARGETS.filter((target) => target.markerTypes[scenario]?.length);
}

/** Only verified item IDs enable automatic filtering; a display name is never a lookup key. */
export function getFarmingMapLink({
  kind,
  id,
  scenario,
}: {
  kind: "deviant" | "material";
  id: string;
  name?: string;
  scenario?: OnceHumanMapKey | null;
}): { href: string; label: string } | null {
  const target = FARMING_TARGETS.find(
    (target) => target.kind === kind && target.itemIds.includes(id),
  );
  if (!target) return null;
  const mapKey =
    scenario ??
    (["MANIBUS", "WINTER", "ENDLESS_DREAM", "DEVIATION"] as const).find(
      (key) => target.markerTypes[key]?.length,
    );
  if (!mapKey || !target.markerTypes[mapKey]?.length) return null;
  const map = ONCE_HUMAN_MAPS.find((map) => map.key === mapKey)!;
  const query = new URLSearchParams({ scenario: mapKey, target: target.key });
  return {
    href: `/map?${query}`,
    label: ["지도에서 찾기", target.linkDetail, !scenario && map.label.split(" (")[0]]
      .filter(Boolean)
      .join(" · "),
  };
}
