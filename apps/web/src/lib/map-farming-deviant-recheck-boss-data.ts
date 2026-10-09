import type { FarmingAcquisitionRecord, FarmingAcquisitionSource } from "./map-farming-acquisition";

/** Reviewed 2026-10-08 against outputs/deviant-recheck-bosses-ko.json.
 * Scenario evidence comes from the cited acquisition text, independently of map-filter support.
 * Default boss rewards are separate from hidden stages, morphed variants and expired events. */
const official143: FarmingAcquisitionSource = {
  label: "한국 공식 안내 (2025.03)",
  title: "Once Human 1.4.3 버전 업데이트 공지",
  url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
};

const officialGeorge: FarmingAcquisitionSource = {
  label: "한국 공식 안내 (2026.03)",
  title: "3월 26일 2.3.5 버전 업데이트 공지 — 용사 조지 획득 방법",
  url: "https://www.oncehuman.game/kr/banner/20260325/41909_1292937.html",
};

const officialBehemoth: FarmingAcquisitionSource = {
  label: "한국 공식 안내 (2026.07)",
  title: "7월 10일 3.0.1 버전 업데이트 공지 — 베히모스의 월드 콘텐츠 획득",
  url: "https://www.oncehuman.game/kr/news/update/20260709/40776_1307162.html",
};

const anniversaryDates: FarmingAcquisitionSource = {
  label: "공식 이벤트 기간 (2026.07)",
  title: "개발자 노트 — 2주년 축제 드림 러시의 7월 30일 종료 안내",
  url: "https://www.oncehuman.game/kr/banner/20260701/41909_1306333.html",
};

const behemothReports: FarmingAcquisitionSource = {
  label: "해외 획득 제보 (2026.09)",
  title: "LETS F%^&ING GOOOOOO!!! IM FREEEEE! — 섀도우 하운드 획득 제보와 상충하는 댓글",
  url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1wav0os/lets_fing_goooooo_im_freeeee/",
};

