import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerLoadout } from "@uniz/build-engine";
import type { PlannerActionState, PlannerBuildDetail } from "../src/lib/data/build-planner-types";

const boundary = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  action: null as
    ((state: PlannerActionState, form: FormData) => Promise<PlannerActionState>) | null,
  result: { ok: false, message: "" } as PlannerActionState,
  save: vi.fn(),
  push: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.states))
      boundary.states[index] = typeof initial === "function" ? initial() : initial;
    return [
      boundary.states[index],
      (change: unknown) => {
        boundary.states[index] =
          typeof change === "function" ? change(boundary.states[index]) : change;
      },
    ];
  },
  useEffect: () => undefined,
  useActionState: (action: typeof boundary.action) => {
    boundary.action = action;
    return [boundary.result, action, false];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@/app/lab/actions", () => ({ saveBuildPlanner: boundary.save }));
vi.mock("@/components/content/editor", () => ({ ContentEditor: "ContentEditor" }));
vi.mock("@/components/content/presentation", () => ({ YouTubeField: "YouTubeField" }));
vi.mock("@/lib/scenario-presets", () => import("../src/lib/scenario-presets"));
vi.mock("@/lib/map-farming", () => import("../src/lib/map-farming"));
vi.mock("@uniz/ui", () => ({
  Card: function Card() {
    return null;
  },
}));

import { PlannerEditor } from "../src/components/build-planner/legacy-editor";
import { PlannerSaveFeedback } from "../src/components/build-planner/save-feedback";
import type { PlannerSaveBlocker } from "../src/components/build-planner/save-requirements";
import { PLANNER_REFERENCE_CATALOG, createEmptyPlannerLoadout } from "@uniz/build-engine";
let initialDetail: PlannerBuildDetail | undefined;

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
  if (node && typeof node === "object" && "props" in node)
    return text((node as Element).props.children);
  return "";
}
function render(preview = false) {
  boundary.cursor = 0;
  return flatten(PlannerEditor({ preview, initial: initialDetail }));
}
function required(elements: Element[], predicate: (element: Element) => boolean) {
  const found = elements.find(predicate);
  if (!found) throw new Error("Expected planner control was not rendered.");
  return found;
}
function click(label: string) {
  const button = required(
    render(),
    (element) => element.type === "button" && text(element.props.children).trim() === label,
  );
  (button.props.onClick as () => void)();
}
function field(label: string, index = 0) {
  const labels = render().filter((element) => {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    return element.type === "label" && text(children[0]).trim() === label;
  });
  if (!labels[index]) throw new Error("Expected planner field was not rendered.");
  return required(flatten(labels[index].props.children), (element) =>
    ["input", "select", "textarea"].includes(String(element.type)),
  );
}
function change(label: string, value: string, index = 0) {
  (field(label, index).props.onChange as (event: { target: { value: string } }) => void)({
    target: { value },
  });
}
function serialized(preview = false) {
  return required(
    render(preview),
    (element) => element.type === "input" && element.props.name === "loadout",
  ).props.value as string;
}
function snapshot(): PlannerLoadout {
  return JSON.parse(serialized());
}
function addWeapon() {
  click("무기");
  change("빌드 이름", "테스트 장비 구성");
  change("항목 이름", "직접 기록한 무기");
}
function saveButton(preview = false) {
  return required(
    render(preview),
    (element) => element.type === "button" && element.props.type === "submit",
  );
}
function saveBlockers(preview = false) {
  return required(render(preview), (element) => element.type === PlannerSaveFeedback).props
    .blockers as PlannerSaveBlocker[];
}

beforeEach(() => {
  boundary.states = [];
  initialDetail = undefined;
  boundary.cursor = 0;
  boundary.result = { ok: false, message: "" };
  boundary.action = null;
  boundary.save.mockReset().mockResolvedValue({ ok: false, message: "잠시 후 다시 저장해주세요." });
  boundary.push.mockReset();
});

