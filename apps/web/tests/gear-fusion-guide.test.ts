import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const boundary = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  getGuide: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.states)) boundary.states[index] = initial;
    return [
      boundary.states[index],
      (next: unknown) => {
        boundary.states[index] = next;
      },
    ];
  },
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("@uniz/build-engine", async (original) => {
  const actual = await original<typeof import("@uniz/build-engine")>();
  boundary.getGuide.mockImplementation(actual.getDeviantFusionGuide);
  return { ...actual, getDeviantFusionGuide: boundary.getGuide };
});
vi.mock("@/lib/map-farming", () => ({ getFarmingMapLink: () => null }));

import {
  GEAR_CATALOG,
  createEmptyGearLoadout,
  createGearSelection,
  type PlannerContext,
} from "@uniz/build-engine";
import { GearDeviantFusionGuide } from "../src/components/build-planner/gear-fusion-guide";
import { GearLoadoutView } from "../src/components/build-planner/gear-checklist";
import { makeFusionPreparationText } from "../src/components/build-planner/gear-fusion-guide-text";
import { GearFarmingMapLink } from "../src/components/build-planner/gear-farming-map-link";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function content(node: unknown): string {
  if (Array.isArray(node)) return node.map(content).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return content((node as Element).props.children);
}
function toggle(element: Element, open: boolean) {
  (element.props.onToggle as (event: unknown) => void)({ currentTarget: { open } });
}
const doll = GEAR_CATALOG.find((item) => item.kind === "DEVIANT" && item.name === "저주 인형")!;
const moon = GEAR_CATALOG.find(
  (item) => item.kind === "DEVIANT_TRAIT" && item.name === "달빛 습격",
)!;
const normal = GEAR_CATALOG.find(
  (item) => item.kind === "DEVIANT_TRAIT" && item.name === "활력 자극3",
)!;
function selection() {
  const value = createGearSelection("combatDeviant", doll.id);
  value.traitIds = [normal.id, moon.id];
  value.abilityGrade = 5;
  value.activityGrade = 5;
  return value;
}
function render(value = selection(), scenario?: PlannerContext["scenarioKey"]) {
  boundary.cursor = 0;
  return GearDeviantFusionGuide({ selection: value, scenario }) as Element;
}

