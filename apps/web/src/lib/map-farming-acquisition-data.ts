import type { FarmingAcquisitionRecord } from "./map-farming-acquisition";
import { FARMING_TARGETS } from "./map-farming-targets";
import { DEVIANT_ACQUISITION_GUIDES } from "./map-farming-deviant-acquisition-data";
import { DUNGEON_DEVIANT_RECHECK_GUIDES } from "./map-farming-deviant-recheck-dungeon-data";
import { FIELD_DEVIANT_RECHECK_GUIDES } from "./map-farming-deviant-recheck-field-data";
import { BOSS_DEVIANT_RECHECK_GUIDES } from "./map-farming-deviant-recheck-boss-data";

/** Acquisition guidance is curated separately from TH.GL's marker-type registry. */
const animalDistribution: FarmingAcquisitionRecord = {
  verifiedScenarios: ["DEVIATION", "MANIBUS", "WINTER", "ENDLESS_DREAM"],
  default: {
    scopeLabel: "출현 참고 지역",
    summary:
      "동물의 분포 참고 지점입니다. 비어 있으면 주변과 다른 후보 지역을 탐색하고, 현재 분포는 게임 월드맵의 정보 검색 → 자원 추적에서 확인하세요.",
    sources: [
      {
        label: "공식 동물 분포 안내",
        url: "https://www.oncehuman.game/kr/news/devBlog/20260916/40777_1314022.html",
      },
    ],
  },
};

export const FARMING_ACQUISITION_GUIDES: Readonly<Record<string, FarmingAcquisitionRecord>> = {
  ...Object.fromEntries(
    FARMING_TARGETS.filter((target) => target.kind === "material").map((target) => [
      target.key,
      animalDistribution,
    ]),
  ),
  ...DEVIANT_ACQUISITION_GUIDES,
  "animal-wolf": {
    ...animalDistribution,
    default: {
      scopeLabel: "출현 위치 변동 · 고정 재출현 시간 미확인",
      summary:
        "늑대는 실제 출현 지점이 달라질 수 있어 각 마커에 항상 있는 것은 아닙니다. 비어 있으면 주변·다른 후보 지역을 탐색하고, 게임 월드맵의 정보 검색 → 자원 추적에서 현재 분포를 확인하세요.",
      sources: [
        ...animalDistribution.default.sources,
        { label: "늑대 분포 공략", url: "https://oncehuman.th.gl/guides/Wolf" },
      ],
    },
  },
  "dr-teddy": {
    verifiedScenarios: ["MANIBUS"],
    default: {
      scopeLabel: "땃쥐·진화의 부름 · 공식 안내",
      location: { label: "사일로 전체 입구 지도", markerTypes: ["securementsilos"] },
      summary:
        "사일로 THETA(Θ)의 히든 구역 보상이나 필드 쓰레기 채집에서 확률적으로 획득합니다. 히든 구역 진입과 던전·난이도 개방 조건은 현재 서버의 안내를 확인하세요.",
      sources: [
        {
          label: "공식 획득 방식 조정",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
      ],
    },
    scenarios: {
      ENDLESS_DREAM: {
        scopeLabel: "무한의 꿈 · 커뮤니티 획득 사례",
        location: { label: "사일로 전체 입구 지도", markerTypes: ["securementsilos"] },
        summary:
          "사일로 THETA(Θ)와 마을 수용 시설에서 획득한 사례가 있습니다. 확정 출현이나 공통 단계 제한은 확인되지 않았으므로 현재 서버의 던전·보상 조건을 확인하세요.",
        sources: [
          {
            label: "Steam 획득 사례",
            url: "https://steamcommunity.com/app/2139460/discussions/0/4514380934493827273/",
          },
        ],
      },
      WINTER: {
        scopeLabel: "설산 · 커뮤니티 획득 사례",
        location: { label: "사일로 전체 입구 지도", markerTypes: ["securementsilos"] },
        summary:
          "사일로 PSI(Ψ)의 잡동사니가 닥터 테디로 변하는 획득 사례가 있습니다. 난이도 제한과 재생성 주기를 확정한 안내는 아니므로 현재 서버의 조건을 확인하세요.",
        sources: [
          {
            label: "Steam 획득 사례",
            url: "https://steamcommunity.com/app/2139460/discussions/0/4514380934493827273/",
          },
        ],
      },
      DEVIATION: {
        scopeLabel: "비정상수용 · 야외 포획 사례",
        summary:
          "거점에서 직접 포획한 사례가 있습니다. 공생 시스템의 감염물 서식지를 확인하고, 이 시나리오의 포획 조건에 맞춰 준비하세요.",
        sources: [
          {
            label: "공식 서식지·포획 안내",
            url: "https://www.oncehuman.game/news/devBlog/20251024/40781_1266818.html",
          },
          {
            label: "Steam 획득 사례",
            url: "https://steamcommunity.com/app/2139460/discussions/0/4514380934493827273/",
          },
        ],
      },
    },
  },
  ...DUNGEON_DEVIANT_RECHECK_GUIDES,
  ...FIELD_DEVIANT_RECHECK_GUIDES,
  ...BOSS_DEVIANT_RECHECK_GUIDES,
};
