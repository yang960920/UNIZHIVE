"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { GEAR_SLOT_IDS, type PlannerGearLoadout } from "@uniz/build-engine";
import { GearIcon } from "./gear-catalog-picker";
import {
  gearSlotLabels,
  attachmentLabels,
  gearItemById,
  gearDisplayName,
  countGearArmorSets,
} from "./gear-editor-model";
import { armorSetLabels, cradleConditionsNote, scenarioLabels } from "./presentation-labels";
import { makeGearChecklist } from "./gear-checklist-text";
import { GearArmorSetEffects } from "./gear-armor-summary";
import { GearDeviantFusionGuide } from "./gear-fusion-guide";
import { GearFarmingMapLink } from "./gear-farming-map-link";
import { GearConsumablesView } from "./gear-consumables";
export { makeGearChecklist } from "./gear-checklist-text";
import "./gear-checklist.css";

export function GearLoadoutView({ loadout }: { loadout: PlannerGearLoadout }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const name = (id: string) => gearDisplayName(id, loadout.catalogNames);
  const sets = countGearArmorSets(loadout.slots);
  async function copy() {
    try {
      await navigator.clipboard.writeText(makeGearChecklist(loadout));
      setCopied(true);
      setError("");
    } catch {
      setError("복사하지 못했습니다. 아래 구성표의 이름을 확인해주세요.");
    }
  }
  return (
    <section className="gear-saved" aria-label="게임 장착 구성표">
      <header>
        <div>
          <p className="mono">EQUIPMENT CONFIGURATION</p>
          <h2>장착 구성표</h2>
          <p>부위별 이름과 옵션을 확인하며 게임에서 장착해주세요.</p>
        </div>
        <button type="button" className="button button-primary" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
          {copied ? "구성표 복사됨" : "장착 구성표 복사"}
        </button>
      </header>
      {error && <p role="status">{error}</p>}
      <dl className="gear-saved-context">
        {[
          [
            "시나리오",
            loadout.context.scenarioKey ? scenarioLabels[loadout.context.scenarioKey] : "미기록",
          ],
          ["플레이 모드", loadout.context.mode ?? "미기록"],
          [
            "플랫폼",
            loadout.context.platform === "MOBILE"
              ? "모바일"
              : (loadout.context.platform ?? "미기록"),
          ],
          ["게임 버전", loadout.context.gamePatch ?? "미기록"],
          ["클래스", loadout.context.characterClass ?? "미기록"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="gear-saved-grid">
        {GEAR_SLOT_IDS.map((slot) => {
          const selection = loadout.slots.find((item) => item.slot === slot);
          if (!selection) return null;
          const item = gearItemById.get(selection.itemId);
          return (
            <article
              className={`gear-saved-card rarity-${item?.rarity?.toLowerCase() ?? "unknown"}`}
              key={slot}
            >
              <div className="gear-saved-heading">
                <GearIcon item={item} />
                <div>
                  <span>{gearSlotLabels[slot]}</span>
                  <h3>{name(selection.itemId)}</h3>
                  {item?.isKeyArmor && <small>핵심 방어구</small>}
                </div>
              </div>
              {slot === "combatDeviant" && (
                <GearFarmingMapLink
                  kind="deviant"
                  id={selection.itemId}
                  name={name(selection.itemId)}
                  scenario={loadout.context.scenarioKey}
                />
              )}
              <dl>
                {selection.level !== null && (
                  <div>
                    <dt>장비 레벨</dt>
                    <dd>{selection.level}</dd>
                  </div>
                )}
                {(["muzzle", "sight", "tactical", "magazine", "ammo", "module"] as const).map(
                  (key) => {
                    const id = selection.attachments[key];
                    return id ? (
                      <div key={key}>
                        <dt>{attachmentLabels[key]}</dt>
                        <dd>
                          <GearIcon item={gearItemById.get(id)} />
                          <span>
                            {name(id)}
                            {key === "module" && selection.attachments.moduleSuffix
                              ? `〈${name(selection.attachments.moduleSuffix)}〉`
                              : ""}
                            {key === "module" && selection.attachments.moduleLevel !== null
                              ? ` · Lv.${selection.attachments.moduleLevel}`
                              : ""}
                          </span>
                        </dd>
                      </div>
                    ) : null;
                  },
                )}
                {selection.abilityGrade !== null && (
                  <div>
                    <dt>어빌리티 등급</dt>
                    <dd>{selection.abilityGrade}</dd>
                  </div>
                )}
                {selection.activityGrade !== null && (
                  <div>
                    <dt>활성 등급</dt>
                    <dd>{selection.activityGrade}</dd>
                  </div>
                )}
                {selection.traitIds.length > 0 && (
                  <div>
                    <dt>특성</dt>
                    <dd>{selection.traitIds.map(name).join(" · ")}</dd>
                  </div>
                )}
              </dl>
              {item?.kind === "CRADLE" && <p className="gear-cradle-effect">{item.description}</p>}
              {slot === "combatDeviant" && (
                <GearDeviantFusionGuide
                  selection={selection}
                  recordedNames={loadout.catalogNames}
                  scenario={loadout.context.scenarioKey}
                />
              )}
              {!item && <p>저장 당시 이름을 보존한 이전 항목입니다.</p>}
            </article>
          );
        })}
      </div>
      {loadout.slots.some((selection) => selection.slot.startsWith("cradle-")) && (
        <p className="gear-saved-notes">{cradleConditionsNote}</p>
      )}
      {!loadout.slots.length && <p>아직 선택한 장비가 없습니다.</p>}
      {sets.length > 0 && (
        <p className="gear-saved-sets">
          세트 구성:{" "}
          {sets
            .map(({ setId, count }) => `${armorSetLabels[setId] ?? setId} ${count}부위`)
            .join(" · ")}
        </p>
      )}
      <GearArmorSetEffects sets={sets} />
      <GearConsumablesView value={loadout.consumables} recordedNames={loadout.catalogNames} />
      <section className="gear-saved-recommendation">
        <h3>추천 및 사용 목적</h3>
        <p>
          추천도:{" "}
          {loadout.recommendation.rating === null
            ? "미평가"
            : `${"★".repeat(loadout.recommendation.rating)}${"☆".repeat(5 - loadout.recommendation.rating)} (${loadout.recommendation.rating}/5)`}
        </p>
        <p>{loadout.recommendation.contents.join(" · ") || "추천 콘텐츠 미기록"}</p>
        <p>{loadout.recommendation.tags.map((tag) => `#${tag}`).join(" ")}</p>
        {loadout.recommendation.notes && <p>{loadout.recommendation.notes}</p>}
      </section>
      {loadout.notes && <p className="gear-saved-notes">{loadout.notes}</p>}
    </section>
  );
}
