import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GearCatalogItem, PlannerGearLoadout } from "@uniz/build-engine";
import type { PlannerActionState, PlannerBuildDetail } from "../src/lib/data/build-planner-types";

const boundary = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  action: null as
    ((previous: PlannerActionState, form: FormData) => Promise<PlannerActionState>) | null,
  result: { ok: false, message: "" } as PlannerActionState,
  save: vi.fn(),
  push: vi.fn(),
  catalog: [] as GearCatalogItem[],
  effects: [] as (() => void | (() => void))[],
  clientReady: true,
  defaultBuildVisibility: "PRIVATE" as "PRIVATE" | "HIVE" | "PUBLIC",
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  memo: (component: unknown) => component,
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
  useCallback: (callback: unknown) => callback,
  useId: () => "gear-search-test",
  useSyncExternalStore: (
    _subscribe: unknown,
    getSnapshot: () => unknown,
    getServerSnapshot: () => unknown,
  ) => (boundary.clientReady ? getSnapshot() : getServerSnapshot()),
  useEffect: (effect: () => void | (() => void)) => {
    boundary.effects.push(effect);
  },
  useActionState: (action: typeof boundary.action) => {
    boundary.action = action;
    return [boundary.result, action, false];
  },
}));
vi.mock("@uniz/build-engine", async (original) => {
  const actual = await original<typeof import("@uniz/build-engine")>();
  const item = (
    id: string,
    kind: GearCatalogItem["kind"],
    extra: Partial<GearCatalogItem> = {},
  ): GearCatalogItem => ({
    id,
    name: id,
    aliases: [],
    kind,
    allowedSlots: [],
    weaponFamily: null,
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
    source: { url: null, evidence: "test fixture", verifiedAt: "2026-10-07" },
    ...extra,
  });
  boundary.catalog = [
    item("weapon-a", "WEAPON", {
      name: "시험 무기",
      aliases: ["테스트 별칭"],
      allowedSlots: ["primary", "secondary"],
      weaponFamily: "SMG",
    }),
    item("weapon-b", "WEAPON", { allowedSlots: ["primary", "secondary"], weaponFamily: "RIFLE" }),
    item("weapon-unknown", "WEAPON", { allowedSlots: ["primary"], weaponFamily: null }),
    item("module-a", "MODULE", {
      allowedSlots: ["primary"],
      moduleGeneration: "NEW",
      compatibleWeaponFamilies: ["SMG"],
      allowedSuffixIds: ["suffix-a"],
    }),
    item("module-b", "MODULE", {
      allowedSlots: ["primary"],
      moduleGeneration: "NEW",
      compatibleWeaponFamilies: ["SMG"],
    }),
    item("suffix-a", "MODULE_SUFFIX"),
    item("muzzle-a", "ACCESSORY", {
      accessorySlot: "muzzle",
      allowedSlots: ["primary"],
      compatibleWeaponFamilies: ["SMG"],
    }),
    item("deviant-a", "DEVIANT", {
      allowedSlots: ["combatDeviant"],
      allowedTraitIds: ["trait-a", "trait-b"],
    }),
    item("trait-a", "DEVIANT_TRAIT", {
      name: "전력계 역회전",
      aliases: ["전력"],
      allowedSlots: ["combatDeviant"],
    }),
    item("trait-b", "DEVIANT_TRAIT", { name: "활동 전문가", allowedSlots: ["combatDeviant"] }),
    ...Array.from({ length: 24 }, (_, index) =>
      item(`trait-page-${index}`, "DEVIANT_TRAIT", {
        name: `페이지 특성 ${index}`,
        allowedSlots: ["combatDeviant"],
      }),
    ),
    item("armor-key-top", "ARMOR", { name: "핵심 상의", allowedSlots: ["top"], isKeyArmor: true }),
    item("armor-key-gloves", "ARMOR", {
      name: "핵심 장갑",
      allowedSlots: ["gloves"],
      isKeyArmor: true,
    }),
    ...(["helmet", "top", "bottom", "shoes", "gloves", "mask"] as const).map((slot) =>
      item(`armor-${slot}`, "ARMOR", { allowedSlots: [slot], setId: "lonewolf" }),
    ),
    // Keep these source records intact so the melee picker cannot pass using invented allowances.
    ...actual.GEAR_CATALOG.filter((entry) =>
      [
        "weapon-10911401",
        "module-19500001",
        "module-19505002",
        "module-19500782",
        "module-suffix-frame-0",
      ].includes(entry.id),
    ),
  ];
  return {
    ...actual,
    GEAR_CATALOG: boundary.catalog,
    parseGearLoadoutForSave: vi.fn((input: unknown) =>
      actual.parseGearLoadoutForSave(input, boundary.catalog),
    ),
    getEligibleGearItems: (
      slot: Parameters<typeof actual.getEligibleGearItems>[0],
      context: Parameters<typeof actual.getEligibleGearItems>[1],
    ) => actual.getEligibleGearItems(slot, context, boundary.catalog),
    getEligibleGearAttachments: (
      slot: Parameters<typeof actual.getEligibleGearAttachments>[0],
      key: Parameters<typeof actual.getEligibleGearAttachments>[1],
      parent: string,
      context: Parameters<typeof actual.getEligibleGearAttachments>[3],
    ) => actual.getEligibleGearAttachments(slot, key, parent, context, boundary.catalog),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@/components/user-preferences-provider", async () => {
  const { DEFAULT_USER_PREFERENCES } = await import("../src/lib/user-preferences");
  return {
    useUserPreferences: () => ({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        defaultBuildVisibility: boundary.defaultBuildVisibility,
      },
    }),
  };
});
vi.mock("next/image", () => ({ default: "Image" }));
vi.mock("@/app/lab/actions", () => ({ saveBuildPlanner: boundary.save }));
vi.mock("@/components/content/editor", () => ({ ContentEditor: "ContentEditor" }));
vi.mock("@/components/content/presentation", () => ({ YouTubeField: "YouTubeField" }));
vi.mock("@/lib/scenario-presets", () => import("../src/lib/scenario-presets"));
vi.mock("@/lib/map-farming", () => ({ getFarmingMapLink: () => null }));
vi.mock("@uniz/ui", () => ({ Card: "Card" }));
vi.mock("@radix-ui/react-dialog", () =>
  Object.fromEntries(
    ["Root", "Portal", "Overlay", "Content", "Title", "Description", "Close"].map((key) => [
      key,
      `Dialog.${key}`,
    ]),
  ),
);

