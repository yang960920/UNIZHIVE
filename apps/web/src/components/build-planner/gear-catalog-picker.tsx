"use client";

import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Package, Search, X } from "lucide-react";
import type { OnceHumanMapKey } from "@uniz/integrations";
import { gearItemHint, gearItemName, searchGearItems, type GearItem } from "./gear-editor-model";
import { GearFarmingMapLink } from "./gear-farming-map-link";

export const rarityLabels = {
  NORMAL: "일반",
  RARE: "레어",
  EPIC: "에픽",
  LEGENDARY: "레전드",
} as const;
const PAGE_SIZE = 48;
const SUGGESTION_LIMIT = 12;

export const GearIcon = memo(function GearIcon({
  item,
  large = false,
  fallbackIcon,
}: {
  item?: GearItem | null;
  large?: boolean;
  fallbackIcon?: string;
}) {
  const icon = item?.icon ?? fallbackIcon;
  return (
    <span
      className={`gear-icon ${large ? "gear-icon-large" : ""} ${item ? `gear-icon-${item.kind.toLowerCase()} rarity-${item.rarity?.toLowerCase() ?? "unknown"}` : ""}`}
    >
      {icon ? (
        <Image
          src={icon}
          alt=""
          width={large ? 256 : 144}
          height={large ? 256 : 144}
          sizes={large ? "200px" : "72px"}
          unoptimized
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Package size={large ? 52 : 28} aria-hidden="true" />
      )}
    </span>
  );
});

