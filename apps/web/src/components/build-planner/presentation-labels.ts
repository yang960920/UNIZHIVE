import type { BuildVisibility } from "@/lib/data/build-planner-types";
import { GEAR_ARMOR_SETS } from "@uniz/build-engine";
import { SCENARIO_PRESETS, type ScenarioPresetKey } from "../../lib/scenario-presets";
export const visibilityLabels: Record<BuildVisibility, string> = {
  PRIVATE: "나만 보기",
  HIVE: "하이브 멤버에게 공개",
  PUBLIC: "전체 공개",
};
export const scenarioLabels = Object.fromEntries(
  SCENARIO_PRESETS.map((preset) => [preset.key, preset.label]),
) as Record<ScenarioPresetKey, string>;

export const armorSetLabels: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    GEAR_ARMOR_SETS.flatMap((set) => [set.id, ...set.aliasIds].map((id) => [id, set.displayName])),
  ),
);
export const cradleConditionsNote =
  "시나리오·캐릭터 해금 조건은 아직 확인되지 않았습니다. 게임에서 장착 가능한 항목을 기록해주세요.";
