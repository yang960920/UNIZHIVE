"use client";

import { OPERATION_TYPES } from "@uniz/domain";
import { operationStatusLabels, operationTypeLabels, toKstInput } from "@/lib/admin-format";
import type {
  OperationAdminData,
  OperationAdminDetail,
} from "@/lib/server/operation-administration";
import { AdminForm } from "../admin-form";
import { saveOperationAdministration } from "./actions";

export function OperationForm({
  seasons,
  initial,
}: {
  seasons: OperationAdminData["seasons"];
  initial?: OperationAdminDetail;
}) {
  const readonly = initial && initial.status !== "SCHEDULED";
  const currentOptionMissing = initial?.seasonId && !seasons.some((s) => s.id === initial.seasonId);
  return (
    <AdminForm
      action={saveOperationAdministration}
      submitLabel={initial ? "작전 저장" : "작전 등록"}
      disabled={Boolean(readonly)}
    >
      {initial && (
        <>
          <input type="hidden" name="id" value={initial.id} />
          <input type="hidden" name="expectedUpdatedAt" value={initial.updatedAt} />
          <input type="hidden" name="originalStartsAt" value={initial.startsAt} />
          <input type="hidden" name="originalEndsAt" value={initial.endsAt ?? ""} />
        </>
      )}
      <label>
        작전 이름
        <input
          name="title"
          required
          minLength={2}
          maxLength={120}
          defaultValue={initial?.title}
          placeholder="참가자가 알아볼 수 있는 이름"
        />
      </label>
      <div className="cms-grid">
        <label>
          작전 유형
          <select name="type" defaultValue={initial?.type ?? "RAID"}>
            {OPERATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {operationTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          시즌
          <select name="seasonId" defaultValue={initial?.seasonId ?? ""}>
            <option value="">하이브 공통 작전</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {currentOptionMissing && (
              <option value={initial.seasonId!}>{initial.seasonName ?? "기존 시즌"}</option>
            )}
          </select>
          <small>시즌 작전에는 해당 시즌 참가 멤버가 응답할 수 있습니다.</small>
        </label>
        <label>
          시작 일시 (KST)
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toKstInput(initial?.startsAt)}
          />
        </label>
        <label>
          종료 일시 (KST)
          <input name="endsAt" type="datetime-local" defaultValue={toKstInput(initial?.endsAt)} />
        </label>
        <label>
          참가 정원
          <input
            name="capacity"
            type="number"
            required
            min={Math.max(1, initial?.goingCount ?? 1)}
            max={10000}
            step={1}
            defaultValue={initial?.capacity}
          />
          <small>저장된 참가 인원보다 적게 줄일 수 없습니다.</small>
        </label>
        <label>
          작전 상태
          <select name="status" defaultValue={initial?.status ?? "SCHEDULED"}>
            {(initial
              ? (["SCHEDULED", "COMPLETED", "CANCELLED"] as const)
              : (["SCHEDULED"] as const)
            ).map((s) => (
              <option key={s} value={s}>
                {operationStatusLabels[s]}
              </option>
            ))}
          </select>
          <small>완료·취소하면 참가 기록을 보관하고 편집을 종료합니다.</small>
        </label>
      </div>
      <label>
        작전 안내
        <textarea
          name="description"
          rows={5}
          maxLength={5000}
          defaultValue={initial?.description}
          placeholder="집결 장소, 준비물, 진행 방법을 적어주세요."
        />
      </label>
      <p className="cms-time-note">
        모든 일정은 한국 시간(KST)입니다. 시즌 작전은 시즌 시작과 정산 사이에 등록해주세요.
      </p>
      {readonly && (
        <p className="cms-readonly">
          {operationStatusLabels[initial.status]}된 작전은 참가 이력과 함께 보관됩니다.
        </p>
      )}
    </AdminForm>
  );
}
