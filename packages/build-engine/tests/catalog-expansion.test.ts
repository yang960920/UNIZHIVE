import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import expandedAssets from "../data/expanded-gear-asset-provenance.json";
import {
  GEAR_CATALOG,
  GEAR_SCHEMA_VERSION,
  createEmptyGearLoadout,
  createGearSelection,
  getEligibleGearAttachments,
  getEligibleGearItems,
  gearAttachmentFits,
  gearItemFitsSlot,
  type GearCatalogItem,
} from "../src/model/gear";
import {
  parseGearLoadout,
  parseGearLoadoutForSave,
  parseVersionedPlannerSnapshot,
} from "../src/validation/gear";

const byId = new Map(GEAR_CATALOG.map((item) => [item.id, item]));
const publicRoot = fileURLToPath(new URL("../../../apps/web/public/", import.meta.url));
const originalSaveIds = [
  "weapon-p90-holographic-resonance",
  "weapon-kukri",
  "armor-lonewolf-hood",
  "armor-lonewolf-jacket",
  "armor-lonewolf-pants",
  "armor-lonewolf-boots",
  "armor-lonewolf-gloves",
  "armor-lonewolf-mask",
  "armor-gilded-gauntlets",
  "armor-pirouette-boots",
  "module-icebreaker",
  "module-suffix-ability",
  "deviant-dr-teddy",
  "deviant-butterfly",
  "deviant-trait-power-reversal-2",
  "deviant-trait-weakspot-master-lavender-blue",
  "deviant-trait-moonlight-ambush",
  "accessory-compact-reflex-sight",
  "accessory-tactical-laser-sight",
  "ammo-medium-caliber-armor-piercing",
  "cradle-light-gear",
  "cradle-heavy-gear",
  "cradle-precision-gear",
  "cradle-tactical-combo",
  "cradle-unyielding",
  "cradle-deviation-defense",
  "cradle-critical-combo",
  "cradle-extreme-freeze",
  "accessory-tactical-flash-hider",
];
const variants = GEAR_CATALOG.filter((item) => item.kind === "MODULE" && !item.legacyOnly);
const snapshotWith = (slot: ReturnType<typeof createGearSelection>) => ({
  ...createEmptyGearLoadout(),
  slots: [slot],
});

