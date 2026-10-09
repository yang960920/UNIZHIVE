import { z } from "zod";

export const DATA_SPEC_VERSION = "build-data-evidence.v0.1" as const;
export const SOURCE_GRADES = ["OFFICIAL", "COMMUNITY VERIFIED", "UNVERIFIED", "ESTIMATED"] as const;
export const DATA_CATEGORIES = [
  "WEAPON",
  "ARMOR",
  "MOD",
  "CALIBRATION",
  "CRADLE_OVERRIDE",
  "DEVIATION",
  "AMMO",
  "FOOD",
  "DRINK",
  "EFFECT",
  "TARGET_PROFILE",
  "BENCHMARK_PROFILE",
] as const;
export const DATA_UNITS = [
  "TEXT",
  "PERCENT",
  "PERCENTAGE_POINT",
  "COUNT",
  "SECONDS",
  "METERS",
  "DAMAGE",
  "HP",
  "LEVEL",
  "ROUNDS_PER_MINUTE",
  "BOOLEAN",
  "UNSPECIFIED",
] as const;

const text = z.string().trim().min(1);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Expected a valid calendar date.");
const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Use HTTPS evidence URLs.");
const value = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.tuple([z.number().finite(), z.number().finite()]),
]);

export const evidenceFieldSchema = z
  .strictObject({
    path: text.regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/),
    value,
    unit: z.enum(DATA_UNITS).nullable(),
    status: z.enum(SOURCE_GRADES),
    sourceIds: z.array(text),
    note: text,
    verification: z
      .strictObject({
        method: text,
        repetitions: z.number().int().min(3),
        reviewerIds: z.array(text).min(2),
        evidenceUrls: z.array(httpsUrl).min(1),
      })
      .optional(),
    estimate: z.strictObject({ assumption: text, uncertainty: text }).optional(),
  })
  .superRefine((field, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });
    if (field.value === null && field.status !== "UNVERIFIED")
      add("Unknown values must remain UNVERIFIED.");
    if (field.value === null && (field.verification || field.estimate))
      add("Unknown values cannot have verified or estimated numbers.");
    if (typeof field.value === "number" || Array.isArray(field.value)) {
      if (!field.unit || field.unit === "TEXT" || field.unit === "BOOLEAN")
        add("Numeric evidence requires a numeric unit or explicit UNSPECIFIED raw-display status.");
    }
    if (
      typeof field.value === "string" &&
      field.unit !== null &&
      field.unit !== "TEXT" &&
      field.unit !== "UNSPECIFIED"
    )
      add("String evidence cannot use numeric or boolean units.");
    if (typeof field.value === "boolean" && field.unit !== null && field.unit !== "BOOLEAN")
      add("Boolean evidence must use BOOLEAN or an unknown unit.");
    if (Array.isArray(field.value) && field.value[0] > field.value[1])
      add("A range must be ordered [minimum, maximum].");
    if (field.unit === "COUNT" || field.unit === "LEVEL") {
      const numbers = Array.isArray(field.value)
        ? field.value
        : typeof field.value === "number"
          ? [field.value]
          : [];
      if (numbers.some((number) => !Number.isSafeInteger(number)))
        add(
          "Counts and levels must be safe integers; signed modifier semantics require separate field review.",
        );
    }
    if (new Set(field.sourceIds).size !== field.sourceIds.length)
      add("Source references must be unique.");
    if (field.status === "OFFICIAL" && field.sourceIds.length === 0)
      add("OFFICIAL requires a primary source.");
    if (field.status === "COMMUNITY VERIFIED") {
      if (!field.verification || field.sourceIds.length === 0)
        add("COMMUNITY VERIFIED requires reproducible evidence and review.");
      if (field.verification && new Set(field.verification.reviewerIds).size < 2)
        add("Independent reviewer IDs must be distinct.");
    }
    if (field.status === "ESTIMATED" && !field.estimate)
      add("ESTIMATED requires assumptions and uncertainty.");
    if (field.status !== "COMMUNITY VERIFIED" && field.verification)
      add("Verification metadata is reserved for COMMUNITY VERIFIED.");
    if (field.status !== "ESTIMATED" && field.estimate)
      add("Estimate metadata is reserved for ESTIMATED.");
  });

