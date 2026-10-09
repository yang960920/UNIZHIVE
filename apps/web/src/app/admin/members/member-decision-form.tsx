"use client";

import { useActionState } from "react";
import { isApprovedRole, MEMBER_ROLE_LABELS, REVIEW_REASONS } from "@/lib/member-policy";
import type { ManagedMember } from "@/lib/server/member-management";
import { reviewMember } from "./actions";

export function MemberDecisionForm({
  member,
  isAdmin,
  isSelf,
}: {
  member: ManagedMember;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(reviewMember, { ok: false, message: "" });
  const protectedRole = member.role === "ADMIN" || member.role === "OFFICER";
  if (isSelf || (protectedRole && !isAdmin))
    return (
      <p className="member-note">
        {isSelf
          ? "자신의 권한은 변경할 수 없습니다."
          : "이 계정의 권한은 관리자가 변경할 수 있습니다."}
      </p>
    );
  return (
    <form className="member-review-form" action={action}>
      <input type="hidden" name="targetId" value={member.id} />
      <label>
        처리 사유
        <select
          name="reason"
          defaultValue={member.role === "APPLICANT" ? "PROFILE_REVIEW" : "ROLE_REORGANIZATION"}
          required
        >
          {Object.entries(REVIEW_REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {isApprovedRole(member.role) && isAdmin && (
        <label>
          변경할 역할
          <select name="role" defaultValue={member.role}>
            {(["MEMBER", "OFFICER", "ADMIN"] as const).map((role) => (
              <option key={role} value={role}>
                {MEMBER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="member-review-buttons">
        {member.role === "APPLICANT" && (
          <>
            <button
              className="button button-primary"
              type="submit"
              name="action"
              value="approve"
              disabled={pending || !member.profileComplete}
            >
              {pending ? "처리 중…" : "멤버 승인"}
            </button>
            <button
              className="button"
              type="submit"
              name="action"
              value="reject"
              disabled={pending}
            >
              가입 보류
            </button>
          </>
        )}
        {member.role === "GUEST" && (
          <button className="button" type="submit" name="action" value="reopen" disabled={pending}>
            신청 다시 검토
          </button>
        )}
        {isApprovedRole(member.role) && (
          <button className="button" type="submit" name="action" value="undo" disabled={pending}>
            승인 취소
          </button>
        )}
        {isApprovedRole(member.role) && isAdmin && (
          <button
            className="button button-primary"
            type="submit"
            name="action"
            value="role"
            disabled={pending}
          >
            역할 변경
          </button>
        )}
      </div>
      {state.message && (
        <p
          className={state.ok ? "onboarding-success" : "auth-error"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
