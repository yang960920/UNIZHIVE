import type { LocationDropGuide, MapLocation } from "./map-locations";
import { DUNGEON_DEVIANT_RECHECK_EVIDENCE } from "./map-farming-deviant-recheck-dungeon-data";

const sources = DUNGEON_DEVIANT_RECHECK_EVIDENCE.sources;
const endlessDreamEntrances = {
  label: "무한한 꿈 사일로 입구 공식 안내 (2025.08)",
  url: "https://www.oncehuman.game/kr/news/update/20250827/40776_1256383.html",
};
const endlessDreamProviderMap = {
  label: "무한한 꿈 지도·입구 검색 목록 (2026.10 확인)",
  url: "https://oncehuman.th.gl/ko/maps/무한한%20꿈",
};
const unverifiedModuleReward = {
  kind: "모듈",
  label: "모듈 부위·정확한 보상 풀 미확인",
  condition: "다른 시나리오의 사일로별 모듈 부위·전체 보상 풀을 자동으로 적용하지 않습니다.",
  evidence: "UNVERIFIED",
} as const;
const endlessDreamConditions = [
  "확인된 대표 획득 경로입니다. 전체 감염물·모듈 풀과 정확한 출현률·보장 횟수를 뜻하지 않습니다.",
  "정식 출시 규칙은 하드 2단계, 마스터·악몽 3단계 개방입니다. 감염물별 최소 드롭 조건과 구분하며 현재 영구 서버의 실제 개방 상태를 우선 확인하세요.",
] as const;

/** Entrance visibility and acquisition evidence are maintained independently. */
function unconfirmedEndlessDreamGuide(label: string): LocationDropGuide {
  return {
    summary: `${label} 입구는 무한한 꿈 지도에서 확인할 수 있습니다. 현재 이 장소의 개별 드롭표는 미확인입니다.`,
    scopeLabel: "무한한 꿈 · 지도 입구 확인·개별 보상 미확인 (2026.10 검토)",
    rewards: [
      {
        kind: "보상 확인",
        label: "현재 개별 드롭표 미확인",
        condition: "땃쥐·설산의 전체 감염물·모듈 보상 풀을 이 입구에 적용하지 않습니다.",
        evidence: "UNVERIFIED",
      },
    ],
    conditions: [
      "지도에 입구가 있다는 사실과 특정 감염물이 드롭된다는 사실은 별개입니다.",
      "현재 서버의 난이도 선택·보상 상세를 확인하세요. 다른 지도 보상을 그대로 표시하지 않습니다.",
    ],
    sources: [endlessDreamProviderMap, endlessDreamEntrances],
  };
}

