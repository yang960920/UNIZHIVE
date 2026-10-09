import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const boundary = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  save: vi.fn(),
  refresh: vi.fn(),
  pending: Promise.resolve() as Promise<unknown>,
  isPending: false,
  input: { value: "" },
  effects: [] as { dependencies: readonly unknown[]; cleanup?: () => void }[],
  effectCursor: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.states)) boundary.states[index] = initial;
    return [
      boundary.states[index],
      (value: unknown) => {
        boundary.states[index] =
          typeof value === "function" ? value(boundary.states[index]) : value;
      },
    ];
  },
  useRef: () => ({ current: boundary.input }),
  useTransition: () => [
    boundary.isPending,
    (action: () => Promise<unknown>) => {
      boundary.isPending = true;
      boundary.pending = action().finally(() => {
        boundary.isPending = false;
      });
    },
  ],
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = boundary.effectCursor++;
    const previous = boundary.effects[index];
    if (previous && dependencies.every((value, at) => Object.is(value, previous.dependencies[at])))
      return;
    previous?.cleanup?.();
    const cleanup = effect();
    boundary.effects[index] = {
      dependencies,
      cleanup: typeof cleanup === "function" ? cleanup : undefined,
    };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: boundary.refresh }) }));
vi.mock("next/image", () => ({ default: "Image" }));
vi.mock("@uniz/ui", () => ({ Avatar: "Avatar" }));
vi.mock("../src/app/onboarding/actions", () => ({ saveOnboarding: vi.fn() }));
vi.mock("../src/app/settings/profile-actions", () => ({ saveProfileSettings: boundary.save }));
vi.mock("@radix-ui/react-dialog", () =>
  Object.fromEntries(
    ["Root", "Trigger", "Portal", "Overlay", "Content", "Title", "Description", "Close"].map(
      (name) => [name, `Dialog.${name}`],
    ),
  ),
);

import { SettingsProfileForm } from "../src/app/settings/profile-form";
import { ProfileFields } from "../src/app/onboarding/profile-form";
import { ProfileImageEditor } from "../src/app/settings/profile-image-form";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  if (element.type === ProfileFields || element.type === ProfileImageEditor)
    return [element, ...elements((element.type as (props: unknown) => unknown)(element.props))];
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node
    ? text((node as Element).props.children)
    : "";
}
const NativeFormData = globalThis.FormData;
let browserFields: FormData;
let props: Parameters<typeof SettingsProfileForm>[0];
function render() {
  boundary.cursor = 0;
  boundary.effectCursor = 0;
  return elements(SettingsProfileForm(props));
}
function choose(file: File) {
  browserFields.set("image", file);
  const input = render().find((node) => node.type === "input" && node.props.type === "file")!;
  (input.props.onChange as (event: unknown) => void)({ target: { files: [file] } });
}
function click(label: string) {
  const button = render().find(
    (node) => node.type === "button" && text(node.props.children) === label,
  )!;
  (button.props.onClick as () => void)();
}
function startSubmit() {
  const form = render().find((node) => node.type === "form")!;
  (form.props.onSubmit as (event: unknown) => void)({
    preventDefault: vi.fn(),
    currentTarget: { fields: browserFields },
  });
}
async function submit() {
  startSubmit();
  await boundary.pending;
}
function png() {
  return new File(["source image"], "avatar.png", { type: "image/png" });
}

