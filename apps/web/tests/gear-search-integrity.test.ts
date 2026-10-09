import { describe, expect, it } from "vitest";
import { GEAR_CATALOG, getEligibleGearItems } from "@uniz/build-engine";
import {
  gearDisplayName,
  gearItemName,
  searchGearItems,
} from "../src/components/build-planner/gear-editor-model";
import { GearArmorSetEffects } from "../src/components/build-planner/gear-armor-summary";

type Element = { type: unknown; props: Record<string, unknown> };
function flatten(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...flatten(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node
    ? text((node as Element).props.children)
    : "";
}

describe("Verified armor names and readable set effects", () => {
  it.each(["울프", "고독한 늑대", "고독한늑대", "늑대", "Lonewolf"])(
    "finds the same wolf helmet for %s",
    (query) => {
      const result = searchGearItems(getEligibleGearItems("helmet"), query);
      const wolf = result.find((item) => item.id === "armor-lonewolf-hood")!;
      expect(wolf).toBeDefined();
      expect(gearItemName(wolf)).toBe("울프 후드");
      expect(gearDisplayName(wolf.id, { [wolf.id]: "고독한 늑대 모자" })).toBe("울프 후드");
      expect(result.every((item) => item.allowedSlots.includes("helmet"))).toBe(true);
      expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
    },
  );
  it("connects Savior and old Korean labels to one item identity", () => {
    const items = getEligibleGearItems("helmet");
    const current = searchGearItems(items, "세이버");
    const previous = searchGearItems(items, "구원자");
    expect(current.map((item) => item.id)).toEqual(previous.map((item) => item.id));
    expect(current).toHaveLength(1);
    expect(gearItemName(current[0])).toBe("세이버 후드");
  });
  it("shows reached and upcoming effects separately without changing the equipment", () => {
    const sets = [{ setId: "set-1009", count: 3 }];
    const elements = flatten(GearArmorSetEffects({ sets }));
    expect(text(elements[0].props.children)).toContain("세이버 세트");
    const rows = elements.filter((element) => element.type === "li");
    expect(rows.find((row) => text(row.props.children).startsWith("2세트"))?.props.className).toBe(
      "is-active",
    );
    expect(rows.find((row) => text(row.props.children).startsWith("3세트"))?.props.className).toBe(
      "is-active",
    );
    expect(rows.find((row) => text(row.props.children).startsWith("4세트"))?.props.className).toBe(
      "is-inactive",
    );
    expect(text(rows[1].props.children)).toContain("10%");
    expect(sets).toEqual([{ setId: "set-1009", count: 3 }]);
  });
});

describe("Inherited fusion trait search without widening appearance eligibility", () => {
  const doll = GEAR_CATALOG.find((item) => item.id === "deviant-99000047")!;
  const dollTraits = GEAR_CATALOG.filter((item) => doll.allowedTraitIds.includes(item.id));

  it.each(["늑대", "달빛 습격"])(
    "finds the same inherited animal fusion trait on the Doll for %s",
    (query) => {
      const result = searchGearItems(dollTraits, query);
      const moonlight = result.find((item) => item.id === "deviant-trait-moonlight-ambush");
      expect(moonlight).toBeDefined();
      expect(gearItemName(moonlight!)).toBe("달빛 습격");
      expect(moonlight!.traitFusionMaterialType).toBe("ANIMAL");
      expect(result.every((item) => doll.allowedTraitIds.includes(item.id))).toBe(true);
    },
  );

  it("keeps Butterfly appearance traits out of the Doll's searchable trait list", () => {
    expect(searchGearItems(dollTraits, "라벤더 블루")).toEqual([]);
    expect(doll.allowedTraitIds).not.toContain("deviant-trait-weakspot-master-lavender-blue");
    expect(doll.allowedTraitIds).toContain("deviant-trait-400102");
  });
});
