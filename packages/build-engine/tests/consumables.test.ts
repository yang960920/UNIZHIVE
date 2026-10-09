import { describe, expect, it } from "vitest";
import {
  CONSUMABLE_CATALOG,
  createEmptyConsumableLoadout,
  getConsumableItem,
  getConsumableSlotLimits,
  type ConsumableCatalog,
  type ConsumableCatalogItem,
  type ConsumableKind,
} from "../src/model/consumables";
import { createEmptyGearLoadout, GEAR_SCHEMA_VERSION } from "../src/model/gear";
import {
  parseGearLoadout,
  parseGearLoadoutForSave,
  parseVersionedPlannerSnapshot,
} from "../src/validation/gear";

function item(id: string, kind: ConsumableKind): ConsumableCatalogItem {
  return {
    id,
    sourceId: id,
    name: `Test-only ${id}`,
    aliases: [],
    kind,
    icon: "/test-only.png",
    effects: [
      {
        description: "Test fixture, not gameplay evidence.",
        durationSeconds: null,
        verified: false,
      },
    ],
    recipe: { status: "UNVERIFIED", ingredients: [] },
    source: { url: null, evidence: "Test fixture only.", verifiedAt: "2026-10-09" },
  };
}

const catalog: ConsumableCatalog = [
  item("fixture-food-a", "FOOD"),
  item("fixture-food-b", "FOOD"),
  item("fixture-drink-a", "DRINK"),
  item("fixture-drink-b", "DRINK"),
];

function loadout(characterClass: string | null = "셰프") {
  const value = createEmptyGearLoadout();
  value.context.characterClass = characterClass;
  value.consumables = {
    foodIds: ["fixture-food-a", "fixture-food-b"],
    drinkIds: ["fixture-drink-a", "fixture-drink-b"],
    notes: "Player-recorded preparation differences.",
  };
  return value;
}

const save = (value: unknown) => parseGearLoadoutForSave(value, [], catalog);

describe("Independent food and drink selections", () => {
  it.each(["셰프", " 셰프 ", "chef", " CHEF "])(
    "allows two different foods and two different drinks for %s",
    (characterClass) => {
      const saved = save(loadout(characterClass));
      expect(saved.consumables?.foodIds).toHaveLength(2);
      expect(saved.consumables?.drinkIds).toHaveLength(2);
      expect(getConsumableSlotLimits(characterClass)).toEqual({ food: 2, drink: 2, isChef: true });
    },
  );

  it.each([null, "비스트마스터", "unknown class"])(
    "enforces one food and one drink independently for %s",
    (characterClass) => {
      const value = loadout(characterClass);
      expect(() => save(value)).toThrow(/at most 1/);
      value.consumables!.foodIds = ["fixture-food-a"];
      expect(() => save(value)).toThrow(/drink/);
      value.consumables!.drinkIds = ["fixture-drink-a"];
      expect(save(value).consumables).toEqual(value.consumables);
      value.consumables!.foodIds = ["fixture-food-a", "fixture-food-b"];
      expect(() => save(value)).toThrow(/food/);
    },
  );

  it("rejects duplicates, unknown IDs, and foods placed in drink selections", () => {
    const value = loadout();
    value.consumables!.foodIds = ["fixture-food-a", "fixture-food-a"];
    expect(() => save(value)).toThrow(/different items/);
    value.consumables!.foodIds = ["fixture-food-a"];
    value.consumables!.drinkIds = ["fixture-drink-a", "fixture-drink-a"];
    expect(() => save(value)).toThrow(/different items/);
    value.consumables!.drinkIds = ["fixture-food-a"];
    expect(() => save(value)).toThrow(/category/);
    value.consumables!.drinkIds = ["unknown-consumable"];
    expect(() => save(value)).toThrow(/Unknown consumable/);
    value.consumables!.foodIds = ["fixture-drink-a"];
    expect(() => save(value)).toThrow(/category/);
  });

  it("does not silently trim excess selections when a chef changes profession", () => {
    const value = loadout("셰프");
    const before = structuredClone(value);
    value.context.characterClass = "다른 직업";
    expect(() => save(value)).toThrow(/at most 1/);
    expect(value.consumables).toEqual(before.consumables);
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, value)).toMatchObject({
      consumables: before.consumables,
    });
  });

  it("bounds recording notes, rejects client-controlled extra fields, and creates independent arrays", () => {
    const value = loadout();
    value.consumables!.notes = "x".repeat(2001);
    expect(() => save(value)).toThrow();
    value.consumables!.notes = "";
    Object.assign(value.consumables!, { damage: 100 });
    expect(() => save(value)).toThrow();
    const first = createEmptyConsumableLoadout();
    first.foodIds.push("fixture-food-a");
    expect(createEmptyConsumableLoadout()).toEqual({ foodIds: [], drinkIds: [], notes: "" });
  });

  it("rejects duplicate catalog identities instead of selecting an arbitrary item", () => {
    expect(() => parseGearLoadoutForSave(loadout(), [], [...catalog, catalog[0]])).toThrow(
      /IDs must be unique/,
    );
  });
});

