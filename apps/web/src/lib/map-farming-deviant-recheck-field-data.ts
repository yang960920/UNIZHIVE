import type {
  FarmingAcquisitionGuide,
  FarmingAcquisitionRecord,
  FarmingAcquisitionSource,
} from "./map-farming-acquisition";
import { DEVIANT_ACQUISITION_GUIDES } from "./map-farming-deviant-acquisition-data";

const officialRoutes: FarmingAcquisitionSource = {
  label: "땃쥐 공식 (2025.03)",
  title: "1.4.3 한국어 공지 — 터치 오브 스카이·진화의 부름 획득표",
  url: "https://www.oncehuman.game/kr/news/update/20250312/40776_1218377.html",
};

const contentChange: FarmingAcquisitionSource = {
  label: "공식 개편 (2026.01)",
  title: "2.3.1 한국어 공지 — 안개 보상 이관·방어 공방 교체",
  url: "https://www.oncehuman.game/kr/news/update/20260121/40776_1282973.html",
};

const controllerChange: FarmingAcquisitionSource = {
  label: "공식 보상 변경 (2025.03)",
  title: "1.4.4 공지 — 2025-03-27 이후 컨트롤러 없이 전체 보상",
  url: "https://www.oncehuman.game/news/update/20250326/40780_1222452.html",
};

function koreanGuide(name: string, publishedMonth: string): FarmingAcquisitionSource {
  return {
    label: `한국 공략 (${publishedMonth})`,
    title: `원스휴먼 감염물 도감 ${name} — 시나리오 미명시`,
    url:
      "https://constante.tistory.com/entry/" +
      encodeURIComponent(
        `원스휴먼-감염물-도감-${name.replaceAll(" ", "-")}-타입-특성-얻는-방법-수용-환경-총-정리`,
      ),
  };
}

const miniWonderPlayerReport: FarmingAcquisitionSource = {
  label: "한국 제작 사례 (2025.10)",
  title: "55수급처 ㄹㅇ — 소용돌이 제작 후 수령; 시나리오 미명시",
  url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=228640",
};

const blackfellMerchant: FarmingAcquisitionSource = {
  label: "한국 상인 공략 (2026.01)",
  title: "레이시 판매 목록 — 블랙펠; 시나리오 미명시",
  url:
    "https://constante.tistory.com/entry/" +
    encodeURIComponent("원스휴먼Once-Human-NPC상인-레이시-판매-아이템-에너지-링크-사용처"),
};

const historicalScope = "땃쥐 공식 획득표(2025-03) · 한국 공략으로 보완";
const endlessCandidateScope = "무한의 꿈 · 대표 경로 참고 · 직접 획득 사례 미확인";

/** Keep the existing, separately sourced winter/SCP routes when replacing a field guide.
 * Explicit ED guides communicate candidate routes without treating provider filter support
 * or a scenario-unspecified Korean guide as verified local acquisition evidence. */
function fieldOverride(
  key: string,
  defaultGuide: FarmingAcquisitionGuide,
  endlessGuide: FarmingAcquisitionGuide,
): FarmingAcquisitionRecord {
  const original = DEVIANT_ACQUISITION_GUIDES[key]!;
  return {
    ...original,
    default: defaultGuide,
    scenarios: {
      ...original.scenarios,
      ENDLESS_DREAM: endlessGuide,
    },
  };
}

/** Reviewed 2026-10-08; evidence and excluded conflicting claims:
 * outputs/deviant-recheck-field-ko.json.
 * General forms only: trance variants, paid skins and transferred ownership do not
 * establish a local drop route. No numeric drop rate or guaranteed respawn is assumed. */
