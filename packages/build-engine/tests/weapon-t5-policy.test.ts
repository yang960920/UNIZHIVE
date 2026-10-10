import { describe, expect, it } from "vitest";
import {
  createEmptyGearCrafting,
  getEffectiveIngredientSelections,
  getGearCraftRecipe,
  getGearCraftRecipes,
  getRecipeMaterials,
  getWeaponCraftingAtTier5,
  normalizeWeaponCrafting,
  type CraftingTier,
} from "../src/model/crafting";
import {
  createEmptyGearLoadout,
  createGearSelection,
  GEAR_SCHEMA_VERSION,
  type GearSelection,
} from "../src/model/gear";
import { parseGearLoadoutForSave, parseVersionedPlannerSnapshot } from "../src/validation/gear";
import { prepareBuildLoadout } from "../src/model/loadout-preparation";

const weaponId = "weapon-p90-holographic-resonance";
const t5 = getGearCraftRecipe(weaponId, 5)!;

function selectionAt(tier: CraftingTier | null): GearSelection {
  const selection = createGearSelection("primary", weaponId);
  const recipe = getGearCraftRecipe(weaponId, tier)!;
  selection.crafting = {
    ...createEmptyGearCrafting(),
    tier,
    recipeKey: recipe.key,
    materialChoices: getEffectiveIngredientSelections(recipe),
  };
  return selection;
}
function save(selection: GearSelection) {
  const draft = createEmptyGearLoadout();
  draft.slots = [selection];
  return parseGearLoadoutForSave(draft);
}

