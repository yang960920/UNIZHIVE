/** Scenario phase names supplied for UNIZ HIVE. Dates do not advance these phases. */
export const SCENARIO_PHASE_TEMPLATES = {
  deviation: ["1단계", "2단계", "3단계"],
  manibus: [
    "공중의 그림자",
    "스타로이드 제어",
    "스타더스트의 포효",
    "터치 오브 스카이",
    "새로운 새벽",
  ],
  "the-way-of-winter": ["얼어붙은 땅", "하늘을 메우는 불씨", "꺼지지 않는 불씨", "동틀 무렵"],
  "endless-dream": [
    "악몽의 부상",
    "이상한 꿈의 확산",
    "불길한 징조의 침식",
    "현실과 허상의 교차",
    "끝없는 어둠",
    "무한한 꿈",
  ],
} as const;

export type ScenarioPhaseSlug = keyof typeof SCENARIO_PHASE_TEMPLATES;

export function getScenarioPhaseTemplate(slug: string): readonly string[] | null {
  return Object.prototype.hasOwnProperty.call(SCENARIO_PHASE_TEMPLATES, slug)
    ? SCENARIO_PHASE_TEMPLATES[slug as ScenarioPhaseSlug]
    : null;
}
