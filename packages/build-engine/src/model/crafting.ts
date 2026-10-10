import catalog from "../../data/crafting-catalog.json";
import gearCatalog from "./gear-catalog.json";
import type { GearCatalogItem, GearSelection } from "./gear";
import type { PlannerContext, PlannerScenarioKey } from "./planner";

export type CraftingTier = 1 | 2 | 3 | 4 | 5;
export type CraftingRarity = "NORMAL" | "RARE" | "EPIC" | "LEGENDARY";
export type TuningSecondaryKind =
  "CRIT_RATE" | "CRIT_DAMAGE" | "ELEMENTAL_DAMAGE" | "WEAKSPOT_DAMAGE";
export interface CraftingMaterial {
  id: string;
  sourceId: string;
  name: string;
  rarity: CraftingRarity | null;
  category: "LEATHER" | "INGREDIENT" | "MATERIAL";
}
export interface CraftingMaterialOption {
  materialId: string;
  quantity: number;
  effects: readonly string[];
}
export interface CraftingIngredient {
  key: string;
  label: string;
  kind: "FIXED" | "CHOICE";
  quantity: number;
  /** Only fixed items and the sourced representative armor material have a default. */
  defaultMaterialId: string | null;
  options: readonly Readonly<CraftingMaterialOption>[];
}
export interface CraftingRecipe {
  key: string;
  itemId: string;
  tier: CraftingTier | null;
  label: string;
  basisLabel: string;
  isDefault: boolean;
  ingredients: readonly Readonly<CraftingIngredient>[];
  outputQuantity: 1;
  sourceKeys: readonly string[];
}
export interface WeaponTuningBlueprint {
  id: string;
  sourceId: string;
  name: string;
  rarity: CraftingRarity;
  style: string;
  weaponFamilies: readonly string[];
  scenarioKeys: readonly PlannerScenarioKey[];
  groupId: number;
  seasonal: boolean;
  attackRange: Readonly<{ min: number; max: number }>;
  secondaryOptions: readonly Readonly<{ kind: TuningSecondaryKind; min: number; max: number }>[];
  description: string;
}
export interface WeaponTuningSelection {
  blueprintId: string;
  attackPercent: number | null;
  secondary: { kind: TuningSecondaryKind; value: number | null } | null;
}
export interface GearCrafting {
  /** Crafting tier is independent of equipment level and blueprint stars. */
  tier: CraftingTier | null;
  recipeKey: string | null;
  materialChoices: Record<string, string>;
  tuning: WeaponTuningSelection | null;
}
export interface ConsumablePreparation {
  recipeKey: string;
  ingredientSelections: Record<string, string>;
}
export interface ResolvedCraftingIngredient {
  key: string;
  materialId: string | null;
  quantity: number | null;
  effects: readonly string[];
}

type SourceRecipe = Omit<CraftingRecipe, "ingredients"> & { ingredientRefs: string[] };
const sourceIngredients = catalog.ingredientPool as unknown as Record<string, CraftingIngredient>;
const ingredientsByRef = new Map(
  Object.entries(sourceIngredients).map(([key, ingredient]) => [
    key,
    Object.freeze({
      ...ingredient,
      options: Object.freeze(
        ingredient.options.map((option) =>
          Object.freeze({ ...option, effects: Object.freeze([...option.effects]) }),
        ),
      ),
    }),
  ]),
);
function freezeRecipe(recipe: SourceRecipe): Readonly<CraftingRecipe> {
  return Object.freeze({
    ...recipe,
    sourceKeys: Object.freeze([...recipe.sourceKeys]),
    ingredients: Object.freeze(recipe.ingredientRefs.map((ref) => ingredientsByRef.get(ref)!)),
  });
}
export const CRAFTING_MATERIALS: readonly Readonly<CraftingMaterial>[] = Object.freeze(
  (catalog.materials as CraftingMaterial[]).map((material) => Object.freeze({ ...material })),
);
const materialsById = new Map(CRAFTING_MATERIALS.map((material) => [material.id, material]));
export const LEATHER_MATERIALS: readonly Readonly<CraftingMaterial>[] = Object.freeze(
  catalog.leatherIds.map((id) => materialsById.get(id)!).filter(Boolean),
);
export const GEAR_CRAFTING_RECIPES: readonly Readonly<CraftingRecipe>[] = Object.freeze(
  (catalog.gearRecipes as unknown as SourceRecipe[]).map(freezeRecipe),
);
export const CONSUMABLE_CRAFTING_RECIPES: readonly Readonly<CraftingRecipe>[] = Object.freeze(
  (catalog.consumableRecipes as unknown as SourceRecipe[]).map(freezeRecipe),
);
export const WEAPON_TUNING_BLUEPRINTS: readonly Readonly<WeaponTuningBlueprint>[] = Object.freeze(
  (catalog.tuningBlueprints as WeaponTuningBlueprint[]).map((blueprint) =>
    Object.freeze({
      ...blueprint,
      weaponFamilies: Object.freeze([...blueprint.weaponFamilies]),
      scenarioKeys: Object.freeze([...blueprint.scenarioKeys]),
      attackRange: Object.freeze({ ...blueprint.attackRange }),
      secondaryOptions: Object.freeze(
        blueprint.secondaryOptions.map((option) => Object.freeze({ ...option })),
      ),
    }),
  ),
);
// Keep gear -> crafting -> static data one-way so new selections can use T5 defaults
// without a runtime initialization cycle between the two model modules.
const gearItemsById = new Map(
  (gearCatalog as unknown as GearCatalogItem[]).map((item) => [item.id, item]),
);
const tuningById = new Map(WEAPON_TUNING_BLUEPRINTS.map((item) => [item.id, item]));

