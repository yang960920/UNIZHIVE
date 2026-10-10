// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEAR_CATALOG,
  createEmptyGearLoadout,
  createGearSelection,
  getCraftingMaterial,
  getEligibleWeaponTuningBlueprints,
  getGearCraftRecipe,
  type GearSelection,
} from "@uniz/build-engine";
import {
  GearCraftingEditor,
  GearCraftingView,
} from "../src/components/build-planner/gear-crafting";
import { makeGearChecklist } from "../src/components/build-planner/gear-checklist-text";

let container: HTMLDivElement, root: Root, latest: GearSelection;
const context = createEmptyGearLoadout().context;
function Harness({ initial }: { initial: GearSelection }) {
  const [selection, setSelection] = useState(initial);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    latest = selection;
  }, [selection]);
  return createElement(
    "form",
    {},
    createElement(GearCraftingEditor, {
      selection,
      context,
      onChange: setSelection,
      numberTexts: texts,
      numberErrors: errors,
      onNumberText: (key: string, text: string) =>
        setTexts((previous) => ({ ...previous, [`${selection.slot}.${key}`]: text })),
      onNumberError: (key: string, error: string) =>
        setErrors((previous) => ({ ...previous, [`${selection.slot}.${key}`]: error })),
    }),
    createElement(
      "button",
      { type: "submit", disabled: Object.values(errors).some(Boolean) },
      "검증 저장",
    ),
  );
}
async function mount(initial: GearSelection) {
  await act(async () => root.render(createElement(Harness, { initial })));
}
function control<T extends HTMLInputElement | HTMLSelectElement>(label: string): T {
  const node = [...container.querySelectorAll("label")]
    .find(
      (item) =>
        [...item.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join("")
          .trim() === label,
    )
    ?.querySelector("input,select");
  if (!node) throw new Error(`missing control ${label}`);
  return node as T;
}
async function change(node: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype =
      node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
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
describe("gear crafting recording", () => {
  it("keeps equipment level separate, shows the source leather, and records a searchable replacement", async () => {
    const armor = GEAR_CATALOG.find(
      (item) =>
        item.kind === "ARMOR" &&
        getGearCraftRecipe(item.id, null)?.ingredients.some((ingredient) =>
          ingredient.options.some(
            (option) => getCraftingMaterial(option.materialId)?.category === "LEATHER",
          ),
        ),
    )!;
    const initial = createGearSelection(armor.allowedSlots[0], armor.id);
    initial.level = 50;
    await mount(initial);
    const initialRecipe = getGearCraftRecipe(armor.id, null)!;
    const leather = initialRecipe.ingredients.find((ingredient) =>
      ingredient.options.some(
        (option) => getCraftingMaterial(option.materialId)?.category === "LEATHER",
      ),
    )!;
    expect(container.textContent).toContain(getCraftingMaterial(leather.defaultMaterialId)!.name);
    expect(latest.crafting).toBeUndefined();
    await change(control<HTMLSelectElement>("장비 티어"), "5");
    expect(latest.crafting?.tier).toBe(5);
    expect(latest.level).toBe(50);
    const recipe = getGearCraftRecipe(armor.id, 5)!;
    const ingredient = recipe.ingredients.find((entry) =>
      entry.options.some(
        (option) => getCraftingMaterial(option.materialId)?.category === "LEATHER",
      ),
    )!;
    const replacement = ingredient.options.find(
      (option) => option.materialId !== ingredient.defaultMaterialId,
    )!;
    const replacementName = getCraftingMaterial(replacement.materialId)!.name;
    const input = container.querySelector(
      'input[placeholder="이름·희귀도·효과 검색"]',
    ) as HTMLInputElement;
    await change(input, replacementName.replace(/\s/g, ""));
    const result = [...container.querySelectorAll("button[aria-pressed]")].find((node) =>
      node.textContent?.includes(replacementName),
    ) as HTMLButtonElement;
    await act(async () => result.click());
    expect(latest.crafting?.materialChoices[ingredient.key]).toBe(replacement.materialId);
    const loadout = createEmptyGearLoadout();
    loadout.slots = [latest];
    expect(makeGearChecklist(loadout)).toContain(replacementName);
    expect(makeGearChecklist(loadout)).toContain("장비 티어: T5");
    const reset = [...container.querySelectorAll("button")].find(
      (node) => node.textContent === "기본 재료로 복원",
    )!;
    await act(async () => reset.click());
    expect(latest.crafting?.materialChoices[ingredient.key]).toBe(ingredient.defaultMaterialId);
  });
  it("records actual tuning values, allows unknown values, and keeps invalid input visible", async () => {
    const weapon = GEAR_CATALOG.find(
      (item) =>
        item.kind === "WEAPON" && getEligibleWeaponTuningBlueprints(item.id, context).length,
    )!;
    await mount(createGearSelection("primary", weapon.id));
    await change(control<HTMLSelectElement>("장비 티어"), "5");
    const blueprint = getEligibleWeaponTuningBlueprints(weapon.id, context)[0];
    await change(control<HTMLSelectElement>("튜닝 설계도"), blueprint.id);
    expect(latest.crafting?.tuning?.attackPercent).toBeNull();
    const attack = control<HTMLInputElement>("공격력 (%)");
    await change(attack, "실제값아님");
    expect(attack.value).toBe("실제값아님");
    expect(container.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(true);
    expect(latest.crafting?.tuning?.attackPercent).toBeNull();
    const value = blueprint.attackRange.min;
    await change(attack, String(value));
    expect(latest.crafting?.tuning?.attackPercent).toBe(value);
    expect(container.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(false);
    const loadout = createEmptyGearLoadout();
    loadout.slots = [latest];
    expect(makeGearChecklist(loadout)).toContain(`튜닝 공격력: ${value}%`);
    await act(async () => root.render(createElement(GearCraftingView, { selection: latest })));
    expect(container.textContent).toContain(blueprint.name);
    expect(container.textContent).toContain(`튜닝 공격력: ${value}%`);
  });
});
