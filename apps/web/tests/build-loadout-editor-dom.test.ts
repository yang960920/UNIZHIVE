// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadoutEditor } from "../src/components/build-loadouts/editor";
import type { LoadoutBuildChoice } from "../src/lib/data/build-loadout-types";

const actions = vi.hoisted(() => ({
  search: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../src/app/lab/loadouts/actions", () => ({
  saveBuildLoadout: actions.save,
  searchLoadoutBuilds: actions.search,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: actions.push, refresh: actions.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) =>
    createElement("a", { href }, children as string),
}));
let root: Root, container: HTMLDivElement;
const choice = (index: number): LoadoutBuildChoice => ({
  buildId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  buildVersionId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  version: index,
  title: `빌드 ${index}`,
  archived: false,
});
async function mount(preview = false) {
  await act(async () =>
    root.render(
      createElement(LoadoutEditor, {
        choices: { items: [choice(1), choice(2)], nextCursor: "second-page" },
        preview,
      }),
    ),
  );
}
async function input(id: string, value: string) {
  const node = container.querySelector(`#${id}`) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  const node = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === label || item.getAttribute("aria-label") === label,
  );
  if (!node) throw new Error(`Missing ${label}`);
  return node;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function add(index: number) {
  const node = Array.from(container.querySelectorAll(".loadout-candidates li"))
    .find((item) => item.textContent?.includes(`빌드 ${index} · v${index}`))!
    .querySelector("button")!;
  await act(async () => node.click());
}
const selectedIds = () =>
  Array.from(container.querySelectorAll<HTMLInputElement>('input[name="buildVersionId"]')).map(
    (node) => node.value,
  );
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  actions.search.mockReset();
  actions.save.mockReset();
  actions.push.mockClear();
  actions.refresh.mockClear();
  actions.save.mockResolvedValue({ ok: false, message: "연결을 확인해주세요." });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("loadout editor", () => {
  it("explains each requirement and enables save after the title and two versions are selected", async () => {
    await mount();
    expect(button("로드아웃 저장").disabled).toBe(true);
    expect(container.textContent).toContain("이름을 2자 이상");
    await input("loadout-title", "보스와 파밍");
    expect(container.textContent).toContain("빌드를 2개 이상");
    await add(1);
    await add(2);
    expect(button("로드아웃 저장").disabled).toBe(false);
    expect(container.textContent).toContain("각 버전은 고정");
  });
  it("preserves selections while paging through every saved version and rejects duplicate additions", async () => {
    await mount();
    await add(1);
    const firstAdd = container.querySelector(".loadout-candidates li button") as HTMLButtonElement;
    expect(firstAdd.disabled).toBe(true);
    actions.search.mockResolvedValue({
      ok: true,
      message: "",
      page: { items: [choice(3)], nextCursor: null },
    });
    await click("다음 저장 버전 보기 →");
    expect(actions.search).toHaveBeenCalledWith("", "second-page");
    await add(3);
    expect(selectedIds()).toEqual([choice(1).buildVersionId, choice(3).buildVersionId]);
  });
  it("reorders and removes versions without changing the original builds", async () => {
    await mount();
    await add(1);
    await add(2);
    await click("빌드 2 v2 위로");
    expect(selectedIds()).toEqual([choice(2).buildVersionId, choice(1).buildVersionId]);
    await click("빌드 2 v2 제외");
    expect(selectedIds()).toEqual([choice(1).buildVersionId]);
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("searches on Enter without submitting the outer form and ignores Korean composition Enter", async () => {
    await mount();
    await input("loadout-build-query", "새 빌드");
    actions.search.mockResolvedValue({
      ok: true,
      message: "",
      page: { items: [choice(3)], nextCursor: null },
    });
    const node = container.querySelector("#loadout-build-query")!;
    await act(async () =>
      node.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(actions.search).not.toHaveBeenCalled();
    await act(async () =>
      node.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      ),
    );
    expect(actions.search).toHaveBeenCalledWith("새 빌드", undefined);
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("preserves entered text and ordered versions after saving fails", async () => {
    await mount();
    await input("loadout-title", "보스와 파밍");
    await add(2);
    await add(1);
    await click("로드아웃 저장");
    expect(actions.save).toHaveBeenCalledTimes(1);
    const form = actions.save.mock.calls[0][1] as FormData;
    expect(form.getAll("buildVersionId")).toEqual([
      choice(2).buildVersionId,
      choice(1).buildVersionId,
    ]);
    expect(container.textContent).toContain("연결을 확인해주세요.");
    expect((container.querySelector("#loadout-title") as HTMLInputElement).value).toBe(
      "보스와 파밍",
    );
    expect(selectedIds()).toEqual([choice(2).buildVersionId, choice(1).buildVersionId]);
  });
  it("keeps preview writes and private searches disabled", async () => {
    await mount(true);
    await input("loadout-title", "미리 보기");
    await add(1);
    await add(2);
    expect(button("로드아웃 저장").disabled).toBe(true);
    expect(button("검색").disabled).toBe(true);
    expect(container.textContent).toContain("개발 계정에서는 실제 로드아웃");
  });
});
