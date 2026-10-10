"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { CupSoda, Plus, Search, Trash2, Utensils, X } from "lucide-react";
import {
  createEmptyConsumableLoadout,
  getConsumableItem,
  getConsumableSlotLimits,
  type ConsumableCatalogItem,
  type ConsumableLoadout,
  type ConsumableRecipeIngredient,
} from "@uniz/build-engine";
import {
  consumableDuration,
  consumableCommonNotes,
  consumableKindLabels,
  consumableSelectionError,
  searchConsumables,
} from "./gear-consumables-model";
import styles from "./gear-consumables.module.css";
import { PlannerFieldBadge } from "./save-feedback";

function ConsumableIcon({ item }: { item?: ConsumableCatalogItem }) {
  return (
    <span className={styles.icon}>
      {item?.icon ? (
        <Image src={item.icon} alt="" width={96} height={96} unoptimized />
      ) : (
        <Utensils size={24} aria-hidden="true" />
      )}
    </span>
  );
}

function RecipeIngredients({
  ingredients,
}: {
  ingredients: readonly ConsumableRecipeIngredient[];
}) {
  return (
    <ul className={styles.ingredients}>
      {ingredients.map((ingredient, index) => (
        <li
          key={`${ingredient.label}-${index}`}
          className={ingredient.options?.length ? styles.choiceIngredient : styles.fixedIngredient}
        >
          {ingredient.options?.length ? (
            <details>
              <summary>
                {ingredient.label}: {ingredient.options[0].label} × {ingredient.options[0].quantity}
                {ingredient.options.length > 1 ? ` 외 ${ingredient.options.length - 1}종` : ""} 중
                택 1
              </summary>
              <ul className={styles.ingredientOptions}>
                {ingredient.options.map((option, optionIndex) => (
                  <li key={`${option.label}-${optionIndex}`}>
                    {option.label} × {option.quantity}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <>
              {ingredient.label}
              {ingredient.quantity === null ? "" : ` × ${ingredient.quantity}`}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function CommonConsumableNotes() {
  return (
    <div className={styles.note}>
      <p>
        표시 수치는 기본 효과이며 재료·요리 품질·셰프 제작 강화는 반영하지 않았습니다. 추가 효과는
        도핑 메모에 기록해 주세요.
      </p>
      <details>
        <summary>재료·획득 조건 안내</summary>
        {consumableCommonNotes.slice(1).map((note) => (
          <p key={note}>{note}</p>
        ))}
      </details>
    </div>
  );
}

function ConsumableFacts({
  item,
  compact = false,
}: {
  item: ConsumableCatalogItem;
  compact?: boolean;
}) {
  return (
    <div className={styles.facts}>
      <ul className={styles.effects}>
        {item.effects.map((effect, index) => (
          <li key={index}>
            {effect.description}
            {effect.durationSeconds !== null && (
              <small>{consumableDuration(effect.durationSeconds)}</small>
            )}
            {!effect.verified && <small>효과 확인 중</small>}
          </li>
        ))}
      </ul>
      {!compact && (
        <>
          <div className={styles.recipe}>
            <span>기본 재료</span>
            {item.recipe.basisLabel && <p className={styles.note}>{item.recipe.basisLabel}</p>}
            {item.recipe.status === "UNVERIFIED" ? (
              <p>기본 재료 확인 중</p>
            ) : (
              <>
                {item.recipe.ingredients.length > 0 && (
                  <RecipeIngredients ingredients={item.recipe.ingredients} />
                )}
                {item.recipe.variants?.length ? (
                  <details className={styles.variants}>
                    <summary>제작 재료 조합 {item.recipe.variants.length}종 보기</summary>
                    {item.recipe.variants.map((variant) => (
                      <div key={variant.label}>
                        <strong>{variant.label}</strong>
                        <RecipeIngredients ingredients={variant.ingredients} />
                      </div>
                    ))}
                  </details>
                ) : (
                  !item.recipe.ingredients.length && <p>기본 재료 확인 중</p>
                )}
              </>
            )}
          </div>
          {item.notes
            ?.filter((note) => !consumableCommonNotes.includes(note))
            .map((note) => (
              <p className={styles.note} key={note}>
                {note}
              </p>
            ))}
          <p className={styles.note}>기본 효과 · {item.source.verifiedAt} 확인</p>
        </>
      )}
    </div>
  );
}

function ConsumablePicker({
  kind,
  selectedId,
  selectedIds,
  onChoose,
  onClose,
  returnFocus,
}: {
  kind: "FOOD" | "DRINK";
  selectedId?: string;
  selectedIds: readonly string[];
  onChoose: (id: string) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(selectedId ?? null);
  const input = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => searchConsumables(kind, query), [kind, query]);
  const active = filtered.find((item) => item.id === activeId) ?? filtered[0];
  const duplicate = active && selectedIds.includes(active.id) && active.id !== selectedId;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={`dialog-overlay ${styles.overlay}`} />
        <Dialog.Content
          className={`dialog-content ${styles.picker}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <header className={styles.pickerHeading}>
            <Dialog.Title>{consumableKindLabels[kind]} 선택</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="도핑 선택 닫기">
              <X size={20} />
            </Dialog.Close>
          </header>
          <Dialog.Description className={styles.note}>
            이름·별칭·효과·재료로 검색하고 기본 효과를 확인해 선택하세요. 검색 결과가 1개일 때는
            Enter로 바로 선택할 수 있습니다.
          </Dialog.Description>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">음식·음료 이름·효과·재료 검색</span>
            <input
              ref={input}
              value={query}
              maxLength={120}
              placeholder={
                kind === "FOOD"
                  ? "예: 깜짝춘권, 갤럭시페스츄리, 원소 대미지"
                  : "예: 아이디어드링크, 옥수수발효주, 오염 내성"
              }
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (filtered.length === 1 && active && !duplicate) onChoose(active.id);
              }}
            />
          </label>
          <p className={styles.note} role="status">
            {filtered.length}개 {consumableKindLabels[kind]}
          </p>
          <div className={styles.pickerColumns}>
            <div className={styles.results} aria-label={`${consumableKindLabels[kind]} 검색 결과`}>
              {filtered.map((item) => {
                const used = selectedIds.includes(item.id) && item.id !== selectedId;
                return (
                  <button
                    type="button"
                    className={`${styles.result} ${active?.id === item.id ? styles.active : ""}`}
                    aria-pressed={active?.id === item.id}
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                  >
                    <ConsumableIcon item={item} />
                    <span>
                      <strong>{item.name}</strong>
                      <ConsumableFacts item={item} compact />
                      {used && <small>다른 슬롯에서 선택 중</small>}
                    </span>
                  </button>
                );
              })}
              {!filtered.length && <p className={styles.empty}>검색 결과가 없습니다.</p>}
            </div>
            <aside className={styles.detail} aria-label="선택할 도핑 상세">
              {active ? (
                <>
                  <ConsumableIcon item={active} />
                  <h3>{active.name}</h3>
                  <ConsumableFacts item={active} />
                  {active.aliases.length > 0 && (
                    <p className={styles.note}>다른 이름: {active.aliases.join(" · ")}</p>
                  )}
                  {duplicate && (
                    <p className={styles.warning}>
                      같은 {consumableKindLabels[kind]}은 두 번 선택할 수 없습니다.
                    </p>
                  )}
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={Boolean(duplicate)}
                    onClick={() => {
                      if (!duplicate) onChoose(active.id);
                    }}
                  >
                    {consumableKindLabels[kind]} 선택 적용
                  </button>
                </>
              ) : (
                <p className={styles.empty}>검색어를 변경해 주세요.</p>
              )}
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function GearConsumablesEditor({
  value,
  characterClass,
  onChange,
  onClassChange,
  disabled = false,
}: {
  value?: ConsumableLoadout;
  characterClass: string | null;
  onChange: (value: ConsumableLoadout) => void;
  onClassChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const loadout = value ?? createEmptyConsumableLoadout();
  const limits = getConsumableSlotLimits(characterClass);
  const [picker, setPicker] = useState<{ kind: "FOOD" | "DRINK"; index: number } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const error = consumableSelectionError(loadout, characterClass);
  function open(kind: "FOOD" | "DRINK", index: number) {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPicker({ kind, index });
  }
  function choose(id: string) {
    if (!picker) return;
    const key = picker.kind === "FOOD" ? "foodIds" : "drinkIds";
    const ids = [...loadout[key]];
    if (
      getConsumableItem(id)?.kind !== picker.kind ||
      ids.some((chosen, index) => chosen === id && index !== picker.index)
    )
      return;
    ids[picker.index] = id;
    onChange({ ...loadout, [key]: ids.filter((chosen) => typeof chosen === "string") });
    setPicker(null);
  }
  return (
    <section className={`gear-panel ${styles.editor}`} aria-label="도핑 구성">
      <header className={styles.heading}>
        <div>
          <h3>
            <Utensils size={17} aria-hidden="true" />
            도핑 구성
            <PlannerFieldBadge />
          </h3>
          <p>음식과 음료는 각각 선택합니다. 셰프는 종류별로 서로 다른 2개를 기록할 수 있습니다.</p>
        </div>
        <label>
          도핑 슬롯 기준
          <select
            value={limits.isChef ? "CHEF" : "GENERAL"}
            onChange={(event) =>
              onClassChange(
                event.target.value === "CHEF" ? "셰프" : limits.isChef ? null : characterClass,
              )
            }
          >
            <option value="GENERAL">일반 · 음식 1 + 음료 1</option>
            <option value="CHEF">셰프 · 음식 2 + 음료 2</option>
          </select>
        </label>
      </header>
      {error && (
        <p className={styles.warning} role="alert">
          {error} 선택한 도핑은 유지됩니다.
        </p>
      )}
      <div className={styles.groups}>
        {(["FOOD", "DRINK"] as const).map((kind) => {
          const key = kind === "FOOD" ? "foodIds" : "drinkIds";
          const ids = loadout[key];
          const limit = kind === "FOOD" ? limits.food : limits.drink;
          return (
            <div className={styles.group} key={kind}>
              <h4>
                {kind === "FOOD" ? <Utensils size={15} /> : <CupSoda size={15} />}
                {consumableKindLabels[kind]}{" "}
                <span>
                  {ids.length} / {limit}
                </span>
              </h4>
              {Array.from({ length: Math.max(limit, ids.length) }, (_, index) => {
                const item = getConsumableItem(ids[index]);
                return (
                  <article
                    className={`${styles.slot} ${index >= limit ? styles.excess : ""}`}
                    key={index}
                  >
                    <div className={styles.slotHeading}>
                      <ConsumableIcon item={item} />
                      <div>
                        <small>
                          {consumableKindLabels[kind]} {index + 1}
                          {index >= limit ? " · 한도 초과" : ""}
                        </small>
                        <h5>{item?.name ?? (ids[index] ? "이전 도핑 기록" : "선택 안 함")}</h5>
                      </div>
                    </div>
                    {item && <ConsumableFacts item={item} />}
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className="button"
                        onClick={() => open(kind, index)}
                        aria-label={`${consumableKindLabels[kind]} ${index + 1} ${ids[index] ? "변경" : "선택"}`}
                      >
                        <Plus size={14} />
                        {ids[index] ? "변경" : `${consumableKindLabels[kind]} 선택`}
                      </button>
                      {ids[index] && (
                        <button
                          type="button"
                          className="button"
                          aria-label={`${consumableKindLabels[kind]} ${index + 1} 해제`}
                          onClick={() =>
                            onChange({ ...loadout, [key]: ids.filter((_, at) => at !== index) })
                          }
                        >
                          <Trash2 size={14} />
                          해제
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
      <CommonConsumableNotes />
      <label>
        도핑 메모 · 선택
        <textarea
          maxLength={2000}
          rows={2}
          value={loadout.notes}
          onChange={(event) => onChange({ ...loadout, notes: event.target.value })}
          placeholder="예: 사슴 고기 사용, 셰프 제작 강화 적용"
        />
      </label>
      {picker && !disabled && (
        <ConsumablePicker
          key={`${picker.kind}-${picker.index}`}
          kind={picker.kind}
          selectedId={loadout[picker.kind === "FOOD" ? "foodIds" : "drinkIds"][picker.index]}
          selectedIds={loadout[picker.kind === "FOOD" ? "foodIds" : "drinkIds"]}
          onChoose={choose}
          onClose={() => setPicker(null)}
          returnFocus={returnFocus}
        />
      )}
    </section>
  );
}

export function GearConsumablesView({
  value,
  recordedNames = {},
}: {
  value?: ConsumableLoadout;
  recordedNames?: Record<string, string>;
}) {
  if (!value || (!value.foodIds.length && !value.drinkIds.length && !value.notes)) return null;
  return (
    <section className={styles.saved} aria-label="저장된 도핑 구성">
      <h3>도핑 구성</h3>
      <div className={styles.groups}>
        {(["FOOD", "DRINK"] as const).map((kind) => (
          <div className={styles.group} key={kind}>
            <h4>{consumableKindLabels[kind]}</h4>
            {value[kind === "FOOD" ? "foodIds" : "drinkIds"].map((id, index) => {
              const item = getConsumableItem(id);
              return (
                <article className={styles.slot} key={`${id}-${index}`}>
                  <div className={styles.slotHeading}>
                    <ConsumableIcon item={item} />
                    <div>
                      <small>
                        {consumableKindLabels[kind]} {index + 1}
                      </small>
                      <h5>{recordedNames[id] ?? item?.name ?? "이전 도핑 기록"}</h5>
                    </div>
                  </div>
                  {item && <ConsumableFacts item={item} />}
                </article>
              );
            })}
          </div>
        ))}
      </div>
      <CommonConsumableNotes />
      {value.notes && <p className={styles.note}>도핑 메모: {value.notes}</p>}
    </section>
  );
}
