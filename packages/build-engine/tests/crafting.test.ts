import { describe, expect, it } from "vitest";
import {
  CRAFTING_MATERIALS,
  CONSUMABLE_CRAFTING_RECIPES,
  GEAR_CRAFTING_RECIPES,
  LEATHER_MATERIALS,
  WEAPON_TUNING_BLUEPRINTS,
  createEmptyGearCrafting,
  getConsumablePreparation,
  getEffectiveIngredientSelections,
  getEligibleWeaponTuningBlueprints,
  getGearCraftRecipe,
  getGearCraftRecipes,
  getRecipeMaterials,
  getWeaponTuningBlueprint,
} from "../src/model/crafting";
import {
  createEmptyGearLoadout,
  createGearSelection,
  GEAR_SCHEMA_VERSION,
} from "../src/model/gear";
import { parseGearLoadoutForSave, parseVersionedPlannerSnapshot } from "../src/validation/gear";

const helmetId = "armor-lonewolf-hood";
const recipe = getGearCraftRecipe(helmetId, 5)!;
const leather = recipe.ingredients.find((ingredient) =>
  ingredient.options.some((option) => option.materialId === "material-30310008"),
)!;

describe("sourced crafting catalogs", () => {
  it("retains exactly the 47 requested leather materials and their original rarities", () => {
    expect(LEATHER_MATERIALS).toHaveLength(47);
    expect(LEATHER_MATERIALS.filter((material) => material.rarity === "NORMAL")).toHaveLength(9);
    expect(LEATHER_MATERIALS.filter((material) => material.rarity === "RARE")).toHaveLength(5);
    expect(LEATHER_MATERIALS.filter((material) => material.rarity === "EPIC")).toHaveLength(8);
    expect(LEATHER_MATERIALS.filter((material) => material.rarity === "LEGENDARY")).toHaveLength(
      25,
    );
    expect(LEATHER_MATERIALS[0]).toMatchObject({ sourceId: "30310008", name: "사슴 가죽" });
    expect(LEATHER_MATERIALS.find((material) => material.name === "구식 군용 헬멧")?.sourceId).toBe(
      "30340032",
    );
  });
  it("resolves trusted item IDs, positive quantities, and unique ingredient keys in every recipe", () => {
    const ids = new Set(CRAFTING_MATERIALS.map((material) => material.id));
    for (const recipe of [...GEAR_CRAFTING_RECIPES, ...CONSUMABLE_CRAFTING_RECIPES]) {
      expect(new Set(recipe.ingredients.map((ingredient) => ingredient.key)).size, recipe.key).toBe(
        recipe.ingredients.length,
      );
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.options.length, recipe.key).toBeGreaterThan(0);
        for (const option of ingredient.options) {
          expect(ids.has(option.materialId), option.materialId).toBe(true);
          expect(Number.isInteger(option.quantity) && option.quantity > 0).toBe(true);
        }
      }
    }
  });
  it("uses the sourced representative deer material and exact T5 replacement count", () => {
    expect(leather.defaultMaterialId).toBe("material-30310008");
    expect(
      getRecipeMaterials(recipe).find((material) => material.key === leather.key),
    ).toMatchObject({ materialId: "material-30310008", quantity: 3 });
    expect(
      getRecipeMaterials(recipe, { [leather.key]: "material-30310101" }).find(
        (material) => material.key === leather.key,
      ),
    ).toMatchObject({ materialId: "material-30310101", quantity: 3 });
    expect(
      getGearCraftRecipes(helmetId, 1)[0].ingredients.find(
        (ingredient) => ingredient.key === "group-8011",
      )?.options[0].quantity,
    ).toBe(2);
  });
  it("does not invent a recipe for an unknown item or tier combination", () => {
    expect(getGearCraftRecipe("unknown", 5)).toBeUndefined();
    expect(getGearCraftRecipe(helmetId, 1, recipe.key)).toBeUndefined();
  });
  it("keeps interchangeable food ingredients unresolved until the author chooses", () => {
    const preparation = getConsumablePreparation("consumable-30110324")!;
    const choice = preparation.recipe.ingredients.find(
      (ingredient) => ingredient.kind === "CHOICE",
    )!;
    expect(choice.defaultMaterialId).toBeNull();
    expect(preparation.ingredientSelections[choice.key]).toBeUndefined();
    expect(preparation.materials.find((material) => material.key === choice.key)).toMatchObject({
      materialId: null,
      quantity: null,
    });
    const selected = choice.options[0].materialId;
    expect(
      getEffectiveIngredientSelections(preparation.recipe, { [choice.key]: selected })[choice.key],
    ).toBe(selected);
    expect(
      getRecipeMaterials(preparation.recipe, { [choice.key]: selected }).find(
        (material) => material.key === choice.key,
      )?.quantity,
    ).toBe(choice.options[0].quantity);
  });
  it("preserves all 94 current tuning identities while excluding obsolete and unsupported seasonal choices", () => {
    expect(WEAPON_TUNING_BLUEPRINTS).toHaveLength(94);
    expect(WEAPON_TUNING_BLUEPRINTS.filter((blueprint) => !blueprint.seasonal)).toHaveLength(72);
    expect(getWeaponTuningBlueprint("tuning-30395021")).toBeUndefined();
    const sniper = getEligibleWeaponTuningBlueprints("weapon-10521401");
    expect(sniper).toHaveLength(9);
    expect(
      sniper.every(
        (blueprint) => blueprint.weaponFamilies.includes("SNIPER") && !blueprint.seasonal,
      ),
    ).toBe(true);
    expect(getEligibleWeaponTuningBlueprints(helmetId)).toEqual([]);
    expect(getWeaponTuningBlueprint("tuning-30399160")?.attackRange).toEqual({ min: 34, max: 50 });
  });
});

