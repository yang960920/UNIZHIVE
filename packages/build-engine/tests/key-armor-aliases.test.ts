import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import proof from "../data/key-armor-name-aliases.json";
import catalog from "../src/model/gear-catalog.json";

const require = createRequire(import.meta.url);
const { applyKeyArmorAliasesToItems } = require("../scripts/apply-key-armor-aliases.cjs") as {
  applyKeyArmorAliasesToItems: (
    items: typeof catalog,
    evidence?: typeof proof,
  ) => { items: number; changed: number };
};

describe("reviewed key armor name aliases", () => {
  it("covers all original key armor and preserves identities, effects, icons and legacy items", () => {
    const items = structuredClone(catalog);
    for (const item of items.filter(
      (row) => row.kind === "ARMOR" && row.isKeyArmor && !row.legacyOnly,
    )) {
      item.aliases = [];
    }
    const before = structuredClone(items);
    expect(applyKeyArmorAliasesToItems(items)).toEqual({ items: 39, changed: 39 });
    expect(items.map((row) => ({ ...row, aliases: undefined }))).toEqual(
      before.map((row) => ({ ...row, aliases: undefined })),
    );
    expect(
      items.filter((row) => row.kind !== "ARMOR" || !row.isKeyArmor || row.legacyOnly),
    ).toEqual(before.filter((row) => row.kind !== "ARMOR" || !row.isKeyArmor || row.legacyOnly));
    const helmet = items.find((row) => row.id === "armor-21011801")!;
    expect(helmet.aliases).toEqual(expect.arrayContaining(["감옥 헬멧", "Cage Helmet"]));
    expect(proof.entries.find((row) => row.catalogId === helmet.id)?.evidence[0]).toMatchObject({
      itemId: "21011801",
      blueprintId: "21311801",
      fragmentIds: ["21411801"],
    });
  });

  it("is idempotent and retains existing search names", () => {
    const items = structuredClone(catalog);
    items.find((row) => row.id === "armor-21011801")!.aliases.push("기존 검수 별칭");
    applyKeyArmorAliasesToItems(items);
    const once = structuredClone(items);
    expect(applyKeyArmorAliasesToItems(items).changed).toBe(0);
    expect(items).toEqual(once);
  });

  it.each(["sourceId", "name", "allowedSlots"] as const)(
    "rejects a changed %s before modifying any search names",
    (field) => {
      const items = structuredClone(catalog);
      const last = items.find((row) => row.id === proof.entries.at(-1)!.catalogId)!;
      if (field === "sourceId") last.sourceId = "unrelated-source";
      if (field === "name") last.name = "별도 방어구";
      if (field === "allowedSlots") last.allowedSlots = ["primary"];
      const before = structuredClone(items);
      expect(() => applyKeyArmorAliasesToItems(items)).toThrow("identity mismatch");
      expect(items).toEqual(before);
    },
  );

  it("requires review when an extraction adds a new key armor identity", () => {
    const items = structuredClone(catalog);
    const item = items.find((row) => row.id === "armor-21011801")!;
    items.push({ ...structuredClone(item), id: "armor-unreviewed", sourceId: "unreviewed" });
    const before = structuredClone(items);
    expect(() => applyKeyArmorAliasesToItems(items)).toThrow("Unreviewed key armor alias item");
    expect(items).toEqual(before);
  });
});
