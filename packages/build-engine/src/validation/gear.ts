import { z } from "zod";
import {
  GEAR_ATTACHMENT_KEYS,
  GEAR_CATALOG,
  GEAR_SCHEMA_VERSION,
  GEAR_SLOT_IDS,
  gearAttachmentFits,
  getGearKeyArmorSelections,
  gearItemFitsSlot,
  gearItemMatchesScenario,
  type GearCatalog,
  type GearCatalogItem,
  type PlannerGearLoadout,
} from "../model/gear";
import { getGearTraitConflicts } from "../model/gear-traits";
import {
  CONSUMABLE_CATALOG,
  getConsumableSlotLimits,
  type ConsumableCatalog,
  type ConsumableKind,
} from "../model/consumables";
import {
  PLANNER_MAX_PAYLOAD_BYTES,
  PLANNER_SCHEMA_VERSION,
  type PlannerLoadout,
} from "../model/planner";
import { plannerLoadoutSchema } from "./planner";
import {
  getCraftingMaterial,
  getGearCraftRecipe,
  getConsumablePreparation,
  getWeaponTuningBlueprint,
  weaponTuningFits,
  type CraftingRecipe,
} from "../model/crafting";

const id = z.string().trim().min(1).max(160);
const recordingLevel = z.number().int().min(1).max(100).nullable();
const moduleLevel = z.number().int().min(1).max(17).nullable();
const nullableId = id.nullable();
const craftingSelectionMap = z.record(id, id).superRefine((values, ctx) => {
  if (Object.keys(values).length > 64)
    ctx.addIssue({ code: "custom", message: "Too many crafting ingredient choices." });
});
const tuningSchema = z.strictObject({
  blueprintId: id,
  attackPercent: z.number().min(0).max(1000).nullable(),
  secondary: z
    .strictObject({
      kind: z.enum(["CRIT_RATE", "CRIT_DAMAGE", "ELEMENTAL_DAMAGE", "WEAKSPOT_DAMAGE"]),
      value: z.number().min(0).max(1000).nullable(),
    })
    .nullable(),
});
const gearCraftingSchema = z.strictObject({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
  recipeKey: nullableId,
  materialChoices: craftingSelectionMap,
  tuning: tuningSchema.nullable(),
});
function metadataLabels(maxItems: number, maxLength: number, stripHash: boolean) {
  return z
    .array(
      z
        .string()
        .max(120)
        .transform((label) => {
          const normalized = label.trim().replace(/\s+/g, " ");
          return stripHash ? normalized.replace(/^#+\s*/, "").trim() : normalized;
        })
        .pipe(z.string().min(1).max(maxLength)),
    )
    .max(maxItems)
    .transform((labels) => {
      const seen = new Set<string>();
      return labels.filter((label) => {
        const key = label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
}

export const gearLoadoutSchema = z
  .strictObject({
    schemaVersion: z.literal(GEAR_SCHEMA_VERSION),
    context: plannerLoadoutSchema.shape.context,
    slots: z
      .array(
        z.strictObject({
          slot: z.enum(GEAR_SLOT_IDS),
          itemId: id,
          level: recordingLevel,
          suffixId: nullableId,
          abilityGrade: recordingLevel,
          activityGrade: recordingLevel,
          traitIds: z.array(id).max(16),
          crafting: gearCraftingSchema.optional(),
          attachments: z.strictObject({
            muzzle: nullableId,
            sight: nullableId,
            tactical: nullableId,
            magazine: nullableId,
            ammo: nullableId,
            module: nullableId,
            moduleSuffix: nullableId,
            moduleLevel,
          }),
        }),
      )
      .max(GEAR_SLOT_IDS.length),
    recommendation: z.strictObject({
      rating: z.number().int().min(1).max(5).nullable(),
      contents: metadataLabels(16, 60, false),
      tags: metadataLabels(24, 40, true),
      notes: z.string().max(2000),
    }),
    notes: z.string().max(2000),
    consumables: z
      .strictObject({
        foodIds: z.array(id).max(2),
        drinkIds: z.array(id).max(2),
        notes: z.string().max(2000),
        preparations: z
          .record(
            id,
            z.strictObject({
              recipeKey: id,
              ingredientSelections: craftingSelectionMap,
            }),
          )
          .optional(),
      })
      .optional(),
    catalogNames: z.record(id, z.string().trim().min(1).max(120)).optional(),
  })
  .superRefine((loadout, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(loadout)).byteLength > PLANNER_MAX_PAYLOAD_BYTES)
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "Gear snapshot exceeds the storage payload limit.",
      });
    const seen = new Set<string>();
    const cradles = new Set<string>();
    if (loadout.consumables) {
      for (const key of ["foodIds", "drinkIds"] as const) {
        const values = loadout.consumables[key];
        if (new Set(values).size !== values.length)
          ctx.addIssue({
            code: "custom",
            path: ["consumables", key],
            message: "Consumable selections must be different items within each category.",
          });
      }
    }
    loadout.slots.forEach((selection, index) => {
      if (seen.has(selection.slot))
        ctx.addIssue({
          code: "custom",
          path: ["slots", index, "slot"],
          message: "Each equipment slot can be selected only once.",
        });
      seen.add(selection.slot);
      if (selection.slot.startsWith("cradle-")) {
        if (cradles.has(selection.itemId))
          ctx.addIssue({
            code: "custom",
            path: ["slots", index, "itemId"],
            message: "The same Cradle item cannot occupy multiple recording positions.",
          });
        cradles.add(selection.itemId);
      }
      if (selection.suffixId !== null)
        ctx.addIssue({
          code: "custom",
          path: ["slots", index, "suffixId"],
          message:
            "Selection suffixId is reserved; module suffixes belong to attachments.moduleSuffix.",
        });
      if (new Set(selection.traitIds).size !== selection.traitIds.length)
        ctx.addIssue({
          code: "custom",
          path: ["slots", index, "traitIds"],
          message: "Trait IDs must be unique.",
        });
      if (
        selection.slot !== "combatDeviant" &&
        (selection.abilityGrade !== null ||
          selection.activityGrade !== null ||
          selection.traitIds.length > 0)
      )
        ctx.addIssue({
          code: "custom",
          path: ["slots", index],
          message: "Ability/activity grades and traits are reserved for the combat deviant.",
        });
      if (
        selection.attachments.module === null &&
        (selection.attachments.moduleSuffix !== null || selection.attachments.moduleLevel !== null)
      )
        ctx.addIssue({
          code: "custom",
          path: ["slots", index, "attachments"],
          message: "Module suffix and level require a selected module.",
        });
      if (selection.slot === "combatDeviant" || selection.slot.startsWith("cradle-")) {
        if (Object.values(selection.attachments).some((value) => value !== null))
          ctx.addIssue({
            code: "custom",
            path: ["slots", index, "attachments"],
            message: "Deviant and Cradle selections do not accept equipment attachments.",
          });
      }
      if (selection.slot.startsWith("cradle-") && selection.level !== null)
        ctx.addIssue({
          code: "custom",
          path: ["slots", index, "level"],
          message: "Cradle selections do not record item levels.",
        });
    });
    if (loadout.catalogNames) {
      const names = Object.keys(loadout.catalogNames);
      if (names.length >= 256)
        ctx.addIssue({
          code: "custom",
          path: ["catalogNames"],
          message: "Catalog name snapshots must contain fewer than 256 items.",
        });
      const referenced = new Set<string>();
      loadout.consumables?.foodIds.forEach((itemId) => referenced.add(itemId));
      loadout.consumables?.drinkIds.forEach((itemId) => referenced.add(itemId));
      for (const preparation of Object.values(loadout.consumables?.preparations ?? {})) {
        Object.values(preparation.ingredientSelections).forEach((itemId) => referenced.add(itemId));
      }
      for (const selection of loadout.slots) {
        referenced.add(selection.itemId);
        selection.traitIds.forEach((trait) => referenced.add(trait));
        Object.values(selection.crafting?.materialChoices ?? {}).forEach((itemId) =>
          referenced.add(itemId),
        );
        if (selection.crafting?.tuning) referenced.add(selection.crafting.tuning.blueprintId);
        for (const [key, value] of Object.entries(selection.attachments)) {
          if (key !== "moduleLevel" && typeof value === "string") referenced.add(value);
        }
      }
      for (const name of names)
        if (!referenced.has(name))
          ctx.addIssue({
            code: "custom",
            path: ["catalogNames", name],
            message: "Saved catalog names must belong to items referenced by this snapshot.",
          });
    }
  });

/** Strict write parser. Raw payloads and all referenced identities are checked before saving. */
export function parseGearLoadout(
  input: unknown,
  catalog: GearCatalog = GEAR_CATALOG,
  consumableCatalog: ConsumableCatalog = CONSUMABLE_CATALOG,
): PlannerGearLoadout {
  let bytes = PLANNER_MAX_PAYLOAD_BYTES + 1;
  try {
    const serialized = JSON.stringify(input);
    if (serialized !== undefined) bytes = new TextEncoder().encode(serialized).byteLength;
  } catch {
    throw new z.ZodError([{ code: "custom", path: [], message: "Gear input must be JSON-safe." }]);
  }
  if (bytes > PLANNER_MAX_PAYLOAD_BYTES)
    throw new z.ZodError([
      { code: "custom", path: [], message: "Gear input exceeds the storage payload limit." },
    ]);
  const snapshot = gearLoadoutSchema.parse(input);
  const items = new Map(catalog.map((item) => [item.id, item]));
  if (items.size !== catalog.length)
    throw new z.ZodError([
      { code: "custom", path: [], message: "Gear catalog item IDs must be unique." },
    ]);
  const consumableItems = new Map(consumableCatalog.map((item) => [item.id, item]));
  if (
    consumableItems.size !== consumableCatalog.length ||
    [...consumableItems.keys()].some((itemId) => items.has(itemId))
  )
    throw new z.ZodError([
      { code: "custom", path: [], message: "Consumable catalog item IDs must be unique." },
    ]);
  const issues: z.core.$ZodIssue[] = [];
  const add = (path: (string | number)[], message: string) =>
    issues.push({ code: "custom", path, message });
  const checkScenario = (item: GearCatalogItem, path: (string | number)[]) => {
    if (!gearItemMatchesScenario(item, snapshot.context))
      add(path, "Select a matching scenario for this catalog item.");
  };
  const checkMaterialChoices = (
    recipe: Readonly<CraftingRecipe> | undefined,
    choices: Record<string, string>,
    path: (string | number)[],
  ) => {
    for (const [key, materialId] of Object.entries(choices)) {
      const ingredient = recipe?.ingredients.find((ingredient) => ingredient.key === key);
      if (!ingredient || !ingredient.options.some((option) => option.materialId === materialId))
        add(
          [...path, key],
          "Crafting material must be an allowed choice of the selected recipe ingredient.",
        );
    }
  };
  if (snapshot.consumables) {
    const categories: ["foodIds" | "drinkIds", ConsumableKind][] = [
      ["foodIds", "FOOD"],
      ["drinkIds", "DRINK"],
    ];
    for (const [key, kind] of categories)
      snapshot.consumables[key].forEach((itemId, index) => {
        const item = consumableItems.get(itemId);
        if (!item || item.kind !== kind)
          add(["consumables", key, index], "Unknown consumable or incorrect food/drink category.");
      });
    const selected = new Set([...snapshot.consumables.foodIds, ...snapshot.consumables.drinkIds]);
    for (const [itemId, preparation] of Object.entries(snapshot.consumables.preparations ?? {})) {
      const path = ["consumables", "preparations", itemId];
      if (!selected.has(itemId)) add(path, "Preparation belongs only to a selected food or drink.");
      const resolved = getConsumablePreparation(itemId, preparation);
      if (!resolved)
        add([...path, "recipeKey"], "Unknown preparation recipe for this food or drink.");
      checkMaterialChoices(resolved?.recipe, preparation.ingredientSelections, [
        ...path,
        "ingredientSelections",
      ]);
    }
  }
  snapshot.slots.forEach((selection, index) => {
    const path = ["slots", index];
    const parent = items.get(selection.itemId);
    if (!parent) {
      add([...path, "itemId"], "Unknown equipment catalog item.");
      return;
    }
    if (!gearItemFitsSlot(parent, selection.slot))
      add([...path, "itemId"], "Catalog item cannot occupy the selected equipment slot.");
    checkScenario(parent, [...path, "itemId"]);
    if (selection.crafting) {
      const crafting = selection.crafting;
      if (parent.kind !== "ARMOR" && parent.kind !== "WEAPON")
        add([...path, "crafting"], "Only weapons and armor record crafting choices.");
      const recipe = getGearCraftRecipe(parent.id, crafting.tier, crafting.recipeKey);
      if (crafting.recipeKey && !recipe)
        add(
          [...path, "crafting", "recipeKey"],
          "Crafting recipe must match the selected equipment and recorded tier.",
        );
      checkMaterialChoices(recipe, crafting.materialChoices, [
        ...path,
        "crafting",
        "materialChoices",
      ]);
      if (crafting.tuning) {
        const tuning = crafting.tuning;
        const blueprint = getWeaponTuningBlueprint(tuning.blueprintId);
        if (!blueprint || !weaponTuningFits(blueprint, parent, snapshot.context))
          add(
            [...path, "crafting", "tuning", "blueprintId"],
            "Tuning blueprint must explicitly match the weapon and scenario.",
          );
        if (
          blueprint &&
          tuning.attackPercent !== null &&
          (tuning.attackPercent < blueprint.attackRange.min ||
            tuning.attackPercent > blueprint.attackRange.max)
        )
          add(
            [...path, "crafting", "tuning", "attackPercent"],
            "Recorded attack percentage is outside this blueprint's sourced range.",
          );
        if (blueprint && tuning.secondary) {
          const option = blueprint.secondaryOptions.find(
            (option) => option.kind === tuning.secondary?.kind,
          );
          if (!option)
            add(
              [...path, "crafting", "tuning", "secondary", "kind"],
              "Unknown secondary tuning attribute.",
            );
          else if (
            tuning.secondary.value !== null &&
            (tuning.secondary.value < option.min || tuning.secondary.value > option.max)
          )
            add(
              [...path, "crafting", "tuning", "secondary", "value"],
              "Recorded tuning attribute is outside the sourced range.",
            );
        }
      }
    }
    for (const key of GEAR_ATTACHMENT_KEYS) {
      const attachedId = selection.attachments[key];
      if (attachedId === null) continue;
      const attached = items.get(attachedId);
      if (!attached || !gearAttachmentFits(attached, selection.slot, key, parent, snapshot.context))
        add(
          [...path, "attachments", key],
          "Unknown or incompatible attachment; compatibility must be explicitly catalogued.",
        );
    }
    if (selection.attachments.moduleSuffix !== null) {
      const selectedModule = selection.attachments.module
        ? items.get(selection.attachments.module)
        : undefined;
      const suffix = items.get(selection.attachments.moduleSuffix);
      if (
        !selectedModule ||
        !suffix ||
        suffix.kind !== "MODULE_SUFFIX" ||
        (selectedModule.moduleSuffixId !== undefined &&
          selectedModule.moduleSuffixId !== suffix.id) ||
        !selectedModule.allowedSuffixIds.includes(suffix.id)
      )
        add(
          [...path, "attachments", "moduleSuffix"],
          "Module suffix must belong to the selected new module.",
        );
      else checkScenario(suffix, [...path, "attachments", "moduleSuffix"]);
    }
    selection.traitIds.forEach((traitId, traitIndex) => {
      const trait = items.get(traitId);
      if (
        parent.kind !== "DEVIANT" ||
        !trait ||
        trait.kind !== "DEVIANT_TRAIT" ||
        !parent.allowedTraitIds.includes(traitId)
      )
        add([...path, "traitIds", traitIndex], "Trait must belong to the selected combat deviant.");
      else checkScenario(trait, [...path, "traitIds", traitIndex]);
    });
  });
  if (issues.length > 0) throw new z.ZodError(issues);
  const referenced = new Set<string>();
  snapshot.consumables?.foodIds.forEach((itemId) => referenced.add(itemId));
  snapshot.consumables?.drinkIds.forEach((itemId) => referenced.add(itemId));
  for (const preparation of Object.values(snapshot.consumables?.preparations ?? {}))
    Object.values(preparation.ingredientSelections).forEach((itemId) => referenced.add(itemId));
  for (const selection of snapshot.slots) {
    referenced.add(selection.itemId);
    selection.traitIds.forEach((trait) => referenced.add(trait));
    Object.values(selection.crafting?.materialChoices ?? {}).forEach((itemId) =>
      referenced.add(itemId),
    );
    if (selection.crafting?.tuning) referenced.add(selection.crafting.tuning.blueprintId);
    for (const [key, value] of Object.entries(selection.attachments)) {
      if (key !== "moduleLevel" && typeof value === "string") referenced.add(value);
    }
  }
  // Client labels are never authoritative; each new version captures the current trusted name.
  snapshot.catalogNames = Object.fromEntries(
    [...referenced]
      .sort()
      .map((itemId) => [
        itemId,
        (items.get(itemId) ??
          consumableItems.get(itemId) ??
          getCraftingMaterial(itemId) ??
          getWeaponTuningBlueprint(itemId))!.name,
      ]),
  );
  gearLoadoutSchema.parse(snapshot);
  return snapshot;
}

/** New-write gameplay guard. Historical snapshot reads and the compatibility parser stay unchanged. */
export function parseGearLoadoutForSave(
  input: unknown,
  catalog: GearCatalog = GEAR_CATALOG,
  consumableCatalog: ConsumableCatalog = CONSUMABLE_CATALOG,
): PlannerGearLoadout {
  const snapshot = parseGearLoadout(input, catalog, consumableCatalog);
  const keyArmors = getGearKeyArmorSelections(snapshot.slots, catalog);
  const issues: z.core.$ZodIssue[] = [];
  if (snapshot.consumables) {
    const limits = getConsumableSlotLimits(snapshot.context.characterClass);
    for (const [key, limit] of [
      ["foodIds", limits.food],
      ["drinkIds", limits.drink],
    ] as const)
      if (snapshot.consumables[key].length > limit)
        issues.push({
          code: "custom",
          path: ["consumables", key],
          message: `This character class permits at most ${limit} ${key === "foodIds" ? "food" : "drink"} selection${limit === 1 ? "" : "s"}.`,
        });
  }
  if (keyArmors.length > 1)
    issues.push({
      code: "custom",
      path: ["slots"],
      message: "Only one key armor can be equipped at a time.",
    });
  snapshot.slots.forEach((selection, index) => {
    for (const conflict of getGearTraitConflicts(selection.traitIds, catalog))
      issues.push({
        code: "custom",
        path: ["slots", index, "traitIds"],
        message:
          conflict.code === "DUPLICATE_ICON"
            ? "Traits with the same icon cannot be equipped on the same deviant."
            : "Only one shiny appearance trait can be equipped on the same deviant.",
      });
  });
  if (issues.length > 0) throw new z.ZodError(issues);
  return snapshot;
}

/** Read-only structural compatibility. Removed/revised catalog items remain readable as old snapshots. */
export function parseVersionedPlannerSnapshot(
  schemaVersion: string,
  input: unknown,
): PlannerLoadout | PlannerGearLoadout | null {
  if (input === null || typeof input !== "object") return null;
  if (schemaVersion === GEAR_SCHEMA_VERSION) {
    const parsed = gearLoadoutSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  }
  if (schemaVersion === PLANNER_SCHEMA_VERSION) {
    const parsed = plannerLoadoutSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  }
  return null;
}