function armorDraft() {
  const draft = createEmptyGearLoadout();
  const selection = createGearSelection("helmet", helmetId);
  selection.crafting = {
    ...createEmptyGearCrafting(),
    tier: 5,
    recipeKey: recipe.key,
    materialChoices: { [leather.key]: "material-30310101" },
  };
  draft.slots = [selection];
  return draft;
}

describe("crafting save and immutable snapshot compatibility", () => {
  it("roundtrips chosen leather with a trusted name and without mutating the input", () => {
    const draft = armorDraft();
    draft.catalogNames = { "material-30310101": "wrong label" };
    const before = structuredClone(draft);
    const saved = parseGearLoadoutForSave(draft);
    expect(saved.catalogNames?.["material-30310101"]).toBe("고원 사슴 가죽");
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, saved)).toEqual(saved);
    expect(draft).toEqual(before);
  });
  it("preserves historical snapshots that have neither crafting nor preparations", () => {
    const draft = createEmptyGearLoadout();
    draft.slots = [createGearSelection("helmet", helmetId)];
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, draft)).toEqual(draft);
    expect(parseGearLoadoutForSave(draft).slots[0]).not.toHaveProperty("crafting");
  });
  it.each(["material-30310119", "invented-material"])(
    "rejects an incompatible or forged ingredient identity %s",
    (materialId) => {
      const draft = armorDraft();
      draft.slots[0].crafting!.materialChoices = { "item-30350001": materialId };
      expect(() => parseGearLoadoutForSave(draft)).toThrow(/allowed choice/);
    },
  );
  it("rejects another item's recipe, an unknown ingredient key, and a mismatch with the recorded tier", () => {
    const draft = armorDraft();
    draft.slots[0].crafting!.recipeKey = getGearCraftRecipe("armor-lonewolf-jacket", 5)!.key;
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/recipe must match/);
    draft.slots[0].crafting!.recipeKey = recipe.key;
    draft.slots[0].crafting!.materialChoices = { unknown: "material-30310008" };
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/allowed choice/);
    draft.slots[0].crafting!.materialChoices = {};
    draft.slots[0].crafting!.tier = 1;
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/recipe must match/);
  });
  it("accepts current weapon tuning independently of recorded equipment level and without an invented Tier V gate", () => {
    const draft = createEmptyGearLoadout();
    const selection = createGearSelection("primary", "weapon-10521401");
    selection.level = 50;
    selection.crafting = {
      ...createEmptyGearCrafting(),
      tier: 1,
      tuning: {
        blueprintId: "tuning-30399160",
        attackPercent: 40,
        secondary: { kind: "ELEMENTAL_DAMAGE", value: 17 },
      },
    };
    draft.slots = [selection];
    const saved = parseGearLoadoutForSave(draft);
    expect(saved.slots[0].level).toBe(50);
    expect(saved.slots[0].crafting?.tier).toBe(1);
    expect(saved.catalogNames?.["tuning-30399160"]).toBe("튜닝 설계도·속사 저격");
    selection.crafting.tuning!.attackPercent = 33;
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/sourced range/);
    selection.crafting.tuning!.attackPercent = 40;
    selection.crafting.tuning!.secondary!.value = 80;
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/sourced range/);
  });
  it("rejects tuning on armor, wrong weapon families, unsupported seasonal styles and removed old IDs", () => {
    const draft = armorDraft();
    draft.slots[0].crafting!.tuning = {
      blueprintId: "tuning-30399160",
      attackPercent: null,
      secondary: null,
    };
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/match the weapon/);
    draft.slots = [createGearSelection("primary", "weapon-p90-holographic-resonance")];
    draft.slots[0].crafting = {
      ...createEmptyGearCrafting(),
      tuning: { blueprintId: "tuning-30399160", attackPercent: null, secondary: null },
    };
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/match the weapon/);
    draft.slots[0].crafting!.tuning!.blueprintId = "tuning-30399137";
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/match the weapon/);
    draft.slots[0].crafting!.tuning!.blueprintId = "tuning-30393021";
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/match the weapon/);
  });
  it("saves a real food alternative and rejects preparations for unselected or other dishes", () => {
    const draft = createEmptyGearLoadout();
    const foodId = "consumable-30110324";
    const preparation = getConsumablePreparation(foodId)!;
    const choice = preparation.recipe.ingredients.find(
      (ingredient) => ingredient.kind === "CHOICE",
    )!;
    draft.consumables!.foodIds = [foodId];
    draft.consumables!.preparations = {
      [foodId]: {
        recipeKey: preparation.recipe.key,
        ingredientSelections: { [choice.key]: choice.options[0].materialId },
      },
    };
    expect(parseGearLoadoutForSave(draft).consumables?.preparations).toEqual(
      draft.consumables!.preparations,
    );
    draft.consumables!.foodIds = [];
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/only to a selected/);
    draft.consumables!.foodIds = [foodId];
    draft.consumables!.preparations[foodId].recipeKey =
      getConsumablePreparation("consumable-30110385")!.recipe.key;
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/Unknown preparation/);
  });
});
