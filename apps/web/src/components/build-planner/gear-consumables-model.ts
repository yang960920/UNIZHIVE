import {
  CONSUMABLE_CATALOG,
  getConsumableItem,
  getConsumableSlotLimits,
  type ConsumableCatalogItem,
  type ConsumableLoadout,
  type ConsumableRecipeIngredient,
} from "@uniz/build-engine";
import { consumablePreparationLines } from "./consumable-preparation-model";

export const consumableKindLabels = { FOOD: "음식", DRINK: "음료" } as const;
export const consumableCommonNotes: readonly string[] = [
  "원본 기본 수치이며 재료·요리 품질·셰프 강화는 반영하지 않았습니다.",
  "서버·시나리오에 따라 제작 재료가 다를 수 있습니다. 게임 제작 화면의 조합을 확인해주세요.",
  "현재 시나리오의 획득·레시피 해제 조건은 미확인입니다.",
];

export function consumableDuration(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds === 0) return "즉시 효과";
  return seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`;
}

export function consumableEffectText(item: ConsumableCatalogItem): string {
  return item.effects
    .map((effect) => {
      const duration = consumableDuration(effect.durationSeconds);
      return `${effect.description}${duration ? ` · ${duration}` : ""}${effect.verified ? "" : " · 효과 확인 중"}`;
    })
    .join(" / ");
}

export function consumableIngredientsText(
  ingredients: readonly ConsumableRecipeIngredient[],
): string {
  return ingredients
    .map((ingredient) => {
      const choices = ingredient.options?.length
        ? ` (${ingredient.options.map((option) => `${option.label} × ${option.quantity}`).join(" / ")} 중 택 1)`
        : "";
      const quantity = ingredient.quantity === null || choices ? "" : ` × ${ingredient.quantity}`;
      return `${ingredient.label}${choices}${quantity}`;
    })
    .join(" + ");
}

export function consumableRecipeText(item: ConsumableCatalogItem): string {
  if (item.recipe.status === "UNVERIFIED") return "기본 재료 확인 중";
  const combinations =
    item.recipe.variants?.map(
      (variant) => `${variant.label}: ${consumableIngredientsText(variant.ingredients)}`,
    ) ?? [];
  const common = consumableIngredientsText(item.recipe.ingredients);
  return [common, ...combinations].filter(Boolean).join(" / ") || "기본 재료 확인 중";
}

export function searchConsumables(
  kind: "FOOD" | "DRINK",
  query: string,
): readonly ConsumableCatalogItem[] {
  const terms = query
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .split(/\s+/)
    .filter(Boolean);
  return CONSUMABLE_CATALOG.filter((item) => {
    if (item.kind !== kind) return false;
    const text = [
      item.name,
      ...item.aliases,
      consumableEffectText(item),
      consumableRecipeText(item),
    ]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");
    const compact = text.replace(/\s+/g, "");
    return terms.every((term) => text.includes(term) || compact.includes(term));
  });
}

export function consumableSelectionError(
  loadout: ConsumableLoadout | undefined,
  characterClass: string | null,
): string {
  if (!loadout) return "";
  const limits = getConsumableSlotLimits(characterClass);
  if (loadout.foodIds.length > limits.food || loadout.drinkIds.length > limits.drink)
    return "셰프는 음식과 음료를 각각 2개, 그 외 직업은 각각 1개까지 선택할 수 있습니다. 추가 도핑을 해제해 주세요.";
  for (const [kind, ids] of [
    ["FOOD", loadout.foodIds],
    ["DRINK", loadout.drinkIds],
  ] as const) {
    if (new Set(ids).size !== ids.length) return "같은 음식이나 음료를 중복 선택할 수 없습니다.";
    if (ids.some((id) => getConsumableItem(id)?.kind !== kind))
      return "확인되지 않은 음식·음료의 선택을 해제하거나 다시 선택해 주세요.";
  }
  return "";
}

export function makeConsumableChecklist(
  loadout: ConsumableLoadout | undefined,
  recordedNames: Record<string, string> = {},
): string[] {
  if (!loadout) return [];
  const lines: string[] = [];
  for (const [kind, ids] of [
    ["FOOD", loadout.foodIds],
    ["DRINK", loadout.drinkIds],
  ] as const) {
    ids.forEach((id, index) => {
      const item = getConsumableItem(id);
      lines.push(
        `${consumableKindLabels[kind]} ${index + 1}: ${recordedNames[id] ?? item?.name ?? "이전 도핑 기록"}`,
      );
      if (item) {
        lines.push(`  기본 효과: ${consumableEffectText(item)}`);
        lines.push(`  기본 재료: ${consumableRecipeText(item)}`);
        if (item.recipe.basisLabel) lines.push(`  재료 기준: ${item.recipe.basisLabel}`);
        for (const note of item.notes ?? []) lines.push(`  참고: ${note}`);
        lines.push(
          ...consumablePreparationLines(id, loadout.preparations?.[id]).map((line) => `  ${line}`),
        );
      }
    });
  }
  if (loadout.notes) lines.push(`도핑 메모: ${loadout.notes}`);
  return lines;
}
