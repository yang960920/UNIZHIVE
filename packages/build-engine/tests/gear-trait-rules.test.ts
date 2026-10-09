import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GEAR_CATALOG,
  GEAR_SCHEMA_VERSION,
  createEmptyGearLoadout,
  createGearSelection,
  type GearCatalog,
  type GearCatalogItem,
} from "../src/model/gear";
import { getGearTraitConflicts, getGearTraitSelectionConflict } from "../src/model/gear-traits";
import {
  parseGearLoadout,
  parseGearLoadoutForSave,
  parseVersionedPlannerSnapshot,
} from "../src/validation/gear";

function trait(id: string, overrides: Partial<GearCatalogItem> = {}): GearCatalogItem {
  return {
    id,
    name: `Test-only ${id}`,
    aliases: [],
    kind: "DEVIANT_TRAIT",
    allowedSlots: [],
    weaponFamily: null,
    compatibleWeaponFamilies: [],
    accessorySlot: null,
    moduleGeneration: null,
    allowedSuffixIds: [],
    allowedTraitIds: [],
    icon: null,
    rarity: null,
    description: "",
    setId: null,
    isKeyArmor: false,
    scenarioKeys: [],
    source: { url: null, evidence: "Synthetic test fixture", verifiedAt: "2026-10-07" },
    ...overrides,
  };
}

const traits: GearCatalog = [
  trait("energy-1", { traitIconGroup: "energy.png" }),
  trait("energy-2", { traitIconGroup: "energy.png", icon: "/different-export.png" }),
  trait("passive-1", { traitIconGroup: "passive.png" }),
  trait("shiny-1", { traitIconGroup: "passive.png", isDeviantShinyTrait: true }),
  trait("shiny-2", { traitIconGroup: "energy.png", isDeviantShinyTrait: true }),
  trait("fusion-animal", { traitIconGroup: "fusion.png", isDeviantShinyTrait: false }),
  trait("fusion-furniture", { traitIconGroup: "fusion.png", isDeviantShinyTrait: false }),
  trait("unknown-icon-1"),
  trait("unknown-icon-2"),
  trait("unlinked-trait", { traitIconGroup: "separate.png" }),
];
const fixtureCatalog: GearCatalog = [
  trait("fixture-deviant", {
    kind: "DEVIANT",
    allowedSlots: ["combatDeviant"],
    deviantType: "COMBAT",
    allowedTraitIds: traits.filter((item) => item.id !== "unlinked-trait").map((item) => item.id),
  }),
  ...traits,
  trait("non-trait", { kind: "FOOD", traitIconGroup: "energy.png", isDeviantShinyTrait: true }),
];

function snapshot(traitIds: string[], itemId = "fixture-deviant") {
  const value = createEmptyGearLoadout();
  const deviant = createGearSelection("combatDeviant", itemId);
  deviant.traitIds = [...traitIds];
  value.slots = [deviant];
  return value;
}

describe("deviant trait mutual exclusion", () => {
  it("groups exact source icons across names, levels, and exported icon variants", () => {
    expect(getGearTraitConflicts(["energy-1", "energy-2"], fixtureCatalog)).toEqual([
      { code: "DUPLICATE_ICON", traitIds: ["energy-1", "energy-2"], iconGroup: "energy.png" },
    ]);
    expect(getGearTraitSelectionConflict("energy-2", ["energy-1"], fixtureCatalog)).toEqual(
      getGearTraitConflicts(["energy-1", "energy-2"], fixtureCatalog)[0],
    );
  });

  it("limits shiny appearance to one even when its icons differ", () => {
    expect(getGearTraitConflicts(["shiny-1", "shiny-2"], fixtureCatalog)).toEqual([
      { code: "DUPLICATE_SHINY", traitIds: ["shiny-1", "shiny-2"] },
    ]);
    expect(getGearTraitSelectionConflict("shiny-2", ["shiny-1"], fixtureCatalog)?.code).toBe(
      "DUPLICATE_SHINY",
    );
  });

  it("reports both rules when shiny traits also share an icon and prioritizes the icon for selection", () => {
    const sameIconShiny = trait("shiny-3", {
      traitIconGroup: "passive.png",
      isDeviantShinyTrait: true,
    });
    const custom: GearCatalog = [...fixtureCatalog, sameIconShiny];
    expect(getGearTraitConflicts(["shiny-1", "shiny-3"], custom)).toEqual([
      { code: "DUPLICATE_ICON", traitIds: ["shiny-1", "shiny-3"], iconGroup: "passive.png" },
      { code: "DUPLICATE_SHINY", traitIds: ["shiny-1", "shiny-3"] },
    ]);
    expect(getGearTraitSelectionConflict("shiny-3", ["shiny-1"], custom)?.code).toBe(
      "DUPLICATE_ICON",
    );
  });

  it("allows appearance plus fusion, but animal and furniture fusion still share their icon limit", () => {
    expect(getGearTraitConflicts(["shiny-1", "fusion-animal"], fixtureCatalog)).toEqual([]);
    expect(getGearTraitConflicts(["fusion-animal", "fusion-furniture"], fixtureCatalog)).toEqual([
      {
        code: "DUPLICATE_ICON",
        traitIds: ["fusion-animal", "fusion-furniture"],
        iconGroup: "fusion.png",
      },
    ]);
  });

  it("does not infer a shiny flag from names or invent a common group for absent icons", () => {
    const custom: GearCatalog = [
      ...fixtureCatalog,
      trait("unflagged", { name: "역행하는 별-이로치", traitIconGroup: "independent.png" }),
    ];
    expect(getGearTraitConflicts(["shiny-1", "unflagged"], custom)).toEqual([]);
    expect(getGearTraitConflicts(["unknown-icon-1", "unknown-icon-2"], custom)).toEqual([]);
    expect(getGearTraitConflicts(["energy-1", "non-trait", "unknown-id"], custom)).toEqual([]);
  });

  it("normalizes legacy icon paths without altering trusted source groups", () => {
    const custom: GearCatalog = [
      trait("old-1", { icon: "  /game/trait.png?version=1 " }),
      trait("old-2", { icon: "\\game\\trait.png#legacy" }),
    ];
    expect(getGearTraitConflicts(["old-1", "old-2"], custom)).toEqual([
      { code: "DUPLICATE_ICON", traitIds: ["old-1", "old-2"], iconGroup: "/game/trait.png" },
    ]);
  });

  it("keeps a historical conflict editable and returns only candidate-specific conflicts", () => {
    const selected = ["energy-1", "energy-2"];
    expect(getGearTraitSelectionConflict("passive-1", selected, fixtureCatalog)).toBeNull();
    expect(getGearTraitSelectionConflict("energy-1", selected, fixtureCatalog)).toBeNull();
    expect(getGearTraitSelectionConflict("unknown-id", selected, fixtureCatalog)).toBeNull();
    expect(getGearTraitConflicts(["energy-1", "energy-1"], fixtureCatalog)).toEqual([]);
    expect(selected).toEqual(["energy-1", "energy-2"]);
  });
});

