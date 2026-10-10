"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@uniz/ui";
import {
  createEmptyPlannerLoadout,
  parsePlannerLoadout,
  PLANNER_CATEGORIES,
  PLANNER_COUNT_STORAGE_LIMIT,
  PLANNER_MAX_ENTRIES,
  PLANNER_MAX_ROLLS,
  PLANNER_REFERENCE_CATALOG,
  PLANNER_ROLL_STORAGE_LIMIT,
  type PlannerContext,
  type PlannerEntry,
  type PlannerLoadout,
  type PlannerRoll,
} from "@uniz/build-engine";
import { saveBuildPlanner } from "@/app/lab/actions";
import { ContentEditor } from "@/components/content/editor";
import { YouTubeField } from "@/components/content/presentation";
import { parseYouTubeUrl } from "@/lib/content-document";
import type {
  BuildVisibility,
  PlannerActionState,
  PlannerBuildDetail,
} from "@/lib/data/build-planner-types";
import { categoryLabels, scenarioLabels, visibilityLabels, SourceEvidence } from "./presentation";
import { PlannerFieldBadge, PlannerRequiredFields, PlannerSaveFeedback } from "./save-feedback";
import {
  buildTitleError,
  getPlannerSaveBlockers,
  type PlannerSaveBlocker,
} from "./save-requirements";
import "./editor.css";

type CountField = "tier" | "stars" | "calibration" | "level";
type DraftRoll = Omit<PlannerRoll, "value"> & { value: string };
type DraftEntry = Omit<PlannerEntry, "instance"> & {
  instance: Record<CountField, string> & { rolls: DraftRoll[] };
};
type DraftLoadout = Omit<PlannerLoadout, "entries"> & { entries: DraftEntry[] };
const countLabels: Record<CountField, string> = {
  tier: "티어",
  stars: "별",
  calibration: "보정 단계",
  level: "레벨",
};
const countFields: CountField[] = ["tier", "stars", "calibration", "level"];

function makeDraft(loadout: PlannerLoadout): DraftLoadout {
  return {
    ...loadout,
    context: { ...loadout.context },
    entries: loadout.entries.map((entry) => ({
      ...entry,
      instance: {
        tier: entry.instance.tier === null ? "" : String(entry.instance.tier),
        stars: entry.instance.stars === null ? "" : String(entry.instance.stars),
        calibration: entry.instance.calibration === null ? "" : String(entry.instance.calibration),
        level: entry.instance.level === null ? "" : String(entry.instance.level),
        rolls: entry.instance.rolls.map((roll) => ({
          ...roll,
          value: roll.value === null ? "" : String(roll.value),
        })),
      },
    })),
  };
}

/** Keep numeric text until validation so a malformed value can never serialize as null. */
function readNumber(text: string, integer: boolean): number | null {
  const value = text.trim();
  if (!value) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
    throw new Error("숫자를 확인해주세요. 미확인 값은 비워둘 수 있습니다.");
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && (!Number.isSafeInteger(number) || number < 0)))
    throw new Error(
      integer
        ? "티어·별·보정 단계·레벨에는 0 이상의 정수를 입력해주세요."
        : "유효한 부옵션 숫자를 입력해주세요.",
    );
  return number;
}

function prepareDraft(draft: DraftLoadout): { loadout: PlannerLoadout | null; message: string } {
  try {
    const entries = draft.entries.map((entry): PlannerEntry => ({
      ...entry,
      instance: {
        tier: readNumber(entry.instance.tier, true),
        stars: readNumber(entry.instance.stars, true),
        calibration: readNumber(entry.instance.calibration, true),
        level: readNumber(entry.instance.level, true),
        rolls: entry.instance.rolls.map((roll) => ({
          ...roll,
          value: readNumber(roll.value, false),
        })),
      },
    }));
    try {
      return {
        loadout: parsePlannerLoadout({
          ...draft,
          context: {
            ...draft.context,
            gamePatch: draft.context.gamePatch?.trim() || null,
            characterClass: draft.context.characterClass?.trim() || null,
          },
          entries,
        }),
        message: "",
      };
    } catch {
      return {
        loadout: null,
        message:
          "항목 이름·입력 범위·연결을 확인해주세요. 부옵션을 추가했다면 이름도 입력해주세요.",
      };
    }
  } catch (error) {
    return {
      loadout: null,
      message: error instanceof Error ? error.message : "입력한 숫자를 확인해주세요.",
    };
  }
}

