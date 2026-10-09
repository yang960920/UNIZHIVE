import type { OnceHumanMapKey } from "@uniz/integrations";
import { getMapLocation, type MapLocation } from "./map-locations";

type ScenarioSites = Partial<Record<OnceHumanMapKey, readonly string[]>>;

/** Named acquisition sites supported by the reviewed guidance.
 * A site is an acquisition opportunity, not a guaranteed drop.
 * Keys ending in a scenario name remain stable location identities; lookup and
 * camera availability decide whether that same named place is usable on this map.
 * Evidence: outputs/deviant-recheck-{bosses,dungeons}-ko.json and acquisition guides. */
const sitesByTarget: Readonly<Record<string, ScenarioSites>> = {
  "dr-teddy": {
    MANIBUS: ["silo-theta-manibus"],
    ENDLESS_DREAM: ["silo-theta-manibus"],
    WINTER: ["silo-psi-winter"],
  },
  "99000025": {
    MANIBUS: ["silo-theta-manibus"],
    ENDLESS_DREAM: ["silo-theta-manibus"],
  },
  "99000059": {
    MANIBUS: ["silo-alpha-manibus"],
    ENDLESS_DREAM: ["silo-alpha-manibus"],
  },
  "99000064": {
    MANIBUS: ["silo-theta-manibus"],
    ENDLESS_DREAM: ["silo-theta-manibus"],
  },
  "99000030": {
    MANIBUS: ["silo-phi-manibus"],
    ENDLESS_DREAM: ["silo-phi-manibus"],
  },
  "99000066": {
    MANIBUS: ["silo-ex1-manibus"],
    ENDLESS_DREAM: ["silo-ex1-manibus"],
  },
  "99000026": {
    ENDLESS_DREAM: ["silo-delta-winter"],
    WINTER: ["silo-delta-winter"],
  },
  "99000008": {
    MANIBUS: ["monolith-ravenous-hunter"],
    ENDLESS_DREAM: ["monolith-ravenous-hunter"],
  },
  "99000011": {
    MANIBUS: ["monolith-shadow-hound"],
    ENDLESS_DREAM: ["monolith-shadow-hound"],
  },
  "99000040": {
    ENDLESS_DREAM: ["monolith-secret-servitor"],
    WINTER: ["monolith-secret-servitor"],
  },
  "99000067": {
    MANIBUS: ["monolith-forsaken-giant"],
    ENDLESS_DREAM: ["monolith-forsaken-giant"],
  },
};

/** Return only reviewed acquisition sites with a registered filter and a focused
 * camera for the selected scenario. Missing locations/cameras fail closed.
 * Unresolved field routes and Butterfly's conflicting ED route have no site mapping.
 * This list is not exhaustive; other acquisition opportunities stay in the
 * textual guidance until a corresponding named location is verified. */
export function getFarmingSites(
  targetKey: string,
  scenario: OnceHumanMapKey,
): readonly MapLocation[] {
  if (!Object.hasOwn(sitesByTarget, targetKey)) return [];
  const scenarioSites = sitesByTarget[targetKey]!;
  if (!Object.hasOwn(scenarioSites, scenario)) return [];
  return (scenarioSites[scenario] ?? []).flatMap((key) => {
    const location = getMapLocation(key);
    if (!location?.markerTypes[scenario]?.length || !location.cameras?.[scenario]) return [];
    return [location];
  });
}
