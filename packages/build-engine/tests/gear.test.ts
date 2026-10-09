import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GEAR_CATALOG,
  GEAR_SCHEMA_VERSION,
  createEmptyGearLoadout,
  createGearSelection,
  getEligibleGearAttachments,
  getEligibleGearItems,
  type GearCatalog,
  type GearCatalogItem,
  type GearSelection,
  type PlannerGearLoadout,
} from "../src/model/gear";
import { createEmptyPlannerLoadout, PLANNER_SCHEMA_VERSION } from "../src/model/planner";
import {
  gearLoadoutSchema,
  parseGearLoadout,
  parseVersionedPlannerSnapshot,
} from "../src/validation/gear";

/** Test-only compatibility records. These are not manufactured production game items or stats. */
function item(id: string, fields: Partial<GearCatalogItem> = {}): GearCatalogItem {
  return {
    id,
    name: `Test-only ${id}`,
    aliases: [],
    kind: "WEAPON",
    allowedSlots: ["primary", "secondary"],
    weaponFamily: "SMG",
    compatibleWeaponFamilies: [],
    accessorySlot: null,
    moduleGeneration: null,
    allowedSuffixIds: [],
    allowedTraitIds: [],
    icon: null,
    rarity: null,
    description: "Validation fixture only.",
    setId: null,
    isKeyArmor: false,
    scenarioKeys: [],
    source: {
      url: null,
      evidence: "Test-only fixture, not game evidence.",
      verifiedAt: "2026-10-07",
    },
    ...fields,
  };
}

const fixtures: GearCatalog = [
  item("fixture-smg"),
  item("fixture-sniper", { weaponFamily: "SNIPER" }),
  item("fixture-unknown-weapon", { weaponFamily: null }),
  item("fixture-melee", { weaponFamily: "MELEE", allowedSlots: ["melee"] }),
  item("fixture-helmet", { kind: "ARMOR", weaponFamily: null, allowedSlots: ["helmet"] }),
  item("fixture-module-smg", {
    kind: "MODULE",
    weaponFamily: null,
    moduleGeneration: "NEW",
    compatibleWeaponFamilies: ["SMG"],
    allowedSuffixIds: ["fixture-suffix"],
  }),
  item("fixture-module-universal", {
    kind: "MODULE",
    weaponFamily: null,
    moduleGeneration: "NEW",
    compatibleWeaponFamilies: ["*"],
  }),
  item("fixture-module-unknown", { kind: "MODULE", weaponFamily: null, moduleGeneration: "NEW" }),
  item("fixture-module-legacy", {
    kind: "MODULE",
    weaponFamily: null,
    compatibleWeaponFamilies: ["SMG"],
  }),
  item("fixture-module-helmet", {
    kind: "MODULE",
    weaponFamily: null,
    moduleGeneration: "NEW",
    allowedSlots: ["helmet"],
    allowedSuffixIds: ["fixture-suffix"],
  }),
  item("fixture-muzzle-smg", {
    kind: "ACCESSORY",
    weaponFamily: null,
    accessorySlot: "muzzle",
    compatibleWeaponFamilies: ["SMG"],
  }),
  item("fixture-sight-sniper", {
    kind: "ACCESSORY",
    weaponFamily: null,
    accessorySlot: "sight",
    compatibleWeaponFamilies: ["SNIPER"],
  }),
  item("fixture-muzzle-unknown", {
    kind: "ACCESSORY",
    weaponFamily: null,
    accessorySlot: "muzzle",
  }),
  item("fixture-ammo-smg", { kind: "AMMO", weaponFamily: null, compatibleWeaponFamilies: ["SMG"] }),
  item("fixture-suffix", { kind: "MODULE_SUFFIX", weaponFamily: null, allowedSlots: [] }),
  item("fixture-unlinked-suffix", { kind: "MODULE_SUFFIX", weaponFamily: null, allowedSlots: [] }),
  item("fixture-deviant", {
    kind: "DEVIANT",
    weaponFamily: null,
    allowedSlots: ["combatDeviant"],
    allowedTraitIds: ["fixture-trait"],
  }),
  item("fixture-trait", {
    kind: "DEVIANT_TRAIT",
    weaponFamily: null,
    allowedSlots: ["combatDeviant"],
  }),
  item("fixture-unlinked-trait", {
    kind: "DEVIANT_TRAIT",
    weaponFamily: null,
    allowedSlots: ["combatDeviant"],
  }),
  item("fixture-cradle", {
    kind: "CRADLE",
    weaponFamily: null,
    allowedSlots: ["cradle-1", "cradle-2"],
  }),
  item("fixture-winter-cradle", {
    kind: "CRADLE",
    weaponFamily: null,
    allowedSlots: ["cradle-1"],
    scenarioKeys: ["WINTER"],
  }),
];

