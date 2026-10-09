import type {
  FarmingAcquisitionGuide,
  FarmingAcquisitionRecord,
  FarmingAcquisitionSource,
} from "./map-farming-acquisition";
import { DEVIANT_ACQUISITION_GUIDES } from "./map-farming-deviant-acquisition-data";

type RecheckEvidence =
  | "OFFICIAL"
  | "HISTORICAL_OFFICIAL"
  | "GUIDE"
  | "REFERENCE"
  | "PLAYER_REPORT"
  | "PLAYER_EXPERIENCE";

interface ReviewedSource extends FarmingAcquisitionSource {
  publishedAt: string | null;
  evidenceDate?: string;
  evidence: RecheckEvidence;
  scope: string;
}

const reviewedSources = {
  officialAcquisition: {
    label: "공식 획득 변경표 (2025.03)",
    title: "Once Human 1.4.3 버전 업데이트 공지",
    url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
    publishedAt: "2025-03-12",
    evidence: "HISTORICAL_OFFICIAL",
    scope: "터치 오브 스카이·진화의 부름·혹독한 겨울. 무한한 꿈 출시 이전 자료",
  },
  endlessDreamUnlocks: {
    label: "공식 난이도 개방 안내 (2025.07)",
    title: "7월 3일 2.0 버전 업데이트 공지",
    url: "https://www.oncehuman.game/kr/news/update/20250702/40776_1244585.html",
    publishedAt: "2025-07-02",
    evidence: "OFFICIAL",
    scope:
      "무한한 꿈 정식 출시 규칙: 하드 2단계, 마스터·악몽 3단계. 개별 감염물의 최소 드롭 단계와 구분",
  },
  game8Table: {
    label: "시나리오별 대표 경로 표 (2026.02)",
    title: "All Deviation (Deviants) Locations",
    url: "https://game8.co/games/Once-Human/archives/Deviants",
    publishedAt: null,
    evidenceDate: "2026-02-05",
    evidence: "REFERENCE",
    scope:
      "무한한 꿈 열의 대표 경로. Game8는 2025.12 이후 취재 종료를 공지했으며, 표의 빈칸은 획득 불가를 뜻하지 않음",
  },
  butterflyED: {
    label: "한국 무꿈 댓글 · 불확실한 기억 (2026.02)",
    title: "무꿈 저주인형이랑 나비 어디서 파밍해야되나요..?",
    url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=263881",
    publishedAt: "2026-02-06",
    evidence: "PLAYER_REPORT",
    scope: "무꿈 나비 시그마 답변. 직접 획득 경험이나 확정 보상표는 아님",
  },
  wishED: {
    label: "한국 무꿈 직접 획득 경험 (2026.04)",
    title: "미스터 위시 어디서 얻음?",
    url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=274921",
    publishedAt: "2026-04-05",
    evidence: "PLAYER_EXPERIENCE",
    scope: "무꿈 이용자의 데드빌 수용상자 위시 2/2 획득. 최대 등급·고정 갱신 시간은 아님",
  },
  thetaHidden: {
    label: "한국 서쪽탑 히든 퍼즐 공략 (2024.10)",
    title: "사일로 서쪽탑 간단팁, 히든보스 찾는법 (원스휴먼)",
    url: "https://shadow-normalworld.tistory.com/95",
    publishedAt: "2024-10-28",
    evidence: "GUIDE",
    scope: "서쪽탑 히든 석상 6개 반사 퍼즐. 무한한 꿈의 최신 보상 풀·최소 난이도 근거와 구분",
  },
  pyroHidden: {
    label: "한국 파이로 히든 반복 공략 (2024.08)",
    title: "[원스휴먼] 파이로 다이노 얻는방법 다이노 런",
    url: "https://chinchu.tistory.com/225",
    publishedAt: "2024-08-08",
    evidence: "GUIDE",
    scope:
      "페이 히든 보스 반복 경로. 당시 3주차·등급 관찰을 현재 무한한 꿈 필수 조건으로 적용하지 않음",
  },
  newFourKO: {
    label: "한국 신규 감염물 공략 (2025.10)",
    title: "원스 휴먼 신규 감염물 특징 및 획득처 완벽 정리!",
    url: "https://vortexgaming.io/postdetail/580573",
    publishedAt: null,
    evidenceDate: "2025-10-30",
    evidence: "GUIDE",
    scope:
      "연결된 한국 영상의 장별 요약: 웨일 서쪽탑 히든, 일렉트릭 샐러맨더 알파 히든, 소환령 다크헬 클리어",
  },
  newFourVideoKO: {
    label: "한국 공략 원영상 (2025.10)",
    title: "신규감염물 특징과 획득처 정보 [원스휴먼,OnceHuman]",
    url: "https://www.youtube.com/watch?v=uV3xkL49O7U",
    publishedAt: "2025-10-30",
    evidence: "GUIDE",
    scope: "공개 제목·설명·발행일 확인. 전체 영상의 직접 실측 검증과 구분",
  },
  allScenariosGuide: {
    label: "전체 시나리오 신규 4종 공략 (2025.11)",
    title: "Once Human: How to acquire 4 new variants in all scenarios!",
    url: "https://vortexgaming.io/en/postdetail/582085",
    publishedAt: null,
    evidenceDate: "2025-11-01",
    evidence: "GUIDE",
    scope: "전체 7시나리오를 다루는 영상 요약. 일반 시나리오 던전과 비정상 수용 융합 경로를 구분",
  },
  allScenariosVideo: {
    label: "전체 시나리오 공략 원영상 (2025.11)",
    title: "Once Human - Get ALL 4 NEW Deviations in Once Human FAST + RARE Zapamander Guide",
    url: "https://www.youtube.com/watch?v=6JjJJwIaBSg",
    publishedAt: "2025-11-01",
    evidence: "GUIDE",
    scope: "공개 제목·설명·발행일 확인. 무한한 꿈 획득 장면을 직접 실측한 증거와 구분",
  },
  newFourOfficialKO: {
    label: "공식 신규 감염물 명칭 (2025.10)",
    title: "개발자 노트丨신규 감염물 4종 상세 정보 공개!",
    url: "https://www.oncehuman.game/kr/news/update/20251022/40776_1266372.html",
    publishedAt: "2025-10-22",
    evidence: "OFFICIAL",
    scope: "O-055 웨일마스트, O-056 생명의 부름, O-057 스파크맨더. 획득 던전 표는 아님",
  },
  newFourOfficialEN: {
    label: "공식 영문 감염물 명칭 (2025.10)",
    title: "Dev Blog | Details About Four New Deviations!",
    url: "https://www.oncehuman.game/news/official/20251022/40779_1266368.html",
    publishedAt: "2025-10-22",
    evidence: "OFFICIAL",
    scope: "O-055 Whalepup, O-056 Soul Summoner, O-057 Zapamander. 한국 공식과 동일 O 번호 대조",
  },
  zapED: {
    label: "무한한 꿈 알파 히든 제보 (2026.08)",
    title: "Help",
    url: "https://www.reddit.com/r/OnceHumanOfficial/comments/1w24zxx/help/",
    publishedAt: "2026-08-30",
    evidence: "PLAYER_REPORT",
    scope: "Manibus와 Endless Dream을 명시한 알파 사이드 보스 확률 드롭 제보",
  },
  zapAlias: {
    label: "한국 별칭 확인 댓글 (2026.08)",
    title: "셀러맨더랑 스파크맨더 같은거지?",
    url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=301037",
    publishedAt: "2026-08-08",
    evidence: "PLAYER_REPORT",
    scope: "일렉트릭 셀러맨더와 스파크맨더가 같은 종이라는 한국 답변. 공식 O-057 대응과 교차 확인",
  },
  teddyED: {
    label: "한국 무꿈 마스터 히든 제보 (2026.03)",
    title: "닥터테디 뺑이는 어디서 함?",
    url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=274030",
    publishedAt: "2026-03-31",
    evidence: "PLAYER_REPORT",
    scope: "실제 댓글의 무꿈 서쪽탑 마스터 히든 경로. 이 채팅 사용자 획득 관찰과 함께 확인",
  },
  teddyNoDropReport: {
    label: "한국 무꿈 반복·무획득 보고 (2026.06)",
    title: "무꿈 인데 닥터테디 구할곳 이제 없나요?",
    url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=287995",
    publishedAt: "2026-06-14",
    evidence: "PLAYER_REPORT",
    scope:
      "서쪽탑 마스터 반복에서 흑묘·웨일만 얻었다는 사례. 테디 삭제·확정 획득 불가를 증명하지 않음",
  },
  teddyOtherScenarios: {
    label: "시나리오별 수용·잡동사니 이용자 사례",
    title: "Does Dr. Teddy Drop?",
    url: "https://steamcommunity.com/app/2139460/discussions/0/4514380934493827273/",
    publishedAt: null,
    evidenceDate: "2026-03-18",
    evidence: "PLAYER_REPORT",
    scope:
      "기존 설산 PSI 잡동사니·비정상 수용 거점 사례 보존. 고정 재생성 시간·전 시나리오 풀로 일반화하지 않음",
  },
  deviationHabitats: {
    label: "공식 비정상 수용 서식지·포획 안내",
    title: "Deviation: Survive, Capture, Preserve scenario guide",
    url: "https://www.oncehuman.game/news/devBlog/20251024/40781_1266818.html",
    publishedAt: "2025-10-24",
    evidence: "OFFICIAL",
    scope: "비정상 수용 시나리오의 추적·포획 방식. 일반 사일로 보상과 구분",
  },
} satisfies Record<string, ReviewedSource>;

