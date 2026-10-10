import {
  getCraftingMaterial,
  getGearCraftRecipe,
  getRecipeMaterials,
  WEAPON_TUNING_BLUEPRINTS,
  type GearSelection,
} from "@uniz/build-engine";

export const craftingRarityLabels = {
  NORMAL: "초록",
  RARE: "파랑",
  EPIC: "보라",
  LEGENDARY: "노랑",
} as const;

export const tuningOptionLabels = {
  CRIT_RATE: "치명타 확률",
  CRIT_DAMAGE: "치명타 대미지",
  ELEMENTAL_DAMAGE: "원소 대미지",
  WEAKSPOT_DAMAGE: "약점 대미지",
} as const;

export function gearCraftingLines(selection: GearSelection): string[] {
  const crafting = selection.crafting;
  if (!crafting) return [];
  const lines: string[] = [];
  if (crafting.tier !== null) lines.push(`장비 티어: T${crafting.tier}`);
  const recipe = getGearCraftRecipe(selection.itemId, crafting.tier, crafting.recipeKey);
  if (recipe) {
    const materials = getRecipeMaterials(recipe, crafting.materialChoices);
    const totals = new Map<string, { name: string; quantity: number }>();
    const effects = new Set<string>();
    materials.forEach((material) => {
      const name = material.materialId
        ? (getCraftingMaterial(material.materialId)?.name ?? material.materialId)
        : "재료 선택 필요";
      if (!material.materialId) {
        lines.push(`제작 재료: ${name}`);
        return;
      }
      const previous = totals.get(material.materialId);
      totals.set(material.materialId, {
        name,
        quantity: (previous?.quantity ?? 0) + (material.quantity ?? 0),
      });
      material.effects.forEach((effect) => effects.add(effect));
    });
    for (const material of totals.values())
      lines.push(
        `제작 재료: ${material.name}${crafting.tier !== null ? ` × ${material.quantity}` : ""}`,
      );
    for (const effect of effects) lines.push(`재료 추가 효과: ${effect}`);
  }
  if (crafting.tuning) {
    const tuning = crafting.tuning;
    const blueprint = WEAPON_TUNING_BLUEPRINTS.find((item) => item.id === tuning.blueprintId);
    lines.push(
      `튜닝: ${blueprint?.name ?? "이전 튜닝 기록"}${blueprint ? ` · ${craftingRarityLabels[blueprint.rarity]} · 제작 시 1개` : ""}`,
    );
    if (tuning.attackPercent !== null) lines.push(`튜닝 공격력: ${tuning.attackPercent}%`);
    if (tuning.secondary)
      lines.push(
        `튜닝 ${tuningOptionLabels[tuning.secondary.kind]}: ${tuning.secondary.value === null ? "수치 미기록" : `${tuning.secondary.value}%`}`,
      );
  }
  return lines;
}
