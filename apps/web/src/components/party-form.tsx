"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { CalendarField } from "@/app/admin/calendar-field";
import { AdminForm } from "@/app/admin/admin-form";
import { savePartyForm, managePartyParticipantForm } from "@/app/ops/actions";
import { getPartyContent, getPartyContentOptions } from "@/lib/party-content";
import { partyDefaultStart } from "@/lib/party-navigation";
import type { getPartyEditorData } from "@/lib/server/party-administration";
import type { RSVPStatus } from "@uniz/domain";
import "../app/admin/administration.css";
import "./party-form.css";

type EditorData = Awaited<ReturnType<typeof getPartyEditorData>>;

export function PartyForm({
  data,
  defaultSeasonId,
  defaultDay,
}: {
  data: EditorData;
  defaultSeasonId?: string;
  defaultDay?: string;
}) {
  const initial = data.initial;
  const [seasonId, setSeasonId] = useState(
    initial?.seasonId ??
      data.seasons.find((item) => item.id === defaultSeasonId)?.id ??
      data.seasons[0]?.id ??
      "",
  );
  const [contentKey, setContentKey] = useState<string>(initial?.contentKey ?? "raid");
  const season = data.seasons.find((item) => item.id === seasonId);
  const options = season ? getPartyContentOptions(season) : [];
  const initialContentMissing =
    initial &&
    seasonId === initial.seasonId &&
    !options.some((item) => item.key === initial.contentKey);
  const chosenKey =
    options.some((item) => item.key === contentKey) ||
    (initialContentMissing && contentKey === initial.contentKey)
      ? contentKey
      : (options[0]?.key ?? "");
  const readonly = initial && initial.status !== "SCHEDULED";
  const defaultStart = partyDefaultStart(defaultDay);
  if (!data.seasons.length)
    return (
      <p>
        모집할 수 있는 시즌이 없습니다. 먼저 <Link href="/season">시즌 참여 현황</Link>을
        확인해주세요.
      </p>
    );
  return (
    <div className="party-form">
      <AdminForm
        action={savePartyForm}
        submitLabel={initial ? "모집 변경 저장" : "파티 모집 등록"}
        disabled={Boolean(readonly)}
        submitDisabled={!season || !chosenKey}
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
          모집할 하이브·서버 시즌
          <select
            name="seasonId"
            value={seasonId}
            required
            onChange={(event) => setSeasonId(event.target.value)}
          >
            {data.seasons.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.serverAddress}
              </option>
            ))}
          </select>
          <small>이름이 같아도 서버·시즌이 다른 명단은 각각 구분됩니다.</small>
        </label>
        <div className="cms-grid">
          <label>
            모집 콘텐츠
            <select
              name="contentKey"
              value={chosenKey}
              required
              onChange={(event) => setContentKey(event.target.value)}
            >
              {options.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
              {initialContentMissing && (
                <option value={initial.contentKey}>
                  {getPartyContent(initial.contentKey)?.label ?? initial.contentKey} · 현재 비활성
                </option>
              )}
            </select>
            <small>선택한 시나리오와 시즌의 활성 콘텐츠에 맞춰 표시됩니다.</small>
          </label>
          <label>
            모집 이름
            <input
              name="title"
              required
              minLength={2}
              maxLength={120}
              defaultValue={initial?.title}
              placeholder="예: 저녁 무깊 함께 가실 분"
            />
          </label>
          <CalendarField
            name="startsAt"
            label="시작 일시"
            initial={initial?.startsAt ?? defaultStart}
            required
          />
          <CalendarField name="endsAt" label="종료 일시 · 선택" initial={initial?.endsAt} />
          <label>
            참가 정원
            <input
              name="capacity"
              type="number"
              min={1}
              max={10000}
              step={1}
              required
              defaultValue={initial?.capacity ?? 4}
            />
          </label>
          <label>
            집결 장소
            <input
              name="meetingPoint"
              maxLength={200}
              defaultValue={initial?.meetingPoint}
              placeholder="예: 텔레포트 타워, Discord 음성방"
            />
          </label>
        </div>
        {initial ? (
          <label>
            모집 상태
            <select name="status" defaultValue={initial.status}>
              <option value="SCHEDULED">모집 중</option>
              <option value="COMPLETED">진행 완료</option>
              <option value="CANCELLED">모집 취소</option>
            </select>
            <small>완료·취소 후에는 참가 기록을 보관합니다.</small>
          </label>
        ) : (
          <input type="hidden" name="status" value="SCHEDULED" />
        )}
        <label>
          준비물·진행 안내
          <textarea
            name="description"
            rows={5}
            maxLength={5000}
            defaultValue={initial?.description}
            placeholder="준비할 세팅이나 진행 방법을 적어주세요."
          />
        </label>
        <p className="party-form-note">
          한국 시간(KST) 기준입니다. 선택한 날짜와 시간을 확인한 뒤 등록해주세요. 시작 전에는 참가
          응답을 변경할 수 있습니다.
        </p>
        {readonly && <p>완료되거나 취소된 모집은 읽기 전용입니다.</p>}
      </AdminForm>
    </div>
  );
}

export function PartyParticipantForm({
  operationId,
  userId,
  status,
  updatedAt,
}: {
  operationId: string;
  userId: string;
  status: RSVPStatus;
  updatedAt: string;
}) {
  const [choice, setChoice] = useState({ version: updatedAt, action: "SET_STATUS" });
  const action = choice.version === updatedAt ? choice.action : "SET_STATUS";
  return (
    <AdminForm
      action={managePartyParticipantForm}
      submitLabel={action === "REMOVE" ? "명단에서 삭제" : "응답 변경 저장"}
    >
      <Fragment key={updatedAt}>
        <input type="hidden" name="operationId" value={operationId} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
        <label>
          관리 작업
          <select
            name="action"
            value={action}
            onChange={(event) => setChoice({ version: updatedAt, action: event.target.value })}
          >
            <option value="SET_STATUS">참가 응답 변경</option>
            <option value="REMOVE">명단에서 삭제</option>
          </select>
        </label>
        {action === "SET_STATUS" && (
          <label>
            참가 응답
            <select name="status" defaultValue={status}>
              <option value="GOING">참가</option>
              <option value="MAYBE">미정</option>
              <option value="UNAVAILABLE">참가 취소</option>
            </select>
          </label>
        )}
        {action === "REMOVE" && (
          <p className="party-form-note">이 파티의 참가 명단에서만 삭제합니다.</p>
        )}
      </Fragment>
    </AdminForm>
  );
}
