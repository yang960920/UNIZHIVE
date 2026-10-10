// Reviewed search labels only. Does not execute game code, merge item identities,
// modify module effects, or infer a family from an English name/shared icon.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS is consumed by the offline ingestion script. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const proof = JSON.parse(
  fs.readFileSync(path.join(root, "packages/build-engine/data/gear-module-aliases.json"), "utf8"),
);
const baseName = (name) =>
  name
    .replace(/<[^>]*>$/u, "")
    .normalize("NFKC")
    .trim();

function applyModuleAliasesToItems(items, evidence = proof) {
  if (evidence.schemaVersion !== "uniz.gear.module-aliases.v1") {
    throw new Error("Unsupported module alias evidence");
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) throw new Error("Duplicate catalog identities");
  const reviewedIds = new Set();
  const pending = [];
  for (const group of evidence.groups) {
    const names = [
      ...group.currentNamesKo,
      ...group.currentNamesEn,
      ...group.historicalNamesKo,
      ...group.historicalNamesEn,
      ...group.communityNames,
    ];
    if (names.some((name) => typeof name !== "string" || !name.trim() || /[<>]/u.test(name))) {
      throw new Error("Module aliases must be reviewed base names");
    }
    for (const [id, sourceId] of Object.entries(group.variants)) {
      const item = byId.get(id);
      if (
        reviewedIds.has(id) ||
        !item ||
        item.kind !== "MODULE" ||
        item.moduleGeneration !== "NEW" ||
        item.sourceTable !== "new_mod_property_data" ||
        item.sourceId !== sourceId ||
        !group.currentNamesKo.includes(baseName(item.name)) ||
        JSON.stringify(item.allowedSlots) !== JSON.stringify(group.allowedSlots)
      ) {
        throw new Error("Exact module alias identity mismatch: " + id);
      }
      reviewedIds.add(id);
      pending.push({ item, names });
    }
  }
  // A changed extraction must be reviewed before newly introduced variants receive aliases.
  for (const item of items) {
    if (item.kind === "MODULE" && !item.legacyOnly && !reviewedIds.has(item.id)) {
      throw new Error("Unreviewed module alias variant: " + item.id);
    }
  }
  // Complete validation precedes mutation, so an identity conflict cannot leave a partial result.
  let changed = 0;
  for (const { item, names } of pending) {
    const aliases = [
      ...new Set([
        ...item.aliases,
        ...names.filter((name) => baseName(name) !== baseName(item.name)),
      ]),
    ].filter((name) => name !== item.name);
    if (JSON.stringify(aliases) !== JSON.stringify(item.aliases)) changed++;
    item.aliases = aliases;
  }
  return { families: evidence.groups.length, variants: reviewedIds.size, changed };
}

function applyFiles() {
  const file = path.join(root, "packages/build-engine/src/model/gear-catalog.json");
  const items = JSON.parse(fs.readFileSync(file, "utf8"));
  const original = JSON.stringify(items.map((item) => ({ ...item, aliases: undefined })));
  const unrelated = JSON.stringify(items.filter((item) => item.kind !== "MODULE"));
  const summary = applyModuleAliasesToItems(items);
  if (
    JSON.stringify(items.map((item) => ({ ...item, aliases: undefined }))) !== original ||
    JSON.stringify(items.filter((item) => item.kind !== "MODULE")) !== unrelated
  ) {
    throw new Error("Module alias enrichment changed unrelated catalog data");
  }
  if (summary.changed) fs.writeFileSync(file, JSON.stringify(items, null, 2) + "\n");
  return summary;
}

if (require.main === module) console.log(JSON.stringify(applyFiles()));
module.exports = { applyModuleAliasesToItems, applyFiles };
