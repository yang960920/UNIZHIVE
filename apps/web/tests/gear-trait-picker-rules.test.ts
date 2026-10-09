import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GearCatalogItem } from "@uniz/build-engine";

type EffectRecord = { dependencies?: readonly unknown[]; cleanup?: () => void };
const boundary = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  effectCursor: 0,
  effects: [] as EffectRecord[],
  pendingEffects: [] as (() => void)[],
  catalog: [] as GearCatalogItem[],
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.states))
      boundary.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      boundary.states[index],
      (next: unknown) => {
        boundary.states[index] = typeof next === "function" ? next(boundary.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.states)) boundary.states[index] = { current: initial };
    return boundary.states[index];
  },
  useMemo: (factory: () => unknown) => factory(),
  useId: () => "trait-rules-test",
  useEffect: (effect: () => void | (() => void), dependencies?: readonly unknown[]) => {
    const index = boundary.effectCursor++;
    const previous = boundary.effects[index];
    if (
      previous &&
      dependencies &&
      previous.dependencies &&
      dependencies.length === previous.dependencies.length &&
      dependencies.every((value, at) => Object.is(value, previous.dependencies![at]))
    )
      return;
    boundary.pendingEffects.push(() => {
      previous?.cleanup?.();
      const cleanup = effect();
      boundary.effects[index] = {
        dependencies,
        cleanup: typeof cleanup === "function" ? cleanup : undefined,
      };
    });
  },
}));
vi.mock("@uniz/build-engine", async (original) => {
  const actual = await original<typeof import("@uniz/build-engine")>();
  const trait = (
    id: string,
    name: string,
    traitIconGroup: string,
    isDeviantShinyTrait = false,
    extra: Partial<GearCatalogItem> = {},
  ): GearCatalogItem => ({
    id,
    name,
    aliases: [],
    kind: "DEVIANT_TRAIT",
    allowedSlots: ["combatDeviant"],
    weaponFamily: null,
    compatibleWeaponFamilies: [],
    accessorySlot: null,
    moduleGeneration: null,
    allowedSuffixIds: [],
    allowedTraitIds: [],
    // Different asset paths deliberately verify source icon identity, rather than filename equality.
    icon: `/test/traits/${id}.png`,
    traitIconGroup,
    isDeviantShinyTrait,
    rarity: null,
    description: `${name}의 검증용 효과`,
    setId: null,
    isKeyArmor: false,
    scenarioKeys: [],
    source: { url: null, evidence: "controlled UI fixture", verifiedAt: "2026-10-07" },
    ...extra,
  });
  boundary.catalog = [
    trait("energy-a", "활력 자극 3", "fusion_cbt2_icon_attribute6.png"),
    trait("energy-b", "전력계 역회전 2", "fusion_cbt2_icon_attribute6.png"),
    trait("shiny-star", "역행하는 별", "fusion_cbt2_icon_attribute2.png", true),
    trait("combat-gun", "갓 거너", "fusion_cbt2_icon_attribute2.png"),
    trait("shiny-yarn", "털실 저주물", "fusion_cbt2_icon_attribute11.png", true),
    trait("work-hard", "진정한 노력파", "fusion_cbt2_icon_attribute7.png"),
    trait("work-water", "수역 휴면", "fusion_cbt2_icon_attribute7.png"),
    trait("shiny-lavender", "약점 마스터 - 라벤더 블루", "fusion_cbt2_icon_attribute2.png", true),
    trait("fusion-moon", "달빛 습격", "fusion_ctb2_icon_attribute13.png", false, {
      traitFusionMaterialType: "ANIMAL",
      aliases: ["늑대"],
    }),
    trait("fusion-flash", "번뜩", "fusion_ctb2_icon_attribute13.png", false, {
      traitFusionMaterialType: "FURNITURE",
    }),
    trait("plain", "명확한 판단", "fusion_cbt2_icon_attribute3.png"),
    trait("creation-flash", "번뜩", "fusion_cbt2_icon_attribute3.png"),
    trait("fusion-precision", "정밀한 순간", "fusion_ctb2_icon_attribute13.png", false, {
      traitFusionMaterialType: "FURNITURE",
      aliases: ["탁상용 전자시계"],
    }),
  ];
  return { ...actual, GEAR_CATALOG: boundary.catalog };
});
vi.mock("next/image", () => ({ default: "Image" }));
vi.mock("@/lib/map-farming", () => ({ getFarmingMapLink: () => null }));
vi.mock("@radix-ui/react-dialog", () =>
  Object.fromEntries(
    ["Root", "Portal", "Overlay", "Content", "Title", "Description", "Close"].map((key) => [
      key,
      `Dialog.${key}`,
    ]),
  ),
);

