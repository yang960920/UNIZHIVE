import catalog from "../../data/consumables-catalog.json";
import type { ConsumablePreparation } from "./crafting";

export type ConsumableKind = "FOOD" | "DRINK";

export interface ConsumableEffect {
  /** Source-formatted base effect; ingredient and profession modifiers are not inferred. */
  description: string;
  durationSeconds: number | null;
  verified: boolean;
}

export interface ConsumableRecipeIngredient {
  label: string;
  quantity: number | null;
  /** Sourced alternatives for one recipe ingredient, never an extra ingredient. */
  options?: readonly Readonly<{ label: string; quantity: number }>[];
}

export interface ConsumableRecipeVariant {
  label: string;
  /** Source identity only; these keys are not inferred scenario requirements. */
  sourceKey: string;
  ingredients: readonly Readonly<ConsumableRecipeIngredient>[];
}

export interface ConsumableRecipe {
  status: "VERIFIED_LOCAL_STATIC" | "UNVERIFIED";
  /** Source-supported recipe context, distinct from an inferred scenario key. */
  basisLabel?: string;
  ingredients: readonly Readonly<ConsumableRecipeIngredient>[];
  variants?: readonly Readonly<ConsumableRecipeVariant>[];
}

export interface ConsumableCatalogItem {
  id: string;
  sourceId: string;
  name: string;
  aliases: readonly string[];
  kind: ConsumableKind;
  icon: string;
  effects: readonly Readonly<ConsumableEffect>[];
  recipe: Readonly<ConsumableRecipe>;
  notes?: readonly string[];
  source: Readonly<{ url: string | null; evidence: string; verifiedAt: string }>;
}

export type ConsumableCatalog = readonly Readonly<ConsumableCatalogItem>[];

export interface ConsumableLoadout {
  foodIds: string[];
  drinkIds: string[];
  /** Player-recorded ingredient or preparation differences, separate from base catalog effects. */
  notes: string;
  /** Sourced recipe choices, keyed only by a selected food or drink identity. */
  preparations?: Record<string, ConsumablePreparation>;
}

function freezeIngredient(
  ingredient: ConsumableRecipeIngredient,
): Readonly<ConsumableRecipeIngredient> {
  return Object.freeze({
    ...ingredient,
    ...(ingredient.options
      ? {
          options: Object.freeze(ingredient.options.map((option) => Object.freeze({ ...option }))),
        }
      : {}),
  });
}

function freezeItem(item: ConsumableCatalogItem): Readonly<ConsumableCatalogItem> {
  return Object.freeze({
    ...item,
    aliases: Object.freeze([...item.aliases]),
    effects: Object.freeze(item.effects.map((effect) => Object.freeze({ ...effect }))),
    recipe: Object.freeze({
      ...item.recipe,
      ingredients: Object.freeze(item.recipe.ingredients.map(freezeIngredient)),
      ...(item.recipe.variants
        ? {
            variants: Object.freeze(
              item.recipe.variants.map((variant) =>
                Object.freeze({
                  ...variant,
                  ingredients: Object.freeze(variant.ingredients.map(freezeIngredient)),
                }),
              ),
            ),
          }
        : {}),
    }),
    ...(item.notes ? { notes: Object.freeze([...item.notes]) } : {}),
    source: Object.freeze({ ...item.source }),
  });
}

/** Read-only local evidence. This catalog neither calculates DPS nor changes recorded effects. */
export const CONSUMABLE_CATALOG: ConsumableCatalog = Object.freeze(
  (catalog.items as unknown as ConsumableCatalogItem[]).map(freezeItem),
);

const itemsById = new Map(CONSUMABLE_CATALOG.map((item) => [item.id, item]));

export function getConsumableItem(
  id: string | null | undefined,
): Readonly<ConsumableCatalogItem> | undefined {
  return id ? itemsById.get(id) : undefined;
}

/** Food and drink are independent limits; two different foods do not consume drink positions. */
export function getConsumableSlotLimits(characterClass: string | null | undefined): {
  food: 1 | 2;
  drink: 1 | 2;
  isChef: boolean;
} {
  const normalized = characterClass?.trim().toLowerCase();
  const isChef = normalized === "셰프" || normalized === "chef";
  return { food: isChef ? 2 : 1, drink: isChef ? 2 : 1, isChef };
}

export function createEmptyConsumableLoadout(): ConsumableLoadout {
  return { foodIds: [], drinkIds: [], notes: "" };
}
