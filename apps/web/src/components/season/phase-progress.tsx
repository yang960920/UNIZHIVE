"use client";

import { useActionState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { saveSeasonAdministration } from "@/app/admin/seasons/actions";
import { seasonPhaseLabel, type AdministrationActionState } from "@/lib/admin-format";
import "./phase-progress.css";

export function PhaseProgress({
  phases,
  currentPhaseOrder,
  seasonId,
  expectedUpdatedAt,
  canControl = false,
  disabled = false,
}: {
  phases: readonly { id?: string; order: number; name: string }[];
  currentPhaseOrder: number;
  seasonId: string;
  expectedUpdatedAt: string;
  canControl?: boolean;
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState<AdministrationActionState, FormData>(
    saveSeasonAdministration,
    { ok: false, message: "" },
  );
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  const currentIndex = ordered.findIndex((phase) => phase.order === currentPhaseOrder);
  const current = ordered[currentIndex];
  const last = ordered.at(-1);
  return (
    <section className="phase-progress" aria-label="시즌 진행 단계">
      <div className="phase-progress-heading">
        <div>
          <span className="eyebrow">SEASON PROGRESS</span>
          <h2>{current ? seasonPhaseLabel(current.order, current.name) : "시즌 단계"}</h2>
          <p>
            {currentIndex >= 0
              ? `전체 ${ordered.length}단계 중 ${currentIndex + 1}단계`
              : "시즌 진행 단계를 확인해주세요."}
          </p>
        </div>
        {canControl && (
          <form action={submit} className="phase-progress-controls">
            <input type="hidden" name="action" value="CHANGE_SEASON_PHASE" />
            <input type="hidden" name="seasonId" value={seasonId} />
            <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
            <button
              className="button button-quiet"
              type="submit"
              name="direction"
              value="PREVIOUS"
              disabled={disabled || pending || currentIndex <= 0}
              aria-label="이전 단계"
            >
              <ArrowLeft size={15} aria-hidden="true" /> 이전
            </button>
            <button
              className="button button-primary"
              type="submit"
              name="direction"
              value="NEXT"
              disabled={disabled || pending || currentIndex < 0 || current === last}
              aria-label="다음 단계"
            >
              다음 <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>
        )}
      </div>
      <ol className="phase-progress-steps">
        {ordered.map((phase, index) => (
          <li
            key={phase.id ?? phase.order}
            className={
              phase.order === currentPhaseOrder
                ? "is-current"
                : phase.order < currentPhaseOrder
                  ? "is-complete"
                  : ""
            }
            aria-current={phase.order === currentPhaseOrder ? "step" : undefined}
          >
            <span className="phase-progress-number mono">
              {phase.order < currentPhaseOrder ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                String(phase.order).padStart(2, "0")
              )}
            </span>
            <strong>{phase.name}</strong>
            {index === ordered.length - 1 && <small>시즌 이동 신청</small>}
          </li>
        ))}
      </ol>
      {canControl && (
        <p className="phase-progress-note">
          게임 서버의 진행에 맞춰 변경해주세요. 잘못 진행했다면 이전 버튼으로 되돌릴 수 있습니다.
        </p>
      )}
      {(pending || state.message) && (
        <p
          className={`phase-progress-feedback ${!pending && !state.ok ? "is-error" : ""}`}
          role={!pending && !state.ok ? "alert" : "status"}
        >
          {pending ? "단계를 변경하고 있습니다…" : state.message}
        </p>
      )}
    </section>
  );
}
