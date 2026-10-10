import { GEAR_CATALOG, type GearSlot, type PlannerGearLoadout } from "./gear";
import { getConsumableItem } from "./consumables";
import {
  getCraftingMaterial,
  getGearCraftRecipe,
  getRecipeMaterials,
  getConsumablePreparation,
  getWeaponTuningBlueprint,
  weaponTuningFits,
  type ResolvedCraftingIngredient,
} from "./crafting";

export interface LoadoutBuildInput {
  buildId: string;
  version: number;
  title: string;
  /** Legacy and unreadable snapshots remain visible, with an incomplete preparation report. */
  loadout: PlannerGearLoadout | null;
}

export interface PreparedEquipmentUse {
  buildId: string;
  version: number;
  buildTitle: string;
  slot: GearSlot;
}

export interface PreparedEquipment {
  key: string;
  itemId: string;
  name: string;
  kind: "ARMOR" | "WEAPON";
  slot: GearSlot;
  tier: number | null;
  materialLabels: string[];
  tuningName: string | null;
  /** Maximum simultaneous copies in one build; alternate builds can reuse these copies. */
  quantity: number;
  uses: PreparedEquipmentUse[];
  settingsDiffer: boolean;
  materialComplete: boolean;
  /** Armor overlap is visible independently of whether crafting reuse is established. */
  reuseConfirmed?: boolean;
  tierDiffers?: boolean;
}

export interface PreparedMaterialSource {
  kind: "EQUIPMENT" | "CONSUMABLE";
  key: string;
  name: string;
  quantity: number;
}

export interface PreparedMaterial {
  id: string;
  name: string;
  rarity: "NORMAL" | "RARE" | "EPIC" | "LEGENDARY" | null;
  quantity: number;
  sources: PreparedMaterialSource[];
}

export interface PreparationIssue {
  buildId: string;
  buildTitle: string;
  name: string;
  message: string;
}

export interface PreparedConsumable {
  key: string;
  consumableId: string;
  name: string;
  quantity: number;
  buildTitles: string[];
  materialLabels: string[];
  materialComplete: boolean;
}

export interface LoadoutPreparationResult {
  equipment: PreparedEquipment[];
  sharedArmor: PreparedEquipment[];
  materials: PreparedMaterial[];
  consumables: PreparedConsumable[];
  unresolved: PreparationIssue[];
  counts: {
    listedEquipment: number;
    uniqueEquipment: number;
    armorSaved: number;
    foodBatches: number;
  };
  complete: boolean;
}

const gearById = new Map(GEAR_CATALOG.map((item) => [item.id, item]));
const compareText = (a: string, b: string) => a.localeCompare(b, "ko-KR");

function canonicalMaterials(materials: readonly ResolvedCraftingIngredient[]): [string, number][] {
  const amounts = new Map<string, number>();
  for (const material of materials) {
    if (material.materialId && material.quantity !== null)
      amounts.set(material.materialId, (amounts.get(material.materialId) ?? 0) + material.quantity);
  }
  return [...amounts].sort(([a], [b]) => compareText(a, b));
}

function validMaterial(material: ResolvedCraftingIngredient): boolean {
  return Boolean(
    material.materialId &&
    getCraftingMaterial(material.materialId) &&
    material.quantity !== null &&
    Number.isSafeInteger(material.quantity) &&
    material.quantity > 0,
  );
}

/**
 * Alternative builds reuse equipment only when their complete crafting records agree.
 * The maximum number equipped at once is retained; consumables are one use per build.
 * Missing tiers, source recipes and ingredient choices never become zero-cost recipes.
 */
