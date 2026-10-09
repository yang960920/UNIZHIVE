import { describe, expect, it } from "vitest";
import enrichment from "../data/gear-trait-cradle-enrichment.json";
import expandedAssets from "../data/expanded-gear-asset-provenance.json";
import { GEAR_CATALOG, createEmptyGearLoadout, createGearSelection } from "../src/model/gear";
import { parseGearLoadout } from "../src/validation/gear";

const byId = new Map(GEAR_CATALOG.map((item) => [item.id, item]));

describe("source-proven ordinary traits and actual Cradle tooltip effects", () => {
  it("makes ordinary energy/activity/combat traits usable on Voodoo Doll without leaking another appearance", () => {
    const doll = byId.get("deviant-99000047")!;
    expect(doll.allowedTraitIds).toHaveLength(113);
    const selected = createGearSelection("combatDeviant", doll.id);
    selected.traitIds = ["deviant-trait-400001", "deviant-trait-400017", "deviant-trait-300010"];
    const snapshot = createEmptyGearLoadout();
    snapshot.slots = [selected];
    expect(parseGearLoadout(snapshot).slots[0].traitIds).toEqual(selected.traitIds);
    expect(byId.get("deviant-trait-400001")?.description).toBe("최대 트랜스 에너지 15% 증가");
    expect(byId.get("deviant-trait-400017")?.description).toBe("활약도 회복 속도 25% 증가");
    expect(byId.get("deviant-trait-300010")?.description).toContain("총기 대미지+5%");
    selected.traitIds = ["deviant-trait-weakspot-master-lavender-blue"];
    expect(() => parseGearLoadout(snapshot)).toThrow(/Trait/);
  });

  it("imports only positive-weight ordinary pools with an actual base relation and preserves the captured common identity", () => {
    const ordinary = enrichment.traits.filter((row) => row.classification !== "APPEARANCE_LINKED");
    expect(ordinary.filter((row) => row.typeCode === 3)).toHaveLength(19);
    expect(ordinary.filter((row) => row.typeCode === 4)).toHaveLength(30);
    expect(enrichment.summary.newlyAddedTraits).toBe(48);
    expect(ordinary.find((row) => row.sourceId === "400012")?.id).toBe(
      "deviant-trait-power-reversal-2",
    );
    for (const row of ordinary) {
      expect(row.allowedDeviantIds).toHaveLength(23);
      for (const evidence of row.evidence) {
        expect(evidence.kind).toBe("POSITIVE_WEIGHT_COMBAT_OR_COMMON_POOL");
        if ("weight" in evidence) {
          expect(evidence.weight).toBeGreaterThan(0);
          expect(evidence.libraryId).toBe(0);
          expect(evidence.poolType).toBe(row.typeCode);
          expect(Object.values(evidence.qualityDict!)).toContain(2);
        }
      }
    }
    // Active-skill fusion records and unrelated type labels are not trait permissions.
    expect(byId.has("deviant-trait-800011")).toBe(false);
    expect(byId.has("deviant-trait-100001")).toBe(false);
    // Direct fusion recipes now prove this permission beyond the original Butterfly capture.
    expect(byId.get("deviant-dr-teddy")?.allowedTraitIds).toContain(
      "deviant-trait-moonlight-ambush",
    );
    expect(byId.get("deviant-butterfly")?.allowedTraitIds).toContain(
      "deviant-trait-moonlight-ambush",
    );
  });

  it("shows exact numerical effects for all current Cradles instead of provenance placeholders", () => {
    expect(enrichment.cradles).toHaveLength(25);
    for (const row of enrichment.cradles) {
      const item = byId.get(row.id)!;
      expect(item.description).toBe(row.description);
      expect(item.description).toMatch(/[가-힣]/);
      expect(item.description).not.toMatch(/\{\d+\}|기록 옵션|현대 크래들 설정/);
      expect(row.evidence.buffLevel).toBe(1);
      expect(row.evidence.fallbackTable).toBe("buff_level_data");
    }
    expect(byId.get("cradle-tactical-combo")?.description).toBe(
      "장전 또는 총기 교체 후, 총기 대미지+15%, 4초간 지속",
    );
    expect(byId.get("cradle-unyielding")?.description).toBe(
      "실드가 몬스터로부터 받는 대미지 감소 30%",
    );
    expect(byId.get("cradle-5011")?.description).toBe(
      "밤(21시~3시)에 감염물의 트랜스 에너지 8초마다 1 회복",
    );
    expect(byId.get("cradle-5119")?.description).toContain("크리티컬 확률+3%");
    expect(byId.get("cradle-5119")?.description).toContain("크리티컬 대미지+8%");
  });

  it("reuses the exact native category glyphs for every new trait and retains the original photo IDs", () => {
    const assets = new Map(expandedAssets.map((row) => [row.publicPath, row]));
    expect(expandedAssets).toHaveLength(343);
    for (const row of enrichment.traits) {
      const item = byId.get(row.id)!;
      expect(item.sourceId).toBe(row.sourceId);
      expect(item.icon).toBe(row.icon);
      expect(assets.get(row.icon!)?.catalogItems.map((reference) => reference.id)).toContain(
        row.id,
      );
      expect(item.description).not.toMatch(/\{num\d+\}/);
      for (const ownerId of row.allowedDeviantIds)
        expect(byId.get(ownerId)?.allowedTraitIds).toContain(item.id);
    }
    expect(GEAR_CATALOG.filter((item) => item.kind === "DEVIANT_TRAIT")).toHaveLength(171);
    expect(byId.has("deviant-trait-power-reversal-2")).toBe(true);
    expect(byId.has("deviant-trait-weakspot-master-lavender-blue")).toBe(true);
    expect(byId.has("deviant-trait-moonlight-ambush")).toBe(true);
  });
});
