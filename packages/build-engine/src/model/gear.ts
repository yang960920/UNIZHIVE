import catalog from "./gear-catalog.json";
import armorSets from "./armor-sets.json";
import type { PlannerContext, PlannerScenarioKey } from "./planner";
import { createEmptyConsumableLoadout, type ConsumableLoadout } from "./consumables";

export const GEAR_SCHEMA_VERSION = "uniz-gear.v2" as const;
/** Eight UI recording positions, not an inferred global scenario rule. */
export const GEAR_SLOT_IDS = [
  "primary",
  "secondary",
  "melee",
  "helmet",
  "top",
  "bottom",
  "shoes",
  "gloves",
  "mask",
  "combatDeviant",
  "cradle-1",
  "cradle-2",
  "cradle-3",
  "cradle-4",
  "cradle-5",
  "cradle-6",
  "cradle-7",
  "cradle-8",
] as const;
export const GEAR_ITEM_KINDS = [
  "WEAPON",
  "ARMOR",
  "MODULE",
  "DEVIANT",
  "CRADLE",
  "ACCESSORY",
  "AMMO",
  "FOOD",
  "DRINK",
  "MODULE_SUFFIX",
  "DEVIANT_TRAIT",
] as const;
export const GEAR_ATTACHMENT_KEYS = [
  "muzzle",
  "sight",
  "tactical",
  "magazine",
  "ammo",
  "module",
] as const;
export type GearSlot = (typeof GEAR_SLOT_IDS)[number];
export type GearItemKind = (typeof GEAR_ITEM_KINDS)[number];
export type GearAttachmentKey = (typeof GEAR_ATTACHMENT_KEYS)[number];
export type GearAccessorySlot = "muzzle" | "sight" | "tactical" | "magazine";

export interface GearCatalogItem {
  id: string;
  /** Exact static-table identity, separate from the stable application/save ID. */
  sourceId?: string;
  sourceTable?: string;
  name: string;
  /** Preferred game-facing label; stable source names and historical snapshots stay intact. */
  displayName?: string;
  aliases: readonly string[];
  /** Proven historical labeling errors; kept separate from valid search aliases. */
  correctedNames?: readonly string[];
  kind: GearItemKind;
  allowedSlots: readonly GearSlot[];
  weaponFamily: string | null;
  /** An empty list means unknown; '*' must be an explicitly sourced universal allowance. */
  compatibleWeaponFamilies: readonly string[];
  /** When present, this exact item whitelist overrides family compatibility; [] permits no items. */
  compatibleItemIds?: readonly string[];
  accessorySlot: GearAccessorySlot | null;
  moduleGeneration: "NEW" | null;
  /** Sourced variant metadata; neither field changes a player's recorded module level. */
  moduleShiny?: boolean;
  moduleSuffixId?: string;
  deviantType?: "COMBAT" | "TERRITORY" | "CRAFT" | "MOUNT";
  /** Original game trait-icon identity; shared icons are mutually exclusive on one deviant. */
  traitIconGroup?: string;
  /** Exact sourced appearance trait flag, independent of fusion/material trait classification. */
  isDeviantShinyTrait?: boolean;
  /** Exact fusion material labels distinguish same-effect furniture variants in the picker. */
  traitFusionMaterialNames?: readonly string[];
  /** Material origin is descriptive; animal and furniture traits still share one fusion icon. */
  traitFusionMaterialType?: "ANIMAL" | "FURNITURE";
  /** Preserved for existing saves, excluded only from new-selection helpers. */
  legacyOnly?: boolean;
  allowedSuffixIds: readonly string[];
  allowedTraitIds: readonly string[];
  icon: string | null;
  rarity: "NORMAL" | "RARE" | "EPIC" | "LEGENDARY" | null;
  description: string;
  setId: string | null;
  isKeyArmor: boolean;
  scenarioKeys: readonly PlannerScenarioKey[];
  source: Readonly<{ url: string | null; evidence: string; verifiedAt: string }>;
  /** Historical/source-described options only; they are never scaled or summed by this package. */
  knownOptions?: readonly Readonly<{
    label: string;
    value: number | null;
    unit: "PERCENT" | "FLAT" | null;
  }>[];
}
export type GearCatalog = readonly Readonly<GearCatalogItem>[];

export interface GearAttachments {
  muzzle: string | null;
  sight: string | null;
  tactical: string | null;
  magazine: string | null;
  ammo: string | null;
  module: string | null;
  moduleSuffix: string | null;
  moduleLevel: number | null;
}