export function getCraftingMaterial(
  id: string | null | undefined,
): Readonly<CraftingMaterial> | undefined {
  return id ? materialsById.get(id) : undefined;
}
export function getWeaponTuningBlueprint(
  id: string | null | undefined,
): Readonly<WeaponTuningBlueprint> | undefined {
  return id ? tuningById.get(id) : undefined;
}
export function getGearCraftRecipes(
  itemId: string,
  tier?: CraftingTier | null,
): Readonly<CraftingRecipe>[] {
  return GEAR_CRAFTING_RECIPES.filter(
    (recipe) => recipe.itemId === itemId && (tier == null || recipe.tier === tier),
  );
}
/** A missing tier returns a representative solely for displaying the default material. */
export function getGearCraftRecipe(
  itemId: string,
  tier: CraftingTier | null | undefined,
  recipeKey?: string | null,
): Readonly<CraftingRecipe> | undefined {
  const recipes = getGearCraftRecipes(itemId, tier);
  if (recipeKey) return recipes.find((recipe) => recipe.key === recipeKey);
  return recipes.find((recipe) => recipe.isDefault) ?? recipes[0];
}
export function getConsumableCraftRecipes(itemId: string): Readonly<CraftingRecipe>[] {
  return CONSUMABLE_CRAFTING_RECIPES.filter((recipe) => recipe.itemId === itemId);
}
/** Unselected food alternatives deliberately stay absent rather than becoming a guessed meat. */
export function getEffectiveIngredientSelections(
  recipe: Readonly<CraftingRecipe>,
  selections: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const ingredient of recipe.ingredients) {
    const selected = selections[ingredient.key] ?? ingredient.defaultMaterialId;
    if (selected && ingredient.options.some((option) => option.materialId === selected))
      resolved[ingredient.key] = selected;
  }
  return resolved;
}
export function getRecipeMaterials(
  recipe: Readonly<CraftingRecipe>,
  selections: Readonly<Record<string, string>> = {},
): ResolvedCraftingIngredient[] {
  const effective = getEffectiveIngredientSelections(recipe, selections);
  return recipe.ingredients.map((ingredient) => {
    const option = ingredient.options.find(
      (choice) => choice.materialId === effective[ingredient.key],
    );
    return {
      key: ingredient.key,
      materialId: option?.materialId ?? null,
      quantity: option?.quantity ?? null,
      effects: option?.effects ?? [],
    };
  });
}
export function getConsumablePreparation(
  itemId: string,
  preparation?: Readonly<ConsumablePreparation> | null,
):
  | {
      recipe: Readonly<CraftingRecipe>;
      ingredientSelections: Record<string, string>;
      materials: ResolvedCraftingIngredient[];
    }
  | undefined {
  const recipes = getConsumableCraftRecipes(itemId);
  const recipe = preparation
    ? recipes.find((recipe) => recipe.key === preparation.recipeKey)
    : (recipes.find((recipe) => recipe.isDefault) ?? recipes[0]);
  if (!recipe) return undefined;
  const ingredientSelections = getEffectiveIngredientSelections(
    recipe,
    preparation?.ingredientSelections,
  );
  return {
    recipe,
    ingredientSelections,
    materials: getRecipeMaterials(recipe, ingredientSelections),
  };
}
export function weaponTuningFits(
  blueprint: Readonly<WeaponTuningBlueprint>,
  item: Readonly<GearCatalogItem>,
  context?: PlannerContext,
): boolean {
  if (
    item.kind !== "WEAPON" ||
    !item.weaponFamily ||
    !blueprint.weaponFamilies.includes(item.weaponFamily)
  )
    return false;
  // An empty allowed scenario list is unverified, never universal compatibility.
  return context?.scenarioKey
    ? blueprint.scenarioKeys.includes(context.scenarioKey)
    : !blueprint.seasonal && blueprint.scenarioKeys.length > 0;
}
export function getEligibleWeaponTuningBlueprints(
  itemId: string,
  context?: PlannerContext,
): Readonly<WeaponTuningBlueprint>[] {
  const item = gearItemsById.get(itemId);
  return item
    ? WEAPON_TUNING_BLUEPRINTS.filter((blueprint) => weaponTuningFits(blueprint, item, context))
    : [];
}
export function createEmptyGearCrafting(): GearCrafting {
  return { tier: null, recipeKey: null, materialChoices: {}, tuning: null };
}

