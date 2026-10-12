// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Slice } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
const boundary = vi.hoisted(() => ({ upload: vi.fn(), editor: null as Editor | null }));
vi.mock("@/lib/content-document", () => import("../src/lib/content-document"));
vi.mock("@/lib/content-media-actions", () => ({ uploadContentImage: boundary.upload }));
vi.mock("@tiptap/react", async (original) => {
  const actual = await original<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (options: Parameters<typeof actual.useEditor>[0]) => {
      const editor = actual.useEditor(options);
      boundary.editor = editor;
      return editor;
    },
  };
});
import { ContentEditor, type ContentEditorDraft } from "../src/components/content/editor";
import { contentDraftJson, isContentEditorDraft } from "../src/components/content/draft";
import { ContentBody, VideoReference, YouTubeField } from "../src/components/content/presentation";
const imageId = "bf93c9f3-367e-4d2e-a8b2-d576aa867da1";
let container: HTMLDivElement, root: Root;
async function mount() {
  await act(async () => {
    root.render(createElement(ContentEditor, { initialText: "앞뒤" }));
  });
}
function savedDocument() {
  return JSON.parse(
    (container.querySelector('input[name="bodyDocument"]') as HTMLInputElement).value,
  );
}
function ready() {
  return (container.querySelector('input[name="contentMediaReady"]') as HTMLInputElement).value;
}
async function drop(file: File, position = 2) {
  const editor = boundary.editor!;
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: position, inside: 0 });
  const plugin = editor.state.plugins.find((value) => value.key.startsWith("fileHandler"))!;
  const event = new Event("drop", { cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: [file] } });
  await act(async () => {
    plugin.props.handleDrop!.call(plugin, editor.view, event as DragEvent, Slice.empty, false);
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.editor = null;
  boundary.upload.mockReset().mockResolvedValue({
    ok: true,
    image: { id: imageId, url: `/api/content/image/${imageId}`, width: 100, height: 50 },
  });
  const BaseURL = globalThis.URL;
  vi.stubGlobal(
    "URL",
    class extends BaseURL {
      static createObjectURL() {
        return "blob:preview";
      }
      static revokeObjectURL() {}
    },
  );
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("real rich-editor image user flow", () => {
  it("uploads the exact 4MiB boundary but rejects the next byte without sending or losing the text", async () => {
    await mount();
    expect(container.textContent).toContain("이미지당 4MB");
    const tooLarge = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });
    await drop(tooLarge);
    expect(boundary.upload).not.toHaveBeenCalled();
    expect(container.querySelector(".tiptap")?.textContent).toContain("앞뒤");
    expect(container.textContent).toContain("4MB 이하");
    const limit = new File([new Uint8Array(4 * 1024 * 1024)], "limit.png", { type: "image/png" });
    await drop(limit);
    expect(boundary.upload).toHaveBeenCalledOnce();
    expect((boundary.upload.mock.calls[0][0] as FormData).get("image")).toBe(limit);
    expect(ready()).toBe("true");
  });
  it("inserts a dropped file at the actual drop cursor and keeps text on both sides", async () => {
    await mount();
    await drop(new File(["PNG contents"], "map.png", { type: "image/png" }));
    const content = savedDocument().content;
    expect(content.map((node: { type: string }) => node.type)).toEqual([
      "paragraph",
      "image",
      "paragraph",
    ]);
    expect(content[0].content[0].text).toBe("앞");
    expect(content[1].attrs.imageId).toBe(imageId);
    expect(content[2].content[0].text).toBe("뒤");
    expect(ready()).toBe("true");
    expect(JSON.stringify(content)).not.toContain("blob:");
    expect(boundary.upload).toHaveBeenCalledOnce();
  });

  it("keeps a failed image preview and article text, blocks saving, and recovers through retry", async () => {
    boundary.upload.mockResolvedValueOnce({ ok: false, message: "연결 실패" });
    await mount();
    await drop(new File(["PNG contents"], "map.png", { type: "image/png" }));
    expect(container.querySelector(".tiptap img")?.getAttribute("src")).toBe("blob:preview");
    expect(container.querySelector(".tiptap")?.textContent).toContain("앞");
    expect(ready()).toBe("false");
    expect(savedDocument().content.every((node: { type: string }) => node.type !== "image")).toBe(
      true,
    );
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "다시 시도",
    )!;
    await act(async () => retry.click());
    expect(ready()).toBe("true");
    expect(savedDocument().content.some((node: { type: string }) => node.type === "image")).toBe(
      true,
    );
    expect(boundary.upload).toHaveBeenCalledTimes(2);
  });

  it("allows removing a failed image without discarding the typed article text", async () => {
    boundary.upload.mockResolvedValue({ ok: false, message: "연결 실패" });
    await mount();
    await drop(new File(["PNG contents"], "map.png", { type: "image/png" }));
    const remove = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "제거",
    )!;
    await act(async () => remove.click());
    expect(container.querySelector(".tiptap img")).toBeNull();
    expect(ready()).toBe("true");
    expect((container.querySelector('input[name="body"]') as HTMLInputElement).value).toContain(
      "앞",
    );
    expect((container.querySelector('input[name="body"]') as HTMLInputElement).value).toContain(
      "뒤",
    );
  });

  it("does not intercept an editor-internal image move as a second file upload", async () => {
    await mount();
    const editor = boundary.editor!;
    const plugin = editor.state.plugins.find((value) => value.key.startsWith("fileHandler"))!;
    const event = new Event("drop", { cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        types: ["application/x-prosemirror-slice", "Files"],
        files: [new File(["PNG"], "image.png", { type: "image/png" })],
      },
    });
    let handled: boolean | void;
    await act(async () => {
      handled = plugin.props.handleDrop!.call(
        plugin,
        editor.view,
        event as DragEvent,
        Slice.empty,
        true,
      );
    });
    expect(handled!).toBe(false);
    expect(boundary.upload).not.toHaveBeenCalled();
  });

  it("retains bold and list formatting in the server-validated document", async () => {
    await mount();
    await act(async () => {
      boundary.editor!.chain().selectAll().toggleBold().toggleBulletList().run();
    });
    expect(savedDocument().content[0].type).toBe("bulletList");
    expect(savedDocument().content[0].content[0].content[0].content[0].marks).toEqual([
      { type: "bold" },
    ]);
    expect(ready()).toBe("true");
  });

  it("moves a selected image between text blocks and deletes only the image", async () => {
    await mount();
    await drop(new File(["PNG contents"], "map.png", { type: "image/png" }));
    await act(async () => boundary.editor!.chain().setNodeSelection(3).run());
    await act(async () =>
      (container.querySelector('[aria-label="이미지 위로 이동"]') as HTMLButtonElement).click(),
    );
    expect(savedDocument().content.map((node: { type: string }) => node.type)).toEqual([
      "image",
      "paragraph",
      "paragraph",
    ]);
    await act(async () => boundary.editor!.chain().setNodeSelection(0).run());
    await act(async () =>
      (container.querySelector('[aria-label="이미지 아래로 이동"]') as HTMLButtonElement).click(),
    );
    expect(savedDocument().content.map((node: { type: string }) => node.type)).toEqual([
      "paragraph",
      "image",
      "paragraph",
    ]);
    await act(async () => boundary.editor!.chain().setNodeSelection(3).run());
    await act(async () =>
      (container.querySelector('[aria-label="선택한 이미지 삭제"]') as HTMLButtonElement).click(),
    );
    expect(savedDocument().content.map((node: { type: string }) => node.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    expect((container.querySelector('input[name="body"]') as HTMLInputElement).value).toBe(
      "앞\n\n뒤",
    );
    expect(boundary.upload).toHaveBeenCalledOnce();
  });

  it("supports the image-add file input and never resurrects an upload deleted before its response", async () => {
    let finish!: (result: unknown) => void;
    boundary.upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    await act(async () => boundary.editor!.chain().setTextSelection(2).run());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const chosen = new File(["PNG contents"], "map.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [chosen] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(ready()).toBe("false");
    expect((boundary.upload.mock.calls[0][0] as FormData).get("image")).toBe(chosen);
    const remove = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "제거",
    )!;
    await act(async () => remove.click());
    await act(async () =>
      finish({
        ok: true,
        image: { id: imageId, url: `/api/content/image/${imageId}`, width: 100, height: 50 },
      }),
    );
    expect(container.querySelector(".tiptap img")).toBeNull();
    expect(ready()).toBe("true");
    expect(savedDocument().content.every((node: { type: string }) => node.type !== "image")).toBe(
      true,
    );
  });
});

