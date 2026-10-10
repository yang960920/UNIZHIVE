"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveBuildLoadout, searchLoadoutBuilds } from "@/app/lab/loadouts/actions";
import { MAX_LOADOUT_BUILDS } from "@/lib/build-loadout-policy";
import type {
  BuildLoadoutDetail,
  LoadoutBuildChoice,
  LoadoutChoicePage,
} from "@/lib/data/build-loadout-types";

export function LoadoutEditor({
  initial,
  choices,
  preview = false,
}: {
  initial?: BuildLoadoutDetail;
  choices: LoadoutChoicePage;
  preview?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [entries, setEntries] = useState<LoadoutBuildChoice[]>(initial?.entries ?? []);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [page, setPage] = useState(choices);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [state, action, pending] = useActionState(saveBuildLoadout, { ok: false, message: "" });
  useEffect(() => {
    if (state.ok && state.href) {
      router.push(state.href);
      router.refresh();
    }
  }, [state, router]);
  const locked = pending || state.ok;
  const reason = preview
    ? "개발 계정에서는 실제 로드아웃을 저장할 수 없습니다."
    : title.trim().length < 2
      ? "로드아웃 이름을 2자 이상 입력해주세요."
      : entries.length < 2
        ? "함께 사용할 빌드를 2개 이상 추가해주세요."
        : "";
  async function search(more = false) {
    if (searching || preview) return;
    setSearching(true);
    setSearchError("");
    try {
      const result = await searchLoadoutBuilds(
        more ? searchedQuery : query,
        more ? (page.nextCursor ?? undefined) : undefined,
      );
      if (result.ok) {
        setPage(result.page);
        if (!more) setSearchedQuery(query);
      } else setSearchError(result.message);
    } catch {
      setSearchError("빌드 목록을 불러오지 못했습니다. 다시 검색해주세요.");
    } finally {
      setSearching(false);
    }
  }
  function move(index: number, change: number) {
    const next = [...entries];
    [next[index], next[index + change]] = [next[index + change], next[index]];
    setEntries(next);
  }
  return (
    <form action={action} className="loadout-editor">
      {initial && (
        <>
          <input type="hidden" name="loadoutId" value={initial.id} />
          <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />
        </>
      )}
      <fieldset disabled={locked}>
        <label htmlFor="loadout-title">
          로드아웃 이름 <span>필수</span>
        </label>
        <input
          id="loadout-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={2}
          maxLength={100}
          required
          placeholder="예: 보스전 · 파밍 · 지원"
        />
        <label htmlFor="loadout-notes">
          메모 <span>선택</span>
        </label>
        <textarea
          id="loadout-notes"
          name="notes"
          defaultValue={initial?.notes ?? ""}
          maxLength={2000}
          rows={3}
          placeholder="사용 상황이나 장비 교체 순서를 기록하세요."
        />
        <section aria-labelledby="loadout-selected-heading">
          <h2 id="loadout-selected-heading">
            선택한 빌드{" "}
            <small>
              {entries.length}/{MAX_LOADOUT_BUILDS}
            </small>
          </h2>
          <p>
            2~32개의 저장된 빌드 버전을 묶습니다. 각 버전은 고정되며 원본을 수정해도 이 구성이
            유지됩니다.
          </p>
          <ol className="loadout-selected">
            {entries.map((entry, index) => (
              <li key={entry.buildVersionId}>
                <input type="hidden" name="buildVersionId" value={entry.buildVersionId} />
                <Link href={`/lab/b/${entry.buildId}?version=${entry.version}`} prefetch={false}>
                  {entry.title} · v{entry.version}
                  {entry.archived ? " · 보관된 빌드" : ""}
                </Link>
                <div className="loadout-row-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`${entry.title} v${entry.version} 위로`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => move(index, 1)}
                    disabled={index === entries.length - 1}
                    aria-label={`${entry.title} v${entry.version} 아래로`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setEntries(entries.filter((_, at) => at !== index))}
                    aria-label={`${entry.title} v${entry.version} 제외`}
                  >
                    제외
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {!entries.length && <p>아래에서 내 빌드를 검색하고 추가하세요.</p>}
        </section>
        <section aria-labelledby="loadout-search-heading">
          <h2 id="loadout-search-heading">내 저장 빌드 추가</h2>
          <label htmlFor="loadout-build-query">빌드 이름 검색</label>
          <div className="loadout-search">
            <input
              id="loadout-build-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={80}
              disabled={searching || preview}
              placeholder="검색어를 비우면 모든 저장 버전을 봅니다."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!event.nativeEvent.isComposing) void search();
                }
              }}
            />
            <button
              className="button button-quiet"
              type="button"
              disabled={searching || preview}
              onClick={() => void search()}
            >
              {searching ? "불러오는 중…" : "검색"}
            </button>
          </div>
          {searchError && <p role="alert">{searchError}</p>}
          <ul className="loadout-candidates">
            {page.items.map((entry) => {
              const selected = entries.some((item) => item.buildVersionId === entry.buildVersionId);
              return (
                <li key={entry.buildVersionId}>
                  <span>
                    {entry.title} · v{entry.version}
                  </span>
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={selected || entries.length >= MAX_LOADOUT_BUILDS}
                    onClick={() => setEntries([...entries, entry])}
                  >
                    {selected ? "추가됨" : "추가"}
                  </button>
                </li>
              );
            })}
          </ul>
          {!page.items.length && (
            <p>
              {preview
                ? "실제 계정의 저장된 빌드를 선택하는 공간입니다."
                : "검색 결과가 없습니다. 먼저 빌드를 저장하거나 다른 이름으로 검색하세요."}
            </p>
          )}
          {page.nextCursor && (
            <button
              className="button button-quiet"
              type="button"
              disabled={searching || preview}
              onClick={() => void search(true)}
            >
              다음 저장 버전 보기 →
            </button>
          )}
        </section>
      </fieldset>
      <div className="loadout-save">
        {reason && <p id="loadout-save-reason">{reason}</p>}
        <button
          className="button button-primary"
          type="submit"
          disabled={locked || Boolean(reason)}
          aria-describedby={reason ? "loadout-save-reason" : undefined}
        >
          {pending ? "저장하는 중…" : "로드아웃 저장"}
        </button>
        {state.message && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}
      </div>
    </form>
  );
}
