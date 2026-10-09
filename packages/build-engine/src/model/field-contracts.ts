import type { DataCategory } from "./evidence";

/** UNIZ proposed field contracts, not a claim about internal game API schemas. */
export const CATEGORY_FIELD_CONTRACTS = {
  WEAPON: [
    "name",
    "weaponClass",
    "rarity",
    "tier",
    "blueprintStars",
    "baseStats",
    "keywordRefs",
    "intrinsicEffectRefs",
    "modSlotRefs",
    "attachmentSlotRefs",
    "calibrationRuleSetId",
  ],
  ARMOR: [
    "name",
    "equipSlot",
    "rarity",
    "tier",
    "blueprintStars",
    "baseStats",
    "setId",
    "setThresholdEffects",
    "keyEffectRefs",
    "modSlotRefs",
  ],
  MOD: [
    "name",
    "systemGeneration",
    "compatibleSlots",
    "rarity",
    "mainEffectRef",
    "suffix",
    "rolls",
    "enhancementLevel",
    "rollRanges",
    "subAttributeLevels",
    "isShiny",
  ],
  CALIBRATION: [
    "name",
    "ruleSetId",
    "applicationMethod",
    "compatibleWeaponClasses",
    "rarity",
    "styleEffectRef",
    "attackBonusRange",
    "secondaryStatRange",
    "legacyRetention",
  ],
  CRADLE_OVERRIDE: [
    "name",
    "scenarioScope",
    "unlockConditions",
    "selectionRules",
    "effectRefs",
    "mutualExclusionGroup",
  ],
  DEVIATION: [
    "name",
    "role",
    "variant",
    "skillLevel",
    "stabilityLevel",
    "traits",
    "skillEffectRefs",
    "activationConditions",
    "energyRules",
  ],
  AMMO: [
    "name",
    "caliberFamily",
    "material",
    "compatibleWeaponClasses",
    "damageBonus",
    "effectRefs",
    "craftingConditions",
  ],
  FOOD: [
    "name",
    "ingredients",
    "energyRestore",
    "durationSeconds",
    "effectRefs",
    "buffGroup",
    "classExceptions",
    "spoilageRules",
  ],
  DRINK: [
    "name",
    "ingredients",
    "hydrationRestore",
    "durationSeconds",
    "effectRefs",
    "buffGroup",
    "classExceptions",
    "spoilageRules",
  ],
  EFFECT: [
    "name",
    "description",
    "triggerCondition",
    "targetFilter",
    "statKey",
    "operation",
    "quantity",
    "scalingBasis",
    "durationSeconds",
    "cooldownSeconds",
    "maxStacks",
    "applicationIntervalSeconds",
    "damageTickIntervalSeconds",
    "stackGroup",
    "resolutionOrder",
  ],
  TARGET_PROFILE: [
    "name",
    "enemyClass",
    "scenarioScope",
    "difficulty",
    "level",
    "hp",
    "defense",
    "resistances",
    "hitZones",
    "phaseRules",
    "mutationRefs",
    "dummyLimitations",
  ],
  BENCHMARK_PROFILE: [
    "name",
    "gamePatchId",
    "dataRevision",
    "engineVersion",
    "buildVersionIds",
    "targetProfileId",
    "durationSeconds",
    "distanceMeters",
    "hitZonePolicy",
    "critPolicy",
    "reloadPolicy",
    "startingConditions",
    "buffPolicy",
    "classContext",
    "teamContext",
    "warmupPolicy",
    "trialCount",
    "rawEvidenceUrls",
    "observedResults",
    "reviewerIds",
  ],
} as const satisfies Record<DataCategory, readonly string[]>;

export interface BuildDataContext {
  gamePatchId: string;
  dataRevision: string;
  scenarioId: string | null;
  mode: string;
  platform: string;
  locale: string;
  observedAt: string;
}

export interface DataRevisionReference {
  recordId: string;
  revision: string;
}

/** Snapshot references exact revisions; unknown slots and balance rules cannot be silently defaulted. */
export interface BuildLoadoutSnapshotV01 {
  schemaVersion: "uniz-loadout.v0.1";
  context: BuildDataContext;
  selections: ReadonlyArray<{
    slotKey: string;
    category: Exclude<DataCategory, "TARGET_PROFILE" | "BENCHMARK_PROFILE">;
    data: DataRevisionReference;
    instanceFields: Readonly<Record<string, unknown>>;
  }>;
  target: DataRevisionReference | null;
  benchmark: DataRevisionReference | null;
}