export function prepareBuildLoadout(
  inputs: readonly LoadoutBuildInput[],
): LoadoutPreparationResult {
  const unresolved: PreparationIssue[] = [];
  const materialTotals = new Map<string, PreparedMaterial>();
  const equipmentGroups = new Map<
    string,
    {
      equipment: PreparedEquipment;
      perBuild: Map<string, number>;
      settings: Set<string>;
      materials: [string, number][];
      tuningId: string | null;
      armorOverlapKey: string | null;
    }
  >();
  const cookingGroups = new Map<string, PreparedConsumable>();
  const seenBuilds = new Set<string>();
  let listedEquipment = 0;
  let listedArmor = 0;
  let foodBatches = 0;

  const issue = (input: LoadoutBuildInput, name: string, message: string) =>
    unresolved.push({ buildId: input.buildId, buildTitle: input.title, name, message });
  const addMaterial = (id: string, quantity: number, source: PreparedMaterialSource) => {
    const material = getCraftingMaterial(id);
    const blueprint = material ? undefined : getWeaponTuningBlueprint(id);
    if (!material && !blueprint) return;
    const existing = materialTotals.get(id);
    const contribution = { ...source, quantity };
    if (existing) {
      existing.quantity += quantity;
      const previous = existing.sources.find(
        (item) => item.kind === source.kind && item.key === source.key,
      );
      if (previous) previous.quantity += quantity;
      else existing.sources.push(contribution);
    } else
      materialTotals.set(id, {
        id,
        name: material?.name ?? blueprint!.name,
        rarity: material ? material.rarity : blueprint!.rarity,
        quantity,
        sources: [contribution],
      });
  };

  for (const input of inputs) {
    const buildKey = JSON.stringify([input.buildId, input.version]);
    if (seenBuilds.has(buildKey)) continue;
    seenBuilds.add(buildKey);
    const loadout = input.loadout;
    if (!loadout) {
      issue(input, input.title, "이전 형식의 빌드는 제작 재료를 집계할 수 없습니다.");
      continue;
    }
    for (const selection of loadout.slots) {
      const item = gearById.get(selection.itemId);
      if (item && item.kind !== "ARMOR" && item.kind !== "WEAPON") continue;
      const name =
        loadout.catalogNames?.[selection.itemId] ??
        item?.displayName ??
        item?.name ??
        selection.itemId;
      if (!item) {
        issue(input, name, "현재 자료에서 장비와 제작표를 확인할 수 없습니다.");
        continue;
      }
      listedEquipment++;
      if (item.kind === "ARMOR") listedArmor++;
      const crafting = selection.crafting;
      const tier = crafting?.tier ?? null;
      const recipe = getGearCraftRecipe(selection.itemId, tier, crafting?.recipeKey);
      const resolved = recipe ? getRecipeMaterials(recipe, crafting?.materialChoices) : [];
      const normalized = canonicalMaterials(resolved);
      const tuning = crafting?.tuning;
      const blueprint = tuning ? getWeaponTuningBlueprint(tuning.blueprintId) : undefined;
      let materialComplete = Boolean(
        tier !== null && recipe && resolved.length > 0 && resolved.every(validMaterial),
      );
      if (tier === null)
        issue(
          input,
          name,
          item.kind === "WEAPON"
            ? "이전 버전에 무기 제작 티어가 기록되지 않아 재료 수량을 확정할 수 없습니다. 편집 후 저장하면 T5 기준으로 안내합니다."
            : "제작 티어를 선택하면 재료 수량을 계산할 수 있습니다.",
        );
      else if (!recipe) issue(input, name, "선택한 티어의 제작표가 아직 확인되지 않았습니다.");
      else if (!resolved.length) issue(input, name, "제작 재료 수량이 아직 확인되지 않았습니다.");
      if (recipe && tier !== null)
        for (const material of resolved) {
          if (validMaterial(material)) continue;
          const ingredient = recipe.ingredients.find((entry) => entry.key === material.key);
          issue(
            input,
            name,
            `${ingredient?.label ?? "제작 재료"} 선택 또는 수량 확인이 필요합니다.`,
          );
        }
      if (tuning && !blueprint) {
        materialComplete = false;
        issue(input, name, "튜닝 설계도를 현재 자료에서 확인할 수 없습니다.");
      }
      let usableBlueprint = blueprint;
      if (tuning && blueprint) {
        const secondary = tuning.secondary;
        const range = secondary
          ? blueprint.secondaryOptions.find((option) => option.kind === secondary.kind)
          : undefined;
        const invalid =
          !weaponTuningFits(blueprint, item, loadout.context) ||
          (tuning.attackPercent !== null &&
            (!Number.isFinite(tuning.attackPercent) ||
              tuning.attackPercent < blueprint.attackRange.min ||
              tuning.attackPercent > blueprint.attackRange.max)) ||
          (secondary &&
            (!range ||
              (secondary.value !== null &&
                (!Number.isFinite(secondary.value) ||
                  secondary.value < range.min ||
                  secondary.value > range.max))));
        if (invalid) {
          usableBlueprint = undefined;
          materialComplete = false;
          issue(input, name, "튜닝 도면의 무기·시나리오 조건 또는 수치를 다시 확인해주세요.");
        } else if (tuning.attackPercent === null || !secondary || secondary.value === null) {
          materialComplete = false;
          issue(
            input,
            name,
            "튜닝 수치를 기록하면 다른 빌드와 같은 무기를 재사용할 수 있는지 확인할 수 있습니다.",
          );
        }
      }
      const materialLabels = recipe
        ? recipe.ingredients
            .filter((ingredient) => ingredient.kind === "CHOICE")
            .map((ingredient) => {
              const selected = resolved.find((entry) => entry.key === ingredient.key);
              return `${ingredient.label}: ${getCraftingMaterial(selected?.materialId)?.name ?? "선택 필요"}`;
            })
        : [];
      const physicalKey = JSON.stringify([
        item.sourceId ?? item.id,
        item.kind === "ARMOR" ? selection.slot : "WEAPON",
        tier,
        normalized,
        tuning
          ? [
              tuning.blueprintId,
              tuning.attackPercent,
              tuning.secondary?.kind ?? null,
              tuning.secondary?.value ?? null,
            ]
          : null,
        // Unconfirmed crafting choices do not establish that two instances are interchangeable.
        materialComplete ? null : [buildKey, selection.slot],
      ]);
      const usage: PreparedEquipmentUse = {
        buildId: input.buildId,
        version: input.version,
        buildTitle: input.title,
        slot: selection.slot,
      };
      const settingKey = JSON.stringify([selection.level, selection.attachments]);
      const leatherIds = [
        ...new Set(
          resolved
            .map((material) => material.materialId)
            .filter((id): id is string =>
              Boolean(id && getCraftingMaterial(id)?.category === "LEATHER"),
            ),
        ),
      ].sort();
      const armorOverlapKey =
        item.kind === "ARMOR" && leatherIds.length
          ? JSON.stringify([item.sourceId ?? item.id, selection.slot, leatherIds])
          : null;
      const existing = equipmentGroups.get(physicalKey);
      if (existing) {
        existing.equipment.uses.push(usage);
        existing.perBuild.set(buildKey, (existing.perBuild.get(buildKey) ?? 0) + 1);
        existing.settings.add(settingKey);
      } else
        equipmentGroups.set(physicalKey, {
          equipment: {
            key: physicalKey,
            itemId: item.id,
            name,
            kind: item.kind as "ARMOR" | "WEAPON",
            slot: selection.slot,
            tier,
            materialLabels,
            tuningName: blueprint?.name ?? null,
            quantity: 1,
            uses: [usage],
            settingsDiffer: false,
            materialComplete,
          },
          perBuild: new Map([[buildKey, 1]]),
          settings: new Set([settingKey]),
          // Quantities with an unknown tier are display-only, not confirmed requirements.
          materials: tier !== null ? normalized.filter(([id]) => getCraftingMaterial(id)) : [],
          tuningId: tier !== null && usableBlueprint ? usableBlueprint.id : null,
          armorOverlapKey,
        });
    }

    const consumables = loadout.consumables;
    for (const id of [...(consumables?.foodIds ?? []), ...(consumables?.drinkIds ?? [])]) {
      const item = getConsumableItem(id);
      const name = loadout.catalogNames?.[id] ?? item?.name ?? id;
      foodBatches++;
      const preparation = getConsumablePreparation(id, consumables?.preparations?.[id]);
      if (!preparation)
        issue(input, name, "제작표가 아직 확인되지 않아 재료 수량에 포함하지 않았습니다.");
      const resolved = preparation?.materials ?? [];
      const materialComplete = Boolean(
        preparation && resolved.length > 0 && resolved.every(validMaterial),
      );
      if (preparation && !resolved.length)
        issue(input, name, "제작 재료 수량이 아직 확인되지 않았습니다.");
      if (preparation)
        for (const ingredient of resolved) {
          if (!validMaterial(ingredient)) {
            const entry = preparation.recipe.ingredients.find((row) => row.key === ingredient.key);
            issue(
              input,
              name,
              `${entry?.label ?? "선택 재료"}를 지정하면 남은 수량을 합산할 수 있습니다.`,
            );
          }
        }
      const normalized = canonicalMaterials(resolved);
      const key = JSON.stringify([id, preparation?.recipe.key ?? null, normalized]);
      const materialLabels = resolved.map((ingredient) => {
        const material = getCraftingMaterial(ingredient.materialId);
        const entry = preparation?.recipe.ingredients.find((row) => row.key === ingredient.key);
        return material
          ? `${material.name} × ${ingredient.quantity}`
          : `${entry?.label ?? "재료"}: 선택 필요`;
      });
      const group = cookingGroups.get(key);
      if (group) {
        group.quantity++;
        group.buildTitles.push(input.title);
        group.materialComplete &&= materialComplete;
      } else
        cookingGroups.set(key, {
          key,
          consumableId: id,
          name,
          quantity: 1,
          buildTitles: [input.title],
          materialLabels,
          materialComplete,
        });
      for (const ingredient of resolved)
        if (validMaterial(ingredient))
          addMaterial(ingredient.materialId!, ingredient.quantity!, {
            kind: "CONSUMABLE",
            key,
            name,
            quantity: ingredient.quantity!,
          });
    }
  }

  const equipment: PreparedEquipment[] = [];
  for (const group of equipmentGroups.values()) {
    const row = group.equipment;
    row.quantity = Math.max(...group.perBuild.values());
    row.settingsDiffer = group.settings.size > 1;
    equipment.push(row);
    for (const [id, quantity] of group.materials)
      addMaterial(id, quantity * row.quantity, {
        kind: "EQUIPMENT",
        key: row.key,
        name: row.name,
        quantity: quantity * row.quantity,
      });
    if (group.tuningId && !group.materials.some(([id]) => id === group.tuningId))
      addMaterial(group.tuningId, row.quantity, {
        kind: "EQUIPMENT",
        key: row.key,
        name: row.tuningName ?? row.name,
        quantity: row.quantity,
      });
  }
  equipment.sort((a, b) => compareText(a.name, b.name) || compareText(a.key, b.key));
  const overlapGroups = new Map<string, { rows: PreparedEquipment[]; settings: Set<string> }>();
  for (const group of equipmentGroups.values()) {
    if (!group.armorOverlapKey) continue;
    const overlap = overlapGroups.get(group.armorOverlapKey);
    if (overlap) {
      overlap.rows.push(group.equipment);
      for (const setting of group.settings) overlap.settings.add(setting);
    } else
      overlapGroups.set(group.armorOverlapKey, {
        rows: [group.equipment],
        settings: new Set(group.settings),
      });
  }
  const sharedArmor: PreparedEquipment[] = [];
  for (const [key, overlap] of overlapGroups) {
    const uses = overlap.rows.flatMap((row) => row.uses);
    if (new Set(uses.map((use) => JSON.stringify([use.buildId, use.version]))).size < 2) continue;
    const tiers = new Set(overlap.rows.map((row) => row.tier));
    sharedArmor.push({
      ...overlap.rows[0],
      key,
      uses,
      quantity: overlap.rows.reduce((sum, row) => sum + row.quantity, 0),
      settingsDiffer: overlap.settings.size > 1,
      materialComplete: overlap.rows.every((row) => row.materialComplete),
      reuseConfirmed: overlap.rows.length === 1 && overlap.rows[0].materialComplete,
      tierDiffers: tiers.size > 1,
      tier: tiers.size === 1 ? overlap.rows[0].tier : null,
    });
  }
  sharedArmor.sort((a, b) => compareText(a.name, b.name));
  const materials = [...materialTotals.values()].sort((a, b) => compareText(a.name, b.name));
  const consumables = [...cookingGroups.values()].sort((a, b) => compareText(a.name, b.name));
  return {
    equipment,
    sharedArmor,
    materials,
    consumables,
    unresolved,
    counts: {
      listedEquipment,
      uniqueEquipment: equipment.reduce((sum, row) => sum + row.quantity, 0),
      armorSaved:
        listedArmor -
        equipment.filter((row) => row.kind === "ARMOR").reduce((sum, row) => sum + row.quantity, 0),
      foodBatches,
    },
    complete: unresolved.length === 0,
  };
}

