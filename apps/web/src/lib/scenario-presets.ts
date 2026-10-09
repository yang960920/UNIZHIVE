export const SCENARIO_PRESETS = [
  {
    key: "DEVIATION",
    label: "비정상수용(Deviation)",
    slug: "deviation",
    serverPrefix: "Deviation-X",
  },
  {
    key: "MANIBUS",
    label: "땃쥐(Manibus)",
    slug: "manibus",
    serverPrefix: "Manibus-X",
  },
  {
    key: "WINTER",
    label: "설산(The Way Of Winter)",
    slug: "the-way-of-winter",
    serverPrefix: "W_Winter-X",
  },
  {
    key: "ENDLESS_DREAM",
    label: "무한의 꿈(Endless Dream)",
    slug: "endless-dream",
    serverPrefix: "E_Dream-X",
  },
] as const;

export type ScenarioPreset = (typeof SCENARIO_PRESETS)[number];
export type ScenarioPresetKey = ScenarioPreset["key"];

export const SCENARIO_PRESET_KEYS = SCENARIO_PRESETS.map((preset) => preset.key);

export function getScenarioPreset(key: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((preset) => preset.key === key);
}

export function isScenarioServerNumber(value: string): boolean {
  return value.length === 4 && /^[0-9]{4}$/.test(value);
}

export function formatScenarioServerName(key: ScenarioPresetKey, serverNumber: string): string {
  const preset = getScenarioPreset(key);
  if (!preset || !isScenarioServerNumber(serverNumber))
    throw new RangeError("시나리오와 네 자리 서버 번호를 확인해 주세요.");
  return `${preset.serverPrefix}${serverNumber}`;
}
