import { z } from "zod";
import {
  PLANNER_CATEGORIES,
  PLANNER_COUNT_STORAGE_LIMIT,
  PLANNER_MAX_ENTRIES,
  PLANNER_MAX_PAYLOAD_BYTES,
  PLANNER_MAX_ROLLS,
  PLANNER_REFERENCE_CATALOG,
  PLANNER_ROLL_STORAGE_LIMIT,
  PLANNER_SCENARIO_KEYS,
  PLANNER_SCHEMA_VERSION,
  type PlannerLoadout,
  type PlannerReferenceCatalog,
} from "../model/planner";

const nullableCount = z.number().finite().int().min(0).max(PLANNER_COUNT_STORAGE_LIMIT).nullable();
const nullableRoll = z
  .number()
  .finite()
  .min(-PLANNER_ROLL_STORAGE_LIMIT)
  .max(PLANNER_ROLL_STORAGE_LIMIT)
  .nullable();
const nullableLabel = z.string().trim().min(1).max(120).nullable();
const uuid = z.uuid().toLowerCase();

export const plannerLoadoutSchema = z
  .strictObject({
    schemaVersion: z.literal(PLANNER_SCHEMA_VERSION),
    context: z.strictObject({
      gamePatch: nullableLabel,
      scenarioKey: z.enum(PLANNER_SCENARIO_KEYS).nullable(),
      mode: z.enum(["PVE", "PVP"]).nullable(),
      platform: z.enum(["PC", "MOBILE"]).nullable(),
      characterClass: nullableLabel,
    }),
    entries: z
      .array(
        z.strictObject({
          id: uuid,
          category: z.enum(PLANNER_CATEGORIES),
          slotLabel: z.string().trim().max(60),
          name: z.string().trim().min(1).max(120),
          linkedEntryId: uuid.nullable(),
          reference: z
            .strictObject({
              recordId: z.string().trim().min(1).max(160),
              revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
            })
            .nullable(),
          instance: z.strictObject({
            tier: nullableCount,
            stars: nullableCount,
            calibration: nullableCount,
            level: nullableCount,
            rolls: z
              .array(
                z.strictObject({
                  label: z.string().trim().min(1).max(60),
                  value: nullableRoll,
                  unit: z.enum(["PERCENT", "FLAT"]).nullable(),
                }),
              )
              .max(PLANNER_MAX_ROLLS),
          }),
          notes: z.string().max(1000),
        }),
      )
      .max(PLANNER_MAX_ENTRIES),
  })
  .superRefine((loadout, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(loadout)).byteLength > PLANNER_MAX_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: "Planner snapshot exceeds the storage payload limit.",
      });
    }
    const indexes = new Map<string, number>();
    loadout.entries.forEach((entry, index) => {
      if (indexes.has(entry.id))
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: "Entry IDs must be unique.",
        });
      indexes.set(entry.id, index);
    });
    loadout.entries.forEach((entry, index) => {
      const target = entry.linkedEntryId;
      if (!target) return;
      const path = ["entries", index, "linkedEntryId"];
      if (target === entry.id) {
        ctx.addIssue({ code: "custom", path, message: "An entry cannot link to itself." });
        return;
      }
      if (!indexes.has(target)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "A linked target must exist in this snapshot.",
        });
        return;
      }
      const visited = new Set<string>([entry.id]);
      let cursor: string | null = target;
      while (cursor !== null) {
        if (visited.has(cursor)) {
          ctx.addIssue({ code: "custom", path, message: "Entry links cannot form a cycle." });
          return;
        }
        visited.add(cursor);
        const linkedIndex = indexes.get(cursor);
        cursor = linkedIndex === undefined ? null : loadout.entries[linkedIndex].linkedEntryId;
      }
    });
  });

/** Server callers must use this parser so reference identity is checked against their catalog. */
export function parsePlannerLoadout(
  input: unknown,
  catalog: PlannerReferenceCatalog = PLANNER_REFERENCE_CATALOG,
): PlannerLoadout {
  // Bound the original input too: normalization must not hide oversized whitespace or metadata.
  let bytes = PLANNER_MAX_PAYLOAD_BYTES + 1;
  try {
    const serialized = JSON.stringify(input);
    if (serialized !== undefined) bytes = new TextEncoder().encode(serialized).byteLength;
  } catch {
    throw new z.ZodError([
      { code: "custom", path: [], message: "Planner input must be JSON-safe." },
    ]);
  }
  if (bytes > PLANNER_MAX_PAYLOAD_BYTES) {
    throw new z.ZodError([
      { code: "custom", path: [], message: "Planner input exceeds the storage payload limit." },
    ]);
  }
  const loadout = plannerLoadoutSchema.parse(input);
  const references = new Map(
    catalog.map((entry) => [`${entry.recordId}:${entry.revision}`, entry]),
  );
  const issues: z.core.$ZodIssue[] = [];
  loadout.entries.forEach((entry, index) => {
    if (!entry.reference) return;
    const reference = references.get(`${entry.reference.recordId}:${entry.reference.revision}`);
    if (!reference) {
      issues.push({
        code: "custom",
        path: ["entries", index, "reference"],
        message: "Unknown item reference or unsupported data revision.",
      });
    } else {
      if (entry.category !== reference.category)
        issues.push({
          code: "custom",
          path: ["entries", index, "category"],
          message: "Category must match the exact referenced item.",
        });
      if (entry.name !== reference.name)
        issues.push({
          code: "custom",
          path: ["entries", index, "name"],
          message: "Name must match the exact referenced item.",
        });
    }
  });
  if (issues.length > 0) throw new z.ZodError(issues);
  return loadout;
}
