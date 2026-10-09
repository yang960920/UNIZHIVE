import { z } from "zod";

export const userPreferencesSchema = z
  .object({
    startPage: z.enum(["/", "/season", "/ops", "/map", "/lab", "/community"]),
    textSize: z.enum(["DEFAULT", "LARGE"]),
    reduceMotion: z.boolean(),
    showGuide: z.boolean(),
    mapScenario: z.enum(["CURRENT", "MANIBUS", "WINTER", "ENDLESS_DREAM", "DEVIATION"]),
    rememberMapFilters: z.boolean(),
    defaultBuildVisibility: z.enum(["PRIVATE", "HIVE", "PUBLIC"]),
    notifyAnnouncements: z.boolean(),
    notifyPartyChanges: z.boolean(),
    notifyPartyReminders: z.boolean(),
    notifyVoteDeadlines: z.boolean(),
    notifyComments: z.boolean(),
    reminderMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  })
  .strict();

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  startPage: "/",
  textSize: "DEFAULT",
  reduceMotion: false,
  showGuide: true,
  mapScenario: "CURRENT",
  rememberMapFilters: true,
  defaultBuildVisibility: "PRIVATE",
  notifyAnnouncements: true,
  notifyPartyChanges: true,
  notifyPartyReminders: true,
  notifyVoteDeadlines: true,
  notifyComments: true,
  reminderMinutes: 30,
};

/** Stored preferences may predate new fields; never preserve unknown keys or identity data. */
export function normalizeUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...DEFAULT_USER_PREFERENCES };
  const candidate = Object.fromEntries(
    Object.entries(DEFAULT_USER_PREFERENCES).map(([key, fallback]) => [
      key,
      Object.prototype.hasOwnProperty.call(value, key)
        ? (value as Record<string, unknown>)[key]
        : fallback,
    ]),
  );
  const parsed = userPreferencesSchema.safeParse(candidate);
  return parsed.success ? parsed.data : { ...DEFAULT_USER_PREFERENCES };
}

export function demoPreferencesCookieName(userId: string): string {
  if (!["demo-member", "demo-officer", "demo-admin"].includes(userId))
    throw new Error("Invalid preview identity");
  return `uniz-prefs-${userId}`;
}
