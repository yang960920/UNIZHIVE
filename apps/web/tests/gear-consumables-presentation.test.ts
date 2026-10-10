import { describe, expect, it } from "vitest";
import {
  CONSUMABLE_CATALOG,
  createEmptyGearLoadout,
  type ConsumableCatalogItem,
} from "@uniz/build-engine";
import { makeGearChecklist } from "../src/components/build-planner/gear-checklist-text";
import {
  consumableRecipeText,
  searchConsumables,
} from "../src/components/build-planner/gear-consumables-model";

describe("consumable information in saved builds", () => {
  it.each([
    ["FOOD", "깜짝춘권", "30110385"],
    ["FOOD", "깜짝 춘권", "30110385"],
    ["FOOD", "갤럭시페스츄리", "30110389"],
    ["FOOD", "갤럭시 패스츄리", "30110389"],
    ["FOOD", "은하천층", "30110389"],
    ["FOOD", "Ｌａｙｅｒｅｄ　Ｇａｌａｘｙ", "30110389"],
    ["FOOD", "팡팡팝콘", "30110375"],
    ["DRINK", "스타더스트옥수수발효주", "30110355"],
  ] as const)("finds %s item %s by its name or reviewed alias", (kind, query, sourceId) => {
    const matches = searchConsumables(kind, query);
    expect(matches.map((item) => item.sourceId)).toContain(sourceId);
    expect(matches.every((item) => item.kind === kind)).toBe(true);
  });

  it("matches compact effect and ingredient terms without mixing food and drink slots", () => {
    expect(searchConsumables("FOOD", "원소대미지 공중").map((item) => item.sourceId)).toContain(
      "30110389",
    );
    expect(searchConsumables("FOOD", "변이밀 양배추").map((item) => item.sourceId)).toContain(
      "30110385",
    );
    expect(searchConsumables("DRINK", "깜짝춘권")).toEqual([]);
    expect(searchConsumables("FOOD", "깜짝춘권 없는재료qwerty")).toEqual([]);
  });

  it("copies four independent Chef selections with basic effect figures, recipes, and preparation notes", () => {
    const foods = CONSUMABLE_CATALOG.filter((item) => item.kind === "FOOD").slice(0, 2);
    const drinks = CONSUMABLE_CATALOG.filter((item) => item.kind === "DRINK").slice(0, 2);
    const loadout = createEmptyGearLoadout();
    loadout.context.characterClass = "셰프";
    loadout.consumables = {
      foodIds: foods.map((item) => item.id),
      drinkIds: drinks.map((item) => item.id),
      notes: "셰프 제작 강화 적용",
    };
    loadout.catalogNames = { [foods[0].id]: "저장 당시 음식 이름" };
    const copied = makeGearChecklist(loadout);
    expect(copied).toContain("음식 1: 저장 당시 음식 이름");
    expect(copied).toContain(`음식 2: ${foods[1].name}`);
    expect(copied).toContain(`음료 1: ${drinks[0].name}`);
    expect(copied).toContain(`음료 2: ${drinks[1].name}`);
    expect(copied).toContain(foods[0].effects[0].description);
    expect(copied).toContain(consumableRecipeText(drinks[0]));
    expect(copied).toContain("도핑 메모: 셰프 제작 강화 적용");
    expect(copied).not.toContain("DPS");
  });
  it("preserves each alternative ingredient's quantity and identifies recipe combinations without exposing source keys", () => {
    const item: ConsumableCatalogItem = {
      ...CONSUMABLE_CATALOG[0],
      recipe: {
        status: "VERIFIED_LOCAL_STATIC",
        ingredients: [],
        variants: [
          {
            label: "제작 재료 조합 A",
            sourceKey: "internal-world-id",
            ingredients: [
              {
                label: "고기류",
                quantity: null,
                options: [
                  { label: "사슴 고기", quantity: 2 },
                  { label: "토끼 고기", quantity: 3 },
                ],
              },
              { label: "소금", quantity: 1 },
            ],
          },
          {
            label: "제작 재료 조합 B",
            sourceKey: "another-internal-key",
            ingredients: [{ label: "고기", quantity: 5 }],
          },
        ],
      },
    };
    const recipe = consumableRecipeText(item);
    expect(recipe).toContain("사슴 고기 × 2 / 토끼 고기 × 3 중 택 1");
    expect(recipe).toContain("소금 × 1");
    expect(recipe).toContain("제작 재료 조합 B: 고기 × 5");
    expect(recipe).not.toContain("internal");
  });
  it("keeps legacy snapshots without the new field readable and returns only the requested consumable category", () => {
    const old = createEmptyGearLoadout();
    delete old.consumables;
    expect(makeGearChecklist(old)).not.toContain("도핑 메모");
    const drinks = searchConsumables("DRINK", "");
    expect(drinks.length).toBeGreaterThan(0);
    expect(drinks.every((item) => item.kind === "DRINK")).toBe(true);
    const food = CONSUMABLE_CATALOG.find((item) => item.kind === "FOOD")!;
    expect(searchConsumables("FOOD", food.name)).toContain(food);
    expect(searchConsumables("DRINK", food.name)).not.toContain(food);
  });
});