function recipeContexts(recipe: Readonly<CraftingRecipe>): Set<string> {
  return new Set(
    recipe.sourceKeys.map((key) => {
      const value: unknown = JSON.parse(key);
      return Array.isArray(value) ? JSON.stringify(value.slice(1)) : "BASE";
    }),
  );
}

/**
 * Editing/new-write policy: weapon preparations use Tier V. This does not assert
 * a game restriction and is never applied by the immutable snapshot reader.
 * Callers must validate the original payload before using this on a new save.
 */
export function getWeaponCraftingAtTier5(
  selection: Readonly<GearSelection>,
  item: Readonly<GearCatalogItem> | undefined = gearItemsById.get(selection.itemId),
): GearCrafting {
  const previous = selection.crafting;
  if (item?.kind !== "WEAPON" || item.id !== selection.itemId)
    return previous ?? createEmptyGearCrafting();
  const source = getGearCraftRecipe(selection.itemId, previous?.tier, previous?.recipeKey);
  // Do not turn an unknown/tier-incompatible recipe ID into a seemingly valid one.
  if (previous?.recipeKey && !source)
    return { ...previous, tier: 5, materialChoices: { ...previous.materialChoices } };
  const candidates = getGearCraftRecipes(selection.itemId, 5);
  const contexts = source ? recipeContexts(source) : null;
  const sameContext = contexts
    ? candidates.find((recipe) => [...recipeContexts(recipe)].some((key) => contexts.has(key)))
    : undefined;
  const recipe =
    source?.tier === 5 ? source : (sameContext ?? getGearCraftRecipe(selection.itemId, 5));
  const materialChoices = recipe ? getEffectiveIngredientSelections(recipe) : {};
  for (const [key, materialId] of Object.entries(previous?.materialChoices ?? {})) {
    const oldIngredient = source?.ingredients.find((ingredient) => ingredient.key === key);
    if (
      !oldIngredient ||
      !oldIngredient.options.some((option) => option.materialId === materialId)
    ) {
      // Retain invalid input so subsequent strict validation cannot hide tampering.
      materialChoices[key] = materialId;
      continue;
    }
    const destination =
      recipe?.ingredients.find(
        (ingredient) =>
          ingredient.key === key &&
          ingredient.options.some((option) => option.materialId === materialId),
      ) ??
      recipe?.ingredients.find((ingredient) =>
        ingredient.options.some((option) => option.materialId === materialId),
      );
    if (destination) materialChoices[destination.key] = materialId;
    // A valid old-tier fixed material that is not used at T5 is replaced by the
    // sourced T5 requirement. Only choices allowed by the destination are retained.
  }
  return {
    tier: 5,
    recipeKey: recipe?.key ?? null,
    materialChoices,
    tuning: previous?.tuning
      ? {
          ...previous.tuning,
          secondary: previous.tuning.secondary ? { ...previous.tuning.secondary } : null,
        }
      : null,
  };
}

export function normalizeWeaponCrafting(
  selection: GearSelection,
  item: Readonly<GearCatalogItem> | undefined = gearItemsById.get(selection.itemId),
): GearSelection {
  if (item?.kind !== "WEAPON" || item.id !== selection.itemId) return selection;
  const crafting = getWeaponCraftingAtTier5(selection, item);
  return JSON.stringify(crafting) === JSON.stringify(selection.crafting)
    ? selection
    : { ...selection, crafting };
}