function snapshot(
  slots: GearSelection[] = [createGearSelection("primary", "fixture-smg")],
): PlannerGearLoadout {
  return { ...createEmptyGearLoadout(), slots };
}
const parse = (value: unknown) => parseGearLoadout(value, fixtures);

describe("Gear V2 shape and unknowns", () => {
  it("creates fresh empty snapshots without actual values or recommendation scores", () => {
    const first = createEmptyGearLoadout();
    const second = createEmptyGearLoadout();
    expect(parse(first)).toEqual(first);
    expect(first.schemaVersion).toBe(GEAR_SCHEMA_VERSION);
    expect(first.recommendation).toEqual({ rating: null, contents: [], tags: [], notes: "" });
    expect(Object.values(first.context)).toEqual([null, null, null, null, null]);
    first.recommendation.tags.push("changed");
    expect(second.recommendation.tags).toEqual([]);
  });

  it("never fabricates levels, traits, attachments, or damage from an icon selection", () => {
    const value = parse(snapshot());
    expect(value.slots[0]).toEqual(createGearSelection("primary", "fixture-smg"));
    expect(value).not.toHaveProperty("stats");
    expect(value).not.toHaveProperty("dps");
  });

  it("keeps recommendation rating distinct from actual deviant grades", () => {
    const deviant = createGearSelection("combatDeviant", "fixture-deviant");
    deviant.abilityGrade = 99;
    deviant.activityGrade = 2;
    deviant.level = 100;
    const value = snapshot([deviant]);
    value.recommendation.rating = 5;
    const parsed = parse(value);
    expect(parsed.slots[0].abilityGrade).toBe(99);
    expect(parsed.slots[0].activityGrade).toBe(2);
    expect(parsed.recommendation.rating).toBe(5);
  });

  it.each([0, -1, 101, 1.5, "5", Number.NaN, Infinity])(
    "rejects invalid recording levels without numeric coercion: %s",
    (number) => {
      const value = snapshot();
      Object.assign(value.slots[0], { level: number });
      expect(() => parse(value)).toThrow(z.ZodError);
    },
  );

  it.each([0, 6, 1.5, "4", Number.NaN])(
    "requires a discrete 1–5 recommendation score or null: %s",
    (number) => {
      const value = snapshot();
      Object.assign(value.recommendation, { rating: number });
      expect(() => parse(value)).toThrow(z.ZodError);
    },
  );

  it("normalizes hash/whitespace tags, preserves Korean labels, and deduplicates search metadata", () => {
    const value = snapshot();
    value.recommendation.tags = [" #  냉기   빌드 ", "냉기 빌드", "##Burn", "burn"];
    value.recommendation.contents = [" 레이드 ", "레이드", "Prime   War", "prime war"];
    const parsed = parse(value);
    expect(parsed.recommendation.tags).toEqual(["냉기 빌드", "Burn"]);
    expect(parsed.recommendation.contents).toEqual(["레이드", "Prime War"]);
    expect(value.recommendation.tags[0]).toBe(" #  냉기   빌드 ");
  });

  it("bounds tags/contents/notes and rejects empty normalized tags", () => {
    const value = snapshot();
    value.recommendation.tags = ["### "];
    expect(() => parse(value)).toThrow();
    value.recommendation.tags = Array.from({ length: 25 }, (_, index) => `tag ${index}`);
    expect(() => parse(value)).toThrow();
    value.recommendation.tags = [];
    value.recommendation.contents = Array.from({ length: 17 }, (_, index) => `content ${index}`);
    expect(() => parse(value)).toThrow();
    value.recommendation.contents = [];
    value.notes = "x".repeat(2001);
    expect(() => parse(value)).toThrow();
  });

  it.each(["role", "ownerId", "onceHumanUid", "uid", "source", "stats", "dps", "rarity"])(
    "rejects client-controlled extra %s fields",
    (key) => {
      expect(() => parse({ ...snapshot(), [key]: "forged" })).toThrow();
      const value = snapshot();
      Object.assign(value.slots[0], { [key]: "forged" });
      expect(() => parse(value)).toThrow();
    },
  );

  it("rejects non-JSON and raw oversized payloads", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => parse(cyclic)).toThrow(z.ZodError);
    expect(() => parse({ ...snapshot(), notes: " ".repeat(600_000) })).toThrow(/payload limit/);
  });

  it("does not mutate existing snapshots or gear selections", () => {
    const value = snapshot();
    const before = structuredClone(value);
    const parsed = parse(value);
    parsed.slots[0].level = 7;
    parsed.recommendation.tags.push("new");
    expect(value).toEqual(before);
  });
});

