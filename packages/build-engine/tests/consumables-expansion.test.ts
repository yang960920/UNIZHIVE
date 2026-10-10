import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import provenance from "../data/consumables-asset-provenance.json";
import { CONSUMABLE_CATALOG } from "../src/model/consumables";
import { createEmptyGearLoadout, GEAR_SCHEMA_VERSION } from "../src/model/gear";
import { parseGearLoadoutForSave, parseVersionedPlannerSnapshot } from "../src/validation/gear";

const bySourceId = new Map(CONSUMABLE_CATALOG.map((item) => [item.sourceId, item]));
const publicRoot = fileURLToPath(new URL("../../../apps/web/public/", import.meta.url));
const iconRoot = path.resolve(publicRoot, "game/consumables");
const originalSourceIds = [
  "30110322",
  "30110112",
  "30110305",
  "30110206",
  "30110342",
  "30110330",
  "30110345",
  "30110328",
  "30110324",
  "30110386",
  "30110374",
  "30110369",
  "30110303",
  "30110304",
  "30110350",
  "30110314",
  "30110373",
  "30110367",
  "30110377",
  "30110313",
  "30110318",
  "30110401",
  "30110344",
  "30110332",
  "30110301",
  "30110333",
  "30110343",
  "30110354",
  "30110351",
  "30110391",
];