const endlessDreamDropGuides: Readonly<Record<string, LocationDropGuide>> = {
  "silo-alpha-manibus": {
    summary:
      "알파(ALPHA) 히든·사이드 보스에서 스파크맨더를 확률적으로 획득한다는 무한한 꿈 제보가 있습니다. 나비는 시나리오별 표의 알파 후보이며 히든·일반 보상 여부를 확정하지 않습니다.",
    scopeLabel: "무한한 꿈 · 개별 획득 제보(2026.08)·대표 경로 표(2026.02)",
    rewards: [
      {
        kind: "감염물",
        label: "스파크맨더 (일렉트릭 샐러맨더)",
        condition:
          "최종 보스와 별개인 알파 히든·사이드 보스 제보. 확률 획득이며 최소 난이도는 미확인.",
        evidence: "COMMUNITY",
      },
      {
        kind: "감염물",
        label: "나비 · 알파 표기 후보",
        condition:
          "Game8 무한한 꿈 열의 대표 경로. 한국 댓글의 시그마 답변은 불확실한 기억으로 자료 간 차이가 있습니다.",
        evidence: "REFERENCE",
      },
      unverifiedModuleReward,
    ],
    conditions: endlessDreamConditions,
    sources: [sources.zapED, sources.game8Table, sources.butterflyED, sources.endlessDreamUnlocks],
  },
  "silo-theta-manibus": {
    summary:
      "서쪽 탑(THETA)의 마스터 히든 보상은 닥터 테디 추천 파밍 경로이며 매번 등장하지 않습니다. 응시하는 흑묘·웨일마스트의 대표 경로도 함께 확인하세요.",
    scopeLabel: "무한한 꿈 · 한국 마스터 히든 사례(2026.03)·시나리오별 공략 참고",
    rewards: [
      {
        kind: "감염물",
        label: "닥터 테디",
        condition:
          "한국 무꿈 마스터 히든 제보·사용자 실플레이 관찰. 확률 획득이며 다른 난이도의 전체 풀을 보증하지 않습니다.",
        evidence: "COMMUNITY",
      },
      {
        kind: "감염물",
        label: "응시하는 흑묘",
        condition:
          "무한한 꿈 표의 THETA 대표 경로. 석상 히든 퍼즐은 한국 원본 공략이며 ED 최소 난이도·확률은 미확인.",
        evidence: "REFERENCE",
      },
      {
        kind: "감염물",
        label: "웨일마스트",
        condition:
          "한국 신규 공략·전체 시나리오 공략의 THETA 히든 경로. ED 직접 실측 및 공통 최소 난이도 검증과 구분.",
        evidence: "REFERENCE",
      },
      unverifiedModuleReward,
    ],
    conditions: [
      ...endlessDreamConditions,
      "마스터 추천 경로는 해당 난이도 개방 후 도전하세요. 3단계는 던전 개방 규칙이며 테디 자체의 모든 경로에 적용되는 최소 단계가 아닙니다.",
      "히든 보스방의 석상 6개를 물에 비친 방향에 맞추는 퍼즐은 메인 보스와 별개입니다.",
      "반복해도 테디를 얻지 못한 한국 보고도 있습니다. 무획득을 드롭 삭제로 단정하거나 확정 지급으로 안내하지 않습니다.",
    ],
    sources: [
      sources.teddyED,
      sources.game8Table,
      sources.allScenariosGuide,
      sources.endlessDreamUnlocks,
      sources.thetaHidden,
      sources.teddyNoDropReport,
    ],
  },
  "silo-phi-manibus": {
    summary:
      "페이(PHI)는 무한한 꿈 표의 파이로 다이노 대표 획득처입니다. 한국 파이로 런 공략의 히든 보스방 경로를 참고하세요.",
    scopeLabel: "무한한 꿈 · 대표 경로 표(2026.02)·한국 히든 공략 참고",
    rewards: [
      {
        kind: "감염물",
        label: "파이로 다이노",
        condition:
          "ED 표는 PHI를 안내합니다. 히든 반복 경로는 한국 공략 참고이며 현재 최소 난이도·전체 풀은 미확인.",
        evidence: "REFERENCE",
      },
      unverifiedModuleReward,
    ],
    conditions: [
      ...endlessDreamConditions,
      "2024년 공략의 3주차·하드·개체 등급 경험을 현재 ED 필수 획득 조건으로 적용하지 않습니다.",
    ],
    sources: [sources.game8Table, sources.pyroHidden, sources.endlessDreamUnlocks],
  },
  "silo-ex1-manibus": {
    summary:
      "다크헬(EX1) 최종 보스 보상은 무한한 꿈의 소환령 대표 경로입니다. 시나리오별 공략 표는 하드 이상으로 안내하며 히든방 경로가 아닙니다.",
    scopeLabel: "무한한 꿈 · 최종 보스·하드 이상 공략 표(2026.02)",
    rewards: [
      {
        kind: "감염물",
        label: "소환령 (생명의 부름)",
        condition:
          "EX1 최종 보스 확률 보상. 하드 이상은 공략 표의 조건이며 마스터·악몽 반복 추천과 구분.",
        evidence: "REFERENCE",
      },
      unverifiedModuleReward,
    ],
    conditions: [
      ...endlessDreamConditions,
      "일반 다크헬과 [편차 -1.4] 다크헬의 정확히 같은 드롭 풀을 검증한 것은 아닙니다.",
    ],
    sources: [sources.game8Table, sources.newFourKO, sources.endlessDreamUnlocks],
  },
  "silo-delta-winter": {
    summary: "델타(DELTA) 클리어는 무한한 꿈 시나리오 표의 영원한 태양 대표 획득 경로입니다.",
    scopeLabel: "무한한 꿈 · 시나리오별 대표 경로 표(2026.02)",
    rewards: [
      {
        kind: "감염물",
        label: "영원한 태양",
        condition:
          "오닉스 툰드라 DELTA 클리어 대표 경로. 최소 난이도·정확한 수령 방식·개별 확률은 미확인.",
        evidence: "REFERENCE",
      },
      unverifiedModuleReward,
    ],
    conditions: [
      ...endlessDreamConditions,
      "혹독한 겨울의 화염 엔드브링어 보상이나 델타 모듈 부위표를 ED 전체 보상으로 적용하지 않습니다.",
    ],
    sources: [sources.game8Table, sources.endlessDreamUnlocks],
  },
};

