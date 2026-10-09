import type { MapLocation } from "./map-locations";

/** Evidence and scope: outputs/map-location-monolith-research.json. */
export const MONOLITH_LOCATIONS: readonly MapLocation[] = [
  {
    key: "monolith-ravenous-hunter",
    label: "라베노스 헌터 · 모노리스",
    group: "DUNGEON",
    categoryLabel: "모노리스 · 보스 전투",
    markerTypes: {
      MANIBUS: ["boss_ravenous_hunter"],
      ENDLESS_DREAM: ["boss_ravenous_hunter"],
    },
    markerNote: "해당 보스의 위치 마커를 표시합니다. 실제 입장·보상은 게임에서 확인하세요.",
    guide: {
      summary:
        "보스 처치 보상의 모듈 계열과 감염물 획득 경로입니다. 아래 안내는 땃쥐 기준이며 필드 보급 상자와 구분하세요.",
      scopeLabel: "땃쥐 · 보상 계열 안내 · 2026.10 검토",
      rewards: [
        {
          kind: "모듈",
          label: "빙결 · 번 계열 무기 모듈",
          condition:
            "2026년 땃쥐 플레이 보상표의 계열 안내입니다. 실제 상자 종류·레벨은 선택한 난이도의 보상 상세를 확인하세요.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "활성화 젤",
          condition:
            "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
        "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
        "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
      ],
      sources: [
        {
          label: "땃쥐 이용자 보상표 (2026.02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "공식 감염물 경로 (2025.03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공식 모듈 개편 (2026.01)",
          url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "무한의 꿈에서도 탐욕의 모노리스의 라베노스 헌터 보상이 활성화 젤의 대표 획득 경로로 안내돼 있습니다. 이 시나리오를 명시한 해외 위키를 근거로 정리했습니다.",
        scopeLabel: "무한의 꿈 · 해외 위키 획득 경로 · 2026.10 검토",
        rewards: [
          {
            kind: "감염물",
            label: "활성화 젤 (Festering Gel)",
            condition:
              "라베노스 헌터를 처치한 뒤 보상을 확인하세요. 확정 지급이나 고정 확률을 뜻하지 않으며, 현재 최소 난이도·단계는 확인되지 않았습니다.",
            evidence: "COMMUNITY",
          },
          {
            kind: "모듈",
            label: "현재 계열·상자 풀 미확인",
            condition:
              "무한의 꿈의 입장 화면에서 보상 상세를 확인하세요. 땃쥐 보상표를 이 시나리오의 모듈 목록으로 확정 적용하지 않습니다.",
            evidence: "UNVERIFIED",
          },
        ],
        conditions: [
          "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
          "보스 본체 전투 보상 경로입니다. 히든 스테이지에 출현하는 감염물 안내와 구분하세요.",
          "최소 단계·난이도·드롭 확률은 현재 서버에서 별도로 확인해야 합니다.",
        ],
        sources: [
          {
            label: "무한의 꿈 획득 구역을 명시한 해외 위키 (2026.10 검토)",
            url: "https://once-human.fandom.com/wiki/Festering_Gel",
          },
        ],
      },
    },
  },
  {
    key: "monolith-treant",
    label: "트렌트 · 모노리스",
    group: "DUNGEON",
    categoryLabel: "모노리스 · 보스 전투",
    markerTypes: {
      MANIBUS: ["boss_treant"],
      WINTER: ["boss_treant"],
    },
    markerNote: "해당 보스의 위치 마커를 표시합니다. 실제 입장·보상은 게임에서 확인하세요.",
    guide: {
      summary:
        "보스 처치 보상의 모듈 계열과 감염물 획득 경로입니다. 아래 안내는 땃쥐 기준이며 필드 보급 상자와 구분하세요.",
      scopeLabel: "땃쥐 · 보상 계열 안내 · 2026.10 검토",
      rewards: [
        {
          kind: "모듈",
          label: "파워 서지 · 불안정 폭발 계열 무기 모듈",
          condition:
            "2026년 땃쥐 플레이 보상표의 계열 안내입니다. 실제 상자 종류·레벨은 선택한 난이도의 보상 상세를 확인하세요.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "수확의 씨앗 (Harveseed)",
          condition:
            "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
        "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
        "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
      ],
      sources: [
        {
          label: "땃쥐 이용자 보상표 (2026.02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "공식 감염물 경로 (2025.03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공식 모듈 개편 (2026.01)",
          url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
    scenarios: {
      WINTER: {
        summary:
          "혹독한 겨울 트렌트의 공식 감염물 보상은 타르 푸딩입니다. 땃쥐 모듈 계열표를 설산 보상표로 확정 적용하지 않습니다.",
        scopeLabel: "혹독한 겨울 · 공식 감염물 경로 · 현행 모듈 풀 미확인",
        rewards: [
          {
            kind: "감염물",
            label: "타르 푸딩 (Tar Pudding)",
            condition:
              "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
            evidence: "OFFICIAL",
          },
          {
            kind: "모듈",
            label: "현재 계열·상자 풀 미확인",
            condition:
              "입장 화면의 보상 상세를 확인하세요. 과거 모듈의 이름·옵션은 2026년 신규 모듈과 다를 수 있습니다.",
            evidence: "UNVERIFIED",
          },
        ],
        conditions: [
          "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
          "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
          "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
        ],
        sources: [
          {
            label: "공식 감염물 경로 (2025.03)",
            url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
          },
          {
            label: "공식 모듈 개편 (2026.01)",
            url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
          },
        ],
      },
    },
  },
  {
    key: "monolith-arachsiam",
    label: "아라크시암 · 모노리스",
    group: "DUNGEON",
    categoryLabel: "모노리스 · 보스 전투",
    markerTypes: {
      MANIBUS: ["boss_arachsiam"],
    },
    markerNote: "해당 보스의 위치 마커를 표시합니다. 실제 입장·보상은 게임에서 확인하세요.",
    guide: {
      summary:
        "보스 처치 보상의 모듈 계열과 감염물 획득 경로입니다. 아래 안내는 땃쥐 기준이며 필드 보급 상자와 구분하세요.",
      scopeLabel: "땃쥐 · 보상 계열 안내 · 2026.10 검토",
      rewards: [
        {
          kind: "모듈",
          label: "불스아이 · 패스트 거너 · 포트리스 워페어 계열 무기 모듈",
          condition:
            "2026년 땃쥐 플레이 보상표의 계열 안내입니다. 실제 상자 종류·레벨은 선택한 난이도의 보상 상세를 확인하세요.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "드림캐처 (Dreamcatcher)",
          condition:
            "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
        "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
        "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
      ],
      sources: [
        {
          label: "땃쥐 이용자 보상표 (2026.02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "공식 감염물 경로 (2025.03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공식 모듈 개편 (2026.01)",
          url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS"],
  },
  {
    key: "monolith-shadow-hound",
    label: "섀도우 하운드 · 모노리스",
    group: "DUNGEON",
    categoryLabel: "모노리스 · 보스 전투",
    markerTypes: {
      MANIBUS: ["boss_shadow_hound"],
      ENDLESS_DREAM: ["boss_shadow_hound"],
    },
    markerNote: "해당 보스의 위치 마커를 표시합니다. 실제 입장·보상은 게임에서 확인하세요.",
    guide: {
      summary:
        "보스 처치 보상의 모듈 계열과 감염물 획득 경로입니다. 아래 안내는 땃쥐 기준이며 필드 보급 상자와 구분하세요.",
      scopeLabel: "땃쥐 · 보상 계열 안내 · 2026.10 검토",
      rewards: [
        {
          kind: "모듈",
          label: "바운스 · 샤프넬 계열 모듈 상자",
          condition:
            "2026년 땃쥐 플레이 보상표의 계열 안내입니다. 실제 상자 종류·레벨은 선택한 난이도의 보상 상세를 확인하세요.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "울프의 속삭임",
          condition:
            "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
        "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
        "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
      ],
      sources: [
        {
          label: "보스 모듈 상자 사례 (2026.10)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wwe90o/mod_clarification_please/",
        },
        {
          label: "땃쥐 이용자 보상표 (2026.02)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1r8ysoh/request_for_a_list_of_deviations_silos_monoliths/",
        },
        {
          label: "공식 감염물 경로 (2025.03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공식 모듈 개편 (2026.01)",
          url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "무한의 꿈의 기본형 울프의 속삭임은 송곳니 모노리스의 섀도우 하운드 보상을 확인하세요. 2026년 해외 공략이 이 시나리오의 같은 보스 파밍을 직접 안내합니다.",
        scopeLabel: "무한의 꿈 · 기본형 해외 공략(2026.09) · 2026.10 검토",
        rewards: [
          {
            kind: "감염물",
            label: "울프의 속삭임 · 울부짖는 늑대 (Lonewolf's Whisper)",
            condition:
              "기본형의 섀도우 하운드 보상 경로입니다. 확정 지급이나 고정 확률을 뜻하지 않으며, 현재 최소 난이도·단계는 확인되지 않았습니다.",
            evidence: "COMMUNITY",
          },
          {
            kind: "모듈",
            label: "현재 계열·상자 풀 미확인",
            condition:
              "무한의 꿈의 입장 화면에서 보상 상세를 확인하세요. 땃쥐 보상표를 이 시나리오의 모듈 목록으로 확정 적용하지 않습니다.",
            evidence: "UNVERIFIED",
          },
        ],
        conditions: [
          "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
          "기본형은 보스 본체 전투 보상 경로입니다. 빛의 변종은 꿈의 영역 침공의 별도 보상입니다.",
          "2025년 침공 안내의 2단계를 기본형의 최소 획득 시기로 적용하지 않습니다.",
        ],
        sources: [
          {
            label: "무한의 꿈 섀도우 하운드 파밍 공략 (2026.09)",
            url: "https://www.txhgaming.com/articles/once-human-huong-dan-fusion-deviant-1-1-thanh-perfect-5-5-va-cach-build-lunar-lonewolf",
          },
          {
            label: "빛의 변종 공식 침공 보상 안내 (2025.10)",
            url: "https://www.oncehuman.game/kr/banner/20251029/41909_1267749.html",
          },
          {
            label: "한국어 명칭 확인 · 울부짖는 늑대",
            url: "https://wikily.gg/ko/once-human/deviations/99000011/",
          },
        ],
      },
    },
  },
  {
    key: "monolith-secret-servitor",
    label: "시크릿 서번트 · 모노리스",
    group: "DUNGEON",
    categoryLabel: "모노리스 · 보스 전투",
    markerTypes: {
      WINTER: ["boss_secret_servitor"],
      ENDLESS_DREAM: ["boss_secret_servitor"],
    },
    markerNote: "해당 보스의 위치 마커를 표시합니다. 실제 입장·보상은 게임에서 확인하세요.",
    guide: {
      summary:
        "혹독한 겨울 시크릿 서번트의 공식 감염물 보상은 스냅샷입니다. 현재 모듈 상자의 전체 계열표는 확인되지 않았습니다.",
      scopeLabel: "혹독한 겨울 · 보상 계열 안내 · 2026.10 검토",
      rewards: [
        {
          kind: "감염물",
          label: "스냅샷 (ZapCam)",
          condition:
            "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
          evidence: "OFFICIAL",
        },
        {
          kind: "모듈",
          label: "파워 서지 계열 과거 경로 · 현행 풀 미확인",
          condition:
            "과거 Static Shock 획득 안내에 이 보스가 포함됩니다. 2026년 구 모듈 드롭 종료 이후의 동일 보상을 보장하지 않으므로 현재 상자 목록을 확인하세요.",
          evidence: "REFERENCE",
        },
      ],
      conditions: [
        "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
        "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
        "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
      ],
      sources: [
        {
          label: "공식 감염물 경로 (2025.03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "시크릿 서번트 과거 모듈 참고",
          url: "https://www.oncehumandb.com/items/static-shock",
        },
        {
          label: "공식 모듈 개편 (2026.01)",
          url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
        },
      ],
    },
    verifiedGuideScenarios: ["WINTER", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "무한의 꿈 스냅샷은 툰드라 모노리스의 시크릿 서번트 보상이 대표 경로입니다. 한국 초기 영상과 정식 출시 이후 해외 획득 후기가 같은 경로를 안내합니다.",
        scopeLabel: "무한의 꿈 · 한국 EA 영상·해외 획득 사례(2025) · 2026.10 검토",
        rewards: [
          {
            kind: "감염물",
            label: "스냅샷 (ZapCam)",
            condition:
              "기본형의 시크릿 서번트 보상 경로입니다. 2025년 사례를 근거로 하며, 현재 최소 난이도·단계·드롭 확률은 별도로 확인해야 합니다.",
            evidence: "COMMUNITY",
          },
          {
            kind: "모듈",
            label: "현재 계열·상자 풀 미확인",
            condition:
              "무한의 꿈의 입장 화면에서 보상 상세를 확인하세요. 설산의 과거 모듈 경로를 이 시나리오의 현행 보상 목록으로 확정 적용하지 않습니다.",
            evidence: "UNVERIFIED",
          },
        ],
        conditions: [
          "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
          "한국 영상은 2025년 6월 초기 체험 당시 자료이며, 같은 해 8월 정식 출시 이후 해외 후기로 대표 경로를 교차 확인했습니다.",
          "기본형의 보스 본체 전투 보상 경로입니다. 한정 이색형의 이벤트 조건은 별도입니다.",
        ],
        sources: [
          {
            label: "한국 EA 영상 · 스냅샷 획득처 5:19 (2025.06)",
            url: "https://www.youtube.com/watch?v=_f0qAcQwyMM&t=319s",
          },
          {
            label: "정식 출시 이후 무한의 꿈 획득 사례 (2025.08)",
            url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1mox0ie",
          },
        ],
      },
    },
  },
  {
    key: "monolith-forsaken-giant",
    label: "망각의 군주 · 모노리스",
    group: "DUNGEON",
    categoryLabel: "모노리스 · 보스 전투",
    markerTypes: {
      MANIBUS: ["boss_the_forsaken_giant"],
      ENDLESS_DREAM: ["boss_the_forsaken_giant"],
    },
    markerNote: "해당 보스의 위치 마커를 표시합니다. 실제 입장·보상은 게임에서 확인하세요.",
    guide: {
      summary:
        "보스 처치 보상의 모듈 계열과 감염물 획득 경로입니다. 아래 안내는 땃쥐 기준이며 필드 보급 상자와 구분하세요.",
      scopeLabel: "땃쥐 · 보상 계열 안내 · 2026.10 검토",
      rewards: [
        {
          kind: "모듈",
          label: "여러 무기 계열 모듈 · 선택 상자 획득 사례",
          condition:
            "2026년 이용자 표와 10월 선택 상자 사례가 있습니다. 매번 모든 계열이나 특정 접미사·Lv17 상자가 확정 지급되는 것은 아닙니다.",
          evidence: "COMMUNITY",
        },
        {
          kind: "감염물",
          label: "호두까기 인형 (Nutcracker)",
          condition:
            "보스 전투 보상에서 획득 기회가 있습니다. 확정 지급이나 고정 확률을 뜻하지 않습니다.",
          evidence: "OFFICIAL",
        },
        {
          kind: "감염물",
          label: "용사 조지",
          condition:
            "2026-03 공식 추가 획득 경로입니다. 비정상수용에서는 이 보스 대신 필드 탐색으로 획득합니다.",
          evidence: "OFFICIAL",
        },
      ],
      conditions: [
        "입장 가능 여부와 난이도 해금은 현재 서버의 던전 화면을 확인하세요.",
        "모듈은 2026년 개편 후 기준입니다. 과거 모듈 이름·부옵·확률표를 그대로 적용하지 않습니다.",
        "보스 반복 보상, 최초·주간 보상, 주변 필드 상자는 서로 다른 획득 경로입니다.",
      ],
      sources: [
        {
          label: "용사 조지 공식 획득 경로 (2026.03)",
          url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
        },
        {
          label: "보스 모듈 상자 사례 (2026.10)",
          url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wwe90o/mod_clarification_please/",
        },
        {
          label: "공식 감염물 경로 (2025.03)",
          url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
        },
        {
          label: "공식 모듈 개편 (2026.01)",
          url: "https://www.oncehuman.game/news/update/20260113/40780_1281546.html",
        },
      ],
    },
    verifiedGuideScenarios: ["MANIBUS", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "무한의 꿈 용사 조지는 망각의 군주를 처치하면 확률적으로 획득하는 공식 경로입니다. 2026년 공식의 '기타 시나리오' 안내를 근거로 하며 현재 서버의 보스 제공·입장 조건을 확인하세요.",
        scopeLabel: "무한의 꿈 · 기타 시나리오 한국 공식 안내(2026.03) · 2026.10 검토",
        rewards: [
          {
            kind: "감염물",
            label: "용사 조지 (Brave George)",
            condition:
              "망각의 군주 처치 시 확률적으로 획득합니다. 비정상수용은 필드 탐험 경로로 별도 안내되며, 구체적인 확률과 현재 보스 개방 시기는 확인되지 않았습니다.",
            evidence: "OFFICIAL",
          },
          {
            kind: "모듈",
            label: "현재 계열·상자 풀 미확인",
            condition:
              "무한의 꿈의 입장 화면에서 보상 상세를 확인하세요. 땃쥐의 모듈 상자 사례를 이 시나리오의 보상 목록으로 확정 적용하지 않습니다.",
            evidence: "UNVERIFIED",
          },
        ],
        conditions: [
          "보스 본체 처치 보상 경로입니다. 확정 지급이나 고정 드롭 확률을 뜻하지 않습니다.",
          "현재 서버의 보스 제공 여부·입장 시기·난이도 해금은 게임에서 확인하세요.",
          "비정상수용의 필드 탐험 획득 안내와 구분하세요.",
        ],
        sources: [
          {
            label: "한국 공식 용사 조지 획득 방법 (2026.03)",
            url: "https://www.oncehuman.game/kr/banner/20260325/41909_1292937.html",
          },
          {
            label: "영문 공식 Forsaken Giant 명칭 확인 (2026.03)",
            url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
          },
        ],
      },
    },
  },
];