describe("Catalog slots and eligibility", () => {
  it("rejects unknown identities, direct modules, and wrong equipment slots", () => {
    expect(() => parse(snapshot([createGearSelection("primary", "unknown")]))).toThrow(/Unknown/);
    expect(() => parse(snapshot([createGearSelection("primary", "fixture-module-smg")]))).toThrow(
      /slot/,
    );
    expect(() => parse(snapshot([createGearSelection("mask", "fixture-helmet")]))).toThrow(/slot/);
  });

  it("rejects duplicate slots but does not invent a duplicate weapon-copy rule", () => {
    const weapon = createGearSelection("primary", "fixture-smg");
    expect(() => parse(snapshot([weapon, { ...weapon }]))).toThrow(/once/);
    expect(
      parse(snapshot([weapon, createGearSelection("secondary", "fixture-smg")])).slots,
    ).toHaveLength(2);
  });

  it("requires exact armor slots and item kind in selection helper", () => {
    expect(getEligibleGearItems("helmet", undefined, fixtures).map((item) => item.id)).toEqual([
      "fixture-helmet",
    ]);
    expect(getEligibleGearItems("mask", undefined, fixtures)).toEqual([]);
  });

  it("requires a known matching scenario for restricted items", () => {
    const value = snapshot([createGearSelection("cradle-1", "fixture-winter-cradle")]);
    expect(() => parse(value)).toThrow(/scenario/);
    value.context.scenarioKey = "MANIBUS";
    expect(() => parse(value)).toThrow(/scenario/);
    value.context.scenarioKey = "WINTER";
    expect(parse(value).slots).toHaveLength(1);
    expect(
      getEligibleGearItems("cradle-1", undefined, fixtures).some(
        (item) => item.id === "fixture-winter-cradle",
      ),
    ).toBe(false);
    expect(
      getEligibleGearItems("cradle-1", value.context, fixtures).some(
        (item) => item.id === "fixture-winter-cradle",
      ),
    ).toBe(true);
  });

  it("rejects repeating the same Cradle item in multiple UI positions", () => {
    expect(() =>
      parse(
        snapshot([
          createGearSelection("cradle-1", "fixture-cradle"),
          createGearSelection("cradle-2", "fixture-cradle"),
        ]),
      ),
    ).toThrow(/same Cradle/);
  });

  it("rejects non-applicable deviant grade/trait/Cradle level fields", () => {
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.abilityGrade = 4;
    expect(() => parse(snapshot([weapon]))).toThrow(/combat deviant/);
    const cradle = createGearSelection("cradle-1", "fixture-cradle");
    cradle.level = 1;
    expect(() => parse(snapshot([cradle]))).toThrow(/levels/);
  });
});