const dungeonLabels: Readonly<Record<string, string>> = {
  "silo-sigma-manibus": "사일로 에이전시 시그마 (SIGMA)",
  "silo-alpha-manibus": "사일로 알파 (ALPHA)",
  "silo-theta-manibus": "사일로 서쪽 탑 (THETA)",
  "silo-phi-manibus": "사일로 페이 (PHI)",
  "silo-psi-manibus": "사일로 극한의 설국 (PSI)",
  "silo-ex1-manibus": "사일로 다크헬 (EX1)",
  "silo-taurus-winter": "사일로 타우 (TAURUS·08)",
  "silo-delta-winter": "사일로 델타 (DELTA)",
  "silo-psi-winter": "사일로 극한의 설국 (PSI·편차 +0.5)",
  "silo-ex1-winter": "사일로 다크헬 (EX1·편차 -1.4)",
};

/** Curated silo and LEA rewards; source research: outputs/map-location-dungeon-research.json. */
const originalScenarioLocations: readonly MapLocation[] = [
  {
    key: "silo-sigma-manibus",
    label: "사일로 SIGMA",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      MANIBUS: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary:
        "장갑 모듈을 노리는 사일로입니다. 일반 보상의 나비와 히든 보상은 구분해서 확인하세요.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "장갑 모듈",
          condition: "땃쥐 사일로 부위별 보상. 모듈 레벨은 선택 난이도 범위 참조.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "나비",
          condition: "일반 보스 보상; 확률 획득.",
          evidence: "OFFICIAL",
        },
        {
          kind: "감염물",
          label: "데스 래빗",
          condition: "히든 구역(Seepage Zone) 보상; 2026-02 땃쥐 제보.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "REFERENCE",
        },
        {
          kind: "장비",
          label: "무기·방어구 완제품(랜덤)",
          condition: "고정 설계도나 특정 이름의 무기 보장 아님. 현재 정확한 품목·등급 풀 미확인.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "미스터 위시의 예전 히든 안내에는 보상 변경 제보가 있어 현재 보상 목록을 확인하세요.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "땃쥐 사일로 보상 플레이 기록 (2026-02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "사일로 보상·구역 공략 (Game8, 2025 이전)",
          url: "https://game8.co/games/Once-Human/archives/476298",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "silo-alpha-manibus",
    label: "사일로 ALPHA",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      MANIBUS: ["securementsilos"],
      ENDLESS_DREAM: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "헬멧 모듈과 히든 구역 감염물 보상을 확인하세요.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "헬멧 모듈",
          condition: "땃쥐 사일로 부위별 보상.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "H37·스파크맨더",
          condition: "히든 구역 보상. 스파크맨더는 최종 보스가 아닌 히든 보상이라는 2026-10 제보.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "REFERENCE",
        },
        {
          kind: "장비",
          label: "무기·방어구 완제품(랜덤)",
          condition: "고정 설계도나 특정 이름의 무기 보장 아님. 현재 정확한 품목·등급 풀 미확인.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "히든 구역 보상을 최종 보스 보상과 구분하세요. 일반 보스의 최신 감염물 풀은 확인 중입니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "땃쥐 사일로 보상 플레이 기록 (2026-02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "ALPHA 히든 스파크맨더 제보 (2026-09~10)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wqy9qs/need_help_getting_zapamander_deviation/",
        },
        {
          label: "사일로 보상·구역 공략 (Game8, 2025 이전)",
          url: "https://game8.co/games/Once-Human/archives/476298",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "silo-theta-manibus",
    label: "사일로 THETA",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      MANIBUS: ["securementsilos"],
      ENDLESS_DREAM: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "상의 모듈을 얻는 사일로이며, 히든 구역 감염물은 일반 보스 보상과 다릅니다.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "상의 모듈",
          condition: "땃쥐 사일로 부위별 보상.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "다른 차원의 고양이",
          condition: "일반 보스 보상; 2026-02 플레이 기록.",
          evidence: "OFFICIAL",
        },
        {
          kind: "감염물",
          label: "응시하는 흑묘·닥터 테디",
          condition:
            "THETA 히든 구역 전투 보상으로 공식 안내되었습니다. 일반 보스 보상과 구분하며 확률 획득입니다.",
          evidence: "OFFICIAL",
        },
        {
          kind: "감염물",
          label: "웨일마스트",
          condition:
            "THETA 히든 구역 보상이라는 2026년 이용자 사례입니다. 현재 서버의 난이도·보상 조건을 확인하세요.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "REFERENCE",
        },
        {
          kind: "장비",
          label: "무기·방어구 완제품(랜덤)",
          condition: "고정 설계도나 특정 이름의 무기 보장 아님. 현재 정확한 품목·등급 풀 미확인.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "웨일마스트의 예전 어려움 이상 조건은 현재 서버에서 다시 확인하세요. 닥터 테디를 PvP 전용으로 제한하지 않습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "땃쥐 사일로 보상 플레이 기록 (2026-02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "사일로 보상·구역 공략 (Game8, 2025 이전)",
          url: "https://game8.co/games/Once-Human/archives/476298",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "silo-phi-manibus",
    label: "사일로 PHI",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      MANIBUS: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "신발 모듈과 히든 구역의 셰프사우루스·파이로 다이노를 확인하세요.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "신발 모듈",
          condition: "땃쥐 사일로 부위별 보상.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "버즈비",
          condition: "일반 보스 보상; 2026-02 플레이 기록.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "셰프사우루스·파이로 다이노",
          condition: "히든 구역 보상; 확률 획득.",
          evidence: "OFFICIAL",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "REFERENCE",
        },
        {
          kind: "장비",
          label: "무기·방어구 완제품(랜덤)",
          condition: "고정 설계도나 특정 이름의 무기 보장 아님. 현재 정확한 품목·등급 풀 미확인.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "땃쥐 사일로 보상 플레이 기록 (2026-02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "사일로 보상·구역 공략 (Game8, 2025 이전)",
          url: "https://game8.co/games/Once-Human/archives/476298",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "silo-psi-manibus",
    label: "사일로 PSI (땃쥐)",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      MANIBUS: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "땃쥐 PSI는 하의 모듈을 제공합니다. 설산의 같은 이름 사일로와 보상 풀이 다릅니다.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "하의 모듈",
          condition: "땃쥐의 PSI 보상. 설산 PSI의 상의·하의 혼합 풀과 구분.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "스노우 글로브·디렉터 폭스",
          condition: "일반 보스 보상; 2026-02 땃쥐 기록, 별도 히든 구역 없음.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "REFERENCE",
        },
        {
          kind: "장비",
          label: "무기·방어구 완제품(랜덤)",
          condition: "고정 설계도나 특정 이름의 무기 보장 아님. 현재 정확한 품목·등급 풀 미확인.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "설산 PSI의 상의·하의 혼합 보상과 구분하세요.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "땃쥐 사일로 보상 플레이 기록 (2026-02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "사일로 보상·구역 공략 (Game8, 2025 이전)",
          url: "https://game8.co/games/Once-Human/archives/476298",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "silo-ex1-manibus",
    label: "사일로 EX1 (땃쥐)",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      MANIBUS: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "마스크 모듈과 최종 보스 감염물 보상을 확인하세요.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "마스크 모듈",
          condition: "땃쥐 사일로 부위별 보상; 선택 상자 종류·빈도는 현행 보상 상세 확인.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "원자 라이터·소환령",
          condition: "일반/최종 보스 보상; 별도 히든 구역 아님. 소환령은 2026 플레이 기록.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "REFERENCE",
        },
        {
          kind: "장비",
          label: "무기·방어구 완제품(랜덤)",
          condition: "고정 설계도나 특정 이름의 무기 보장 아님. 현재 정확한 품목·등급 풀 미확인.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "선택 상자의 정확한 드롭률은 미확인입니다. 반복 횟수 경험담을 확정 획득으로 안내하지 않습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "땃쥐 사일로 보상 플레이 기록 (2026-02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "소환령 획득 플레이 기록 (2026-01)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1qilrwg/soul_summoner_is_cool/",
        },
        {
          label: "사일로 보상·구역 공략 (Game8, 2025 이전)",
          url: "https://game8.co/games/Once-Human/archives/476298",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "silo-taurus-winter",
    label: "사일로 TAURUS (08)",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      WINTER: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "설산에서 헬멧 모듈과 겨울 정령 보상을 확인하는 사일로입니다.",
      scopeLabel: "설산 획득 조정 공식 안내·모듈 부위 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "헬멧 모듈",
          condition: "설산 TAURUS의 대표 부위.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "겨울 정령",
          condition: "보스 보상; 별도 히든 구역 아님.",
          evidence: "OFFICIAL",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "상의·하의가 추가로 나온다는 서로 충돌하는 옛 공략은 확인된 보상 표에서 제외했습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "설산 모듈 부위 공략 (2024-11)",
          url: "https://ohdex.gg/resources/mod-locations-way-of-winter-once-human",
        },
        {
          label: "던전 자원 보상 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/news/update/20250322/40780_1221471.html",
        },
      ],
    },
    verifiedGuideScenarios: ["WINTER"],
  },
  {
    key: "silo-delta-winter",
    label: "사일로 DELTA",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      WINTER: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "설산 DELTA는 장갑·신발 모듈과 영원한 태양 경로로 안내됩니다.",
      scopeLabel: "설산 획득 조정 공식 안내·모듈 부위 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "장갑·신발 모듈",
          condition: "설산 DELTA의 혼합 부위 보상.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "영원한 태양",
          condition: "보스 보상; 별도 히든 구역 아님.",
          evidence: "OFFICIAL",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "선택 상자 획득 경험담을 고정 확률이나 확정 보상으로 사용하지 않습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "설산 모듈 부위 공략 (2024-11)",
          url: "https://ohdex.gg/resources/mod-locations-way-of-winter-once-human",
        },
        {
          label: "던전 자원 보상 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/news/update/20250322/40780_1221471.html",
        },
      ],
    },
    verifiedGuideScenarios: ["WINTER"],
  },
  {
    key: "silo-psi-winter",
    label: "사일로 PSI (설산)",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      WINTER: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary:
        "상의·하의 모듈과 아이스 포트 보상을 제공합니다. 테디는 내부 잡동사니 획득 사례입니다.",
      scopeLabel: "설산 획득 조정 공식 안내·모듈 부위 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "상의·하의 모듈",
          condition: "설산 PSI의 혼합 부위 보상.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "아이스 포트",
          condition: "일반 보스 보상; 별도 히든 구역 아님.",
          evidence: "OFFICIAL",
        },
        {
          kind: "감염물",
          label: "닥터 테디",
          condition: "사일로 내부 잡동사니 수집 시 변하는 2026 사례; 보스 드롭과 구분.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "테디의 잡동사니 변환은 보스 드롭과 다릅니다. 고정 재생성 시간과 난이도 제한은 확인 중입니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "닥터 테디 획득 사례 (2026-03 댓글)",
          url: "https://steamcommunity.com/app/2139460/discussions/0/4514380934493827273/?l=spanish",
        },
        {
          label: "던전 자원 보상 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/news/update/20250322/40780_1221471.html",
        },
      ],
    },
    verifiedGuideScenarios: ["WINTER"],
  },
  {
    key: "silo-ex1-winter",
    label: "사일로 EX1 (설산)",
    group: "DUNGEON",
    categoryLabel: "사일로",
    markerTypes: {
      WINTER: ["securementsilos"],
    },
    markerNote: "지도에는 사일로 입구 전체가 표시됩니다. 이름을 확인해 선택하세요.",
    guide: {
      summary: "설산 EX1은 마스크 모듈과 하이드로넛 피쉬 보상 경로로 안내됩니다.",
      scopeLabel: "설산 획득 조정 공식 안내·모듈 부위 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "마스크 모듈",
          condition: "설산 EX1 대표 부위 보상.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "하이드로넛 피쉬",
          condition: "일반/최종 보스 보상; 별도 히든 구역 아님.",
          evidence: "OFFICIAL",
        },
        {
          kind: "감염물",
          label: "소환령",
          condition: "설산 EX1 보스 보상이라는 2026 플레이 기록.",
          evidence: "COMMUNITY",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "전투 완료 보상. 수량은 난이도·현행 서버 보상에 따라 다름.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "시나리오별 모듈 부위 플레이 기록 (2026)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1ribwp4/please_help_me_understand_the_lvl_17_legendary/",
        },
        {
          label: "소환령 획득 플레이 기록 (2026-01)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1qilrwg/soul_summoner_is_cool/",
        },
        {
          label: "던전 자원 보상 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/news/update/20250322/40780_1221471.html",
        },
      ],
    },
    verifiedGuideScenarios: ["WINTER"],
  },
  {
    key: "lea-research-lab-manibus",
    label: "LEA 연구소",
    group: "DUNGEON",
    categoryLabel: "연구소",
    markerTypes: {
      MANIBUS: ["raidlea"],
    },
    markerNote: "지도에 표시된 연구소 이름을 확인해 선택하세요.",
    guide: {
      summary: "여러 단계의 모듈·육성 자원과 레베카 보상 경로를 확인하는 고난도 연구소입니다.",
      scopeLabel: "땃쥐 획득 조정 공식 안내·플레이 기록 기준 (2025~2026)",
      rewards: [
        {
          kind: "모듈",
          label: "무기·방어구 모듈 보상",
          condition:
            "여러 전투 단계의 모듈 보상. 특정 부위 전용 사일로와 구분하며 정확한 2026 전체 풀은 미확인.",
          evidence: "REFERENCE",
        },
        {
          kind: "감염물",
          label: "레베카",
          condition: "LEA 전투/완료 보상으로 공식 안내된 경로; 확률 획득.",
          evidence: "OFFICIAL",
        },
        {
          kind: "자원",
          label: "스타더스트 에테르·에너지 링크",
          condition: "LEA 자원 보상. 2024 고정 수량을 현재 수량으로 쓰지 않음.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "감염물은 확률 획득이며, 정확한 출현률과 보장 횟수는 확인되지 않았습니다.",
        "현재 서버의 던전 개방과 보상 상세를 확인하세요. 영구 서버에 시즌의 날짜·단계 잠금을 그대로 적용하지 않습니다.",
        "단계별 정확한 상자 수와 현재 세부 모듈 풀은 확인 중입니다. 사일로의 악몽 난이도 표를 LEA에 그대로 적용하지 않습니다.",
      ],
      sources: [
        {
          label: "감염물 획득 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "LEA 모듈 상자 변경 공식 안내 (2024-10)",
          url: "https://www.oncehuman.game/news/update/20241014/40780_1186579.html",
        },
        {
          label: "LEA 연구소 공략 (2026-09)",
          url: "https://game-shinden.com/once-human-lea-research-lab/",
        },
        {
          label: "던전 자원 보상 조정 공식 안내 (2025-03)",
          url: "https://www.oncehuman.game/news/update/20250322/40780_1221471.html",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
];

/** ED provider entrance names were checked in its current search/filter UI, 2026-10-08.
 * Drop scopes come from the separate Korean-first recheck, never from marker presence. */
export const DUNGEON_LOCATIONS: readonly MapLocation[] = originalScenarioLocations.map<MapLocation>(
  (location) => {
    const label = dungeonLabels[location.key];
    if (!label) return location; // LEA retains its separately researched scenario support.
    const knownDropGuide = endlessDreamDropGuides[location.key];
    const verifiedOriginalScopes = location.verifiedGuideScenarios.filter(
      (scope) => scope !== "ENDLESS_DREAM",
    );
    return {
      ...location,
      label,
      markerTypes: { ...location.markerTypes, ENDLESS_DREAM: ["securementsilos"] },
      verifiedGuideScenarios: knownDropGuide
        ? [...verifiedOriginalScopes, "ENDLESS_DREAM"]
        : verifiedOriginalScopes,
      scenarios: {
        ...location.scenarios,
        ENDLESS_DREAM: knownDropGuide ?? unconfirmedEndlessDreamGuide(label),
      },
    };
  },
);
