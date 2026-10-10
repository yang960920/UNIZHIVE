"use client";

import {
  GEAR_CATALOG,
  getCraftingMaterial,
  getEffectiveIngredientSelections,
  getEligibleWeaponTuningBlueprints,
  getGearCraftRecipe,
  getGearCraftRecipes,
  getRecipeMaterials,
  getWeaponCraftingAtTier5,
  WEAPON_TUNING_BLUEPRINTS,
  type CraftingRecipe,
  type GearSelection,
  type PlannerContext,
} from "@uniz/build-engine";
import { CraftingMaterialPicker, craftingRarityLabels } from "./crafting-material-picker";
import styles from "./gear-crafting.module.css";
import { gearCraftingLines, tuningOptionLabels } from "./gear-crafting-model";
import { TuningPicker } from "./tuning-picker";

export function RecipeMaterialSelectors({
  recipe,
  selections,
  onChange,
  showQuantities = true,
  showFixed = true,
  disabled = false,
}: {
  recipe: CraftingRecipe;
  selections: Record<string, string>;
  onChange: (key: string, materialId: string | null) => void;
  showQuantities?: boolean;
  showFixed?: boolean;
  disabled?: boolean;
}) {
  const effective = getEffectiveIngredientSelections(recipe, selections);
  return (
    <>
      {recipe.ingredients.map((ingredient, index) => {
        if (ingredient.kind === "FIXED") {
          if (!showFixed) return null;
          const material = getCraftingMaterial(ingredient.defaultMaterialId);
          return (
            <p key={ingredient.key} className={styles.note}>
              {material?.name ?? ingredient.label}
              {showQuantities ? ` × ${ingredient.quantity}` : ""}
            </p>
          );
        }
        return (
          <CraftingMaterialPicker
            key={ingredient.key}
            label={
              ingredient.key === "group-103"
                ? "고기·생선 재료"
                : ingredient.key === "group-180"
                  ? "고기 재료"
                  : ingredient.key === "group-165"
                    ? "우유·꿀 재료"
                    : ingredient.label === "선택 재료"
                      ? `선택 재료 ${index + 1}`
                      : ingredient.label
            }
            selectedId={effective[ingredient.key] ?? null}
            defaultId={ingredient.defaultMaterialId}
            disabled={disabled}
            allowClear={!ingredient.defaultMaterialId}
            options={ingredient.options.map((option) => {
              const material = getCraftingMaterial(option.materialId);
              return {
                id: option.materialId,
                label: material?.name ?? option.materialId,
                quantity: showQuantities ? option.quantity : null,
                rarity: material?.rarity,
                description: option.effects.join(" / "),
              };
            })}
            onChange={(id) => onChange(ingredient.key, id)}
          />
        );
      })}
    </>
  );
}

