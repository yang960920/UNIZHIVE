"use client";

import { useId, useState } from "react";
import type { WeaponTuningBlueprint } from "@uniz/build-engine";
import { craftingRarityLabels } from "./crafting-material-picker";
import { groupTuningBlueprints, searchTuningBlueprints } from "./tuning-picker-model";
import styles from "./gear-crafting.module.css";

export function TuningPicker({
  blueprints,
  selectedId,
  onChange,
}: {
  blueprints: readonly Readonly<WeaponTuningBlueprint>[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const id = useId();
  const filtered = searchTuningBlueprints(blueprints, query);
  const groups = groupTuningBlueprints(filtered);
  const options = groups.flatMap((group) => group.options);
  const active = options.find((option) => option.id === activeId);
  const optionId = (blueprintId: string) => `${id}-${blueprintId}`;

  return (
    <div className={styles.tuningPicker}>
      <label className={styles.tuningSearch} htmlFor={`${id}-search`}>
        튜닝 설계도 검색
        <input
          id={`${id}-search`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={`${id}-results`}
          aria-activedescendant={active ? optionId(active.id) : undefined}
          aria-describedby={`${id}-hint`}
          value={query}
          maxLength={120}
          placeholder="이름·등급·효과 검색 · 예: 속사 노랑"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveId(null);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!options.length) return;
              const index = options.findIndex((option) => option.id === activeId);
              const next =
                index === -1
                  ? event.key === "ArrowDown"
                    ? 0
                    : options.length - 1
                  : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
                    options.length;
              setActiveId(options[next].id);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const chosen = active ?? (options.length === 1 ? options[0] : null);
              if (chosen) onChange(chosen.id);
            } else if (event.key === "Escape") {
              setActiveId(null);
            }
          }}
        />
      </label>
      <p className={styles.note} id={`${id}-hint`}>
        등급을 눌러 선택 · ↑↓ 이동 · Enter 선택
      </p>
      <div
        className={styles.tuningResults}
        id={`${id}-results`}
        role="listbox"
        aria-label="튜닝 설계도 검색 결과"
      >
        {groups.map((group) => (
          <div className={styles.tuningRow} key={group.name} role="group" aria-label={group.name}>
            <span className={styles.tuningName}>{group.label}</span>
            <div className={styles.tuningGrades}>
              {group.options.map((blueprint) => (
                <button
                  type="button"
                  role="option"
                  id={optionId(blueprint.id)}
                  key={blueprint.id}
                  aria-label={`${blueprint.name} · ${craftingRarityLabels[blueprint.rarity]}`}
                  aria-selected={blueprint.id === selectedId}
                  data-active={blueprint.id === active?.id || undefined}
                  className={styles[blueprint.rarity.toLowerCase()]}
                  onClick={() => onChange(blueprint.id)}
                  onFocus={() => setActiveId(blueprint.id)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    const delta =
                      event.key === "ArrowDown" || event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowUp" || event.key === "ArrowLeft"
                          ? -1
                          : 0;
                    if (delta) {
                      event.preventDefault();
                      const index = options.findIndex((option) => option.id === blueprint.id);
                      const next = options[(index + delta + options.length) % options.length];
                      document.getElementById(optionId(next.id))?.focus();
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      onChange(blueprint.id);
                    }
                  }}
                >
                  {craftingRarityLabels[blueprint.rarity]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!options.length && (
        <p className={styles.note} role="status">
          검색 결과가 없습니다. 검색어를 변경해 주세요.
        </p>
      )}
      {selectedId && (
        <button type="button" className={styles.reset} onClick={() => onChange(null)}>
          튜닝 선택 해제
        </button>
      )}
    </div>
  );
}
