"use client";

import { useActionState } from "react";
import { reviewBuildShare } from "./actions";
import type { BuildShareSummary } from "@/lib/server/build-sharing";

export function BuildReviewForm({ share }: { share: BuildShareSummary }) {
  const [state, action, pending] = useActionState(reviewBuildShare, { ok: false, message: "" });
  const waiting = share.status === "PENDING";
  if (!waiting && share.status !== "APPROVED") return null;
  return (
    <form action={action} className="build-review-form">
      <input type="hidden" name="requestId" value={share.id} />
      <input type="hidden" name="expectedUpdatedAt" value={share.updatedAt} />
      <label>
        관리자 추천도 · 선택
        <select
          name="recommendationScore"
          defaultValue={share.recommendationScore ?? ""}
          disabled={pending}
        >
          <option value="">미평가</option>
          {[1, 2, 3, 4, 5].map((score) => (
            <option key={score} value={score}>
              {score}/5
            </option>
          ))}
        </select>
      </label>
      <label>
        추천 평가 · 공유 화면에 표시
        <textarea
          name="recommendationNote"
          maxLength={500}
          rows={3}
          defaultValue={share.recommendationNote}
          disabled={pending}
        />
      </label>
      <label>
        검토 의견 · 작성자에게 표시
        <textarea
          name="reviewNote"
          maxLength={1000}
          rows={3}
          defaultValue={share.reviewNote}
          disabled={pending}
        />
      </label>
      <p className="planner-description">
        추천도는 현재 신청한 버전에 기록됩니다. 승인하면 이 버전과 신청 당시 제목·본문·공유 범위가
        공개됩니다.
      </p>
      <div className="build-review-buttons">
        {waiting ? (
          <>
            <button
              className="button button-primary"
              type="submit"
              name="decision"
              value="APPROVE"
              disabled={pending}
            >
              공유 승인
            </button>
            <button
              className="button button-quiet"
              type="submit"
              name="decision"
              value="REJECT"
              disabled={pending}
            >
              반려
            </button>
          </>
        ) : (
          <>
            <button
              className="button button-primary"
              type="submit"
              name="decision"
              value="RATE"
              disabled={pending}
            >
              추천도 저장
            </button>
            <button
              className="button button-quiet"
              type="submit"
              name="decision"
              value="REVOKE"
              disabled={pending}
            >
              이 버전 승인 해제
            </button>
          </>
        )}
      </div>
      {share.status === "APPROVED" && (
        <p className="planner-description">
          승인 해제 시 이 버전의 고정 링크와 커뮤니티 첨부도 숨겨집니다. 현재 공유 버전이면 빌드
          전체 공유가 중단됩니다.
        </p>
      )}
      {state.message && (
        <p role="status" className={`planner-feedback ${state.ok ? "" : "is-error"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