describe("browser draft content and photo restoration", () => {
  const uploadId = "ca95dbaa-d067-478e-923c-a19e4c99f8c0";
  function photoDraft(file: File, completed = false): ContentEditorDraft {
    return {
      json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "복구할 글", marks: [{ type: "bold" }] }],
          },
          {
            type: "image",
            attrs: {
              imageId: completed ? imageId : null,
              uploadId: completed ? null : uploadId,
              alt: "지도 사진",
              src: "blob:old-page",
            },
          },
          { type: "paragraph", content: [{ type: "text", text: "뒷부분" }] },
        ],
      },
      images: [{ key: uploadId, ...(completed ? { imageId } : { uploadId }), file }],
    };
  }

  it("preserves pending photo originals in snapshots, then keeps the original after upload succeeds", async () => {
    let finish!: (result: unknown) => void;
    boundary.upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onDraftChange = vi.fn();
    await act(async () =>
      root.render(createElement(ContentEditor, { initialText: "앞뒤", onDraftChange })),
    );
    const file = new File(["photo"], "지도.png", { type: "image/png" });
    await drop(file);
    const pending = onDraftChange.mock.lastCall![0] as ContentEditorDraft;
    expect(pending.images[0].file).toBe(file);
    expect(
      pending.json.content?.some((node) => node.type === "image" && node.attrs?.uploadId),
    ).toBe(true);
    expect(JSON.stringify(pending.json)).not.toContain("blob:");
    expect(isContentEditorDraft(pending)).toBe(true);
    expect(ready()).toBe("false");
    await act(async () =>
      finish({ ok: true, image: { id: imageId, url: `/api/content/image/${imageId}` } }),
    );
    const complete = onDraftChange.mock.lastCall![0] as ContentEditorDraft;
    expect(complete.images[0].imageId).toBe(imageId);
    expect(complete.images[0].uploadId).toBeUndefined();
    expect(complete.images[0].file).toBe(file);
    expect(ready()).toBe("true");
    const calls = onDraftChange.mock.calls.length;
    await act(async () => boundary.editor!.chain().setTextSelection(1).run());
    expect(onDraftChange).toHaveBeenCalledTimes(calls);
  });

  it("recreates a pending photo preview from the saved File, preserves failure, and retries without losing surrounding prose", async () => {
    boundary.upload.mockResolvedValueOnce({ ok: false, message: "연결 실패" });
    const file = new File(["photo"], "지도.png", { type: "image/png" });
    const onDraftChange = vi.fn();
    await act(async () =>
      root.render(createElement(ContentEditor, { initialDraft: photoDraft(file), onDraftChange })),
    );
    expect(boundary.upload).toHaveBeenCalledOnce();
    expect((boundary.upload.mock.calls[0][0] as FormData).get("image")).toBe(file);
    expect(container.querySelector(".tiptap img")?.getAttribute("src")).toBe("blob:preview");
    expect(container.querySelector(".tiptap strong")?.textContent).toBe("복구할 글");
    expect(container.querySelector(".tiptap")?.textContent).toContain("뒷부분");
    expect(ready()).toBe("false");
    expect((onDraftChange.mock.lastCall![0] as ContentEditorDraft).images[0].file).toBe(file);
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "다시 시도")!
        .click(),
    );
    expect(boundary.upload).toHaveBeenCalledTimes(2);
    expect(ready()).toBe("true");
    expect(savedDocument().content[1].attrs.alt).toBe("지도 사진");
  });

  it("keeps a previously uploaded image id on restoration and uploads its original only if the image is missing", async () => {
    const file = new File(["photo"], "지도.png", { type: "image/png" });
    const onDraftChange = vi.fn();
    await act(async () =>
      root.render(
        createElement(ContentEditor, { initialDraft: photoDraft(file, true), onDraftChange }),
      ),
    );
    expect(boundary.upload).not.toHaveBeenCalled();
    expect(container.querySelector(".tiptap img")?.getAttribute("src")).toBe(
      `/api/content/image/${imageId}`,
    );
    expect(ready()).toBe("true");
    const replacement = "e9eacdd5-6e99-4c20-8ae4-3b4a8701d2c5";
    boundary.upload.mockResolvedValue({
      ok: true,
      image: { id: replacement, url: `/api/content/image/${replacement}` },
    });
    await act(async () =>
      container.querySelector(".tiptap img")!.dispatchEvent(new Event("error")),
    );
    expect(boundary.upload).toHaveBeenCalledOnce();
    expect((boundary.upload.mock.calls[0][0] as FormData).get("image")).toBe(file);
    expect(savedDocument().content[1].attrs.imageId).toBe(replacement);
    expect((onDraftChange.mock.lastCall![0] as ContentEditorDraft).images[0].imageId).toBe(
      replacement,
    );
    expect(container.querySelector(".tiptap")?.textContent).toContain("복구할 글");
    await act(async () =>
      container.querySelector(".tiptap img")!.dispatchEvent(new Event("error")),
    );
    expect(boundary.upload).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "사진을 불러오지 못했습니다",
    );
  });

  it("removes deleted photos from local backups and ignores their late upload response", async () => {
    let finish!: (result: unknown) => void;
    boundary.upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onDraftChange = vi.fn();
    await act(async () =>
      root.render(
        createElement(ContentEditor, {
          initialDraft: photoDraft(new File(["photo"], "지도.png", { type: "image/png" })),
          onDraftChange,
        }),
      ),
    );
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "제거")!
        .click(),
    );
    await act(async () =>
      finish({ ok: true, image: { id: imageId, url: `/api/content/image/${imageId}` } }),
    );
    expect((onDraftChange.mock.lastCall![0] as ContentEditorDraft).images).toEqual([]);
    expect(container.querySelector(".tiptap img")).toBeNull();
    expect(container.querySelector(".tiptap")?.textContent).toContain("복구할 글");
  });

  it("retains invalid-length draft prose so the author can fix it after reopening", async () => {
    const text = "가".repeat(20_001);
    const initialDraft: ContentEditorDraft = {
      json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
      images: [],
    };
    const onDraftChange = vi.fn();
    expect(isContentEditorDraft(initialDraft)).toBe(true);
    await act(async () =>
      root.render(createElement(ContentEditor, { initialDraft, onDraftChange })),
    );
    expect(container.querySelector(".tiptap")?.textContent).toBe(text);
    expect(
      (onDraftChange.mock.lastCall![0] as ContentEditorDraft).json.content?.[0].content?.[0].text,
    ).toBe(text);
    expect(ready()).toBe("false");
  });

  it("rejects malformed draft nodes and image backups and strips stale object URLs", () => {
    const file = new File(["photo"], "지도.png", { type: "image/png" });
    const valid = photoDraft(file);
    expect(isContentEditorDraft(valid)).toBe(true);
    expect(JSON.stringify(contentDraftJson(valid.json))).not.toContain("blob:old-page");
    expect(
      isContentEditorDraft({ ...valid, images: [{ ...valid.images[0], file: "not a File" }] }),
    ).toBe(false);
    expect(
      isContentEditorDraft({ json: { type: "doc", content: [{ type: "iframe" }] }, images: [] }),
    ).toBe(false);
    expect(
      isContentEditorDraft({
        json: { type: "doc", content: [{ type: "text", text: "x", marks: [null] }] },
        images: [],
      }),
    ).toBe(false);
  });
});

