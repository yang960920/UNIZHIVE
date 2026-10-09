"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Search, X } from "lucide-react";
import {
  GEAR_CATALOG,
  getGearTraitConflicts,
  getGearTraitSelectionConflict,
} from "@uniz/build-engine";
import { GearIcon } from "./gear-catalog-picker";
import { gearDisplayName, gearItemById, gearItemName, searchGearItems } from "./gear-editor-model";
import { gearTraitCategoryLabel, gearTraitConflictMessage } from "./gear-trait-presentation";

const RESULT_LIMIT = 12;
const MAX_TRAITS = 16;

export function GearTraitSelector({
  allowedIds,
  selectedIds,
  recordedNames,
  onChange,
}: {
  allowedIds: readonly string[];
  selectedIds: string[];
  recordedNames?: Record<string, string>;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const composition = useRef(false);
  const compositionEndedAt = useRef(-Infinity);
  const input = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 160);
    return () => clearTimeout(timer);
  }, [query]);
  const items = useMemo(
    () =>
      [...new Set(allowedIds)].flatMap((id) => {
        const item = gearItemById.get(id);
        return item?.kind === "DEVIANT_TRAIT" ? [item] : [];
      }),
    [allowedIds],
  );
  const filtered = useMemo(() => searchGearItems(items, search), [items, search]);
  const conflicts = useMemo(() => getGearTraitConflicts(selectedIds, GEAR_CATALOG), [selectedIds]);
  const conflictingIds = new Set(conflicts.flatMap((conflict) => conflict.traitIds));
  const pageCount = Math.max(1, Math.ceil(filtered.length / RESULT_LIMIT));
  const currentPage = Math.min(page, pageCount - 1);
  const results = filtered.slice(currentPage * RESULT_LIMIT, (currentPage + 1) * RESULT_LIMIT);
  const resultConflicts = new Map(
    results.map((item) => [
      item.id,
      getGearTraitSelectionConflict(item.id, selectedIds, GEAR_CATALOG),
    ]),
  );
  const selectable =
    selectedIds.length < MAX_TRAITS
      ? results.filter((item) => !selectedIds.includes(item.id) && !resultConflicts.get(item.id))
      : [];
  const active = selectable.find((item) => item.id === highlightedId) ?? selectable[0];
  const searching = query !== search;
  function choose(id: string, explicitSelection = false) {
    if (
      searching ||
      (composition.current && !explicitSelection) ||
      selectedIds.length >= MAX_TRAITS ||
      selectedIds.includes(id) ||
      getGearTraitSelectionConflict(id, selectedIds, GEAR_CATALOG) ||
      !allowedIds.includes(id) ||
      !filtered.some((item) => item.id === id)
    )
      return;
    if (composition.current) {
      input.current?.blur();
      composition.current = false;
    }
    onChange([...selectedIds, id]);
    setQuery("");
    setSearch("");
    setHighlightedId(null);
    setPage(0);
    input.current?.focus();
    setOpen(false);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      event.key === "Enter" &&
      (composition.current ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229 ||
        event.timeStamp - compositionEndedAt.current < 75)
    ) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (event.key === "Tab") {
      return;
    }
    if (composition.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (["PageDown", "PageUp"].includes(event.key)) {
      event.preventDefault();
      if (searching) return;
      setPage(
        Math.max(0, Math.min(pageCount - 1, currentPage + (event.key === "PageDown" ? 1 : -1))),
      );
      setHighlightedId(null);
      setOpen(true);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (searching || !selectable.length) return;
      const current = selectable.findIndex((item) => item.id === active?.id);
      const index = !open
        ? event.key === "ArrowUp"
          ? selectable.length - 1
          : 0
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? selectable.length - 1
            : Math.max(
                0,
                Math.min(selectable.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)),
              );
      setHighlightedId(selectable[index].id);
      setOpen(true);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && active) choose(active.id);
    }
  }
  useEffect(() => {
    if (!open || searching || !active) return;
    const list = document.getElementById(listId);
    const option = document.getElementById(`${listId}-${active.id}`);
    if (!list || !option) return;
    const viewport = list.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
  }, [open, searching, active, listId]);
  return (
    <div
      className="gear-trait-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="gear-trait-chips" aria-label="등록한 감염물 특성">
        {selectedIds.map((id) => (
          <span
            key={id}
            className={`gear-trait-chip${conflictingIds.has(id) ? " is-conflicting" : ""}`}
          >
            <GearIcon item={gearItemById.get(id)} />
            <span>
              {gearDisplayName(id, recordedNames)}
              <small>{gearTraitCategoryLabel(gearItemById.get(id))}</small>
            </span>
            <button
              type="button"
              aria-label={`${gearDisplayName(id, recordedNames)} 특성 해제`}
              onClick={() => onChange(selectedIds.filter((selected) => selected !== id))}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <p className="gear-trait-rule-note">같은 아이콘별 1개 · 이로치 특성 1개</p>
      {conflicts.length > 0 && (
        <div className="gear-trait-conflict-notice" role="alert">
          {conflicts.map((conflict) => (
            <p key={`${conflict.code}.${conflict.iconGroup ?? "shiny"}`}>
              {gearTraitConflictMessage(conflict, recordedNames)}
            </p>
          ))}
        </div>
      )}
      <label className="gear-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">감염물 특성 검색</span>
        <input
          ref={input}
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={`${listId}-help`}
          aria-activedescendant={
            open && !searching && active ? `${listId}-${active.id}` : undefined
          }
          autoComplete="off"
          maxLength={120}
          placeholder="특성 이름 입력"
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedId(null);
            setPage(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={keyDown}
          onCompositionStart={() => {
            composition.current = true;
          }}
          onCompositionEnd={(event) => {
            composition.current = false;
            compositionEndedAt.current = event.timeStamp;
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      <p className="sr-only" id={`${listId}-help`}>
        방향키로 이동, Enter로 등록, Page Up·Page Down으로 특성 페이지 이동, Esc로 닫기
      </p>
      {open && (
        <div className="gear-search-dropdown gear-trait-results">
          <div
            id={listId}
            role="listbox"
            aria-label="감염물 특성 검색 결과"
            aria-multiselectable="true"
            aria-busy={searching}
            className="gear-search-options"
          >
            {searching ? (
              <p className="gear-picker-empty">특성을 찾고 있습니다…</p>
            ) : results.length ? (
              results.map((item) => {
                const selected = selectedIds.includes(item.id);
                const conflict = resultConflicts.get(item.id);
                const reason = conflict
                  ? gearTraitConflictMessage(conflict, recordedNames, item.id)
                  : null;
                return (
                  <button
                    type="button"
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={selected}
                    disabled={selected || Boolean(conflict) || selectedIds.length >= MAX_TRAITS}
                    aria-describedby={reason ? `${listId}-${item.id}-conflict` : undefined}
                    title={reason ?? item.description}
                    className={`gear-search-option ${active?.id === item.id ? "is-highlighted" : ""}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerEnter={() => {
                      if (!selected && !conflict) setHighlightedId(item.id);
                    }}
                    onClick={() => choose(item.id, true)}
                  >
                    <GearIcon item={item} />
                    <span title={item.description}>
                      <strong>{gearItemName(item)}</strong>
                      <small className="gear-trait-category">{gearTraitCategoryLabel(item)}</small>
                      {item.traitFusionMaterialNames?.length ? (
                        <small className="gear-trait-material">
                          재료: {item.traitFusionMaterialNames.join(" · ")}
                        </small>
                      ) : null}
                      <small>{item.description}</small>
                      {reason && (
                        <small
                          className="gear-trait-conflict-reason"
                          id={`${listId}-${item.id}-conflict`}
                        >
                          {reason}
                        </small>
                      )}
                    </span>
                    {selected && <Check size={15} aria-label="등록됨" />}
                  </button>
                );
              })
            ) : (
              <p className="gear-picker-empty">일치하는 특성이 없습니다.</p>
            )}
          </div>
          {!searching && filtered.length > RESULT_LIMIT && (
            <nav className="gear-picker-pagination" aria-label="감염물 특성 페이지">
              <button
                type="button"
                aria-label="이전 특성 페이지"
                disabled={currentPage === 0}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPage(currentPage - 1);
                  setHighlightedId(null);
                }}
              >
                이전
              </button>
              <span>
                {currentPage + 1} / {pageCount} · {filtered.length}개
              </span>
              <button
                type="button"
                aria-label="다음 특성 페이지"
                disabled={currentPage + 1 >= pageCount}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPage(currentPage + 1);
                  setHighlightedId(null);
                }}
              >
                다음
              </button>
            </nav>
          )}
        </div>
      )}
      {!items.length && <p className="gear-muted">이 감염물의 특성 목록을 확인하고 있습니다.</p>}
      {selectedIds.length >= MAX_TRAITS && (
        <p className="gear-muted">특성 기록은 최대 {MAX_TRAITS}개입니다.</p>
      )}
    </div>
  );
}
