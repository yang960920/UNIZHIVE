/** Evidence and Planner recording contracts are available; gameplay calculations remain pending. */
export const BUILD_ENGINE_STATUS = "GEAR_PLANNER_V2" as const;
export {
  parseEvidenceCatalog,
  evidenceCatalogSchema,
  DATA_SPEC_VERSION,
  SOURCE_GRADES,
  DATA_CATEGORIES,
  DATA_UNITS,
} from "./model/evidence";
export type { EvidenceCatalog, EvidenceField, SourceGrade, DataCategory } from "./model/evidence";
export { CATEGORY_FIELD_CONTRACTS } from "./model/field-contracts";
export type {
  BuildDataContext,
  DataRevisionReference,
  BuildLoadoutSnapshotV01,
} from "./model/field-contracts";
export {
  PLANNER_SCHEMA_VERSION,
  PLANNER_MAX_PAYLOAD_BYTES,
  PLANNER_MAX_ENTRIES,
  PLANNER_MAX_ROLLS,
  PLANNER_COUNT_STORAGE_LIMIT,
  PLANNER_ROLL_STORAGE_LIMIT,
  PLANNER_CATEGORIES,
  PLANNER_SCENARIO_KEYS,
  PLANNER_REFERENCE_CATALOG,
  createEmptyPlannerLoadout,
  getPlannerReferenceCatalog,
  getPlannerWarnings,
} from "./model/planner";
export type {
  PlannerCategory,
  PlannerScenarioKey,
  PlannerContext,
  PlannerRoll,
  PlannerInstance,
  PlannerReference,
  PlannerEntry,
  PlannerLoadout,
  PlannerReferenceCatalogEntry,
  PlannerReferenceCatalog,
  PlannerWarning,
  PlannerWarningCode,
} from "./model/planner";
export { plannerLoadoutSchema, parsePlannerLoadout } from "./validation/planner";
export {
  GEAR_SCHEMA_VERSION,
  GEAR_SLOT_IDS,
  GEAR_ITEM_KINDS,
  GEAR_ATTACHMENT_KEYS,
  GEAR_CATALOG,
  GEAR_ARMOR_SETS,
  createEmptyGearLoadout,
  createGearSelection,
  getEligibleGearItems,
  getEligibleGearAttachments,
  getGearArmorSet,
  getGearKeyArmorSelections,
  countGearKeyArmors,
  canSelectGearArmor,
} from "./model/gear";
export { getGearTraitConflicts, getGearTraitSelectionConflict } from "./model/gear-traits";
export {
  CONSUMABLE_CATALOG,
  getConsumableItem,
  getConsumableSlotLimits,
  createEmptyConsumableLoadout,
} from "./model/consumables";
export type {
  ConsumableKind,
  ConsumableEffect,
  ConsumableRecipeIngredient,
  ConsumableRecipeVariant,
  ConsumableRecipe,
  ConsumableCatalogItem,
  ConsumableCatalog,
  ConsumableLoadout,
} from "./model/consumables";
export type { GearTraitConflict } from "./model/gear-traits";
export { getDeviantFusionGuide } from "./model/fusion-guide";
export type {
  DeviantFusionGuide,
  FusionGuideTrait,
  FusionGuideMaterial,
} from "./model/fusion-guide";
export type {
  GearSlot,
  GearItemKind,
  GearAttachmentKey,
  GearAccessorySlot,
  GearCatalogItem,
  GearCatalog,
  GearAttachments,
  GearSelection,
  GearRecommendation,
  PlannerGearLoadout,
  GearArmorSet,
  GearArmorSetEffect,
} from "./model/gear";
export {
  gearLoadoutSchema,
  parseGearLoadout,
  parseGearLoadoutForSave,
  parseVersionedPlannerSnapshot,
} from "./validation/gear";
export {
  CRAFTING_MATERIALS,
  LEATHER_MATERIALS,
  GEAR_CRAFTING_RECIPES,
  CONSUMABLE_CRAFTING_RECIPES,
  WEAPON_TUNING_BLUEPRINTS,
  getCraftingMaterial,
  getWeaponTuningBlueprint,
  getGearCraftRecipes,
  getGearCraftRecipe,
  getConsumableCraftRecipes,
  getEffectiveIngredientSelections,
  getRecipeMaterials,
  getConsumablePreparation,
  weaponTuningFits,
  getEligibleWeaponTuningBlueprints,
  createEmptyGearCrafting,
  getWeaponCraftingAtTier5,
  normalizeWeaponCrafting,
} from "./model/crafting";
export { prepareBuildLoadout, makeLoadoutPreparationText } from "./model/loadout-preparation";
export type {
  LoadoutBuildInput,
  PreparedEquipmentUse,
  PreparedEquipment,
  PreparedMaterialSource,
  PreparedMaterial,
  PreparationIssue,
  PreparedConsumable,
  LoadoutPreparationResult,
} from "./model/loadout-preparation";
export type {
  CraftingTier,
  CraftingRarity,
  CraftingMaterial,
  CraftingMaterialOption,
  CraftingIngredient,
  CraftingRecipe,
  TuningSecondaryKind,
  WeaponTuningBlueprint,
  WeaponTuningSelection,
  GearCrafting,
  ConsumablePreparation,
  ResolvedCraftingIngredient,
} from "./model/crafting";
