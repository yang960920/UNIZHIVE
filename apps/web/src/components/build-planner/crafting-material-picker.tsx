"use client";

import { useId, useState } from "react";
import { craftingRarityLabels } from "./gear-crafting-model";
import styles from "./gear-crafting.module.css";
export { craftingRarityLabels } from "./gear-crafting-model";

export interface CraftingTextOption {
  id: string;
  label: string;
  quantity?: number | null;
  rarity?: "NORMAL" | "RARE" | "EPIC" | "LEGENDARY" | null;
  description?: string | null;
}

function matches(option: CraftingTextOption, query: string) {
  const normalize = (text: string) =>
    text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
  const text = normalize(
    [option.label, option.rarity ? craftingRarityLabels[option.rarity] : "", option.description]
      .filter(Boolean)
      .join(" "),
  );
  return query
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(normalize(word)));
}

export function CraftingMaterialPicker({
  label,
  options,
  selectedId,
  defaultId,
  onChange,
  allowClear = false,
  disabled = false,
  emptyLabel = "재료 선택",
}: {
  label: string;
  options: readonly CraftingTextOption[];
  selectedId: string | null;
  defaultId?: string | null;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const selected = options.find((option) => option.id === selectedId);
  const filtered = options.filter((option) => matches(option, query));
  return (
    <div className={styles.material}>
      <p className={styles.materialLabel}>{label}</p>
      <p
        className={`${styles.selected} ${selected?.rarity ? styles[selected.rarity.toLowerCase()] : ""}`}
        role="status"
      >
        {selected
          ? `${selected.label}${selected.quantity ? ` × ${selected.quantity}` : ""}${selected.rarity ? ` · ${craftingRarityLabels[selected.rarity]}` : ""}`
          : selectedId
            ? "이전 재료 기록"
            : emptyLabel}
      </p>
      {selected?.description && <p className={styles.note}>{selected.description}</p>}
      <details className={styles.options}>
        <summary>{label} 변경</summary>
        <label htmlFor={searchId}>
          {label} 검색
          <input
            id={searchId}
            value={query}
            maxLength={120}
            disabled={disabled}
            placeholder="이름·희귀도·효과 검색"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (filtered.length === 1) onChange(filtered[0].id);
            }}
          />
        </label>
        <div className={styles.results} role="group" aria-label={`${label} 검색 결과`}>
          {filtered.map((option) => (
            <button
              type="button"
              key={option.id}
              disabled={disabled}
              className={option.rarity ? styles[option.rarity.toLowerCase()] : undefined}
              aria-pressed={option.id === selectedId}
              onClick={() => onChange(option.id)}
            >
              <span>
                {option.label}
                {option.quantity ? ` × ${option.quantity}` : ""}
              </span>
              {option.rarity && <small>{craftingRarityLabels[option.rarity]}</small>}
              {option.description && <small>{option.description}</small>}
            </button>
          ))}
          {!filtered.length && <p className={styles.note}>검색 결과가 없습니다.</p>}
        </div>
      </details>
      {defaultId && selectedId !== defaultId && (
        <button
          type="button"
          className={styles.reset}
          disabled={disabled}
          onClick={() => onChange(defaultId)}
        >
          기본 재료로 복원
        </button>
      )}
      {allowClear && selectedId && (
        <button
          type="button"
          className={styles.reset}
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          선택 해제
        </button>
      )}
    </div>
  );
}
