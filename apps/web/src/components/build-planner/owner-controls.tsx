"use client";

import { useActionState, useState } from "react";
import { Archive, Copy, Check, RotateCcw } from "lucide-react";
import {
  archiveBuildPlanner,
  restoreBuildPlanner,
  setBuildPlannerVisibility,
} from "@/app/lab/actions";
import type { PlannerActionState, PlannerBuildDetail } from "@/lib/data/build-planner-types";
import { visibilityLabels } from "./presentation";
import { shareStatusLabels } from "./sharing-labels";

const empty: PlannerActionState = { ok: false, message: "" };

export function CopyBuildVersionLink({ buildId, version }: { buildId: string; version: number }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        new URL(`/lab/b/${buildId}?version=${version}`, window.location.origin).href,
      );
      setCopied(true);
      setError("");
    } catch {
      setError("복사하지 못했습니다. 주소창에서 현재 버전의 링크를 복사해주세요.");
    }
  }
  return (
    <div>
      <button className="button button-quiet" type="button" onClick={copy}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "링크 복사됨" : "이 버전 링크 복사"}
      </button>
      {error && (
        <p role="status" className="planner-feedback">
          {error}
        </p>
      )}
    </div>
  );
}

export function BuildOwnerControls({
  build,
}: {
  build: Pick<PlannerBuildDetail, "id" | "visibility" | "archivedAt" | "updatedAt" | "sharing">;
}) {
  const [visibilityState, changeVisibility, visibilityPending] = useActionState(
    setBuildPlannerVisibility,
    empty,
  );
  const [archiveState, changeArchive, archivePending] = useActionState(
    build.archivedAt ? restoreBuildPlanner : archiveBuildPlanner,
    empty,
  );
  const pending = visibilityPending || archivePending;
  return (
    <section className="planner-manage" aria-label="내 빌드 관리">
      <h2>내 빌드 관리</h2>
      <p className="planner-description">
        {build.sharing?.published
          ? `v${build.sharing.published.version}이 ${visibilityLabels[build.sharing.published.visibility]}로 공유 중입니다. 새 비공개 버전을 저장해도 이 승인 버전은 계속 공유됩니다.`
          : "현재 공유 중인 승인 버전이 없습니다. 나만 보는 빌드는 개수 제한 없이 저장할 수 있습니다."}
      </p>
      {build.sharing?.latestRequest && (
        <p className="planner-description">
          공유 신청 v{build.sharing.latestRequest.version} ·{" "}
          {shareStatusLabels[build.sharing.latestRequest.status]}
          {build.sharing.latestRequest.reviewNote &&
            ` · 검토 의견: ${build.sharing.latestRequest.reviewNote}`}
        </p>
      )}
      {!build.archivedAt && (
        <form action={changeVisibility}>
          <input type="hidden" name="buildId" value={build.id} />
          <input type="hidden" name="expectedUpdatedAt" value={build.updatedAt} />
          <label>
            최신 버전 공유 설정
            <select name="visibility" defaultValue={build.visibility} disabled={pending}>
              {Object.entries(visibilityLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {value === "PRIVATE" ? "공유 중단 · 나만 보기" : `${label} · 관리자 승인 요청`}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-primary" disabled={pending} type="submit">
            {visibilityPending ? "저장 중…" : "공유 설정 저장"}
          </button>
        </form>
      )}
      {!build.archivedAt && (
        <p className="planner-description">
          하이브 공유와 공개는 관리자의 버전별 승인이 필요합니다. 공유 중단을 선택하면 이전 승인
          버전과 대기 중인 신청도 모두 숨겨집니다.
        </p>
      )}
      <form action={changeArchive}>
        <input type="hidden" name="buildId" value={build.id} />
        <input type="hidden" name="expectedUpdatedAt" value={build.updatedAt} />
        <button className="button button-quiet" type="submit" disabled={pending}>
          {build.archivedAt ? <RotateCcw size={15} /> : <Archive size={15} />}
          {archivePending ? "변경 중…" : build.archivedAt ? "보관 해제" : "빌드 보관"}
        </button>
        <span className="planner-description">
          {build.archivedAt
            ? "보관을 해제하면 나만 보기로 돌아갑니다. 공유하려면 다시 승인을 요청하세요."
            : "보관하면 공유 목록에서 숨겨집니다. 이전 버전은 계속 확인하고 나중에 보관을 해제할 수 있습니다."}
        </span>
      </form>
      {(visibilityState.message || archiveState.message) && (
        <p
          className={`planner-feedback ${(!visibilityState.ok && visibilityState.message) || (!archiveState.ok && archiveState.message) ? "is-error" : ""}`}
          role="status"
        >
          {archiveState.message || visibilityState.message}
        </p>
      )}
    </section>
  );
}
