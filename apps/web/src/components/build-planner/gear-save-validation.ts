import { z } from "zod";
import {
  getConsumableSlotLimits,
  getGearTraitConflicts,
  parseGearLoadoutForSave,
  type GearSelection,
  type PlannerGearLoadout,
} from "@uniz/build-engine";
import { attachmentLabels, gearItemById, gearItemName, gearSlotLabels } from "./gear-editor-model";
import { gearTraitConflictMessage } from "./gear-trait-presentation";
import { scenarioLabels } from "./presentation-labels";
import type { PlannerSaveBlocker } from "./save-requirements";

type GearIssue = z.core.$ZodIssue;
const contextLabels: Record<string, string> = {
  gamePatch: "게임 버전",
  scenarioKey: "시나리오",
  mode: "플레이 모드",
  platform: "플랫폼",
  characterClass: "클래스",
};
const numericLabels: Record<string, string> = {
  level: "레벨",
  abilityGrade: "능력 등급",
  activityGrade: "활동 등급",
};
const attachmentObjects = {
  module: "모듈을",
  muzzle: "총구를",
  sight: "사이트를",
  tactical: "전술 부속품을",
  magazine: "탄창을",
  ammo: "총알을",
};

function itemName(id: string, draft: PlannerGearLoadout): string | undefined {
  const item = gearItemById.get(id);
  return item ? gearItemName(item) : draft.catalogNames?.[id];
}

function scenarioIssue(
  selection: GearSelection,
  itemId: string,
  draft: PlannerGearLoadout,
  detail?: string,
): PlannerSaveBlocker | null {
  const item = gearItemById.get(itemId);
  if (
    !item?.scenarioKeys.length ||
    (draft.context.scenarioKey && item.scenarioKeys.includes(draft.context.scenarioKey))
  )
    return null;
  const names = item.scenarioKeys
    .map((key) => scenarioLabels[key].replace(/\([^)]*\)/g, "").trim())
    .join(" 또는 ");
  return {
    message: `${gearSlotLabels[selection.slot]}${detail ? `의 ${detail}` : ""} ‘${gearItemName(item)}’에 맞는 시나리오를 선택해 주세요 (${names}). 해당 항목을 변경하거나 해제해도 됩니다.`,
    targetId: "gear-play-conditions",
  };
}

