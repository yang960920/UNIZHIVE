import type { WeaponTuningBlueprint } from "@uniz/build-engine";
import { craftingRarityLabels } from "./gear-crafting-model";

const rarityOrder = { NORMAL: 0, RARE: 1, EPIC: 2, LEGENDARY: 3 };

const normalize = (text: string) =>
  text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

export function searchTuningBlueprints(
  blueprints: readonly Readonly<WeaponTuningBlueprint>[],
  query: string,
): Readonly<WeaponTuningBlueprint>[] {
  const words = query.trim().split(/\s+/).filter(Boolean).map(normalize);
  return blueprints.filter((blueprint) => {
    const text = normalize(
      `${blueprint.name} ${blueprint.style} ${craftingRarityLabels[blueprint.rarity]} ${blueprint.description}`,
    );
    return words.every((word) => text.includes(word));
  });
}

export function groupTuningBlueprints(blueprints: readonly Readonly<WeaponTuningBlueprint>[]) {
  const groups = new Map<string, Readonly<WeaponTuningBlueprint>[]>();
  for (const blueprint of blueprints) {
    const group = groups.get(blueprint.name) ?? [];
    group.push(blueprint);
    groups.set(blueprint.name, group);
  }
  return [...groups.entries()].map(([name, options]) => ({
    name,
    label: name.replace(/^튜닝 설계도\s*[·-]\s*/, ""),
    options: options.sort((left, right) => rarityOrder[left.rarity] - rarityOrder[right.rarity]),
  }));
}
