import type { OnceHumanMapKey } from "@uniz/integrations";
import type { LocationDropGuide, MapLocation } from "./map-locations";

/**
 * Provider labels/types: outputs/map-location-provider-research.json.
 * Activity scopes/rewards: outputs/map-location-activity-research.json.
 * Update these map keys only after every category's Embed filters are verified.
 */
const VERIFIED_PROVIDER_MAP_KEYS = [
  "MANIBUS",
  "WINTER",
  "ENDLESS_DREAM",
  "DEVIATION",
] as const satisfies readonly OnceHumanMapKey[];
const UNIZ_SCENARIOS = ["MANIBUS", "WINTER", "ENDLESS_DREAM", "DEVIATION"] as const;
const PROVIDER_LOCATION_TYPES = {
  가든: ["zhongzhiyuan"],
  "공방 채굴": ["excavation"],
  "공용 온도 조절 탑": ["map_cbt2_view_icon_temperature"],
  공장: ["gongchang"],
  "광산 공방": ["mine"],
  "교통 중추": ["jiaotongshuniu"],
  군사: ["junshijidi"],
  "낚시 산책로": ["fishing"],
  "놀이공원(관람차)": ["north_youleyuan1"],
  "놀이공원(문어)": ["north_youleyuan2"],
  "대형 경기장": ["dv_arena_large"],
  도시: ["chengzhen"],
  "동굴 기지": ["north_dongxue"],
  로스트시티: ["north_pobaichengshi"],
  "리퍼 마켓": ["fanmaiji"],
  마운틴포트: ["north_shantijidi"],
  무스시: ["north_musishi"],
  "버드뷰 캠프": ["guanniaoyingdi"],
  병원: ["hospital"],
  부동항: ["north_haigang"],
  "부활 지점": ["initial_respawn"],
  세계석: ["transport"],
  "소형 경기장": ["dv_arena_small"],
  "소형 부락": ["juluo"],
  연구소: ["yanjiusuo"],
  "용광로 기지": ["north_ronglu"],
  유적: ["yiji"],
  자원스팟: ["hud_icon_resourse_null"],
  "쟁탈 구역": ["icon_stronghold_borderlands"],
  "캠프 공격": ["yingdi"],
  플라자: ["gouwuzhongxin"],
  학교: ["school"],
  "화산 기지": ["north_huoshanjidi"],
  Scattered: ["scattered"],
  "Settlement Worldstone": ["zhongliyingdi_kechuansong"],
} as const;
type ProviderLocationLabel = keyof typeof PROVIDER_LOCATION_TYPES;

const SOURCES = {
  provider: {
    label: "TH.GL 장소 분류",
    url: "https://oncehuman.th.gl/guides",
  },
  blueprint: {
    label: "공식 탐색 보상 개편 · 2026.03",
    url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
  },
  crate: {
    label: "상자 위치 공략 · 옛 보상명 제외",
    url: "https://primagames.com/gaming/all-crate-locations-in-once-human-weapons-armor-mystical-and-morphic-chests-in-every-region",
  },
  chef: {
    label: "공식 식재료·이동 안내 · 2026.05",
    url: "https://www.oncehuman.game/m/news/official/20260513/40779_1300125.html",
  },
  mining: {
    label: "공식 광산 공방 개편 · 2026.01",
    url: "https://www.oncehuman.game/kr/news/update/20260121/40776_1282973.html",
  },
  miningEnglish: {
    label: "공식 광산·오염 구역 안내 · 2026.01",
    url: "https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html",
  },
  mineCommunity: {
    label: "공방 이용 사례 · 2026.09",
    url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wd739p/resource_workshop/",
  },
  raidzone: {
    label: "공식 RaidZone 채굴 시설 · 2025.09",
    url: "https://www.oncehuman.game/news/update/20250910/40780_1258634.html",
  },
  fishing: {
    label: "공식 낚시 미끼 변경 · 2026.07",
    url: "https://www.oncehuman.game/news/update/20260724/40780_1309053.html",
  },
  market: {
    label: "공식 거래 구역 안내",
    url: "https://www.oncehuman.game/news/update/20250307/40780_1217046.html",
  },
  marketCommunity: {
    label: "거래 이용 사례 · 2026.09",
    url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1w6tuw5/does_once_human_have_an_online_market_like/",
  },
  arena: {
    label: "공식 비정상 수용 경기장 안내",
    url: "https://www.oncehuman.game/news/devBlog/20251024/40781_1266818.html",
  },
  tower: {
    label: "공식 겨울 영구 서버·공용 탑 안내",
    url: "https://www.oncehuman.game/news/devBlog/20260914/40781_1313806.html",
  },
  towerBoss: {
    label: "공식 공용 탑 소환 수정 안내",
    url: "https://www.oncehuman.game/news/update/20251209/40780_1275567.html",
  },
  contest: {
    label: "공식 프리즘 전쟁 쟁탈 구역 안내",
    url: "https://www.oncehuman.game/m/news/update/20240924/40780_1182732.html",
  },
  extractionHistory: {
    label: "2023 테스트 자료 · 현행 규칙 미확인",
    url: "https://www.oncehuman.game/cn/wiki/20230704/39229_1096684.html",
  },
} as const;

