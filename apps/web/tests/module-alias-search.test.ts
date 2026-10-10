import { describe, expect, it } from "vitest";
import { GEAR_CATALOG } from "@uniz/build-engine";
import proof from "../../../packages/build-engine/data/gear-module-aliases.json";
import { searchGearItems } from "../src/components/build-planner/gear-editor-model";

const modules = GEAR_CATALOG.filter((item) => item.kind === "MODULE" && !item.legacyOnly);
const ids = (query: string) =>
  searchGearItems(modules, query)
    .map((item) => item.id)
    .sort();
const familyIds = (entry: number) =>
  Object.keys(proof.groups.find((group) => group.mainEntryNo === entry)!.variants).sort();

describe("module aliases in the actual gear picker search", () => {
  it("finds all variants using either mixed Korean name and compact spelling", () => {
    for (const query of ["세력 보존", "세력보존", "우위 유지", "우위유지", "Rejuvenating"]) {
      expect(ids(query)).toEqual(familyIds(9214));
    }
  });

  it("narrows by the recorded suffix without borrowing another variant's suffix", () => {
    const matched = searchGearItems(modules, "우위유지 달의징조");
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.map((item) => item.id).sort()).toEqual(ids("세력보존 달의징조"));
    expect(matched.every((item) => item.name.includes("달의 징조"))).toBe(true);
    expect(new Set(matched.map((item) => item.moduleShiny))).toEqual(new Set([false, true]));
  });

  it.each([
    [9116, "럭키 플레이어", "럭키 딜러"],
    [9615, "폭발 속사", "폭발적인 속사"],
    [10901, "다중 속사", "멀티 속사"],
    [10702, "연속 바운스", "연속 리버트"],
    [10802, "블래스트 아트", "슈퍼 폭격기"],
    [9314, "크리티컬 러버", "크리티컬 프렌지"],
    [9318, "정밀 충전", "정교한 충전"],
    [9627, "기동전", "속도만이 살길"],
  ] as const)(
    "keeps confirmed Korean name pairs searchable for family %i",
    (entry, first, second) => {
      expect(ids(first)).toEqual(familyIds(entry));
      expect(ids(second)).toEqual(familyIds(entry));
    },
  );

  it("does not combine separate wanted or bounce families because their names look similar", () => {
    expect(ids("지명 수배")).toEqual(familyIds(9617));
    expect(ids("전면 수배")).toEqual(familyIds(9617));
    expect(ids("Targeted Strike")).toEqual(familyIds(9617));
    expect(ids("Most Wanted")).toEqual(familyIds(9625));
    expect(ids("전원 수배")).toEqual(familyIds(9625));
    expect(ids("연속 바운스")).toEqual(familyIds(10702));
    expect(ids("다중 바운스")).not.toEqual(familyIds(10702));
  });

  it("matches both precise/precision English translations of the same source family", () => {
    expect(ids("Precise Charge")).toEqual(familyIds(9318));
    expect(ids("Precision Charge")).toEqual(familyIds(9318));
    expect(ids("Precise Rush")).toEqual(familyIds(10902));
    expect(ids("Precision Rush")).toEqual(familyIds(10902));
  });
});
