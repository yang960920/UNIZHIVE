"use client";

import { useEffect, useRef, useState } from "react";
import {
  SEASON_STATUSES,
  SEASON_SERVER_TYPES,
  TRANCE_PHENOMENA,
  getScenarioPhaseTemplate,
  getSeasonServerTypeLabel,
  getTrancePhenomenonLabel,
  type SeasonServerType,
  type TrancePhenomenon,
} from "@uniz/domain";
import { seasonStatusLabels } from "@/lib/admin-format";
import {
  SCENARIO_PRESETS,
  getScenarioPreset,
  type ScenarioPresetKey,
} from "@/lib/scenario-presets";
import type { SeasonServerSelection } from "@/lib/season-selection";
import type { SeasonRecord } from "@/lib/server/season-administration";
import { AdminForm } from "../admin-form";
import { CalendarField } from "../calendar-field";
import { saveSeasonAdministration } from "./actions";

export function SeasonSetupForm({
  initial,
  season,
  action = saveSeasonAdministration,
  submitLabel,
  request = false,
  canManageMigration = false,
}: {
  initial?: SeasonServerSelection | null;
  season?: SeasonRecord;
  action?: typeof saveSeasonAdministration;
  submitLabel?: string;
  request?: boolean;
  canManageMigration?: boolean;
}) {
  const initialKey = initial ? (initial.scenarioKey ?? "") : "DEVIATION";
  const initialNumber = initial ? (initial.serverNumber ?? "") : "0000";
  const initialRegion = initial?.region ?? "한국";
  const [scenarioKey, setScenarioKey] = useState<ScenarioPresetKey | "">(initialKey);
  const [serverNumber, setServerNumber] = useState(initialNumber);
  const [region, setRegion] = useState(initialRegion);
  const [settlementEnabled, setSettlementEnabled] = useState(Boolean(season?.settlementAt));
  const initialServerType = season ? (season.serverType ?? "UNKNOWN") : "SEASONAL";
  const initialTrance = season ? (season.trancePhenomenon ?? "UNKNOWN") : "NONE";
  const [serverType, setServerType] = useState<SeasonServerType>(initialServerType);
  const [trancePhenomenon, setTrancePhenomenon] = useState<TrancePhenomenon>(initialTrance);
  const [migrationOpen, setMigrationOpen] = useState(season?.migrationOpen ?? false);
  const permanent = serverType === "PERMANENT";
  const fields = useRef<HTMLDivElement>(null);
  const preset = getScenarioPreset(scenarioKey);
  const phaseTemplate = preset ? getScenarioPhaseTemplate(preset.slug) : null;
  const statuses = season
    ? SEASON_STATUSES.filter(
        (status) =>
          status === season.status ||
          (season.status !== "ARCHIVED" &&
            (permanent
              ? status === (season.status === "PLANNED" ? "ACTIVE" : "ARCHIVED")
              : SEASON_STATUSES.indexOf(status) === SEASON_STATUSES.indexOf(season.status) + 1)),
      )
    : [];
  useEffect(() => {
    const form = fields.current?.closest("form");
    function reset() {
      setScenarioKey(initialKey);
      setServerNumber(initialNumber);
      setRegion(initialRegion);
      setSettlementEnabled(Boolean(season?.settlementAt));
      setServerType(initialServerType);
      setTrancePhenomenon(initialTrance);
      setMigrationOpen(season?.migrationOpen ?? false);
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [
    initialKey,
    initialNumber,
    initialRegion,
    season?.settlementAt,
    initialServerType,
    initialTrance,
    season?.migrationOpen,
  ]);
  return (
    <AdminForm
      action={action}
      submitLabel={submitLabel ?? (season ? "시즌 정보 저장" : "시즌 만들기")}
    >
      <input
        type="hidden"
        name="action"
        value={season ? "SAVE_SEASON_SETUP" : "CREATE_SEASON_SETUP"}
      />
      {season && (
        <>
          <input type="hidden" name="id" value={season.id} />
          <input type="hidden" name="expectedUpdatedAt" value={season.updatedAt} />
          <input type="hidden" name="originalStartsAt" value={season.startsAt} />
          <input type="hidden" name="originalSettlementAt" value={season.settlementAt ?? ""} />
          <input type="hidden" name="originalVoteClosesAt" value={season.voteClosesAt ?? ""} />
        </>
      )}
      <div className="cms-grid" ref={fields}>
        <label>
          시나리오 이름
          <select
            name="scenarioKey"
            required
            value={scenarioKey}
            onChange={(event) => setScenarioKey(event.target.value as ScenarioPresetKey)}
          >
            <option value="" disabled>
              시나리오 선택
            </option>
            {SCENARIO_PRESETS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          서버 종류
          <select
            name="serverType"
            required
            value={serverType}
            onChange={(event) => setServerType(event.target.value as SeasonServerType)}
          >
            {SEASON_SERVER_TYPES.filter(
              (type) => type !== "UNKNOWN" || initialServerType === "UNKNOWN",
            ).map((type) => (
              <option key={type} value={type}>
                {getSeasonServerTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          트랜스 현상
          <select
            name="trancePhenomenon"
            required
            value={trancePhenomenon}
            onChange={(event) => setTrancePhenomenon(event.target.value as TrancePhenomenon)}
          >
            {TRANCE_PHENOMENA.filter(
              (theme) => theme !== "UNKNOWN" || initialTrance === "UNKNOWN",
            ).map((theme) => (
              <option key={theme} value={theme}>
                {getTrancePhenomenonLabel(theme)}
              </option>
            ))}
          </select>
          <small>
            이 서버에서 이용하는 현상을 선택하세요. 일반 세계에서만 플레이하면 ‘없음’을 선택하세요.
            날짜에 따라 자동으로 변경되지 않습니다.
          </small>
        </label>
        <label>
          시즌 번호 · 서버 주소
          <span className="cms-server-address">
            <span className="mono">{preset?.serverPrefix ?? "시나리오 선택"}</span>
            <input
              aria-label="시즌 번호 (숫자 4자리)"
              name="serverNumber"
              inputMode="numeric"
              required
              minLength={4}
              maxLength={4}
              pattern="[0-9]{4}"
              value={serverNumber}
              onChange={(event) =>
                setServerNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
            />
          </span>
          <small>이 번호가 시즌 번호이자 서버 주소입니다. 숫자 네 자리만 입력하세요.</small>
        </label>
        <label>
          시즌에서 사용할 하이브 이름
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={season?.name}
            placeholder="시즌에서 사용할 하이브 이름"
          />
          <small>생성 후에도 하이브 이름을 수정할 수 있습니다.</small>
        </label>
        <label>
          지역
          <input
            name="region"
            required
            minLength={2}
            maxLength={100}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="예: 한국"
          />
        </label>
        <CalendarField
          name="startsAt"
          label={permanent ? "운영 시작" : "시즌 시작"}
          initial={season?.startsAt}
          required
        />
        {season && !request && season.approvalStatus === "APPROVED" ? (
          <label>
            시즌 상태
            <select name="status" defaultValue={season.status}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {seasonStatusLabels[status]}
                </option>
              ))}
            </select>
            <small>운영을 시작하면 진행 중으로 전환할 수 있습니다.</small>
          </label>
        ) : (
          <div className="cms-fields">
            <span className="cms-field-label">등록 상태</span>
            <span className="cms-readonly">
              {request
                ? "관리자 승인 후 시즌이 등록됩니다."
                : season
                  ? "승인 검토 중"
                  : "준비 중인 시즌으로 등록됩니다."}
            </span>
          </div>
        )}
      </div>
      {permanent ? (
        <div className="cms-phase-preview">
          <strong>영구 운영 · 휴식기</strong>
          <p>영구 서버는 정산일과 단계 진행 없이 계속 운영합니다.</p>
        </div>
      ) : (
        phaseTemplate && (
          <div className="cms-phase-preview">
            <strong>시즌 단계 · {phaseTemplate.length}단계 자동 구성</strong>
            <p>{phaseTemplate.map((name, index) => `${index + 1}. ${name}`).join(" → ")}</p>
            <small>생성된 시즌 상세에서 관리자가 이전·다음 버튼으로 진행합니다.</small>
            {season && scenarioKey !== initialKey && (
              <p className="cms-help">
                시나리오를 변경하면 새 단계 구성의 1단계부터 시작합니다. 참가자와 이동 신청 기록은
                유지됩니다.
              </p>
            )}
          </div>
        )
      )}
      <p className="cms-help">
        {trancePhenomenon === "GRAVITY_ABYSS" || trancePhenomenon === "STARFALL_INVERSION"
          ? `${getTrancePhenomenonLabel(trancePhenomenon)}에서는 파티 모집 종류에 ‘응축기’가 추가됩니다.`
          : "트랜스 현상을 변경해도 참가자와 하이브 이동 기록은 유지됩니다."}
      </p>
      {!permanent && (
        <label className="cms-check">
          <input
            type="checkbox"
            checked={settlementEnabled}
            onChange={(event) => setSettlementEnabled(event.target.checked)}
          />
          정산일 추가 (선택)
        </label>
      )}
      {!permanent && settlementEnabled ? (
        <CalendarField name="settlementAt" label="시즌 정산" initial={season?.settlementAt} />
      ) : (
        <input type="hidden" name="settlementAt" value="" />
      )}
      {canManageMigration &&
        !request &&
        permanent &&
        season?.serverType === "PERMANENT" &&
        season.approvalStatus === "APPROVED" &&
        season.status !== "ARCHIVED" && (
          <>
            <label className="cms-check">
              <input type="hidden" name="migrationOpen" value={String(migrationOpen)} />
              <input
                type="checkbox"
                checked={migrationOpen}
                onChange={(event) => setMigrationOpen(event.target.checked)}
              />
              하이브 이동 신청 열기
            </label>
            <p className="cms-help">
              영구 서버에서는 관리자가 하이브 이동 신청 기간을 직접 열고 닫습니다.
            </p>
          </>
        )}
      {season && !request && season.approvalStatus === "APPROVED" && (
        <details className="cms-phase">
          <summary>투표 마감 설정 (선택)</summary>
          <CalendarField name="voteClosesAt" label="투표 마감" initial={season.voteClosesAt} />
          <small>후보를 두 개 이상 등록한 뒤 설정합니다.</small>
        </details>
      )}
      <p className="cms-time-note">
        날짜와 시간은 한국 시간(KST)입니다.{!permanent && " 정산일은 나중에 추가할 수 있습니다."}
      </p>
      {initial && !initial.scenarioKey && (
        <p className="cms-readonly">
          현재 시나리오 주소 형식과 다른 기록입니다. 사용할 시나리오와 시즌 번호를 선택해주세요.
        </p>
      )}
    </AdminForm>
  );
}
