// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CraftingMaterialPicker } from "../src/components/build-planner/crafting-material-picker";

let container: HTMLDivElement, root: Root, selected: string | null;
const options = [
  { id: "deer", label: "사슴 가죽", rarity: "NORMAL" as const },
  { id: "forest", label: "숲 사슴 가죽", rarity: "EPIC" as const },
  { id: "dream", label: "꿈의 사슴 가죽", rarity: "LEGENDARY" as const },
];
function Harness() {
  const [value, setValue] = useState<string | null>("deer");
  useEffect(() => {
    selected = value;
  }, [value]);
  return createElement(
    "form",
    {},
    createElement(CraftingMaterialPicker, {
      label: "가죽",
      options,
      selectedId: value,
      defaultId: "deer",
      onChange: setValue,
    }),
  );
}
async function input(value: string) {
  const node = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function enter(isComposing = false) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    isComposing,
  });
  await act(async () => container.querySelector("input")!.dispatchEvent(event));
  return event;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("text crafting material selection", () => {
  it("shows the representative material, finds names without spaces, and restores the default", async () => {
    expect(container.querySelector('[role="status"]')?.textContent).toContain("사슴 가죽 · 초록");
    await input("숲사슴가죽");
    expect((await enter()).defaultPrevented).toBe(true);
    expect(selected).toBe("forest");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("보라");
    const reset = [...container.querySelectorAll("button")].find(
      (node) => node.textContent === "기본 재료로 복원",
    )!;
    await act(async () => reset.click());
    expect(selected).toBe("deer");
  });
  it("searches rarity and never picks an arbitrary material on an ambiguous or composing Enter", async () => {
    await input("사슴");
    await enter();
    expect(selected).toBe("deer");
    await input("노랑");
    await enter(true);
    expect(selected).toBe("deer");
    await enter();
    expect(selected).toBe("dream");
  });
});
