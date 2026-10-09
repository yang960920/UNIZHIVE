import { z } from "zod";
import {
  PARTY_CONTRIBUTION_KEYS,
  emptyPartyContribution,
  type PartyContribution,
  type PartyContributionKey,
  type PartyVulnerabilityType,
} from "@uniz/domain";

export const partyContributionKeysSchema = z
  .array(z.enum(PARTY_CONTRIBUTION_KEYS))
  .max(PARTY_CONTRIBUTION_KEYS.length)
  .refine((keys) => new Set(keys).size === keys.length, "같은 협동 효과는 한 번만 선택해 주세요.");

const percentage = z.number().min(0).max(100).nullable().default(null);
export const partyContributionSchema = z
  .object({
    keys: partyContributionKeysSchema.default([]),
    loadoutNote: z.string().trim().max(240).default(""),
    vulnerability: z
      .object({ weapon: percentage, status: percentage, melee: percentage })
      .strict()
      .default({ weapon: null, status: null, melee: null }),
  })
  .strict();

export function readPartyContribution(value: unknown): PartyContribution {
  const parsed = partyContributionSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyPartyContribution();
}

export const PARTY_CONTRIBUTIONS: readonly {
  key: PartyContributionKey;
  label: string;
  description: string;
  examples: string;
}[] = [
  {
    key: "weapon-vulnerability",
    label: "총기 취약",
    description: "적에게 총기 피해에 대한 취약을 부여합니다.",
    examples: "나비 · 울프의 속삭임 · 스냅샷 · 소환령 · 저주 인형",
  },
  {
    key: "status-vulnerability",
    label: "트랜스 취약",
    description: "적에게 트랜스 피해에 대한 취약을 부여합니다.",
    examples: "파이로 다이노 · 극한의 해파리 · 영원한 태양 · 웨일마스트 · 저주 인형",
  },
  {
    key: "melee-vulnerability",
    label: "근접 취약",
    description: "적에게 근접 피해에 대한 취약을 부여합니다.",
    examples: "저주 인형 · 실제 사용하는 근접 취약 세팅",
  },
  {
    key: "bulls-eye",
    label: "헌터 마크",
    description: "함께 공격할 적에게 취약 표식을 유지합니다.",
    examples: "헌터 마크 무기 · 스냅샷 · 소환령",
  },
  {
    key: "fortress",
    label: "진형 설치",
    description: "아군이 이용할 포트리스 워페어 영역을 설치합니다.",
    examples: "포트리스 워페어 무기 · 도끼 · M416-추분",
  },
  {
    key: "healing",
    label: "회복·부활",
    description: "아군의 회복이나 부활을 돕습니다.",
    examples: "닥터 테디 · 활성화 젤 · M416-추분",
  },
  {
    key: "shield",
    label: "보호·실드",
    description: "아군을 보호하는 영역이나 실드를 제공합니다.",
    examples: "용사 조지 · 활성화 젤의 엄폐물 · 하늘의 후예의 바람벽",
  },
  {
    key: "control",
    label: "몹몰이·제어",
    description: "적을 모으거나 행동을 제한해 공동 공격을 돕습니다.",
    examples: "미니 특이점 · 울프의 속삭임 · 부서진 소녀",
  },
  {
    key: "mobility",
    label: "이동·소환 지원",
    description: "이동이나 집결을 돕습니다.",
    examples: "하늘의 후예 · 스페이스 큐브로 제작한 소환 큐브",
  },
  {
    key: "supplies",
    label: "준비물 지원",
    description: "음식·음료나 진행에 필요한 물자를 함께 준비합니다.",
    examples: "도핑 음식·음료 · 콘텐츠별 준비물",
  },
];

export function getPartyContribution(key: string) {
  return PARTY_CONTRIBUTIONS.find((item) => item.key === key) ?? null;
}

/** Hive owner confirmed the community stacking convention on 2026-10-10.
 * This is a display policy for declared percentages, not an official-source claim
 * or a limit on the number of players/Deviations who may join. */
export const PARTY_VULNERABILITY_CAP = 100;
export const PARTY_VULNERABILITY_TYPES: readonly {
  key: PartyVulnerabilityType;
  label: string;
}[] = [
  { key: "weapon", label: "총기 취약" },
  { key: "status", label: "트랜스 취약" },
  { key: "melee", label: "근접 취약" },
];

