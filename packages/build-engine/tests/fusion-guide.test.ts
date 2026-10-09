import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import materials from "../data/fusion-guide-materials.json";
import provenance from "../data/fusion-guide-material-provenance.json";
import enrichment from "../data/gear-trait-fusion-enrichment.json";
import { GEAR_CATALOG, getDeviantFusionGuide } from "../src/index";

describe("fusion material preparation guide", () => {
  it("uses exact native material icons with verified pixel roundtrip and file hashes", () => {
    expect(materials.materials).toHaveLength(64);
    expect(materials.materials.filter((material) => material.type === "ANIMAL")).toHaveLength(12);
    expect(materials.materials.filter((material) => material.type === "FURNITURE")).toHaveLength(
      52,
    );
    expect(materials.traits).toHaveLength(171);
    expect(provenance.assets).toHaveLength(materials.materials.length);
    for (const material of materials.materials) {
      const asset = provenance.assets.find((row) => row.sourceId === material.sourceId)!;
      expect(asset, material.name).toBeDefined();
      expect(asset.name).toBe(material.name);
      expect(asset.icon).toBe(material.icon);
      expect(asset.sourceTable).toBe("item_data");
      expect(asset.pixelRoundtripVerified).toBe(true);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(asset.width).toBeLessThanOrEqual(256);
      expect(asset.height).toBeLessThanOrEqual(256);
      expect(asset.nativeSource.internalPath).toMatch(/^ui\/.*\.pvr$/);
      const bytes = readFileSync(
        new URL(`../../../apps/web/public${material.icon}`, import.meta.url),
      );
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.pngSha256);
    }
  });

  it("permits direct wolf/bear sources across combat species despite narrower body recipes", () => {
    const body = enrichment.fusionTraits.find((trait) => trait.sourceId === "1000002")!;
    expect(body.directSourceIds).not.toContain(99000047);
    const guide = getDeviantFusionGuide("deviant-99000047", [
      "deviant-trait-moonlight-ambush",
      "deviant-trait-1000005",
    ])!;
    expect(guide.traits[0].directMaterials).toEqual([
      expect.objectContaining({ name: "늑대", type: "ANIMAL", directWithTarget: true }),
    ]);
    expect(guide.traits[1].directMaterials).toEqual([
      expect.objectContaining({ name: "곰", type: "ANIMAL", directWithTarget: true }),
    ]);
    expect(guide.traits.every((trait) => trait.inheritanceAlternative)).toBe(true);
    expect(guide.warnings.some((warning) => warning.includes("같은 아이콘"))).toBe(true);
  });

  it("keeps furniture variants with the same label attached to their exact material identities", () => {
    const guide = getDeviantFusionGuide("deviant-99000047", ["deviant-trait-11510103"])!;
    expect(guide.traits[0].name).toBe("번뜩");
    expect(guide.traits[0].directMaterials).toEqual([
      expect.objectContaining({
        sourceId: "61510103",
        name: "원형 샹들리에",
        icon: "/game/fusion-guide/icon_ceilinglight_02.png",
        directWithTarget: true,
      }),
    ]);
    const ownVariant = getDeviantFusionGuide("deviant-99000047", ["deviant-trait-11550120"])!;
    expect(ownVariant.traits[0].directMaterials[0]).toMatchObject({
      sourceId: "61550120",
      name: "클래식 라운드 테이블 - I",
      directWithTarget: true,
    });
    const historicalBodyTrait = getDeviantFusionGuide("deviant-99000047", [
      "deviant-trait-1100002",
    ])!;
    expect(
      historicalBodyTrait.traits[0].directMaterials.find(
        (material) => material.sourceId === "61550120",
      )?.directWithTarget,
    ).toBe(false);
    expect(historicalBodyTrait.traits[0].inheritanceAlternative).toBe(true);
  });

  it("guides ordinary trait carriers and bounds shiny preparation to the original target species", () => {
    const guide = getDeviantFusionGuide("deviant-99000047", [
      "deviant-trait-power-reversal-2",
      "deviant-trait-400102",
    ])!;
    expect(guide.traits[0].directMaterials).toEqual([]);
    expect(guide.traits[0].inheritanceNote).toContain("전력계 역회전 2");
    expect(guide.traits[0].unknownReason).toContain("획득 위치");
    expect(guide.traits[1].category).toBe("SHINY");
    expect(guide.traits[1].inheritanceNote).toContain("저주 인형");
    expect(guide.traits[1].inheritanceNote).toContain("다른 종류로 옮기는");
    const wrongTarget = getDeviantFusionGuide("deviant-dr-teddy", ["deviant-trait-400102"])!;
    expect(wrongTarget.traits[0].applicable).toBe(false);
    expect(wrongTarget.traits[0].inheritanceAlternative).toBe(false);
    expect(wrongTarget.warnings).not.toEqual([]);
  });

  it("reports duplicate shiny/icon conflicts without claiming any guaranteed outcome or grades", () => {
    const guide = getDeviantFusionGuide("deviant-99000047", [
      "deviant-trait-400102",
      "deviant-trait-300114",
    ])!;
    expect(guide.warnings.some((warning) => warning.includes("이로치 특성"))).toBe(true);
    expect(guide.preparationNotes.join(" ")).toContain("서브 3칸 중 하나");
    expect(guide.preparationNotes.join(" ")).toContain("횟수가 0");
    expect(guide.gradeNote).toContain("랜덤성");
    expect(JSON.stringify(guide)).not.toMatch(/100%|66\.7|successProbability|gradeProbability/);
  });

  it("covers every registered combat deviant and handles stale selections without mutating shared data", () => {
    for (const deviant of GEAR_CATALOG.filter((item) => item.kind === "DEVIANT")) {
      const guide = getDeviantFusionGuide(deviant.id, deviant.allowedTraitIds)!;
      expect(guide.target.id).toBe(deviant.id);
      expect(guide.traits).toHaveLength(deviant.allowedTraitIds.length);
      expect(guide.traits.every((trait) => trait.applicable)).toBe(true);
    }
    expect(getDeviantFusionGuide("unknown", [])).toBeNull();
    const first = getDeviantFusionGuide("deviant-99000047", [
      "deviant-trait-1000005",
      "deviant-trait-1000005",
      "unknown",
    ])!;
    expect(first.traits).toHaveLength(1);
    expect(first.warnings).toHaveLength(1);
    first.traits[0].directMaterials[0].name = "changed";
    expect(
      getDeviantFusionGuide("deviant-99000047", ["deviant-trait-1000005"])!.traits[0]
        .directMaterials[0].name,
    ).toBe("곰");
  });
});
