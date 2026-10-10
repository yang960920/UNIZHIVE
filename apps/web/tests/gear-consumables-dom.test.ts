// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSUMABLE_CATALOG,
  createEmptyConsumableLoadout,
  type ConsumableLoadout,
  type ConsumableCatalogItem,
} from "@uniz/build-engine";
import {
  GearConsumablesEditor,
  GearConsumablesView,
} from "../src/components/build-planner/gear-consumables";
import { consumableSelectionError } from "../src/components/build-planner/gear-consumables-model";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    createElement("img", { src: props.src, alt: props.alt }),
}));

let container: HTMLDivElement, root: Root, latest: ConsumableLoadout;
const foods = CONSUMABLE_CATALOG.filter((item) => item.kind === "FOOD");
const drinks = CONSUMABLE_CATALOG.filter((item) => item.kind === "DRINK");
function Harness({
  initial = createEmptyConsumableLoadout(),
  initialClass = null,
}: {
  initial?: ConsumableLoadout;
  initialClass?: string | null;
}) {
  const [value, setValue] = useState(initial);
  const [characterClass, setClass] = useState(initialClass);
  useEffect(() => {
    latest = value;
  }, [value]);
  return createElement(
    "form",
    {},
    createElement(GearConsumablesEditor, {
      value,
      characterClass,
      onChange: setValue,
      onClassChange: setClass,
    }),
    createElement(
      "button",
      { type: "submit", disabled: Boolean(consumableSelectionError(value, characterClass)) },
      "저장",
    ),
  );
}
async function mount(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(createElement(Harness, props)));
}
function namedButton(label: string) {
  const button = document.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
  if (!button) throw new Error(`missing button ${label}`);
  return button;
}
function textButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  if (!button) throw new Error(`missing button ${label}`);
  return button;
}
async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}
async function inputText(value: string) {
  const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function enterSearch(isComposing = false) {
  const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    isComposing,
  });
  await act(async () => {
    input.dispatchEvent(event);
  });
  return event;
}
async function choose(kind: "음식" | "음료", slot: number, itemName: string) {
  await click(namedButton(`${kind} ${slot} 선택`));
  await inputText(itemName);
  await click(textButton(`${kind} 선택 적용`));
}
async function classChange(value: "CHEF" | "GENERAL") {
  const select = container.querySelector("select")!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function expectRecipe(item: ConsumableCatalogItem) {
  if (item.recipe.status === "UNVERIFIED") {
    expect(container.textContent).toContain("기본 재료 확인 중");
    return;
  }
  for (const ingredients of [
    item.recipe.ingredients,
    ...(item.recipe.variants?.map((variant) => variant.ingredients) ?? []),
  ]) {
    for (const ingredient of ingredients) {
      if (ingredient.options?.length) {
        for (const option of ingredient.options)
          expect(container.textContent).toContain(`${option.label} × ${option.quantity}`);
      } else {
        expect(container.textContent).toContain(
          `${ingredient.label}${ingredient.quantity === null ? "" : ` × ${ingredient.quantity}`}`,
        );
      }
    }
  }
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("food and drink selection", () => {
  it("searches newly added foods without spaces and applies the unique result with Enter", async () => {
    await mount({ initialClass: "셰프" });
    await click(namedButton("음식 1 선택"));
    await inputText("깜짝춘권");
    expect(document.querySelector('[aria-label="음식 검색 결과"]')?.textContent).toContain(
      "깜짝 춘권",
    );
    expect((await enterSearch()).defaultPrevented).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(latest.foodIds).toEqual(["consumable-30110385"]);
    await click(namedButton("음식 2 선택"));
    await inputText("은하천층");
    await enterSearch();
    expect(latest.foodIds).toEqual(["consumable-30110385", "consumable-30110389"]);
    await click(namedButton("음료 1 선택"));
    await inputText("스타더스트옥수수발효주");
    await enterSearch();
    expect(latest.drinkIds).toEqual(["consumable-30110355"]);
    expect(container.textContent).toContain("공중에 있을 때 원소 대미지 보너스 30%");
    expect(textButton("저장").disabled).toBe(false);
  });

  it("keeps ambiguous or empty searches open and never applies an arbitrary first item on Enter", async () => {
    await mount();
    await click(namedButton("음식 1 선택"));
    await inputText("원소");
    await enterSearch();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(latest.foodIds).toEqual([]);
    await inputText("없는도핑qwerty");
    await enterSearch();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(latest.foodIds).toEqual([]);
  });

  it("waits for Korean composition to finish and retains duplicate-selection protection", async () => {
    await mount({ initialClass: "셰프" });
    await choose("음식", 1, "깜짝춘권");
    await click(namedButton("음식 2 선택"));
    await inputText("갤럭시페스츄리");
    await enterSearch(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(latest.foodIds).toEqual(["consumable-30110385"]);
    await inputText("깜짝춘권");
    await enterSearch();
    expect(textButton("음식 선택 적용").disabled).toBe(true);
    expect(latest.foodIds).toEqual(["consumable-30110385"]);
  });

  it("searches and selects an independent food and drink with base figures and recipe", async () => {
    await mount();
    await choose("음식", 1, foods[0].name);
    await choose("음료", 1, drinks[0].name);
    expect(latest.foodIds).toEqual([foods[0].id]);
    expect(latest.drinkIds).toEqual([drinks[0].id]);
    expect(container.textContent).toContain(foods[0].effects[0].description);
    expectRecipe(foods[0]);
    expect(container.querySelector('[aria-label="음식 2 선택"]')).toBeNull();
    expect(container.querySelector('[aria-label="음료 2 선택"]')).toBeNull();
  });
  it("allows the Chef two different foods and two different drinks while blocking a duplicate", async () => {
    await mount();
    await classChange("CHEF");
    await choose("음식", 1, foods[0].name);
    await click(namedButton("음식 2 선택"));
    await inputText(foods[0].name);
    expect(textButton("음식 선택 적용").disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain(
      "두 번 선택할 수 없습니다",
    );
    await inputText(foods[1].name);
    await click(textButton("음식 선택 적용"));
    await choose("음료", 1, drinks[0].name);
    await choose("음료", 2, drinks[1].name);
    expect(latest.foodIds).toEqual([foods[0].id, foods[1].id]);
    expect(latest.drinkIds).toEqual([drinks[0].id, drinks[1].id]);
    expect(textButton("저장").disabled).toBe(false);
  });
  it("keeps a dense saved selection when the empty second Chef position is chosen first", async () => {
    await mount({ initialClass: "셰프" });
    await choose("음식", 2, foods[0].name);
    await choose("음료", 2, drinks[0].name);
    expect(JSON.parse(JSON.stringify(latest))).toEqual({
      foodIds: [foods[0].id],
      drinkIds: [drinks[0].id],
      notes: "",
    });
    expect(textButton("저장").disabled).toBe(false);
    await choose("음식", 2, foods[1].name);
    expect(latest.foodIds).toEqual([foods[0].id, foods[1].id]);
  });
  it("preserves all selections on class downgrade and requires explicit removal before saving", async () => {
    const initial = {
      foodIds: foods.slice(0, 2).map((item) => item.id),
      drinkIds: drinks.slice(0, 2).map((item) => item.id),
      notes: "사슴 고기 사용",
    };
    await mount({ initial, initialClass: "셰프" });
    await classChange("GENERAL");
    expect(latest).toEqual(initial);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("추가 도핑을 해제");
    expect(textButton("저장").disabled).toBe(true);
    await click(namedButton("음식 2 해제"));
    expect(textButton("저장").disabled).toBe(true);
    await click(namedButton("음료 2 해제"));
    expect(textButton("저장").disabled).toBe(false);
    expect(latest.notes).toBe("사슴 고기 사용");
  });
  it("supports effect and ingredient search and restores focus after closing", async () => {
    await mount();
    const opener = namedButton("음식 1 선택");
    opener.focus();
    await click(opener);
    const item = foods.find((candidate) => candidate.recipe.ingredients.length > 0)!;
    await inputText(item.recipe.ingredients[0].label);
    const result = document.querySelector('[aria-label="음식 검색 결과"]')!;
    expect(result.textContent).toContain(item.name);
    await inputText("없는음식qwerty");
    expect(result.textContent).toContain("검색 결과가 없습니다");
    await click(namedButton("도핑 선택 닫기"));
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("shows saved numeric effects, recipe, notes, and historical names", async () => {
    await act(async () =>
      root.render(
        createElement(GearConsumablesView, {
          value: { foodIds: [foods[0].id], drinkIds: [drinks[0].id], notes: "제작 강화 적용" },
          recordedNames: { [foods[0].id]: "저장 당시 요리 이름" },
        }),
      ),
    );
    expect(container.textContent).toContain("저장 당시 요리 이름");
    expect(container.textContent).toContain(foods[0].effects[0].description);
    expectRecipe(drinks[0]);
    expect(container.textContent).toContain("제작 강화 적용");
  });
  it("keeps long ingredient alternatives collapsed and expands their sourced quantities on demand", async () => {
    const item = foods.find((candidate) =>
      candidate.recipe.ingredients.some((ingredient) => (ingredient.options?.length ?? 0) > 10),
    )!;
    const ingredient = item.recipe.ingredients.find(
      (candidate) => (candidate.options?.length ?? 0) > 10,
    )!;
    await mount({ initial: { foodIds: [item.id], drinkIds: [], notes: "" } });
    const details = [...container.querySelectorAll("details")].find((node) =>
      node
        .querySelector("summary")
        ?.textContent?.includes(`외 ${ingredient.options!.length - 1}종`),
    )!;
    expect(details.open).toBe(false);
    await act(async () => details.querySelector("summary")!.click());
    expect(details.open).toBe(true);
    const last = ingredient.options![ingredient.options!.length - 1];
    expect(details.textContent).toContain(`${last.label} × ${last.quantity}`);
  });
});
