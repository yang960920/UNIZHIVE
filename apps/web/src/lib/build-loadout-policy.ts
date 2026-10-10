import { z } from "zod";
import { BuildPlannerError } from "./build-planner-policy";

export const MAX_LOADOUT_BUILDS = 32;
const existing = { loadoutId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }) };
const schema = z.discriminatedUnion("action", [
  z
    .strictObject({
      action: z.literal("SAVE_LOADOUT"),
      loadoutId: existing.loadoutId.optional(),
      expectedUpdatedAt: existing.expectedUpdatedAt.optional(),
      title: z.string().trim().min(2).max(100),
      notes: z.string().trim().max(2000).default(""),
      buildVersionIds: z.array(z.uuid()).min(2).max(MAX_LOADOUT_BUILDS),
    })
    .superRefine((value, context) => {
      if (Boolean(value.loadoutId) !== Boolean(value.expectedUpdatedAt))
        context.addIssue({
          code: "custom",
          path: ["expectedUpdatedAt"],
          message: "Missing version lock",
        });
      if (new Set(value.buildVersionIds).size !== value.buildVersionIds.length)
        context.addIssue({
          code: "custom",
          path: ["buildVersionIds"],
          message: "Duplicate build version",
        });
    }),
  z.strictObject({ action: z.literal("ARCHIVE_LOADOUT"), ...existing }),
  z.strictObject({ action: z.literal("RESTORE_LOADOUT"), ...existing }),
]);
export type BuildLoadoutMutation = z.infer<typeof schema>;

export function parseBuildLoadoutMutation(value: unknown): BuildLoadoutMutation {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new BuildPlannerError("INVALID_INPUT");
  }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > 16 * 1024)
    throw new BuildPlannerError("PAYLOAD_TOO_LARGE");
  const result = schema.safeParse(value);
  if (!result.success) throw new BuildPlannerError("INVALID_INPUT");
  return result.data;
}
