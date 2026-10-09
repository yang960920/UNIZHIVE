"use client";

import { useState } from "react";
import { MIGRATION_STATUSES } from "@uniz/domain";
import type { SeasonAdminDetail } from "@/lib/server/season-administration";
import { AdminForm } from "../admin-form";
import { saveSeasonAdministration } from "./actions";

const migrationLabels = {
  UNDECIDED: "미정",
  JOINING: "참가 예정",
  PRE_REGISTERED: "사전 등록",
  READY: "준비 완료",
  MIGRATED: "이동 완료",
} as const;

export function MembershipForm({
  seasonId,
  member,
}: {
  seasonId: string;
  member: SeasonAdminDetail["memberships"][number];
}) {
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  return (
    <div className="cms-member-editor">
      <strong>
        {member.name}
        {member.handle ? ` · @${member.handle}` : ""}
      </strong>
      <AdminForm action={saveSeasonAdministration} submitLabel="참가 정보 저장">
        <input type="hidden" name="action" value="UPDATE_MEMBERSHIP" />
        <input type="hidden" name="id" value={member.id} />
        <input type="hidden" name="seasonId" value={seasonId} />
        <input type="hidden" name="userId" value={member.userId} />
        <input type="hidden" name="expectedUpdatedAt" value={member.updatedAt} />
        <label>
          이동 준비 상태
          <select name="migrationStatus" defaultValue={member.migrationStatus}>
            {MIGRATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {migrationLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </AdminForm>
      {!confirmRemoval ? (
        <button
          type="button"
          className="button button-quiet"
          onClick={() => setConfirmRemoval(true)}
        >
          참가자 삭제
        </button>
      ) : (
        <div className="cms-removal-confirm">
          <p>이 멤버를 시즌 참가 명단에서 삭제하시겠습니까?</p>
          <AdminForm action={saveSeasonAdministration} submitLabel="참가 명단에서 삭제">
            <input type="hidden" name="action" value="REMOVE_MEMBER" />
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="seasonId" value={seasonId} />
            <input type="hidden" name="userId" value={member.userId} />
            <input type="hidden" name="expectedUpdatedAt" value={member.updatedAt} />
          </AdminForm>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setConfirmRemoval(false)}
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}

export function SeasonReviewForm({ seasonId, updatedAt }: { seasonId: string; updatedAt: string }) {
  return (
    <AdminForm action={saveSeasonAdministration} submitLabel="승인 처리">
      <input type="hidden" name="action" value="REVIEW_SEASON" />
      <input type="hidden" name="id" value={seasonId} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <label>
        시즌 등록 검토
        <select name="decision" defaultValue="APPROVE">
          <option value="APPROVE">승인하여 시즌 등록</option>
          <option value="REJECT">반려</option>
        </select>
      </label>
    </AdminForm>
  );
}