const markerNote =
  "표시된 곳은 장소 유형의 참고 위치입니다. 현재 서버의 상자·자원·보상을 보장하지 않습니다.";

function location(
  key: string,
  providerLabel: ProviderLocationLabel,
  group: MapLocation["group"],
  guide: LocationDropGuide,
  verifiedGuideScenarios: readonly OnceHumanMapKey[] = [],
  scenarios?: MapLocation["scenarios"],
): MapLocation {
  return {
    key,
    label: providerLabel === "Settlement Worldstone" ? "거점 세계석" : providerLabel,
    group,
    categoryLabel: providerLabel,
    markerTypes: Object.fromEntries(
      VERIFIED_PROVIDER_MAP_KEYS.map((mapKey) => [mapKey, PROVIDER_LOCATION_TYPES[providerLabel]]),
    ),
    markerNote,
    guide,
    verifiedGuideScenarios,
    ...(scenarios ? { scenarios } : {}),
  };
}

function unverifiedGuides(
  summary: string,
  scopeLabel: string,
  sources: LocationDropGuide["sources"],
  mapKeys: readonly OnceHumanMapKey[] = UNIZ_SCENARIOS,
): MapLocation["scenarios"] {
  const guide: LocationDropGuide = {
    summary,
    scopeLabel,
    rewards: [],
    conditions: [
      "현재 시나리오에 실제 시설·미션·활동 안내가 있는지 확인해 주세요.",
      "다른 시나리오의 생산물·보상 조건을 그대로 적용하지 않습니다.",
    ],
    sources,
  };
  return Object.fromEntries(mapKeys.map((mapKey) => [mapKey, guide]));
}

function explorationLocation(
  key: string,
  providerLabel: ProviderLocationLabel,
  summary: string,
  hasFoodContainers: boolean,
): MapLocation {
  return location(key, providerLabel, "EXPLORATION", {
    summary,
    scopeLabel: "상자 탐색 참고 · 유형별 고정 드롭·수량 미확인",
    rewards: [
      {
        kind: "탐색 상자",
        label: "무기·장비·생활 보급품 등 현재 상자 내용물",
        condition:
          "실제 상자가 있는 장소에 한합니다. 상자 종류·지역 등급에 따라 내용이 달라지며 고정 수량은 확인되지 않았습니다.",
        evidence: "REFERENCE",
      },
      {
        kind: "탐색·신비 상자",
        label: "스타크롬 · 기존 설계도 조각 보상의 대체",
        condition:
          "2026년 3월 공식 개편에서 조각 지급원이었던 보상만 스타크롬으로 바뀌었습니다. 모든 보급 상자의 공통 반복 보상이 아니며 수량·최초 획득 조건은 현재 보상 화면을 확인하세요.",
        evidence: "OFFICIAL",
      },
      ...(hasFoodContainers
        ? [
            {
              kind: "생활 루팅",
              label: "셰프의 추가 식재료 획득 기회",
              condition:
                "셰프가 실제 냉장고·음료 자판기·식료품 상자를 탐색할 때의 확률 보상입니다. 모든 지점의 확정 지급은 아닙니다.",
              evidence: "OFFICIAL" as const,
            },
          ]
        : []),
    ],
    conditions: [
      "실제로 배치된 상자·루팅 대상과 지역 접근 조건을 확인하세요.",
      "상자별 최초·반복 획득 조건과 현재 초기화 상태를 확인하세요.",
      "옛 설계도 조각표·구 모드표를 현재 드롭 목록으로 적용하지 않습니다.",
    ],
    sources: [
      SOURCES.blueprint,
      SOURCES.crate,
      hasFoodContainers ? SOURCES.chef : SOURCES.provider,
    ],
  });
}