export function GearCraftingEditor({
  selection,
  context,
  onChange,
  onNumberError,
  numberTexts,
  numberErrors,
  onNumberText,
}: {
  selection: GearSelection;
  context: PlannerContext;
  onChange: (selection: GearSelection) => void;
  onNumberError: (key: string, error: string) => void;
  numberTexts: Record<string, string>;
  numberErrors: Record<string, string>;
  onNumberText: (key: string, text: string) => void;
}) {
  const isWeapon = GEAR_CATALOG.find((item) => item.id === selection.itemId)?.kind === "WEAPON";
  const crafting = (isWeapon ? getWeaponCraftingAtTier5(selection) : selection.crafting) ?? {
    tier: null,
    recipeKey: null,
    materialChoices: {},
    tuning: null,
  };
  const recipe = getGearCraftRecipe(selection.itemId, crafting.tier, crafting.recipeKey);
  const recipes = getGearCraftRecipes(selection.itemId, crafting.tier ?? recipe?.tier);
  const blueprints = getEligibleWeaponTuningBlueprints(selection.itemId, context);
  const tuning = crafting.tuning;
  const blueprint = tuning
    ? WEAPON_TUNING_BLUEPRINTS.find((item) => item.id === tuning.blueprintId)
    : undefined;
  const update = (changes: Partial<typeof crafting>) =>
    onChange({ ...selection, crafting: { ...crafting, ...changes } });
  const clearNumberState = () => {
    onNumberText("tuningAttack", "");
    onNumberText("tuningSecondary", "");
    onNumberError("tuningAttack", "");
    onNumberError("tuningSecondary", "");
  };
  function numberInput(
    key: "tuningAttack" | "tuningSecondary",
    label: string,
    value: number | null,
    range: { min: number; max: number },
    apply: (value: number | null) => void,
  ) {
    const inputKey = `${selection.slot}.${key}`;
    return (
      <label>
        {label} (%)
        <input
          type="text"
          inputMode="decimal"
          maxLength={12}
          placeholder="실제 수치 · 모르면 비워두기"
          value={numberTexts[inputKey] ?? (value === null ? "" : String(value))}
          aria-invalid={Boolean(numberErrors[inputKey])}
          onChange={(event) => {
            const text = event.target.value;
            onNumberText(key, text);
            const parsed = text.trim() === "" ? null : Number(text);
            const error =
              parsed !== null &&
              (!/^\d+(?:\.\d+)?$/.test(text.trim()) ||
                !Number.isFinite(parsed) ||
                parsed < range.min ||
                parsed > range.max)
                ? `${range.min}~${range.max}%의 실제 수치를 입력하거나 비워 주세요.`
                : "";
            onNumberError(key, error);
            if (!error) apply(parsed);
          }}
        />
        {numberErrors[inputKey] && (
          <small className={styles.error} role="status">
            {numberErrors[inputKey]}
          </small>
        )}
      </label>
    );
  }
  if (!isWeapon && !recipe && !blueprints.length && !tuning) return null;
  const materials = new Map<string, { name: string; quantity: number | null }>();
  if (isWeapon) {
    for (const material of recipe ? getRecipeMaterials(recipe, crafting.materialChoices) : []) {
      const catalogMaterial = getCraftingMaterial(material.materialId);
      const key = catalogMaterial?.sourceId ?? material.materialId ?? material.key;
      const name = material.materialId
        ? (catalogMaterial?.name ?? "확인되지 않은 재료")
        : `${recipe?.ingredients.find((ingredient) => ingredient.key === material.key)?.label ?? "재료"} 선택 필요`;
      const previous = materials.get(key);
      materials.set(key, {
        name,
        quantity: material.quantity === null ? null : (previous?.quantity ?? 0) + material.quantity,
      });
    }
    if (tuning) {
      materials.set(`tuning:${tuning.blueprintId}`, {
        name: blueprint
          ? `${blueprint.name} · ${craftingRarityLabels[blueprint.rarity]}`
          : "이전 튜닝 기록",
        quantity: 1,
      });
    }
  }
  return (
    <section className={styles.editor} aria-label="장비 제작 기록">
      <h4>제작 재료와 튜닝</h4>
      {!isWeapon && (
        <div className={styles.fields}>
          <label>
            장비 티어
            <select
              value={crafting.tier ?? ""}
              onChange={(event) => {
                const tier = event.target.value
                  ? (Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
                  : null;
                const nextRecipe = getGearCraftRecipe(selection.itemId, tier);
                update({
                  tier,
                  recipeKey: nextRecipe?.key ?? null,
                  materialChoices: nextRecipe
                    ? getEffectiveIngredientSelections(nextRecipe, crafting.materialChoices)
                    : {},
                });
              }}
            >
              <option value="">대표 재료 보기 · 티어 미기록</option>
              {[1, 2, 3, 4, 5].map((tier) => (
                <option key={tier} value={tier}>
                  T{tier}
                </option>
              ))}
            </select>
          </label>
          {recipes.length > 1 && (
            <label>
              제작 조합
              <select
                value={recipe?.key ?? ""}
                onChange={(event) => {
                  const next = recipes.find((item) => item.key === event.target.value);
                  update({
                    recipeKey: event.target.value,
                    materialChoices: next ? getEffectiveIngredientSelections(next, {}) : {},
                  });
                }}
              >
                {recipes.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {isWeapon && (
        <div className={styles.weaponMaterials}>
          <h4>T5 제작 재료</h4>
          {!recipe && <p className={styles.note}>T5 제작 재료를 아직 확인하지 못했습니다.</p>}
          {materials.size > 0 && (
            <ul className={styles.materialList}>
              {[...materials.entries()].map(([key, material]) => (
                <li key={key}>
                  <span>{material.name}</span>
                  {material.quantity !== null && <strong>× {material.quantity}</strong>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {recipe && (
        <>
          {!isWeapon && (
            <p className={styles.note}>
              {recipe.basisLabel}
              {crafting.tier === null ? " · 티어를 기록하면 재료 수량을 확인할 수 있습니다." : ""}
            </p>
          )}
          <RecipeMaterialSelectors
            recipe={recipe}
            selections={crafting.materialChoices}
            showQuantities={crafting.tier !== null}
            showFixed={!isWeapon}
            onChange={(key, materialId) => {
              const materialChoices = {
                ...getEffectiveIngredientSelections(recipe, crafting.materialChoices),
              };
              if (materialId) materialChoices[key] = materialId;
              else delete materialChoices[key];
              update({ recipeKey: recipe.key, materialChoices });
            }}
          />
        </>
      )}
      {(blueprints.length > 0 || tuning) && (
        <div className={styles.material}>
          <h4>무기 튜닝 · 선택</h4>
          <TuningPicker
            key={selection.itemId}
            blueprints={blueprints}
            selectedId={tuning?.blueprintId ?? null}
            onChange={(id) => {
              if (id === tuning?.blueprintId) return;
              const next = blueprints.find((item) => item.id === id);
              clearNumberState();
              update({
                tuning: next
                  ? {
                      blueprintId: next.id,
                      attackPercent: null,
                      secondary: next.secondaryOptions[0]
                        ? { kind: next.secondaryOptions[0].kind, value: null }
                        : null,
                    }
                  : null,
              });
            }}
          />
          {blueprint && (
            <div className={styles.tuningSelection}>
              <p className={`${styles.selected} ${styles[blueprint.rarity.toLowerCase()]}`}>
                {blueprint.name} · {craftingRarityLabels[blueprint.rarity]}
              </p>
              <p className={styles.note}>{blueprint.description}</p>
            </div>
          )}
          <div className={styles.fields}>
            {blueprint &&
              tuning &&
              numberInput(
                "tuningAttack",
                "공격력",
                tuning.attackPercent,
                blueprint.attackRange,
                (value) => update({ tuning: { ...tuning, attackPercent: value } }),
              )}
            {blueprint && tuning && blueprint.secondaryOptions.length > 0 && (
              <label>
                추가 옵션
                <select
                  value={tuning.secondary?.kind ?? ""}
                  onChange={(event) => {
                    onNumberText("tuningSecondary", "");
                    onNumberError("tuningSecondary", "");
                    update({
                      tuning: {
                        ...tuning,
                        secondary: event.target.value
                          ? {
                              kind: event.target.value as keyof typeof tuningOptionLabels,
                              value: null,
                            }
                          : null,
                      },
                    });
                  }}
                >
                  <option value="">기록 안 함</option>
                  {blueprint.secondaryOptions.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {tuningOptionLabels[option.kind]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {blueprint &&
              tuning?.secondary &&
              (() => {
                const option = blueprint.secondaryOptions.find(
                  (entry) => entry.kind === tuning.secondary!.kind,
                );
                return option
                  ? numberInput(
                      "tuningSecondary",
                      tuningOptionLabels[option.kind],
                      tuning.secondary.value,
                      option,
                      (value) =>
                        update({ tuning: { ...tuning, secondary: { kind: option.kind, value } } }),
                    )
                  : null;
              })()}
          </div>
          {blueprint && (
            <p className={styles.note}>
              게임에 표시된 실제 튜닝 수치를 기록합니다. 모르는 수치는 비워두어도 됩니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function GearCraftingView({ selection }: { selection: GearSelection }) {
  const lines = gearCraftingLines(selection);
  return lines.length ? (
    <div className={styles.saved} aria-label="저장된 제작 기록">
      {lines.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  ) : null;
}