beforeEach(() => {
  boundary.states = [];
  boundary.cursor = 0;
  boundary.effects = [];
  boundary.effectCursor = 0;
  boundary.pending = Promise.resolve();
  boundary.isPending = false;
  boundary.input = { value: "avatar.png" };
  boundary.save.mockReset().mockResolvedValue({
    ok: true,
    message: "프로필을 저장했습니다.",
    imageUrl: "/api/profile/image/saved?v=hash",
    hasCustomImage: true,
  });
  boundary.refresh.mockClear();
  const initial = {
    targetId: "actor",
    handle: "hyunjun",
    displayName: "기존 이름",
    nickname: "게임 이름",
    uid: "private-uid",
    bio: "소개",
  };
  props = { initial, name: "Hyunjun", image: { imageUrl: null, hasCustomImage: false } };
  browserFields = new NativeFormData();
  for (const key of ["handle", "displayName", "nickname", "uid", "bio"] as const)
    browserFields.set(key, initial[key]);
  browserFields.set("image", new File([], "", { type: "application/octet-stream" }));
  vi.stubGlobal(
    "FormData",
    class extends NativeFormData {
      constructor(form?: { fields: FormData }) {
        super();
        if (form) for (const [key, value] of form.fields) this.append(key, value);
      }
    },
  );
  let preview = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:preview-${++preview}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  boundary.effects.forEach((effect) => effect.cleanup?.());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("single profile save user flow", () => {
  it("has exactly one profile form and one submit that contains both image and profile controls", () => {
    const nodes = render();
    expect(nodes.filter((node) => node.type === "form")).toHaveLength(1);
    const submits = nodes.filter((node) => node.type === "button" && node.props.type === "submit");
    expect(submits).toHaveLength(1);
    expect(text(submits[0].props.children)).toBe("프로필 수정하기");
    expect(nodes.some((node) => node.props.name === "image" && node.props.type === "file")).toBe(
      true,
    );
    expect(
      nodes.filter((node) =>
        ["handle", "displayName", "nickname", "uid", "bio"].includes(String(node.props.name)),
      ),
    ).toHaveLength(5);
    expect(text(nodes)).not.toContain("이미지 저장");
  });

  it("saves the chosen image and all edited profile fields through the one profile submit, then refreshes the header", async () => {
    const file = png();
    choose(file);
    browserFields.set("displayName", "변경한 이름");
    browserFields.set("bio", "변경한 소개");
    expect(boundary.save).not.toHaveBeenCalled();
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect([...input.keys()]).toEqual([
      "handle",
      "displayName",
      "nickname",
      "uid",
      "bio",
      "imageAction",
      "image",
    ]);
    expect(input.get("displayName")).toBe("변경한 이름");
    expect(input.get("bio")).toBe("변경한 소개");
    expect(input.get("handle")).toBe("hyunjun");
    expect(input.get("nickname")).toBe("게임 이름");
    expect(input.get("uid")).toBe("private-uid");
    expect(input.get("imageAction")).toBe("UPLOAD");
    expect(input.get("image")).toBe(file);
    expect(boundary.save).toHaveBeenCalledOnce();
    expect(boundary.refresh).toHaveBeenCalledOnce();
    expect(render().find((node) => node.type === "Image")?.props.src).toBe(
      "/api/profile/image/saved?v=hash",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it.each(["returned", "thrown"] as const)(
    "keeps profile inputs, the selected image and preview after a %s save failure",
    async (failure) => {
      if (failure === "returned")
        boundary.save.mockResolvedValue({ ok: false, message: "이미지 처리에 실패했습니다." });
      else boundary.save.mockRejectedValue(new Error("Connection unavailable"));
      const file = png();
      choose(file);
      browserFields.set("displayName", "저장 전 이름");
      await submit();
      expect(render().find((node) => node.type === "Image")?.props.src).toBe("blob:preview-1");
      expect(render().some((node) => node.props.role === "alert")).toBe(true);
      expect(boundary.refresh).not.toHaveBeenCalled();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      await submit();
      const retried = boundary.save.mock.calls[1]![0] as FormData;
      expect(retried.get("displayName")).toBe("저장 전 이름");
      expect(retried.get("image")).toBe(file);
      expect(retried.get("imageAction")).toBe("UPLOAD");
    },
  );

  it("sends KEEP without a native empty file when only profile fields change", async () => {
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect(input.get("imageAction")).toBe("KEEP");
    expect(input.has("image")).toBe(false);
    expect([...input.keys()]).toEqual([
      "handle",
      "displayName",
      "nickname",
      "uid",
      "bio",
      "imageAction",
    ]);
  });

  it("submits REMOVE through the same profile button and permits restoring the saved image first", async () => {
    props.image = { imageUrl: "/api/profile/image/existing", hasCustomImage: true };
    click("이미지 삭제");
    expect(boundary.save).not.toHaveBeenCalled();
    click("이미지 변경 취소");
    expect(render().find((node) => node.type === "Image")?.props.src).toBe(
      "/api/profile/image/existing",
    );
    click("이미지 삭제");
    boundary.save.mockResolvedValue({
      ok: true,
      message: "프로필을 저장했습니다.",
      imageUrl: null,
      hasCustomImage: false,
    });
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect(input.get("imageAction")).toBe("REMOVE");
    expect(input.has("image")).toBe(false);
    expect(input.get("handle")).toBe("hyunjun");
    expect(boundary.refresh).toHaveBeenCalledOnce();
    expect(render().some((node) => node.type === "Avatar")).toBe(true);
  });

  it("sends the previous validated draft rather than a later invalid native file", async () => {
    const valid = png();
    choose(valid);
    choose(new File(["<svg/>"], "invalid.svg", { type: "image/svg+xml" }));
    expect(render().some((node) => node.props.role === "alert")).toBe(true);
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect(input.get("imageAction")).toBe("UPLOAD");
    expect(input.get("image")).toBe(valid);
  });

  it("allows a profile-only KEEP save when image metadata cannot be loaded", async () => {
    props.image = null;
    const nodes = render();
    expect(nodes.some((node) => node.props.type === "file")).toBe(false);
    expect(nodes.some((node) => node.type === "a" && node.props.href === "/settings")).toBe(true);
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect(input.get("imageAction")).toBe("KEEP");
    expect(input.has("image")).toBe(false);
    expect(input.get("uid")).toBe("private-uid");
  });

  it("locks the full fieldset during the one save operation", async () => {
    let complete!: (result: { ok: boolean; message: string }) => void;
    boundary.save.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    startSubmit();
    expect(render().find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
    expect(render().find((node) => node.type === "fieldset")?.props["aria-busy"]).toBe(true);
    complete({ ok: false, message: "실패했습니다." });
    await boundary.pending;
    expect(render().find((node) => node.type === "fieldset")?.props.disabled).toBe(false);
  });

  it("accepts recovered image metadata after a soft refresh without resetting profile inputs", async () => {
    props.image = null;
    render();
    browserFields.set("displayName", "아직 저장하지 않은 이름");
    props.image = { imageUrl: "/api/profile/image/recovered", hasCustomImage: true };
    expect(render().find((node) => node.type === "Image")?.props.src).toBe(
      "/api/profile/image/recovered",
    );
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect(input.get("displayName")).toBe("아직 저장하지 않은 이름");
    expect(input.get("imageAction")).toBe("KEEP");
  });

  it("keeps a selected image draft when another tab changes the saved server image", async () => {
    const file = png();
    choose(file);
    props.image = { imageUrl: "/api/profile/image/other-tab", hasCustomImage: true };
    expect(render().find((node) => node.type === "Image")?.props.src).toBe("blob:preview-1");
    await submit();
    const input = boundary.save.mock.calls[0]![0] as FormData;
    expect(input.get("imageAction")).toBe("UPLOAD");
    expect(input.get("image")).toBe(file);
  });
});
