import catalog from "./planner-catalog.json";

export const PLANNER_SCHEMA_VERSION = "uniz-planner.v1" as const;
/** Storage protections only, never a claim about game slot or stat limits. */
export const PLANNER_MAX_PAYLOAD_BYTES = 512 * 1024;
export const PLANNER_MAX_ENTRIES = 64;
export const PLANNER_MAX_ROLLS = 32;
export const PLANNER_COUNT_STORAGE_LIMIT = 1_000_000;
export const PLANNER_ROLL_STORAGE_LIMIT = 1_000_000_000;
export const PLANNER_CATEGORIES = [
  "WEAPON",
  "ARMOR",
  "MOD",
  "CALIBRATION",
  "CRADLE",
  "DEVIATION",
  "AMMO",
  "FOOD",
  "DRINK",
] as const;
export const PLANNER_SCENARIO_KEYS = ["DEVIATION", "MANIBUS", "WINTER", "ENDLESS_DREAM"] as const;

export type PlannerCategory = (typeof PLANNER_CATEGORIES)[number];
export type PlannerScenarioKey = (typeof PLANNER_SCENARIO_KEYS)[number];

export interface PlannerContext {
  gamePatch: string | null;
  scenarioKey: PlannerScenarioKey | null;
  mode: "PVE" | "PVP" | null;
  platform: "PC" | "MOBILE" | null;
  characterClass: string | null;
}

export interface PlannerRoll {
  label: string;
  /** User-recorded value remains UNVERIFIED, even when it is exactly zero. */
  value: number | null;
  unit: "PERCENT" | "FLAT" | null;
}

export interface PlannerInstance {
  tier: number | null;
  stars: number | null;
  calibration: number | null;
  level: number | null;
  rolls: PlannerRoll[];
}

export interface PlannerReference {
  recordId: string;
  revision: string;
}

export interface PlannerEntry {
  id: string;
  category: PlannerCategory;
  slotLabel: string;
  name: string;
  linkedEntryId: string | null;
  reference: PlannerReference | null;
  instance: PlannerInstance;
  notes: string;
}

/** A recording snapshot; this is not a calculated or game-validated loadout. */
export interface PlannerLoadout {
  schemaVersion: typeof PLANNER_SCHEMA_VERSION;
  context: PlannerContext;
  entries: PlannerEntry[];
}

export interface PlannerReferenceCatalogEntry {
  recordId: string;
  revision: string;
  category: PlannerCategory;
  name: string;
  sourceTitle: string;
  sourceUrl: string;
  currentValidity: "UNVERIFIED";
}

export type PlannerReferenceCatalog = readonly Readonly<PlannerReferenceCatalogEntry>[];

/** Only explicitly curated ITEM evidence; systems, armor sets, effects, and targets are excluded. */
export const PLANNER_REFERENCE_CATALOG: PlannerReferenceCatalog = Object.freeze(
  catalog.map((entry) =>
    Object.freeze({
      ...entry,
      category: entry.category as PlannerCategory,
      currentValidity: "UNVERIFIED" as const,
    }),
  ),
);

export function getPlannerReferenceCatalog(): PlannerReferenceCatalog {
  return PLANNER_REFERENCE_CATALOG;
}

export function createEmptyPlannerLoadout(): PlannerLoadout {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    context: {
      gamePatch: null,
      scenarioKey: null,
      mode: null,
      platform: null,
      characterClass: null,
    },
    entries: [],
  };
}

export type PlannerWarningCode =
  | "COMPATIBILITY_UNVERIFIED"
  | "CONTEXT_UNKNOWN"
  | "MANUAL_VALUES_UNVERIFIED"
  | "HISTORICAL_REFERENCE"
  | "ROLL_UNIT_UNKNOWN"
  | "LINK_COMPATIBILITY_UNVERIFIED";

export interface PlannerWarning {
  code: PlannerWarningCode;
  entryId: string | null;
  message: string;
}

/** Warnings describe uncertainty; no gameplay totals, default quantities, or damage math. */
export function getPlannerWarnings(loadout: PlannerLoadout): PlannerWarning[] {
  const warnings: PlannerWarning[] = [];
  if (loadout.entries.length > 0) {
    warnings.push({
      code: "COMPATIBILITY_UNVERIFIED",
      entryId: null,
      message: "현재 게임의 장착·슬롯·효과 호환성은 미확인입니다.",
    });
  }
  if (Object.values(loadout.context).some((value) => value === null)) {
    warnings.push({
      code: "CONTEXT_UNKNOWN",
      entryId: null,
      message: "미확인 플레이 조건을 비워 둔 기록입니다.",
    });
  }
  for (const entry of loadout.entries) {
    warnings.push({
      code: "MANUAL_VALUES_UNVERIFIED",
      entryId: entry.id,
      message: "직접 기록한 개체 값은 UNVERIFIED이며 게임 수치로 검증되지 않았습니다.",
    });
    if (entry.reference) {
      warnings.push({
        code: "HISTORICAL_REFERENCE",
        entryId: entry.id,
        message: "참고 이름은 과거 공식 근거이며 현재 적용 여부는 UNVERIFIED입니다.",
      });
    }
    if (entry.instance.rolls.some((roll) => roll.value !== null && roll.unit === null)) {
      warnings.push({
        code: "ROLL_UNIT_UNKNOWN",
        entryId: entry.id,
        message: "기록한 부옵션 값 중 단위가 미확인인 값이 있습니다.",
      });
    }
    if (entry.linkedEntryId) {
      warnings.push({
        code: "LINK_COMPATIBILITY_UNVERIFIED",
        entryId: entry.id,
        message: "연결된 항목의 실제 게임 호환성을 확정하지 않았습니다.",
      });
    }
  }
  return warnings;
}
