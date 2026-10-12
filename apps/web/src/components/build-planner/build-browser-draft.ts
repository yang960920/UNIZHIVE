import { z } from "zod";
import {
  GEAR_SLOT_IDS,
  PLANNER_MAX_ENTRIES,
  PLANNER_MAX_ROLLS,
  gearLoadoutSchema,
  plannerLoadoutSchema,
  type PlannerEntry,
  type PlannerGearLoadout,
  type PlannerLoadout,
  type PlannerRoll,
} from "@uniz/build-engine";
import { isContentEditorDraft, type ContentEditorDraft } from "@/components/content/draft";
import type { BuildVisibility } from "@/lib/data/build-planner-types";

export type CountField = "tier" | "stars" | "calibration" | "level";
export type DraftRoll = Omit<PlannerRoll, "value"> & { value: string };
export type DraftEntry = Omit<PlannerEntry, "instance"> & {
  instance: Record<CountField, string> & { rolls: DraftRoll[] };
};
export type DraftLoadout = Omit<PlannerLoadout, "entries"> & { entries: DraftEntry[] };

interface BrowserBuildDraftBase {
  format: 1;
  title: string;
  description: string;
  visibility: BuildVisibility;
  notes: string;
  youtubeUrl: string;
  bodyDraft: ContentEditorDraft | null;
  baseBuildId: string | null;
  baseVersionStamp: string | null;
  baseSourceVersion: number | null;
}

export interface GearBrowserBuildDraft extends BrowserBuildDraftBase {
  editor: "gear";
  loadout: PlannerGearLoadout;
  numberTexts: Record<string, string>;
  numberErrors: Record<string, string>;
  focusedSlot: (typeof GEAR_SLOT_IDS)[number];
}

export interface LegacyBrowserBuildDraft extends BrowserBuildDraftBase {
  editor: "legacy";
  loadout: DraftLoadout;
}

// Drafts accept incomplete text. Publishing still uses the stricter server validators.
const draftText = z.string().max(100_000);
const contextSchema = z.strictObject({
  ...plannerLoadoutSchema.shape.context.shape,
  gamePatch: draftText.nullable(),
  characterClass: draftText.nullable(),
});
const commonSchema = z.object({
  format: z.literal(1),
  title: draftText,
  description: draftText,
  visibility: z.enum(["PRIVATE", "HIVE", "PUBLIC"]),
  notes: draftText,
  youtubeUrl: draftText,
  baseBuildId: z.string().min(1).max(160).nullable(),
  baseVersionStamp: z.string().max(80).nullable(),
  baseSourceVersion: z.number().int().min(1).nullable(),
});
const rawGearSchema = z.strictObject({
  ...gearLoadoutSchema.shape,
  context: contextSchema,
  notes: draftText,
  recommendation: z.strictObject({
    ...gearLoadoutSchema.shape.recommendation.shape,
    contents: z.array(draftText).max(16),
    // A partially entered tag such as '#' is recoverable before it becomes publishable.
    tags: z.array(draftText).max(24),
    notes: draftText,
  }),
  consumables: z
    .strictObject({
      ...gearLoadoutSchema.shape.consumables.unwrap().shape,
      notes: draftText,
    })
    .optional(),
  catalogNames: z.record(z.string().min(1).max(160), draftText).optional(),
});
const numberTextSchema = z.record(z.string().max(100), z.string().max(100));
const gearDraftSchema = commonSchema.extend({
  editor: z.literal("gear"),
  loadout: rawGearSchema,
  numberTexts: numberTextSchema,
  numberErrors: z.record(z.string().max(100), z.string().max(300)),
  focusedSlot: z.enum(GEAR_SLOT_IDS),
});
const entrySchema = plannerLoadoutSchema.shape.entries.element;
const rollSchema = entrySchema.shape.instance.shape.rolls.element;
const rawLegacySchema = z.strictObject({
  ...plannerLoadoutSchema.shape,
  context: contextSchema,
  entries: z
    .array(
      z.strictObject({
        ...entrySchema.shape,
        name: draftText,
        slotLabel: draftText,
        notes: draftText,
        instance: z.strictObject({
          tier: z.string().max(100),
          stars: z.string().max(100),
          calibration: z.string().max(100),
          level: z.string().max(100),
          rolls: z
            .array(
              z.strictObject({
                ...rollSchema.shape,
                label: draftText,
                value: z.string().max(100),
              }),
            )
            .max(PLANNER_MAX_ROLLS),
        }),
      }),
    )
    .max(PLANNER_MAX_ENTRIES),
});
const legacyDraftSchema = commonSchema.extend({
  editor: z.literal("legacy"),
  loadout: rawLegacySchema,
});

function validBodyDraft(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const bodyDraft = (value as Record<string, unknown>).bodyDraft;
  return bodyDraft === null || isContentEditorDraft(bodyDraft);
}

export function isGearBrowserBuildDraft(value: unknown): value is GearBrowserBuildDraft {
  return gearDraftSchema.safeParse(value).success && validBodyDraft(value);
}

export function isLegacyBrowserBuildDraft(value: unknown): value is LegacyBrowserBuildDraft {
  return legacyDraftSchema.safeParse(value).success && validBodyDraft(value);
}
