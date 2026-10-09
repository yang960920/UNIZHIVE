import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ProfileImageDraft } from "../src/app/settings/profile-image-form";

const boundary = vi.hoisted(() => ({
  input: { value: "" },
  effects: [] as { dependencies: readonly unknown[]; cleanup?: () => void }[],
  cursor: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => ({ current: boundary.input }),
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = boundary.cursor++;
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
vi.mock("next/image", () => ({ default: "Image" }));
vi.mock("@uniz/ui", () => ({ Avatar: "Avatar" }));
vi.mock("@radix-ui/react-dialog", () =>
  Object.fromEntries(
    ["Root", "Trigger", "Portal", "Overlay", "Content", "Title", "Description", "Close"].map(
      (name) => [name, `Dialog.${name}`],
    ),
  ),
);

import { ProfileImageEditor, ProfileImageGuide } from "../src/app/settings/profile-image-form";
import { IMAGE_UPLOAD_MAX_BYTES } from "../src/lib/image-upload-limits";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node
    ? text((node as Element).props.children)
    : "";
}
let draft: ProfileImageDraft | null;
let props: Parameters<typeof ProfileImageEditor>[0];
let error: string;
function render() {
  boundary.cursor = 0;
  return elements(ProfileImageEditor({ ...props, draft }));
}
function choose(file: File) {
  const input = render().find((node) => node.type === "input" && node.props.type === "file")!;
  (input.props.onChange as (event: unknown) => void)({ target: { files: [file] } });
}
function click(label: string) {
  const button = render().find(
    (node) => node.type === "button" && text(node.props.children) === label,
  )!;
  (button.props.onClick as () => void)();
}
function png(name = "profile.png") {
  return new File(["test PNG contents"], name, { type: "image/png" });
}

beforeEach(() => {
  draft = null;
  error = "";
  boundary.cursor = 0;
  boundary.effects = [];
  boundary.input = { value: "profile.png" };
  props = {
    name: "Hyunjun",
    image: { imageUrl: null, hasCustomImage: false },
    draft,
    onChange: (next) => {
      draft = next;
      error = "";
    },
    onError: (message) => {
      error = message;
    },
  };
  let preview = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:preview-${++preview}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  boundary.effects.forEach((effect) => effect.cleanup?.());
  vi.restoreAllMocks();
});

describe("profile image fields within the unified profile form", () => {
  it("has no independent form or submit button and keeps the default initial", () => {
    const nodes = render();
    expect(nodes.find((node) => node.type === "Avatar")?.props.name).toBe("Hyunjun");
    expect(nodes.some((node) => node.type === "form")).toBe(false);
    expect(nodes.some((node) => node.type === "button" && node.props.type === "submit")).toBe(
      false,
    );
    expect(text(nodes)).not.toContain("이미지 저장");
  });

  it.each(["image/png", "image/jpeg", "image/webp"])(
    "previews a supported %s file and tells the profile form about the validated draft",
    (type) => {
      const file = new File(["test image bytes"], "profile-image", { type });
      choose(file);
      expect(render().find((node) => node.type === "Image")?.props.src).toBe("blob:preview-1");
      expect(draft).toMatchObject({ action: "UPLOAD", file, preview: "blob:preview-1" });
      expect(error).toBe("");
      expect(text(render())).toContain("프로필 수정하기를 누르면 이미지와 프로필 정보를 함께 저장");
    },
  );

  it.each(["image/gif", "image/svg+xml", "text/plain"])(
    "rejects unsupported %s before preparing a preview",
    (type) => {
      choose(new File(["unsupported file"], "file", { type }));
      expect(error).toContain("PNG, JPG 또는 WebP");
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(draft).toBeNull();
    },
  );

  it.each([0, IMAGE_UPLOAD_MAX_BYTES + 1])("rejects an invalid %s-byte image", (size) => {
    choose(new File([new Uint8Array(size)], "profile.png", { type: "image/png" }));
    expect(error).toContain("4MB 이하");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(draft).toBeNull();
  });

  it("previews the exact 4MiB boundary and shows the same limit in the guide", () => {
    const file = new File([new Uint8Array(4 * 1024 * 1024)], "profile.png", { type: "image/png" });
    choose(file);
    expect(error).toBe("");
    expect(draft).toMatchObject({ action: "UPLOAD", file });
    expect(text(render())).toContain("최대 4MB");
    expect(text(elements(ProfileImageGuide()))).toContain("최대 크기는 4MB입니다");
  });

  it("keeps the previous valid file and preview when a later selected file is invalid", () => {
    const file = png();
    choose(file);
    render();
    choose(new File(["<svg/>"], "unsupported.svg", { type: "image/svg+xml" }));
    expect(draft).toMatchObject({ action: "UPLOAD", file, preview: "blob:preview-1" });
    expect(render().find((node) => node.type === "Image")?.props.src).toBe("blob:preview-1");
    expect(error).not.toBe("");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("marks custom image removal as a draft and restores the saved image on cancellation", () => {
    props.image = { imageUrl: "/api/profile/image/existing", hasCustomImage: true };
    click("이미지 삭제");
    expect(draft).toEqual({ action: "REMOVE" });
    expect(render().some((node) => node.type === "Avatar")).toBe(true);
    expect(text(render())).toContain("프로필 수정하기를 누르면 기본 아이콘으로");
    click("이미지 변경 취소");
    expect(draft).toBeNull();
    expect(render().find((node) => node.type === "Image")?.props.src).toBe(
      "/api/profile/image/existing",
    );
  });

  it("releases replaced preview URLs and discards an unsaved image on cancel", () => {
    choose(png("first.png"));
    render();
    choose(png("second.png"));
    expect(render().find((node) => node.type === "Image")?.props.src).toBe("blob:preview-2");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    click("이미지 변경 취소");
    expect(render().some((node) => node.type === "Avatar")).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-2");
    expect(boundary.input.value).toBe("");
  });

  it("provides a dialog trigger, labelled instructions and separate square/circle examples", () => {
    const nodes = elements(ProfileImageGuide());
    expect(nodes.some((node) => node.type === "Dialog.Trigger")).toBe(true);
    expect(nodes.some((node) => node.type === "Dialog.Title")).toBe(true);
    expect(nodes.some((node) => node.type === "Dialog.Description")).toBe(true);
    expect(nodes.some((node) => node.props.className === "profile-image-example-square")).toBe(
      true,
    );
    expect(nodes.some((node) => node.props.className === "profile-image-example-circle")).toBe(
      true,
    );
    expect(text(nodes)).toContain("512픽셀 이상");
    expect(text(nodes)).toContain("GIF와 SVG는 사용할 수 없습니다");
    expect(nodes.some((node) => node.props["aria-label"] === "안내 닫기")).toBe(true);
  });
});