describe("reviewed food and drink expansion", () => {
  it("exposes all 85 reviewed dishes and preserves the original 30 save identities", () => {
    expect(CONSUMABLE_CATALOG).toHaveLength(85);
    expect(CONSUMABLE_CATALOG.filter((item) => item.kind === "FOOD")).toHaveLength(53);
    expect(CONSUMABLE_CATALOG.filter((item) => item.kind === "DRINK")).toHaveLength(32);
    expect(bySourceId.size).toBe(CONSUMABLE_CATALOG.length);
    expect(new Set(CONSUMABLE_CATALOG.map((item) => item.id)).size).toBe(85);
    for (const sourceId of originalSourceIds) {
      expect(bySourceId.get(sourceId)?.id, sourceId).toBe(`consumable-${sourceId}`);
    }
  });

  it.each([
    ["30110385", "깜짝 춘권", "FOOD"],
    ["30110389", "갤럭시 페스츄리", "FOOD"],
    ["30110375", "팡팡팝콘", "FOOD"],
    ["30110376", "불꽃 에그타르트", "FOOD"],
    ["30110379", "쿨민트 고기 통조림", "FOOD"],
    ["30110388", "스타 푸딩", "FOOD"],
    ["30110355", "스타더스트 옥수수 발효주", "DRINK"],
  ] as const)(
    "saves and reads the newly available %s without replacing its trusted identity",
    (sourceId, name, kind) => {
      const item = bySourceId.get(sourceId);
      expect(item).toMatchObject({ id: `consumable-${sourceId}`, sourceId, name, kind });
      if (!item) throw new Error(`Missing reviewed consumable ${sourceId}`);
      const draft = createEmptyGearLoadout();
      draft.consumables = {
        foodIds: kind === "FOOD" ? [item.id] : [],
        drinkIds: kind === "DRINK" ? [item.id] : [],
        notes: "재료 차이는 사용자 기록으로 보존합니다.",
      };
      draft.catalogNames = { [item.id]: "클라이언트에서 바꾼 이름" };
      const before = structuredClone(draft);
      const saved = parseGearLoadoutForSave(draft);
      expect(saved.consumables).toEqual(draft.consumables);
      expect(saved.catalogNames?.[item.id]).toBe(name);
      expect(
        parseVersionedPlannerSnapshot(GEAR_SCHEMA_VERSION, JSON.parse(JSON.stringify(saved))),
      ).toEqual(saved);
      expect(draft).toEqual(before);
    },
  );

  it("allows the two reported foods together for a chef while preserving the independent drink", () => {
    const draft = createEmptyGearLoadout();
    draft.context.characterClass = "셰프";
    draft.consumables = {
      foodIds: ["consumable-30110385", "consumable-30110389"],
      drinkIds: ["consumable-30110355"],
      notes: "",
    };
    expect(parseGearLoadoutForSave(draft).consumables).toEqual(draft.consumables);
    draft.context.characterClass = null;
    expect(() => parseGearLoadoutForSave(draft)).toThrow(/at most 1/);
    expect(draft.consumables.foodIds).toEqual(["consumable-30110385", "consumable-30110389"]);
  });

  it.each(["30119709", "30102020", "30102920", "30111044", "30190107"])(
    "keeps scenario-specific, ingredient-dependent, raw, and custom item %s out of ordinary saves",
    (sourceId) => {
      expect(bySourceId.has(sourceId)).toBe(false);
      const draft = createEmptyGearLoadout();
      draft.consumables = {
        foodIds: sourceId === "30119709" ? [] : [`consumable-${sourceId}`],
        drinkIds: sourceId === "30119709" ? [`consumable-${sourceId}`] : [],
        notes: "",
      };
      expect(() => parseGearLoadoutForSave(draft)).toThrow(/Unknown consumable/);
    },
  );

  it("retains uncertain Korean descriptions without inventing missing or unused values", () => {
    const cottonCandy = bySourceId.get("30110390")!;
    const glideEffect = cottonCandy.effects.find((effect) =>
      effect.description.includes("수평 활공"),
    );
    expect(glideEffect).toMatchObject({ verified: false, durationSeconds: 1800 });
    expect(glideEffect?.description.match(/10% 증가/g)).toHaveLength(2);
    expect(glideEffect?.description).not.toContain("15%");

    const milkTea = bySourceId.get("30110391")!;
    const shieldEffect = milkTea.effects.find((effect) => effect.description.includes("최대 HP %"));
    expect(shieldEffect).toMatchObject({ verified: false, durationSeconds: 1800 });
    expect(shieldEffect?.description).toContain("초당 최대 HP %의 실드");
    expect(shieldEffect?.description).toContain("최대 HP 50%");
  });

  it("preserves the sourced 1980-second pumpkin effect instead of normalizing all food to 30 minutes", () => {
    const pumpkin = bySourceId.get("30110374")!;
    expect(pumpkin.effects).toEqual([
      expect.objectContaining({ durationSeconds: 1980, verified: true }),
    ]);
  });

  it("maps every selectable identity to its verified original PNG with matching source and file hashes", () => {
    expect(provenance.assets).toHaveLength(85);
    const assetsBySourceId = new Map(
      provenance.assets.map((asset) => [String(asset.sourceItemId), asset]),
    );
    expect(assetsBySourceId.size).toBe(85);
    for (const item of CONSUMABLE_CATALOG) {
      const asset = assetsBySourceId.get(item.sourceId);
      expect(asset, item.sourceId).toBeDefined();
      if (!asset) throw new Error(`Missing original icon provenance for ${item.sourceId}`);
      expect(item.id).toBe(`consumable-${item.sourceId}`);
      expect(item.icon).toMatch(/^\/game\/consumables\/[a-zA-Z0-9_.-]+\.png$/);
      expect(item.icon).toBe(asset.icon);
      expect(path.posix.basename(item.icon)).toBe(asset.iconKey);
      expect(asset.sourceTable).toBe("item_data");
      expect(asset.native.archive).toMatch(/\.npk$/);
      expect(asset.native.internalPath).toMatch(
        /^ui\/dynamic_texpack\/all_icon_res\/item_icon_(?:new|sea)\/[^/]+\.pvr$/,
      );
      expect(path.posix.basename(asset.native.internalPath)).toBe(
        asset.iconKey.replace(/\.png$/, ".pvr"),
      );
      expect(asset.pixelRoundtripVerified).toBe(true);
      expect(asset.storedSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.pvrSha256).toMatch(/^[a-f0-9]{64}$/);

      const iconFile = path.resolve(publicRoot, item.icon.slice(1));
      expect(path.dirname(iconFile)).toBe(iconRoot);
      const png = readFileSync(iconFile);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.toString("ascii", 12, 16)).toBe("IHDR");
      expect(png.readUInt32BE(16)).toBe(asset.width);
      expect(png.readUInt32BE(20)).toBe(asset.height);
      expect(asset.width).toBe(asset.nativeWidth);
      expect(asset.height).toBe(asset.nativeHeight);
      expect(createHash("sha256").update(png).digest("hex")).toBe(asset.pngSha256);
    }
  });
});