import {
  CONSUMABLE_CATALOG,
  createEmptyGearLoadout,
  createGearSelection,
  parseGearLoadoutForSave,
} from "@uniz/build-engine";
import { PlannerEditor } from "../src/components/build-planner/editor";
import { LegacyPlannerEditor } from "../src/components/build-planner/legacy-editor";
import { GearPlannerEditor } from "../src/components/build-planner/gear-editor";
import {
  changeGearAttachment,
  countGearArmorSets,
  equipGearItem,
  parseGearNumber,
  searchGearItems,
} from "../src/components/build-planner/gear-editor-model";
import {
  GearCatalogPicker,
  GearItemInfo,
} from "../src/components/build-planner/gear-catalog-picker";
import { GearTraitSelector } from "../src/components/build-planner/gear-trait-picker";
import { GearDeviantFusionGuide } from "../src/components/build-planner/gear-fusion-guide";
import { GearConsumablesEditor } from "../src/components/build-planner/gear-consumables";

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
  if (!element) throw new Error("Missing gear editor control");
  return element;
}
let initial: PlannerBuildDetail | undefined;
function render(preview = false) {
  boundary.cursor = 0;
  return flatten(GearPlannerEditor({ initial, preview }));
}
function field(label: string) {
  const element = find(
    render(),
    (element) =>
      element.type === "label" &&
      text(
        Array.isArray(element.props.children) ? element.props.children[0] : element.props.children,
      ).trim() === label,
  );
  return find(flatten(element.props.children), (node) =>
    ["input", "select", "textarea"].includes(String(node.type)),
  );
}
function change(label: string, value: string) {
  (field(label).props.onChange as (event: unknown) => void)({ target: { value } });
}
function snapshot(): PlannerGearLoadout {
  return JSON.parse(
    find(render(), (element) => element.props.name === "loadout").props.value as string,
  );
}
function detail(loadout: PlannerGearLoadout): PlannerBuildDetail {
  const version = {
    id: "1a740cd9-7e00-4d39-8a97-3f82d81a29e3",
    version: 1,
    notes: "",
    createdAt: "2026-10-07T00:00:00.000Z",
  };
  return {
    id: "c6629fa4-c63b-4a2e-8331-7b19c4ebf614",
    title: "기존 구성",
    description: "",
    visibility: "PRIVATE",
    owner: { id: "owner", name: "Fixture owner", handle: null },
    latestVersion: 1,
    updatedAt: version.createdAt,
    createdAt: version.createdAt,
    isOwner: true,
    archivedAt: null,
    versions: [version],
    selectedVersion: { ...version, schemaVersion: "uniz-gear.v2", loadout },
    mayEdit: true,
  };
}
function loadedWeapon() {
  const loadout = createEmptyGearLoadout();
  const selected = createGearSelection("primary", "weapon-a");
  selected.level = 5;
  selected.attachments.module = "module-a";
  selected.attachments.moduleSuffix = "suffix-a";
  selected.attachments.moduleLevel = 17;
  loadout.slots = [selected];
  initial = detail(loadout);
}
function openPicker() {
  const slot = find(
    render(),
    (element) => element.props.slot === "primary" && typeof element.props.onOpen === "function",
  );
  (slot.props.onOpen as (slot: string) => void)("primary");
  return find(render(), (element) => element.type === GearCatalogPicker);
}

beforeEach(() => {
  boundary.states = [];
  boundary.cursor = 0;
  boundary.action = null;
  boundary.effects = [];
  boundary.clientReady = true;
  boundary.defaultBuildVisibility = "PRIVATE";
  initial = undefined;
  boundary.result = { ok: false, message: "" };
  boundary.save.mockReset().mockResolvedValue({ ok: false, message: "retry" });
  boundary.push.mockReset();
  vi.mocked(parseGearLoadoutForSave).mockClear();
  vi.stubGlobal("document", { activeElement: null, getElementById: vi.fn(() => null) });
  vi.stubGlobal("HTMLElement", class {});
});

describe("Gear editor consumable save boundary", () => {
  it("preserves Chef selections on a class change and blocks the server action until each excess category is cleared", async () => {
    const loadout = createEmptyGearLoadout();
    loadout.context.characterClass = "셰프";
    loadout.consumables = {
      foodIds: CONSUMABLE_CATALOG.filter((item) => item.kind === "FOOD")
        .slice(0, 2)
        .map((item) => item.id),
      drinkIds: CONSUMABLE_CATALOG.filter((item) => item.kind === "DRINK")
        .slice(0, 2)
        .map((item) => item.id),
      notes: "재료 기록 유지",
    };
    initial = detail(loadout);
    change("클래스", "수렵");
    expect(snapshot().consumables).toEqual(loadout.consumables);
    const save = () =>
      find(render(), (element) => element.type === "button" && element.props.type === "submit");
    expect(save().props.disabled).toBe(true);
    const denied = await boundary.action!({ ok: false, message: "" }, new FormData());
    expect(denied.message).toContain("추가 도핑을 해제");
    expect(boundary.save).not.toHaveBeenCalled();
    const editor = find(render(), (element) => element.type === GearConsumablesEditor);
    (editor.props.onChange as (value: unknown) => void)({
      ...loadout.consumables,
      foodIds: loadout.consumables.foodIds.slice(0, 1),
      drinkIds: loadout.consumables.drinkIds.slice(0, 1),
    });
    expect(save().props.disabled).toBe(false);
    expect(snapshot().consumables?.notes).toBe("재료 기록 유지");
  });
});