export interface GearSelection {
  slot: GearSlot;
  itemId: string;
  level: number | null;
  /** Reserved. V2 records module suffixes only in attachments.moduleSuffix. */
  suffixId: string | null;
  abilityGrade: number | null;
  activityGrade: number | null;
  traitIds: string[];
  attachments: GearAttachments;
}

export interface GearRecommendation {
  /** UNIZ recommendation score, distinct from player-recorded deviant grades. */
  rating: number | null;
  contents: string[];
  tags: string[];
  notes: string;
}

export interface PlannerGearLoadout {
  schemaVersion: typeof GEAR_SCHEMA_VERSION;
  context: PlannerContext;
  slots: GearSelection[];
  recommendation: GearRecommendation;
  notes: string;
  /** Added within V2; older saved versions without consumables remain readable. */
  consumables?: ConsumableLoadout;
  /** Strict saves reconstruct selected names from the trusted catalog, preserving old version labels. */
  catalogNames?: Record<string, string>;
}

function freezeItem(item: GearCatalogItem): Readonly<GearCatalogItem> {
  return Object.freeze({
    ...item,
    aliases: Object.freeze([...item.aliases]),
    ...(item.traitFusionMaterialNames
      ? { traitFusionMaterialNames: Object.freeze([...item.traitFusionMaterialNames]) }
      : {}),
    ...(item.correctedNames ? { correctedNames: Object.freeze([...item.correctedNames]) } : {}),
    allowedSlots: Object.freeze([...item.allowedSlots]),
    compatibleWeaponFamilies: Object.freeze([...item.compatibleWeaponFamilies]),
    ...(item.compatibleItemIds !== undefined
      ? { compatibleItemIds: Object.freeze([...item.compatibleItemIds]) }
      : {}),
    allowedSuffixIds: Object.freeze([...item.allowedSuffixIds]),
    allowedTraitIds: Object.freeze([...item.allowedTraitIds]),
    scenarioKeys: Object.freeze([...item.scenarioKeys]),
    source: Object.freeze({ ...item.source }),
    ...(item.knownOptions
      ? {
          knownOptions: Object.freeze(
            item.knownOptions.map((option) => Object.freeze({ ...option })),
          ),
        }
      : {}),
  });
}

/** Curated local manifest; runtime code has no filesystem, network, database, or crypto access. */
export const GEAR_CATALOG: GearCatalog = Object.freeze(
  (catalog as unknown as GearCatalogItem[]).map(freezeItem),
);

export interface GearArmorSetEffect {
  pieces: 1 | 2 | 3 | 4;
  description: string;
  status: "VERIFIED_LOCAL_STATIC";
}

export interface GearArmorSet {
  id: string;
  sourceId: string;
  displayName: string;
  aliases: readonly string[];
  /** Historical save IDs and source IDs are joined explicitly, never by name prefix. */
  aliasIds: readonly string[];
  effects: readonly Readonly<GearArmorSetEffect>[];
  source: Readonly<{ evidence: string; gameBuildId: string; verifiedAt: string }>;
}

export const GEAR_ARMOR_SETS: readonly Readonly<GearArmorSet>[] = Object.freeze(
  (armorSets as unknown as GearArmorSet[]).map((set) =>
    Object.freeze({
      ...set,
      aliases: Object.freeze([...set.aliases]),
      aliasIds: Object.freeze([...set.aliasIds]),
      effects: Object.freeze(set.effects.map((effect) => Object.freeze({ ...effect }))),
      source: Object.freeze({ ...set.source }),
    }),
  ),
);
const armorSetsById = new Map(
  GEAR_ARMOR_SETS.flatMap((set) => [set.id, ...set.aliasIds].map((id) => [id, set] as const)),
);

export function getGearArmorSet(
  setId: string | null | undefined,
): Readonly<GearArmorSet> | undefined {
  return setId ? armorSetsById.get(setId) : undefined;
}

export function getGearKeyArmorSelections(
  selections: readonly GearSelection[],
  items: GearCatalog = GEAR_CATALOG,
): GearSelection[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return selections.filter((selection) => {
    const item = byId.get(selection.itemId);
    return item?.kind === "ARMOR" && item.isKeyArmor && gearItemFitsSlot(item, selection.slot);
  });
}

export function countGearKeyArmors(
  selections: readonly GearSelection[],
  items: GearCatalog = GEAR_CATALOG,
): number {
  return getGearKeyArmorSelections(selections, items).length;
}