const siloLocation = {
  label: "사일로 전체 입구 지도 · 이름을 확인해 선택하세요",
  markerTypes: ["securementsilos"],
} as const;

/** Preserve researched routes in other scenarios; map-filter support is not a drop guarantee. */
function withEndlessDream(key: string, guide: FarmingAcquisitionGuide): FarmingAcquisitionRecord {
  const previous = DEVIANT_ACQUISITION_GUIDES[key];
  if (!previous) throw new Error(`Missing acquisition baseline: ${key}`);
  return {
    ...previous,
    verifiedScenarios: [...new Set([...previous.verifiedScenarios, "ENDLESS_DREAM" as const])],
    scenarios: { ...previous.scenarios, ENDLESS_DREAM: guide },
  };
}

/** Reviewed 2026-10-08 against outputs/deviant-recheck-dungeons-ko.json and
 * outputs/deviant-recheck-teddy-ko.json. Spread AFTER the legacy dr-teddy entry. */
export const DUNGEON_DEVIANT_RECHECK_GUIDES: Readonly<Record<string, FarmingAcquisitionRecord>> = {
  butterfly: withEndlessDream("butterfly", {
    summary:
      "시나리오별 표는 알파(ALPHA), 진화의 전야 튜토리얼, 가이아 연구센터 폐허를 대표 경로로 안내합니다. 한국 무꿈 댓글의 시그마 답변은 불확실한 기억이므로 현재 던전 보상 목록과 함께 확인하세요.",
    scopeLabel: "무한한 꿈 · 대표 경로 표(2026.02)·한국 댓글 참고",
    location: siloLocation,
    sources: [reviewedSources.game8Table, reviewedSources.butterflyED],
  }),
  "99000034": withEndlessDream("99000034", {
    summary:
      "데드빌 캠프 수용상자에서 랜덤 획득한 한국 무꿈 이용자의 경험이 있습니다. 관측된 2/2는 최대 등급이 아니며, 과거 시그마 히든 경로를 무한한 꿈의 확정 보상으로 안내하지 않습니다.",
    scopeLabel: "무한한 꿈 · 한국 직접 획득 경험(2026.04)",
    sources: [reviewedSources.wishED],
  }),
  "99000025": withEndlessDream("99000025", {
    summary:
      "대표 경로는 서쪽 탑(THETA)입니다. 한국 공략의 석상 6개 반사 퍼즐 뒤 히든 보상을 참고하되, 무한한 꿈의 최신 개별 확률·최소 난이도는 현재 보상 안내를 확인하세요.",
    scopeLabel: "무한한 꿈 · 대표 경로 표(2026.02)·한국 히든 공략 참고",
    location: siloLocation,
    sources: [reviewedSources.game8Table, reviewedSources.thetaHidden],
  }),
  "99000030": withEndlessDream("99000030", {
    summary:
      "대표 경로는 페이(PHI)이며, 한국 파이로 런 공략은 메인 보스와 별개인 히든 보스방을 반복합니다. 당시 3주차·하드·등급 경험은 현재 무한한 꿈의 필수 획득 조건으로 고정하지 않습니다.",
    scopeLabel: "무한한 꿈 · 대표 경로 표(2026.02)·한국 히든 공략 참고",
    location: siloLocation,
    sources: [reviewedSources.game8Table, reviewedSources.pyroHidden],
  }),
  "99000026": withEndlessDream("99000026", {
    summary:
      "무한한 꿈 시나리오 표의 대표 경로는 오닉스 툰드라의 델타(DELTA) 클리어입니다. 혹독한 겨울의 화염 엔드브링어 보상을 이 시나리오의 확정 드롭으로 함께 적용하지 않습니다.",
    scopeLabel: "무한한 꿈 · 시나리오별 대표 경로 표(2026.02)",
    location: siloLocation,
    sources: [reviewedSources.game8Table],
  }),
  "99000058": withEndlessDream("99000058", {
    summary:
      "대표 경로는 오닉스 툰드라 아이스하우스 캠프(캠프 이글루)의 로우에게 받는 겨울 정령 감염물 의뢰입니다. 퀘스트 초회 보상과 반복 고등급 파밍을 구분하고, 겨울 정령을 스노글로브와 혼동하지 마세요.",
    scopeLabel: "무한한 꿈 · 의뢰 대표 경로 표(2026.02)",
    sources: [reviewedSources.game8Table],
  }),
  "99000059": withEndlessDream("99000059", {
    summary:
      "알파(ALPHA)의 최종 보스와 별개인 히든·사이드 보스에서 확률적으로 획득한다는 무한한 꿈 제보가 있습니다. ‘일렉트릭 샐러맨더’는 같은 종의 한국 공략 별칭이며, 중력의 심연 등 특이 변종은 일반 개체의 던전 보상과 구분합니다.",
    scopeLabel: "무한한 꿈 · 알파 히든 제보(2026.08)·한국 신규 공략",
    location: siloLocation,
    sources: [reviewedSources.zapED, reviewedSources.newFourKO, reviewedSources.newFourOfficialKO],
  }),
  "99000064": withEndlessDream("99000064", {
    summary:
      "한국 신규 공략과 전체 시나리오 공략은 서쪽 탑(THETA) 히든 보상을 대표 파밍 경로로 안내합니다. 상위 난이도는 고등급 파밍 추천이며 무한한 꿈의 공통 최소 난이도로 확정하지 않았고, 2026년 1월 종료된 출석 보상과도 구분합니다.",
    scopeLabel: "무한한 꿈 · 전체 시나리오 공략(2025.11) 참고",
    location: siloLocation,
    sources: [
      reviewedSources.newFourKO,
      reviewedSources.allScenariosGuide,
      reviewedSources.game8Table,
    ],
  }),
  "99000066": withEndlessDream("99000066", {
    summary:
      "대표 경로는 다크헬(EX1) 최종 보스 처치 보상이며 히든방 경로가 아닙니다. 시나리오별 공략 표는 하드 이상으로 안내하고 마스터·악몽 반복은 고등급 추천이므로, 현재 서버의 난이도 개방 상태를 확인하세요.",
    scopeLabel: "무한한 꿈 · 하드 이상 공략 표(2026.02)·한국 신규 공략",
    location: siloLocation,
    sources: [
      reviewedSources.game8Table,
      reviewedSources.newFourKO,
      reviewedSources.endlessDreamUnlocks,
    ],
  }),
  "dr-teddy": {
    default: {
      summary:
        "서쪽 탑(THETA)의 히든 스테이지 보상이나 필드 쓰레기 채집에서 확률적으로 획득하는 경로가 공식 안내돼 있습니다. 이 표는 터치 오브 스카이·진화의 부름 기준이며 현재 서버의 보상 조건을 확인하세요.",
      scopeLabel: "땃쥐·진화의 부름 · 공식 획득 변경표(2025.03)",
      location: siloLocation,
      sources: [reviewedSources.officialAcquisition],
    },
    verifiedScenarios: ["MANIBUS", "ENDLESS_DREAM"],
    scenarios: {
      ENDLESS_DREAM: {
        summary:
          "서쪽 탑(THETA)의 마스터 히든 보상에서 확률적으로 획득하는 경로가 한국 커뮤니티와 실플레이 경험으로 확인됩니다. 정식 출시 규칙은 마스터가 3단계에 개방되지만, 현재 영구 서버는 실제 개방 상태를 우선 확인하며 테디가 매번 등장하는 것은 아닙니다.",
        scopeLabel: "무한한 꿈 · 마스터 히든 사례(2026.03)·개방 후 도전",
        location: siloLocation,
        sources: [
          reviewedSources.teddyED,
          reviewedSources.thetaHidden,
          reviewedSources.endlessDreamUnlocks,
          reviewedSources.teddyNoDropReport,
        ],
      },
      WINTER: {
        summary:
          "사일로 PSI(극한의 설국)의 잡동사니가 닥터 테디로 변하는 획득 사례가 있습니다. 난이도 제한과 재생성 주기를 확정한 안내는 아니므로 현재 서버의 조건을 확인하세요.",
        scopeLabel: "설산 · 잡동사니 획득 사례(2026.03)",
        location: siloLocation,
        sources: [reviewedSources.teddyOtherScenarios],
      },
      DEVIATION: {
        summary:
          "거점에서 직접 포획한 사례가 있습니다. 공생 시스템의 감염물 서식지를 확인하고 비정상 수용의 추적·포획 조건에 맞춰 준비하세요.",
        scopeLabel: "비정상 수용 · 야외 포획 사례",
        sources: [reviewedSources.deviationHabitats, reviewedSources.teddyOtherScenarios],
      },
    },
  },
};