const mineGuide: LocationDropGuide = {
  summary:
    "2026년 공식 개편 후 일반 연료로 가동하는 채굴 광산 공방입니다. 지정 광물 생산과 디바우러 도전 보상을 구분해 확인하세요.",
  scopeLabel: "일반 모드 광산 공방 · 2026.01 개편 · 장소별 수량 미확인",
  rewards: [
    {
      kind: "시설 생산",
      label: "공방에 지정된 광물",
      condition:
        "현재 시설의 입력 연료·생산 항목을 확인하고 가동 후 수령합니다. 광물 종류·생산량은 공방마다 확인해야 합니다.",
      evidence: "OFFICIAL",
    },
    {
      kind: "조건부 전투 보상",
      label: "디바우러가 먹은 광물의 상향 반환·추가 보상",
      condition:
        "디바우러가 도주하기 전에 처치한 경우의 보상입니다. 상향 비율·추가 아이템 목록·수량은 확정하지 않습니다.",
      evidence: "OFFICIAL",
    },
  ],
  conditions: [
    "연료를 공급해 채굴 시설을 가동하고 지정 생산물을 확인하세요.",
    "기존 방어 공방의 액세스 카드 필수 조건과 산 40·80개 보상표는 현재 규칙으로 쓰지 않습니다.",
    "개편은 RaidZone·비정상 수용을 제외한 일반 모드에 적용됩니다.",
  ],
  sources: [SOURCES.mining, SOURCES.miningEnglish, SOURCES.mineCommunity],
};

const excavationGuide: LocationDropGuide = {
  summary:
    "이 필터의 공식 채굴 시설 자료는 RaidZone에 관한 안내입니다. 현재 선택한 시나리오의 광산 공방과 같은 생산 규칙으로 해석하지 않습니다.",
  scopeLabel: "RaidZone 시설 자료 · UNIZ의 네 시나리오 적용 미확인",
  rewards: [],
  conditions: [
    "현재 서버에 실제 가동 가능한 시설이 있는지 확인하세요.",
    "RaidZone의 휴대용 혼합유·카드 효율 규칙을 일반 광산 공방에 적용하지 않습니다.",
  ],
  sources: [SOURCES.raidzone, SOURCES.provider],
};

const towerGuide: LocationDropGuide = {
  summary:
    "혹독한 겨울의 공용 탑은 온도·시나리오 활동을 지원하는 시설입니다. 탑 방문과 별도 보스 도전 보상을 구분하세요.",
  scopeLabel: "혹독한 겨울 공용 시설 · 방문 고정 드롭 없음",
  rewards: [
    {
      kind: "시설 기능",
      label: "공용 탑의 온도·테크 기능",
      condition:
        "현재 서버의 탑 상태·테크·사용 메뉴를 확인합니다. 방문 자체의 아이템 드롭이 아닙니다.",
      evidence: "OFFICIAL",
    },
    {
      kind: "별도 활동",
      label: "활성 보스 소환·도전의 조건부 보상",
      condition:
        "실제 소환·전투·보상 조건을 충족할 때만 해당 활동의 보상을 확인합니다. 탑 유형 전체의 공통 드롭표는 미확인입니다.",
      evidence: "OFFICIAL",
    },
  ],
  conditions: [
    "현재 서버의 공용 탑 기능·테크·소환 조건을 확인하세요.",
    "보스 보상은 해당 전투 안내를 따르며 단순 방문으로 지급되지 않습니다.",
  ],
  sources: [SOURCES.tower, SOURCES.towerBoss, SOURCES.provider],
};