describe("reviewed catalog expansion boundaries", () => {
  it("preserves all 29 original save identities and every referenced identity", () => {
    expect(byId.size).toBe(GEAR_CATALOG.length);
    originalSaveIds.forEach((id) => expect(byId.has(id), id).toBe(true));
    for (const item of GEAR_CATALOG) {
      item.allowedSuffixIds.forEach((id) => expect(byId.get(id)?.kind).toBe("MODULE_SUFFIX"));
      item.allowedTraitIds.forEach((id) => expect(byId.get(id)?.kind).toBe("DEVIANT_TRAIT"));
    }
  });

  it("imports all 1662 reviewed NEW variants with exact immutable variant metadata", () => {
    expect(variants).toHaveLength(1662);
    expect(new Set(variants.map((item) => item.sourceId)).size).toBe(1662);
    expect(new Set(variants.map((item) => item.id)).size).toBe(1662);
    for (const gearModule of variants) {
      expect(gearModule.moduleGeneration).toBe("NEW");
      expect(gearModule.sourceTable).toBe("new_mod_property_data");
      expect(typeof gearModule.moduleShiny).toBe("boolean");
      expect(gearModule.allowedSuffixIds).toEqual([gearModule.moduleSuffixId]);
      expect(byId.get(gearModule.moduleSuffixId!)?.kind).toBe("MODULE_SUFFIX");
      expect(gearModule).not.toHaveProperty("stats");
      expect(gearModule).not.toHaveProperty("highestOwnedLevel");
      expect(gearModule.knownOptions).toBeUndefined();
    }
  });

  it("keeps normal and shiny variants separate without manufacturing a recorded level", () => {
    const normal = byId.get("module-19500207")!;
    const shiny = byId.get("module-19505077")!;
    expect(normal.name).toBe("쇄빙<어빌리티>");
    expect(shiny.name).toBe(normal.name);
    expect(normal.moduleShiny).toBe(false);
    expect(shiny.moduleShiny).toBe(true);
    const p90 = createGearSelection("primary", "weapon-p90-holographic-resonance");
    p90.attachments.module = shiny.id;
    const parsed = parseGearLoadout(snapshotWith(p90));
    expect(parsed.slots[0].attachments.moduleLevel).toBeNull();
    expect(parsed.slots[0].attachments.moduleSuffix).toBeNull();
  });

  it("joins module item subtypes to melee and distinct heavy weapon equipment families", () => {
    const ranged = byId.get("module-19500207")!;
    const melee = byId.get("weapon-kukri")!;
    expect(melee.weaponFamily).toBe("MELEE");
    expect(gearAttachmentFits(ranged, "melee", "module", melee)).toBe(true);
    // These exact items all have inventory subtype 8, while their equipment arm types differ.
    for (const id of ["weapon-10810301", "weapon-10820401", "weapon-10800401"]) {
      const heavy = byId.get(id)!;
      expect(["ARM-TYPE-10", "ARM-TYPE-11"]).toContain(heavy.weaponFamily);
      expect(gearAttachmentFits(ranged, "primary", "module", heavy)).toBe(true);
      expect(gearAttachmentFits(byId.get("module-icebreaker")!, "primary", "module", heavy)).toBe(
        true,
      );
    }
    expect(
      gearAttachmentFits(ranged, "primary", "module", {
        ...byId.get("weapon-p90-holographic-resonance")!,
        weaponFamily: "UNVERIFIED-WEAPON-FAMILY",
      }),
    ).toBe(false);
    expect(
      gearAttachmentFits(
        ranged,
        "primary",
        "module",
        byId.get("weapon-p90-holographic-resonance")!,
      ),
    ).toBe(true);
  });

  it("offers all 368 reviewed general weapon variants on each of the 18 melee weapons", () => {
    const weaponModules = variants.filter((item) => item.allowedSlots.includes("primary"));
    expect(weaponModules).toHaveLength(368);
    expect(weaponModules.filter((item) => !item.moduleShiny)).toHaveLength(184);
    expect(weaponModules.filter((item) => item.moduleShiny)).toHaveLength(184);
    const weapons = getEligibleGearItems("melee");
    expect(weapons).toHaveLength(18);
    for (const weapon of weapons) {
      const eligible = getEligibleGearAttachments("melee", "module", weapon.id);
      expect(eligible.map((item) => item.id)).toEqual(weaponModules.map((item) => item.id));
      expect(eligible.every((item) => item.compatibleWeaponFamilies.includes("MELEE"))).toBe(true);
      expect(getEligibleGearAttachments("melee", "ammo", weapon.id)).toEqual([]);
      expect(getEligibleGearAttachments("melee", "sight", weapon.id)).toEqual([]);
    }
    const suffixes = GEAR_CATALOG.filter((item) => item.kind === "MODULE_SUFFIX");
    expect(suffixes.filter((item) => item.allowedSlots.includes("melee"))).toHaveLength(14);
    for (const gearModule of weaponModules) {
      expect(byId.get(gearModule.moduleSuffixId!)?.allowedSlots).toContain("melee");
    }
    expect(
      variants
        .filter((item) => !item.allowedSlots.includes("primary"))
        .some((item) => item.allowedSlots.includes("melee")),
    ).toBe(false);
  });

  it("saves melee modules and proven suffixes while rejecting armor modules and incorrect suffixes", () => {
    const melee = createGearSelection("melee", "weapon-kukri");
    melee.attachments.module = "module-19500207";
    expect(parseGearLoadoutForSave(snapshotWith(melee)).slots[0].attachments).toEqual(
      melee.attachments,
    );
    melee.attachments.moduleSuffix = "module-suffix-ability";
    melee.attachments.moduleLevel = 13;
    expect(parseGearLoadoutForSave(snapshotWith(melee)).slots[0].attachments.moduleLevel).toBe(13);
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, snapshotWith(melee))).not.toBeNull();
    melee.attachments.moduleSuffix = "module-suffix-frame-1";
    expect(() => parseGearLoadoutForSave(snapshotWith(melee))).toThrow(/suffix/);
    const armorModule = variants.find((item) => item.allowedSlots.includes("gloves"))!;
    melee.attachments.module = armorModule.id;
    melee.attachments.moduleSuffix = null;
    melee.attachments.moduleLevel = null;
    expect(() => parseGearLoadoutForSave(snapshotWith(melee))).toThrow(/incompatible/);
  });

  it("keeps armor modules on their exact equipment slots and validates fixed suffixes", () => {
    const helmetModule = variants.find((item) => item.allowedSlots.includes("helmet"))!;
    const hood = createGearSelection("helmet", "armor-lonewolf-hood");
    hood.attachments.module = helmetModule.id;
    hood.attachments.moduleSuffix = helmetModule.moduleSuffixId!;
    expect(parseGearLoadout(snapshotWith(hood)).slots[0].attachments.moduleLevel).toBeNull();
    const wrongSuffix = GEAR_CATALOG.find(
      (item) => item.kind === "MODULE_SUFFIX" && item.id !== helmetModule.moduleSuffixId,
    )!;
    hood.attachments.moduleSuffix = wrongSuffix.id;
    expect(() => parseGearLoadout(snapshotWith(hood))).toThrow(/suffix/);
    expect(
      gearAttachmentFits(
        helmetModule,
        "mask",
        "module",
        GEAR_CATALOG.find((item) => item.kind === "ARMOR" && item.allowedSlots.includes("mask"))!,
      ),
    ).toBe(false);
  });

  it("resolves the observed name/slot conflict through the exact equip row and excludes debug/base NPC candidates", () => {
    const corrected = byId.get("armor-23000801")!;
    expect(corrected.name).toBe("레니게이드 하의");
    expect(corrected.allowedSlots).toEqual(["bottom"]);
    expect(corrected.aliases).toContain("레니게이드 신발");
    expect(
      GEAR_CATALOG.some((item) =>
        ["25310601", "22302299", "10561199", "10361199"].includes(item.sourceId ?? ""),
      ),
    ).toBe(false);
    expect(getEligibleGearItems("primary")).toHaveLength(67); // 85 equipment items minus 18 actual melee blueprints.
    expect(getEligibleGearItems("helmet").length).toBeGreaterThan(0);
  });

  it("records 25 modern Cradles, while preserving older selected identities without claiming scenario availability", () => {
    const available = getEligibleGearItems("cradle-1");
    expect(available).toHaveLength(25);
    expect(new Set(available.map((item) => item.sourceId)).size).toBe(25);
    for (const item of available) {
      expect(item.sourceTable).toBe("cradle_override_entry_data");
      expect(item.scenarioKeys).toEqual([]);
      expect(item.source.evidence).toContain("현재 세계");
      expect(item.description).not.toContain("현대 크래들 설정");
    }
    expect(getEligibleGearItems("cradle-1").some((item) => item.id === "cradle-light-gear")).toBe(
      false,
    );
    expect(
      parseGearLoadout(snapshotWith(createGearSelection("cradle-1", "cradle-light-gear"))).slots[0]
        .itemId,
    ).toBe("cradle-light-gear");
  });

  it("corrects combat Butterfly identity without aliasing territory Rebecca or rewriting old name snapshots", () => {
    const butterfly = byId.get("deviant-butterfly")!;
    expect(butterfly.name).toBe("나비");
    expect(butterfly.sourceId).toBe("99900001");
    expect(butterfly.correctedNames).toEqual(["나비의꿈", "나비의 꿈"]);
    expect(Object.isFrozen(butterfly.correctedNames)).toBe(true);
    expect(butterfly.aliases.some((alias) => alias.replace(/\s+/g, "") === "나비의꿈")).toBe(false);
    const historical = snapshotWith(createGearSelection("combatDeviant", butterfly.id));
    historical.catalogNames = { [butterfly.id]: "나비의 꿈" };
    const read = parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, historical);
    expect(
      read?.schemaVersion === GEAR_SCHEMA_VERSION ? read.catalogNames?.[butterfly.id] : null,
    ).toBe("나비의 꿈");
    expect(parseGearLoadout(historical).catalogNames?.[butterfly.id]).toBe("나비");
    expect(getEligibleGearItems("combatDeviant")).toHaveLength(23);
    expect(
      GEAR_CATALOG.some((item) => item.kind === "DEVIANT" && item.sourceId === "99000031"),
    ).toBe(false);
  });

  it("accepts proven common and fusion traits while preserving species-specific appearances and shared category icons", () => {
    const butterfly = byId.get("deviant-butterfly")!;
    const teddy = byId.get("deviant-dr-teddy")!;
    const photoTraits = [
      "deviant-trait-power-reversal-2",
      "deviant-trait-weakspot-master-lavender-blue",
      "deviant-trait-moonlight-ambush",
    ];
    photoTraits.forEach((id) => expect(butterfly.allowedTraitIds).toContain(id));
    expect(teddy.allowedTraitIds).toContain("deviant-trait-power-reversal-2");
    expect(teddy.allowedTraitIds).not.toContain("deviant-trait-weakspot-master-lavender-blue");
    expect(teddy.allowedTraitIds).toContain("deviant-trait-moonlight-ambush");
    const selection = createGearSelection("combatDeviant", teddy.id);
    selection.traitIds = ["deviant-trait-power-reversal-2"];
    expect(parseGearLoadout(snapshotWith(selection)).slots[0].traitIds).toEqual(selection.traitIds);
    selection.traitIds = ["deviant-trait-weakspot-master-lavender-blue"];
    expect(() => parseGearLoadout(snapshotWith(selection))).toThrow(/Trait/);
    for (const trait of GEAR_CATALOG.filter((item) => item.kind === "DEVIANT_TRAIT")) {
      expect(trait.icon).toMatch(/\/fusion_c(?:bt|tb)2_icon_attribute\d+\.png$/);
      expect(trait.source.evidence).toContain("공유");
      expect(trait.description.trim().length).toBeGreaterThan(0);
    }
    const territory = { ...teddy, deviantType: "TERRITORY" } as GearCatalogItem;
    expect(gearItemFitsSlot(territory, "combatDeviant")).toBe(false);
  });

  it("keeps the original module+suffix+level13 configuration saveable without exposing generic legacy modules as new choices", () => {
    const p90 = createGearSelection("primary", "weapon-p90-holographic-resonance");
    p90.attachments.module = "module-icebreaker";
    p90.attachments.moduleSuffix = "module-suffix-ability";
    p90.attachments.moduleLevel = 13;
    expect(parseGearLoadout(snapshotWith(p90)).slots[0].attachments.moduleLevel).toBe(13);
    expect(
      getEligibleGearAttachments("primary", "module", p90.itemId).some(
        (item) => item.id === "module-icebreaker",
      ),
    ).toBe(false);
    p90.attachments.moduleLevel = null;
    expect(parseGearLoadout(snapshotWith(p90)).slots[0].attachments.moduleLevel).toBeNull();
  });
});