describe("Gear editor boundaries and draft preservation", () => {
  it("uses the saved HIVE default for new builds without resetting an in-progress visibility choice", () => {
    boundary.defaultBuildVisibility = "HIVE";
    expect(find(render(), (element) => element.props.name === "visibility").props.value).toBe(
      "HIVE",
    );
    boundary.defaultBuildVisibility = "PUBLIC";
    expect(find(render(), (element) => element.props.name === "visibility").props.value).toBe(
      "HIVE",
    );
  });
  it("preserves an existing PRIVATE build when the user's new-build default is HIVE", () => {
    boundary.defaultBuildVisibility = "HIVE";
    loadedWeapon();
    expect(find(render(), (element) => element.props.name === "visibility").props.value).toBe(
      "PRIVATE",
    );
  });
  it("opens equipped-slot details without reopening search and changes only through the change button", () => {
    loadedWeapon();
    const before = snapshot();
    const slot = find(render(), (element) => element.props.slot === "primary");
    const card = flatten((slot.type as (props: unknown) => unknown)(slot.props));
    (
      find(card, (element) => element.props.id === "gear-slot-primary").props.onClick as () => void
    )();
    expect(render().some((element) => element.type === GearCatalogPicker)).toBe(false);
    expect(render().some((element) => element.props.className === "gear-attachment-row")).toBe(
      true,
    );
    expect(snapshot()).toEqual(before);
    (
      find(card, (element) => element.props["aria-label"] === "주 무기 장비 변경").props
        .onClick as () => void
    )();
    expect(render().some((element) => element.type === GearCatalogPicker)).toBe(true);
    expect(snapshot()).toEqual(before);
  });
  it("blocks a second core armor without replacing or deleting the first", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots = [createGearSelection("top", "armor-key-top")];
    initial = detail(loadout);
    const gloves = find(render(), (element) => element.props.slot === "gloves");
    (gloves.props.onOpen as (slot: string) => void)("gloves");
    const picker = find(render(), (element) => element.type === GearCatalogPicker);
    expect((picker.props.disabledReasons as Record<string, string>)["armor-key-gloves"]).toContain(
      "핵심 방어구 1개 제한",
    );
    (picker.props.onChoose as (id: string) => void)("armor-key-gloves");
    expect(snapshot().slots).toEqual(loadout.slots);
    expect(
      render().some(
        (element) =>
          element.props.role === "alert" && text(element.props.children).includes("1개만"),
      ),
    ).toBe(true);
    (picker.props.onChoose as (id: string) => void)("armor-gloves");
    expect(snapshot().slots).toHaveLength(2);
    expect(snapshot().slots[0].itemId).toBe("armor-key-top");
  });
  it("shows the chosen wolf set piece count without calculating set effects", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots = (["helmet", "top", "bottom", "shoes", "gloves", "mask"] as const).map((slot) =>
      createGearSelection(slot, `armor-${slot}`),
    );
    initial = detail(loadout);
    expect(
      text(
        find(render(), (element) => element.props["aria-label"] === "선택한 방어구 세트 구성").props
          .children,
      ),
    ).toContain("울프 세트 · 6부위");
    expect(snapshot()).toEqual(loadout);
  });
  it("moves between module and accessory tabs with arrow keys while retaining the draft", () => {
    loadedWeapon();
    const before = snapshot();
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    vi.stubGlobal("document", { activeElement: null, getElementById });
    const moduleTab = find(render(), (element) => element.props.id === "gear-module-tab");
    const event = { key: "ArrowRight", preventDefault: vi.fn() };
    (moduleTab.props.onKeyDown as (event: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(getElementById).toHaveBeenCalledWith("gear-accessory-tab");
    expect(focus).toHaveBeenCalledOnce();
    expect(
      find(render(), (element) => element.props.id === "gear-accessory-tab").props.tabIndex,
    ).toBe(0);
    expect(find(render(), (element) => element.props.id === "gear-module-tab").props.tabIndex).toBe(
      -1,
    );
    expect(snapshot()).toEqual(before);
  });
  it("keeps historical names and removed catalog items until deliberate replacement", async () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots = [createGearSelection("primary", "removed-weapon")];
    loadout.catalogNames = { "removed-weapon": "이전에 저장한 무기" };
    initial = detail(loadout);
    const slot = find(render(), (element) => element.props.slot === "primary");
    expect(slot.props.savedName).toBe("이전에 저장한 무기");
    expect(snapshot().slots[0].itemId).toBe("removed-weapon");
    expect(snapshot().catalogNames).toEqual(loadout.catalogNames);
    expect(parseGearLoadoutForSave).not.toHaveBeenCalled();
    expect((await boundary.action!({ ok: false, message: "" }, new FormData())).ok).toBe(false);
    expect(boundary.save).not.toHaveBeenCalled();
    const picker = openPicker();
    (picker.props.onChoose as (id: string) => void)("weapon-a");
    expect(snapshot().slots[0].itemId).toBe("weapon-a");
    const form = new FormData();
    await boundary.action!({ ok: false, message: "" }, form);
    expect(boundary.save).toHaveBeenCalledOnce();
    expect(JSON.parse(form.get("loadout") as string).catalogNames).toEqual({
      "weapon-a": "시험 무기",
    });
    expect(loadout.slots[0].itemId).toBe("removed-weapon");
  });
  it("allows deliberate removal of a retired module without dropping its parent", () => {
    loadedWeapon();
    initial!.selectedVersion.loadout = {
      ...initial!.selectedVersion.loadout!,
    } as PlannerGearLoadout;
    const loadout = initial!.selectedVersion.loadout as PlannerGearLoadout;
    loadout.slots[0].attachments.module = "removed-module";
    loadout.catalogNames = { "removed-module": "이전 모듈 이름" };
    const remove = find(
      render(),
      (element) => element.type === "button" && text(element.props.children) === "이전 모듈 해제",
    );
    expect(snapshot().slots[0].attachments.module).toBe("removed-module");
    (remove.props.onClick as () => void)();
    expect(snapshot().slots[0]).toMatchObject({
      itemId: "weapon-a",
      level: 5,
      attachments: { module: null, moduleSuffix: null, moduleLevel: null },
    });
  });
  it("defaults new builds to V2 and preserves the legacy editor for historical V1", () => {
    expect(PlannerEditor({}).type).toBe(GearPlannerEditor);
    loadedWeapon();
    expect(PlannerEditor({ initial }).type).toBe(GearPlannerEditor);
    initial!.selectedVersion = {
      ...initial!.selectedVersion,
      schemaVersion: "uniz-planner.v1",
      loadout: {
        schemaVersion: "uniz-planner.v1",
        context: createEmptyGearLoadout().context,
        entries: [],
      },
    };
    expect(PlannerEditor({ initial }).type).toBe(LegacyPlannerEditor);
  });
  it("keeps the original optimistic stamp and unsaved input when fresh server props arrive", () => {
    loadedWeapon();
    render();
    change("빌드 이름", "입력 중인 빌드");
    change("장비 레벨", "12");
    initial = { ...initial!, updatedAt: "2026-10-07T00:10:00.000Z", title: "다른 창의 제목" };
    expect(
      find(render(), (element) => element.props.name === "expectedUpdatedAt").props.value,
    ).toBe("2026-10-07T00:00:00.000Z");
    expect(field("빌드 이름").props.value).toBe("입력 중인 빌드");
    expect(snapshot().slots[0].level).toBe(12);
  });
  it.each(["NaN", "Infinity", "1e309", "0", "1.5", "-1"])(
    "retains invalid numeric input %s and prevents saving instead of serializing null",
    async (value) => {
      loadedWeapon();
      change("장비 레벨", value);
      expect(field("장비 레벨").props.value).toBe(value);
      expect(field("장비 레벨").props["aria-invalid"]).toBe(true);
      expect(snapshot().slots[0].level).toBe(5);
      expect((await boundary.action!({ ok: false, message: "" }, new FormData())).ok).toBe(false);
      expect(boundary.save).not.toHaveBeenCalled();
      change("장비 레벨", "");
      expect(snapshot().slots[0].level).toBeNull();
      expect(field("장비 레벨").props["aria-invalid"]).toBe(false);
    },
  );
  it("records deviant grades separately from the recommendation score", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots = [createGearSelection("combatDeviant", "deviant-a")];
    initial = detail(loadout);
    const card = find(render(), (element) => element.props.slot === "combatDeviant");
    (card.props.onFocus as (slot: string) => void)("combatDeviant");
    change("어빌리티 등급", "7");
    change("활성 등급", "3");
    const star = find(render(), (element) => element.props["aria-label"] === "추천 5점");
    (star.props.onClick as () => void)();
    expect(snapshot()).toMatchObject({
      recommendation: { rating: 5 },
      slots: [{ abilityGrade: 7, activityGrade: 3 }],
    });
  });
  it("passes the current scenario into deviant details, fusion materials and the selection dialog", () => {
    const loadout = createEmptyGearLoadout();
    loadout.context.scenarioKey = "WINTER";
    loadout.slots = [createGearSelection("combatDeviant", "deviant-a")];
    initial = detail(loadout);
    const card = find(render(), (element) => element.props.slot === "combatDeviant");
    (card.props.onFocus as (slot: string) => void)("combatDeviant");
    expect(find(render(), (element) => element.type === GearItemInfo).props.scenario).toBe(
      "WINTER",
    );
    expect(
      find(render(), (element) => element.type === GearDeviantFusionGuide).props.scenario,
    ).toBe("WINTER");
    const changeButton = find(
      render(),
      (element) => element.type === "button" && text(element.props.children) === "장비 변경",
    );
    (changeButton.props.onClick as () => void)();
    expect(find(render(), (element) => element.type === GearCatalogPicker).props.scenario).toBe(
      "WINTER",
    );
    expect(snapshot().slots).toEqual(loadout.slots);
  });
  it("preserves a failed save, validates only at save time and submits trusted catalog names", async () => {
    loadedWeapon();
    render();
    change("빌드 이름", "새 입력");
    change("장비 레벨", "12");
    expect(parseGearLoadoutForSave).not.toHaveBeenCalled();
    const form = new FormData();
    form.set("title", "새 입력");
    const result = await boundary.action!({ ok: false, message: "" }, form);
    expect(result.ok).toBe(false);
    expect(boundary.save).toHaveBeenCalledOnce();
    expect(parseGearLoadoutForSave).toHaveBeenCalledOnce();
    expect(JSON.parse(form.get("loadout") as string).catalogNames["weapon-a"]).toBe("시험 무기");
    expect(field("빌드 이름").props.value).toBe("새 입력");
    expect(snapshot().slots[0].level).toBe(12);
  });
  it("clears dependent attachments and malformed text after deliberate weapon replacement", () => {
    loadedWeapon();
    change("장비 레벨", "invalid");
    const picker = openPicker();
    (picker.props.onChoose as (id: string) => void)("weapon-b");
    expect(snapshot().slots[0]).toMatchObject({
      itemId: "weapon-b",
      level: null,
      attachments: { module: null, moduleSuffix: null, moduleLevel: null },
    });
    expect(field("장비 레벨").props.value).toBe("");
    expect(field("장비 레벨").props["aria-invalid"]).toBe(false);
  });
  it("blocks preview writes and blocks another save once the first one succeeded", async () => {
    render(true);
    expect((await boundary.action!({ ok: false, message: "" }, new FormData())).ok).toBe(false);
    expect(boundary.save).not.toHaveBeenCalled();
    boundary.result = { ok: true, message: "saved", href: "/lab" };
    render();
    expect(find(render(), (element) => element.type === "fieldset").props.disabled).toBe(true);
    expect(await boundary.action!(boundary.result, new FormData())).toEqual(boundary.result);
    expect(boundary.save).not.toHaveBeenCalled();
  });
  it("does not offer attachments for a weapon with unknown compatibility", () => {
    const loadout = createEmptyGearLoadout();
    loadout.slots = [createGearSelection("primary", "weapon-unknown")];
    initial = detail(loadout);
    const button = find(
      render(),
      (element) => element.type === "button" && element.props.className === "gear-attachment-row",
    );
    (button.props.onClick as () => void)();
    expect(find(render(), (element) => element.type === GearCatalogPicker).props.items).toEqual([]);
  });
  it.each(["module-19500001", "module-19505002"])(
    "selects source-approved %s from the melee module panel and saves without invented suffix or level",
    async (moduleId) => {
      const melee = find(render(), (element) => element.props.slot === "melee");
      (melee.props.onOpen as (slot: string) => void)("melee");
      const weaponPicker = find(render(), (element) => element.type === GearCatalogPicker);
      expect((weaponPicker.props.items as GearCatalogItem[]).map((item) => item.id)).toContain(
        "weapon-10911401",
      );
      (weaponPicker.props.onChoose as (id: string) => void)("weapon-10911401");
      expect(snapshot().slots[0]).toMatchObject({ slot: "melee", itemId: "weapon-10911401" });
      const panel = find(render(), (element) => element.props.id === "gear-module-panel");
      const openModule = find(
        flatten(panel.props.children),
        (element) => element.type === "button" && element.props.className === "gear-attachment-row",
      );
      (openModule.props.onClick as () => void)();
      const modulePicker = find(render(), (element) => element.type === GearCatalogPicker);
      const eligible = (modulePicker.props.items as GearCatalogItem[]).map((item) => item.id);
      expect(eligible).toEqual(["module-19500001", "module-19505002"]);
      expect(eligible).not.toContain("module-19500782");
      const sourceModule = boundary.catalog.find((item) => item.id === moduleId)!;
      const pickerContent = flatten(
        GearCatalogPicker(modulePicker.props as Parameters<typeof GearCatalogPicker>[0]),
      );
      const moduleCard = find(
        pickerContent,
        (element) =>
          element.type === "button" &&
          String(element.props.className).startsWith("gear-catalog-card ") &&
          text(element.props.children).includes(sourceModule.name),
      );
      expect(
        find(
          flatten(moduleCard.props.children),
          (element) => element.props.className === "gear-card-rarity",
        ).props.children,
      ).toBe(`원거리·근접 무기 · 신판 모듈 · ${sourceModule.moduleShiny ? "섬광" : "일반"}`);
      (modulePicker.props.onChoose as (id: string) => void)(moduleId);
      expect(snapshot().slots[0].attachments).toMatchObject({
        module: moduleId,
        moduleSuffix: null,
        moduleLevel: null,
      });
      const updatedPanel = find(render(), (element) => element.props.id === "gear-module-panel");
      const sourceSuffix = boundary.catalog.find(
        (item) => item.id === sourceModule.moduleSuffixId,
      )!;
      expect(text(updatedPanel.props.children)).toContain(sourceSuffix.name);
      expect(text(updatedPanel.props.children)).toContain(
        sourceModule.moduleShiny ? "섬광" : "일반",
      );
      expect(
        render().some(
          (element) =>
            element.props.id === "gear-accessory-tab" ||
            (element.type === "label" && text(element.props.children).startsWith("모듈 레벨")),
        ),
      ).toBe(false);
      const form = new FormData();
      await boundary.action!({ ok: false, message: "" }, form);
      expect(boundary.save).toHaveBeenCalledOnce();
      const saved = JSON.parse(form.get("loadout") as string) as PlannerGearLoadout;
      expect(saved.slots[0]).toMatchObject({
        slot: "melee",
        itemId: "weapon-10911401",
        attachments: { module: moduleId, moduleSuffix: null, moduleLevel: null },
      });
      expect(saved.catalogNames?.[moduleId]).toBe(sourceModule.name);
    },
  );
  it("preserves historical melee module suffix and level when reselecting the same source module, and clears them on replacement", async () => {
    const loadout = createEmptyGearLoadout();
    const melee = createGearSelection("melee", "weapon-10911401");
    melee.attachments.module = "module-19500001";
    melee.attachments.moduleSuffix = "module-suffix-frame-0";
    melee.attachments.moduleLevel = 17;
    loadout.slots = [melee];
    initial = detail(loadout);
    const slot = find(render(), (element) => element.props.slot === "melee");
    (slot.props.onFocus as (slot: string) => void)("melee");
    const openModule = () => {
      const button = find(
        render(),
        (element) => element.type === "button" && element.props.className === "gear-attachment-row",
      );
      (button.props.onClick as () => void)();
      return find(render(), (element) => element.type === GearCatalogPicker);
    };
    const same = openModule();
    (same.props.onChoose as (id: string) => void)("module-19500001");
    expect(snapshot().slots[0].attachments).toMatchObject({
      module: "module-19500001",
      moduleSuffix: "module-suffix-frame-0",
      moduleLevel: 17,
    });
    const existingForm = new FormData();
    await boundary.action!({ ok: false, message: "" }, existingForm);
    expect(boundary.save).toHaveBeenCalledOnce();
    expect(JSON.parse(existingForm.get("loadout") as string).slots[0].attachments).toMatchObject({
      moduleSuffix: "module-suffix-frame-0",
      moduleLevel: 17,
    });
    const replacement = openModule();
    (replacement.props.onChoose as (id: string) => void)("module-19505002");
    expect(snapshot().slots[0].attachments).toMatchObject({
      module: "module-19505002",
      moduleSuffix: null,
      moduleLevel: null,
    });
    expect(loadout.slots[0].attachments.moduleLevel).toBe(17);
    expect(loadout.slots[0].attachments.moduleSuffix).toBe("module-suffix-frame-0");
  });
});

