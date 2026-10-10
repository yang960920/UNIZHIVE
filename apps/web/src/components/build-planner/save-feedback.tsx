import type { PlannerSaveBlocker } from "./save-requirements";

export function PlannerFieldBadge({ required = false }: { required?: boolean }) {
  return (
    <span className={`planner-field-badge${required ? " is-required" : ""}`}>
      {required ? "필수" : "선택"}
    </span>
  );
}

export function PlannerRequiredFields({ legacy = false }: { legacy?: boolean }) {
  return (
    <section className="planner-required-guide" aria-label="빌드 입력 안내">
      <p>
        <PlannerFieldBadge required /> 빌드 이름 <strong>2~100자</strong>
      </p>
      <p>
        <PlannerFieldBadge /> 장비·수치·플레이 조건·설명·영상·메모
        {!legacy && "·추천 점수·태그·도핑"}
      </p>
      <p className="planner-required-note">
        선택 항목은 비워 두어도 저장할 수 있습니다. 공개 범위는 선택된 값으로 저장됩니다.
        {legacy
          ? " 장비 항목이나 부옵션을 추가했다면 이름을 입력해 주세요."
          : " 시나리오 전용 장비를 선택했다면 해당 시나리오도 선택해 주세요."}
      </p>
    </section>
  );
}

export function PlannerSaveFeedback({
  id,
  blockers,
  pending,
  saved,
}: {
  id: string;
  blockers: PlannerSaveBlocker[];
  pending: boolean;
  saved: boolean;
}) {
  const busy = pending || saved;
  return (
    <div
      id={id}
      className={`planner-save-feedback${!busy && blockers.length ? " needs-input" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {busy ? (
        <p>{saved ? "저장되었습니다. 빌드 화면으로 이동합니다." : "빌드를 저장하고 있습니다…"}</p>
      ) : blockers.length ? (
        <>
          <strong>저장 전에 확인해 주세요</strong>
          <ul>
            {blockers.map(({ message, targetId }) => (
              <li key={`${targetId ?? "general"}:${message}`}>
                {targetId ? <a href={`#${targetId}`}>{message}</a> : message}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>필수 입력이 완료되었습니다. 선택 항목은 비워 두어도 저장할 수 있습니다.</p>
      )}
    </div>
  );
}