function slotIssue(issue: GearIssue, draft: PlannerGearLoadout): PlannerSaveBlocker {
  const index = issue.path[1];
  const selection = typeof index === "number" ? draft.slots[index] : undefined;
  if (!selection) {
    return {
      message:
        issue.message === "Only one key armor can be equipped at a time."
          ? "핵심 방어구는 1개만 장착할 수 있습니다. 추가 핵심 방어구를 변경하거나 해제해 주세요."
          : "장비 구성의 항목 수와 장착 위치를 확인해 주세요.",
      targetId: "gear-equipment",
    };
  }
  const label = gearSlotLabels[selection.slot] ?? "장비";
  const targetId = `gear-slot-${selection.slot}`;
  const field = issue.path[2];
  const blocker = (message: string): PlannerSaveBlocker => ({ message, targetId });
  if (field === "itemId") {
    const scenario = scenarioIssue(selection, selection.itemId, draft);
    if (scenario) return scenario;
    if (issue.message.includes("same Cradle"))
      return blocker(
        `${label}에 선택한 크래들이 다른 위치에도 등록되어 있습니다. 중복된 크래들을 해제해 주세요.`,
      );
    if (issue.message.includes("cannot occupy"))
      return blocker(
        `${label}에 선택한 항목은 이 위치에 장착할 수 없습니다. 장비를 다시 선택해 주세요.`,
      );
    const name = itemName(selection.itemId, draft);
    return blocker(
      `${label}의 ${name ? `‘${name}’` : "이전 장비"}를 현재 장비 목록에서 확인할 수 없습니다. 다시 선택하거나 해제해 주세요.`,
    );
  }
  if (field === "slot")
    return blocker(
      `${label}의 장착 위치가 중복되었거나 올바르지 않습니다. 장비를 다시 선택해 주세요.`,
    );
  if (field === "traitIds") {
    const conflict = getGearTraitConflicts(selection.traitIds).find((entry) =>
      issue.message.includes("shiny")
        ? entry.code === "DUPLICATE_SHINY"
        : entry.code === "DUPLICATE_ICON",
    );
    if (conflict) return blocker(gearTraitConflictMessage(conflict, draft.catalogNames));
    const traitIndex = issue.path[3];
    const traitId = typeof traitIndex === "number" ? selection.traitIds[traitIndex] : undefined;
    const scenario = traitId ? scenarioIssue(selection, traitId, draft, "특성") : null;
    if (scenario) return scenario;
    if (issue.message === "Trait IDs must be unique.")
      return blocker(`${label}의 같은 특성이 중복 등록되어 있습니다. 중복된 특성을 해제해 주세요.`);
    if (issue.code === "too_big")
      return blocker(
        `${label}의 특성은 최대 16개까지 기록할 수 있습니다. 추가 특성을 해제해 주세요.`,
      );
    const name = traitId ? itemName(traitId, draft) : undefined;
    return blocker(
      `${label}의 ${name ? `‘${name}’ 특성을` : "특성 선택을"} 확인해 주세요. 선택한 감염물에 맞는 특성으로 다시 선택하거나 해제해 주세요.`,
    );
  }
  if (field === "attachments") {
    const key = issue.path[3];
    if (key === "moduleLevel")
      return blocker(`${label}의 모듈 레벨은 비워두거나 1~17의 정수로 입력해 주세요.`);
    if (key === "moduleSuffix") {
      const suffixId = selection.attachments.moduleSuffix;
      const scenario = suffixId
        ? scenarioIssue(selection, suffixId, draft, "모듈 접미 옵션")
        : null;
      if (scenario) return scenario;
      return blocker(
        `${label}의 모듈 접미 옵션이 선택한 모듈과 맞지 않습니다. 모듈과 접미 옵션을 다시 선택하거나 해제해 주세요.`,
      );
    }
    if (typeof key === "string" && key in attachmentLabels) {
      const attachmentKey = key as keyof typeof attachmentLabels;
      const attachmentId = selection.attachments[attachmentKey];
      const parentScenario = scenarioIssue(selection, selection.itemId, draft);
      if (parentScenario) return parentScenario;
      const scenario = attachmentId
        ? scenarioIssue(selection, attachmentId, draft, attachmentLabels[attachmentKey])
        : null;
      if (scenario) return scenario;
      return blocker(
        `${label}의 ${attachmentObjects[attachmentKey]} 현재 장비에 사용할 수 없습니다. 호환되는 항목으로 다시 선택하거나 해제해 주세요.`,
      );
    }
    return blocker(
      issue.message.startsWith("Module suffix and level")
        ? `${label}의 모듈 접미 옵션과 모듈 레벨을 기록하려면 모듈을 먼저 선택해 주세요. 모듈 기록을 비워두어도 됩니다.`
        : issue.message.startsWith("Deviant and Cradle")
          ? `${label}에는 모듈과 부속품을 기록할 수 없습니다. 해당 선택을 해제해 주세요.`
          : `${label}의 모듈·부속품 상세 기록을 확인해 주세요. 항목을 다시 선택하거나 해제해 주세요.`,
    );
  }
  if (typeof field === "string" && field in numericLabels)
    return blocker(
      issue.message.startsWith("Cradle selections")
        ? `${label}에는 레벨을 기록할 수 없습니다. 레벨 기록을 비워 주세요.`
        : `${label}의 ${numericLabels[field]}은 비워두거나 1~100의 정수로 입력해 주세요.`,
    );
  if (field === "suffixId")
    return blocker(`${label}의 장비를 다시 선택하고 접미 옵션은 모듈 상세에서 기록해 주세요.`);
  return blocker(
    issue.message.startsWith("Ability/activity grades")
      ? `${label}의 능력 등급·활동 등급·특성은 전투 감염물에서만 기록할 수 있습니다. 해당 기록을 비워 주세요.`
      : `${label}의 상세 기록을 확인해 주세요. 항목을 다시 선택하거나 해제해 주세요.`,
  );
}

