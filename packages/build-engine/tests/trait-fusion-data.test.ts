import { describe, expect, it } from "vitest";
import fusion from "../data/gear-trait-fusion-enrichment.json";
import expandedAssets from "../data/expanded-gear-asset-provenance.json";
import { GEAR_CATALOG } from "../src/model/gear";

const byId = new Map(GEAR_CATALOG.map((item) => [item.id, item]));
const bySource = new Map(
  GEAR_CATALOG.filter((item) => item.kind === "DEVIANT").map((item) => [item.sourceId, item]),
);

describe("reviewed fusion material identities and source trait classification", () => {
  it("classifies every trait by the original glyph and marks only explicit original skin links as shiny", () => {
    const traits = GEAR_CATALOG.filter((item) => item.kind === "DEVIANT_TRAIT");
    expect(traits).toHaveLength(171);
    expect(fusion.traitMetadata).toHaveLength(traits.length);
    for (const item of traits) {
      const metadata = fusion.traitMetadata.find((row) => row.id === item.id)!;
      expect(metadata, item.id).toBeDefined();
      expect(item.sourceId).toBe(metadata.sourceId);
      expect(item.traitIconGroup).toBe(metadata.traitIconGroup);
      expect(item.traitIconGroup).toMatch(/^fusion_c(?:bt|tb)2_icon_attribute\d+\.png$/);
      expect(item.isDeviantShinyTrait).toBe(metadata.isDeviantShinyTrait);
      if (item.isDeviantShinyTrait) {
        expect(metadata.skinProofs.length).toBeGreaterThan(0);
        for (const proof of metadata.skinProofs) {
          expect(proof.traitExists && proof.baseExists && proof.skinExists).toBe(true);
          expect(proof.skinOwnerId).toBe(proof.baseId);
          expect(String(proof.traitId)).toBe(item.sourceId);
        }
        for (const owner of bySource.values()) {
          if (owner.allowedTraitIds.includes(item.id)) {
            expect(
              metadata.skinProofs.some((proof) => String(proof.baseId) === owner.sourceId),
              `${item.id} original shiny owner ${owner.id}`,
            ).toBe(true);
          }
        }
      }
    }
    expect(byId.get("deviant-trait-weakspot-master-lavender-blue")?.isDeviantShinyTrait).toBe(true);
    expect(byId.get("deviant-trait-moonlight-ambush")?.isDeviantShinyTrait).toBe(false);
    expect(byId.get("deviant-trait-300114")?.isDeviantShinyTrait).toBe(true);
    expect(byId.get("deviant-trait-400102")?.isDeviantShinyTrait).toBe(true);
    expect(byId.get("deviant-trait-400023")?.traitIconGroup).toBe(
      byId.get("deviant-trait-power-reversal-2")?.traitIconGroup,
    );
    expect(byId.get("deviant-trait-300114")?.traitIconGroup).toBe(
      byId.get("deviant-trait-300010")?.traitIconGroup,
    );
  });

  it("preserves 52 distinct furniture identities and searchable actual materials across 11 effects", () => {
    const furniture = fusion.fusionTraits.filter((row) => row.typeCode === 11);
    expect(furniture).toHaveLength(52);
    expect(new Set(furniture.map((row) => row.sourceId)).size).toBe(52);
    expect(new Set(furniture.map((row) => row.name)).size).toBe(11);
    expect(
      new Set(furniture.flatMap((row) => row.materials.map((material) => material.id))).size,
    ).toBe(52);
    const flash = furniture.filter((row) => row.name === "번뜩");
    expect(flash).toHaveLength(19);
    expect(new Set(flash.map((row) => row.id)).size).toBe(19);
    for (const row of furniture) {
      const item = byId.get(row.id)!;
      expect(item.sourceId).toBe(row.sourceId);
      expect(item.isDeviantShinyTrait).toBe(false);
      expect(item.traitFusionMaterialType).toBe("FURNITURE");
      expect(item.traitIconGroup).toBe("fusion_ctb2_icon_attribute13.png");
      expect(item.traitFusionMaterialNames).toEqual([
        ...new Set(row.materials.map((material) => material.name)),
      ]);
      for (const material of row.materials) expect(item.aliases).toContain(material.name);
    }
    expect(byId.get("deviant-trait-11510103")?.aliases).toContain("원형 샹들리에");
    expect(byId.get("deviant-trait-11510107")?.aliases).toContain("벽시계");
    expect(byId.get("deviant-trait-1100011")?.aliases).toContain("탁상용 전자시계");
    expect(byId.get("deviant-trait-1100009")?.traitFusionMaterialNames).toEqual(["종이 박스 - I"]);
    expect(byId.get("deviant-trait-11550115")?.traitFusionMaterialNames).toEqual([
      "종이 박스 - II",
    ]);
  });

  it("separates direct body recipes from proven cross-base inheritance and reuses the captured Moonlight ID", () => {
    expect(fusion.inheritanceEvidence.allowedTypeCodes).toEqual([10, 11]);
    expect(fusion.inheritanceEvidence.owners).toHaveLength(23);
    expect(fusion.summary.registeredCombatInheritanceOwners).toBe(23);
    const inheritedOwnerIds = fusion.inheritanceEvidence.owners.map((owner) => owner.id);
    expect(new Set(inheritedOwnerIds)).toEqual(
      new Set([...bySource.values()].map((item) => item.id)),
    );
    for (const owner of fusion.inheritanceEvidence.owners) {
      expect(owner.typeCode).toBe(3);
      expect(owner.fusionTimes).toBeGreaterThan(0);
      expect(byId.get(owner.id)?.sourceId).toBe(String(owner.sourceId));
    }
    expect(fusion.inheritanceEvidence.sources[0].functions).toContain(
      "get_fusion_skill_total_weight",
    );
    expect(fusion.inheritanceEvidence.sources[0].functions).toContain(
      "fix_fusion_skill_group_weight",
    );
    for (const row of fusion.fusionTraits) {
      expect(row.recipes.length).toBeGreaterThan(0);
      expect(row.traitFusionMaterialType).toBe(row.typeCode === 10 ? "ANIMAL" : "FURNITURE");
      expect(byId.get(row.id)?.traitFusionMaterialType).toBe(row.traitFusionMaterialType);
      expect(new Set(row.directSourceIds)).toEqual(
        new Set(row.recipes.map((recipe) => recipe.baseId)),
      );
      expect(new Set(row.allowedDeviantIds)).toEqual(new Set(inheritedOwnerIds));
      for (const recipe of row.recipes) {
        expect(recipe.operation).toBe(4);
        expect(String(recipe.traitId)).toBe(row.sourceId);
        expect([6, 7]).toContain(recipe.category);
        expect(row.materials.some((material) => material.id === recipe.materialId)).toBe(true);
      }
      for (const ownerId of row.allowedDeviantIds) {
        const owner = byId.get(ownerId)!;
        expect(owner.allowedTraitIds).toContain(row.id);
        expect(row.allowedDeviantSourceIds).toContain(Number(owner.sourceId));
      }
      for (const sourceId of row.allowedDeviantSourceIds) {
        const knownOwner = bySource.get(String(sourceId));
        if (knownOwner) expect(knownOwner.allowedTraitIds).toContain(row.id);
      }
    }
    const moonlight = GEAR_CATALOG.filter(
      (item) => item.kind === "DEVIANT_TRAIT" && item.sourceId === "1000002",
    );
    expect(moonlight).toHaveLength(1);
    expect(moonlight[0].id).toBe("deviant-trait-moonlight-ambush");
    expect(byId.has("deviant-trait-1000002")).toBe(false);
    expect(byId.get("deviant-dr-teddy")?.allowedTraitIds).toContain(moonlight[0].id);
    expect(byId.get("deviant-butterfly")?.allowedTraitIds).toContain(moonlight[0].id);
    expect(byId.get("deviant-99000047")?.allowedTraitIds).toContain(moonlight[0].id);
    expect(byId.get("deviant-99000047")?.allowedTraitIds).toContain("deviant-trait-1100011");
    expect(byId.get("deviant-99000047")?.allowedTraitIds).toContain("deviant-trait-11510125");
    const moonlightProof = fusion.fusionTraits.find((row) => row.sourceId === "1000002")!;
    expect(moonlightProof.directSourceIds).not.toContain(99000047);
    expect(moonlightProof.allowedDeviantSourceIds).toContain(99000047);
    expect(byId.get("deviant-99000047")?.allowedTraitIds).toHaveLength(113);
    const indirectFurniture = fusion.fusionTraits.filter(
      (row) => row.typeCode === 11 && row.directSourceIds.every((id) => !bySource.has(String(id))),
    );
    expect(indirectFurniture).toHaveLength(6);
    for (const row of indirectFurniture)
      expect(byId.get("deviant-99000047")?.allowedTraitIds).toContain(row.id);
  });

  it("retains combat and noncombat source effects without making old worker descriptions current combat effects", () => {
    const flash = byId.get("deviant-trait-1100006")!;
    expect(flash.description).toContain("전투형:");
    expect(flash.description).toContain("총기 대미지를 10% 감소");
    expect(flash.description).toContain("영지·창조형:");
    expect(flash.description).toContain("조명 수용 조건");
    const reload = byId.get("deviant-trait-1100009")!;
    expect(reload.description).toContain("적재 한도 20 증가");
    expect(reload.description).toContain("저장 공간 15% 증가");
    const pollution = byId.get("deviant-trait-11550527")!;
    expect(pollution.description.split("\n")[0]).toContain("오염도 저항");
    expect(pollution.description.split("\n")[0]).not.toMatch(/15|20|90/);
    expect(pollution.source.url).toContain("20260121/40776_1282973.html");
    const proof = fusion.fusionTraits.find((row) => row.sourceId === "11550527")!;
    expect(proof.effectEvidence?.official.scope).toBe("COMBAT_ONLY");
    expect(proof.effectEvidence?.official.numericValue).toBeNull();
    expect(proof.effectBranches).toHaveLength(5);
    expect(proof.effectBranches[2].description).toContain("오염 내성 20");
  });

  it("excludes unverified decoration/bed/arrow/empty-animal effects and reuses native fusion glyphs", () => {
    expect(fusion.summary.animalTraitIdentities).toBe(10);
    expect(fusion.summary.animalMaterials).toBe(12);
    for (const row of fusion.fusionTraits.filter((trait) => trait.typeCode === 10)) {
      expect(byId.get(row.id)?.traitFusionMaterialType).toBe("ANIMAL");
      expect(byId.get(row.id)?.traitFusionMaterialNames).toEqual([
        ...new Set(row.materials.map((material) => material.name)),
      ]);
    }
    expect(fusion.excludedRecords).toHaveLength(126);
    for (const row of fusion.excludedRecords) {
      expect(
        GEAR_CATALOG.some(
          (item) => item.kind === "DEVIANT_TRAIT" && item.sourceId === row.sourceId,
        ),
      ).toBe(false);
    }
    for (const id of ["1100003", "1000009", "11510128", "11510129", "11510130"])
      expect(
        GEAR_CATALOG.some((item) => item.kind === "DEVIANT_TRAIT" && item.sourceId === id),
      ).toBe(false);
    expect(
      fusion.fusionTraits.some((row) =>
        row.materials.some((material) => [61510128, 61510129, 61510130].includes(material.id)),
      ),
    ).toBe(false);
    expect(expandedAssets).toHaveLength(343);
    const glyph = expandedAssets.find((asset) => asset.key === "fusion_ctb2_icon_attribute13")!;
    for (const row of fusion.fusionTraits)
      expect(glyph.catalogItems.map((item) => item.id)).toContain(row.id);
  });
});
