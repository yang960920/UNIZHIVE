"use client";

import type { BrowserDraftController } from "@/lib/browser-drafts/use-browser-draft";
import "./browser-draft-controls.css";

function savedTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function BrowserDraftControls({ draft }: { draft: BrowserDraftController }) {
  const label = !draft.hydrated
    ? "임시저장 확인 중…"
    : draft.status === "saving"
      ? "임시저장 중…"
      : draft.error
        ? draft.error
        : draft.status === "idle" && draft.savedAt
          ? "변경 내용을 임시저장할 예정이에요…"
          : draft.savedAt
            ? `이 브라우저에 임시저장됨 · ${savedTime(draft.savedAt)}`
            : "작성하면 자동으로 임시저장됩니다.";
  return (
    <div className="browser-draft-controls">
      <button
        type="button"
        className="browser-draft-button"
        disabled={!draft.hydrated || draft.status === "saving"}
        onClick={() => {
          void draft.saveNow();
        }}
      >
        임시저장
      </button>
      <div className="browser-draft-info">
        <span className={draft.error ? "browser-draft-error" : ""} role="status" aria-live="polite">
          {label}
        </span>
        {draft.restored && <span>이전에 작성하던 내용을 복구했어요.</span>}
        {draft.recoveries.length > 1 && (
          <details>
            <summary>다른 임시저장 확인</summary>
            {draft.recoveries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  void draft.restoreRecovery(entry.id);
                }}
              >
                {savedTime(entry.savedAt)} 작성 내용 복구
              </button>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}
