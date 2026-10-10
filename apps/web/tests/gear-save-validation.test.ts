import { describe, expect, it, vi } from "vitest";
import type { GearCatalogItem, PlannerGearLoadout } from "@uniz/build-engine";

const boundary = vi.hoisted(() => ({ catalog: [] as GearCatalogItem[] }));
vi.mock("@uniz/build-engine", async (original) => {
  const actual = await original<typeof import("@uniz/build-engine")>();
  function item(id: string, fields: Partial<GearCatalogItem> = {}): GearCatalogItem {
    return {
      id,
      name: "시험 무기",
      aliases: [],
      kind: "WEAPON",
      allowedSlots: ["primary"],
      weaponFamily: "SMG",
      compatibleWeaponFamilies: [],
      accessorySlot: null,
      moduleGeneration: null,
      allowedSuffixIds: [],
      allowedTraitIds: [],
      icon: null,
      rarity: null,
      description: "",
      setId: null,
      isKeyArmor: false,
      scenarioKeys: [],
      source: { url: null, evidence: "Test-only fixture", verifiedAt: "2026-10-10" },
      ...fields,
    };
  }
  boundary.catalog = [
    item("weapon"),
    item("winter-weapon", { name: "설산 무기", scenarioKeys: ["WINTER"] }),
    item("cradle", {
      kind: "CRADLE",
      name: "설산 크래들",
      allowedSlots: ["cradle-1"],
      scenarioKeys: ["WINTER"],
    }),
    item("helmet", {
      kind: "ARMOR",
      name: "핵심 헬멧",
      allowedSlots: ["helmet"],
      isKeyArmor: true,
    }),
    item("top", { kind: "ARMOR", name: "핵심 상의", allowedSlots: ["top"], isKeyArmor: true }),
    item("helmet-module", {
      kind: "MODULE",
      name: "헬멧 모듈",
      moduleGeneration: "NEW",
      allowedSlots: ["helmet"],
    }),
    item("module", {
      kind: "MODULE",
      name: "무기 모듈",
      moduleGeneration: "NEW",
      compatibleWeaponFamilies: ["SMG"],
    }),
    item("winter-module", {
      kind: "MODULE",
      name: "설산 모듈",
      moduleGeneration: "NEW",
      compatibleWeaponFamilies: ["SMG"],
      scenarioKeys: ["WINTER"],
    }),
    item("deviant", {
      kind: "DEVIANT",
      name: "시험 감염물",
      allowedSlots: ["combatDeviant"],
      allowedTraitIds: ["trait-a", "trait-b"],
    }),
    item("trait-a", {
      kind: "DEVIANT_TRAIT",
      name: "첫 번째 특성",
      traitIconGroup: "shared",
      isDeviantShinyTrait: true,
    }),
    item("trait-b", {
      kind: "DEVIANT_TRAIT",
      name: "두 번째 특성",
      traitIconGroup: "shared",
      isDeviantShinyTrait: true,
    }),
  ];
  return {
    ...actual,
    GEAR_CATALOG: boundary.catalog,
    getGearTraitConflicts: (ids: readonly string[]) =>
      actual.getGearTraitConflicts(ids, boundary.catalog),
    parseGearLoadoutForSave: (input: unknown) =>
      actual.parseGearLoadoutForSave(input, boundary.catalog),
  };
});

import {
  CONSUMABLE_CATALOG,
  createEmptyGearLoadout,
  createGearSelection,
} from "@uniz/build-engine";
import { getGearSaveIssues } from "../src/components/build-planner/gear-save-validation";

function equipped(
  slot: Parameters<typeof createGearSelection>[0],
  itemId: string,
): PlannerGearLoadout {
  const draft = createEmptyGearLoadout();
  draft.slots = [createGearSelection(slot, itemId)];
  return draft;
}