export function summarizePartySynergy(
  attendees: readonly { status: string; contribution?: PartyContribution }[],
) {
  const going = attendees.filter((attendee) => attendee.status === "GOING");
  const setups = going.map((attendee) => readPartyContribution(attendee.contribution));
  const vulnerability = Object.fromEntries(
    PARTY_VULNERABILITY_TYPES.map(({ key }) => {
      const entered = setups.flatMap((setup) =>
        setup.vulnerability[key] === null ? [] : [setup.vulnerability[key]],
      );
      const rawTotal = Math.round(entered.reduce((sum, value) => sum + value, 0) * 100) / 100;
      return [
        key,
        {
          rawTotal,
          cappedTotal: Math.min(PARTY_VULNERABILITY_CAP, rawTotal),
          enteredCount: entered.length,
        },
      ];
    }),
  ) as Record<
    PartyVulnerabilityType,
    { rawTotal: number; cappedTotal: number; enteredCount: number }
  >;
  return {
    goingCount: going.length,
    contributions: PARTY_CONTRIBUTIONS.map(({ key }) => ({
      key,
      count: setups.filter((setup) => setup.keys.includes(key)).length,
    })),
    vulnerability,
  };
}

type PartySynergyGuide = {
  id: string;
  title: string;
  categoryKeys: readonly PartyContributionKey[];
  summary: string;
  scope: string;
  caution: string;
  confidence: "OFFICIAL" | "GUIDE" | "REFERENCE";
  sources: readonly { label: string; url: string }[];
};
const koGuide = (name: string) => ({
  label: "한국 감염물 공략",
  url:
    "https://constante.tistory.com/entry/" +
    encodeURIComponent(
      `원스휴먼-감염물-도감-${name.replaceAll(" ", "-")}-타입-특성-얻는-방법-수용-환경-총-정리`,
    ),
});
const febBalance = {
  label: "공식 취약·피해 유형 조정",
  url: "https://www.oncehuman.game/news/devBlog/20260212/40781_1287008.html",
};
const combatUpgrade = {
  label: "공식 전투 감염물 개편",
  url: "https://www.oncehuman.game/news/devBlog/20251218/40781_1277420.html",
};
const rifleGuide = {
  label: "한국 무기 도감",
  url:
    "https://constante.tistory.com/entry/" +
    encodeURIComponent("원스휴먼Once-Human-아이템-도감-소총-등급-타입-특성-효과-총정리"),
};

/** Reviewed against official changes through 3.0.7. Source confidence describes
 * the effect itself; numerical stacking uses the separate hive display policy. */