describe("expanded native icon evidence", () => {
  it("has one requested key per path, portable native paths, and exact catalog references", () => {
    expect(new Set(expandedAssets.map((asset) => asset.publicPath)).size).toBe(
      expandedAssets.length,
    );
    expect(new Set(expandedAssets.map((asset) => asset.key)).size).toBe(expandedAssets.length);
    for (const asset of expandedAssets) {
      expect(asset.publicPath).toBe(`/game/catalog/${asset.key}.png`);
      expect(asset.internalPath).toMatch(/^ui\/.+\.pvr$/);
      expect(asset.internalPath.split("/")).not.toContain("..");
      expect(asset.archive).toMatch(/^res_(?:global-)?normal_pack_\d+\.npk$/);
      expect(Number.isInteger(asset.index)).toBe(true);
      expect(path.posix.basename(asset.internalPath)).toBe(`${asset.key}.pvr`);
      expect(asset.pixelRoundtripVerified).toBe(true);
      asset.catalogItems.forEach((reference) => {
        expect(byId.get(reference.id)?.icon).toBe(asset.publicPath);
        expect(byId.get(reference.id)?.name).toBe(reference.name);
      });
    }
  });

  it("checks every served PNG against its native conversion hash, dimensions and alpha bounds", () => {
    for (const asset of expandedAssets) {
      const target = path.resolve(publicRoot, asset.publicPath.slice(1));
      expect(target.startsWith(path.resolve(publicRoot, "game/catalog") + path.sep)).toBe(true);
      const bytes = readFileSync(target);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(asset.width);
      expect(bytes.readUInt32BE(20)).toBe(asset.height);
      expect(bytes[25]).toBe(6);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.pngSha256);
      expect(asset.storedSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.pvrSha256).toMatch(/^[a-f0-9]{64}$/);
      const [left, top, right, bottom] = asset.alphaBounds;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(asset.nativeWidth);
      expect(bottom).toBeLessThanOrEqual(asset.nativeHeight);
      expect(right).toBeGreaterThan(left);
      expect(bottom).toBeGreaterThan(top);
      if (asset.transparentPaddingTrimmed) {
        expect(asset.width).toBe(right - left);
        expect(asset.height).toBe(bottom - top);
      }
      if (!asset.transparentPaddingTrimmed) {
        expect(asset.width).toBe(asset.nativeWidth);
        expect(asset.height).toBe(asset.nativeHeight);
      }
    }
  });
});