describe("Planner controlled editor input", () => {
  it("only requires a valid title when optional fields and equipment are empty", () => {
    expect(saveButton().props.disabled).toBe(true);
    expect(saveBlockers()).toEqual([expect.objectContaining({ targetId: "planner-title" })]);
    change("빌드 이름", "이름만 있는 빌드");
    expect(saveButton().props.disabled).toBe(false);
    expect(saveButton().props["aria-describedby"]).toBe("planner-save-status");
    expect(saveBlockers()).toEqual([]);
    expect(snapshot().entries).toEqual([]);
    expect(snapshot().context).toEqual(createEmptyPlannerLoadout().context);
  });

  it.each(["", "가", " 가 ", " ", "가".repeat(101)])(
    "explains the title requirement for invalid title %s",
    (title) => {
      change("빌드 이름", title);
      expect(field("빌드 이름").props.id).toBe("planner-title");
      expect(field("빌드 이름").props["aria-invalid"]).toBe(true);
      expect(saveButton().props.disabled).toBe(true);
      expect(saveBlockers()).toEqual([
        expect.objectContaining({ targetId: "planner-title", message: expect.any(String) }),
      ]);
      const help = required(render(), (element) => element.props.id === "planner-title-help");
      expect(text(help.props.children)).toBe(saveBlockers()[0].message);
    },
  );

  it("points to each added item or roll name until it is completed or removed", () => {
    change("빌드 이름", "이름 검증 빌드");
    click("모듈");
    expect(saveButton().props.disabled).toBe(true);
    expect(saveBlockers()).toEqual([
      {
        message: "모듈 1의 항목 이름을 입력하거나 사용하지 않는 항목을 삭제해주세요.",
        targetId: field("항목 이름").props.id,
      },
    ]);
    change("항목 이름", "기록한 모듈");
    expect(saveBlockers()).toEqual([]);
    click("부옵션 추가");
    expect(saveBlockers()).toEqual([
      {
        message: "모듈 1의 부옵션 1 이름을 입력하거나 사용하지 않는 부옵션을 삭제해주세요.",
        targetId: field("부옵션 이름").props.id,
      },
    ]);
    change("부옵션 이름", "기록한 부옵션");
    expect(saveButton().props.disabled).toBe(false);
    expect(saveBlockers()).toEqual([]);
    expect(field("기록한 값").props.value).toBe("");
  });

  it("points to invalid recorded numbers and allows the optional value to be cleared", () => {
    addWeapon();
    change("티어", "-1");
    expect(saveBlockers()).toEqual([expect.objectContaining({ targetId: field("티어").props.id })]);
    change("티어", "");
    expect(saveButton().props.disabled).toBe(false);
    expect(saveBlockers()).toEqual([]);
  });

  it("shows why a valid preview cannot be saved", () => {
    change("빌드 이름", "미리보기 빌드");
    expect(saveButton(true).props.disabled).toBe(true);
    expect(saveBlockers(true)).toEqual([
      expect.objectContaining({ message: expect.stringContaining("미리보기") }),
    ]);
  });

  it("explains pending image preparation until the content editor is ready", () => {
    change("빌드 이름", "본문 이미지 빌드");
    const bodyEditor = required(render(), (element) => element.type === "ContentEditor");
    (bodyEditor.props.onReadyChange as (ready: boolean) => void)(false);
    expect(saveButton().props.disabled).toBe(true);
    expect(saveBlockers()).toEqual([
      expect.objectContaining({ targetId: "planner-description", message: expect.any(String) }),
    ]);
    (bodyEditor.props.onReadyChange as (ready: boolean) => void)(true);
    expect(saveButton().props.disabled).toBe(false);
    expect(saveBlockers()).toEqual([]);
  });

  it("explains an invalid optional video link and enables saving after it is cleared", () => {
    change("빌드 이름", "참고 영상 빌드");
    const videoField = required(render(), (element) => element.type === "YouTubeField");
    (videoField.props.onChange as (value: string) => void)("https://example.com/video");
    expect(saveButton().props.disabled).toBe(true);
    expect(saveBlockers()).toEqual([
      expect.objectContaining({
        targetId: "planner-description",
        message: expect.stringContaining("영상은 선택 사항"),
      }),
    ]);
    (videoField.props.onChange as (value: string) => void)("");
    expect(saveButton().props.disabled).toBe(false);
    expect(saveBlockers()).toEqual([]);
  });

  it.each(["retired-revision", "missing-record", "changed-name"] as const)(
    "preserves a %s reference until deliberate selection and clearly identifies the previous data",
    (kind) => {
      const reference = PLANNER_REFERENCE_CATALOG.find((item) => item.category === "WEAPON")!;
      const priorReference = {
        recordId: kind === "missing-record" ? "no-longer-listed-item" : reference.recordId,
        revision: kind === "retired-revision" ? `sha256:${"0".repeat(64)}` : reference.revision,
      };
      const priorName = kind === "changed-name" ? "이전에 저장한 항목 이름" : reference.name;
      const loadout = createEmptyPlannerLoadout();
      loadout.entries.push({
        id: "a23040b5-ed76-48c2-a8a6-2c05d6e9eb6a",
        category: "WEAPON",
        name: priorName,
        slotLabel: "기록한 위치",
        linkedEntryId: null,
        reference: priorReference,
        instance: { tier: null, stars: null, calibration: null, level: null, rolls: [] },
        notes: "이전 기록",
      });
      const version = {
        id: "c3fa2651-28a7-4d67-b5fd-f0a846f681c7",
        version: 1,
        createdAt: "2026-10-07T00:00:00.000Z",
        notes: "",
      };
      initialDetail = {
        id: "86db12c5-deaf-42c8-8ff7-07e8ab9f6678",
        title: "이전 빌드",
        description: "",
        visibility: "PRIVATE",
        owner: {
          id: "7fe923ec-0b11-4bd4-8812-6d3bbd900128",
          name: "Editor fixture owner",
          handle: null,
        },
        latestVersion: 1,
        updatedAt: version.createdAt,
        createdAt: version.createdAt,
        isOwner: true,
        archivedAt: null,
        versions: [version],
        selectedVersion: { ...version, schemaVersion: "uniz-planner.v1", loadout },
        mayEdit: true,
      };
      const controls = render();
      expect(field("입력 방법").props.value).toBe(`previous-reference:${loadout.entries[0].id}`);
      expect(field("항목 이름").props.value).toBe(priorName);
      expect(field("항목 이름").props.readOnly).toBe(true);
      expect(
        controls.some(
          (element) =>
            element.props.role === "status" &&
            text(element.props.children).includes("이전 참고 자료입니다."),
        ),
      ).toBe(true);
      const savedEntry = required(controls, (element) => Boolean(element.props.entry)).props
        .entry as (typeof loadout.entries)[number];
      expect(savedEntry.reference).toEqual(priorReference);
      expect(boundary.save).not.toHaveBeenCalled();
      if (kind === "missing-record") {
        change("입력 방법", "");
        expect(snapshot().entries[0]).toMatchObject({ name: priorName, reference: null });
        expect(field("항목 이름").props.readOnly).toBe(false);
      } else {
        change("입력 방법", reference.recordId);
        expect(snapshot().entries[0]).toMatchObject({
          name: reference.name,
          reference: { recordId: reference.recordId, revision: reference.revision },
        });
      }
      expect(loadout.entries[0]).toMatchObject({ name: priorName, reference: priorReference });
    },
  );
  it("preserves the original save baseline and edited draft when newer server props arrive", () => {
    const version = {
      id: "a23040b5-ed76-48c2-a8a6-2c05d6e9eb6a",
      version: 1,
      createdAt: "2026-10-07T00:00:00.000Z",
      notes: "",
    };
    initialDetail = {
      id: "86db12c5-deaf-42c8-8ff7-07e8ab9f6678",
      title: "불러온 빌드",
      description: "원래 설명",
      visibility: "PRIVATE",
      owner: {
        id: "7fe923ec-0b11-4bd4-8812-6d3bbd900128",
        name: "Editor fixture owner",
        handle: null,
      },
      latestVersion: 1,
      updatedAt: "2026-10-07T00:00:00.000Z",
      createdAt: version.createdAt,
      isOwner: true,
      archivedAt: null,
      versions: [version],
      selectedVersion: {
        ...version,
        schemaVersion: "uniz-planner.v1",
        loadout: createEmptyPlannerLoadout(),
      },
      mayEdit: true,
    };
    render();
    change("빌드 이름", "저장 전 직접 수정한 이름");
    change("클래스", "직접 기록한 클래스");
    const before = serialized();
    const originalId = initialDetail.id;
    const originalStamp = initialDetail.updatedAt;
    initialDetail = {
      ...initialDetail,
      title: "다른 창에서 변경한 이름",
      updatedAt: "2026-10-07T00:00:00.001Z",
      latestVersion: 2,
      selectedVersion: { ...initialDetail.selectedVersion, version: 2 },
    };
    const refreshed = render();
    expect(
      required(refreshed, (element) => element.props.name === "expectedUpdatedAt").props.value,
    ).toBe(originalStamp);
    expect(required(refreshed, (element) => element.props.name === "buildId").props.value).toBe(
      originalId,
    );
    expect(field("빌드 이름").props.value).toBe("저장 전 직접 수정한 이름");
    expect(serialized()).toBe(before);
    expect(
      refreshed.some((element) => text(element.props.children).includes("v1을 바탕으로 새 버전")),
    ).toBe(true);
  });

  it("disables all controls after successful saving and does not submit a second save before navigation", async () => {
    addWeapon();
    boundary.save.mockResolvedValueOnce({
      ok: true,
      message: "v1으로 저장했습니다.",
      href: "/lab/b/fixture?version=1",
      version: 1,
    });
    const form = new FormData();
    form.set("loadout", serialized());
    boundary.result = await boundary.action!({ ok: false, message: "" }, form);
    const saved = render();
    expect(required(saved, (element) => element.type === "fieldset").props.disabled).toBe(true);
    expect(
      required(saved, (element) => element.type === "button" && element.props.type === "submit")
        .props.disabled,
    ).toBe(true);
    await boundary.action!(boundary.result, form);
    expect(boundary.save).toHaveBeenCalledTimes(1);
  });
  it("preserves unknown values as null and an explicitly recorded zero as zero", () => {
    addWeapon();
    change("티어", "0");
    const loadout = snapshot();
    expect(loadout.entries[0].instance).toMatchObject({
      tier: 0,
      stars: null,
      calibration: null,
      level: null,
    });
    expect(loadout.context).toMatchObject({
      gamePatch: null,
      characterClass: null,
      scenarioKey: null,
    });
    expect(field("공개 범위").props.value).toBe("PRIVATE");
  });

  it.each(["NaN", "Infinity", "1e309", "-1", "1.5", "0x10"])(
    "keeps invalid count text %s visible and prevents it from becoming a null snapshot",
    (value) => {
      addWeapon();
      change("티어", value);
      expect(field("티어").props.value).toBe(value);
      expect(field("티어").props["aria-invalid"]).toBe(true);
      expect(serialized()).toBe("");
      expect(
        required(
          render(),
          (element) => element.type === "button" && element.props.type === "submit",
        ).props.disabled,
      ).toBe(true);
      expect(boundary.save).not.toHaveBeenCalled();
    },
  );

  it("records signed mod rolls without inventing values or units", () => {
    click("모듈");
    change("항목 이름", "직접 기록한 모드");
    click("부옵션 추가");
    change("부옵션 이름", "직접 확인한 옵션");
    expect(snapshot().entries[0].instance.rolls[0]).toEqual({
      label: "직접 확인한 옵션",
      value: null,
      unit: null,
    });
    change("기록한 값", "-2.25");
    expect(snapshot().entries[0].instance.rolls[0].value).toBe(-2.25);
    change("기록한 값", "not-a-number");
    expect(serialized()).toBe("");
    expect(field("기록한 값").props.value).toBe("not-a-number");
  });

  it("clears links to a removed parent without deleting the linked item or its recorded values", () => {
    addWeapon();
    const weaponId = snapshot().entries[0].id;
    click("모듈");
    change("항목 이름", "연결한 모드", 1);
    change("연결할 장비", weaponId);
    change("레벨", "2", 1);
    expect(snapshot().entries[1].linkedEntryId).toBe(weaponId);
    const remove = required(
      render(),
      (element) => element.type === "button" && element.props["aria-label"] === "무기 1 삭제",
    );
    (remove.props.onClick as () => void)();
    expect(snapshot().entries).toHaveLength(1);
    expect(snapshot().entries[0]).toMatchObject({
      name: "연결한 모드",
      linkedEntryId: null,
      instance: { level: 2 },
    });
  });

  it("locks a reference's canonical name and preserves it when switching back to manual input", () => {
    addWeapon();
    const reference = PLANNER_REFERENCE_CATALOG.find((item) => item.category === "WEAPON")!;
    change("입력 방법", reference.recordId);
    expect(field("항목 이름").props.readOnly).toBe(true);
    expect(snapshot().entries[0]).toMatchObject({
      name: reference.name,
      reference: { recordId: reference.recordId, revision: reference.revision },
    });
    change("입력 방법", "");
    expect(field("항목 이름").props.readOnly).toBe(false);
    expect(snapshot().entries[0]).toMatchObject({ name: reference.name, reference: null });
  });

  it("keeps the controlled loadout and metadata after a failed save", async () => {
    addWeapon();
    change("티어", "3");
    const bodyEditor = required(render(), (element) => element.type === "ContentEditor");
    (bodyEditor.props.onChange as (document: unknown, text: string) => void)(null, "기록한 목적");
    const before = serialized();
    render();
    const form = new FormData();
    form.set("loadout", before);
    const result = await boundary.action!({ ok: false, message: "" }, form);
    boundary.result = result;
    expect(result.ok).toBe(false);
    expect(serialized()).toBe(before);
    expect(field("빌드 이름").props.value).toBe("테스트 장비 구성");
    expect(
      required(render(), (element) => element.type === "ContentEditor").props.initialText,
    ).toBe("기록한 목적");
    expect(boundary.push).not.toHaveBeenCalled();
  });

  it("never invokes the live save action from a preview even with valid form input", async () => {
    addWeapon();
    render(true);
    const form = new FormData();
    form.set("loadout", serialized(true));
    const result = await boundary.action!({ ok: false, message: "" }, form);
    expect(result.ok).toBe(false);
    expect(boundary.save).not.toHaveBeenCalled();
  });
});
