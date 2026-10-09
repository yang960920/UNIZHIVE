import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import assetManifest from "../data/gear-asset-provenance.json";
import expandedAssets from "../data/expanded-gear-asset-provenance.json";
import {
  GEAR_CATALOG,
  GEAR_ITEM_KINDS,
  GEAR_SLOT_IDS,
  createEmptyGearLoadout,
  createGearSelection,
  gearAttachmentFits,
} from "../src/model/gear";
import { parseGearLoadout } from "../src/validation/gear";

const publicRoot = fileURLToPath(new URL("../../../apps/web/public/", import.meta.url));
const byId = new Map(GEAR_CATALOG.map((entry) => [entry.id, entry]));
const sha256 = /^[a-f0-9]{64}$/;

describe("curated production gear catalog and native icon provenance", () => {
  it("has unique identities, Korean labels, recording slots and inspectable evidence", () => {
    expect(byId.size).toBe(GEAR_CATALOG.length);
    for (const item of GEAR_CATALOG) {
      expect(item.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      if (!/[가-힣]/.test(item.name)) {
        // A localized item may be a literal model name such as G17 or SOCR.
        expect(item.kind).toBe("WEAPON");
        expect(item.sourceId).toBeDefined();
        expect(item.name).toMatch(/[A-Za-z]/);
      }
      expect(GEAR_ITEM_KINDS).toContain(item.kind);
      expect(item.allowedSlots.length).toBeGreaterThan(0);
      expect(new Set(item.allowedSlots).size).toBe(item.allowedSlots.length);
      item.allowedSlots.forEach((slot) => expect(GEAR_SLOT_IDS).toContain(slot));
      expect(item.source.evidence.trim().length).toBeGreaterThan(0);
      expect(item.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (item.source.url) expect(new URL(item.source.url).protocol).toBe("https:");
      else expect(item.source.evidence).toContain("사용자");
      expect(Object.isFrozen(item)).toBe(true);
    }
  });

  it("resolves exact parent IDs, suffixes and deviant traits to the correct kinds", () => {
    for (const item of GEAR_CATALOG) {
      item.compatibleItemIds?.forEach((id) => expect(byId.get(id)?.kind).toBe("WEAPON"));
      item.allowedSuffixIds.forEach((id) => expect(byId.get(id)?.kind).toBe("MODULE_SUFFIX"));
      item.allowedTraitIds.forEach((id) => expect(byId.get(id)?.kind).toBe("DEVIANT_TRAIT"));
      if (item.kind === "MODULE") expect(item.moduleGeneration).toBe("NEW");
      if (item.kind === "ACCESSORY")
        expect(["muzzle", "sight", "tactical", "magazine"]).toContain(item.accessorySlot);
    }
  });

  it("records game-relative archive paths and unique public assets without depending on Steam", () => {
    expect(new Set(assetManifest.map((asset) => asset.publicPath)).size).toBe(assetManifest.length);
    expect(new Set(assetManifest.map((asset) => `${asset.archive}:${asset.index}`)).size).toBe(
      assetManifest.length,
    );
    for (const asset of assetManifest) {
      expect(asset.archive).toMatch(/^res_(?:global-)?normal_pack_\d+\.npk$/);
      expect(asset.internalPath).toMatch(/^ui\/.+\.pvr$/);
      expect(path.isAbsolute(asset.internalPath)).toBe(false);
      expect(asset.internalPath.split("/")).not.toContain("..");
      expect(asset.publicPath).toMatch(/^\/game\/planner\/[a-z0-9/-]+\.png$/);
      expect(asset.gameBuildId).toMatch(/^\d+$/);
      expect(asset.storedSha256).toMatch(sha256);
      expect(asset.pvrSha256).toMatch(sha256);
      expect(asset.pngSha256).toMatch(sha256);
      expect(asset.flag).toBe(3);
      expect(asset.raw).toBeLessThanOrEqual(8 * 1024 * 1024);
    }
  });

  it("checks every served PNG exists, has native dimensions and matches its recorded hash", () => {
    for (const asset of assetManifest) {
      const target = path.resolve(publicRoot, asset.publicPath.slice(1));
      expect(target.startsWith(path.resolve(publicRoot, "game/planner") + path.sep)).toBe(true);
      const bytes = readFileSync(target);
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(asset.width);
      expect(bytes.readUInt32BE(20)).toBe(asset.height);
      expect(bytes[25]).toBe(6); // RGBA, preserving native transparency.
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.pngSha256);
      const [left, top, right, bottom] = asset.alphaBounds;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(asset.width);
      expect(bottom).toBeLessThanOrEqual(asset.height);
      expect(right).toBeGreaterThan(left);
      expect(bottom).toBeGreaterThan(top);
    }
  });

  it("links item icons to reviewed native assets and preserves shared module glyph identity", () => {
    const byPath = new Map(assetManifest.map((asset) => [asset.publicPath, asset]));
    const expandedByPath = new Map(expandedAssets.map((asset) => [asset.publicPath, asset]));
    for (const item of GEAR_CATALOG.filter((item) => item.icon)) {
      const asset = byPath.get(item.icon!) ?? expandedByPath.get(item.icon!);
      expect(asset, item.id).toBeDefined();
      expect(asset!.catalogItems.map((entry) => entry.id)).toContain(item.id);
      const recordedItem = asset!.catalogItems.find((entry) => entry.id === item.id)!;
      expect(recordedItem.name).toBe(item.name);
      expect(recordedItem.source).toEqual(item.source);
    }
    for (const asset of assetManifest) {
      asset.catalogItems.forEach((entry) =>
        expect(byId.get(entry.id)?.icon).toBe(asset.publicPath),
      );
    }
    expect(byPath.get(byId.get("module-icebreaker")!.icon!)?.role).toBe(
      "shared-module-suffix-glyph",
    );
    expect(byId.get("module-suffix-ability")!.icon).toBe(byId.get("module-icebreaker")!.icon);
    expect(
      GEAR_CATALOG.some((item) => /coding_speciesa|sweet_twinkling_egg/.test(item.icon ?? "")),
    ).toBe(false);
  });

  it("accepts the reviewed P90 configuration and keeps its captured ammo exact to that weapon", () => {
    const loadout = createEmptyGearLoadout();
    const p90 = createGearSelection("primary", "weapon-p90-holographic-resonance");
    p90.attachments.muzzle = "accessory-tactical-flash-hider";
    p90.attachments.sight = "accessory-compact-reflex-sight";
    p90.attachments.tactical = "accessory-tactical-laser-sight";
    p90.attachments.ammo = "ammo-medium-caliber-armor-piercing";
    p90.attachments.module = "module-icebreaker";
    p90.attachments.moduleSuffix = "module-suffix-ability";
    p90.attachments.moduleLevel = 13;
    loadout.slots = [p90];
    expect(parseGearLoadout(loadout).catalogNames?.[p90.itemId]).toBe("P90-홀로그램 공명");
    const ammo = byId.get(p90.attachments.ammo)!;
    expect(ammo.compatibleItemIds).toEqual([p90.itemId]);
    expect(ammo.compatibleWeaponFamilies).toEqual([]);
    // Test-only parent with the same family: captured P90 proof cannot expand to another SMG.
    const unreviewedSmg = {
      ...byId.get(p90.itemId)!,
      id: "fixture-unreviewed-smg",
      name: "Test-only SMG compatibility probe",
    };
    expect(gearAttachmentFits(ammo, "primary", "ammo", unreviewedSmg)).toBe(false);
  });
});