export const PARTY_SYNERGY_GUIDE: readonly PartySynergyGuide[] = [
  {
    id: "voodoo-doll",
    title: "저주 인형 · 적 취약과 개인 효과",
    categoryKeys: ["weapon-vulnerability", "status-vulnerability", "melee-vulnerability"],
    summary: "X로 주변 적에게 총기·트랜스·근접 취약을 부여해 함께 공격하는 메타의 피해를 돕습니다.",
    scope: "일반 PvE · 무한의 꿈",
    caution:
      "E의 피해 증가와 자기 취약은 개인 효과입니다. 사거리와 적중을 확인하세요. 취약 합산은 최대 100%로 표시하며 인형 개수나 참가 인원은 제한하지 않습니다.",
    confidence: "GUIDE",
    sources: [
      koGuide("저주 인형"),
      {
        label: "공식 3.0.7 설명 정정",
        url: "https://www.oncehuman.game/news/update/20260924/40780_1315053.html",
      },
    ],
  },
  {
    id: "damage-types",
    title: "총기·트랜스 취약 · 피해 유형에 맞추기",
    categoryKeys: ["weapon-vulnerability", "status-vulnerability"],
    summary:
      "나비·울프·스냅샷·소환령의 총기 세팅과 파이로·해파리·영원한 태양 등의 트랜스 세팅을 구분해 준비합니다.",
    scope: "같은 적을 공격할 때 · 피해 유형별 적용",
    caution:
      "원소 피해가 항상 트랜스 피해인 것은 아닙니다. 일부 충전탄은 패치로 트랜스 피해로 변경됐습니다. 감염물 등급·스킬과 무기 피해 유형을 확인한 값을 직접 입력하세요.",
    confidence: "OFFICIAL",
    sources: [
      febBalance,
      {
        label: "한국 공동 취약 실전 공략",
        url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=290740",
      },
    ],
  },
  {
    id: "whalepup",
    title: "웨일마스트 · 트랜스 취약",
    categoryKeys: ["status-vulnerability"],
    summary:
      "공식 3.0.5에서 총기 취약을 제거하고, 공격한 대상에게 트랜스 취약을 주는 효과로 정리했습니다.",
    scope: "공식 2026년 9월 조정 기준",
    caution: "예전 총기·트랜스 동시 취약 설명을 사용하지 마세요.",
    confidence: "OFFICIAL",
    sources: [
      {
        label: "공식 3.0.5 취약 변경",
        url: "https://www.oncehuman.game/news/update/20260902/40780_1312959.html",
      },
    ],
  },
  {
    id: "bulls-eye",
    title: "헌터 마크 · 공동 표식",
    categoryKeys: ["bulls-eye"],
    summary:
      "취약 표식을 유지해 같은 적을 공격하는 메타의 공격을 돕습니다. 스냅샷과 소환령도 표식을 부여할 수 있습니다.",
    scope: "적 표식 · 함께 공격할 대상",
    caution:
      "표식 무기나 방어구에 붙은 개인 치명률·약점 피해 보너스까지 파티에 공유되는 것은 아닙니다. 같은 효과를 중복 입력하지 마세요.",
    confidence: "GUIDE",
    sources: [
      febBalance,
      {
        label: "한국 헌터 마크 모듈 공략",
        url:
          "https://constante.tistory.com/entry/" +
          encodeURIComponent("원스휴먼Once-Human-모듈-무기-헌터마크-종류와-효과-정리"),
      },
    ],
  },
  {
    id: "fortress",
    title: "포트리스 워페어 · 진형 공유",
    categoryKeys: ["fortress"],
    summary:
      "영역 안 아군이 진형 버프를 이용합니다. 사용할 무기와 모듈을 미리 적어 집결 위치를 맞추세요.",
    scope: "아군이 영역 안에 있을 때",
    caution:
      "추가 총기 피해·치명률·자동 장전 옵션에는 개인 효과가 섞여 있습니다. 여러 장판의 보너스를 단순히 곱하거나 더하지 않습니다.",
    confidence: "GUIDE",
    sources: [
      {
        label: "한국 포트리스 워페어 공략",
        url:
          "https://constante.tistory.com/entry/" +
          encodeURIComponent("원스휴먼Once-Human-모듈-무기-포트리스-워페어-종류와-효과-정리"),
      },
      {
        label: "한국 공식 개인·영역 효과 설명",
        url: "https://www.oncehuman.game/kr/news/update/20250110/40776_1205985.html",
      },
    ],
  },
  {
    id: "autumn-equinox",
    title: "M416-추분 · 진형 안 아군 회복",
    categoryKeys: ["fortress", "healing"],
    summary: "추분은 포트리스 워페어 영역 안 아군을 회복시키는 무기입니다.",
    scope: "추분으로 생성한 진형",
    caution:
      "다른 포트리스 워페어 무기까지 같은 회복 효과를 갖는 것은 아닙니다. 예전 사일런트 리턴의 아군 사격 치료 공략과 구분하세요.",
    confidence: "GUIDE",
    sources: [rifleGuide],
  },
  {
    id: "doctor-teddy",
    title: "닥터 테디 · 회복·부활과 강화 호르몬",
    categoryKeys: ["healing"],
    summary:
      "범위 내 아군의 회복·부활을 돕고 강화 호르몬으로 피해 감소·재장전·사격 속도를 지원합니다.",
    scope: "범위·시야·스킬 조건 확인",
    caution:
      "여러 테디의 강화 호르몬을 단순 합산하지 마세요. 비정상 중첩을 수정한 공식 기록이 있습니다.",
    confidence: "GUIDE",
    sources: [
      {
        label: "한국 테디 스킬 공략",
        url:
          "https://constante.tistory.com/entry/" +
          encodeURIComponent(
            "원스휴먼-감염물-도감-닥터-테디-변이-타입-특성-얻는-방법-수용-환경-총-정리",
          ),
      },
      {
        label: "공식 강화 호르몬 중첩 수정",
        url: "https://www.oncehuman.game/news/update/20260107/40780_1280584.html",
      },
    ],
  },
  {
    id: "festering-gel",
    title: "활성화 젤 · 공동 회복과 엄폐",
    categoryKeys: ["healing", "shield"],
    summary: "엄폐물 주변 아군의 HP와 멘탈을 회복하고 공격을 막을 자리를 제공합니다.",
    scope: "엄폐물 근처 아군",
    caution: "E로 자신을 감싸는 실드와 X의 주변 아군 회복은 다른 효과입니다.",
    confidence: "GUIDE",
    sources: [koGuide("활성화 젤")],
  },
  {
    id: "brave-george",
    title: "용사 조지 · 보호 영역의 실드",
    categoryKeys: ["shield"],
    summary: "보호 영역 안 메타에게 실드와 실드 용량 증가를 제공합니다.",
    scope: "일반 PvE · 비정상 수용은 다른 스킬",
    caution: "보호 영역 밖에서는 같은 효과를 기대할 수 없습니다.",
    confidence: "OFFICIAL",
    sources: [
      {
        label: "공식 용사 조지 스킬",
        url: "https://www.oncehuman.game/news/update/20260325/40780_1292938.html",
      },
    ],
  },
  {
    id: "by-the-wind",
    title: "하늘의 후예 · 바람벽과 이동",
    categoryKeys: ["shield", "mobility"],
    summary: "바람벽으로 방어를 돕고 벽을 통과하는 아군에게 이동 속도 증가를 제공합니다.",
    scope: "벽을 통과하는 아군 · 지형·집결 지원",
    caution: "이동·방어 효과를 파티 전체 공격력 증가로 해석하지 않습니다.",
    confidence: "GUIDE",
    sources: [koGuide("하늘의 후예"), combatUpgrade],
  },
  {
    id: "crowd-control",
    title: "미니 특이점·울프·부서진 소녀 · 몹몰이와 제어",
    categoryKeys: ["control"],
    summary: "블랙홀·끌어오기·도발·석화로 적을 모으거나 행동을 제한해 함께 공격할 기회를 만듭니다.",
    scope: "제어 효과를 받는 적",
    caution:
      "보스와 특수 적은 제어에 면역일 수 있습니다. 몹몰이로 동료의 사격 위치가 흐트러지지 않도록 위치를 맞추세요.",
    confidence: "OFFICIAL",
    sources: [
      combatUpgrade,
      koGuide("부서진 소녀"),
      {
        label: "공식 울프 도발 조정",
        url: "https://www.oncehuman.game/banner/20260226/41906_1288020.html",
      },
    ],
  },
  {
    id: "travel-and-supplies",
    title: "집결·도핑·준비물 지원",
    categoryKeys: ["mobility", "supplies"],
    summary: "소환 큐브로 집결을 돕거나 음식·음료·콘텐츠별 물자를 함께 준비할 수 있습니다.",
    scope: "파밍·탐험·전투 전 준비",
    caution:
      "음식을 나눠 주는 것과 먹은 사람의 도핑 효과를 자동으로 파티에 공유하는 것은 다릅니다. 입장 제한과 준비물 사용 조건을 확인하세요.",
    confidence: "GUIDE",
    sources: [
      {
        label: "한국 소환·도핑 준비 공략",
        url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=158016",
      },
    ],
  },
  {
    id: "equipment-combos",
    title: "개인 장비가 아군 상태를 이용하는 조합",
    categoryKeys: ["fortress"],
    summary:
      "워페어 상태에서 작동하는 전투화, 아군을 도탄 경유 대상으로 삼는 바지 등 장비별 연계도 있습니다.",
    scope: "장비 조합 참고 · 현재 조건 재확인",
    caution:
      "착용자의 자동 장전·사격 속도 효과를 다른 메타에게 나눠 주는 기능으로 안내하지 않습니다. 현재 스킬 문구를 확인한 뒤 준비 세팅에 적어 주세요.",
    confidence: "REFERENCE",
    sources: [
      {
        label: "공식 전투화 조정",
        url: "https://www.oncehuman.game/news/update/20250115/40780_1207023.html",
      },
      {
        label: "공식 아군 도탄 장비 조정",
        url: "https://www.oncehuman.game/news/devBlog/20241123/40781_1195665.html",
      },
    ],
  },
  {
    id: "interaction-cautions",
    title: "취약·플레임·서리 · 중첩과 방해 확인",
    categoryKeys: ["weapon-vulnerability", "status-vulnerability", "control"],
    summary:
      "같은 효과를 여러 사람이 사용할 때는 유지 시간·피해 유형·콘텐츠별 조건을 함께 확인합니다.",
    scope: "현재 스킬 문구와 콘텐츠 기준",
    caution:
      "취약 합산은 유형별 최대 100%로 표시합니다. 이를 플레임·서리·진형의 모든 중첩 규칙에 그대로 적용하지 않습니다. 균열자에서는 저주 인형 등의 사거리와 점성얼음 파괴가 문제가 된 사례도 있습니다.",
    confidence: "GUIDE",
    sources: [
      {
        label: "한국 균열자 협동 주의 사항",
        url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=290740",
      },
      {
        label: "공식 파워서지 사용자 간 충돌 수정",
        url: "https://www.oncehuman.game/news/wiki/20250814/40782_1247568.html",
      },
      {
        label: "공식 서리 모듈 효과 변경",
        url: "https://www.oncehuman.game/news/update/20250825/40780_1255893.html",
      },
    ],
  },
];
