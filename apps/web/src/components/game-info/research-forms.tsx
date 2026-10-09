"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { ContentEditor } from "@/components/content/editor";
import { YouTubeField } from "@/components/content/presentation";
import {
  archiveDpsResearchForm,
  reviewDpsResearchForm,
  saveDpsResearchForm,
  verifyDpsResearchForm,
  type DpsActionState,
} from "@/app/db/actions";
import type { DpsResearchDetail } from "@/lib/dps-research";
import styles from "./research.module.css";

export interface DpsEditorData {
  initial: DpsResearchDetail | null;
  buildVersions: {
    id: string;
    title: string;
    version: number;
    visibility: "PRIVATE" | "HIVE" | "PUBLIC";
  }[];
}
const initialState: DpsActionState = { ok: false, message: "" };
const textFields = [
  "title",
  "summary",
  "buildVersionId",
  "composition",
  "gamePatch",
  "scenario",
  "trance",
  "platform",
  "target",
  "reloadPolicy",
  "hitPolicy",
  "buffPolicy",
  "procedure",
  "measuredAt",
] as const;
type FieldName = (typeof textFields)[number] | "durationSeconds" | "distanceMeters";
type TrialInput = { id: number; dps: string; note: string };

function Feedback({ state }: { state: DpsActionState }) {
  return state.message ? (
    <p
      role={state.ok ? "status" : "alert"}
      className={`${styles.feedback} ${state.ok ? "" : styles.error}`}
    >
      {state.message}
    </p>
  ) : null;
}
function useSavedNavigation(state: DpsActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      if (state.href) router.push(state.href);
      router.refresh();
    }
  }, [state.ok, state.href, router]);
}

