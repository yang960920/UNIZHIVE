import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  demoPreferencesCookieName,
  normalizeUserPreferences,
  userPreferencesSchema,
} from "../src/lib/user-preferences";

describe("personal preference validation", () => {
  it("accepts the complete default settings", () => {
    expect(userPreferencesSchema.parse(DEFAULT_USER_PREFERENCES)).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it.each(["userId", "id", "targetId", "role", "accessToken", "onceHumanUid"])(
    "rejects extra identity or private keys: %s",
    (key) => {
      expect(
        userPreferencesSchema.safeParse({ ...DEFAULT_USER_PREFERENCES, [key]: "untrusted" })
          .success,
      ).toBe(false);
    },
  );

  it.each([
    ["startPage", "https://example.com"],
    ["startPage", "/admin"],
    ["startPage", "//example.com"],
    ["textSize", "HUGE"],
    ["mapScenario", "unknown"],
    ["defaultBuildVisibility", "OTHER"],
    ["notifyAnnouncements", "false"],
    ["showGuide", 0],
    ["reduceMotion", null],
    ["rememberMapFilters", undefined],
    ["reminderMinutes", "30"],
    ["reminderMinutes", 10],
  ])("rejects invalid %s=%s instead of coercing submitted values", (key, value) => {
    expect(
      userPreferencesSchema.safeParse({ ...DEFAULT_USER_PREFERENCES, [key]: value }).success,
    ).toBe(false);
  });

  it("fills new preference fields in older stored records and discards unknown fields", () => {
    const value = normalizeUserPreferences({
      showGuide: false,
      textSize: "LARGE",
      userId: "other-person",
      accessToken: "private-value",
    });
    expect(value).toEqual({ ...DEFAULT_USER_PREFERENCES, showGuide: false, textSize: "LARGE" });
    expect(value).not.toHaveProperty("userId");
    expect(value).not.toHaveProperty("accessToken");
  });

  it.each([null, undefined, "invalid", [], { startPage: "https://example.com" }])(
    "safely replaces malformed stored records",
    (value) => {
      expect(normalizeUserPreferences(value)).toEqual(DEFAULT_USER_PREFERENCES);
    },
  );

  it("returns a separate preference object for each visitor", () => {
    const first = normalizeUserPreferences(null);
    first.showGuide = false;
    expect(normalizeUserPreferences(null).showGuide).toBe(true);
    expect(DEFAULT_USER_PREFERENCES.showGuide).toBe(true);
  });

  it("isolates approved preview identities and rejects arbitrary cookie names", () => {
    expect(
      new Set(["demo-member", "demo-officer", "demo-admin"].map(demoPreferencesCookieName)).size,
    ).toBe(3);
    for (const id of ["visitor", "real-user", "demo-admin; session=spoofed", "../demo-admin", ""]) {
      expect(() => demoPreferencesCookieName(id)).toThrow("Invalid preview identity");
    }
  });
});
