import { GEAR_CATALOG, type GearCatalog, type GearCatalogItem } from "./gear";

export interface GearTraitConflict {
  code: "DUPLICATE_ICON" | "DUPLICATE_SHINY";
  traitIds: string[];
  iconGroup?: string;
}

// The immutable catalog is shared by every search result. Build its identity index only once.
const traitIndexes = new WeakMap<GearCatalog, ReadonlyMap<string, Readonly<GearCatalogItem>>>();

function getTraitIndex(catalog: GearCatalog): ReadonlyMap<string, Readonly<GearCatalogItem>> {
  let index = traitIndexes.get(catalog);
  if (!index) {
    index = new Map(
      catalog.filter((item) => item.kind === "DEVIANT_TRAIT").map((item) => [item.id, item]),
    );
    traitIndexes.set(catalog, index);
  }
  return index;
}

function getIconGroup(item: Readonly<GearCatalogItem>): string | null {
  const sourceGroup = item.traitIconGroup?.trim();
  if (sourceGroup) return sourceGroup;
  // Older or test catalogs may only have their displayed icon path. Missing icons are unknown,
  // never one invented common group; historical source identity is supplied by the current catalog.
  const icon = item.icon
    ?.trim()
    .replace(/\\/g, "/")
    .replace(/[?#].*$/, "");
  return icon || null;
}

/** Catalog metadata is authoritative. Unknown IDs are left to the strict identity validator. */
export function getGearTraitConflicts(
  traitIds: readonly string[],
  catalog: GearCatalog = GEAR_CATALOG,
): GearTraitConflict[] {
  const index = getTraitIndex(catalog);
  const groups = new Map<string, string[]>();
  const shinyIds: string[] = [];
  for (const id of new Set(traitIds)) {
    const item = index.get(id);
    if (!item) continue;
    const iconGroup = getIconGroup(item);
    if (iconGroup) {
      const group = groups.get(iconGroup);
      if (group) group.push(id);
      else groups.set(iconGroup, [id]);
    }
    if (item.isDeviantShinyTrait === true) shinyIds.push(id);
  }
  const conflicts: GearTraitConflict[] = [];
  for (const [iconGroup, ids] of groups)
    if (ids.length > 1) conflicts.push({ code: "DUPLICATE_ICON", traitIds: ids, iconGroup });
  if (shinyIds.length > 1) conflicts.push({ code: "DUPLICATE_SHINY", traitIds: shinyIds });
  return conflicts;
}

/** A candidate is blocked only by its own conflict; unrelated historical conflicts remain editable. */
export function getGearTraitSelectionConflict(
  candidateId: string,
  selectedIds: readonly string[],
  catalog: GearCatalog = GEAR_CATALOG,
): GearTraitConflict | null {
  if (selectedIds.includes(candidateId)) return null;
  return (
    getGearTraitConflicts([...selectedIds, candidateId], catalog).find((conflict) =>
      conflict.traitIds.includes(candidateId),
    ) ?? null
  );
}