describe("Consumable snapshot preservation", () => {
  it("reconstructs trusted names and round-trips the saved selections without mutating the input", () => {
    const value = loadout();
    value.catalogNames = { "fixture-food-a": "forged label" };
    const before = structuredClone(value);
    const saved = save(value);
    expect(saved.catalogNames).toEqual(
      Object.fromEntries(catalog.map((entry) => [entry.id, entry.name])),
    );
    expect(
      parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, JSON.parse(JSON.stringify(saved))),
    ).toEqual(saved);
    expect(value).toEqual(before);
  });

  it("preserves retired food IDs in historical reads while rejecting them in new saves", () => {
    const saved = save(loadout());
    saved.consumables!.foodIds = ["retired-food"];
    saved.catalogNames = {
      "retired-food": "Previous food name",
      "fixture-drink-a": "Previous drink name",
      "fixture-drink-b": "Other previous drink name",
    };
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, saved)).toEqual(saved);
    expect(() => save(saved)).toThrow(/Unknown consumable/);
  });

  it("keeps old V2 snapshots without the optional consumables field unchanged", () => {
    const old = createEmptyGearLoadout();
    delete old.consumables;
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, old)).toEqual(old);
    expect(parseGearLoadout(old, [], catalog)).toEqual(old);
    expect(save(old)).not.toHaveProperty("consumables");
  });
});

describe("Read-only source catalog", () => {
  it.each(["30110313", "30110318"])(
    "uses the sourced drink slot for soup %s rather than inferring from its food-like name",
    (sourceId) => {
      const soup = CONSUMABLE_CATALOG.find((entry) => entry.sourceId === sourceId);
      expect(soup?.kind).toBe("DRINK");
      if (!soup) throw new Error("Expected sourced soup catalog entry.");
      const value = createEmptyGearLoadout();
      value.consumables = { foodIds: [], drinkIds: [soup.id], notes: "" };
      expect(parseGearLoadoutForSave(value).consumables?.drinkIds).toEqual([soup.id]);
      value.consumables = { foodIds: [soup.id], drinkIds: [], notes: "" };
      expect(() => parseGearLoadoutForSave(value)).toThrow(/category/);
    },
  );

  it("freezes nested source effects, recipes, and ingredient alternatives", () => {
    expect(CONSUMABLE_CATALOG.length).toBeGreaterThan(0);
    expect(Object.isFrozen(CONSUMABLE_CATALOG)).toBe(true);
    for (const entry of CONSUMABLE_CATALOG) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.aliases)).toBe(true);
      expect(Object.isFrozen(entry.source)).toBe(true);
      expect(Object.isFrozen(entry.effects)).toBe(true);
      entry.effects.forEach((effect) => expect(Object.isFrozen(effect)).toBe(true));
      expect(Object.isFrozen(entry.recipe)).toBe(true);
      expect(Object.isFrozen(entry.recipe.ingredients)).toBe(true);
      entry.recipe.ingredients.forEach((ingredient) => {
        expect(Object.isFrozen(ingredient)).toBe(true);
        if (ingredient.options) {
          expect(Object.isFrozen(ingredient.options)).toBe(true);
          ingredient.options.forEach((option) => expect(Object.isFrozen(option)).toBe(true));
        }
      });
      if (entry.recipe.variants) {
        expect(Object.isFrozen(entry.recipe.variants)).toBe(true);
        entry.recipe.variants.forEach((variant) => {
          expect(Object.isFrozen(variant)).toBe(true);
          expect(Object.isFrozen(variant.ingredients)).toBe(true);
          variant.ingredients.forEach((ingredient) => {
            expect(Object.isFrozen(ingredient)).toBe(true);
            if (ingredient.options) {
              expect(Object.isFrozen(ingredient.options)).toBe(true);
              ingredient.options.forEach((option) => expect(Object.isFrozen(option)).toBe(true));
            }
          });
        });
      }
      if (entry.notes) expect(Object.isFrozen(entry.notes)).toBe(true);
      expect(getConsumableItem(entry.id)).toBe(entry);
      expect(entry).not.toHaveProperty("dps");
    }
    expect(getConsumableItem("unknown")).toBeUndefined();
  });
});
