import { describe, expect, it } from "vitest";
import { GEAR_CATALOG, getEligibleGearItems, type GearSlot } from "@uniz/build-engine";
import proof from "../../../packages/build-engine/data/key-armor-name-aliases.json";
import { searchGearItems } from "../src/components/build-planner/gear-editor-model";

const eligibleArmor = GEAR_CATALOG.filter((item) => item.kind === "ARMOR" && !item.legacyOnly);
const ids = (query: string, slot?: GearSlot) =>
  searchGearItems(slot ? getEligibleGearItems(slot) : eligibleArmor, query).map((item) => item.id);

describe("key armor aliases in the actual gear picker", () => {
  it.each(["케이지", "케이지 헬멧", "감옥", "감옥헬멧", "Cage Helmet", "cage-helmet"])(
    "finds the original Cage Helmet for %s",
    (query) => {
      expect(ids(query, "helmet")).toEqual(["armor-21011801"]);
      expect(ids(query, "mask")).toEqual([]);
    },
  );

  it.each([
    ["단단한 전투화", "경질전술화", "armor-24011001", "shoes"],
    ["데님 부츠", "카우보이부츠", "armor-24010701", "shoes"],
    ["베테랑 헌터 부츠", "노련한 사냥꾼 부츠", "armor-24010901", "shoes"],
    ["낡은 망토", "원로의망토", "armor-22012201", "top"],
    ["폭주하는 전장 상의", "블래스트 프론트 상의", "armor-22012401", "top"],
    ["더스트 마스크", "더스트 스톰 마스크", "armor-26010301", "mask"],
    ["유랑자 장갑", "드리프터장갑", "armor-25010701", "gloves"],
    ["매직 트리거 상의", "마술 트리거 상의", "armor-22013101", "top"],
    ["샤먼 벌처 상의", "벌처 샤먼 상의", "armor-22012301", "top"],
    ["방독 후드", "방독마스크 후드", "armor-21012101", "helmet"],
  ] as const)("links %s with %s within the correct slot", (current, previous, id, slot) => {
    expect(ids(current, slot)).toEqual([id]);
    expect(ids(previous, slot)).toEqual([id]);
  });

  it("keeps English search available for all reviewed original key armor", () => {
    for (const item of proof.entries) {
      const name = item.evidence.find((entry) => entry.kind === "PUBLIC_ITEM_ID_NAME")!.name!;
      expect(ids(name, item.slot as GearSlot)).toContain(item.catalogId);
    }
  });

  it("keeps similarly named helmets and boots separate and excludes source-less legacy selections", () => {
    expect(ids("Gas-tight Helmet", "helmet")).toEqual(["armor-21011901"]);
    expect(ids("Gas Mask Hood", "helmet")).toEqual(["armor-21012101"]);
    expect(ids("Hard Tactical Boots", "shoes")).toEqual(["armor-24011001"]);
    expect(ids("Tactical Combat Shoes", "shoes")).toEqual(["armor-24010601"]);
    expect(ids("Pivot Step Leather Boots", "shoes")).toEqual(["armor-24011401"]);
    expect(ids("회전스텝", "shoes")).toEqual([]);
  });
});
