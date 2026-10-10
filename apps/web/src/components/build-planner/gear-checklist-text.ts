import { GEAR_SLOT_IDS, getGearArmorSet, type PlannerGearLoadout } from "@uniz/build-engine";
import {
  gearSlotLabels,
  attachmentLabels,
  gearDisplayName,
  gearItemById,
  countGearArmorSets,
} from "./gear-editor-model";
import { scenarioLabels, cradleConditionsNote } from "./presentation-labels";
import { makeConsumableChecklist } from "./gear-consumables-model";
import { gearCraftingLines } from "./gear-crafting-model";

export function makeGearChecklist(loadout: PlannerGearLoadout): string {
  const name = (id: string) => gearDisplayName(id, loadout.catalogNames);
  const lines = [
    "UNIZ HIVE 장착 구성",
    ...(loadout.context.scenarioKey
      ? [`시나리오: ${scenarioLabels[loadout.context.scenarioKey]}`]
      : []),
  ];
  if (loadout.context.mode) lines.push(`플레이 모드: ${loadout.context.mode}`);
  if (loadout.context.platform)
    lines.push(
      `플랫폼: ${loadout.context.platform === "MOBILE" ? "모바일" : loadout.context.platform}`,
    );
  if (loadout.context.gamePatch) lines.push(`게임 버전: ${loadout.context.gamePatch}`);
  if (loadout.context.characterClass) lines.push(`클래스: ${loadout.context.characterClass}`);
  for (const slot of GEAR_SLOT_IDS) {
    const selection = loadout.slots.find((item) => item.slot === slot);
    if (!selection) continue;
    const equipmentLevel = selection.level === null ? "" : ` · Lv.${selection.level}`;
    const item = gearItemById.get(selection.itemId);
    lines.push(
      `${gearSlotLabels[slot]}: ${name(selection.itemId)}${equipmentLevel}${item?.isKeyArmor ? " · 핵심 방어구" : ""}`,
    );
    if (item?.kind === "CRADLE") lines.push(`  효과: ${item.description}`);
    lines.push(...gearCraftingLines(selection).map((line) => `  ${line}`));
    for (const key of ["muzzle", "sight", "tactical", "magazine", "ammo", "module"] as const) {
      const id = selection.attachments[key];
      if (!id) continue;
      const suffix =
        key === "module" && selection.attachments.moduleSuffix
          ? `〈${name(selection.attachments.moduleSuffix)}〉`
          : "";
      const level =
        key === "module" && selection.attachments.moduleLevel !== null
          ? ` · Lv.${selection.attachments.moduleLevel}`
          : "";
      lines.push(`  ${attachmentLabels[key]}: ${name(id)}${suffix}${level}`);
    }
    if (selection.abilityGrade !== null) lines.push(`  어빌리티 등급: ${selection.abilityGrade}`);
    if (selection.activityGrade !== null) lines.push(`  활성 등급: ${selection.activityGrade}`);
    if (selection.traitIds.length) lines.push(`  특성: ${selection.traitIds.map(name).join(", ")}`);
  }
  for (const { setId, count } of countGearArmorSets(loadout.slots)) {
    const set = getGearArmorSet(setId);
    if (!set) continue;
    lines.push(`${set.displayName}: ${count}부위`);
    for (const effect of set.effects.filter((effect) => effect.pieces <= count))
      lines.push(`  ${effect.pieces}세트: ${effect.description}`);
  }
  if (loadout.slots.some((selection) => selection.slot.startsWith("cradle-")))
    lines.push(`크래들 조건: ${cradleConditionsNote}`);
  lines.push(...makeConsumableChecklist(loadout.consumables, loadout.catalogNames));
  if (loadout.recommendation.rating !== null)
    lines.push(`추천도: ${loadout.recommendation.rating}/5`);
  if (loadout.recommendation.contents.length)
    lines.push(`추천 콘텐츠: ${loadout.recommendation.contents.join(", ")}`);
  if (loadout.recommendation.tags.length)
    lines.push(`태그: ${loadout.recommendation.tags.map((tag) => `#${tag}`).join(" ")}`);
  if (loadout.recommendation.notes) lines.push(`추천 메모: ${loadout.recommendation.notes}`);
  if (loadout.notes) lines.push(`장착 메모: ${loadout.notes}`);
  return lines.join("\n");
}