export const BOSS_DEVIANT_RECHECK_GUIDES: Readonly<Record<string, FarmingAcquisitionRecord>> = {
  "99000008": {
    default: {
      summary:
        "탐욕의 모노리스에서 라베노스 헌터를 처치한 뒤 보상을 확인하세요. 확정 드롭이나 공통 최소 난이도·단계는 확인되지 않았습니다.",
      scopeLabel: "땃쥐 · 한국 공식 획득표(2025.03)",
      sources: [official143],
      location: {
        label: "라베노스 헌터 위치 지도",
        markerTypes: ["boss_ravenous_hunter"],
      },
    },
    verifiedScenarios: ["MANIBUS", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "무한의 꿈에서도 탐욕의 모노리스의 라베노스 헌터 보상이 대표 획득 경로로 안내돼 있습니다. 해외 위키가 이 시나리오를 명시한 경로이며, 난이도·단계·드롭 확률은 현재 서버의 안내를 확인하세요.",
        scopeLabel: "무한의 꿈 · 시나리오를 명시한 해외 위키",
        sources: [
          {
            label: "해외 위키 (검토 2026.10)",
            title: "Festering Gel — How To Obtain의 Endless Dream 획득 구역",
            url: "https://once-human.fandom.com/wiki/Festering_Gel",
          },
        ],
        location: {
          label: "라베노스 헌터 위치 지도",
          markerTypes: ["boss_ravenous_hunter"],
        },
      },
    },
  },
  "99000011": {
    default: {
      summary:
        "울프의 속삭임은 울부짖는 늑대와 같은 감염물입니다. 기본형은 송곳니 모노리스의 섀도우 하운드 보상을 확인하세요.",
      scopeLabel: "땃쥐 · 한국 공식 획득표(2025.03)",
      sources: [
        official143,
        {
          label: "한국어 명칭 확인",
          title: "울부짖는 늑대 — sourceId 99000011",
          url: "https://wikily.gg/ko/once-human/deviations/99000011/",
        },
      ],
      location: {
        label: "섀도우 하운드 위치 지도",
        markerTypes: ["boss_shadow_hound"],
      },
    },
    verifiedScenarios: ["MANIBUS", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "기본형은 송곳니 모노리스의 섀도우 하운드 보상을 확인하세요. 빛의 변종은 꿈의 영역 침공의 별도 보상이며, 공식 안내 당시 2단계 이후 시작하는 침공으로 설명됐습니다. 기본형의 최소 단계·난이도와는 구분하세요.",
        scopeLabel: "무한의 꿈 · 기본형 해외 공략(2026.09) · 변종 한국 공식(2025.10)",
        sources: [
          {
            label: "해외 공략 (2026.09)",
            title: "TXH Gaming — Manibus 또는 Endless Dream의 Shadow Hound 파밍 안내",
            url: "https://www.txhgaming.com/articles/once-human-huong-dan-fusion-deviant-1-1-thanh-perfect-5-5-va-cach-build-lunar-lonewolf",
          },
          {
            label: "빛의 변종 공식 안내 (2025.10)",
            title: "10월 30일 2.2.0 버전 업데이트 공지 — 무한한 꿈 침공 보상",
            url: "https://www.oncehuman.game/kr/banner/20251029/41909_1267749.html",
          },
        ],
        location: {
          label: "기본형 섀도우 하운드 위치 지도",
          markerTypes: ["boss_shadow_hound"],
        },
      },
    },
  },
  "99000040": {
    default: {
      summary:
        "기본 스냅샷(ZapCam)은 툰드라 모노리스의 시크릿 서번트 보상으로 안내돼 있습니다. 한정 이색형의 획득 조건은 기본형과 다릅니다.",
      scopeLabel: "설산 · 한국 공식 획득표(2025.03)",
      sources: [official143],
      location: {
        label: "시크릿 서번트 위치 지도",
        markerTypes: ["boss_secret_servitor"],
      },
    },
    verifiedScenarios: ["WINTER", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "툰드라 모노리스의 시크릿 서번트 보상이 대표 경로입니다. 한국 초기 영상과 정식 출시 이후 해외 무한의 꿈 획득 후기가 같은 경로를 안내하며, 현재 최소 난이도·단계·확률은 별도 확인이 필요합니다.",
        scopeLabel: "무한의 꿈 · 한국 초기 영상·해외 획득 사례(2025)",
        sources: [
          {
            label: "한국 영상 (2025.06 EA · 5:19)",
            title: "마미손TV — 무한한 꿈 다키니런 유산스카 빌드의 스냅샷 획득처 안내",
            url: "https://www.youtube.com/watch?v=_f0qAcQwyMM&t=319s",
          },
          {
            label: "해외 획득 사례 (2025.08)",
            title: "Please MORE OF THIS!!! — Secret Servitor의 Endless Dream ZapCam 드롭 댓글",
            url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1mox0ie",
          },
        ],
        location: {
          label: "시크릿 서번트 위치 지도",
          markerTypes: ["boss_secret_servitor"],
        },
      },
    },
  },
  "99000067": {
    default: {
      summary:
        "망각의 군주(Forsaken Giant)를 처치하면 확률적으로 획득합니다. 공식의 '기타 시나리오' 경로이며, 현재 서버의 보스 개방과 보상 조건을 확인하세요.",
      scopeLabel: "땃쥐·무한의 꿈 · 기타 시나리오 한국 공식 안내(2026.03)",
      sources: [officialGeorge],
      location: {
        label: "망각의 군주 위치 지도",
        markerTypes: ["boss_the_forsaken_giant"],
      },
    },
    verifiedScenarios: ["MANIBUS", "ENDLESS_DREAM", "DEVIATION"],
    scenarios: {
      DEVIATION: {
        summary:
          "비정상수용에서는 월드 탐험으로 획득한다고 공식 안내돼 있습니다. 다른 시나리오의 망각의 군주 보상과 구분하고, 현재 감염물 서식지·포획 조건을 확인하세요.",
        scopeLabel: "비정상수용 · 한국 공식 필드 탐험 안내(2026.03)",
        sources: [officialGeorge],
      },
      WINTER: {
        summary:
          "공식은 비정상수용 외 시나리오에서 망각의 군주 처치 시 확률 획득한다고 안내합니다. 설산의 구체적인 보스 제공·입장 조건은 확인되지 않았으므로 현재 서버의 획득 목록을 먼저 확인하세요.",
        scopeLabel: "설산 · 공식의 일반 경로 참고 · 개별 보스 제공 여부 미확인",
        sources: [officialGeorge],
      },
    },
  },
  "99000069": {
    default: {
      summary:
        "공식은 월드 콘텐츠에서 획득할 수 있다고 안내합니다. 섀도우 하운드 드롭 제보는 업데이트 이후 서로 달라 현재 보상 확인이 필요하며, 2주년 축제 이벤트는 2026년 7월 30일에 종료됐습니다.",
      scopeLabel: "땃쥐 · 공식의 일반 경로·상충하는 해외 제보",
      sources: [officialBehemoth, behemothReports, anniversaryDates],
      location: {
        label: "드롭 제보가 있는 섀도우 하운드 위치 지도",
        markerTypes: ["boss_shadow_hound"],
      },
    },
    verifiedScenarios: ["MANIBUS"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "공식의 월드 콘텐츠 획득 안내는 있으나 무한의 꿈의 현재 장소·보스·시기는 확인되지 않았습니다. 섀도우 하운드 제보를 이 시나리오의 확정 경로로 볼 수 없으며, 2주년 축제 이벤트는 2026년 7월 30일에 종료됐습니다.",
        scopeLabel: "무한의 꿈 · 현재 상세 획득 경로 미확인",
        sources: [officialBehemoth, behemothReports, anniversaryDates],
      },
    },
  },
};
