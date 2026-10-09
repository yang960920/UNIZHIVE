import type { FarmingAcquisitionRecord } from "./map-farming-acquisition";

/** Reviewed 2026-10-08. Evidence, publication dates and rejected claims:
 * outputs/map-farming-deviant-guidance-research.json.
 * Historical source scope is intentionally visible; no universal phase, chance or respawn timer. */
export const DEVIANT_ACQUISITION_GUIDES: Readonly<Record<string, FarmingAcquisitionRecord>> = {
  "99000003": {
    default: {
      summary: "화물 쟁탈에서 씨앗을 받을 때 획득 기회가 있습니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Polar Jelly",
          url: "https://game8.co/games/Once-Human/archives/463610",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS", "WINTER"],
    scenarios: {
      WINTER: {
        summary:
          "얼어 있는 수수께끼 보물 상자를 열어 획득하는 경로가 공략에 있습니다. 얼음을 불로 녹여 상자를 확인하세요.",
        scopeLabel: "설산 공략(2025-11) 기준",
        sources: [
          {
            label: "공략 자료 (2025.11)",
            title: "How to Get Polar Jelly",
            url: "https://game8.co/games/Once-Human/archives/463610",
          },
        ],
      },
    },
  },
  "99000008": {
    default: {
      summary: "탐욕의 모노리스에서 라베노스 헌터를 처치한 뒤 보상을 확인하세요.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "라베노스 헌터 위치 지도",
        markerTypes: ["boss_ravenous_hunter"],
      },
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000011": {
    default: {
      summary: "송곳니 모노리스의 섀도우 하운드 보상에서 획득하는 경로입니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "섀도우 하운드 위치 지도",
        markerTypes: ["boss_shadow_hound"],
      },
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000025": {
    default: {
      summary:
        "사일로 세타의 히든 스테이지를 확인하세요. 석상 퍼즐 뒤 보상에서 등장하는 경로가 알려져 있습니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000026": {
    default: {
      summary:
        "설산의 델타 보스와 화염 엔드브링어 보상이 공식 안내된 경로입니다. 현재 입장 조건과 보상을 확인하세요.",
      scopeLabel: "설산 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Invincible Sun",
          url: "https://game8.co/games/Once-Human/archives/481025",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["WINTER"],
    scenarios: {},
  },
  "99000030": {
    default: {
      summary: "페이(PHI)의 히든 스테이지 보상에서 획득 기회가 있습니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["MANIBUS", "DEVIATION"],
    scenarios: {
      DEVIATION: {
        summary:
          "온천 아레나의 Chaosaurus에서 종 코드를 얻어 변이제로 제작한 뒤 융합하는 경로가 공략에 있습니다. 현재 상점과 제작 해금을 확인하세요.",
        scopeLabel: "비정상수용 공략(2025-11) 기준",
        sources: [
          {
            label: "공략 자료",
            title: "All Deviation (Deviants) Locations",
            url: "https://game8.co/games/Once-Human/archives/Deviants",
          },
        ],
      },
    },
  },
  "99000032": {
    default: {
      summary:
        "프라임 워 보상 상자에서 획득 기회가 있습니다. 현재 서버의 보상·참가 조건을 확인하세요.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get By the Wind",
          url: "https://game8.co/games/Once-Human/archives/463619",
        },
        {
          label: "공식 보상 변경 (2025.03)",
          title: "Version 1.4.4 — Controllers deprecated",
          url: "https://www.oncehuman.game/news/update/20250326/40780_1222452.html",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000034": {
    default: {
      summary:
        "데드빌 캠프 수용시설에서 랜덤 획득하는 경로가 최근 한국 공략에 소개돼 있습니다. 시그마 히든은 보상 변경 제보가 있어 현재 보상 목록을 확인하세요.",
      scopeLabel: "2026-01 한국 공략·땃쥐 보상 변경 제보",
      sources: [
        {
          label: "공략 자료 (2026.01)",
          title: "원스휴먼 감염물 도감 미스터 위시 - 타입 특성 얻는 방법 수용 환경 총 정리",
          url: "https://constante.tistory.com/entry/원스휴먼-감염물-도감-미스터-위시-타입-특성-얻는-방법-수용-환경-총-정리",
        },
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS", "WINTER"],
    scenarios: {
      WINTER: {
        summary:
          "Lowe의 미스터 위시 의뢰로 얻는 경로가 안내돼 있습니다. 아이스 하우스 캠프의 선행 감염물 의뢰를 확인하세요.",
        scopeLabel: "설산 공략(2025-11) 기준",
        sources: [
          {
            label: "공략 자료 (2025.11)",
            title: "How to Get Mr. Wish",
            url: "https://game8.co/games/Once-Human/archives/463605",
          },
        ],
      },
    },
  },
  "99000035": {
    default: {
      summary: "양파를 재배할 때 확률적으로 생성되는 경로가 공식 안내돼 있습니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Grumpy Bulb",
          url: "https://game8.co/games/Once-Human/archives/463699",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000038": {
    default: {
      summary: "무기 상자를 열 때 획득 기회가 있습니다. 현재 시즌 도전의 보상 목록도 확인해보세요.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Zeno-Purifier",
          url: "https://game8.co/games/Once-Human/archives/463815",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS", "WINTER", "DEVIATION"],
    scenarios: {
      DEVIATION: {
        summary:
          "Snowsprite 아레나의 Chaos Snowsprite 종 코드와 변이제를 이용한 융합 경로가 공략에 있습니다. 현재 상점·제작 조건을 확인하세요.",
        scopeLabel: "비정상수용 공략(2025-11) 기준",
        sources: [
          {
            label: "공략 자료",
            title: "All Deviation (Deviants) Locations",
            url: "https://game8.co/games/Once-Human/archives/Deviants",
          },
        ],
      },
      WINTER: {
        summary:
          "무기 상자를 통한 획득 경로가 과거 공략에 있습니다. 현재 보상 목록과 시나리오 조건을 확인하세요.",
        scopeLabel: "설산 공략(2025-11) 기준",
        sources: [
          {
            label: "공략 자료",
            title: "All Deviation (Deviants) Locations",
            url: "https://game8.co/games/Once-Human/archives/Deviants",
          },
        ],
      },
    },
  },
  "99000040": {
    default: {
      summary:
        "기본 스냅샷은 설산 툰드라 모노리스의 시크릿 서번트 보상으로 안내돼 있습니다. 한정 이색형은 별도 획득 경로입니다.",
      scopeLabel: "설산 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Snapshot",
          url: "https://game8.co/games/Once-Human/archives/481142",
        },
      ],
      location: {
        label: "시크릿 서번트 위치 지도",
        markerTypes: ["boss_secret_servitor"],
      },
    },
    verifiedScenarios: ["WINTER"],
    scenarios: {},
  },
  "99000047": {
    default: {
      summary:
        "필드에서 수용하는 경로가 공식 안내돼 있습니다. 폐차장 총과 관련된 Carnival of Doom 의뢰도 공략에 기록돼 있습니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Voodoo Doll",
          url: "https://game8.co/games/Once-Human/archives/463818",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000049": {
    default: {
      summary:
        "농장 공포 의뢰와 캠프 수용시설의 랜덤 획득 공략을 참고하세요. 이전 방어전은 채굴 작업장으로 교체돼 같은 드롭 경로로 안내하지 않습니다.",
      scopeLabel: "2026-01 한국 공략·공식 콘텐츠 변경 기준",
      sources: [
        {
          label: "공략 자료 (2026.01)",
          title: "원스휴먼 감염물 도감 부서진 소녀 - 타입 특성 얻는 방법 수용 환경 총 정리",
          url: "https://constante.tistory.com/entry/원스휴먼-감염물-도감-부서진-소녀-타입-특성-얻는-방법-수용-환경-총-정리",
        },
        {
          label: "공식 안내 (2026.01)",
          title: "Version 2.3.1 Update Announcement (January 21) — Mining Workshop",
          url: "https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000050": {
    default: {
      summary:
        "영지 제작대에서 소용돌이 발생기를 제작할 때 획득 기회가 있습니다. Lowe의 Otherworld Traveler 의뢰 경로도 공략에 기록돼 있습니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Mini Wonder",
          url: "https://game8.co/games/Once-Human/archives/463797",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000053": {
    default: {
      summary:
        "오염 구역의 정예 적 보상을 확인하세요. 2026년 공식 패치는 안개 콘텐츠 보상 경로를 해당 방식으로 옮긴다고 안내했습니다.",
      scopeLabel: "공식 경로 변경을 연결한 안내 · 개별 보상은 서버 확인",
      sources: [
        {
          label: "공식 안내 (2026.01)",
          title: "Version 2.3.1 Update Announcement (January 21)",
          url: "https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html",
        },
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
      ],
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  "99000058": {
    default: {
      summary:
        "설산의 타우 보스와 얼음 엔드브링어 보상이 공식 안내된 경로입니다. Lowe의 겨울 정령 의뢰도 확인해보세요.",
      scopeLabel: "설산 공식 변경표(2025-03)·의뢰 공략 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Snowsprite",
          url: "https://game8.co/games/Once-Human/archives/480980",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["WINTER"],
    scenarios: {},
  },
  "99000059": {
    default: {
      summary:
        "사일로 알파의 최종 보스가 아닌 히든 보상에서 등장한다는 최근 플레이 기록이 있습니다. 출현은 확률적입니다.",
      scopeLabel: "땃쥐 커뮤니티 기록(2026-02~10) 기준",
      sources: [
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "이용자 사례 (2026.09)",
          title: "Need help getting Zapamander deviation",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wqy9qs/need_help_getting_zapamander_deviation/",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["MANIBUS", "ENDLESS_DREAM", "DEVIATION"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "무한의 꿈에서도 알파 히든 보상에서 등장한다는 플레이 제보가 있습니다. 현재 던전 보상과 난이도 조건을 확인하세요.",
        scopeLabel: "무한의 꿈 커뮤니티 제보(2026-08) 기준",
        sources: [
          {
            label: "이용자 사례 (2026.08)",
            title: "Help",
            url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1w24zxx/help/",
          },
          {
            label: "이용자 사례 (2026.09)",
            title: "Need help getting Zapamander deviation",
            url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wqy9qs/need_help_getting_zapamander_deviation/",
          },
        ],
        location: {
          label: "사일로 전체 입구 지도",
          markerTypes: ["securementsilos"],
        },
      },
      DEVIATION: {
        summary:
          "필드 사냥 대신 Verdant 아레나의 종 코드·변이제 융합 경로가 공략에 있습니다. 현재 상점과 제작 해금 조건을 확인하세요.",
        scopeLabel: "비정상수용 커뮤니티 공략 기준",
        sources: [
          {
            label: "공략 자료",
            title: "Once Human: How to acquire 4 new variants in all scenarios!",
            url: "https://vortexgaming.io/en/postdetail/582085",
          },
        ],
      },
    },
  },
  "99000064": {
    default: {
      summary:
        "땃쥐에서는 사일로 세타 히든 보상을 확인하세요. 2025년 공략은 어려움 이상 난이도로 안내합니다.",
      scopeLabel: "땃쥐 공략·커뮤니티 기록(2025-11~2026-02) 기준",
      sources: [
        {
          label: "공략 자료 (2025.11)",
          title: "How to Get Whalepup",
          url: "https://game8.co/games/Once-Human/archives/566263",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["MANIBUS", "DEVIATION"],
    scenarios: {
      DEVIATION: {
        summary:
          "비정상수용의 블랙하트·론울프 지역 필드에서 수용하는 경로가 공략에 있습니다. 해당 시나리오의 추적·수용 장치 조건을 확인하세요.",
        scopeLabel: "비정상수용 커뮤니티 공략(2025-11) 기준",
        sources: [
          {
            label: "공략 자료 (2025.11)",
            title: "How to Get Whalepup",
            url: "https://game8.co/games/Once-Human/archives/566263",
          },
          {
            label: "공략 자료",
            title: "Once Human: How to acquire 4 new variants in all scenarios!",
            url: "https://vortexgaming.io/en/postdetail/582085",
          },
        ],
      },
    },
  },
  "99000066": {
    default: {
      summary:
        "땃쥐와 설산에서 EX1 최종 보스 보상으로 등장한다는 플레이 기록이 있습니다. 히든 스테이지 경로가 아닙니다.",
      scopeLabel: "2026-01 커뮤니티 획득 기록 기준",
      sources: [
        {
          label: "공략 자료 (2026.01)",
          title: "Soul Summoner is cool",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1qilrwg/soul_summoner_is_cool/",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["MANIBUS", "WINTER", "DEVIATION"],
    scenarios: {
      DEVIATION: {
        summary:
          "비정상수용에서는 북쪽 숲·평원과 아게이트 툰드라에서 수용한다는 공략 기록이 있습니다. 현재 지도 추적과 수용 조건을 확인하세요.",
        scopeLabel: "비정상수용 커뮤니티 기록 기준",
        sources: [
          {
            label: "공략 자료 (2026.01)",
            title: "Soul Summoner is cool",
            url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1qilrwg/soul_summoner_is_cool/",
          },
          {
            label: "공략 자료",
            title: "Once Human: How to acquire 4 new variants in all scenarios!",
            url: "https://vortexgaming.io/en/postdetail/582085",
          },
        ],
      },
    },
  },
  "99000067": {
    default: {
      summary:
        "망각의 군주(Forsaken Giant)를 처치해 획득하는 경로가 공식 안내되어 있습니다. 현재 서버의 보스 개방·보상 조건을 확인하세요.",
      scopeLabel: "공식 2026-03 획득 안내 기준",
      sources: [
        {
          label: "공식 안내 (2026.03)",
          title: "Version 2.3.5 Update Announcement (March 25)",
          url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
        },
      ],
      location: {
        label: "망각의 군주 위치 지도",
        markerTypes: ["boss_the_forsaken_giant"],
      },
    },
    verifiedScenarios: ["DEVIATION", "MANIBUS", "WINTER", "ENDLESS_DREAM"],
    scenarios: {
      DEVIATION: {
        summary:
          "비정상수용에서는 필드 탐험으로 획득한다고 공식 안내돼 있습니다. 해당 시나리오의 수용·추적 조건을 확인하세요.",
        scopeLabel: "공식 2026-03 비정상수용 안내",
        sources: [
          {
            label: "공식 안내 (2026.03)",
            title: "Version 2.3.5 Update Announcement (March 25)",
            url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
          },
        ],
      },
    },
  },
  "99000069": {
    default: {
      summary:
        "월드 콘텐츠 획득과 섀도우 하운드 드롭 제보를 참고하세요. 7월 30일 종료된 2주년 축제 보상은 현재 경로로 안내하지 않습니다.",
      scopeLabel: "월드 콘텐츠 공식 안내·땃쥐 스레드 제보(2026-07~09)",
      sources: [
        {
          label: "공식 안내 (2026.07)",
          title: "Version 3.0.1 Update Announcement (July 9)",
          url: "https://www.oncehuman.game/news/update/20260709/40780_1307147.html",
        },
        {
          label: "이용자 사례 (2026.07)",
          title: "Where can I get the deviation",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1v2ozcw/where_can_i_get_the_deviation/",
        },
      ],
      location: {
        label: "섀도우 하운드 위치 지도",
        markerTypes: ["boss_shadow_hound"],
      },
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
  butterfly: {
    default: {
      summary:
        "필드 수용 또는 시그마 클리어 보상을 확인하세요. 2026년 땃쥐 플레이 기록도 시그마 보상을 안내합니다.",
      scopeLabel: "땃쥐·진화의 부름 공식 변경표(2025-03) 기준",
      sources: [
        {
          label: "공식 안내 (2025.03)",
          title: "Once Human 1.4.3 버전 업데이트 공지",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "이용자 사례 (2026.02)",
          title: "Request for a List of Deviations / Silos / Monoliths",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
      ],
      location: {
        label: "사일로 전체 입구 지도",
        markerTypes: ["securementsilos"],
      },
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {},
  },
};