describe("Attachments and new modules", () => {
  it("accepts only matching accessory position, exact target slots, and sourced family", () => {
    const smg = createGearSelection("primary", "fixture-smg");
    smg.attachments.muzzle = "fixture-muzzle-smg";
    smg.attachments.ammo = "fixture-ammo-smg";
    expect(parse(snapshot([smg])).slots[0].attachments.ammo).toBe("fixture-ammo-smg");
    smg.attachments.sight = "fixture-muzzle-smg";
    expect(() => parse(snapshot([smg]))).toThrow(/incompatible/);
    smg.attachments.sight = "fixture-sight-sniper";
    expect(() => parse(snapshot([smg]))).toThrow(/incompatible/);
    expect(
      getEligibleGearAttachments("primary", "muzzle", "fixture-smg", undefined, fixtures).map(
        (item) => item.id,
      ),
    ).toEqual(["fixture-muzzle-smg"]);
  });

  it("never treats empty or missing weapon family compatibility as universal", () => {
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.attachments.muzzle = "fixture-muzzle-unknown";
    expect(() => parse(snapshot([weapon]))).toThrow(/incompatible/);
    const unknown = createGearSelection("primary", "fixture-unknown-weapon");
    unknown.attachments.module = "fixture-module-universal";
    expect(() => parse(snapshot([unknown]))).toThrow(/incompatible/);
    expect(
      getEligibleGearAttachments("primary", "module", unknown.itemId, undefined, fixtures),
    ).toEqual([]);
  });

  it("accepts an explicit universal family marker for a known weapon family", () => {
    const sniper = createGearSelection("secondary", "fixture-sniper");
    sniper.attachments.module = "fixture-module-universal";
    expect(parse(snapshot([sniper])).slots[0].attachments.module).toBe("fixture-module-universal");
  });

  it("uses exact item evidence without broadening it to other weapons in the same family", () => {
    const exactAmmo = item("fixture-exact-ammo", {
      kind: "AMMO",
      weaponFamily: null,
      compatibleWeaponFamilies: ["SMG"],
      compatibleItemIds: ["fixture-smg"],
    });
    const custom: GearCatalog = [...fixtures, item("fixture-other-smg"), exactAmmo];
    const matched = createGearSelection("primary", "fixture-smg");
    matched.attachments.ammo = exactAmmo.id;
    expect(parseGearLoadout(snapshot([matched]), custom).slots[0].attachments.ammo).toBe(
      exactAmmo.id,
    );
    const other = createGearSelection("primary", "fixture-other-smg");
    other.attachments.ammo = exactAmmo.id;
    expect(() => parseGearLoadout(snapshot([other]), custom)).toThrow(/incompatible/);
    expect(
      getEligibleGearAttachments("primary", "ammo", other.itemId, undefined, custom).some(
        (entry) => entry.id === exactAmmo.id,
      ),
    ).toBe(false);
  });

  it("accepts an exact item match with unknown family while retaining kind and slot checks", () => {
    const exactAmmo = item("fixture-exact-unknown-ammo", {
      kind: "AMMO",
      weaponFamily: null,
      compatibleItemIds: ["fixture-unknown-weapon"],
    });
    const custom: GearCatalog = [...fixtures, exactAmmo];
    const unknown = createGearSelection("primary", "fixture-unknown-weapon");
    unknown.attachments.ammo = exactAmmo.id;
    expect(parseGearLoadout(snapshot([unknown]), custom).slots[0].attachments.ammo).toBe(
      exactAmmo.id,
    );
    unknown.attachments.ammo = null;
    unknown.attachments.muzzle = exactAmmo.id;
    expect(() => parseGearLoadout(snapshot([unknown]), custom)).toThrow(/incompatible/);
    const wrongSlots = custom.map((entry) =>
      entry.id === exactAmmo.id ? { ...entry, allowedSlots: ["secondary"] as const } : entry,
    );
    unknown.attachments.muzzle = null;
    unknown.attachments.ammo = exactAmmo.id;
    expect(() => parseGearLoadout(snapshot([unknown]), wrongSlots)).toThrow(/incompatible/);
  });

  it("treats an explicit empty exact-item whitelist as rejection despite family allowances", () => {
    const custom: GearCatalog = [
      ...fixtures,
      item("fixture-exact-empty-ammo", {
        kind: "AMMO",
        weaponFamily: null,
        compatibleWeaponFamilies: ["*", "SMG"],
        compatibleItemIds: [],
      }),
    ];
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.attachments.ammo = "fixture-exact-empty-ammo";
    expect(() => parseGearLoadout(snapshot([weapon]), custom)).toThrow(/incompatible/);
  });

  it("respects exact-item constraints on armor modules before allowing their armor slot", () => {
    const custom = fixtures.map((entry) =>
      entry.id === "fixture-module-helmet" ? { ...entry, compatibleItemIds: [] } : entry,
    );
    const helmet = createGearSelection("helmet", "fixture-helmet");
    helmet.attachments.module = "fixture-module-helmet";
    expect(() => parseGearLoadout(snapshot([helmet]), custom)).toThrow(/incompatible/);
  });

  it("requires NEW module generation and rejects unknown family compatibility", () => {
    for (const moduleId of ["fixture-module-legacy", "fixture-module-unknown"]) {
      const weapon = createGearSelection("primary", "fixture-smg");
      weapon.attachments.module = moduleId;
      expect(() => parse(snapshot([weapon]))).toThrow(/incompatible/);
    }
  });

  it("validates armor modules by exact sourced armor slots without inventing a weapon family", () => {
    const helmet = createGearSelection("helmet", "fixture-helmet");
    helmet.attachments.module = "fixture-module-helmet";
    expect(parse(snapshot([helmet])).slots[0].attachments.module).toBe("fixture-module-helmet");
    expect(
      getEligibleGearAttachments("helmet", "module", helmet.itemId, undefined, fixtures).map(
        (item) => item.id,
      ),
    ).toEqual(["fixture-module-helmet"]);
    helmet.attachments.muzzle = "fixture-muzzle-smg";
    expect(() => parse(snapshot([helmet]))).toThrow(/incompatible/);
  });

  it("separates module suffix and level, rejects orphaned options and reserved top-level suffix", () => {
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.attachments.moduleLevel = 17;
    expect(() => parse(snapshot([weapon]))).toThrow(/require/);
    weapon.attachments.module = "fixture-module-smg";
    weapon.attachments.moduleSuffix = "fixture-suffix";
    expect(parse(snapshot([weapon])).slots[0].attachments.moduleLevel).toBe(17);
    weapon.attachments.moduleLevel = 18;
    expect(() => parse(snapshot([weapon]))).toThrow();
    weapon.attachments.moduleLevel = null;
    weapon.attachments.moduleSuffix = "fixture-unlinked-suffix";
    expect(() => parse(snapshot([weapon]))).toThrow(/suffix/);
    weapon.attachments.moduleSuffix = "fixture-suffix";
    weapon.suffixId = "fixture-suffix";
    expect(() => parse(snapshot([weapon]))).toThrow(/reserved/);
  });

  it("checks a suffix entity's kind instead of trusting an allowed ID string", () => {
    const custom = fixtures.map((entry) =>
      entry.id === "fixture-module-smg" ? { ...entry, allowedSuffixIds: ["fixture-trait"] } : entry,
    );
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.attachments.module = "fixture-module-smg";
    weapon.attachments.moduleSuffix = "fixture-trait";
    expect(() => parseGearLoadout(snapshot([weapon]), custom)).toThrow(/suffix/);
  });

  it("requires matching scenarios for attached items too", () => {
    const custom = fixtures.map((entry) =>
      entry.id === "fixture-module-smg" ? { ...entry, scenarioKeys: ["WINTER"] as const } : entry,
    );
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.attachments.module = "fixture-module-smg";
    expect(() => parseGearLoadout(snapshot([weapon]), custom)).toThrow(/incompatible/);
  });
});

