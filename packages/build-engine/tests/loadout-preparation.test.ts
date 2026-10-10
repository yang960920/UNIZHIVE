import { describe, expect, it } from "vitest";
import { createEmptyGearLoadout, createGearSelection, type GearSelection } from "../src/model/gear";
import {
  createEmptyGearCrafting,
  getGearCraftRecipe,
  getRecipeMaterials,
  getConsumableCraftRecipes,
  getEligibleWeaponTuningBlueprints,
  type CraftingTier,
} from "../src/model/crafting";
import {
  prepareBuildLoadout,
  makeLoadoutPreparationText,
  type LoadoutBuildInput,
} from "../src/model/loadout-preparation";

function crafted(slot: GearSelection["slot"], itemId: string, tier: CraftingTier = 5) {
  const selection = createGearSelection(slot, itemId);
  const recipe = getGearCraftRecipe(itemId, tier)!;
  if (!recipe) throw new Error(`Missing source recipe for ${itemId}`);
  selection.crafting = {
    ...createEmptyGearCrafting(),
    tier,
    recipeKey: recipe.key,
    materialChoices: Object.fromEntries(
      recipe.ingredients
        .filter((ingredient) => ingredient.kind === "CHOICE" && !ingredient.defaultMaterialId)
        .map((ingredient) => [ingredient.key, ingredient.options[0].materialId]),
    ),
  };
  return selection;
}

function build(id: string, slots: GearSelection[]): LoadoutBuildInput {
  const loadout = createEmptyGearLoadout();
  loadout.slots = slots;
  return { buildId: id, version: 1, title: `빌드 ${id}`, loadout };
}

function amount(result: ReturnType<typeof prepareBuildLoadout>, id: string) {
  return result.materials.find((material) => material.id === id)?.quantity ?? 0;
}