const arenaGuide: LocationDropGuide = {
  summary:
    "비정상 수용의 NPC 경기장 대결 안내입니다. 일반 대결·PvP·카오스 시련의 조건과 보상을 각각 확인하세요.",
  scopeLabel: "비정상 수용 경기장 · 장소·도전별 보상 확인",
  rewards: [
    {
      kind: "경기장 대결",
      label: "해당 경기장에 표시된 대결 보상",
      condition:
        "현재 지도·NPC의 라인업과 도전 단계, 보상 조건을 확인하고 대결을 완료합니다. 모든 경기장의 동일 보상은 아닙니다.",
      evidence: "OFFICIAL",
    },
    {
      kind: "카오스 시련",
      label: "카오스 메달과 경기장 상점 교환",
      condition:
        "공생 레벨 9에 해제되는 카오스 시련의 공식 예시입니다. 모든 소형·대형 경기장 기본 보상이 아니며 현재 교환 목록·제한을 확인하세요.",
      evidence: "OFFICIAL",
    },
  ],
  conditions: [
    "현재 공생·미션·경기장 도전 조건과 보상 목록을 확인하세요.",
    "일반 NPC 대결과 카오스 시련의 보상을 서로 구분하세요.",
  ],
  sources: [SOURCES.arena, SOURCES.provider],
};

const travelGuide: LocationDropGuide = {
  summary:
    "이동·월드 연결을 지원하는 시설입니다. 지점별 활성화 목표가 있더라도 반복 파밍 보상과 구분하세요.",
  scopeLabel: "이동 시설 · 공통 반복 드롭표 없음",
  rewards: [],
  conditions: [
    "현재 메뉴의 활성화·이동·월드 선택 조건을 확인하세요.",
    "활성화 미션이 있으면 지점별 미션 보상을 별도로 확인하세요.",
  ],
  sources: [SOURCES.chef, SOURCES.provider],
};