describe("Gear save requirements", () => {
  it("allows empty optional equipment, context and recommendation fields", () => {
    expect(getGearSaveIssues(createEmptyGearLoadout())).toEqual([]);
    expect(getGearSaveIssues(equipped("primary", "weapon"))).toEqual([]);
  });

  it("requires a matching scenario only for a selected scenario-specific item", () => {
    const draft = equipped("cradle-1", "cradle");
    const missing = getGearSaveIssues(draft);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ targetId: "gear-play-conditions" });
    expect(missing[0].message).toContain("크래들 1");
    expect(missing[0].message).toContain("설산");
    draft.context.scenarioKey = "MANIBUS";
    expect(getGearSaveIssues(draft)[0].message).toContain("맞는 시나리오");
    draft.context.scenarioKey = "WINTER";
    expect(getGearSaveIssues(draft)).toEqual([]);
  });

  it("identifies an obsolete selected item and links to its equipment slot", () => {
    const draft = equipped("primary", "removed-item");
    draft.catalogNames = { "removed-item": "이전에 기록한 무기" };
    const issues = getGearSaveIssues(draft);
    expect(issues).toHaveLength(1);
    expect(issues[0].targetId).toBe("gear-slot-primary");
    expect(issues[0].message).toContain("이전에 기록한 무기");
    expect(issues[0].message).toContain("다시 선택하거나 해제");
    expect(issues[0].message).not.toContain("removed-item");
  });

  it("reports the one-key-armor rule without making empty armor slots required", () => {
    const draft = equipped("helmet", "helmet");
    expect(getGearSaveIssues(draft)).toEqual([]);
    draft.slots.push(createGearSelection("top", "top"));
    expect(getGearSaveIssues(draft)).toEqual([
      {
        message:
          "핵심 방어구는 1개만 장착할 수 있습니다. 추가 핵심 방어구를 변경하거나 해제해 주세요.",
        targetId: "gear-equipment",
      },
    ]);
  });

  it("names an incompatible attachment and allows removing it", () => {
    const draft = equipped("primary", "weapon");
    draft.slots[0].attachments.module = "helmet-module";
    const issues = getGearSaveIssues(draft);
    expect(issues[0].targetId).toBe("gear-slot-primary");
    expect(issues[0].message).toContain("주 무기의 모듈");
    expect(issues[0].message).toContain("호환되는 항목");
    draft.slots[0].attachments.module = null;
    expect(getGearSaveIssues(draft)).toEqual([]);
  });

  it("explains an attachment scenario requirement and deduplicates a parent scenario error", () => {
    const draft = equipped("primary", "weapon");
    draft.slots[0].attachments.module = "winter-module";
    expect(getGearSaveIssues(draft)[0]).toMatchObject({ targetId: "gear-play-conditions" });
    expect(getGearSaveIssues(draft)[0].message).toContain("주 무기의 모듈");
    draft.context.scenarioKey = "WINTER";
    expect(getGearSaveIssues(draft)).toEqual([]);
    draft.context.scenarioKey = null;
    draft.slots[0].itemId = "winter-weapon";
    draft.slots[0].attachments.module = "module";
    expect(getGearSaveIssues(draft)).toHaveLength(1);
  });

  it("reports persisted numeric errors with the field and accepted range", () => {
    const draft = equipped("primary", "weapon");
    draft.slots[0].level = 0;
    expect(getGearSaveIssues(draft)[0].message).toContain("레벨은 비워두거나 1~100");
    draft.slots[0].level = null;
    draft.slots[0].attachments.module = "module";
    draft.slots[0].attachments.moduleLevel = 18;
    expect(getGearSaveIssues(draft)[0].message).toContain("모듈 레벨은 비워두거나 1~17");
  });

  it("reports both distinct deviant trait rules in Korean", () => {
    const draft = equipped("combatDeviant", "deviant");
    draft.slots[0].traitIds = ["trait-a", "trait-b"];
    const issues = getGearSaveIssues(draft);
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.targetId === "gear-slot-combatDeviant")).toBe(true);
    expect(issues.some((issue) => issue.message.includes("같은 아이콘"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("이로치 특성"))).toBe(true);
    expect(issues.every((issue) => issue.message.includes("첫 번째 특성"))).toBe(true);
  });

  it("explains consumable class limits and links recommendation and notes errors to their sections", () => {
    const draft = createEmptyGearLoadout();
    draft.consumables!.foodIds = CONSUMABLE_CATALOG.filter((item) => item.kind === "FOOD")
      .slice(0, 2)
      .map((item) => item.id);
    expect(getGearSaveIssues(draft)[0]).toMatchObject({ targetId: "gear-consumables" });
    expect(getGearSaveIssues(draft)[0].message).toContain("음식은");
    draft.context.characterClass = "셰프";
    expect(getGearSaveIssues(draft)).toEqual([]);
    draft.recommendation.tags = [""];
    draft.notes = "가".repeat(2001);
    const issues = getGearSaveIssues(draft);
    expect(
      issues.some(
        (issue) => issue.targetId === "gear-recommendation" && issue.message.includes("태그"),
      ),
    ).toBe(true);
    expect(
      issues.some(
        (issue) => issue.targetId === "gear-loadout-notes" && issue.message.includes("2,000"),
      ),
    ).toBe(true);
    expect(
      issues.every(
        (issue) => !issue.message.includes("Too big") && !issue.message.includes("Invalid"),
      ),
    ).toBe(true);
  });
});