export function DpsResearchForm({ data }: { data: DpsEditorData }) {
  const [base] = useState(data.initial);
  const [values, setValues] = useState<Record<FieldName, string>>(() => {
    const p = data.initial?.payload;
    return {
      ...Object.fromEntries(
        textFields.map((key) => [key, p?.[key] ?? (key === "platform" ? "PC" : "")]),
      ),
      durationSeconds: p?.durationSeconds?.toString() ?? "",
      distanceMeters: p?.distanceMeters?.toString() ?? "",
    } as Record<FieldName, string>;
  });
  const [trials, setTrials] = useState<TrialInput[]>(() =>
    data.initial?.payload.trials.length
      ? data.initial.payload.trials.map((trial, index) => ({
          id: index + 1,
          dps: trial.dps === null ? "" : String(trial.dps),
          note: trial.note,
        }))
      : [{ id: 1, dps: "", note: "" }],
  );
  const [nextTrialId, setNextTrialId] = useState(trials.length + 1);
  const [mediaReady, setMediaReady] = useState(false);
  const [state, action, pending] = useActionState(saveDpsResearchForm, initialState);
  const id = useId();
  useSavedNavigation(state);
  const disabled = pending || state.ok;
  const selectedBuild = data.buildVersions.find((build) => build.id === values.buildVersionId);
  const draftOnlyBuild = Boolean(values.buildVersionId && selectedBuild?.visibility !== "PUBLIC");
  function setValue(name: FieldName, value: string) {
    setValues((previous) => ({ ...previous, [name]: value }));
  }
  function input(
    name: FieldName,
    label: string,
    options: {
      required?: boolean;
      multiline?: boolean;
      max?: number;
      type?: "text" | "number" | "date";
      min?: number;
    } = {},
  ) {
    const shared = {
      id: `${id}-${name}`,
      name,
      value: values[name],
      required: options.required,
      disabled,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setValue(name, event.target.value),
    };
    return (
      <label className={options.multiline ? styles.wide : undefined} htmlFor={shared.id}>
        {label}
        {options.multiline ? (
          <textarea
            {...shared}
            rows={name === "procedure" ? 5 : 3}
            maxLength={options.max ?? 5000}
          />
        ) : (
          <input
            {...shared}
            type={options.type ?? "text"}
            maxLength={options.type ? undefined : (options.max ?? 100)}
            min={options.min}
            max={options.type === "number" ? options.max : undefined}
            step={options.type === "number" ? "any" : undefined}
          />
        )}
      </label>
    );
  }
  const submittedTrials = trials
    .filter((row) => row.dps.trim() || row.note.trim())
    .map((row) => ({ dps: row.dps.trim() ? Number(row.dps) : null, note: row.note }));
  return (
    <form action={action} className={styles.editor}>
      {base && (
        <>
          <input type="hidden" name="id" value={base.id} />
          <input type="hidden" name="expectedUpdatedAt" value={base.recordUpdatedAt} />
        </>
      )}
      <input type="hidden" name="trials" value={JSON.stringify(submittedTrials)} />
      <div className={styles.notice}>
        <strong>실제로 측정한 기록을 제출하는 공간입니다.</strong>
        <p>
          수치와 원본 근거, 같은 결과를 재현할 조건을 함께 적어 주세요. 게시 승인과 재현 확인은
          별도로 표시됩니다.
        </p>
      </div>
      {base && (
        <p className={styles.note}>
          v{base.version}을 바탕으로 새 버전을 저장합니다. 제출한 원본 버전은 보존됩니다. 새 버전을
          저장하면 이전 검토 신청은 취소되며 새 버전으로 다시 제출할 수 있습니다.
        </p>
      )}
      <fieldset disabled={disabled}>
        <section className={styles.section}>
          <h2>자료와 장비 구성</h2>
          <div className={styles.fields}>
            {input("title", "자료 제목", { required: true, max: 100 })}
            <label>
              연결할 빌드 버전 · 선택
              <select
                name="buildVersionId"
                value={values.buildVersionId}
                aria-describedby={draftOnlyBuild ? `${id}-build-scope` : undefined}
                onChange={(event) => setValue("buildVersionId", event.target.value)}
              >
                <option value="">직접 장비 구성을 작성합니다</option>
                {values.buildVersionId &&
                  !data.buildVersions.some((item) => item.id === values.buildVersionId) && (
                    <option value={values.buildVersionId}>
                      기존 연결 · 새 버전의 접근 권한 확인 필요
                    </option>
                  )}
                {data.buildVersions.map((build) => (
                  <option key={build.id} value={build.id}>
                    {build.title} · v{build.version}
                  </option>
                ))}
              </select>
              {draftOnlyBuild && (
                <small id={`${id}-build-scope`} className={styles.note}>
                  비공개·하이브 전용 빌드는 초안에만 연결할 수 있습니다. 제출하려면 공개 승인된
                  버전을 선택하거나 빌드 연결을 해제하고 장비 구성을 직접 적어 주세요.
                </small>
              )}
            </label>
            {input("summary", "자료 요약", { multiline: true, max: 2000 })}
            {input("composition", "사용한 무기·모듈·장비·감염물 구성", {
              multiline: true,
              required: !values.buildVersionId,
              max: 5000,
            })}
          </div>
        </section>
        <section className={styles.section}>
          <h2>측정 조건</h2>
          <p className={styles.note}>
            검토 제출에는 아래 측정 조건이 필요합니다. 아직 모르는 값은 초안에 비워 둘 수 있습니다.
          </p>
          <div className={styles.fields}>
            {input("gamePatch", "게임 패치·버전", { required: true, max: 100 })}
            {input("measuredAt", "측정일", { required: true, type: "date" })}
            {input("scenario", "시나리오", { required: true, max: 100 })}
            {input("trance", "트랜스 현상 · 선택", { max: 100 })}
            {input("platform", "플랫폼", { required: true, max: 100 })}
            {input("target", "측정 대상과 난이도", { required: true, max: 200 })}
            {input("durationSeconds", "측정 시간 · 초", {
              required: true,
              type: "number",
              min: 0,
              max: 3600,
            })}
            {input("distanceMeters", "사격 거리 · m", {
              required: true,
              type: "number",
              min: 0,
              max: 10000,
            })}
            {input("reloadPolicy", "재장전 포함 여부와 방식", { required: true, max: 500 })}
            {input("hitPolicy", "명중·약점·치명타 조건", { required: true, max: 500 })}
            {input("buffPolicy", "버프·음식·감염물과 발동 조건", {
              required: true,
              multiline: true,
              max: 2000,
            })}
            {input("procedure", "측정 시작·종료 기준과 재현 절차", {
              required: true,
              multiline: true,
              max: 5000,
            })}
          </div>
        </section>
        <section className={styles.section}>
          <h2>반복 측정 결과</h2>
          <p className={styles.note}>
            실측 DPS를 최대 20회 기록합니다. 대표 값은 입력한 수치의 평균입니다. 초안에는 측정
            메모를 먼저 남길 수 있습니다.
          </p>
          <div className={styles.trials}>
            {trials.map((trial, index) => (
              <div key={trial.id} className={styles.trial}>
                <span>{index + 1}회</span>
                <label htmlFor={`${id}-dps-${trial.id}`}>
                  실측 DPS
                  <input
                    id={`${id}-dps-${trial.id}`}
                    type="number"
                    min="0"
                    max="1000000000000"
                    step="any"
                    value={trial.dps}
                    required
                    onChange={(event) =>
                      setTrials((rows) =>
                        rows.map((row) =>
                          row.id === trial.id ? { ...row, dps: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label htmlFor={`${id}-note-${trial.id}`}>
                  측정 메모 · 선택
                  <input
                    id={`${id}-note-${trial.id}`}
                    value={trial.note}
                    maxLength={500}
                    onChange={(event) =>
                      setTrials((rows) =>
                        rows.map((row) =>
                          row.id === trial.id ? { ...row, note: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={disabled || trials.length === 1}
                  aria-label={`${index + 1}회 측정 삭제`}
                  onClick={() => setTrials((rows) => rows.filter((row) => row.id !== trial.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button button-quiet"
            disabled={disabled || trials.length >= 20}
            onClick={() => {
              setTrials((rows) => [...rows, { id: nextTrialId, dps: "", note: "" }]);
              setNextTrialId((value) => value + 1);
            }}
          >
            <Plus size={15} />
            측정 추가
          </button>
        </section>
        <section className={styles.section}>
          <h2>원본 근거와 설명</h2>
          <p className={styles.note}>
            검토 제출에는 측정 결과가 보이는 이미지 또는 원본 유튜브 영상이 필요합니다. 이미지는
            원하는 문단 사이에 넣을 수 있습니다.
          </p>
          <ContentEditor
            name="evidenceDocument"
            textName="evidenceText"
            initialDocument={base?.payload.evidenceDocument ?? null}
            initialText={base?.payload.evidenceText ?? ""}
            maxTextLength={20000}
            onReadyChange={setMediaReady}
            disabled={disabled}
          />
          <YouTubeField initialUrl={base?.payload.youtubeUrl ?? null} disabled={disabled} />
        </section>
      </fieldset>
      <div className={styles.submit}>
        <p>게시 승인되면 게임 정보에서 누구나 볼 수 있습니다.</p>
        <div className={styles.buttons}>
          <button
            type="submit"
            name="action"
            value="DRAFT"
            formNoValidate
            className="button button-quiet"
            disabled={disabled || !mediaReady}
          >
            초안 저장
          </button>
          <button
            type="submit"
            name="action"
            value="SUBMIT"
            className="button button-primary"
            disabled={disabled || !mediaReady}
          >
            {pending ? "저장 중…" : "게시 검토 요청"}
          </button>
          <Link className="button button-quiet" href="/db/mine">
            내 자료로
          </Link>
        </div>
      </div>
      <Feedback state={state} />
    </form>
  );
}

function ReviewFields({ record }: { record: DpsResearchDetail }) {
  const [note, setNote] = useState(record.reviewNote);
  const [state, action, pending] = useActionState(reviewDpsResearchForm, initialState);
  useSavedNavigation(state);
  const waiting = ["PENDING", "CHANGES_REQUESTED"].includes(record.status);
  return (
    <form action={action} className={styles.controlForm}>
      <h2>게시 검토 · v{record.version}</h2>
      <input type="hidden" name="versionId" value={record.versionId} />
      <input type="hidden" name="expectedUpdatedAt" value={record.updatedAt} />
      <label>
        작성자에게 전달할 검토 의견
        <textarea
          name="note"
          rows={4}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={pending || state.ok}
        />
      </label>
      <p className={styles.note}>
        승인하면 이 원본 버전과 근거가 누구에게나 공개됩니다. 게시 승인은 재현 확인 배지와
        별도입니다.
      </p>
      <div className={styles.buttons}>
        {waiting ? (
          <>
            <button
              name="decision"
              value="APPROVE"
              className="button button-primary"
              disabled={pending || state.ok}
            >
              게시 승인
            </button>
            <button
              name="decision"
              value="CHANGES_REQUESTED"
              className="button button-quiet"
              disabled={pending || state.ok}
            >
              보완 요청
            </button>
            <button
              name="decision"
              value="REJECT"
              className="button button-quiet"
              disabled={pending || state.ok}
            >
              반려
            </button>
          </>
        ) : (
          <button
            name="decision"
            value="REVOKE"
            className="button button-quiet"
            disabled={pending || state.ok}
          >
            게시 중단
          </button>
        )}
      </div>
      <Feedback state={state} />
    </form>
  );
}
export function DpsReviewForm({
  record,
  administrator,
}: {
  record: DpsResearchDetail;
  administrator: boolean;
}) {
  return administrator &&
    record.canReview &&
    ["PENDING", "CHANGES_REQUESTED", "APPROVED"].includes(record.status) ? (
    <ReviewFields key={`${record.versionId}:${record.updatedAt}`} record={record} />
  ) : null;
}
function VerificationFields({
  record,
  reviewerId,
}: {
  record: DpsResearchDetail;
  reviewerId?: string;
}) {
  const previous = record.verifications.find((item) => item.reviewerId === reviewerId);
  const [confirmed, setConfirmed] = useState(previous?.confirmed ?? false);
  const [note, setNote] = useState(previous?.note ?? "");
  const [state, action, pending] = useActionState(verifyDpsResearchForm, initialState);
  useSavedNavigation(state);
  return (
    <form action={action} className={styles.controlForm}>
      <h2>재현 검토 · v{record.version}</h2>
      <input type="hidden" name="versionId" value={record.versionId} />
      <input type="hidden" name="expectedUpdatedAt" value={record.updatedAt} />
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          name="confirmed"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={pending || state.ok}
        />
        원본 근거와 재현 조건을 확인했습니다.
      </label>
      <label>
        확인 내용 또는 철회 사유
        <textarea
          name="note"
          required
          minLength={2}
          maxLength={1000}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={pending || state.ok}
        />
      </label>
      <p className={styles.note}>
        작성자를 제외한 검토자 2명과 반복 측정 3회 이상이 모이면 재현 확인 배지가 표시됩니다. 확인
        철회는 체크를 해제하고 사유를 적어 주세요.
      </p>
      <button className="button button-secondary" disabled={pending || state.ok}>
        재현 검토 저장
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function DpsVerificationForm({
  record,
  reviewerId,
}: {
  record: DpsResearchDetail;
  reviewerId?: string;
}) {
  return record.canVerify &&
    !record.isOwner &&
    record.status === "APPROVED" &&
    !record.archivedAt &&
    !record.hiddenAt ? (
    <VerificationFields
      key={`${record.versionId}:${record.updatedAt}`}
      record={record}
      reviewerId={reviewerId}
    />
  ) : null;
}
function ArchiveFields({ record }: { record: DpsResearchDetail }) {
  const [state, action, pending] = useActionState(archiveDpsResearchForm, initialState);
  useSavedNavigation(state);
  return (
    <form action={action} className={styles.archive}>
      <input type="hidden" name="id" value={record.id} />
      <input type="hidden" name="expectedUpdatedAt" value={record.recordUpdatedAt} />
      <p>보관하면 공개 게시와 접근 링크가 숨겨지고 원본 버전은 남습니다.</p>
      <button className="button button-quiet" disabled={pending || state.ok}>
        자료 보관
      </button>
      <Feedback state={state} />
    </form>
  );
}
export function DpsArchiveForm({ record }: { record: DpsResearchDetail }) {
  return record.isOwner && !record.archivedAt ? (
    <ArchiveFields key={`${record.id}:${record.recordUpdatedAt}`} record={record} />
  ) : null;
}