describe("Bounded catalog and dependent selections", () => {
  it("keeps trait pagination open when keyboard focus stays in the selector and closes on leaving", () => {
    const allowedIds = Array.from({ length: 24 }, (_, index) => `trait-page-${index}`);
    function picker() {
      boundary.cursor = 0;
      boundary.effects = [];
      return flatten(GearTraitSelector({ allowedIds, selectedIds: [], onChange: vi.fn() }));
    }
    const input = () => find(picker(), (element) => element.props.role === "combobox");
    (input().props.onFocus as () => void)();
    expect(picker().filter((element) => element.props.role === "option")).toHaveLength(12);
    (input().props.onKeyDown as (event: unknown) => void)({ key: "Tab" });
    const root = find(picker(), (element) => element.props.className === "gear-trait-picker");
    (root.props.onBlur as (event: unknown) => void)({
      currentTarget: { contains: () => true },
      relatedTarget: {},
    });
    const next = find(picker(), (element) => element.props["aria-label"] === "다음 특성 페이지");
    (next.props.onClick as () => void)();
    expect(
      text(find(picker(), (element) => element.props.role === "option").props.children),
    ).toContain("페이지 특성 12");
    (root.props.onBlur as (event: unknown) => void)({
      currentTarget: { contains: () => false },
      relatedTarget: null,
    });
    expect(picker().some((element) => element.props.role === "option")).toBe(false);
  });
  it("shows Korean results during composition while protecting confirmation Enter", () => {
    vi.useFakeTimers();
    const items = [
      { ...boundary.catalog[0], id: "ice", name: "쇄빙" },
      { ...boundary.catalog[0], id: "fire", name: "화염" },
    ];
    const choose = vi.fn();
    function picker() {
      boundary.cursor = 0;
      boundary.effects = [];
      return flatten(
        GearCatalogPicker({
          title: "검색",
          items,
          onChoose: choose,
          onClose: vi.fn(),
          returnFocus: { current: null },
        }),
      );
    }
    const input = () => find(picker(), (element) => element.props.role === "combobox");
    const enter = (timeStamp: number) => ({
      key: "Enter",
      keyCode: 0,
      timeStamp,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    try {
      (input().props.onCompositionStart as () => void)();
      (input().props.onChange as (event: unknown) => void)({ target: { value: "쇄빙" } });
      picker();
      boundary.effects.forEach((effect) => effect());
      vi.advanceTimersByTime(160);
      const option = find(picker(), (element) => element.props.role === "option");
      expect(text(option.props.children)).toContain("쇄빙");
      (input().props.onKeyDown as (event: unknown) => void)(enter(1000));
      expect(choose).not.toHaveBeenCalled();
      const arrow = {
        key: "ArrowDown",
        keyCode: 229,
        nativeEvent: { isComposing: true },
        preventDefault: vi.fn(),
      };
      (input().props.onKeyDown as (event: unknown) => void)(arrow);
      expect(arrow.preventDefault).not.toHaveBeenCalled();
      (option.props.onClick as () => void)();
      expect(choose).toHaveBeenCalledWith("ice");
      choose.mockClear();
      (input().props.onCompositionEnd as (event: unknown) => void)({
        currentTarget: { value: "쇄빙" },
        timeStamp: 1000,
      });
      (input().props.onKeyDown as (event: unknown) => void)(enter(1000));
      expect(choose).not.toHaveBeenCalled();
      (input().props.onKeyDown as (event: unknown) => void)(enter(1075));
      expect(choose).toHaveBeenCalledWith("ice");
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps blocked armor results visible but skips them when selecting with the keyboard", () => {
    const choose = vi.fn();
    const items = [
      { ...boundary.catalog[0], id: "blocked", name: "핵심 방어구" },
      { ...boundary.catalog[0], id: "normal", name: "일반 방어구" },
    ];
    function picker() {
      boundary.cursor = 0;
      boundary.effects = [];
      return flatten(
        GearCatalogPicker({
          title: "방어구",
          items,
          onChoose: choose,
          onClose: vi.fn(),
          returnFocus: { current: null },
          disabledReasons: { blocked: "핵심 방어구 1개 제한" },
        }),
      );
    }
    const input = () => find(picker(), (element) => element.props.role === "combobox");
    const key = (value: string) => ({
      key: value,
      timeStamp: 500,
      keyCode: 0,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    (input().props.onKeyDown as (event: unknown) => void)(key("ArrowDown"));
    const blocked = find(
      picker(),
      (element) =>
        element.props.role === "option" && text(element.props.children).includes("핵심 방어구"),
    );
    expect(blocked.props.disabled).toBe(true);
    expect(text(blocked.props.children)).toContain("1개 제한");
    (blocked.props.onClick as () => void)();
    expect(choose).not.toHaveBeenCalled();
    (input().props.onCompositionStart as () => void)();
    (blocked.props.onClick as () => void)();
    expect(choose).not.toHaveBeenCalled();
    (input().props.onCompositionEnd as (event: unknown) => void)({
      currentTarget: { value: "" },
      timeStamp: 0,
    });
    (input().props.onKeyDown as (event: unknown) => void)(key("Enter"));
    expect(choose).toHaveBeenCalledWith("normal");
  });
  it("searches and adds eligible deviant traits as chips and retains previous recorded traits", () => {
    vi.useFakeTimers();
    const update = vi.fn();
    let selectedIds = ["previous-trait"];
    function picker() {
      boundary.cursor = 0;
      boundary.effects = [];
      return flatten(
        GearTraitSelector({
          allowedIds: ["trait-a", "trait-b"],
          selectedIds,
          recordedNames: { "previous-trait": "이전 특성 기록" },
          onChange: update,
        }),
      );
    }
    const input = () => find(picker(), (element) => element.props.role === "combobox");
    try {
      expect(
        picker().some((element) => text(element.props.children).includes("이전 특성 기록")),
      ).toBe(true);
      (input().props.onCompositionStart as () => void)();
      (input().props.onChange as (event: unknown) => void)({ target: { value: "전력" } });
      picker();
      boundary.effects.forEach((effect) => effect());
      vi.advanceTimersByTime(160);
      const result = find(picker(), (element) => element.props.role === "option");
      expect(text(result.props.children)).toContain("전력계 역회전");
      (input().props.onKeyDown as (event: unknown) => void)({
        key: "Enter",
        keyCode: 229,
        timeStamp: 1000,
        nativeEvent: { isComposing: true },
        preventDefault: vi.fn(),
      });
      expect(update).not.toHaveBeenCalled();
      (result.props.onClick as () => void)();
      expect(update).toHaveBeenCalledWith(["previous-trait", "trait-a"]);
      selectedIds = update.mock.calls[0][0];
      expect(
        picker().some((element) => element.props["aria-label"] === "전력계 역회전 특성 해제"),
      ).toBe(true);
      (
        find(picker(), (element) => element.props["aria-label"] === "전력계 역회전 특성 해제").props
          .onClick as () => void
      )();
      expect(update).toHaveBeenLastCalledWith(["previous-trait"]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("counts known armor pieces once per valid body slot and excludes other equipment", () => {
    const selections = (["helmet", "top", "bottom", "shoes", "gloves", "mask"] as const).map(
      (slot) => createGearSelection(slot, `armor-${slot}`),
    );
    selections.push(
      createGearSelection("helmet", "armor-helmet"),
      createGearSelection("primary", "weapon-a"),
      createGearSelection("combatDeviant", "deviant-a"),
    );
    expect(countGearArmorSets(selections, boundary.catalog)).toEqual([
      { setId: "lonewolf", count: 6 },
    ]);
    expect(
      countGearArmorSets(
        [createGearSelection("helmet", "weapon-a"), createGearSelection("mask", "removed-armor")],
        boundary.catalog,
      ),
    ).toEqual([]);
  });
  it.each([null, { isConnected: false, focus: vi.fn() }])(
    "focuses the slot fallback when the opener is absent or disconnected: %s",
    (opener) => {
      const focus = vi.fn();
      vi.stubGlobal("document", { activeElement: null, getElementById: vi.fn(() => ({ focus })) });
      boundary.cursor = 0;
      const elements = flatten(
        GearCatalogPicker({
          title: "Fixture picker",
          items: [],
          onChoose: vi.fn(),
          onClose: vi.fn(),
          returnFocus: { current: opener as unknown as HTMLElement | null },
          fallbackFocusId: "gear-slot-primary",
        }),
      );
      const event = { preventDefault: vi.fn() };
      (
        find(elements, (element) => element.type === "Dialog.Content").props.onCloseAutoFocus as (
          event: unknown,
        ) => void
      )(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(focus).toHaveBeenCalledOnce();
      expect(document.getElementById).toHaveBeenCalledWith("gear-slot-primary");
    },
  );
  it("shows the same unverified cradle conditions in the editor and picker", () => {
    const note =
      "시나리오·캐릭터 해금 조건은 아직 확인되지 않았습니다. 게임에서 장착 가능한 항목을 기록해주세요.";
    expect(render().some((element) => text(element.props.children).includes(note))).toBe(true);
    const cradle = find(render(), (element) => element.props.slot === "cradle-1");
    (cradle.props.onOpen as (slot: string) => void)("cradle-1");
    expect(find(render(), (element) => element.type === GearCatalogPicker).props.notice).toBe(note);
  });
  it("resets module suffix/level when the module changes and preserves unrelated attachment state", () => {
    const selected = createGearSelection("primary", "weapon-a");
    selected.attachments = {
      ...selected.attachments,
      module: "module-a",
      moduleSuffix: "suffix-a",
      moduleLevel: 17,
      muzzle: "muzzle-a",
    };
    const changed = changeGearAttachment(selected, "module", "module-b");
    expect(changed.attachments).toMatchObject({
      module: "module-b",
      moduleSuffix: null,
      moduleLevel: null,
      muzzle: "muzzle-a",
    });
    expect(selected.attachments.module).toBe("module-a");
    expect(changeGearAttachment(selected, "module", "module-a")).toBe(selected);
    const loadout = createEmptyGearLoadout();
    loadout.slots = [selected];
    expect(equipGearItem(loadout, "primary", "weapon-a")).toBe(loadout);
  });
  it("searches official names and aliases, with blank search retaining the bounded caller list", () => {
    expect(searchGearItems(boundary.catalog, "테스트 별칭").map((item) => item.id)).toEqual([
      "weapon-a",
    ]);
    expect(searchGearItems(boundary.catalog, "시험 무기").map((item) => item.id)).toEqual([
      "weapon-a",
    ]);
    expect(searchGearItems(boundary.catalog, "시험무기").map((item) => item.id)).toEqual([
      "weapon-a",
    ]);
    expect(searchGearItems(boundary.catalog, "테스트별칭").map((item) => item.id)).toEqual([
      "weapon-a",
    ]);
    expect(searchGearItems(boundary.catalog, "missing")).toEqual([]);
    expect(searchGearItems(boundary.catalog, "")).toHaveLength(boundary.catalog.length);
    expect(parseGearNumber("17", 17)).toBe(17);
    expect(() => parseGearNumber("18", 17)).toThrow();
    expect(parseGearNumber(" ")).toBeNull();
  });
  it("keeps recorded module levels without requesting a new level", () => {
    loadedWeapon();
    const elements = render();
    expect(
      elements.some(
        (element) =>
          element.type === "label" && text(element.props.children).startsWith("모듈 레벨"),
      ),
    ).toBe(false);
    expect(snapshot().slots[0].attachments.moduleLevel).toBe(17);
    const picker = openPicker();
    (picker.props.onChoose as (id: string) => void)("weapon-a");
    expect(snapshot().slots[0].attachments.moduleLevel).toBe(17);
  });
  it("keeps inputs disabled until client handlers are ready without changing the draft", () => {
    boundary.clientReady = false;
    const before = snapshot();
    const serverFieldset = find(render(), (element) => element.type === "fieldset");
    expect(serverFieldset.props.disabled).toBe(true);
    expect(serverFieldset.props["aria-busy"]).toBe(true);
    boundary.clientReady = true;
    expect(find(render(), (element) => element.type === "fieldset").props.disabled).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it("bounds searchable suggestions and supports keyboard selection without committing IME Enter", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      ...boundary.catalog[0],
      id: `search-${index}`,
      name: `검색 무기 ${index}`,
    }));
    const choose = vi.fn();
    function picker() {
      boundary.cursor = 0;
      boundary.effects = [];
      return flatten(
        GearCatalogPicker({
          title: "무기 검색",
          items,
          onChoose: choose,
          onClose: vi.fn(),
          returnFocus: { current: null },
        }),
      );
    }
    function input() {
      return find(picker(), (element) => element.props.role === "combobox");
    }
    const key = (value: string, isComposing = false) => ({
      key: value,
      keyCode: isComposing ? 229 : 0,
      nativeEvent: { isComposing },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    (input().props.onKeyDown as (event: unknown) => void)(key("ArrowDown"));
    expect(picker().filter((element) => element.props.role === "option")).toHaveLength(12);
    const first = input().props["aria-activedescendant"];
    (input().props.onKeyDown as (event: unknown) => void)(key("ArrowDown"));
    const next = input().props["aria-activedescendant"];
    expect(next).not.toBe(first);
    expect(
      picker().some((element) => element.props.role === "option" && element.props.id === next),
    ).toBe(true);
    (input().props.onKeyDown as (event: unknown) => void)(key("Enter", true));
    expect(choose).not.toHaveBeenCalled();
    (input().props.onKeyDown as (event: unknown) => void)(key("Enter"));
    expect(choose).toHaveBeenCalledWith("search-1");
    choose.mockClear();
    (input().props.onKeyDown as (event: unknown) => void)(key("Escape"));
    expect(input().props["aria-expanded"]).toBe(false);
    expect(picker().filter((element) => element.props.role === "option")).toHaveLength(0);
    (input().props.onKeyDown as (event: unknown) => void)(key("Enter"));
    expect(choose).not.toHaveBeenCalled();
  });
  it("blocks stale search selection and follows changed eligible items", () => {
    vi.useFakeTimers();
    const choose = vi.fn();
    let items = [
      { ...boundary.catalog[0], id: "eligible-a", name: "보호 모듈" },
      { ...boundary.catalog[0], id: "eligible-b", name: "쇄빙 모듈" },
    ];
    function picker() {
      boundary.cursor = 0;
      boundary.effects = [];
      return flatten(
        GearCatalogPicker({
          title: "검색",
          items,
          onChoose: choose,
          onClose: vi.fn(),
          returnFocus: { current: null },
        }),
      );
    }
    const input = () => find(picker(), (element) => element.props.role === "combobox");
    const key = {
      key: "Enter",
      keyCode: 0,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    try {
      (input().props.onChange as (e: unknown) => void)({ target: { value: "쇄빙" } });
      (
        find(
          picker(),
          (element) =>
            element.type === "button" && text(element.props.children) === "이 아이템 선택",
        ).props.onClick as () => void
      )();
      (input().props.onKeyDown as (e: unknown) => void)(key);
      expect(choose).not.toHaveBeenCalled();
      picker();
      boundary.effects.forEach((effect) => effect());
      vi.advanceTimersByTime(160);
      expect(picker().filter((e) => e.props.role === "option")).toHaveLength(1);
      expect(text(find(picker(), (e) => e.props.role === "option").props.children)).toContain(
        "쇄빙",
      );
      items = [items[0]];
      (input().props.onKeyDown as (e: unknown) => void)(key);
      expect(choose).not.toHaveBeenCalled();
      expect(picker().some((e) => e.props.role === "option")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("renders at most 48 icon cards and returns focus to the initiating control on close", () => {
    boundary.cursor = 0;
    const items = Array.from({ length: 150 }, (_, index) => ({
      ...boundary.catalog[0],
      id: `item-${index}`,
      name: `Item ${index}`,
    }));
    const focus = vi.fn();
    const elements = flatten(
      GearCatalogPicker({
        title: "Fixture picker",
        items,
        onChoose: vi.fn(),
        onClose: vi.fn(),
        returnFocus: { current: { focus } as unknown as HTMLElement },
      }),
    );
    expect(
      elements.filter(
        (element) =>
          element.type === "button" &&
          String(element.props.className).includes("gear-catalog-card"),
      ),
    ).toHaveLength(48);
    const event = { preventDefault: vi.fn() };
    (
      find(elements, (element) => element.type === "Dialog.Content").props.onCloseAutoFocus as (
        event: unknown,
      ) => void
    )(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });
});