export function GearItemInfo({
  item,
  scenario,
}: {
  item: GearItem;
  scenario?: OnceHumanMapKey | null;
}) {
  return (
    <div className="gear-item-info">
      <GearIcon item={item} large />
      {item.rarity && (
        <span className={`gear-rarity rarity-${item.rarity.toLowerCase()}`}>
          {rarityLabels[item.rarity]}
        </span>
      )}
      <h3>{gearItemName(item)}</h3>
      <p className="gear-item-hint">{gearItemHint(item)}</p>
      {item.kind === "DEVIANT" && (
        <GearFarmingMapLink
          kind="deviant"
          id={item.id}
          name={gearItemName(item)}
          scenario={scenario}
        />
      )}
      {item.aliases.length > 0 && (
        <details className="gear-item-aliases">
          <summary>다른 이름으로 검색</summary>
          <p className="gear-muted">{item.aliases.join(" · ")}</p>
        </details>
      )}
      {!["MODULE", "WEAPON", "DEVIANT"].includes(item.kind) && (
        <p className="gear-item-description">
          {item.description || "상세 설명은 게임에서 확인해주세요."}
        </p>
      )}
      {item.isKeyArmor && <span className="gear-info-pill">핵심 방어구</span>}
      {item.kind !== "MODULE" && item.knownOptions?.length ? (
        <dl className="gear-known-options">
          {item.knownOptions.map((option, index) => (
            <div key={`${option.label}-${index}`}>
              <dt>{option.label}</dt>
              <dd>
                {option.value === null
                  ? "미확인"
                  : `${option.value}${option.unit === "PERCENT" ? "%" : ""}`}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.source.url?.startsWith("https://") && (
        <a
          href={item.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="gear-source-link"
        >
          자료 보기
        </a>
      )}
    </div>
  );
}

export function GearCatalogPicker({
  title,
  items,
  selectedId,
  onChoose,
  onClose,
  returnFocus,
  fallbackFocusId,
  notice,
  scenario,
  disabledReasons = {},
}: {
  title: string;
  items: readonly GearItem[];
  selectedId?: string | null;
  onChoose: (id: string) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  fallbackFocusId?: string;
  notice?: string;
  scenario?: OnceHumanMapKey | null;
  disabledReasons?: Readonly<Record<string, string>>;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [activeId, setActiveId] = useState(selectedId ?? null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [moduleType, setModuleType] = useState<"ALL" | "NORMAL" | "SHINY">("ALL");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const compositionRef = useRef(false);
  const compositionEndedAt = useRef(-Infinity);
  const listboxId = useId();
  useEffect(() => {
    // Show Korean composition updates while retaining the same bounded, debounced search.
    // Composition guards below protect selection, rather than delaying the visible results.
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 160);
    return () => clearTimeout(timer);
  }, [query]);
  const hasModuleTypes = items.some(
    (item) => item.kind === "MODULE" && item.moduleShiny !== undefined,
  );
  const filtered = useMemo(
    () =>
      searchGearItems(
        items.filter(
          (item) =>
            !hasModuleTypes ||
            moduleType === "ALL" ||
            item.moduleShiny === (moduleType === "SHINY"),
        ),
        search,
      ),
    [items, search, hasModuleTypes, moduleType],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const suggestions = filtered.slice(0, SUGGESTION_LIMIT);
  const selectableSuggestions = suggestions.filter((item) => !disabledReasons[item.id]);
  const highlighted =
    selectableSuggestions.find((item) => item.id === highlightedId) ?? selectableSuggestions[0];
  const active = suggestionsOpen ? highlighted : filtered.find((item) => item.id === activeId);
  const searching = search !== query;
  useEffect(() => {
    if (!suggestionsOpen || searching || !highlighted) return;
    const list = document.getElementById(listboxId);
    const option = document.getElementById(`${listboxId}-${highlighted.id}`);
    if (!list || !option) return;
    const viewport = list.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
  }, [suggestionsOpen, searching, highlighted, listboxId]);
  function commit(id: string, explicitSelection = false) {
    // Recheck the current filtered/eligible set before every mouse or keyboard selection.
    // A result click is deliberate selection; IME confirmation Enter remains guarded.
    if (
      searching ||
      (compositionRef.current && !explicitSelection) ||
      disabledReasons[id] ||
      !filtered.some((item) => item.id === id) ||
      !items.some((item) => item.id === id)
    )
      return;
    onChoose(id);
  }
  function handleSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (
      event.key === "Enter" &&
      (compositionRef.current ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229 ||
        event.timeStamp - compositionEndedAt.current < 75)
    ) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && suggestionsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setSuggestionsOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setSuggestionsOpen(false);
      return;
    }
    if (
      ["ArrowDown", "ArrowUp"].includes(event.key) ||
      (suggestionsOpen && ["Home", "End"].includes(event.key))
    ) {
      if (compositionRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (searching || !selectableSuggestions.length) return;
      let index = selectableSuggestions.findIndex((item) => item.id === highlighted?.id);
      if (!suggestionsOpen) index = event.key === "ArrowUp" ? selectableSuggestions.length - 1 : 0;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = selectableSuggestions.length - 1;
      else
        index = Math.max(
          0,
          Math.min(selectableSuggestions.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)),
        );
      setSuggestionsOpen(true);
      setHighlightedId(selectableSuggestions[index].id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionsOpen && highlighted) commit(highlighted.id);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay gear-picker-overlay" />
        <Dialog.Content
          className="dialog-content gear-picker"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (suggestionsOpen) {
              event.preventDefault();
              setSuggestionsOpen(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;
            if (target && target.isConnected !== false) {
              target.focus();
              if (document.activeElement === target) return;
            }
            if (fallbackFocusId) document.getElementById(fallbackFocusId)?.focus();
          }}
        >
          <div className="gear-picker-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="장비 선택 닫기">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="gear-muted">
            이름을 입력하면 아이콘과 함께 검색 결과가 표시됩니다. 검색 결과를 누르거나 방향키와
            Enter로 선택하세요.
            {notice && <span className="gear-picker-notice">{notice}</span>}
          </Dialog.Description>
          <div className="gear-picker-columns">
            <section className="gear-picker-inventory" aria-label="선택 가능한 아이템">
              <label className="gear-search">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">아이템 이름·별칭 검색</span>
                <input
                  ref={inputRef}
                  value={query}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestionsOpen}
                  aria-controls={suggestionsOpen ? listboxId : undefined}
                  aria-activedescendant={
                    suggestionsOpen && !searching && highlighted
                      ? `${listboxId}-${highlighted.id}`
                      : undefined
                  }
                  aria-describedby={`${listboxId}-help`}
                  autoComplete="off"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setHighlightedId(null);
                    setSuggestionsOpen(Boolean(event.target.value.trim()));
                  }}
                  onFocus={() => {
                    if (query.trim()) setSuggestionsOpen(true);
                  }}
                  onKeyDown={handleSearchKey}
                  onCompositionStart={() => {
                    compositionRef.current = true;
                  }}
                  onCompositionEnd={(event) => {
                    compositionRef.current = false;
                    compositionEndedAt.current = event.timeStamp;
                    setQuery(event.currentTarget.value);
                  }}
                  placeholder="아이템 이름 입력 · 예: P90, 울프, 쇄빙"
                  maxLength={120}
                />
              </label>
              <p className="sr-only" id={`${listboxId}-help`}>
                방향키로 결과 이동, Enter로 장착, Esc로 검색 목록 닫기
              </p>
              {hasModuleTypes && (
                <div className="gear-module-filters" aria-label="모듈 종류">
                  {(
                    [
                      ["ALL", "전체"],
                      ["NORMAL", "일반"],
                      ["SHINY", "섬광"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={moduleType === value}
                      onClick={() => {
                        setModuleType(value);
                        setPage(0);
                        setHighlightedId(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <p className="gear-picker-result" role="status" aria-live="polite">
                {searching ? "검색 중…" : `${filtered.length}개 아이템`}
              </p>
              {suggestionsOpen ? (
                <div className="gear-search-dropdown">
                  <div
                    id={listboxId}
                    role="listbox"
                    aria-label="아이템 검색 결과"
                    aria-busy={searching}
                    className="gear-search-options"
                  >
                    {searching && <p className="gear-picker-empty">이름을 찾고 있습니다…</p>}
                    {(searching ? [] : suggestions).map((item) => (
                      <button
                        key={item.id}
                        id={`${listboxId}-${item.id}`}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={highlighted?.id === item.id}
                        disabled={searching || Boolean(disabledReasons[item.id])}
                        className={`gear-search-option ${highlighted?.id === item.id ? "is-highlighted" : ""}`}
                        onPointerDown={(event) => event.preventDefault()}
                        onPointerEnter={() => {
                          if (!searching && !disabledReasons[item.id]) setHighlightedId(item.id);
                        }}
                        onClick={() => commit(item.id, true)}
                      >
                        <GearIcon item={item} />
                        <span>
                          <strong>{gearItemName(item)}</strong>
                          <small>{gearItemHint(item)}</small>
                          {disabledReasons[item.id] && (
                            <small className="gear-muted">{disabledReasons[item.id]}</small>
                          )}
                        </span>
                        {selectedId === item.id && <span className="gear-info-pill">장착 중</span>}
                        {item.isKeyArmor && <span className="gear-info-pill">핵심 방어구</span>}
                      </button>
                    ))}
                  </div>
                  {filtered.length > SUGGESTION_LIMIT && (
                    <button
                      type="button"
                      className="gear-search-more"
                      disabled={searching}
                      onClick={() => {
                        setSuggestionsOpen(false);
                        setPage(0);
                      }}
                    >
                      전체 {filtered.length}개 결과 보기 <ChevronRight size={15} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="gear-picker-grid" aria-busy={searching}>
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`gear-catalog-card rarity-${item.rarity?.toLowerCase() ?? "unknown"} ${activeId === item.id ? "is-selected" : ""}`}
                      aria-pressed={activeId === item.id}
                      disabled={searching || Boolean(disabledReasons[item.id])}
                      onClick={() => setActiveId(item.id)}
                    >
                      <GearIcon item={item} />
                      <span className="gear-card-name">{gearItemName(item)}</span>
                      {item.isKeyArmor && <span className="gear-info-pill">핵심 방어구</span>}
                      <span className="gear-card-rarity">
                        {gearItemHint(item) || (item.rarity ? rarityLabels[item.rarity] : "")}
                      </span>
                      {disabledReasons[item.id] && (
                        <span className="gear-muted">{disabledReasons[item.id]}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {!filtered.length && (
                <div className="gear-picker-empty">
                  {items.length
                    ? "검색 결과가 없습니다. 다른 이름이나 별칭을 입력해주세요."
                    : "이 위치에 장착할 수 있는 확인된 항목이 아직 없습니다."}
                </div>
              )}
              {pageCount > 1 && !suggestionsOpen && (
                <nav className="gear-picker-pagination" aria-label="아이템 페이지">
                  <button
                    type="button"
                    disabled={currentPage === 0 || searching}
                    onClick={() => setPage(currentPage - 1)}
                    aria-label="이전 아이템 페이지"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {currentPage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage + 1 >= pageCount || searching}
                    onClick={() => setPage(currentPage + 1)}
                    aria-label="다음 아이템 페이지"
                  >
                    <ChevronRight size={18} />
                  </button>
                </nav>
              )}
            </section>
            <aside className="gear-picker-detail">
              {active ? (
                <GearItemInfo item={active} scenario={scenario} />
              ) : (
                <div className="gear-picker-empty">
                  <Package size={38} aria-hidden="true" />
                  <p>
                    아이템을 선택하면
                    <br />
                    정보가 표시됩니다.
                  </p>
                </div>
              )}
            </aside>
          </div>
          <div className="gear-picker-footer">
            <Dialog.Close className="button button-quiet">취소</Dialog.Close>
            <button
              type="button"
              className="button button-primary"
              disabled={!active || searching || Boolean(disabledReasons[active.id])}
              onClick={() => {
                if (active) commit(active.id, true);
              }}
            >
              이 아이템 선택
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