function validNumericText(value: string, integer: boolean) {
  try {
    readNumber(value, integer);
    return true;
  } catch {
    return false;
  }
}

function draftSaveBlockers(draft: DraftLoadout): PlannerSaveBlocker[] {
  const blockers: PlannerSaveBlocker[] = [];
  draft.entries.forEach((entry, index) => {
    const label = `${categoryLabels[entry.category]} ${index + 1}`;
    if (!entry.name.trim()) {
      blockers.push({
        message: `${label}의 항목 이름을 입력하거나 사용하지 않는 항목을 삭제해주세요.`,
        targetId: `planner-entry-name-${entry.id}`,
      });
    }
    if (
      entry.reference &&
      !PLANNER_REFERENCE_CATALOG.some(
        (reference) =>
          reference.category === entry.category &&
          reference.recordId === entry.reference!.recordId &&
          reference.revision === entry.reference!.revision &&
          reference.name === entry.name,
      )
    ) {
      blockers.push({
        message: `${label}의 이전 참고 자료를 현재 항목으로 다시 선택하거나 직접 입력으로 전환해주세요.`,
        targetId: `planner-entry-reference-${entry.id}`,
      });
    }
    countFields.forEach((field) => {
      try {
        const value = readNumber(entry.instance[field], true);
        if (value !== null && value > PLANNER_COUNT_STORAGE_LIMIT) throw new Error();
      } catch {
        blockers.push({
          message: `${label}의 ${countLabels[field]}에 저장 가능한 0 이상의 정수를 입력해주세요. 모르는 수치는 비워두어도 됩니다.`,
          targetId: `planner-entry-${field}-${entry.id}`,
        });
      }
    });
    entry.instance.rolls.forEach((roll, rollIndex) => {
      if (!roll.label.trim()) {
        blockers.push({
          message: `${label}의 부옵션 ${rollIndex + 1} 이름을 입력하거나 사용하지 않는 부옵션을 삭제해주세요.`,
          targetId: `planner-roll-name-${entry.id}-${rollIndex}`,
        });
      }
      try {
        const value = readNumber(roll.value, false);
        if (value !== null && Math.abs(value) > PLANNER_ROLL_STORAGE_LIMIT) throw new Error();
      } catch {
        blockers.push({
          message: `${label}의 부옵션 ${rollIndex + 1} 값에 저장 가능한 숫자를 입력해주세요. 모르는 수치는 비워두어도 됩니다.`,
          targetId: `planner-roll-value-${entry.id}-${rollIndex}`,
        });
      }
    });
  });
  return blockers;
}

