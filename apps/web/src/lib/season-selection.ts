import {
  isScenarioServerNumber,
  SCENARIO_PRESETS,
  type ScenarioPresetKey,
} from "./scenario-presets";

export interface SeasonSelectionCatalog {
  scenarios: readonly { id: string; slug: string; name: string }[];
  servers: readonly {
    id: string;
    scenarioId: string;
    name: string;
    region: string | null;
  }[];
}

export interface SeasonServerSelection {
  scenarioId: string;
  serverId: string;
  scenarioKey: ScenarioPresetKey | null;
  serverNumber: string | null;
  region: string;
}

export function resolveSeasonServerSelection(
  catalog: SeasonSelectionCatalog,
  preferredServerId?: string,
): SeasonServerSelection | null {
  const server =
    preferredServerId === undefined
      ? catalog.servers[0]
      : catalog.servers.find((item) => item.id === preferredServerId);
  if (!server) return null;

  const scenario = catalog.scenarios.find((item) => item.id === server.scenarioId);
  if (!scenario) return null;

  const preset = SCENARIO_PRESETS.find((item) => item.slug === scenario.slug);
  const serverNumber =
    preset && server.name.startsWith(preset.serverPrefix)
      ? server.name.slice(preset.serverPrefix.length)
      : null;
  const hasCanonicalAddress = serverNumber !== null && isScenarioServerNumber(serverNumber);

  return {
    scenarioId: scenario.id,
    serverId: server.id,
    scenarioKey: hasCanonicalAddress ? (preset?.key ?? null) : null,
    serverNumber: hasCanonicalAddress ? serverNumber : null,
    region: server.region ?? "",
  };
}

export function labelScenario(scenario: { slug: string; name: string }): string {
  return SCENARIO_PRESETS.find((preset) => preset.slug === scenario.slug)?.label ?? scenario.name;
}