const sourceSchema = z.strictObject({
  id: text,
  title: text,
  url: httpsUrl,
  publishedAt: date,
  checkedAt: date,
});
const sampleSchema = z.strictObject({
  id: text,
  category: z.enum(DATA_CATEGORIES),
  name: text,
  patchContext: text.nullable(),
  scenarioContext: text.nullable(),
  currentValidity: z.literal("UNVERIFIED"),
  fields: z.array(evidenceFieldSchema).min(1),
  notes: z.array(text),
});

/** Structural evidence validation; it does not prove that a source assertion is true. */
export const evidenceCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(DATA_SPEC_VERSION),
    kind: z.literal("HISTORICAL_EVIDENCE"),
    checkedAt: date,
    sources: z.array(sourceSchema).min(1),
    samples: z.array(sampleSchema).min(1),
    unknowns: z.array(text),
  })
  .superRefine((catalog, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const sources = new Map(catalog.sources.map((source) => [source.id, source]));
    if (sources.size !== catalog.sources.length) add(["sources"], "Source IDs must be unique.");
    if (new Set(catalog.samples.map((sample) => sample.id)).size !== catalog.samples.length)
      add(["samples"], "Sample IDs must be unique.");
    catalog.sources.forEach((source, index) => {
      if (source.publishedAt > source.checkedAt || source.checkedAt > catalog.checkedAt)
        add(["sources", index], "Source dates must not exceed the catalog review date.");
    });
    catalog.samples.forEach((sample, sampleIndex) => {
      if (new Set(sample.fields.map((field) => field.path)).size !== sample.fields.length)
        add(["samples", sampleIndex, "fields"], "Field paths must be unique per sample.");
      if (!sample.fields.some((field) => field.path === "name" && field.value === sample.name))
        add(["samples", sampleIndex, "name"], "Every sample name needs matching field evidence.");
      sample.fields.forEach((field, fieldIndex) => {
        field.sourceIds.forEach((id) => {
          const source = sources.get(id);
          const path = ["samples", sampleIndex, "fields", fieldIndex, "sourceIds"];
          if (!source) add(path, `Unknown source reference: ${id}`);
          if (source && field.status === "OFFICIAL") {
            const sourceUrl = new URL(source.url);
            const hostname = sourceUrl.hostname;
            const officialGame =
              hostname === "oncehuman.game" || hostname.endsWith(".oncehuman.game");
            const officialSteamNews =
              hostname === "store.steampowered.com" &&
              /^\/news\/app\/2139460\/view\/\d+\/?$/.test(sourceUrl.pathname);
            const officialSteamAnnouncement =
              hostname === "steamcommunity.com" &&
              /^\/games\/2139460\/announcements\/detail\/\d+\/?$/.test(sourceUrl.pathname);
            if (!(officialGame || officialSteamNews || officialSteamAnnouncement))
              add(
                path,
                "OFFICIAL must reference the primary game site or this game's official Steam announcement path; content still requires human review.",
              );
          }
        });
      });
    });
  });

export type SourceGrade = (typeof SOURCE_GRADES)[number];
export type DataCategory = (typeof DATA_CATEGORIES)[number];
export type EvidenceField = z.infer<typeof evidenceFieldSchema>;
export type EvidenceCatalog = z.infer<typeof evidenceCatalogSchema>;

/** No missing quantity is ever coerced to zero, and historical evidence is never a current stat baseline. */
export function parseEvidenceCatalog(input: unknown, reviewedAsOf: string): EvidenceCatalog {
  const catalog = evidenceCatalogSchema.parse(input);
  const reviewDate = date.parse(reviewedAsOf);
  if (catalog.checkedAt > reviewDate)
    throw new Error("Catalog check date exceeds the supplied review date.");
  return catalog;
}
