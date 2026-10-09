"use client";

import { SCENARIO_PRESETS } from "@/lib/scenario-presets";
import type { SeasonAdminData } from "@/lib/server/season-administration";
import { AdminForm } from "../admin-form";
import { saveSeasonAdministration } from "./actions";
export { SeasonSetupForm } from "./season-setup-form";

type Catalog = Pick<SeasonAdminData, "scenarios" | "servers">;
export function CandidateForm({
  seasonId,
  scenarios,
  existing,
  disabled,
}: {
  seasonId: string;
  scenarios: Catalog["scenarios"];
  existing: string[];
  disabled: boolean;
}) {
  const existingSlugs = scenarios.filter((s) => existing.includes(s.id)).map((s) => s.slug);
  const available = SCENARIO_PRESETS.filter((s) => !existingSlugs.includes(s.slug));
  return (
    <AdminForm
      action={saveSeasonAdministration}
      submitLabel="투표 후보 추가"
      disabled={disabled || !available.length}
    >
      <input type="hidden" name="action" value="ADD_PRESET_CANDIDATE" />
      <input type="hidden" name="seasonId" value={seasonId} />
      <label>
        후보 시나리오
        <select name="scenarioKey" required defaultValue="">
          <option value="" disabled>
            시나리오 선택
          </option>
          {available.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        후보 표시 이름
        <input
          name="label"
          required
          minLength={2}
          maxLength={100}
          placeholder="투표 카드에 표시할 이름"
        />
      </label>
      {!available.length && <small>네 가지 시나리오가 모두 후보로 등록되어 있습니다.</small>}
    </AdminForm>
  );
}

export function EnrolmentForm({
  seasonId,
  members,
  enrolled,
  disabled,
}: {
  seasonId: string;
  members: SeasonAdminData["approvedMembers"];
  enrolled: string[];
  disabled: boolean;
}) {
  const eligible = members.filter((m) => !enrolled.includes(m.id));
  return (
    <AdminForm
      action={saveSeasonAdministration}
      submitLabel="선택한 멤버 참가 등록"
      disabled={disabled || !eligible.length}
    >
      <input type="hidden" name="action" value="ENROL_MEMBERS" />
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="cms-checks">
        {eligible.map((m) => (
          <label key={m.id} className="cms-check">
            <input name="userIds" type="checkbox" value={m.id} />
            <span>
              {m.name}
              {m.handle ? ` · @${m.handle}` : ""}
            </span>
          </label>
        ))}
      </div>
      {!eligible.length && <small>추가로 등록할 승인 멤버가 없습니다.</small>}
      <small>승인된 멤버만 등록할 수 있습니다. 기존 참가 이력과 이동 준비 상태는 유지됩니다.</small>
    </AdminForm>
  );
}
