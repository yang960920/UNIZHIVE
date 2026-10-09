import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GEAR_ARMOR_SETS,
  GEAR_CATALOG,
  GEAR_SCHEMA_VERSION,
  canSelectGearArmor,
  countGearKeyArmors,
  createEmptyGearLoadout,
  createGearSelection,
  getGearArmorSet,
  getGearKeyArmorSelections,
  type GearCatalogItem,
} from "../src/model/gear";
import {
  parseGearLoadout,
  parseGearLoadoutForSave,
  parseVersionedPlannerSnapshot,
} from "../src/validation/gear";
import evidence from "./fixtures/armor-reference-evidence.json";
import { applyArmorEnrichmentToItems } from "./fixtures/apply-armor-enrichment";

const items = new Map(GEAR_CATALOG.map((item) => [item.id, item]));

describe("exact armor classifications and set descriptions", () => {
  it("classifies all selected armor origins using the exact game golden-armor constant", () => {
    expect(evidence.classification).toMatchObject({ constant: "EQUIP_SUIT_GOLDEN_TYPE", value: 3 });
    const selected = GEAR_CATALOG.filter((item) => item.kind === "ARMOR" && !item.legacyOnly);
    expect(evidence.armorProofs).toHaveLength(selected.length);
    expect(selected).toHaveLength(181);
    expect(selected.filter((item) => item.isKeyArmor)).toHaveLength(39);
    expect(evidence.armorProofs.filter((proof) => proof.suitType === 1)).toHaveLength(137);
    expect(evidence.armorProofs.filter((proof) => proof.suitType === 2)).toHaveLength(5);
    expect(new Set(evidence.armorProofs.map((proof) => proof.catalogId)).size).toBe(181);
    for (const proof of evidence.armorProofs) {
      expect(proof.isKeyArmor).toBe(proof.suitType === 3);
      expect(items.get(proof.catalogId)?.isKeyArmor).toBe(proof.isKeyArmor);
    }
    expect(items.get("armor-24011101")?.isKeyArmor).toBe(true); // 트레킹 가죽 부츠
    expect(items.get("armor-21011799")?.isKeyArmor).toBe(false); // 일반 감시자 헬멧
    expect(items.get("armor-21000901")?.isKeyArmor).toBe(false); // 세이버 세트
  });

  it("resolves every selected set and groups both historical wolf IDs under one definition", () => {
    expect(GEAR_ARMOR_SETS).toHaveLength(24);
    expect(GEAR_ARMOR_SETS.flatMap((set) => set.effects)).toHaveLength(94);
    expect(getGearArmorSet("lonewolf")).toBe(getGearArmorSet("set-1007"));
    expect(getGearArmorSet(null)).toBeUndefined();
    expect(getGearArmorSet("unknown-old-set")).toBeUndefined();
    for (const item of GEAR_CATALOG.filter((item) => item.kind === "ARMOR" && item.setId))
      expect(getGearArmorSet(item.setId), item.id).toBeDefined();
    for (const set of GEAR_ARMOR_SETS) {
      expect(Object.isFrozen(set)).toBe(true);
      expect(Object.isFrozen(set.effects)).toBe(true);
      expect(new Set(set.effects.map((effect) => effect.pieces)).size).toBe(set.effects.length);
      for (const effect of set.effects) {
        expect(effect.status).toBe("VERIFIED_LOCAL_STATIC");
        expect(effect.description).toMatch(/[가-힣]|^HP\+\d+$/);
        expect(effect.description).not.toMatch(/\{\d+\}|#\[|#l/);
        expect(evidence.effectProofs).toContainEqual(
          expect.objectContaining({
            sourceId: set.sourceId,
            pieces: effect.pieces,
            description: effect.description,
          }),
        );
      }
    }
  });

  it("re-applies reviewed armor metadata offline without changing non-armor entries or accepting a different source ID", () => {
    const rebuilt = structuredClone(GEAR_CATALOG) as GearCatalogItem[];
    const untouched = structuredClone(rebuilt.filter((item) => item.kind !== "ARMOR"));
    for (const item of rebuilt.filter((entry) => entry.kind === "ARMOR" && !entry.legacyOnly)) {
      item.isKeyArmor = false;
      delete item.displayName;
    }
    expect(applyArmorEnrichmentToItems(rebuilt)).toEqual({ reviewedArmors: 181, keyArmors: 39 });
    expect(rebuilt.filter((item) => item.kind !== "ARMOR")).toEqual(untouched);
    expect(rebuilt.find((item) => item.id === "armor-24011101")?.isKeyArmor).toBe(true);
    expect(rebuilt.find((item) => item.id === "armor-21000901")?.displayName).toBe("세이버 후드");
    rebuilt.find((item) => item.id === "armor-24011101")!.sourceId = "different-origin";
    expect(() => applyArmorEnrichmentToItems(rebuilt)).toThrow(
      "Exact armor source identity mismatch",
    );
  });

  it("substitutes exact missing buff text rather than copying empty descriptions or placeholders", () => {
    const fallen = getGearArmorSet("set-1035")!;
    expect(fallen.effects.find((effect) => effect.pieces === 2)?.description).toBe(
      "HP가 70% 미만일 때, 총기 및 트랜스 대미지 +12%",
    );
    expect(fallen.effects.find((effect) => effect.pieces === 4)?.description).toContain(
      "쿨타임: 8초",
    );
    expect(
      getGearArmorSet("set-1037")?.effects.find((effect) => effect.pieces === 3)?.description,
    ).toContain("+0.6%");
    expect(
      getGearArmorSet("set-1031")?.effects.find((effect) => effect.pieces === 2)?.description,
    ).toContain("1스택");
    expect(getGearArmorSet("set-1014")?.effects.map((effect) => effect.pieces)).toEqual([1, 2, 3]);
  });

  it("shows game-facing wolf and savior names while keeping stable source names and aliases", () => {
    const wolf = items.get("armor-lonewolf-hood")!;
    expect(wolf.name).toBe("고독한 늑대 모자");
    expect(wolf.displayName).toBe("울프 후드");
    expect(wolf.aliases).toEqual(
      expect.arrayContaining(["고독한 늑대 모자", "울프 후드", "울프 세트"]),
    );
    expect(items.get("armor-21000901")?.displayName).toBe("세이버 후드");
    expect(getGearArmorSet("lonewolf")?.displayName).toBe("울프 세트");
    expect(getGearArmorSet("set-1009")?.displayName).toBe("세이버 세트");
  });
});

describe("key armor selection and new-save guard", () => {
  const gloves = createGearSelection("gloves", "armor-gilded-gauntlets");
  const boots = createGearSelection("shoes", "armor-24011101");
  const ordinary = createGearSelection("helmet", "armor-21011799");

  it("counts real armor slots and permits same-slot replacement without silent removal", () => {
    expect(countGearKeyArmors([gloves, ordinary])).toBe(1);
    expect(getGearKeyArmorSelections([gloves, boots])).toEqual([gloves, boots]);
    expect(canSelectGearArmor(items.get(boots.itemId)!, "shoes", [gloves])).toBe(false);
    expect(canSelectGearArmor(items.get("armor-24011401")!, "shoes", [boots])).toBe(true);
    expect(canSelectGearArmor(items.get(ordinary.itemId)!, "helmet", [gloves])).toBe(true);
    expect(canSelectGearArmor(items.get(boots.itemId)!, "gloves", [])).toBe(false);
    expect(countGearKeyArmors([createGearSelection("primary", gloves.itemId)])).toBe(0);
    expect(countGearKeyArmors([createGearSelection("gloves", "unknown-old-key-armor")])).toBe(0);
  });

  it("rejects two key armors on new writes while preserving historical reading and snapshot labels", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots = [gloves, boots];
    const historical = parseGearLoadout(loadout);
    expect(parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, historical)).toEqual(historical);
    expect(() => parseGearLoadoutForSave(historical)).toThrow(z.ZodError);
    expect(() => parseGearLoadoutForSave(historical)).toThrow(
      "Only one key armor can be equipped at a time.",
    );
    expect(historical.slots).toEqual([gloves, boots]);
    loadout.slots = [boots, ordinary];
    expect(parseGearLoadoutForSave(loadout).slots).toEqual([boots, ordinary]);
  });
});