describe("combined loadout equipment and crafting materials", () => {
  it("counts the same helmet and its sourced leather once across alternate builds", () => {
    const helmet = crafted("helmet", "armor-lonewolf-hood");
    const result = prepareBuildLoadout([
      build("a", [helmet]),
      build("b", [structuredClone(helmet)]),
    ]);
    expect(result.complete).toBe(true);
    expect(result.counts).toMatchObject({ listedEquipment: 2, uniqueEquipment: 1, armorSaved: 1 });
    expect(result.sharedArmor).toHaveLength(1);
    expect(result.sharedArmor[0].uses.map((use) => use.buildId)).toEqual(["a", "b"]);
    // The source's T5 helmet recipe consumes three deer hides, not one per choice group.
    expect(amount(result, "material-30310008")).toBe(3);
    expect(amount(result, "material-30350001")).toBe(35);
    expect(makeLoadoutPreparationText(result)).toContain("사슴 가죽 × 3");
  });

  it("keeps different leather, armor positions and tiers as separate crafting requirements", () => {
    const first = crafted("helmet", "armor-lonewolf-hood");
    const otherLeather = structuredClone(first);
    const recipe = getGearCraftRecipe(first.itemId, 5)!;
    const leather = recipe.ingredients.find(
      (ingredient) => ingredient.defaultMaterialId === "material-30310008",
    )!;
    const alternative = leather.options.find(
      (option) => option.materialId !== "material-30310008",
    )!;
    otherLeather.crafting!.materialChoices[leather.key] = alternative.materialId;
    const jacket = crafted("top", "armor-lonewolf-jacket");
    const lowerTier = crafted("helmet", "armor-lonewolf-hood", 4);
    const result = prepareBuildLoadout([
      build("a", [first, jacket]),
      build("b", [otherLeather]),
      build("c", [lowerTier]),
    ]);
    expect(result.complete).toBe(true);
    expect(result.sharedArmor).toHaveLength(1);
    expect(result.sharedArmor[0]).toMatchObject({
      tierDiffers: true,
      reuseConfirmed: false,
      quantity: 2,
    });
    expect(result.counts.uniqueEquipment).toBe(4);
    expect(amount(result, alternative.materialId)).toBe(alternative.quantity);
  });

  it("reports module or recorded-level differences without duplicating identical armor crafting", () => {
    const first = crafted("helmet", "armor-lonewolf-hood");
    const second = structuredClone(first);
    first.level = 10;
    second.level = 20;
    const result = prepareBuildLoadout([build("a", [first]), build("b", [second])]);
    expect(result.sharedArmor[0].settingsDiffer).toBe(true);
    expect(result.counts.uniqueEquipment).toBe(1);
    expect(amount(result, "material-30310008")).toBe(3);
  });

  it("retains the maximum simultaneous weapon count rather than one or the sum of every build", () => {
    const primary = crafted("primary", "weapon-p90-holographic-resonance");
    const secondary = { ...structuredClone(primary), slot: "secondary" as const };
    const recipe = getGearCraftRecipe(primary.itemId, 5)!;
    const expected = getRecipeMaterials(recipe, primary.crafting!.materialChoices);
    const result = prepareBuildLoadout([
      build("a", [primary, secondary]),
      build("b", [structuredClone(primary)]),
    ]);
    expect(result.counts).toMatchObject({ listedEquipment: 3, uniqueEquipment: 2 });
    expect(result.equipment).toHaveLength(1);
    expect(result.equipment[0].quantity).toBe(2);
    for (const material of expected)
      expect(amount(result, material.materialId!)).toBe(material.quantity! * 2);
  });

  it("keeps different irreversible tuning rolls as separate weapons and consumes each blueprint", () => {
    const first = crafted("primary", "weapon-p90-holographic-resonance");
    const blueprint = getEligibleWeaponTuningBlueprints(first.itemId)[0];
    expect(blueprint).toBeDefined();
    first.crafting!.tuning = {
      blueprintId: blueprint.id,
      attackPercent: blueprint.attackRange.min,
      secondary: null,
    };
    const second = structuredClone(first);
    second.crafting!.tuning!.attackPercent = blueprint.attackRange.max;
    const result = prepareBuildLoadout([build("a", [first]), build("b", [second])]);
    expect(result.equipment).toHaveLength(2);
    expect(amount(result, blueprint.id)).toBe(2);
  });

  it("sums the same chosen food recipe once per build while reusable armor is counted once", () => {
    const first = build("a", [crafted("helmet", "armor-lonewolf-hood")]);
    const id = "consumable-30110324";
    const recipe = getConsumableCraftRecipes(id).find((item) => item.isDefault)!;
    const selections = Object.fromEntries(
      recipe.ingredients
        .filter((ingredient) => ingredient.kind === "CHOICE")
        .map((ingredient) => [ingredient.key, ingredient.options[0].materialId]),
    );
    first.loadout!.consumables = {
      foodIds: [id],
      drinkIds: [],
      notes: "",
      preparations: { [id]: { recipeKey: recipe.key, ingredientSelections: selections } },
    };
    const second = { ...structuredClone(first), buildId: "b", title: "빌드 b" };
    const result = prepareBuildLoadout([first, second]);
    expect(result.complete).toBe(true);
    expect(result.counts).toMatchObject({ armorSaved: 1, foodBatches: 2 });
    expect(result.consumables[0].quantity).toBe(2);
    const ingredients = getRecipeMaterials(recipe, selections);
    const meat = ingredients.find((ingredient) => ingredient.materialId === "material-30101006")!;
    expect(meat).toBeDefined();
    expect(amount(result, meat.materialId!)).toBe(meat.quantity! * 2);
    expect(amount(result, "material-30310008")).toBe(3);
  });

  it("does not turn unchosen food ingredients or unrecorded equipment tiers into a complete total", () => {
    const input = build("a", [createGearSelection("helmet", "armor-lonewolf-hood")]);
    input.loadout!.consumables = { foodIds: ["consumable-30110324"], drinkIds: [], notes: "" };
    const result = prepareBuildLoadout([input]);
    expect(result.complete).toBe(false);
    expect(result.unresolved.some((issue) => issue.message.includes("제작 티어"))).toBe(true);
    expect(result.unresolved.some((issue) => issue.message.includes("선택"))).toBe(true);
    expect(amount(result, "material-30310008")).toBe(0);
    expect(amount(result, "material-30101006")).toBe(0);
    expect(makeLoadoutPreparationText(result)).toContain("확인된 제작 재료");
  });

  it("shows legacy default-leather armor overlap separately from unconfirmed crafting reuse", () => {
    const a = build("a", [createGearSelection("helmet", "armor-lonewolf-hood")]);
    const b = { ...structuredClone(a), buildId: "b", title: "빌드 b" };
    const result = prepareBuildLoadout([a, b]);
    expect(result.sharedArmor).toHaveLength(1);
    expect(result.sharedArmor[0]).toMatchObject({ reuseConfirmed: false, materialComplete: false });
    expect(result.sharedArmor[0].materialLabels.join(" ")).toContain("사슴 가죽");
    expect(result.counts).toMatchObject({ listedEquipment: 2, uniqueEquipment: 2, armorSaved: 0 });
    expect(result.materials).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it("does not confirm physical weapon reuse when tuning roll values are unknown", () => {
    const weapon = crafted("primary", "weapon-p90-holographic-resonance");
    const blueprint = getEligibleWeaponTuningBlueprints(weapon.itemId)[0];
    weapon.crafting!.tuning = { blueprintId: blueprint.id, attackPercent: null, secondary: null };
    const result = prepareBuildLoadout([
      build("a", [weapon]),
      build("b", [structuredClone(weapon)]),
    ]);
    expect(result.equipment).toHaveLength(2);
    expect(amount(result, blueprint.id)).toBe(2);
    expect(result.complete).toBe(false);
    expect(result.unresolved[0].message).toContain("튜닝 수치");
  });

  it("reuses an identical weapon only when all recorded tuning rolls agree", () => {
    const weapon = crafted("primary", "weapon-p90-holographic-resonance");
    const blueprint = getEligibleWeaponTuningBlueprints(weapon.itemId)[0];
    const option = blueprint.secondaryOptions[0];
    weapon.crafting!.tuning = {
      blueprintId: blueprint.id,
      attackPercent: blueprint.attackRange.min,
      secondary: { kind: option.kind, value: option.min },
    };
    const result = prepareBuildLoadout([
      build("a", [weapon]),
      build("b", [structuredClone(weapon)]),
    ]);
    expect(result.complete).toBe(true);
    expect(result.equipment).toHaveLength(1);
    expect(amount(result, blueprint.id)).toBe(1);
  });

  it("rechecks historical tuning compatibility instead of treating a known ID as usable", () => {
    const weapon = crafted("primary", "weapon-p90-holographic-resonance");
    const blueprint = getEligibleWeaponTuningBlueprints("weapon-kukri")[0];
    weapon.crafting!.tuning = {
      blueprintId: blueprint.id,
      attackPercent: blueprint.attackRange.min,
      secondary: null,
    };
    const result = prepareBuildLoadout([build("a", [weapon])]);
    expect(result.complete).toBe(false);
    expect(result.unresolved[0].message).toContain("무기·시나리오");
    expect(amount(result, blueprint.id)).toBe(0);
  });

  it("does not double count the same version input and exposes legacy or missing source recipes", () => {
    const input = build("a", [crafted("helmet", "armor-lonewolf-hood")]);
    const result = prepareBuildLoadout([
      input,
      structuredClone(input),
      { buildId: "old", title: "이전 빌드", version: 2, loadout: null },
    ]);
    expect(result.counts.listedEquipment).toBe(1);
    expect(amount(result, "material-30310008")).toBe(3);
    expect(result.complete).toBe(false);
    expect(result.unresolved[0]).toMatchObject({ buildId: "old", name: "이전 빌드" });
  });
});
