import { ONCE_HUMAN_MAPS, type OnceHumanMapKey } from "@uniz/integrations";
import { getMapView, type MapQuery, type MapView } from "./map-navigation";
import type { UserPreferences } from "./user-preferences";

export function mapSelectionCookieName(userKey: string): string | null {
  return userKey !== "visitor" && /^[a-zA-Z0-9_-]{1,100}$/.test(userKey)
    ? `uniz-map-selection-${userKey}`
    : null;
}

export function scenarioSlugToMap(slug: string | null): OnceHumanMapKey {
  const maps: Record<string, OnceHumanMapKey> = {
    manibus: "MANIBUS",
    "the-way-of-winter": "WINTER",
    "endless-dream": "ENDLESS_DREAM",
    deviation: "DEVIATION",
  };
  return (slug && maps[slug]) || "MANIBUS";
}

/** Only public filter identifiers are retained; shared drawings are never remembered. */
export function serializeMapSelection(view: MapView): string {
  return JSON.stringify({
    scenario: view.map.key,
    ...(view.farmingTarget ? { target: view.farmingTarget.key } : {}),
    ...(view.mapLocation ? { location: view.mapLocation.key } : {}),
  });
}

export function parseMapSelection(value: string | undefined): MapQuery | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["scenario", "target", "location"].includes(key)))
      return null;
    if (!ONCE_HUMAN_MAPS.some((map) => map.key === record.scenario)) return null;
    if (record.target !== undefined && typeof record.target !== "string") return null;
    if (record.location !== undefined && typeof record.location !== "string") return null;
    if (record.target && record.location) return null;
    const view = getMapView(record);
    if (record.target && !view.farmingTarget) return null;
    if (record.location && !view.mapLocation) return null;
    return record;
  } catch {
    return null;
  }
}

export function resolveMapPreferenceQuery(
  query: MapQuery,
  preferences: UserPreferences,
  currentMap: OnceHumanMapKey,
  remembered: string | undefined,
): MapQuery {
  // Explicit links, including clearing a filter, always win over personal preferences.
  if (
    [query.scenario, query.target, query.location, query.share].some((value) => value !== undefined)
  )
    return query;
  const saved = preferences.rememberMapFilters ? parseMapSelection(remembered) : null;
  return (
    saved ?? {
      scenario: preferences.mapScenario === "CURRENT" ? currentMap : preferences.mapScenario,
    }
  );
}
