import { Card } from "@uniz/ui";
import {
  PLANNER_REFERENCE_CATALOG,
  type PlannerCategory,
  type PlannerEntry,
  type PlannerLoadout,
  type PlannerGearLoadout,
} from "@uniz/build-engine";
import { GearLoadoutView } from "./gear-checklist";
import { scenarioLabels } from "./presentation-labels";
export { visibilityLabels, scenarioLabels } from "./presentation-labels";
import "./editor.css";

export const categoryLabels: Record<PlannerCategory, string> = {
  WEAPON: "무기",
  ARMOR: "방어구",
  MOD: "모듈",
  CALIBRATION: "보정",
  CRADLE: "크래들",
  DEVIATION: "감염물",
  AMMO: "탄약",
  FOOD: "음식",
  DRINK: "음료",
};

export function SourceEvidence({ entry }: { entry: Pick<PlannerEntry, "reference"> }) {
  const reference =
    entry.reference &&
    PLANNER_REFERENCE_CATALOG.find(
      (item) =>
        item.recordId === entry.reference!.recordId && item.revision === entry.reference!.revision,
    );
  if (!entry.reference)
    return <p className="planner-evidence">직접 입력한 기록 · 게임 수치 미확인</p>;
  return (
    <p className="planner-evidence">
      공식 참고 항목 · 현재 적용 미확인
      {reference && (
        <>
          {" "}
          ·{" "}
          <a href={reference.sourceUrl} target="_blank" rel="noopener noreferrer">
            공식 자료 보기
          </a>
        </>
      )}
    </p>
  );
}

export function PlannerCompatibilityNote() {
  return (
    <p className="planner-readonly-note">
      게임에서 확인한 구성을 기록하는 공간입니다. 장착 호환성과 입력 수치는 아직 검증하지
      않았습니다.
    </p>
  );
}

export function LoadoutView({ loadout }: { loadout: PlannerLoadout | PlannerGearLoadout }) {
  if (loadout.schemaVersion === "uniz-gear.v2") return <GearLoadoutView loadout={loadout} />;
  const context = loadout.context;
  return (
    <div className="planner-readonly">
      <Card>
        <h2>플레이 조건</h2>
        <dl className="planner-context-summary">
          <div>
            <dt>게임 버전</dt>
            <dd>{context.gamePatch ?? "미기록"}</dd>
          </div>
          <div>
            <dt>시나리오</dt>
            <dd>{context.scenarioKey ? scenarioLabels[context.scenarioKey] : "미기록"}</dd>
          </div>
          <div>
            <dt>플레이 모드</dt>
            <dd>{context.mode ?? "미기록"}</dd>
          </div>
          <div>
            <dt>플랫폼</dt>
            <dd>{context.platform === "MOBILE" ? "모바일" : (context.platform ?? "미기록")}</dd>
          </div>
          <div>
            <dt>클래스</dt>
            <dd>{context.characterClass ?? "미기록"}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2>장비 구성 · {loadout.entries.length}개</h2>
        <PlannerCompatibilityNote />
        <div className="planner-entry-list">
          {loadout.entries.map((entry) => {
            const linked = loadout.entries.find((item) => item.id === entry.linkedEntryId);
            const facts = [
              ["티어", entry.instance.tier],
              ["별", entry.instance.stars],
              ["보정 단계", entry.instance.calibration],
              ["레벨", entry.instance.level],
            ] as const;
            return (
              <article key={entry.id} className="planner-entry">
                <div className="planner-entry-summary">
                  <div>
                    <span className="planner-entry-category">{categoryLabels[entry.category]}</span>
                    <h3>{entry.name}</h3>
                    <small>
                      {entry.slotLabel || "장착 위치 미기록"}
                      {linked ? ` · 연결: ${linked.name}` : ""}
                    </small>
                  </div>
                </div>
                {facts.some(([, value]) => value !== null) && (
                  <dl className="planner-item-facts">
                    {facts
                      .filter(([, value]) => value !== null)
                      .map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                  </dl>
                )}
                {entry.instance.rolls.length > 0 && (
                  <ul className="planner-readonly-rolls" aria-label="기록한 부옵션">
                    {entry.instance.rolls.map((roll, index) => (
                      <li key={index}>
                        {roll.label} ·{" "}
                        {roll.value === null
                          ? "값 미기록"
                          : `${roll.value}${roll.unit === "PERCENT" ? "%" : ""}`}
                        {roll.value !== null && roll.unit === null && " · 단위 미기록"}
                      </li>
                    ))}
                  </ul>
                )}
                {entry.notes && <p className="planner-entry-notes">{entry.notes}</p>}
                <SourceEvidence entry={entry} />
              </article>
            );
          })}
          {!loadout.entries.length && (
            <div className="planner-empty">장비를 아직 기록하지 않았습니다.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