describe("Tier V weapon planning policy", () => {
  it.each(["primary", "secondary", "melee"] as const)(
    "initializes a newly selected %s weapon with sourced T5 materials",
    (slot) => {
      const itemId = slot === "melee" ? "weapon-kukri" : weaponId;
      const selection = createGearSelection(slot, itemId);
      const recipe = getGearCraftRecipe(itemId, 5)!;
      expect(selection.crafting?.tier).toBe(5);
      expect(selection.crafting?.recipeKey).toBe(recipe.key);
      expect(selection.crafting?.materialChoices).toEqual(getEffectiveIngredientSelections(recipe));
      expect(
        getRecipeMaterials(recipe, selection.crafting?.materialChoices).every(
          (row) => row.materialId && row.quantity,
        ),
      ).toBe(true);
      expect(normalizeWeaponCrafting(selection)).toBe(selection);
    },
  );

  it("keeps armor optional and independent from the weapon policy", () => {
    const armor = createGearSelection("helmet", "armor-lonewolf-hood");
    expect(armor.crafting).toBeUndefined();
    expect(normalizeWeaponCrafting(armor)).toBe(armor);
    const equipped = { ...armor, crafting: { ...createEmptyGearCrafting(), tier: 2 as const } };
    expect(save(equipped).slots[0].crafting?.tier).toBe(2);
  });

  it.each([1, 2, 3, 4, null] as const)(
    "validates the original T%s recording then remaps it to its source-supported T5 recipe",
    (tier) => {
      const selection = selectionAt(tier);
      const before = structuredClone(selection);
      const normalized = getWeaponCraftingAtTier5(selection);
      expect(normalized.tier).toBe(5);
      expect(normalized.recipeKey).toBe(t5.key);
      expect(normalized.materialChoices).toEqual(getEffectiveIngredientSelections(t5));
      expect(save(selection).slots[0].crafting).toEqual(normalized);
      expect(selection).toEqual(before);
      expect(
        getRecipeMaterials(t5, normalized.materialChoices).find(
          (row) => row.materialId === "material-30350001",
        )?.quantity,
      ).toBe(105);
    },
  );

  it("normalizes a legacy editing payload with no crafting and rebuilds trusted names after replacing old fixed materials", () => {
    const selection = selectionAt(1);
    const draft = createEmptyGearLoadout();
    draft.slots = [selection];
    draft.catalogNames = { "material-30320000": "old label" };
    const saved = parseGearLoadoutForSave(draft);
    expect(saved.slots[0].crafting?.tier).toBe(5);
    expect(saved.catalogNames?.["material-30320000"]).toBeUndefined();
    expect(saved.catalogNames?.["material-30350001"]).toBe("스타더스트 에테르");
    delete selection.crafting;
    expect(save(selection).slots[0].crafting?.recipeKey).toBe(t5.key);
  });

  it("keeps an explicitly selected current T5 recipe unchanged and retains compatible material identities", () => {
    const alternative =
      getGearCraftRecipes("weapon-kukri", 5).find((recipe) => !recipe.isDefault) ??
      getGearCraftRecipe("weapon-kukri", 5)!;
    const selection = createGearSelection("melee", "weapon-kukri");
    selection.crafting = {
      ...createEmptyGearCrafting(),
      tier: 5,
      recipeKey: alternative.key,
      materialChoices: getEffectiveIngredientSelections(alternative),
    };
    const normalized = getWeaponCraftingAtTier5(selection);
    expect(normalized.recipeKey).toBe(alternative.key);
    expect(normalized.materialChoices).toEqual(selection.crafting.materialChoices);
    expect(save(selection).slots[0].crafting).toEqual(normalized);
  });

  it("does not let normalization hide a forged material ID, unknown ingredient key, unknown recipe or a tier/recipe mismatch", () => {
    const forgedMaterial = selectionAt(1);
    const source = getGearCraftRecipe(weaponId, 1)!;
    forgedMaterial.crafting!.materialChoices[source.ingredients[0].key] = "material-forged";
    expect(() => save(forgedMaterial)).toThrow(/allowed choice/);
    const forgedKey = selectionAt(1);
    forgedKey.crafting!.materialChoices.unknown = "material-30350001";
    expect(() => save(forgedKey)).toThrow(/allowed choice/);
    const unknownRecipe = selectionAt(1);
    unknownRecipe.crafting!.recipeKey = "forged-recipe";
    expect(getWeaponCraftingAtTier5(unknownRecipe).recipeKey).toBe("forged-recipe");
    expect(() => save(unknownRecipe)).toThrow(/recipe must match/);
    const mismatched = selectionAt(1);
    mismatched.crafting!.recipeKey = t5.key;
    expect(() => save(mismatched)).toThrow(/recipe must match/);
  });

  it("preserves valid tuning and rejects invalid tuning before applying the T5 rule", () => {
    const selection = selectionAt(1);
    selection.crafting!.tuning = {
      blueprintId: "tuning-30399134",
      attackPercent: 40,
      secondary: { kind: "CRIT_RATE", value: 14 },
    };
    expect(save(selection).slots[0].crafting?.tuning).toEqual(selection.crafting!.tuning);
    selection.crafting!.tuning!.blueprintId = "tuning-30399160";
    expect(() => save(selection)).toThrow(/match the weapon/);
  });

  it("does not invent materials when this weapon's T5 source recipe is unknown", () => {
    const selection = createGearSelection("primary", "weapon-10413301");
    expect(selection.crafting).toEqual({
      tier: 5,
      recipeKey: null,
      materialChoices: {},
      tuning: null,
    });
    const saved = save(selection);
    const result = prepareBuildLoadout([
      { buildId: "unknown", version: 2, title: "미확인 제작표", loadout: saved },
    ]);
    expect(result.complete).toBe(false);
    expect(result.materials).toEqual([]);
    expect(result.unresolved.some((row) => row.message.includes("제작표"))).toBe(true);
  });

  it("keeps historical reads unchanged and separates unrecorded weapon tiers from complete new T5 preparations", () => {
    const historical = createEmptyGearLoadout();
    const previous = selectionAt(1);
    delete previous.crafting;
    historical.slots = [previous];
    const before = structuredClone(historical);
    const read = parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, historical);
    expect(read).toEqual(before);
    const oldResult = prepareBuildLoadout([
      { buildId: "old", version: 1, title: "이전 버전", loadout: historical },
    ]);
    expect(oldResult.complete).toBe(false);
    expect(oldResult.materials).toEqual([]);
    expect(oldResult.unresolved.some((row) => row.message.includes("이전 버전"))).toBe(true);
    const saved = parseGearLoadoutForSave(historical);
    const result = prepareBuildLoadout([
      { buildId: "new", version: 2, title: "새 T5 버전", loadout: saved },
    ]);
    expect(result.complete).toBe(true);
    expect(result.equipment[0].tier).toBe(5);
    expect(result.materials.find((material) => material.id === "material-30350001")?.quantity).toBe(
      105,
    );
    expect(historical).toEqual(before);
  });
});