describe("Combat deviant traits", () => {
  it("accepts only allowed trait IDs of the actual trait kind", () => {
    const deviant = createGearSelection("combatDeviant", "fixture-deviant");
    deviant.traitIds = ["fixture-trait"];
    expect(parse(snapshot([deviant])).slots[0].traitIds).toEqual(["fixture-trait"]);
    deviant.traitIds = ["fixture-unlinked-trait"];
    expect(() => parse(snapshot([deviant]))).toThrow(/Trait/);
    deviant.traitIds = ["fixture-trait", "fixture-trait"];
    expect(() => parse(snapshot([deviant]))).toThrow(/unique/);
  });

  it("does not permit equipment attachments on deviant or Cradle records", () => {
    const deviant = createGearSelection("combatDeviant", "fixture-deviant");
    deviant.attachments.module = "fixture-module-smg";
    expect(() => parse(snapshot([deviant]))).toThrow(/do not accept/);
    const cradle = createGearSelection("cradle-1", "fixture-cradle");
    cradle.attachments.ammo = "fixture-ammo-smg";
    expect(() => parse(snapshot([cradle]))).toThrow(/do not accept/);
  });
});

describe("Snapshot names and version preservation", () => {
  it("rebuilds selected names from the trusted catalog and ignores forged client labels", () => {
    const weapon = createGearSelection("primary", "fixture-smg");
    weapon.attachments.module = "fixture-module-smg";
    weapon.attachments.moduleSuffix = "fixture-suffix";
    const value = snapshot([weapon]);
    value.catalogNames = { "fixture-smg": "forged client label" };
    const parsed = parse(value);
    expect(parsed.catalogNames).toEqual({
      "fixture-module-smg": "Test-only fixture-module-smg",
      "fixture-smg": "Test-only fixture-smg",
      "fixture-suffix": "Test-only fixture-suffix",
    });
    expect(value.catalogNames).toEqual({ "fixture-smg": "forged client label" });
  });

  it("structurally reads removed catalog identities and preserves historical labels without strict-save approval", () => {
    const saved = parse(snapshot());
    const historical = structuredClone(saved);
    historical.slots[0].itemId = "retired-item";
    historical.catalogNames = { "retired-item": "Preserved previous name" };
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, historical)).toEqual(historical);
    expect(() => parse(historical)).toThrow(/Unknown/);
    const renamed = fixtures.map((item) =>
      item.id === "fixture-smg" ? { ...item, name: "New catalog name" } : item,
    );
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, saved)?.schemaVersion).toBe(
      GEAR_SCHEMA_VERSION,
    );
    expect(saved.catalogNames?.["fixture-smg"]).toBe("Test-only fixture-smg");
    expect(parseGearLoadout(saved, renamed).catalogNames?.["fixture-smg"]).toBe("New catalog name");
  });

  it("rejects unreferenced arbitrary keys or oversized saved names", () => {
    const value = snapshot();
    value.catalogNames = { ownerId: "private field" };
    expect(gearLoadoutSchema.safeParse(value).success).toBe(false);
    value.catalogNames = { "fixture-smg": "x".repeat(121) };
    expect(gearLoadoutSchema.safeParse(value).success).toBe(false);
  });

  it("reads legacy V1 alongside V2 and rejects mismatched or unknown row schema versions", () => {
    const v1 = createEmptyPlannerLoadout();
    expect(parseVersionedPlannerSnapshot(PLANNER_SCHEMA_VERSION, v1)).toEqual(v1);
    expect(
      parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, createEmptyGearLoadout())?.schemaVersion,
    ).toBe(GEAR_SCHEMA_VERSION);
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, v1)).toBeNull();
    expect(parseVersionedPlannerSnapshot("future-v99", v1)).toBeNull();
    expect(parseVersionedPlannerSnapshot(PLANNER_SCHEMA_VERSION, null)).toBeNull();
  });

  it("exposes a deeply frozen static catalog with no runtime data mutation", () => {
    expect(Object.isFrozen(GEAR_CATALOG)).toBe(true);
    for (const entry of GEAR_CATALOG) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.source)).toBe(true);
      expect(Object.isFrozen(entry.allowedSlots)).toBe(true);
      if (entry.compatibleItemIds !== undefined)
        expect(Object.isFrozen(entry.compatibleItemIds)).toBe(true);
      expect(entry.name.length).toBeLessThanOrEqual(120);
      expect(entry).not.toHaveProperty("dps");
      expect(entry).not.toHaveProperty("ownerId");
    }
  });
});
