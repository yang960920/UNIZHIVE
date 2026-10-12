// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  useBrowserDraft,
  type BrowserDraftController,
} from "../src/lib/browser-drafts/use-browser-draft";
import { readBrowserDrafts, writeBrowserDraft } from "../src/lib/browser-drafts/store";
import * as draftStore from "../src/lib/browser-drafts/store";

vi.mock("@/components/user-preferences-provider", () => ({
  useUserPreferences: () => ({ userKey: "member" }),
}));
let root: Root, host: HTMLDivElement, controller: BrowserDraftController;
let current: { title: string; body?: string } = { title: "" };
let enabled = true;
const restore = vi.fn((value: typeof current) => {
  current = value;
  render();
});
function Fixture() {
  const draft = useBrowserDraft({
    scope: "community:new",
    value: current,
    hasContent: !!current.title,
    enabled,
    restore,
    validate: (value): value is typeof current =>
      !!value && typeof (value as typeof current).title === "string",
  });
  useLayoutEffect(() => {
    controller = draft;
  });
  return createElement("span", null, draft.status);
}
function render() {
  root.render(createElement(Fixture));
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("indexedDB", new IDBFactory());
  restore.mockClear();
  current = { title: "" };
  enabled = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser draft autosave lifecycle", () => {
  it("does not save an untouched empty editor when its initial document normalizes on mount", async () => {
    await act(async () => render());
    await settle();
    await act(async () => {
      current = { title: "", body: "empty editor document" };
      render();
    });
    await act(async () => root.unmount());
    await settle();
    expect(await readBrowserDrafts("member", "community:new")).toEqual([]);
  });
  it("waits for an in-flight write before acknowledging a manual save that reverts to the previous text", async () => {
    await act(async () => render());
    await settle();
    await act(async () => {
      current = { title: "A" };
      render();
    });
    await act(async () => controller.saveNow());
    const originalWrite = draftStore.writeBrowserDraft;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(draftStore, "writeBrowserDraft").mockImplementationOnce(async (input) => {
      started();
      await gate;
      return originalWrite(input);
    });
    await act(async () => {
      current = { title: "B" };
      render();
    });
    let inFlight!: Promise<boolean>;
    await act(async () => {
      inFlight = controller.saveNow();
      await began;
    });
    await act(async () => {
      current = { title: "A" };
      render();
    });
    await act(async () => {
      const manual = controller.saveNow();
      release();
      await inFlight;
      expect(await manual).toBe(true);
    });
    expect((await readBrowserDrafts("member", "community:new"))[0]?.value).toEqual({ title: "A" });
  });
  it("finishes cleanup when a successful publication disables the form while cleanup is pending", async () => {
    await act(async () => render());
    await settle();
    await act(async () => {
      current = { title: "등록 직전" };
      render();
    });
    await act(async () => controller.saveNow());
    await act(async () => {
      const cleanup = controller.clear();
      enabled = false;
      render();
      await cleanup;
    });
    await settle();
    expect(await readBrowserDrafts("member", "community:new")).toEqual([]);
    expect(await controller.saveNow()).toBe(false);
  });
  it("loads before saving, restores the previous input and permits manual saves with missing required fields", async () => {
    await writeBrowserDraft({
      owner: "member",
      scope: "community:new",
      writer: "old-tab",
      previous: null,
      value: { title: "이어서 작성" },
    });
    await act(async () => render());
    await settle();
    expect(controller.hydrated).toBe(true);
    expect(controller.restored).toBe(true);
    expect(current.title).toBe("이어서 작성");
    await act(async () => {
      current = { title: "" };
      render();
    });
    await act(async () => {
      expect(await controller.saveNow()).toBe(true);
    });
    expect((await readBrowserDrafts("member", "community:new"))[0]?.value).toEqual({ title: "" });
    await act(async () => controller.clear());
    expect(await readBrowserDrafts("member", "community:new")).toEqual([]);
    await act(async () => {
      current = { title: "늦은 이벤트" };
      render();
    });
    await act(async () => {
      expect(await controller.saveNow()).toBe(false);
    });
    expect(await readBrowserDrafts("member", "community:new")).toEqual([]);
  });
  it("automatically saves after typing pauses and flushes unsaved input on navigation", async () => {
    await act(async () => render());
    await settle();
    expect(await readBrowserDrafts("member", "community:new")).toEqual([]);
    await act(async () => {
      current = { title: "자동 저장" };
      render();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect((await readBrowserDrafts("member", "community:new"))[0]?.value).toEqual({
      title: "자동 저장",
    });
    await act(async () => {
      current = { title: "떠나기 직전 수정" };
      render();
    });
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await settle();
    expect((await readBrowserDrafts("member", "community:new"))[0]?.value).toEqual({
      title: "떠나기 직전 수정",
    });
  });
  it("keeps the editor usable when browser storage is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await act(async () => render());
    await settle();
    expect(controller.hydrated).toBe(true);
    expect(controller.status).toBe("error");
    await act(async () => {
      current = { title: "화면에는 유지" };
      render();
    });
    await act(async () => {
      expect(await controller.saveNow()).toBe(false);
    });
    expect(current.title).toBe("화면에는 유지");
  });
});