export const ACTIVITY_LOCATIONS: readonly MapLocation[] = [
  explorationLocation(
    "garden",
    "가든",
    "가든이라는 장소 유형과 영지 농사·재배 시설은 구분합니다. 작물이나 식료품 루팅은 실제 채집물·상자가 있는 곳에 한합니다.",
    true,
  ),
  explorationLocation(
    "factory",
    "공장",
    "공장 내부의 상자·잡동사니·적을 탐색합니다. 공장이라는 이름만으로 산·스타더스트 에테르 생산이 보장되지는 않습니다.",
    false,
  ),
  explorationLocation(
    "traffic-station",
    "교통 중추",
    "역·교통 시설의 실제 상자와 보급품을 탐색합니다. 광산 공방이나 사일로와 별개의 장소 유형입니다.",
    false,
  ),
  explorationLocation(
    "military-base",
    "군사",
    "군사 거점 내부 상자·경계 병력·탐색 목표를 확인합니다. 모든 군사 거점에 같은 무기나 모드가 지정되지는 않습니다.",
    false,
  ),
  explorationLocation(
    "theme-park-ferris",
    "놀이공원(관람차)",
    "관람차가 있는 놀이공원 구역의 건물·상자·퍼즐을 탐색합니다. 기간제 테마 이벤트 보상을 상시 장소 보상으로 섞지 않습니다.",
    false,
  ),
  explorationLocation(
    "theme-park-octopus",
    "놀이공원(문어)",
    "문어 놀이기구 구역의 실제 상자·탐색물을 확인합니다. 문어 무기나 감염물이 유형 공통 보상이라는 근거는 없습니다.",
    false,
  ),
  explorationLocation(
    "town",
    "도시",
    "도시의 건물·거리·옥상에 배치된 실제 상자와 루팅 대상을 찾습니다. 중립 거점이라면 거래·미션 기능을 별도로 확인합니다.",
    true,
  ),
  explorationLocation(
    "cave-base",
    "동굴 기지",
    "동굴 내부 기지의 탐색·상자 보상입니다. 별도 활성 이벤트가 없다면 던전 보스 완료 보상으로 표시하지 않습니다.",
    false,
  ),
  explorationLocation(
    "lost-city",
    "로스트시티",
    "폐도시 내부의 상자·적·지역 탐색 목표를 확인합니다. 이름만으로 고정 레전드 드롭을 부여하지 않습니다.",
    false,
  ),
  explorationLocation(
    "mountain-fortress",
    "마운틴포트",
    "산악 요새 내부의 실제 상자·적·탐색 목표가 획득 경로입니다. 사일로와 동일한 완료 보상을 갖는 것은 아닙니다.",
    false,
  ),
  explorationLocation(
    "mousseville",
    "무스시",
    "무스시의 실제 탐색 상자를 확인합니다. 셰프 음식 주문 단말기는 거래 기능이며 탐색 드롭과 구분합니다.",
    true,
  ),
  explorationLocation(
    "birdview-camp",
    "버드뷰 캠프",
    "캠프 내의 실제 상자·적·탐색물을 확인합니다. 모든 캠프에서 같은 생활 재료가 확정 지급되는 것은 아닙니다.",
    false,
  ),
  explorationLocation(
    "hospital",
    "병원",
    "병원 내부·옥상 등의 실제 탐색 상자를 찾습니다. 의약품 상자가 있으면 확인하되 모든 병원에 같은 치료제가 확정 지급된다고 표시하지 않습니다.",
    true,
  ),
  explorationLocation(
    "unfrozen-port",
    "부동항",
    "항구 건물·부두의 실제 탐색 상자를 확인합니다. 항구라는 장소 표시는 어종·감염물 확정 낚시 지점이라는 의미가 아닙니다.",
    true,
  ),
  explorationLocation(
    "small-settlement",
    "소형 부락",
    "규모가 작은 거점의 실제 상자·잡동사니·식료품을 탐색합니다. 중립 NPC 거점과 적대 탐색 거점을 구분합니다.",
    true,
  ),
  explorationLocation(
    "research-lab",
    "연구소",
    "야외 연구소 거점의 탐색 상자·적·지역 미션을 확인합니다. LEA 연구소 던전이나 사일로 보상표와 혼용하지 않습니다.",
    false,
  ),
  explorationLocation(
    "furnace-base",
    "용광로 기지",
    "용광로 기지라는 장소명과 플레이어가 설치하는 제련 시설을 구분합니다. 기지의 상자·적 보상과 현재 실제 가동 가능한 시설을 각각 확인합니다.",
    false,
  ),
  explorationLocation(
    "ruins",
    "유적",
    "유적의 실제 상자·퍼즐·탐색 목표를 확인합니다. 유적 유형 전체의 공통 확정 드롭표는 확인되지 않았습니다.",
    false,
  ),
  explorationLocation(
    "plaza",
    "플라자",
    "광장 주변 건물·상자·퍼즐을 탐색합니다. 퀘스트·주문 단말기가 있는 경우 별도 기능으로 확인합니다.",
    true,
  ),
  explorationLocation(
    "school",
    "학교",
    "교실·건물·옥상 등의 실제 상자를 확인합니다. 옛 설계도 조각 보상은 2026년 3월 공식 개편에서 스타크롬으로 대체됐습니다.",
    false,
  ),
  explorationLocation(
    "volcano-base",
    "화산 기지",
    "화산 지역 기지의 상자·적·탐색 목표를 확인합니다. 주변 고온 환경·지역 접근 조건과 장소 보상을 구분합니다.",
    false,
  ),
  explorationLocation(
    "scattered",
    "Scattered",
    "지도 제공자의 흩어진 장소 분류입니다. 정확한 개별 이름·상자·상호작용 대상을 보고 경로를 판단하며 유형만으로 별도 보상표를 만들지 않습니다.",
    false,
  ),
  location(
    "mine-workshop",
    "광산 공방",
    "FACILITY",
    mineGuide,
    ["MANIBUS", "WINTER", "ENDLESS_DREAM"],
    unverifiedGuides(
      "비정상 수용은 2026년 일반 광산 공방 개편 적용에서 제외됩니다. 지도 위치만으로 같은 생산물·디바우러 보상을 적용하지 않습니다.",
      "비정상 수용 · 일반 공방 개편 적용 제외",
      [SOURCES.mining, SOURCES.provider],
      ["DEVIATION"],
    ),
  ),
  location(
    "workshop-excavation",
    "공방 채굴",
    "FACILITY",
    excavationGuide,
    [],
    unverifiedGuides(excavationGuide.summary, excavationGuide.scopeLabel, excavationGuide.sources),
  ),
  location(
    "public-thermal-tower",
    "공용 온도 조절 탑",
    "FACILITY",
    towerGuide,
    ["WINTER"],
    unverifiedGuides(
      "공용 탑의 확인된 기능 자료는 혹독한 겨울에 관한 안내입니다. 현재 시나리오에서 같은 기능·보상이 제공되는지는 확인되지 않았습니다.",
      "공용 탑 · 현재 시나리오 기능·보상 미확인",
      [SOURCES.tower, SOURCES.provider],
      ["MANIBUS", "ENDLESS_DREAM", "DEVIATION"],
    ),
  ),
  location("fishing-walkway", "낚시 산책로", "ACTIVITY", {
    summary:
      "낚시를 위한 장소 분류입니다. 목표 어종과 특수 획득물은 현재 수역·미끼·시나리오 조건을 확인하세요.",
    scopeLabel: "낚시 참고 · 유형 공통 어종·수량 미확인",
    rewards: [
      {
        kind: "낚시",
        label: "현재 수역의 어류와 가능한 특수 획득물",
        condition:
          "어종·크기·희귀 개체는 수역과 미끼 조건에 따라 다릅니다. 낚시 산책로라는 이름만으로 특정 어종·감염물 획득을 보장하지 않습니다.",
        evidence: "REFERENCE",
      },
      {
        kind: "미끼 조건",
        label: "특수 어종의 유인 효과",
        condition:
          "2026년 7월 공식 변경에서 개구리의 크랭크베이트는 전기뱀장어 등 특수 어종을 더 잘 유인합니다. 확정 획득 보상은 아닙니다.",
        evidence: "OFFICIAL",
      },
    ],
    conditions: [
      "낚시가 허용된 수역에서 낚싯대·미끼를 준비하고 낚시를 완료하세요.",
      "미끼와 목표 어종의 현재 설명을 확인하세요.",
    ],
    sources: [SOURCES.fishing, SOURCES.provider],
  }),
  location(
    "mini-arena",
    "소형 경기장",
    "ACTIVITY",
    arenaGuide,
    ["DEVIATION"],
    unverifiedGuides(
      "확인된 경기장 자료는 비정상 수용의 대결 활동입니다. 현재 시나리오의 보스 던전·보상으로 적용하지 않습니다.",
      "비정상 수용 대표 자료 · 현재 시나리오 보상 미확인",
      [SOURCES.arena, SOURCES.provider],
      ["MANIBUS", "WINTER", "ENDLESS_DREAM"],
    ),
  ),
  location(
    "large-arena",
    "대형 경기장",
    "ACTIVITY",
    arenaGuide,
    ["DEVIATION"],
    unverifiedGuides(
      "확인된 경기장 자료는 비정상 수용의 대결 활동입니다. 현재 시나리오의 보스 던전·보상으로 적용하지 않습니다.",
      "비정상 수용 대표 자료 · 현재 시나리오 보상 미확인",
      [SOURCES.arena, SOURCES.provider],
      ["MANIBUS", "WINTER", "ENDLESS_DREAM"],
    ),
  ),
  location(
    "harvesters-market",
    "리퍼 마켓",
    "FACILITY",
    {
      summary:
        "플레이어 거래 장소입니다. 판매 물품·음식·감염물 등의 실제 등록 목록을 확인해 거래하며 방문 자체의 무료 드롭은 아닙니다.",
      scopeLabel: "거래 기능 · 고정 방문 보상 없음",
      rewards: [
        {
          kind: "구매·거래",
          label: "실제로 등록된 거래 가능 물품",
          condition:
            "현재 판매 목록·가격·거래 제한을 확인하고 구매 또는 교환합니다. 고정 드롭표가 아닙니다.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "현재 서버의 시장·자판기·온라인 거래 메뉴를 확인하세요.",
        "판매 품목·가격·물품별 거래 가능 여부를 확인하세요.",
      ],
      sources: [SOURCES.market, SOURCES.marketCommunity, SOURCES.provider],
    },
    ["MANIBUS", "WINTER"],
  ),
  location("respawn-point", "부활 지점", "FACILITY", {
    summary:
      "부활·복귀 지점 분류입니다. 현재 시나리오와 상태에서 허용되는 기능을 확인하며 별도 아이템 드롭은 확인되지 않았습니다.",
    scopeLabel: "편의 기능 참고 · 보상 미확인",
    rewards: [],
    conditions: ["현재 메뉴에서 사용 가능한 부활·복귀 대상과 요구 조건을 확인하세요."],
    sources: [SOURCES.provider, SOURCES.mining],
  }),
  location("worldstone", "세계석", "FACILITY", travelGuide, UNIZ_SCENARIOS),
  location(
    "settlement-worldstone",
    "Settlement Worldstone",
    "FACILITY",
    travelGuide,
    UNIZ_SCENARIOS,
  ),
  location("extraction-sites", "자원스팟", "FACILITY", {
    summary:
      "자원 관련 시설 분류입니다. 현재 서버에서 실제로 가동할 수 있는 시설과 생산 항목을 확인해야 합니다.",
    scopeLabel: "현재 시나리오 생산물·보상 미확인",
    rewards: [
      {
        kind: "시설 생산 확인",
        label: "현재 시설의 생산 항목 확인 필요",
        condition:
          "가동·전력·점령 조건을 확인하기 전에는 광물·스타더스트 에테르가 확정 생산된다고 안내하지 않습니다.",
        evidence: "UNVERIFIED",
      },
    ],
    conditions: [
      "현재 활성 시설의 메뉴·입력 재료·전력·접근 조건을 확인하세요.",
      "2023 테스트의 추출·점령 규칙을 현재 시나리오에 적용하지 않습니다.",
    ],
    sources: [SOURCES.provider, SOURCES.extractionHistory],
  }),
  location("contest-area", "쟁탈 구역", "ACTIVITY", {
    summary:
      "시나리오 활동 구역 분류입니다. 프리즘 전쟁의 진영 쟁탈 규칙을 현재 선택한 시나리오의 보상으로 적용하지 않습니다.",
    scopeLabel: "프리즘 전쟁 대표 자료 · 현재 시나리오 보상 미확인",
    rewards: [],
    conditions: [
      "현재 시나리오의 실제 진영·전쟁·활동 메뉴를 확인하세요.",
      "지역 입장과 활동 완료·기여·수용 보상을 구분하세요.",
    ],
    sources: [SOURCES.contest, SOURCES.provider],
  }),
  location("attackers-base", "캠프 공격", "ACTIVITY", {
    summary:
      "개별 장소에 현재 미션·이벤트·전쟁 안내가 있는지 확인하세요. 유형 이름만으로 캠프 클리어 보상은 확정할 수 없습니다.",
    scopeLabel: "현재 시나리오 활동·보상 미확인",
    rewards: [],
    conditions: [
      "실제 장소의 현재 미션·활동·보상 화면을 확인하세요.",
      "2023 테스트의 공격 캠프 규칙을 현행 보상으로 적용하지 않습니다.",
    ],
    sources: [SOURCES.provider, SOURCES.extractionHistory],
  }),
];
