// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LoadoutPreparationResult, PreparedEquipment } from "@uniz/build-engine";
import { LoadoutPreparation } from "../src/components/build-loadouts/preparation";

vi.mock("../src/components/build-loadouts/controls", () => ({
  LoadoutCopyButton: () => createElement("button", {}, "준비 목록 복사"),
}));
const armor = (extra: Partial<PreparedEquipment> = {}): PreparedEquipment => ({
  key: "helmet-deer",
  itemId: "armor-a",
  name: "방어구 헬멧",
  kind: "ARMOR",
  slot: "helmet",
  tier: null,
  materialLabels: ["사슴 가죽"],
  tuningName: null,
  quantity: 1,
  uses: [
    { buildId: "a", version: 1, buildTitle: "보스", slot: "helmet" },
    { buildId: "b", version: 1, buildTitle: "파밍", slot: "helmet" },
  ],
  settingsDiffer: false,
  materialComplete: false,
  reuseConfirmed: false,
  ...extra,
});
function render(shared: PreparedEquipment, extra: Partial<LoadoutPreparationResult> = {}) {
  const value: LoadoutPreparationResult = {
    equipment: [],
    sharedArmor: [shared],
    materials: [],
    consumables: [],
    unresolved: [],
    counts: { listedEquipment: 2, uniqueEquipment: 2, armorSaved: 0, foodBatches: 0 },
    complete: false,
    ...extra,
  };
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    createElement(LoadoutPreparation, { value, text: "목록" }),
  );
  const section = Array.from(container.querySelectorAll("section")).find(
    (node) => node.querySelector("h2")?.textContent === "겹치는 방어구",
  )!;
  return { container, section };
}
describe("loadout armor overlap presentation", () => {
  it("shows same armor and leather with an unknown tier without claiming confirmed reuse", () => {
    const { container, section } = render(armor());
    expect(section.textContent).toContain("부위·방어구·가죽이 같은 구성");
    expect(section.textContent).toContain("방어구 헬멧");
    expect(section.textContent).toContain("보스 v1 · 파밍 v1");
    expect(section.textContent).toContain("제작 등급 미지정");
    expect(section.textContent).toContain("제작 조건이 다르거나 미기록 · 수량은 별도 확인");
    expect(container.querySelector("strong")?.textContent).toBe("0개");
    expect(container.textContent).toContain("확정 합계는 전체 필요 재료가 아닙니다");
  });
  it("distinguishes differing recorded tiers from a missing tier", () => {
    const { section } = render(armor({ tierDiffers: true }));
    expect(section.textContent).toContain("제작 티어 다름");
    expect(section.textContent).not.toContain("제작 등급 미지정");
    expect(section.textContent).toContain("수량은 별도 확인");
  });
  it("keeps module settings differences separate from fully confirmed crafting reuse", () => {
    const { container, section } = render(
      armor({ tier: 5, reuseConfirmed: true, settingsDiffer: true, materialComplete: true }),
      {
        counts: { listedEquipment: 2, uniqueEquipment: 1, armorSaved: 1, foodBatches: 0 },
        complete: true,
      },
    );
    expect(section.textContent).toContain("T5");
    expect(section.textContent).toContain("모듈·기록 설정이 다릅니다");
    expect(section.textContent).not.toContain("수량은 별도 확인");
    expect(container.querySelector("strong")?.textContent).toBe("1개");
  });
});
