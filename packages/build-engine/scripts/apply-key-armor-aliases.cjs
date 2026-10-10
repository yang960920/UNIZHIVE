// Match reviewed item identities before enriching search names from blueprints/fragments.
/* eslint-disable @typescript-eslint/no-require-imports -- The offline ingestion script consumes CommonJS. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const proof = JSON.parse(
  fs.readFileSync(
    path.join(root, "packages/build-engine/data/key-armor-name-aliases.json"),
    "utf8",
  ),
);

function applyKeyArmorAliasesToItems(items, evidence = proof) {
  if (evidence.schemaVersion !== "uniz-key-armor-aliases.v1") {
    throw new Error("Unsupported key armor alias evidence");
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) throw new Error("Duplicate catalog identities");
  const reviewed = new Set();
  const pending = [];
  for (const entry of evidence.entries) {
    const item = byId.get(entry.catalogId);
    if (
      reviewed.has(entry.catalogId) ||
      !item ||
      item.kind !== "ARMOR" ||
      !item.isKeyArmor ||
      item.legacyOnly ||
      item.sourceId !== entry.sourceId ||
      item.sourceTable !== entry.sourceTable ||
      item.name !== entry.sourceName ||
      item.allowedSlots.length !== 1 ||
      item.allowedSlots[0] !== entry.slot ||
      !Array.isArray(entry.aliases) ||
      !entry.aliases.length ||
      entry.aliases.some((name) => typeof name !== "string" || !name.trim() || /[<>]/u.test(name))
    ) {
      throw new Error("Exact key armor alias identity mismatch: " + entry.catalogId);
    }
    reviewed.add(item.id);
    pending.push({ item, entry });
  }
  for (const item of items) {
    if (item.kind === "ARMOR" && item.isKeyArmor && !item.legacyOnly && !reviewed.has(item.id)) {
      throw new Error("Unreviewed key armor alias item: " + item.id);
    }
  }
  // Apply only after every identity has passed, avoiding partially enriched extraction results.
  let changed = 0;
  for (const { item, entry } of pending) {
    const aliases = [...new Set([...item.aliases, ...entry.aliases])].filter(
      (name) => name !== item.name,
    );
    if (JSON.stringify(aliases) !== JSON.stringify(item.aliases)) changed++;
    item.aliases = aliases;
  }
  return { items: reviewed.size, changed };
}

function applyFiles() {
  const file = path.join(root, "packages/build-engine/src/model/gear-catalog.json");
  const items = JSON.parse(fs.readFileSync(file, "utf8"));
  const before = JSON.stringify(items.map((item) => ({ ...item, aliases: undefined })));
  const unrelated = JSON.stringify(
    items.filter((item) => item.kind !== "ARMOR" || !item.isKeyArmor),
  );
  const summary = applyKeyArmorAliasesToItems(items);
  if (
    JSON.stringify(items.map((item) => ({ ...item, aliases: undefined }))) !== before ||
    JSON.stringify(items.filter((item) => item.kind !== "ARMOR" || !item.isKeyArmor)) !== unrelated
  ) {
    throw new Error("Key armor alias enrichment changed unrelated catalog data");
  }
  if (summary.changed) fs.writeFileSync(file, JSON.stringify(items, null, 2) + "\n");
  return summary;
}

if (require.main === module) console.log(JSON.stringify(applyFiles()));
module.exports = { applyKeyArmorAliasesToItems, applyFiles };