describe("safe article and optional video presentation", () => {
  it("reflects restored controlled YouTube values without requiring another field mount", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(createElement(YouTubeField, { value: "", onChange })));
    await act(async () =>
      root.render(createElement(YouTubeField, { value: "https://youtu.be/dQw4w9WgXcQ", onChange })),
    );
    expect((container.querySelector('input[name="youtubeUrl"]') as HTMLInputElement).value).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );
    expect(container.querySelector(".content-video")).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("waits for a reader click before loading the YouTube player and preserves a valid start time", async () => {
    await act(async () =>
      root.render(createElement(VideoReference, { url: "https://youtu.be/dQw4w9WgXcQ?t=1m20s" })),
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")?.href).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=80s",
    );
    await act(async () => (container.querySelector("button") as HTMLButtonElement).click());
    expect(container.querySelector("iframe")?.src).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=80",
    );
    await act(async () =>
      root.render(createElement(VideoReference, { url: "https://example.com/video" })),
    );
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("keeps YouTube optional and does not render external video content for an invalid URL", async () => {
    await act(async () => root.render(createElement(YouTubeField, { initialUrl: null })));
    const optionalInput = container.querySelector('input[name="youtubeUrl"]') as HTMLInputElement;
    expect(optionalInput.required).toBe(false);
    expect(container.querySelector(".content-video")).toBeNull();
    await act(async () =>
      root.render(
        createElement(YouTubeField, {
          key: "invalid",
          initialUrl: "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
        }),
      ),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("확인");
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("preserves legacy text and displays HTML-like text without evaluating it", async () => {
    await act(async () =>
      root.render(
        createElement(ContentBody, {
          document: null,
          text: "첫 줄\n둘째 줄\n\n<script>bad()</script>",
        }),
      ),
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>bad()</script>");
  });
});
