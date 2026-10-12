import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  readBrowserDrafts,
  writeBrowserDraft,
  deleteBrowserDraft,
  browserDraftError,
  markBrowserDraftPublished,
} from "../src/lib/browser-drafts/store";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => vi.unstubAllGlobals());

const identity = { owner: "member-a", scope: "build:new", writer: "tab-a" };

describe("durable browser drafts", () => {
  it("hides successfully published drafts even if cleanup failed while retaining a newer revision", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const published = await writeBrowserDraft({
      ...identity,
      previous: null,
      value: { title: "게시한 초안" },
    });
    markBrowserDraftPublished(published);
    expect(await readBrowserDrafts(identity.owner, identity.scope)).toEqual([]);
    await writeBrowserDraft({
      ...identity,
      writer: "other-tab",
      previous: published,
      value: { title: "새 수정" },
    });
    expect((await readBrowserDrafts(identity.owner, identity.scope))[0]?.value).toEqual({
      title: "새 수정",
    });
  });
  it("commits incomplete text and original photos, separately from other accounts and editors", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    const saved = await writeBrowserDraft({
      ...identity,
      previous: null,
      value: { title: "", numberTexts: { star: "4x" }, file, pendingImage: "job-a" },
    });
    const recovered = (
      await readBrowserDrafts<typeof saved.value>(identity.owner, identity.scope)
    )[0]!;
    expect(recovered.id).toBe(saved.id);
    expect(recovered.value.numberTexts.star).toBe("4x");
    expect(recovered.value.file.size).toBe(3);
    expect(Array.from(new Uint8Array(await recovered.value.file.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(await readBrowserDrafts("member-b", identity.scope)).toEqual([]);
    expect(await readBrowserDrafts(identity.owner, "community:new:board")).toEqual([]);
  });
  it("forks simultaneous edits instead of replacing the other tab's saved content", async () => {
    const original = await writeBrowserDraft({
      ...identity,
      previous: null,
      value: { title: "공통 시작" },
    });
    const first = await writeBrowserDraft({
      ...identity,
      previous: original,
      value: { title: "첫 탭 변경" },
    });
    const second = await writeBrowserDraft({
      ...identity,
      writer: "tab-b",
      previous: original,
      value: { title: "다른 탭 변경" },
    });
    expect(first.id).not.toBe(second.id);
    expect(
      (await readBrowserDrafts(identity.owner, identity.scope)).map((record) => record.value),
    ).toEqual(expect.arrayContaining([{ title: "첫 탭 변경" }, { title: "다른 탭 변경" }]));
    await deleteBrowserDraft(original);
    expect(await readBrowserDrafts(identity.owner, identity.scope)).toHaveLength(2);
    await deleteBrowserDraft(second);
    expect((await readBrowserDrafts(identity.owner, identity.scope))[0]?.value).toEqual({
      title: "첫 탭 변경",
    });
  });
  it("does not restore drafts older than 30 days", async () => {
    const now = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(now - 31 * 86400000);
    await writeBrowserDraft({ ...identity, previous: null, value: { title: "오래된 초안" } });
    time.mockReturnValue(now);
    expect(await readBrowserDrafts(identity.owner, identity.scope)).toEqual([]);
    await writeBrowserDraft({ ...identity, previous: null, value: { title: "새 초안" } });
    expect(await readBrowserDrafts(identity.owner, identity.scope)).toHaveLength(1);
    time.mockRestore();
  });
  it("reports unavailable storage and quota errors without pretending a save succeeded", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(
      writeBrowserDraft({ ...identity, previous: null, value: { title: "보존" } }),
    ).rejects.toThrow();
    expect(browserDraftError(new DOMException("full", "QuotaExceededError"))).toContain(
      "저장 공간이 부족",
    );
  });
});
