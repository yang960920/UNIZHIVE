import {
  GEAR_CATALOG,
  createGearSelection,
  normalizeWeaponCrafting,
  type GearSelection,
  type GearSlot,
  type PlannerGearLoadout,
} from "@uniz/build-engine";

export const gearSlotLabels: Record<GearSlot, string> = {
  primary: "주 무기",
  secondary: "보조 무기",
  melee: "근접 무기",
  helmet: "헬멧",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  gloves: "장갑",
  mask: "마스크",
  combatDeviant: "전투 감염물",
  "cradle-1": "크래들 1",
  "cradle-2": "크래들 2",
  "cradle-3": "크래들 3",
  "cradle-4": "크래들 4",
  "cradle-5": "크래들 5",
  "cradle-6": "크래들 6",
  "cradle-7": "크래들 7",
  "cradle-8": "크래들 8",
};
export const weaponSlots: GearSlot[] = ["primary", "secondary", "melee"];
export const armorSlots: GearSlot[] = ["helmet", "top", "bottom", "shoes", "gloves", "mask"];
export const emptySlotIcons: Partial<Record<GearSlot, string>> = Object.fromEntries(
  ["helmet", "top", "bottom", "gloves", "shoes"].map((slot) => [
    slot,
    `/game/planner/ui/slot-${slot}.png`,
  ]),
);
export const cradleSlots: GearSlot[] = [
  "cradle-1",
  "cradle-2",
  "cradle-3",
  "cradle-4",
  "cradle-5",
  "cradle-6",
  "cradle-7",
  "cradle-8",
];
export type AttachmentKey = "module" | "muzzle" | "sight" | "tactical" | "magazine" | "ammo";
export const attachmentLabels: Record<AttachmentKey, string> = {
  module: "모듈",
  muzzle: "총구",
  sight: "사이트",
  tactical: "전술",
  magazine: "탄창",
  ammo: "총알",
};
export type GearItem = (typeof GEAR_CATALOG)[number];
export const gearItemById = new Map(GEAR_CATALOG.map((item) => [item.id, item]));
export function gearItemName(item: GearItem): string {
  return item.displayName ?? item.name;
}
export function gearDisplayName(id: string, recordedNames?: Record<string, string>): string {
  const item = gearItemById.get(id);
  const recorded = recordedNames?.[id];
  // Correct documented identity errors in the display while leaving immutable snapshots intact.
  if (item?.displayName) return item.displayName;
  if (recorded && item?.correctedNames?.includes(recorded)) return gearItemName(item);
  return recorded ?? item?.name ?? `이전 항목 (${id})`;
}
export const cradleCompatibilityNote =
  "시나리오·캐릭터 해금 조건은 아직 확인되지 않았습니다. 게임에서 장착 가능한 항목을 기록해주세요.";

export function countGearArmorSets(
  selections: readonly GearSelection[],
  catalog: readonly GearItem[] = GEAR_CATALOG,
): { setId: string; count: number }[] {
  const items =
    catalog === GEAR_CATALOG ? gearItemById : new Map(catalog.map((item) => [item.id, item]));
  const counts = new Map<string, number>();
  const countedSlots = new Set<GearSlot>();
  for (const selection of selections) {
    if (!armorSlots.includes(selection.slot) || countedSlots.has(selection.slot)) continue;
    const item = items.get(selection.itemId);
    if (item?.kind !== "ARMOR" || !item.setId || !item.allowedSlots.includes(selection.slot))
      continue;
    countedSlots.add(selection.slot);
    counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  }
  return [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([setId, count]) => ({ setId, count }));
}

export function newGearSelection(slot: GearSlot, itemId: string): GearSelection {
  return normalizeWeaponCrafting(createGearSelection(slot, itemId), gearItemById.get(itemId));
}

export function equipGearItem(
  loadout: PlannerGearLoadout,
  slot: GearSlot,
  itemId: string,
): PlannerGearLoadout {
  const previous = loadout.slots.find((item) => item.slot === slot);
  if (previous?.itemId === itemId) return loadout;
  const selection = newGearSelection(slot, itemId);
  return {
    ...loadout,
    slots: previous
      ? loadout.slots.map((item) => (item.slot === slot ? selection : item))
      : [...loadout.slots, selection],
  };
}

export function changeGearAttachment(
  selection: GearSelection,
  key: AttachmentKey,
  itemId: string | null,
): GearSelection {
  if (selection.attachments[key] === itemId) return selection;
  return {
    ...selection,
    attachments: {
      ...selection.attachments,
      [key]: itemId,
      ...(key === "module" ? { moduleSuffix: null, moduleLevel: null } : {}),
    },
  };
}

export function parseGearNumber(text: string, maximum = 100): number | null {
  if (!text.trim()) return null;
  if (!/^\d+$/.test(text.trim())) throw new Error("1 이상의 정수를 입력해주세요.");
  const number = Number(text.trim());
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum)
    throw new Error(
      maximum === 17 ? "모듈 레벨은 1~17로 입력해주세요." : "1 이상의 유효한 정수를 입력해주세요.",
    );
  return number;
}

function normalizeSearch(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase("ko-KR");
}
function compactSearch(text: string) {
  return normalizeSearch(text).replace(/[\s\-_.·()[\]<>]+/gu, "");
}
function searchText(item: GearItem) {
  const text = normalizeSearch([gearItemName(item), item.name, ...item.aliases].join(" "));
  return { text, compact: compactSearch(text), name: compactSearch(gearItemName(item)) };
}
// Object identities avoid stale results for a caller's historical labels or test fixtures.
const searchIndex = new WeakMap<GearItem, ReturnType<typeof searchText>>();
export function searchGearItems(items: readonly GearItem[], query: string): GearItem[] {
  const words = normalizeSearch(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  const phrase = compactSearch(query);
  const results: { item: GearItem; rank: number }[] = [];
  for (const item of items) {
    let indexed = searchIndex.get(item);
    if (!indexed) {
      indexed = searchText(item);
      searchIndex.set(item, indexed);
    }
    if (
      !words.every(
        (word) => indexed.text.includes(word) || indexed.compact.includes(compactSearch(word)),
      )
    )
      continue;
    results.push({
      item,
      rank: indexed.name === phrase ? 0 : indexed.name.startsWith(phrase) ? 1 : 2,
    });
  }
  return results.sort((left, right) => left.rank - right.rank).map(({ item }) => item);
}

export function gearItemHint(item: GearItem): string {
  if (item.kind === "CRADLE") return "크래들";
  if (item.kind === "DEVIANT") return "전투 감염물";
  const slots =
    item.allowedSlots.includes("primary") && item.allowedSlots.includes("secondary")
      ? item.allowedSlots.includes("melee")
        ? "원거리·근접 무기"
        : "원거리 무기"
      : item.allowedSlots
          .filter((slot) => !slot.startsWith("cradle-"))
          .map((slot) => gearSlotLabels[slot])
          .join(" · ");
  return [
    slots,
    item.kind === "MODULE" ? "신판 모듈" : "",
    item.moduleShiny === true ? "섬광" : item.moduleShiny === false ? "일반" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const contentChoices = [
  "탐험",
  "파밍",
  "보스",
  "레이드",
  "던전",
  "거점 방어",
  "PVP",
  "솔로",
  "파티",
] as const;
export const tagChoices = [
  "초보 추천",
  "가성비",
  "생존",
  "근접",
  "원거리",
  "치명타",
  "약점",
  "원소",
  "화상",
  "감전",
  "빙결",
  "폭발",
  "지원",
  "자동화",
  "이동",
  "시즌 시작",
] as const;
