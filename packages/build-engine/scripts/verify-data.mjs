import { readFile, readdir } from "node:fs/promises";
import { parseEvidenceCatalog, DATA_CATEGORIES } from "../src/model/evidence.ts";

const dataDirectory = new URL("../data/", import.meta.url);
const files = (await readdir(dataDirectory))
  .filter((file) => file.endsWith("-evidence.json"))
  .sort();
if (files.length === 0) throw new Error("No evidence catalogs found.");
const counts = new Map();
const sampleIds = new Set();
const reviewedAsOf = new Date().toISOString().slice(0, 10);
for (const file of files) {
  const catalog = parseEvidenceCatalog(
    JSON.parse(await readFile(new URL(file, dataDirectory), "utf8")),
    reviewedAsOf,
  );
  for (const sample of catalog.samples) {
    if (sampleIds.has(sample.id)) throw new Error(`Duplicate catalog sample: ${sample.id}`);
    sampleIds.add(sample.id);
    counts.set(sample.category, (counts.get(sample.category) ?? 0) + 1);
  }
  console.log(
    `${file}: ${catalog.sources.length} sources, ${catalog.samples.length} historical samples, PASS`,
  );
}
console.log(
  `Validated ${sampleIds.size} historical samples. Current gameplay baselines remain UNVERIFIED.`,
);
console.log(
  `Categories without sourced samples: ${DATA_CATEGORIES.filter((category) => !counts.has(category)).join(", ") || "none"}`,
);