/** A same-slot replacement is allowed; another occupied key-armor slot is never silently removed. */
export function canSelectGearArmor(
  item: GearCatalogItem,
  slot: GearSlot,
  selections: readonly GearSelection[],
  items: GearCatalog = GEAR_CATALOG,
): boolean {
  if (item.kind !== "ARMOR" || !gearItemFitsSlot(item, slot)) return false;
  return (
    !item.isKeyArmor ||
    !getGearKeyArmorSelections(selections, items).some((entry) => entry.slot !== slot)
  );
}

export function createEmptyGearLoadout(): PlannerGearLoadout {
  return {
    schemaVersion: GEAR_SCHEMA_VERSION,
    context: {
      gamePatch: null,
      scenarioKey: null,
      mode: null,
      platform: null,
      characterClass: null,
    },
    slots: [],
    recommendation: { rating: null, contents: [], tags: [], notes: "" },
    notes: "",
    consumables: createEmptyConsumableLoadout(),
    catalogNames: {},
  };
}

export function createGearSelection(slot: GearSlot, itemId: string): GearSelection {
  return {
    slot,
    itemId,
    level: null,
    suffixId: null,
    abilityGrade: null,
    activityGrade: null,
    traitIds: [],
    attachments: {
      muzzle: null,
      sight: null,
      tactical: null,
      magazine: null,
      ammo: null,
      module: null,
      moduleSuffix: null,
      moduleLevel: null,
    },
  };
}

export function gearItemMatchesScenario(item: GearCatalogItem, context?: PlannerContext): boolean {
  return (
    item.scenarioKeys.length === 0 ||
    (context?.scenarioKey !== null &&
      context?.scenarioKey !== undefined &&
      item.scenarioKeys.includes(context.scenarioKey))
  );
}

export function gearItemFitsSlot(item: GearCatalogItem, slot: GearSlot): boolean {
  if (!item.allowedSlots.includes(slot)) return false;
  if (slot === "primary" || slot === "secondary" || slot === "melee") return item.kind === "WEAPON";
  if (slot === "combatDeviant")
    return (
      item.kind === "DEVIANT" && (item.deviantType === undefined || item.deviantType === "COMBAT")
    );
  if (slot.startsWith("cradle-")) return item.kind === "CRADLE";
  return item.kind === "ARMOR";
}

export function getEligibleGearItems(
  slot: GearSlot,
  context?: PlannerContext,
  items: GearCatalog = GEAR_CATALOG,
): GearCatalogItem[] {
  return items.filter(
    (item) =>
      !item.legacyOnly && gearItemFitsSlot(item, slot) && gearItemMatchesScenario(item, context),
  );
}

export function gearAttachmentFits(
  item: GearCatalogItem,
  slot: GearSlot,
  key: GearAttachmentKey,
  parent: GearCatalogItem,
  context?: PlannerContext,
): boolean {
  if (
    !gearItemFitsSlot(parent, slot) ||
    !gearItemMatchesScenario(parent, context) ||
    !gearItemMatchesScenario(item, context) ||
    !item.allowedSlots.includes(slot)
  )
    return false;
  if (item.compatibleItemIds !== undefined && !item.compatibleItemIds.includes(parent.id))
    return false;
  if (key === "module") {
    if (
      item.kind !== "MODULE" ||
      item.moduleGeneration !== "NEW" ||
      (parent.kind !== "WEAPON" && parent.kind !== "ARMOR")
    )
      return false;
    // Armor module eligibility is established by its exact allowed equipment slots.
    if (parent.kind === "ARMOR") return true;
  } else {
    if (parent.kind !== "WEAPON") return false;
    if (key === "ammo") {
      if (item.kind !== "AMMO") return false;
    } else if (item.kind !== "ACCESSORY" || item.accessorySlot !== key) return false;
  }
  // An exact sourced item match is sufficient even when a weapon family is unknown.
  if (item.compatibleItemIds !== undefined) return true;
  // Never silently treat unknown families as a universal compatibility rule.
  return (
    parent.weaponFamily !== null &&
    (item.compatibleWeaponFamilies.includes(parent.weaponFamily) ||
      item.compatibleWeaponFamilies.includes("*"))
  );
}

export function getEligibleGearAttachments(
  slot: GearSlot,
  key: GearAttachmentKey,
  parentItemId: string,
  context?: PlannerContext,
  items: GearCatalog = GEAR_CATALOG,
): GearCatalogItem[] {
  const parent = items.find((item) => item.id === parentItemId);
  return parent
    ? items.filter(
        (item) => !item.legacyOnly && gearAttachmentFits(item, slot, key, parent, context),
      )
    : [];
}