/** Source-level dates and evidence are retained separately from the existing guide UI contract. */
export const DUNGEON_DEVIANT_RECHECK_EVIDENCE = {
  reviewedAt: "2026-10-08",
  researchFiles: [
    "outputs/deviant-recheck-dungeons-ko.json",
    "outputs/deviant-recheck-teddy-ko.json",
  ],
  sources: reviewedSources,
  endlessDreamLaunchUnlocks: {
    sourceId: "endlessDreamUnlocks",
    hardFromPhase: 2,
    masterAndNightmareFromPhase: 3,
    appliesTo: "2025-07 정식 출시의 던전 난이도 개방 규칙",
    isUniversalDeviantDropGate: false,
    permanentServerCondition:
      "현재 서버에서 이미 개방된 난이도는 서버 화면의 입장·보상 조건을 우선 확인",
  },
  limitations: {
    butterfly: "ED 표의 알파와 한국 댓글의 시그마 기억을 구분. Manibus 공식 시그마는 다른 범위",
    "99000034": "수용상자의 관측 2/2는 최대 등급이 아니며 고정 갱신 시간도 확정하지 않음",
    "99000025": "THETA 대표 경로와 원본 히든 퍼즐 공략을 합치되 ED 최소 난이도·정확 풀은 별도 확인",
    "99000030": "PHI 대표 경로와 원본 파이로 런을 합치되 2024년 3주차·등급 관찰은 현행 조건이 아님",
    "99000026": "ED 델타 대표 표와 겨울 화염 엔드브링어 원본 보상을 분리",
    "99000058":
      "로우 퀘스트 초회 획득과 타우 반복·고등급 파밍을 분리. 겨울 정령은 스노글로브와 다른 종",
    "99000059": "알파 ED 히든 제보. O-057 공식 한·영 대응과 한국 별칭 확인; 트랜스·블록 변종 분리",
    "99000064":
      "전체 시나리오 공략의 THETA 대표 경로. ED 직접 획득 장면·독립적인 최소 난이도 검증과 구분",
    "99000066":
      "ED EX1 하드 이상은 공략 표 조건. 일반 EX1과 편차 EX1의 정확 동일 풀은 보증하지 않음",
    "dr-teddy":
      "한국 마스터 히든 제보와 사용자 경험. 반복 무획득 사례가 있어 확정 지급으로 표현하지 않으며 다른 난이도 전체 풀도 보증하지 않음",
  },
  excludedCurrentRecommendations: [
    "웨일마스트 출석 보상은 2026-01-21 종료된 행사",
    "닥터 테디 변이 공존은 해당 트랜스 보물상자 보상이며 일반 THETA 드롭과 별개",
    "수호 블록 테디는 2026-08-24 종료된 블록 행사 보상",
    "신규종 공식 설정의 구름 수명·바닷물 접촉 시간은 실제 파밍 타이머가 아님",
  ],
} as const;