describe("trusted new-save trait guards and historical compatibility", () => {
  it("rejects duplicate icon and cross-icon shiny traits on new writes", () => {
    const iconConflict = snapshot(["energy-1", "energy-2"]);
    expect(() => parseGearLoadoutForSave(iconConflict, fixtureCatalog)).toThrow(z.ZodError);
    expect(() => parseGearLoadoutForSave(iconConflict, fixtureCatalog)).toThrow(/same icon/);
    expect(() => parseGearLoadoutForSave(snapshot(["shiny-1", "shiny-2"]), fixtureCatalog)).toThrow(
      /Only one shiny/,
    );
    expect(iconConflict.slots[0].traitIds).toEqual(["energy-1", "energy-2"]);
  });

  it("keeps conflicting historical snapshots readable and supports explicit removal then re-save", () => {
    const historical = parseGearLoadout(snapshot(["shiny-1", "shiny-2"]), fixtureCatalog);
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, historical)).toEqual(historical);
    historical.slots[0].traitIds = ["shiny-1", "fusion-furniture"];
    delete historical.catalogNames;
    expect(parseGearLoadoutForSave(historical, fixtureCatalog).slots[0].traitIds).toEqual([
      "shiny-1",
      "fusion-furniture",
    ]);
  });

  it("does not trust payload flags or snapshot names and preserves the exact parent whitelist", () => {
    const value = snapshot(["energy-1", "energy-2"]);
    value.catalogNames = { "energy-1": "Different icon", "energy-2": "No conflict" };
    expect(() => parseGearLoadoutForSave(value, fixtureCatalog)).toThrow(/same icon/);
    const forged = snapshot(["shiny-1", "shiny-2"]);
    Object.assign(forged.slots[0], { isDeviantShinyTrait: false, traitIconGroup: "unique" });
    expect(() => parseGearLoadoutForSave(forged, fixtureCatalog)).toThrow(z.ZodError);
    for (const id of ["unlinked-trait", "non-trait", "unknown-id"])
      expect(() => parseGearLoadoutForSave(snapshot([id]), fixtureCatalog)).toThrow(/Trait/);
  });
});

describe("game catalog user examples", () => {
  it.each([
    ["deviant-trait-400023", "deviant-trait-power-reversal-2"],
    ["deviant-trait-300114", "deviant-trait-300010"],
  ])("blocks same-icon traits %s and %s", (first, second) => {
    expect(getGearTraitSelectionConflict(second, [first], GEAR_CATALOG)?.code).toBe(
      "DUPLICATE_ICON",
    );
  });

  it("blocks 역행하는 별 plus 털실 저주물, despite different icons", () => {
    const value = snapshot(["deviant-trait-300114", "deviant-trait-400102"], "deviant-99000047");
    expect(getGearTraitConflicts(value.slots[0].traitIds)).toEqual([
      {
        code: "DUPLICATE_SHINY",
        traitIds: ["deviant-trait-300114", "deviant-trait-400102"],
      },
    ]);
    expect(() => parseGearLoadoutForSave(value)).toThrow(/Only one shiny/);
  });

  it("allows the photographed 라벤더 블루 plus 달빛 습격 combination", () => {
    const value = snapshot(
      ["deviant-trait-weakspot-master-lavender-blue", "deviant-trait-moonlight-ambush"],
      "deviant-butterfly",
    );
    expect(getGearTraitConflicts(value.slots[0].traitIds)).toEqual([]);
    expect(parseGearLoadoutForSave(value).slots[0].traitIds).toEqual(value.slots[0].traitIds);
  });
});
