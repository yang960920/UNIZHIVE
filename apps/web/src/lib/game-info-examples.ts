export const GAME_INFO_CATEGORIES = {
  dps: "DPS 측정 기록",
  effects: "효과 검증",
  guides: "측정 가이드",
} as const;

export type GameInfoCategory = keyof typeof GAME_INFO_CATEGORIES;
export type GameInfoExampleMode = "single" | "off";

export interface GameInfoRecord {
  slug: string;
  category: GameInfoCategory;
  title: string;
  summary: string;
  tags: string[];
  exampleOnly: true;
  verification: "UNVERIFIED";
  author: string;
  revision: string;
  conditions: { label: string; value: string }[];
  findings: string[];
  procedure: string[];
  evidence: { label: string; description: string }[];
  review: string;
  measurement?: {
    displayedDps: number;
    durationSeconds: number;
    trials: { label: string; dps: number; note: string }[];
  };
}

// Display fixtures only. Never feed these invented values into the gear catalog or build engine.
const EXAMPLES: readonly GameInfoRecord[] = [
  {
    slug: "sample-sustained-dps",
    category: "dps",
    title: "30초 지속 DPS · 측정 기록 예시",
    summary:
      "같은 장비와 조건으로 반복 측정한 결과를 기록하는 형식입니다. 모든 수치는 화면 확인용 가상 값입니다.",
    tags: ["지속 피해", "재장전 포함", "반복 측정"],
    exampleOnly: true,
    verification: "UNVERIFIED",
    author: "예시 작성자",
    revision: "예시 v1",
    conditions: [
      { label: "게임 패치 / 시나리오", value: "실제 등록 시 버전·시나리오·트랜스 현상 명시" },
      { label: "빌드 구성", value: "예시 장비 A · 실제 등록 시 빌드의 고정 버전 연결" },
      { label: "측정 대상 / 거리", value: "예시 훈련 대상 · 10m (가상 조건)" },
      { label: "측정 구간", value: "첫 명중부터 30초 · 재장전 포함 (가상 조건)" },
      { label: "치명타 / 약점", value: "자연 발생 치명타 · 몸통 조준 (가상 조건)" },
      { label: "버프 / 감염물 / 팀", value: "음식·음료·감염물·팀 버프 미사용 (가상 조건)" },
    ],
    findings: [
      "예시 대표 DPS는 45,000입니다. 실제 게임 성능이나 추천 순위를 뜻하지 않습니다.",
      "측정 대상·시간·버프가 다른 기록은 같은 기준으로 비교하지 않습니다.",
      "훈련 대상의 결과를 보스 피해로 그대로 해석하지 않습니다.",
    ],
    procedure: [
      "패치와 시나리오를 적고, 변경되지 않는 빌드 버전을 연결합니다.",
      "대상·거리·버프·시작 자원·재장전 포함 여부를 맞춥니다.",
      "같은 시작·종료 기준으로 반복 측정하고 각 결과와 원본 증거를 남깁니다.",
    ],
    evidence: [
      {
        label: "원본 영상 / 스크린샷",
        description: "실제 자료 등록 시 첨부 · 이 예시에는 증거 자료가 없습니다.",
      },
      {
        label: "측정 메모",
        description: "누락된 명중, 버프 종료, 측정 오차 등 결과에 영향을 준 상황을 기록합니다.",
      },
    ],
    review: "검토 대기 · 실제 측정과 독립 검토가 없어 검증된 기록으로 표시하지 않습니다.",
    measurement: {
      displayedDps: 45000,
      durationSeconds: 30,
      trials: [
        { label: "1회", dps: 45000, note: "가상 결과 · 재장전 포함" },
        { label: "2회", dps: 46000, note: "가상 결과 · 동일 조건" },
        { label: "3회", dps: 44000, note: "가상 결과 · 동일 조건" },
      ],
    },
  },
];

export function gameInfoExampleMode(value: unknown): GameInfoExampleMode {
  return value === "off" ? "off" : "single";
}

export function gameInfoExamples(mode: GameInfoExampleMode): readonly GameInfoRecord[] {
  return mode === "off" ? [] : EXAMPLES;
}

export function gameInfoCategory(value: unknown): GameInfoCategory | null {
  return typeof value === "string" && Object.hasOwn(GAME_INFO_CATEGORIES, value)
    ? (value as GameInfoCategory)
    : null;
}

export function gameInfoHref(record: Pick<GameInfoRecord, "category" | "slug">): string {
  return `/db/${record.category}/${encodeURIComponent(record.slug)}`;
}