beforeEach(() => {
  boundary.states = [];
  boundary.cursor = 0;
  boundary.getGuide.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("fusion preparation guide", () => {
  it("loads guidance only after a native disclosure is opened, without changing the selected loadout", () => {
    const value = selection();
    const before = JSON.stringify(value);
    let tree = render(value);
    expect(tree.type).toBe("details");
    expect(content(tree)).toContain("융합 재료 보기");
    expect(boundary.getGuide).not.toHaveBeenCalled();
    expect(elements(tree).some((item) => item.type === "button")).toBe(false);
    toggle(tree, true);
    tree = render(value);
    expect(boundary.getGuide).toHaveBeenCalledWith(doll.id, [normal.id, moon.id]);
    expect(content(tree)).toContain("메인 2개 + 보조 3칸");
    expect(content(tree)).toContain("활력 자극3");
    expect(content(tree)).toContain("달빛 습격");
    expect(content(tree)).toContain("서브 3칸 중 하나");
    expect(content(tree)).toContain("랜덤성");
    expect(content(tree)).not.toContain("100%");
    toggle(tree, false);
    boundary.getGuide.mockClear();
    render(value);
    expect(boundary.getGuide).not.toHaveBeenCalled();
    expect(JSON.stringify(value)).toBe(before);
  });

  it("shows original material names and icons only after expanding their own list", () => {
    let tree = render();
    toggle(tree, true);
    tree = render();
    const materialComponent = elements(tree).find(
      (item) => typeof item.type === "function" && "trait" in item.props,
    )!;
    boundary.cursor = 3;
    const materialTree = (materialComponent.type as (props: unknown) => Element)(
      materialComponent.props,
    );
    expect(content(materialTree)).toContain("1종 보기");
    expect(elements(materialTree).some((item) => item.type === "ul")).toBe(false);
    toggle(materialTree, true);
    boundary.cursor = 3;
    const opened = (materialComponent.type as (props: unknown) => Element)(materialComponent.props);
    expect(content(opened)).toContain("늑대");
    expect(content(opened)).toContain("동물 재료");
    const icon = elements(opened).find((item) => "icon" in item.props)!;
    expect(icon.props.icon).toMatch(/^\/game\/fusion-guide\/.+\.png$/);
    expect(content(opened)).not.toContain("직접 부여 대상");
  });

  it("copies preparation details without a submit action or mutation and invalidates stale copied text", async () => {
    const value = selection();
    const before = JSON.stringify(value);
    const clipboard = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: clipboard } });
    toggle(render(value), true);
    let tree = render(value);
    const copy = elements(tree).find((item) => item.type === "button")!;
    expect(copy.props.type).toBe("button");
    await (copy.props.onClick as () => Promise<void>)();
    const text = clipboard.mock.calls[0][0] as string;
    expect(text).toContain("동물: 늑대");
    expect(text).toContain("활력 자극3");
    expect(text).toContain("5 / 활성 5");
    expect(text).toContain("랜덤성");
    tree = render(value);
    expect(content(tree)).toContain("준비 목록 복사됨");
    expect(JSON.stringify(value)).toBe(before);
    const changed = { ...value, traitIds: [normal.id] };
    expect(content(render(changed))).toContain("준비 목록 복사");
    expect(content(render(changed))).not.toContain("준비 목록 복사됨");
  });

  it("provides a useful fallback after clipboard rejection", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    toggle(render(), true);
    const copy = elements(render()).find((item) => item.type === "button")!;
    await (copy.props.onClick as () => Promise<void>)();
    expect(content(render())).toContain("복사하지 못했습니다");
    expect(elements(render()).some((item) => item.props.role === "status")).toBe(true);
  });

  it("keeps historical unknown items readable rather than inventing a recipe", () => {
    const value = createGearSelection("combatDeviant", "retired-deviant");
    toggle(render(value), true);
    boundary.cursor = 0;
    const tree = GearDeviantFusionGuide({
      selection: value,
      recordedNames: { "retired-deviant": "이전 감염물" },
    });
    expect(content(tree)).toContain("이전 감염물의 융합 재료는 아직 확인되지 않았습니다");
    expect(elements(tree).some((item) => item.type === "button")).toBe(false);
  });

  it("includes guidance on saved build details without changing the snapshot", () => {
    const loadout = createEmptyGearLoadout();
    loadout.context.scenarioKey = "WINTER";
    loadout.slots = [selection()];
    const before = JSON.stringify(loadout);
    const tree = GearLoadoutView({ loadout });
    const guides = elements(tree).filter((item) => item.type === GearDeviantFusionGuide);
    expect(guides).toHaveLength(1);
    expect(guides[0].props.selection).toBe(loadout.slots[0]);
    expect(guides[0].props.scenario).toBe("WINTER");
    const mapLinks = elements(tree).filter((item) => item.type === GearFarmingMapLink);
    expect(mapLinks).toHaveLength(1);
    expect(mapLinks[0].props).toMatchObject({
      kind: "deviant",
      id: doll.id,
      scenario: "WINTER",
    });
    expect(JSON.stringify(loadout)).toBe(before);
  });

  it("passes the selected scenario to animal material map links and excludes furniture", () => {
    const guide = boundary.getGuide(doll.id, [moon.id]);
    const animal = guide.traits[0].directMaterials[0];
    boundary.getGuide.mockReturnValueOnce({
      ...guide,
      traits: [
        {
          ...guide.traits[0],
          directMaterials: [
            animal,
            { ...animal, id: "furniture-fixture", name: "시험 가구", type: "FURNITURE" },
          ],
        },
      ],
    });
    toggle(render(selection(), "ENDLESS_DREAM"), true);
    const tree = render(selection(), "ENDLESS_DREAM");
    const materialComponent = elements(tree).find(
      (item) => typeof item.type === "function" && "trait" in item.props,
    )!;
    expect(materialComponent.props.scenario).toBe("ENDLESS_DREAM");
    boundary.cursor = 3;
    const materials = (materialComponent.type as (props: unknown) => Element)(
      materialComponent.props,
    );
    toggle(materials, true);
    boundary.cursor = 3;
    const opened = (materialComponent.type as (props: unknown) => Element)(materialComponent.props);
    const mapLinks = elements(opened).filter((item) => item.type === GearFarmingMapLink);
    expect(content(opened)).toContain("시험 가구");
    expect(mapLinks).toHaveLength(1);
    expect(mapLinks[0].props).toMatchObject({
      kind: "material",
      id: animal.id,
      name: animal.name,
      scenario: "ENDLESS_DREAM",
    });
  });

  it("retains unknown-source and recipe restrictions in the copied preparation list", () => {
    const guide = boundary.getGuide(doll.id, [moon.id]);
    const limited = {
      ...guide,
      traits: guide.traits.map((trait: (typeof guide.traits)[number]) => ({
        ...trait,
        applicable: false,
        unknownReason: "조합 확인 중",
        directMaterials: trait.directMaterials.map(
          (material: (typeof trait.directMaterials)[number]) => ({
            ...material,
            directWithTarget: false,
          }),
        ),
      })),
    };
    const text = makeFusionPreparationText(limited, { abilityGrade: null, activityGrade: null });
    expect(text).toContain("어빌리티 미기록 / 활성 미기록");
    expect(text).toContain("해당 특성을 가진 감염물을 먼저 준비");
    expect(text).toContain("조합 확인 중");
    expect(text).toContain("적용 가능한 특성인지 확인");
  });
});
