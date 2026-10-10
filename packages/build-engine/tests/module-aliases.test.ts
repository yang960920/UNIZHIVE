import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import proof from "../data/gear-module-aliases.json";
import catalog from "../src/model/gear-catalog.json";

const require = createRequire(import.meta.url);
const { applyModuleAliasesToItems } = require("../scripts/apply-module-aliases.cjs") as {
  applyModuleAliasesToItems: (
    items: typeof catalog,
    evidence?: typeof proof,
  ) => { families: number; variants: number; changed: number };
};
const group = (entry: number) => proof.groups.find((item) => item.mainEntryNo === entry)!;

describe("reviewed module name aliases", () => {
  it("covers every new variant exactly once without adding suffix aliases", () => {
    expect(proof.groups).toHaveLength(102);
    const ids = proof.groups.flatMap((row) => Object.keys(row.variants));
    expect(ids).toHaveLength(1662);
    expect(new Set(ids).size).toBe(1662);
    expect(
      catalog
        .filter((item) => item.kind === "MODULE" && !item.legacyOnly)
        .map((item) => item.id)
        .sort(),
    ).toEqual(ids.sort());
    const items = structuredClone(catalog);
    expect(applyModuleAliasesToItems(items)).toMatchObject({ families: 102, variants: 1662 });
    for (const row of proof.groups) {
      expect(
        [
          ...row.currentNamesKo,
          ...row.currentNamesEn,
          ...row.historicalNamesKo,
          ...row.historicalNamesEn,
          ...row.communityNames,
        ].some((name) => /[<>]/u.test(name)),
      ).toBe(false);
    }
  });

  it("connects mixed Korean labels across normal/shiny variants while preserving all metadata", () => {
    const items = structuredClone(catalog);
    for (const item of items.filter((row) => row.kind === "MODULE")) item.aliases = [];
    const original = structuredClone(items);
    applyModuleAliasesToItems(items);
    const candidates = items.filter((item) => Object.hasOwn(group(9214).variants, item.id));
    expect(candidates).toHaveLength(28);
    expect(new Set(candidates.map((item) => item.moduleShiny))).toEqual(new Set([false, true]));
    for (const item of candidates) {
      const names = [item.name, ...item.aliases].join(" ");
      expect(names).toContain("세력 보존");
      expect(names).toContain("우위 유지");
      expect(item.aliases).toContain("Rejuvenating");
    }
    expect(items.map((row) => ({ ...row, aliases: undefined }))).toEqual(
      original.map((row) => ({ ...row, aliases: undefined })),
    );
    expect(items.filter((row) => row.kind !== "MODULE")).toEqual(
      original.filter((row) => row.kind !== "MODULE"),
    );
  });

  it("keeps Targeted Strike and Most Wanted separate and records confirmed community names", () => {
    expect(group(9617).currentNamesEn).toEqual(["Targeted Strike"]);
    expect(group(9617).historicalNamesKo).toContain("전면 수배");
    expect(group(9625).currentNamesEn).toEqual(["Most Wanted"]);
    expect(group(9625).historicalNamesKo).toContain("전원 수배");
    expect(group(9314).communityNames).toContain("크리티컬 프렌지");
    expect(group(9314).currentNamesEn).toContain("Deadshot");
  });

  it("is repeatable and preserves existing valid aliases", () => {
    const items = structuredClone(catalog);
    const target = items.find((item) => Object.hasOwn(group(9214).variants, item.id))!;
    target.aliases.push("검수된 기존 별칭");
    applyModuleAliasesToItems(items);
    const once = structuredClone(items);
    expect(applyModuleAliasesToItems(items).changed).toBe(0);
    expect(items).toEqual(once);
    expect(target.aliases).toContain("검수된 기존 별칭");
  });

  it.each(["sourceId", "name", "allowedSlots"] as const)(
    "rejects a changed %s before applying any aliases",
    (field) => {
      const items = structuredClone(catalog);
      const target = items.find((item) => Object.hasOwn(group(9214).variants, item.id))!;
      if (field === "sourceId") target.sourceId = "incorrect-source";
      if (field === "name") target.name = "동명이 아닌 모듈<일반>";
      if (field === "allowedSlots") target.allowedSlots = ["helmet"];
      const before = structuredClone(items);
      expect(() => applyModuleAliasesToItems(items)).toThrow("identity mismatch");
      expect(items).toEqual(before);
    },
  );

  it("fails closed for newly extracted variants pending review", () => {
    const items = structuredClone(catalog);
    const item = items.find((row) => row.kind === "MODULE" && !row.legacyOnly)!;
    items.push({ ...structuredClone(item), id: "module-unreviewed-source" });
    expect(() => applyModuleAliasesToItems(items)).toThrow("Unreviewed module alias variant");
  });
});