import { GearTraitSelector } from "../src/components/build-planner/gear-trait-picker";

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
function find(elements: Element[], predicate: (element: Element) => boolean) {
  const element = elements.find(predicate);
  if (!element) throw new Error("Missing trait picker control");
  return element;
}
function harness(initialIds: string[] = [], allowedIds = boundary.catalog.map((item) => item.id)) {
  let selectedIds = [...initialIds];
  const update = vi.fn((ids: string[]) => {
    selectedIds = ids;
  });
  function render() {
    boundary.cursor = 0;
    boundary.effectCursor = 0;
    const elements = flatten(
      GearTraitSelector({
        allowedIds,
        selectedIds,
        recordedNames: { "retired-trait": "이전 특성 기록" },
        onChange: update,
      }),
    );
    const effects = boundary.pendingEffects.splice(0);
    effects.forEach((effect) => effect());
    return elements;
  }
  const input = () => find(render(), (element) => element.props.role === "combobox");
  const option = (id: string) =>
    find(
      render(),
      (element) => element.props.role === "option" && element.props.id === `trait-rules-test-${id}`,
    );
  const open = () => (input().props.onFocus as () => void)();
  const key = (value: string, composing = false, timeStamp = 1000) => {
    const event = {
      key: value,
      keyCode: composing ? 229 : 0,
      timeStamp,
      nativeEvent: { isComposing: composing },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    (input().props.onKeyDown as (event: unknown) => void)(event);
    return event;
  };
  return { render, input, option, open, key, update, selected: () => selectedIds };
}

beforeEach(() => {
  boundary.states = [];
  boundary.cursor = 0;
  boundary.effectCursor = 0;
  boundary.effects = [];
  boundary.pendingEffects = [];
  vi.stubGlobal("document", { getElementById: vi.fn(() => null) });
});
afterEach(() => {
  boundary.effects.forEach((effect) => effect.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Deviant trait selection gameplay rules", () => {
  it.each([
    ["energy-a", "energy-b"],
    ["shiny-star", "combat-gun"],
    ["work-hard", "work-water"],
    ["fusion-moon", "fusion-flash"],
  ])("blocks %s + %s with an explanation and rechecks direct click handlers", (first, second) => {
    const picker = harness([first]);
    picker.open();
    const blocked = picker.option(second);
    expect(blocked.props.disabled).toBe(true);
    expect(text(blocked.props.children)).toContain("같은 아이콘");
    (blocked.props.onClick as () => void)();
    expect(picker.update).not.toHaveBeenCalled();
    expect(picker.selected()).toEqual([first]);
  });

  it("blocks two shiny traits even when their displayed icon groups differ", () => {
    const picker = harness(["shiny-star"]);
    picker.open();
    const blocked = picker.option("shiny-yarn");
    expect(blocked.props.disabled).toBe(true);
    expect(text(blocked.props.children)).toContain("이로치");
    (blocked.props.onClick as () => void)();
    expect(picker.update).not.toHaveBeenCalled();
  });

  it("unlocks a replacement after the user deliberately removes the conflicting trait", () => {
    const picker = harness(["energy-a"]);
    picker.open();
    expect(picker.option("energy-b").props.disabled).toBe(true);
    const remove = find(
      picker.render(),
      (element) => element.props["aria-label"] === "활력 자극 3 특성 해제",
    );
    (remove.props.onClick as () => void)();
    expect(picker.selected()).toEqual([]);
    const replacement = picker.option("energy-b");
    expect(replacement.props.disabled).toBe(false);
    (replacement.props.onClick as () => void)();
    expect(picker.update).toHaveBeenLastCalledWith(["energy-b"]);
  });

  it("allows Lavender Blue together with Moonlight Raid instead of treating fusion as shiny", () => {
    const picker = harness(["shiny-lavender"]);
    picker.open();
    const fusion = picker.option("fusion-moon");
    expect(fusion.props.disabled).toBe(false);
    (fusion.props.onClick as () => void)();
    expect(picker.update).toHaveBeenCalledWith(["shiny-lavender", "fusion-moon"]);
    expect(picker.input().props["aria-expanded"]).toBe(false);
  });

  it("shows animal and furniture origins while keeping their common fusion icon mutually exclusive", () => {
    const picker = harness(["fusion-moon"], ["fusion-moon", "fusion-precision"]);
    picker.open();
    expect(text(picker.option("fusion-moon").props.children)).toContain("동물 융합");
    const furniture = picker.option("fusion-precision");
    expect(text(furniture.props.children)).toContain("가구 융합");
    expect(text(furniture.props.children)).toContain("같은 아이콘");
    expect(furniture.props.disabled).toBe(true);
    (furniture.props.onClick as () => void)();
    picker.key("Enter");
    expect(picker.update).not.toHaveBeenCalled();
    expect(picker.selected()).toEqual(["fusion-moon"]);
  });

  it("skips selected and conflicting options during keyboard navigation", () => {
    const picker = harness(["energy-a"], ["energy-b", "energy-a", "plain", "fusion-moon"]);
    picker.key("ArrowDown");
    expect(picker.input().props["aria-activedescendant"]).toBe("trait-rules-test-plain");
    picker.key("ArrowDown");
    expect(picker.input().props["aria-activedescendant"]).toBe("trait-rules-test-fusion-moon");
    picker.key("ArrowUp");
    picker.key("Enter");
    expect(picker.update).toHaveBeenCalledWith(["energy-a", "plain"]);
  });

  it("keeps capped historical traits removable without activating or adding a disabled candidate", () => {
    const initial = [
      "retired-trait",
      ...Array.from({ length: 15 }, (_, index) => `historical-trait-${index}`),
    ];
    const picker = harness(initial, ["plain"]);
    picker.open();
    const blocked = picker.option("plain");
    expect(blocked.props.disabled).toBe(true);
    expect(picker.input().props["aria-activedescendant"]).toBeUndefined();
    picker.key("ArrowDown");
    expect(picker.input().props["aria-activedescendant"]).toBeUndefined();
    picker.key("Enter");
    (blocked.props.onClick as () => void)();
    expect(picker.update).not.toHaveBeenCalled();
    expect(picker.selected()).toEqual(initial);

    const remove = find(
      picker.render(),
      (element) => element.props["aria-label"] === "이전 특성 기록 특성 해제",
    );
    expect(remove.props.disabled).not.toBe(true);
    (remove.props.onClick as () => void)();
    expect(picker.update).toHaveBeenCalledWith(initial.slice(1));
    expect(picker.selected()).toEqual(initial.slice(1));
    expect(picker.option("plain").props.disabled).toBe(false);
  });

  it("leaves existing invalid selections intact, identifies conflicts and permits deliberate removal", () => {
    const initial = ["retired-trait", "energy-a", "energy-b", "shiny-star", "shiny-yarn"];
    const picker = harness(initial);
    const elements = picker.render();
    const alerts = elements.filter((element) => element.props.role === "alert");
    expect(alerts.map((element) => text(element.props.children)).join(" ")).toContain(
      "같은 아이콘",
    );
    expect(alerts.map((element) => text(element.props.children)).join(" ")).toContain("이로치");
    const conflictChips = elements.filter(
      (element) =>
        element.type === "span" &&
        String(element.props.className).includes("gear-trait-chip") &&
        String(element.props.className).includes("is-conflicting"),
    );
    expect(conflictChips).toHaveLength(4);
    expect(picker.update).not.toHaveBeenCalled();
    expect(picker.selected()).toEqual(initial);
    const remove = find(
      elements,
      (element) => element.props["aria-label"] === "전력계 역회전 2 특성 해제",
    );
    (remove.props.onClick as () => void)();
    expect(picker.selected()).toEqual(["retired-trait", "energy-a", "shiny-star", "shiny-yarn"]);
    expect(text(picker.render()[0].props.children)).toContain("이전 특성 기록");
  });

  it("allows an unrelated valid addition while preserving an old conflict for correction", () => {
    const picker = harness(["energy-a", "energy-b"]);
    picker.open();
    const valid = picker.option("plain");
    expect(valid.props.disabled).toBe(false);
    (valid.props.onClick as () => void)();
    expect(picker.selected()).toEqual(["energy-a", "energy-b", "plain"]);
  });

  it("filters live after 160 ms and guards IME Enter without requiring a search submission", () => {
    vi.useFakeTimers();
    const picker = harness(["energy-a"]);
    (picker.input().props.onCompositionStart as () => void)();
    (picker.input().props.onChange as (event: unknown) => void)({ target: { value: "달빛" } });
    expect(picker.render().some((element) => element.props.role === "option")).toBe(false);
    vi.advanceTimersByTime(159);
    expect(picker.render().some((element) => element.props.role === "option")).toBe(false);
    vi.advanceTimersByTime(1);
    const options = picker.render().filter((element) => element.props.role === "option");
    expect(options).toHaveLength(1);
    expect(text(options[0].props.children)).toContain("달빛 습격");
    picker.key("Enter", true);
    expect(picker.update).not.toHaveBeenCalled();
    (picker.input().props.onCompositionEnd as (event: unknown) => void)({
      currentTarget: { value: "달빛" },
      timeStamp: 1000,
    });
    picker.key("Enter", false, 1040);
    expect(picker.update).not.toHaveBeenCalled();
    picker.key("Enter", false, 1100);
    expect(picker.update).toHaveBeenCalledWith(["energy-a", "fusion-moon"]);
  });

  it("distinguishes two identically named traits by their category and preserves both identities", () => {
    vi.useFakeTimers();
    const picker = harness();
    (picker.input().props.onChange as (event: unknown) => void)({ target: { value: "번뜩" } });
    picker.render();
    vi.advanceTimersByTime(160);
    const results = picker.render().filter((element) => element.props.role === "option");
    expect(results).toHaveLength(2);
    expect(text(picker.option("fusion-flash").props.children)).toContain("융합");
    expect(text(picker.option("creation-flash").props.children)).toContain("창조");
    (picker.option("fusion-flash").props.onClick as () => void)();
    picker.open();
    (picker.option("creation-flash").props.onClick as () => void)();
    expect(picker.selected()).toEqual(["fusion-flash", "creation-flash"]);
  });
});