export function LegacyPlannerEditor({
  initial,
  preview = false,
}: {
  initial?: PlannerBuildDetail;
  preview?: boolean;
}) {
  const router = useRouter();
  // A refreshed server prop must not pair this unsaved draft with a newer save baseline.
  const [baseBuildId] = useState(() => initial?.id ?? null);
  const [baseVersionStamp] = useState(() => initial?.updatedAt ?? null);
  const [baseSourceVersion] = useState(() => initial?.selectedVersion.version ?? null);
  const [unavailableSnapshot] = useState(() =>
    Boolean(initial && initial.selectedVersion.loadout?.schemaVersion !== "uniz-planner.v1"),
  );
  const [draft, setDraft] = useState(() =>
    makeDraft(
      initial?.selectedVersion.loadout?.schemaVersion === "uniz-planner.v1"
        ? initial.selectedVersion.loadout
        : createEmptyPlannerLoadout(),
    ),
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<BuildVisibility>(initial?.visibility ?? "PRIVATE");
  const [notes, setNotes] = useState("");
  const [mediaReady, setMediaReady] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState(initial?.selectedVersion.youtubeUrl ?? "");
  const prepared = prepareDraft(draft);
  const titleError = buildTitleError(title);
  const draftBlockers = draftSaveBlockers(draft);
  let youtubeError = "";
  try {
    parseYouTubeUrl(youtubeUrl);
  } catch {
    youtubeError =
      "참고 영상의 유튜브 링크를 확인하거나 링크를 비워주세요. 영상은 선택 사항입니다.";
  }
  const blockers = getPlannerSaveBlockers({
    title,
    preview,
    mediaReady,
    extraBlockers: [
      ...(unavailableSnapshot
        ? [
            {
              message:
                "이 버전은 현재 편집 화면으로 불러올 수 없습니다. 편집 가능한 버전에서 저장해주세요.",
            },
          ]
        : []),
      ...draftBlockers,
      ...(youtubeError ? [{ message: youtubeError, targetId: "planner-description" }] : []),
      ...(!prepared.loadout && !draftBlockers.length
        ? [{ message: prepared.message, targetId: "planner-entries" }]
        : []),
    ],
  });
  const [state, submit, pending] = useActionState<PlannerActionState, FormData>(
    async (previous, form) => {
      if (previous.ok) return previous;
      if (preview || unavailableSnapshot)
        return { ok: false, message: "실제 계정의 편집 가능한 빌드에서 저장해주세요." };
      if (titleError) return { ok: false, message: titleError };
      if (youtubeError) return { ok: false, message: youtubeError };
      if (!mediaReady || form.get("contentMediaReady") === "false")
        return {
          ok: false,
          message: "본문의 이미지 준비 상태를 확인해 주세요. 입력은 유지됩니다.",
        };
      if (!prepared.loadout) return { ok: false, message: prepared.message };
      try {
        return await saveBuildPlanner(previous, form);
      } catch {
        return {
          ok: false,
          message:
            "저장하지 못했습니다. 입력은 그대로 유지됩니다. 연결을 확인한 뒤 다시 시도해주세요.",
        };
      }
    },
    { ok: false, message: "" },
  );
  useEffect(() => {
    if (state.ok && state.href) router.push(state.href);
  }, [state.ok, state.href, router]);

  function updateEntry(id: string, change: (entry: DraftEntry) => DraftEntry) {
    setDraft((previous) => ({
      ...previous,
      entries: previous.entries.map((entry) => (entry.id === id ? change(entry) : entry)),
    }));
  }
  function addEntry(category: PlannerEntry["category"]) {
    const id = crypto.randomUUID();
    setDraft((previous) =>
      previous.entries.length >= PLANNER_MAX_ENTRIES
        ? previous
        : {
            ...previous,
            entries: [
              ...previous.entries,
              {
                id,
                category,
                slotLabel: "",
                name: "",
                linkedEntryId: null,
                reference: null,
                instance: { tier: "", stars: "", calibration: "", level: "", rolls: [] },
                notes: "",
              },
            ],
          },
    );
  }
  function removeEntry(id: string) {
    setDraft((previous) => ({
      ...previous,
      entries: previous.entries
        .filter((entry) => entry.id !== id)
        .map((entry) => (entry.linkedEntryId === id ? { ...entry, linkedEntryId: null } : entry)),
    }));
  }
  function updateContext<K extends keyof PlannerContext>(key: K, value: PlannerContext[K]) {
    setDraft((previous) => ({ ...previous, context: { ...previous.context, [key]: value } }));
  }
  function eligibleLink(source: string, target: string) {
    const visited = new Set([source]);
    let cursor: string | null = target;
    while (cursor) {
      if (visited.has(cursor)) return false;
      visited.add(cursor);
      cursor = draft.entries.find((entry) => entry.id === cursor)?.linkedEntryId ?? null;
    }
    return true;
  }

  return (
    <form action={submit} className="planner-editor">
      <fieldset
        className="planner-editor-fieldset"
        disabled={pending || state.ok || unavailableSnapshot}
      >
        {baseBuildId && (
          <>
            <input type="hidden" name="buildId" value={baseBuildId} />
            <input type="hidden" name="expectedUpdatedAt" value={baseVersionStamp ?? ""} />
          </>
        )}
        <input
          type="hidden"
          name="loadout"
          value={prepared.loadout ? JSON.stringify(prepared.loadout) : ""}
        />
        <Card>
          <h2>빌드의 이름과 공개 범위</h2>
          <PlannerRequiredFields legacy />
          <p className="planner-editor-help">
            다음에 다시 찾을 수 있도록 이름을 정해주세요. 하이브 공유와 전체 공개는 관리자 승인 후
            적용됩니다. 승인 전에는 기존 공유 버전이 유지됩니다.
          </p>
          <div className="planner-field-grid">
            <label>
              빌드 이름
              <PlannerFieldBadge required />
              <input
                id="planner-title"
                name="title"
                required
                minLength={2}
                maxLength={100}
                placeholder="예: 다음 시즌을 위한 탐험 구성"
                value={title}
                aria-invalid={Boolean(titleError)}
                aria-describedby="planner-title-help"
                onChange={(event) => setTitle(event.target.value)}
              />
              <small
                id="planner-title-help"
                className={titleError ? "planner-field-error" : undefined}
              >
                {titleError ?? "앞뒤 공백을 제외하고 2~100자로 입력해주세요."}
              </small>
            </label>
            <label>
              공개 범위
              <select
                name="visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as BuildVisibility)}
              >
                {Object.entries(visibilityLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {key === "PRIVATE" ? label : `${label} · 승인 요청`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>
        <Card>
          <h2>
            플레이 조건 <PlannerFieldBadge />
          </h2>
          <p className="planner-editor-help">아직 모르는 조건은 비워두어도 됩니다.</p>
          <div className="planner-field-grid">
            <label>
              게임 버전
              <input
                maxLength={120}
                value={draft.context.gamePatch ?? ""}
                placeholder="게임에서 확인한 버전"
                onChange={(event) => updateContext("gamePatch", event.target.value || null)}
              />
            </label>
            <label>
              시나리오
              <select
                value={draft.context.scenarioKey ?? ""}
                onChange={(event) =>
                  updateContext(
                    "scenarioKey",
                    (event.target.value || null) as PlannerContext["scenarioKey"],
                  )
                }
              >
                <option value="">미기록</option>
                {Object.entries(scenarioLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              플레이 모드
              <select
                value={draft.context.mode ?? ""}
                onChange={(event) =>
                  updateContext("mode", (event.target.value || null) as PlannerContext["mode"])
                }
              >
                <option value="">미기록</option>
                <option value="PVE">PVE</option>
                <option value="PVP">PVP</option>
              </select>
            </label>
            <label>
              플랫폼
              <select
                value={draft.context.platform ?? ""}
                onChange={(event) =>
                  updateContext(
                    "platform",
                    (event.target.value || null) as PlannerContext["platform"],
                  )
                }
              >
                <option value="">미기록</option>
                <option value="PC">PC</option>
                <option value="MOBILE">모바일</option>
              </select>
            </label>
            <label>
              클래스
              <input
                maxLength={120}
                value={draft.context.characterClass ?? ""}
                placeholder="사용하는 클래스 이름"
                onChange={(event) => updateContext("characterClass", event.target.value || null)}
              />
            </label>
          </div>
        </Card>
        <Card>
          <div className="planner-editor-heading">
            <h2>장비 구성 · {draft.entries.length}개</h2>
            <span className="planner-entry-category">직접 기록한 구성</span>
          </div>
          <p className="planner-editor-help" id="planner-entries" tabIndex={-1}>
            게임에서 사용하는 장비와 옵션을 추가하세요. 장착 위치와 수량은 직접 기록하며, 미확인
            수치는 비워둘 수 있습니다. 장비 추가는 선택이며, 추가한 항목의 이름은 필수입니다.
          </p>
          <div className="planner-entry-list">
            {!draft.entries.length && (
              <div className="planner-empty">
                <strong>어떤 장비로 시작할까요?</strong>
                <p>아래에서 무기·방어구·모듈·감염물 등을 추가해주세요.</p>
              </div>
            )}
            {draft.entries.map((entry, index) => {
              const references = PLANNER_REFERENCE_CATALOG.filter(
                (item) => item.category === entry.category,
              );
              const currentReference =
                entry.reference &&
                references.find(
                  (item) =>
                    item.recordId === entry.reference!.recordId &&
                    item.revision === entry.reference!.revision &&
                    item.name === entry.name,
                );
              const previousReference = Boolean(entry.reference && !currentReference);
              const previousReferenceOption = `previous-reference:${entry.id}`;
              const withLink =
                entry.category === "MOD" ||
                entry.category === "CALIBRATION" ||
                Boolean(entry.linkedEntryId);
              return (
                <article className="planner-entry" key={entry.id}>
                  <div className="planner-entry-heading">
                    <h3>
                      <span className="planner-entry-category">
                        {categoryLabels[entry.category]} {index + 1}
                      </span>
                      {entry.name || "새 항목"}
                    </h3>
                    <button
                      type="button"
                      className="planner-remove"
                      aria-label={`${categoryLabels[entry.category]} ${index + 1} 삭제`}
                      onClick={() => removeEntry(entry.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" /> 삭제
                    </button>
                  </div>
                  <div className="planner-field-grid">
                    <label>
                      입력 방법
                      <select
                        id={`planner-entry-reference-${entry.id}`}
                        value={
                          previousReference
                            ? previousReferenceOption
                            : (entry.reference?.recordId ?? "")
                        }
                        aria-describedby={
                          previousReference ? `reference-notice-${entry.id}` : undefined
                        }
                        onChange={(event) => {
                          if (event.target.value === previousReferenceOption) return;
                          const reference = references.find(
                            (item) => item.recordId === event.target.value,
                          );
                          updateEntry(entry.id, (current) => ({
                            ...current,
                            reference: reference
                              ? { recordId: reference.recordId, revision: reference.revision }
                              : null,
                            name: reference?.name ?? current.name,
                          }));
                        }}
                      >
                        <option value="">직접 입력</option>
                        {previousReference && (
                          <option value={previousReferenceOption} disabled>
                            {entry.name} · 이전 참고 자료
                          </option>
                        )}
                        {references.map((reference) => (
                          <option key={reference.recordId} value={reference.recordId}>
                            {reference.name} · 공식 참고
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      항목 이름
                      <PlannerFieldBadge required />
                      <input
                        id={`planner-entry-name-${entry.id}`}
                        required
                        maxLength={120}
                        value={entry.name}
                        aria-invalid={!entry.name.trim()}
                        readOnly={Boolean(entry.reference)}
                        placeholder={`${categoryLabels[entry.category]} 이름`}
                        onChange={(event) =>
                          updateEntry(entry.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      장착 위치
                      <input
                        maxLength={60}
                        value={entry.slotLabel}
                        placeholder="게임에서 사용하는 위치 또는 구분"
                        onChange={(event) =>
                          updateEntry(entry.id, (current) => ({
                            ...current,
                            slotLabel: event.target.value,
                          }))
                        }
                      />
                    </label>
                    {withLink && (
                      <label>
                        연결할 장비
                        <select
                          value={entry.linkedEntryId ?? ""}
                          onChange={(event) =>
                            updateEntry(entry.id, (current) => ({
                              ...current,
                              linkedEntryId: event.target.value || null,
                            }))
                          }
                        >
                          <option value="">연결하지 않음</option>
                          {draft.entries
                            .filter((target) => eligibleLink(entry.id, target.id))
                            .map((target) => (
                              <option key={target.id} value={target.id}>
                                {target.name || `${categoryLabels[target.category]} 항목`}
                                {target.slotLabel ? ` · ${target.slotLabel}` : ""}
                              </option>
                            ))}
                        </select>
                        <small>구성 안의 연결을 기록합니다. 실제 장착 호환성은 미확인입니다.</small>
                      </label>
                    )}
                  </div>
                  {previousReference && (
                    <p
                      className="planner-evidence"
                      id={`reference-notice-${entry.id}`}
                      role="status"
                    >
                      이전 참고 자료입니다. 현재 참고 항목을 다시 선택하거나 직접 입력으로
                      전환해주세요.
                    </p>
                  )}
                  <div className="planner-entry-numbers">
                    {countFields.map((field) => (
                      <label key={field}>
                        {countLabels[field]}
                        <input
                          id={`planner-entry-${field}-${entry.id}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={30}
                          placeholder="미기록"
                          aria-invalid={!validNumericText(entry.instance[field], true)}
                          value={entry.instance[field]}
                          onChange={(event) =>
                            updateEntry(entry.id, (current) => ({
                              ...current,
                              instance: { ...current.instance, [field]: event.target.value },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {entry.category === "MOD" || entry.instance.rolls.length > 0 ? (
                    <div className="planner-rolls">
                      <div className="planner-roll-heading">
                        <h3>부옵션 기록</h3>
                        <button
                          type="button"
                          className="planner-remove"
                          disabled={entry.instance.rolls.length >= PLANNER_MAX_ROLLS}
                          onClick={() =>
                            updateEntry(entry.id, (current) => ({
                              ...current,
                              instance: {
                                ...current.instance,
                                rolls: [
                                  ...current.instance.rolls,
                                  { label: "", value: "", unit: null },
                                ],
                              },
                            }))
                          }
                        >
                          <Plus size={14} aria-hidden="true" /> 부옵션 추가
                        </button>
                      </div>
                      {entry.instance.rolls.map((roll, rollIndex) => (
                        <div className="planner-roll-row" key={rollIndex}>
                          <label>
                            부옵션 이름
                            <PlannerFieldBadge required />
                            <input
                              id={`planner-roll-name-${entry.id}-${rollIndex}`}
                              required
                              maxLength={60}
                              value={roll.label}
                              aria-invalid={!roll.label.trim()}
                              placeholder="게임에서 확인한 옵션"
                              onChange={(event) =>
                                updateEntry(entry.id, (current) => ({
                                  ...current,
                                  instance: {
                                    ...current.instance,
                                    rolls: current.instance.rolls.map((item, itemIndex) =>
                                      itemIndex === rollIndex
                                        ? { ...item, label: event.target.value }
                                        : item,
                                    ),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            기록한 값
                            <input
                              id={`planner-roll-value-${entry.id}-${rollIndex}`}
                              type="text"
                              inputMode="decimal"
                              maxLength={30}
                              placeholder="미기록"
                              aria-invalid={!validNumericText(roll.value, false)}
                              value={roll.value}
                              onChange={(event) =>
                                updateEntry(entry.id, (current) => ({
                                  ...current,
                                  instance: {
                                    ...current.instance,
                                    rolls: current.instance.rolls.map((item, itemIndex) =>
                                      itemIndex === rollIndex
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            단위
                            <select
                              value={roll.unit ?? ""}
                              onChange={(event) =>
                                updateEntry(entry.id, (current) => ({
                                  ...current,
                                  instance: {
                                    ...current.instance,
                                    rolls: current.instance.rolls.map((item, itemIndex) =>
                                      itemIndex === rollIndex
                                        ? {
                                            ...item,
                                            unit: (event.target.value ||
                                              null) as PlannerRoll["unit"],
                                          }
                                        : item,
                                    ),
                                  },
                                }))
                              }
                            >
                              <option value="">미기록</option>
                              <option value="PERCENT">%</option>
                              <option value="FLAT">고정값</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            className="planner-remove"
                            aria-label={`${entry.name || categoryLabels[entry.category]} 부옵션 ${rollIndex + 1} 삭제`}
                            onClick={() =>
                              updateEntry(entry.id, (current) => ({
                                ...current,
                                instance: {
                                  ...current.instance,
                                  rolls: current.instance.rolls.filter(
                                    (_item, itemIndex) => itemIndex !== rollIndex,
                                  ),
                                },
                              }))
                            }
                          >
                            <Trash2 size={14} aria-hidden="true" /> 삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <label>
                    항목 메모
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={entry.notes}
                      placeholder="이 장비를 쓰는 이유와 확인할 내용을 기록하세요."
                      onChange={(event) =>
                        updateEntry(entry.id, (current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <SourceEvidence entry={entry} />
                </article>
              );
            })}
          </div>
          <div className="planner-category-buttons" aria-label="장비 항목 추가">
            {PLANNER_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                disabled={draft.entries.length >= PLANNER_MAX_ENTRIES}
                onClick={() => addEntry(category)}
              >
                <Plus size={14} aria-hidden="true" /> {categoryLabels[category]}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <h2 id="planner-description" tabIndex={-1}>
            빌드 설명 <PlannerFieldBadge />
          </h2>
          <ContentEditor
            textName="description"
            initialDocument={initial?.selectedVersion.bodyDocument ?? null}
            initialText={description}
            maxTextLength={5000}
            onChange={(_document, text) => setDescription(text)}
            onReadyChange={setMediaReady}
            disabled={pending || state.ok || preview}
          />
          <YouTubeField
            initialUrl={initial?.selectedVersion.youtubeUrl ?? null}
            onChange={setYoutubeUrl}
            disabled={pending || state.ok || preview}
          />
        </Card>
        <Card>
          <h2>
            {baseBuildId ? "이번 버전의 기록" : "첫 버전의 기록"} <PlannerFieldBadge />
          </h2>
          <label>
            변경 메모
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              placeholder="바꾼 장비나 다음에 확인할 내용을 적어주세요."
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </Card>
        <div className="planner-editor-footer">
          <p>
            {preview
              ? "미리보기에서는 입력을 둘러볼 수 있습니다. 저장하려면 승인된 Discord 계정으로 로그인해주세요."
              : baseBuildId
                ? `v${baseSourceVersion}을 바탕으로 새 버전을 저장합니다. 이전 기록은 그대로 유지됩니다.`
                : "장비 구성과 플레이 조건을 함께 저장합니다."}
          </p>
          <PlannerSaveFeedback
            id="planner-save-status"
            blockers={blockers}
            pending={pending}
            saved={state.ok}
          />
          <button
            type="submit"
            className="button button-primary"
            aria-describedby="planner-save-status"
            disabled={blockers.length > 0 || pending || state.ok}
          >
            {state.ok
              ? "저장 완료"
              : pending
                ? "저장 중…"
                : baseBuildId
                  ? "새 버전으로 저장"
                  : "빌드 저장"}
          </button>
        </div>
      </fieldset>
      {unavailableSnapshot && (
        <p className="planner-form-message is-error" role="alert">
          이 버전은 현재 편집 화면으로 불러올 수 없습니다. 기존 기록을 보존하고 있습니다.
        </p>
      )}
      {state.message && (
        <p
          className={`planner-form-message ${state.ok ? "" : "is-error"}`}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export const PlannerEditor = LegacyPlannerEditor;
