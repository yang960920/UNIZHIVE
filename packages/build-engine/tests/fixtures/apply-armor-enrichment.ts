import evidence from "./armor-reference-evidence.json";
import type { GearCatalogItem } from "../../src/model/gear";

/** Replays the reviewed public-facing metadata without game archives or local research artifacts. */
export function applyArmorEnrichmentToItems(items: GearCatalogItem[]): {
  reviewedArmors: number;
  keyArmors: number;
} {
  if (evidence.classification.value !== 3 || evidence.armorProofs.length !== 181)
    throw new Error("Armor evidence contract changed");
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const row of evidence.armorProofs) {
    const item = byId.get(row.catalogId);
    if (!item || item.kind !== "ARMOR" || item.sourceId !== row.sourceId || item.name !== row.name)
      throw new Error(`Exact armor source identity mismatch: ${row.catalogId}`);
    if (row.isKeyArmor !== (row.suitType === 3)) throw new Error("Invalid golden-armor evidence");
    item.isKeyArmor = row.isKeyArmor;
    item.description = row.description;
    if (row.displayName !== row.name) item.displayName = row.displayName;
    if (row.preferredAliases.length)
      item.aliases = [...new Set([...item.aliases, ...row.preferredAliases])];
  }
  return {
    reviewedArmors: evidence.armorProofs.length,
    keyArmors: evidence.armorProofs.filter((row) => row.isKeyArmor).length,
  };
}
