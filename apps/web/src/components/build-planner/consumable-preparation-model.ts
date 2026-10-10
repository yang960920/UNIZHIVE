import {
  getConsumablePreparation,
  getCraftingMaterial,
  type ConsumableLoadout,
} from "@uniz/build-engine";

export function consumablePreparationLines(
  consumableId: string,
  value?: NonNullable<ConsumableLoadout["preparations"]>[string],
): string[] {
  if (!value) return [];
  const preparation = getConsumablePreparation(consumableId, value);
  if (!preparation) return ["제작 재료: 이전 기록 확인 필요"];
  const lines = [`선택한 제작 조합: ${preparation.recipe.label}`];
  for (const material of preparation.materials) {
    const ingredient = preparation.recipe.ingredients.find((item) => item.key === material.key);
    const name = material.materialId
      ? (getCraftingMaterial(material.materialId)?.name ?? material.materialId)
      : `${ingredient?.label ?? "재료"} 선택 필요`;
    lines.push(`사용 재료: ${name}${material.quantity !== null ? ` × ${material.quantity}` : ""}`);
    if (material.effects.length) lines.push(`재료 추가 효과: ${material.effects.join(" / ")}`);
  }
  return lines;
}
