"use client";

import {
  getConsumableCraftRecipes,
  getConsumablePreparation,
  type ConsumableLoadout,
} from "@uniz/build-engine";
import { RecipeMaterialSelectors } from "./gear-crafting";
import { consumablePreparationLines } from "./consumable-preparation-model";
import styles from "./gear-crafting.module.css";

type Preparation = NonNullable<ConsumableLoadout["preparations"]>[string];

export function ConsumablePreparationEditor({
  consumableId,
  value,
  onChange,
  disabled = false,
}: {
  consumableId: string;
  value?: Preparation;
  onChange: (value: Preparation) => void;
  disabled?: boolean;
}) {
  const recipes = getConsumableCraftRecipes(consumableId);
  const recorded = getConsumablePreparation(consumableId, value);
  const preparation = recorded ?? getConsumablePreparation(consumableId);
  if (!preparation) return null;
  const { recipe, ingredientSelections } = preparation;
  return (
    <section className={styles.editor} aria-label="도핑 제작 재료 선택">
      <h4>사용할 제작 재료</h4>
      {value && !recorded && (
        <>
          <p className={styles.error} role="status">
            이전 제작 조합을 현재 목록에서 확인할 수 없습니다. 기록을 확인하고 제작 조합을 다시
            선택해 주세요.
          </p>
          <button
            className={styles.reset}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ recipeKey: recipe.key, ingredientSelections: {} })}
          >
            기본 제작 조합으로 다시 기록
          </button>
        </>
      )}
      {recipes.length > 1 && (
        <label className={styles.note}>
          도핑 제작 조합
          <select
            value={recipe.key}
            disabled={disabled}
            onChange={(event) =>
              onChange({ recipeKey: event.target.value, ingredientSelections: {} })
            }
          >
            {recipes.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className={styles.note}>{recipe.basisLabel}</p>
      <RecipeMaterialSelectors
        recipe={recipe}
        selections={ingredientSelections}
        disabled={disabled}
        onChange={(key, id) => {
          const next = { ...ingredientSelections };
          if (id) next[key] = id;
          else delete next[key];
          onChange({ recipeKey: recipe.key, ingredientSelections: next });
        }}
      />
      <p className={styles.note}>
        선택 재료는 실제 사용할 종류를 기록해 주세요. 재료 추가 효과는 요리의 기본 효과와 별도로
        표시합니다.
      </p>
    </section>
  );
}

export function ConsumablePreparationView({
  consumableId,
  value,
}: {
  consumableId: string;
  value?: Preparation;
}) {
  if (!value) return null;
  const lines = consumablePreparationLines(consumableId, value);
  return lines.length ? (
    <div className={styles.saved} aria-label="저장된 도핑 제작 재료">
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  ) : null;
}
