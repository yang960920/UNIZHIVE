// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEAPON_TUNING_BLUEPRINTS } from "@uniz/build-engine";
import { TuningPicker } from "../src/components/build-planner/tuning-picker";

let container: HTMLDivElement, root: Root, selected: string | null;
const blueprints = WEAPON_TUNING_BLUEPRINTS.filter(
  (blueprint) => blueprint.weaponFamilies.includes("AR") && !blueprint.seasonal,
);
function Harness() {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    selected = value;
  }, [value]);
  return createElement(
    "form",
    {},
    createElement(TuningPicker, {
      blueprints,
      selectedId: value,
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
async function key(
  key: string,
  options: KeyboardEventInit = {},
  target = container.querySelector("input")!,
) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  await act(async () => target.dispatchEvent(event));
  return event;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  selected = null;
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

describe("direct tuning selection", () => {
  it("shows three named rows with all nine directly selectable grades", async () => {
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(3);
    const options = [...container.querySelectorAll<HTMLButtonElement>('button[role="option"]')];
    expect(options).toHaveLength(9);
    expect(container.querySelector("select")).toBeNull();
    const yellow = options.find(
      (node) => node.getAttribute("aria-label") === "튜닝 설계도·속사 소총 · 노랑",
    )!;
    await act(async () => yellow.click());
    expect(selected).toBe(
      blueprints.find((item) => item.name.includes("속사") && item.rarity === "LEGENDARY")!.id,
    );
    expect(yellow.getAttribute("aria-selected")).toBe("true");
  });
  it("combines name or effect terms with a grade and selects a single result with Enter", async () => {
    await input("  속사   노랑  ");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect((await key("Enter")).defaultPrevented).toBe(true);
    const chosen = blueprints.find(
      (item) => item.name.includes("속사") && item.rarity === "LEGENDARY",
    )!;
    expect(selected).toBe(chosen.id);
    await input("탄창 용량 파랑");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(container.querySelector('[role="option"]')?.getAttribute("aria-label")).toBe(
      "튜닝 설계도·대형 소총 · 파랑",
    );
    expect(selected).toBe(chosen.id);
    await input("없는 검색어");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "검색 결과가 없습니다",
    );
    expect(selected).toBe(chosen.id);
  });
  it("keeps ambiguous and Korean composition Enter from choosing, and supports arrow selection", async () => {
    await input("속사");
    await key("Enter");
    expect(selected).toBeNull();
    await input("속사 노랑");
    await key("Enter", { isComposing: true });
    await key("Enter", { keyCode: 229 });
    expect(selected).toBeNull();
    await input("속사");
    await key("ArrowDown");
    await key("ArrowDown");
    const activeId = container.querySelector("input")!.getAttribute("aria-activedescendant")!;
    expect(document.getElementById(activeId)?.textContent).toBe("보라");
    await key("Enter");
    expect(selected).toBe(
      blueprints.find((item) => item.name.includes("속사") && item.rarity === "EPIC")!.id,
    );
    const clear = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.textContent === "튜닝 선택 해제",
    )!;
    await act(async () => clear.click());
    expect(selected).toBeNull();
  });
});
