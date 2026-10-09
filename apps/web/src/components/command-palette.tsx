"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Search, X } from "lucide-react";
import type { PermissionPrincipal } from "@uniz/domain";
import {
  normalizeSearchQuery,
  SEARCH_CATEGORIES,
  searchHref,
  type UnifiedSearchData,
} from "@/lib/unified-search";
import "./unified-search.css";

function SearchDialogBody({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<UnifiedSearchData | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [responseVersion, setResponseVersion] = useState(-1);
  const [failedVersion, setFailedVersion] = useState(-1);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const listId = useId();
  const q = normalizeSearchQuery(query);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timer = window.setTimeout(
      async () => {
        try {
          const result = await fetch(`/api/search?${new URLSearchParams({ q })}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!result.ok) throw new Error("Unavailable");
          const data = (await result.json()) as UnifiedSearchData;
          if (current && data.q === q) {
            setResponse(data);
            setResponseVersion(requestVersion);
            setFailedVersion(-1);
          }
        } catch {
          if (current && !controller.signal.aborted) setFailedVersion(requestVersion);
        }
      },
      q ? 250 : 0,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, requestVersion]);
  const ready = response?.q === q && responseVersion === requestVersion;
  const groups = ready ? response.groups.filter((group) => group.items.length) : [];
  const items = groups.flatMap((group) => group.items);
  const selected = Math.min(active, Math.max(0, items.length - 1));
  const failed = failedVersion === requestVersion;
  const loading = !ready && !failed;
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      const next = (selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      setActive(next);
      linkRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (items.length) linkRefs.current[selected]?.click();
    }
  }
  let index = 0;
  return (
    <Dialog.Content
      className="dialog-content unified-search-dialog"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <div className="dialog-heading">
        <Dialog.Title>통합 검색</Dialog.Title>
        <Dialog.Close className="icon-button" aria-label="닫기">
          <X size={20} />
        </Dialog.Close>
      </div>
      <Dialog.Description className="dialog-description">
        빌드·글·파티·공지와 게임 장비·파밍 정보를 찾아보세요.
      </Dialog.Description>
      <div className="search-input">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="통합 검색어"
          aria-controls={listId}
          aria-expanded={items.length > 0}
          aria-autocomplete="list"
          aria-activedescendant={items.length ? `${listId}-${selected}` : undefined}
          placeholder="포식자, 닥터 테디, 무한의 꿈…"
          value={query}
          maxLength={160}
          onChange={(event) => {
            setQuery(event.target.value);
            setRequestVersion((version) => version + 1);
            setActive(0);
          }}
          onKeyDown={keyboard}
        />
      </div>
      <div className="unified-search-status" role="status" aria-live="polite">
        {loading
          ? "검색 중…"
          : failed
            ? "검색에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."
            : q
              ? `${items.length}개 미리보기`
              : "페이지 바로가기 · 검색어를 입력하면 콘텐츠도 찾습니다."}
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="통합 검색 결과"
        className="command-results unified-search-results"
        aria-busy={loading}
      >
        {groups.map((group) => (
          <div key={group.category} role="group" aria-label={SEARCH_CATEGORIES[group.category]}>
            <p className="unified-search-group-title">{SEARCH_CATEGORIES[group.category]}</p>
            {group.items.map((item) => {
              const itemIndex = index++;
              return (
                <Link
                  key={`${item.category}-${item.id}`}
                  id={`${listId}-${itemIndex}`}
                  ref={(element) => {
                    linkRefs.current[itemIndex] = element;
                  }}
                  href={item.href}
                  prefetch={false}
                  role="option"
                  aria-selected={itemIndex === selected}
                  tabIndex={-1}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  onMouseMove={() => setActive(itemIndex)}
                  onClick={close}
                >
                  <span className="unified-search-item-text">
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                    <span>{item.excerpt}</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ))}
        {ready && q && !items.length && (
          <p className="muted">검색 결과가 없습니다. 다른 이름이나 짧은 검색어로 찾아보세요.</p>
        )}
      </div>
      {ready && response.notice && <p className="unified-search-notice">{response.notice}</p>}
      <div className="unified-search-footer">
        <small>↑ ↓ 선택 · Enter 이동 · Esc 닫기</small>
        {q && (
          <Link href={searchHref(q)} onClick={close} prefetch={false}>
            전체 결과 보기 <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
    </Dialog.Content>
  );
}
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: PermissionPrincipal;
}) {
  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open, onOpenChange]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <SearchDialogBody close={() => onOpenChange(false)} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