export const FIELD_DEVIANT_RECHECK_GUIDES: Readonly<Record<string, FarmingAcquisitionRecord>> = {
  "99000003": fieldOverride(
    "99000003",
    {
      summary:
        "화물 쟁탈에서 씨앗을 받을 때 일반 극한의 해파리를 얻는 경로입니다. 한국 공략의 캠프 수용 시설도 보완 후보이며, 매번 출현하거나 특정 등급을 보장하지 않습니다.",
      scopeLabel: historicalScope,
      sources: [officialRoutes, koreanGuide("극한의 해파리", "2026.01")],
    },
    {
      summary:
        "대표 경로는 화물 쟁탈의 씨앗 보상입니다. 무한의 꿈에서 해당 이벤트가 열려 있다면 보상을 확인하고, 캠프 수용 시설도 보완 후보로 살펴보세요. 한국 캠프 공략은 시나리오를 명시하지 않았습니다.",
      scopeLabel: endlessCandidateScope,
      sources: [officialRoutes, koreanGuide("극한의 해파리", "2026.01")],
    },
  ),
  "99000035": fieldOverride(
    "99000035",
    {
      summary:
        "양파를 재배·수확하며 감염물 변이 생성을 노리는 경로입니다. 캠프 수용 시설의 랜덤 획득 안내도 있으나, 비료별 감염물 확률이나 필요한 수확 횟수는 확인되지 않았습니다.",
      scopeLabel: historicalScope,
      sources: [officialRoutes, koreanGuide("악취 구근", "2026.02")],
    },
    {
      summary:
        "양파 재배·수확 변이를 대표 파밍 후보로 참고하세요. 캠프 수용 시설도 보완 경로로 안내돼 있습니다. 일반형 획득과 보라색 옷 등 변종의 현재 출현 조건은 구분해야 합니다.",
      scopeLabel: endlessCandidateScope,
      sources: [officialRoutes, koreanGuide("악취 구근", "2026.02")],
    },
  ),
  "99000038": fieldOverride(
    "99000038",
    {
      summary:
        "무기 상자를 열어 일반 사무라이의 획득 기회를 노리세요. 데드빌 수용 시설의 랜덤 획득 공략도 있습니다. 일반형 경로가 달의 징조 변종의 출현을 보장하지는 않습니다.",
      scopeLabel: historicalScope,
      sources: [officialRoutes, koreanGuide("사무라이", "2026.01")],
    },
    {
      summary:
        "무기 상자 개봉을 대표 파밍 후보로 참고하세요. 한국 공략에는 데드빌 수용 시설의 랜덤 획득도 소개돼 있지만 시나리오는 명시하지 않았습니다. 달의 징조 변종 조건은 별도로 확인하세요.",
      scopeLabel: endlessCandidateScope,
      sources: [officialRoutes, koreanGuide("사무라이", "2026.01")],
    },
  ),
  "99000047": fieldOverride(
    "99000047",
    {
      summary:
        "야생 감염물을 수용하는 경로입니다. 한국 공략의 해안 광장 건물 안·에버그린 포도원과 캠프 수용 시설을 찾아보세요. 후보 지점은 비어 있을 수 있으며 고정 재출현 시간은 확인되지 않았습니다.",
      scopeLabel: historicalScope,
      sources: [officialRoutes, koreanGuide("저주 인형", "2026.01")],
    },
    {
      summary:
        "해안 광장 건물 안·에버그린 포도원의 야생 수용 지점과 캠프 수용 시설을 탐색 후보로 참고하세요. 한국 공략은 시나리오를 명시하지 않았으며, 지도에 표시된 곳에 항상 출현하는 것은 아닙니다.",
      scopeLabel: endlessCandidateScope,
      sources: [officialRoutes, koreanGuide("저주 인형", "2026.01")],
    },
  ),
  "99000049": fieldOverride(
    "99000049",
    {
      summary:
        "블랙펠 상인의 판매 목록을 먼저 확인하세요. 농장 공포 의뢰는 최초 보상 후보이며 캠프 수용 시설은 랜덤 파밍 후보입니다. 옛 방어 공방은 채굴 광산 공방으로 교체돼 같은 감염물 드롭을 적용하지 않습니다.",
      scopeLabel: "땃쥐 상인 공식표 · 한국 공략(2026-01) · 공방 개편 반영",
      sources: [
        officialRoutes,
        blackfellMerchant,
        koreanGuide("부서진 소녀", "2026.01"),
        contentChange,
      ],
    },
    {
      summary:
        "블랙펠 상인 판매 목록과 농장 공포 의뢰의 현재 보상을 확인하세요. 의뢰 보상을 반복 파밍으로 안내하지 않으며, 캠프 수용 시설은 보완 후보입니다. 옛 방어 공방 경로는 현재 안내에서 제외했습니다.",
      scopeLabel: endlessCandidateScope,
      sources: [blackfellMerchant, koreanGuide("부서진 소녀", "2026.01"), contentChange],
    },
  ),
  "99000050": fieldOverride(
    "99000050",
    {
      summary:
        "영지 제작대에서 소용돌이 발생기를 제작한 뒤 수령할 때 획득 기회가 있습니다. 한국 이용자도 연구 작업대의 소용돌이 투척물 제작·수령을 파밍 경로로 설명합니다. 제작 횟수와 5/5 등급은 보장되지 않습니다.",
      scopeLabel: "땃쥐 공식 획득표 · 한국 실제 제작 사례(2025-10)",
      sources: [officialRoutes, miniWonderPlayerReport],
    },
    {
      summary:
        "소용돌이 발생기를 제작한 뒤 수령하는 대표 경로를 참고하세요. 한국 실제 파밍 설명도 일치하지만 해당 글은 시나리오를 명시하지 않았습니다. 데드빌 수용 시설은 한국 공략의 보완 후보입니다.",
      scopeLabel: endlessCandidateScope,
      sources: [officialRoutes, miniWonderPlayerReport, koreanGuide("미니 특이점", "2026.01")],
    },
  ),
  "99000053": fieldOverride(
    "99000053",
    {
      summary:
        "현재 서버의 오염 지역 안에 있는 엘리트를 처치해 보상을 확인하세요. 옛 안개 보상이 오염 엘리트로 이관돼 미니 하스터의 기존 경로와 연결한 안내입니다. 아무 로제타 엘리트나 고정 드롭하는 경로는 아닙니다.",
      scopeLabel: "공식 경로 변경 연결(2026-01) · 개별 드롭 사례 미확인",
      sources: [officialRoutes, contentChange],
    },
    {
      summary:
        "현재 서버의 오염 지역 엘리트 처치가 공식 변경을 연결한 파밍 경로입니다. 무한의 꿈의 오염 지역은 서버마다 위치가 달라 군사기지 이름만으로 찾으면 안 됩니다. 옛 안개 퀘스트와 일반 로제타의 확정 보상으로 안내하지 않습니다.",
      scopeLabel: "무한의 꿈 · 공식 개편 연결 · 개별 드롭 사례 미확인",
      sources: [officialRoutes, contentChange],
    },
  ),
  "99000032": fieldOverride(
    "99000032",
    {
      summary:
        "오리진 보물 보상에서 획득 기회를 노리는 경로입니다. 보상에 컨트롤러는 필요하지 않습니다. 일반 하늘의 후예와 트랜스 변종의 현재 보상 조건은 구분해서 확인하세요.",
      scopeLabel: "땃쥐 공식 획득표 · 컨트롤러 폐지 반영(2025-03)",
      sources: [officialRoutes, controllerChange],
    },
    {
      summary:
        "한국 공략의 캠프 수용 시설 보상을 보완 후보로 확인하세요. 공략은 시나리오를 명시하지 않아 현재 무한의 꿈의 드롭을 보장하지 않습니다. 땃쥐의 오리진 보물 경로를 이 시나리오에 그대로 적용하지 않습니다.",
      scopeLabel: endlessCandidateScope,
      sources: [koreanGuide("하늘의 후예", "2026.01"), officialRoutes],
    },
  ),
};