export function makeLoadoutPreparationText(result: LoadoutPreparationResult): string {
  const lines = [
    "로드아웃 준비 목록",
    `장비 ${result.counts.listedEquipment}개 구성 → 준비 ${result.counts.uniqueEquipment}개 · 공통 방어구 ${result.counts.armorSaved}개 재사용`,
    "장비는 같은 제작 구성을 재사용하고, 음식·음료는 빌드별 1회 사용분을 합산합니다.",
    "",
    "준비할 장비",
  ];
  for (const row of result.equipment) {
    lines.push(
      `${row.name} × ${row.quantity} · ${row.tier === null ? "티어 미기록" : `T${row.tier}`}`,
    );
    if (row.materialLabels.length) lines.push(`  ${row.materialLabels.join(" / ")}`);
    if (row.tuningName) lines.push(`  튜닝: ${row.tuningName}`);
    if (row.settingsDiffer) lines.push("  빌드마다 모듈 또는 기록한 레벨이 다릅니다.");
    lines.push(
      `  사용: ${[...new Set(row.uses.map((use) => `${use.buildTitle} v${use.version}`))].join(", ")}`,
    );
  }
  if (result.sharedArmor.length) {
    lines.push("", "방어구·가죽 겹침");
    for (const row of result.sharedArmor) {
      lines.push(
        `${row.name}: ${[...new Set(row.uses.map((use) => `${use.buildTitle} v${use.version}`))].join(", ")}`,
      );
      lines.push(
        row.reuseConfirmed
          ? "  같은 제작 구성으로 재사용"
          : "  제작 조건이 다르거나 미기록이므로 수량 별도 확인",
      );
      if (row.tierDiffers) lines.push("  제작 티어가 다릅니다.");
    }
  }
  if (result.consumables.length) {
    lines.push("", "음식·음료 제작 수량");
    for (const row of result.consumables) lines.push(`${row.name} × ${row.quantity}`);
  }
  lines.push(
    "",
    result.complete ? "최종 제작 재료" : "확인된 제작 재료 · 아래 확인 필요 항목 제외",
  );
  for (const row of result.materials) lines.push(`${row.name} × ${row.quantity}`);
  if (result.unresolved.length) {
    lines.push("", "확인 필요");
    for (const row of result.unresolved)
      lines.push(`${row.buildTitle} / ${row.name}: ${row.message}`);
  }
  lines.push(
    "",
    "모듈·감염물 획득 및 장비 강화에 필요한 재료는 제작 재료 합계에 포함하지 않습니다.",
  );
  return lines.join("\n");
}
