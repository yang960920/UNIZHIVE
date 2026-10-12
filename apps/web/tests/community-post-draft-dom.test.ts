// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CommunityEditorData } from "../src/lib/server/community-repository";
import type { CommunityPostDraft } from "../src/components/community/post-draft";

const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  savePost: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
  userKey: "member-a",
  hydrated: true,
  recoveryKey: 0,
  options: null as null | {
    scope: string;
    value: CommunityPostDraft;
    hasContent: boolean;
    restore: (value: CommunityPostDraft) => void;
    validate: (value: unknown) => boolean;
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("../src/components/user-preferences-provider", () => ({
  useUserPreferences: () => ({ userKey: boundary.userKey }),
}));
vi.mock("../src/app/community/actions", () => ({
  saveCommunityPostForm: boundary.savePost,
  saveCommunityCommentForm: vi.fn(),
  archiveCommunityPostForm: vi.fn(),
  moderateCommunityPostForm: vi.fn(),
  archiveCommunityCommentForm: vi.fn(),
  moderateCommunityCommentForm: vi.fn(),
  saveAnnouncementForm: vi.fn(),
  archiveAnnouncementForm: vi.fn(),
}));
vi.mock("../src/lib/browser-drafts/use-browser-draft", () => ({
  useBrowserDraft: (options: NonNullable<typeof boundary.options>) => {
    boundary.options = options;
    return {
      hydrated: boundary.hydrated,
      status: "idle",
      savedAt: null,
      restored: false,
      error: null,
      recoveryKey: boundary.recoveryKey,
      recoveries: [],
      restoreRecovery: vi.fn(),
      saveNow: boundary.saveDraft,
      clear: boundary.clearDraft,
    };
  },
}));
vi.mock("../src/components/content/editor", async () => {
  const { createElement: h, useEffect } = await import("react");
  return {
    ContentEditor: (props: {
      initialText: string;
      initialDraft: { json: unknown; images: unknown[] };
      disabled: boolean;
      onReadyChange: (ready: boolean) => void;
    }) => {
      const { disabled, onReadyChange } = props;
      useEffect(() => onReadyChange(!disabled), [disabled, onReadyChange]);
      return h(
        "div",
        { "data-testid": "rich-editor" },
        h("input", { type: "hidden", name: "body", value: props.initialText }),
        h("input", {
          type: "hidden",
          name: "bodyDocument",
          value: JSON.stringify(props.initialDraft.json),
        }),
        h("input", { type: "hidden", name: "contentMediaReady", value: String(!props.disabled) }),
        h("span", null, props.initialText),
      );
    },
  };
});

import { CommunityPostForm } from "../src/components/community/forms";
import { createCommunityPostDraft } from "../src/components/community/post-draft";

let container: HTMLDivElement;
let root: Root;
const emptyData: CommunityEditorData = {
  buildVersions: [],
  canPin: true,
  buildOptionsTruncated: false,
};
async function render(data: CommunityEditorData = emptyData, showcase = false) {
  await act(async () => {
    root.render(
      createElement(CommunityPostForm, { data, filters: showcase ? { section: "SHOWCASE" } : {} }),
    );
  });
}
function input(name: string) {
  return container.querySelector(`[name="${name}"]`) as HTMLInputElement;
}
async function typeTitle(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input("title"),
      value,
    );
    input("title").dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.hydrated = true;
  boundary.userKey = "member-a";
  boundary.recoveryKey = 0;
  boundary.options = null;
  boundary.push.mockReset();
  boundary.savePost.mockReset().mockResolvedValue({ ok: false, message: "연결 실패" });
  boundary.saveDraft.mockReset().mockResolvedValue(true);
  boundary.clearDraft.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("community browser draft controls", () => {
  it("resets local values when another post or account replaces the mounted editor", async () => {
    const first: CommunityEditorData = {
      ...emptyData,
      initial: {
        id: "first-post",
        title: "첫 번째 글",
        body: "첫 번째 본문",
        category: "GENERAL",
        buildVersionId: null,
        isPinned: false,
        updatedAt: "2026-10-12T01:00:00Z",
      },
    };
    await render(first);
    await typeTitle("이전에 입력하던 비공개 내용");
    const second = {
      ...first,
      initial: { ...first.initial!, id: "second-post", title: "두 번째 글", body: "두 번째 본문" },
    };
    await render(second);
    expect(input("title").value).toBe("두 번째 글");
    expect(input("body").value).toBe("두 번째 본문");
    expect(boundary.options?.scope).toBe("community:post:second-post");
    await typeTitle("첫 계정의 작성 내용");
    boundary.userKey = "member-b";
    await render(second);
    expect(input("title").value).toBe("두 번째 글");
    expect(boundary.options?.value.title).toBe("두 번째 글");
    expect(container.textContent).not.toContain("첫 계정의 작성 내용");
  });

  it("keeps unfinished input and its edit stamp when only the same post's server version changes", async () => {
    const data: CommunityEditorData = {
      ...emptyData,
      initial: {
        id: "same-post",
        title: "저장된 글",
        body: "본문",
        category: "GENERAL",
        buildVersionId: null,
        isPinned: false,
        updatedAt: "2026-10-12T01:00:00Z",
      },
    };
    await render(data);
    await typeTitle("유지해야 할 작성 중 제목");
    await render({
      ...data,
      initial: { ...data.initial!, title: "다른 곳에서 변경", updatedAt: "2026-10-12T05:00:00Z" },
    });
    expect(input("title").value).toBe("유지해야 할 작성 중 제목");
    expect(input("expectedUpdatedAt").value).toBe("2026-10-12T01:00:00Z");
    expect(container.textContent).toContain("임시저장 이후 게시글이 변경");
  });

  it("lets an incomplete title be saved manually without attempting publication", async () => {
    await render();
    await typeTitle("짧");
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === "임시저장",
    )!;
    expect(button.type).toBe("button");
    await act(async () => button.click());
    expect(boundary.saveDraft).toHaveBeenCalledOnce();
    expect(boundary.savePost).not.toHaveBeenCalled();
    expect(boundary.options?.value.title).toBe("짧");
    expect(boundary.options?.hasContent).toBe(true);
  });

  it("waits for local recovery before mounting the rich editor and enabling inputs", async () => {
    boundary.hydrated = false;
    await render();
    expect(input("title").disabled).toBe(true);
    expect(container.querySelector('[data-testid="rich-editor"]')).toBeNull();
    const saved = createCommunityPostDraft(undefined, "GENERAL");
    saved.title = "복구한 글";
    saved.body = "작성하던 사진 설명";
    saved.youtubeUrl = "https://youtu.be/dQw4w9WgXcQ";
    await act(async () => boundary.options!.restore(saved));
    boundary.hydrated = true;
    await render();
    expect(input("title").value).toBe("복구한 글");
    expect(input("youtubeUrl").value).toBe(saved.youtubeUrl);
    expect(container.querySelector('[data-testid="rich-editor"]')?.textContent).toContain(
      saved.body,
    );
    expect(input("title").disabled).toBe(false);
  });

  it("separates board and showcase drafts and rejects recovery from a different section", async () => {
    await render(emptyData, true);
    expect(boundary.options?.scope).toBe("community:new:showcase");
    expect(boundary.options?.validate(createCommunityPostDraft(undefined, "GENERAL"))).toBe(false);
    expect(boundary.options?.validate(createCommunityPostDraft(undefined, "SHOWCASE"))).toBe(true);
  });

  it("preserves an old edit stamp and photograph files when a newer server post exists", async () => {
    const data: CommunityEditorData = {
      ...emptyData,
      initial: {
        id: "post-id",
        title: "최신 글",
        body: "최신 내용",
        category: "BUILD",
        buildVersionId: "version-id",
        isPinned: true,
        updatedAt: "2026-10-12T05:00:00Z",
      },
    };
    await render(data);
    const saved = createCommunityPostDraft(
      { ...data.initial!, updatedAt: "2026-10-12T01:00:00Z" },
      "GENERAL",
    );
    saved.title = "중단된 수정";
    const uploadId = "89b5d573-7412-4901-8bc9-ea37403dbe44";
    const file = new File(["unfinished image"], "photo.png", { type: "image/png" });
    saved.contentDraft.images = [{ key: uploadId, uploadId, file }];
    saved.contentDraft.json.content?.push({ type: "image", attrs: { uploadId } });
    expect(boundary.options?.validate(saved)).toBe(true);
    await act(async () => boundary.options!.restore(saved));
    boundary.recoveryKey++;
    await render(data);
    expect(input("expectedUpdatedAt").value).toBe("2026-10-12T01:00:00Z");
    expect(input("title").value).toBe("중단된 수정");
    expect(boundary.options?.value.contentDraft.images[0].file).toBe(file);
    expect(container.textContent).toContain("임시저장 이후 게시글이 변경");
    await submit();
    expect((boundary.savePost.mock.calls[0][1] as FormData).get("expectedUpdatedAt")).toBe(
      saved.expectedUpdatedAt,
    );
    expect(boundary.clearDraft).not.toHaveBeenCalled();
  });

  it("keeps drafts after a failed write and clears only after successful registration", async () => {
    await render();
    await typeTitle("보존할 글");
    await submit();
    expect(boundary.clearDraft).not.toHaveBeenCalled();
    expect(input("title").value).toBe("보존할 글");
    boundary.savePost.mockResolvedValue({
      ok: true,
      message: "등록 완료",
      href: "/community/new-id",
    });
    await submit();
    expect(boundary.clearDraft).toHaveBeenCalledOnce();
    expect(boundary.push).toHaveBeenCalledWith("/community/new-id");
    expect(boundary.clearDraft.mock.invocationCallOrder[0]).toBeLessThan(
      boundary.push.mock.invocationCallOrder[0],
    );
  });
});
