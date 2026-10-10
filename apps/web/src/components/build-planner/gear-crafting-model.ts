import {
  getCraftingMaterial,
  getGearCraftRecipe,
  getRecipeMaterials,
  WEAPON_TUNING_BLUEPRINTS,
  type GearSelection,
} from "@uniz/build-engine";

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
    lines.push(`제작 조합: ${recipe.label}`);
    getRecipeMaterials(recipe, crafting.materialChoices).forEach((material) => {
      const name = material.materialId
        ? (getCraftingMaterial(material.materialId)?.name ?? material.materialId)
        : "재료 선택 필요";
      lines.push(
        `제작 재료: ${name}${crafting.tier !== null && material.quantity !== null ? ` × ${material.quantity}` : ""}`,
      );
      if (material.effects.length) lines.push(`재료 추가 효과: ${material.effects.join(" / ")}`);
    });
  }
  if (crafting.tuning) {
    const tuning = crafting.tuning;
    const blueprint = WEAPON_TUNING_BLUEPRINTS.find((item) => item.id === tuning.blueprintId);
    lines.push(`튜닝: ${blueprint?.name ?? "이전 튜닝 기록"}`);
    if (tuning.attackPercent !== null) lines.push(`튜닝 공격력: ${tuning.attackPercent}%`);
    if (tuning.secondary)
      lines.push(
        `튜닝 ${tuningOptionLabels[tuning.secondary.kind]}: ${tuning.secondary.value === null ? "수치 미기록" : `${tuning.secondary.value}%`}`,
      );
  }
  return lines;
}