function translateIssue(issue: GearIssue, draft: PlannerGearLoadout): PlannerSaveBlocker {
  const section = issue.path[0];
  if (section === "slots") return slotIssue(issue, draft);
  if (section === "context") {
    const field = String(issue.path[1]);
    return {
      message:
        field === "gamePatch" || field === "characterClass"
          ? `${contextLabels[field]}은 비워두거나 공백을 제외한 1~120자로 입력해 주세요.`
          : `${contextLabels[field] ?? "플레이 조건"}을 제공된 선택 항목에서 다시 선택해 주세요. 기록하지 않아도 저장할 수 있습니다.`,
      targetId: "gear-play-conditions",
    };
  }
  if (section === "consumables") {
    const field = issue.path[1];
    const kind = field === "foodIds" ? "음식" : "음료";
    const subject = field === "foodIds" ? "음식은" : "음료는";
    const object = field === "foodIds" ? "음식을" : "음료를";
    const limits = getConsumableSlotLimits(draft.context.characterClass);
    const limit = field === "foodIds" ? limits.food : limits.drink;
    return {
      message:
        field === "notes"
          ? "도핑 메모는 2,000자 이내로 입력해 주세요."
          : issue.message.includes("different items")
            ? `같은 ${object} 중복 선택할 수 없습니다. 중복된 항목을 해제해 주세요.`
            : issue.code === "too_big" || issue.message.includes("at most")
              ? `${subject} 현재 클래스에서 최대 ${limit}개까지 선택할 수 있습니다. 추가 항목을 해제하거나 클래스를 확인해 주세요.`
              : `${kind} 선택을 현재 목록에서 확인할 수 없습니다. 해당 항목을 다시 선택하거나 해제해 주세요.`,
      targetId: "gear-consumables",
    };
  }
  if (section === "recommendation") {
    const field = issue.path[1];
    const message =
      field === "rating"
        ? "추천도는 미평가로 두거나 1~5점에서 선택해 주세요."
        : field === "notes"
          ? "추천 메모는 2,000자 이내로 입력해 주세요."
          : field === "contents"
            ? "콘텐츠는 최대 16개, 각 1~60자로 기록할 수 있습니다. 비어 있거나 너무 긴 항목을 확인해 주세요."
            : "태그는 최대 24개, 각 1~40자로 기록할 수 있습니다. 비어 있거나 너무 긴 항목을 확인해 주세요.";
    return { message, targetId: "gear-recommendation" };
  }
  if (section === "notes")
    return {
      message: "장비 구성 메모는 2,000자 이내로 입력해 주세요.",
      targetId: "gear-loadout-notes",
    };
  return {
    message: issue.message.includes("payload limit")
      ? "장비 구성과 메모의 전체 용량이 저장 한도를 넘었습니다. 입력 내용을 줄여 주세요."
      : "현재 저장 형식으로 장비 구성을 확인할 수 없습니다. 장비 선택과 입력 내용을 확인해 주세요.",
    targetId: "gear-equipment",
  };
}

/** Uses the save parser so optional fields stay optional and selected items obey the server rules. */
export function getGearSaveIssues(draft: PlannerGearLoadout): PlannerSaveBlocker[] {
  try {
    parseGearLoadoutForSave({ ...draft, catalogNames: {} });
    return [];
  } catch (error) {
    const issues =
      error instanceof z.ZodError
        ? error.issues.map((issue) => translateIssue(issue, draft))
        : [
            {
              message: "장비 구성의 선택과 입력 내용을 확인해 주세요.",
              targetId: "gear-equipment",
            },
          ];
    const seen = new Set<string>();
    return issues.filter((issue) => {
      const key = `${issue.targetId}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
