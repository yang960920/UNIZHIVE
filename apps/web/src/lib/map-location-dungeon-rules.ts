import type { LocationDropGuide } from "./map-locations";

export interface DungeonModLevelRange {
  key: "NORMAL" | "HARD" | "MASTER" | "NIGHTMARE" | "NIGHTMARE_FIRST_CLEAR";
  label: string;
  min: number;
  max: number;
}

export interface DungeonCommonRules {
  verifiedAt: string;
  controllerRequired: false;
  modLevelRanges: readonly DungeonModLevelRange[];
  guide: LocationDropGuide;
}

/** General reward rules do not establish every dungeon's scenario or difficulty availability. */
export const DUNGEON_COMMON_RULES: DungeonCommonRules = {
  verifiedAt: "2026-10-08",
  controllerRequired: false,
  modLevelRanges: [
    {
      key: "NORMAL",
      label: "일반",
      min: 1,
      max: 12,
    },
    {
      key: "HARD",
      label: "어려움",
      min: 7,
      max: 15,
    },
    {
      key: "MASTER",
      label: "마스터",
      min: 8,
      max: 17,
    },
    {
      key: "NIGHTMARE",
      label: "악몽",
      min: 9,
      max: 17,
    },
    {
      key: "NIGHTMARE_FIRST_CLEAR",
      label: "악몽 최초 클리어",
      min: 12,
      max: 17,
    },
  ],
  guide: {
    summary:
      "던전 보상을 받는 데 제어기는 필요하지 않습니다. 모듈 레벨은 난이도에 따라 달라지며, 최초 클리어 보상은 일반 반복 보상과 구분하세요.",
    scopeLabel: "공식 보상 변경·모듈 FAQ 기준 (2025-03~2026-05)",
    rewards: [
      {
        kind: "보상 조건",
        label: "제어기 불필요",
        condition:
          "2025년 1.4.4 업데이트부터 기존 제어기 보상은 제어기 없이 전체 보상을 지급합니다.",
        evidence: "OFFICIAL",
      },
      {
        kind: "모듈",
        label: "Lv.17 모듈 선택 상자",
        condition:
          "공식 FAQ는 마스터 이상에서 매우 낮은 확률로 직접 획득 가능하다고 안내합니다. 정확한 확률은 미확인입니다.",
        evidence: "OFFICIAL",
      },
      {
        kind: "최초 보상",
        label: "Weapon Body Liner Selection Box",
        condition:
          "어려움 이상 사일로·모노리스 최초 클리어에 최대 7일에 1회라는 공식 안내입니다. 각 던전마다 1회라는 뜻으로 확대하지 않습니다.",
        evidence: "OFFICIAL",
      },
      {
        kind: "스타크롬",
        label: "기존 설계도 조각 보상의 스타크롬 전환",
        condition:
          "2026-03-25부터 예전 최초 던전 클리어 설계도 조각 보상은 동등 가치의 스타크롬으로 교체됐습니다.",
        evidence: "OFFICIAL",
      },
    ],
    conditions: [
      "레벨 표는 공식 모듈 난이도 범위입니다. 모든 장소에서 모든 난이도가 제공되거나 최대 레벨이 확정 드롭된다는 뜻은 아닙니다.",
      "자료의 마스터·프로 표기는 현재 게임의 난이도 선택 화면과 대조하세요.",
      "악몽 사일로의 주간 최초 클리어 보상은 계정 기준으로 안내됐습니다. 현재 서버의 보상 화면이 우선입니다.",
      "상자 종류·보장 횟수·세부 풀은 현재 활동 보상 상세를 확인하세요. 커뮤니티의 반복 횟수를 고정 확률로 쓰지 않습니다.",
    ],
    sources: [
      {
        label: "제어기 폐지·악몽 최초 보상 공식 안내 (2025-03)",
        url: "https://www.oncehuman.game/news/update/20250326/40780_1222452.html",
      },
      {
        label: "신규 모듈 난이도별 레벨 공식 FAQ (2026-01)",
        url: "https://www.oncehuman.game/m/news/devBlog/20260123/40781_1283429.html",
      },
      {
        label: "어려움 이상 최초 보상 공식 안내 (2026-05)",
        url: "https://www.oncehuman.game/m/news/official/20260513/40779_1300125.html",
      },
      {
        label: "설계도 조각 보상 전환 공식 안내 (2026-03)",
        url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
      },
    ],
  },
};
