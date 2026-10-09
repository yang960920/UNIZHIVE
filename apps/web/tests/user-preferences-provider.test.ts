import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const boundary = vi.hoisted(() => ({ override: null as unknown }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    boundary.override,
    (value: unknown) => {
      boundary.override = value;
    },
  ],
  useEffect: (callback: () => void) => callback(),
}));
vi.mock("@/lib/user-preferences", () => import("../src/lib/user-preferences"));

import { UserPreferencesProvider } from "../src/components/user-preferences-provider";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "../src/lib/user-preferences";

interface ContextValue {
  preferences: UserPreferences;
  userKey: string;
  updatePreferences: (value: UserPreferences) => void;
}
function render(
  userKey: string,
  initial: UserPreferences = { ...DEFAULT_USER_PREFERENCES },
): ContextValue {
  const tree = UserPreferencesProvider({ initial, userKey, children: null }) as ReactElement<{
    value: ContextValue;
  }>;
  return tree.props.value;
}

beforeEach(() => {
  boundary.override = null;
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
});
afterEach(() => vi.unstubAllGlobals());

describe("personal preference context isolation", () => {
  it("applies saved display preferences after a confirmed local update", () => {
    const confirmed = {
      ...DEFAULT_USER_PREFERENCES,
      textSize: "LARGE" as const,
      reduceMotion: true,
    };
    render("user-a").updatePreferences(confirmed);
    expect(render("user-a").preferences).toEqual(confirmed);
    expect(document.documentElement.dataset.textSize).toBe("LARGE");
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
  });

  it("does not carry the previous person's preferences into another account or visitor", () => {
    const first = { ...DEFAULT_USER_PREFERENCES, showGuide: false, textSize: "LARGE" as const };
    render("user-a").updatePreferences(first);
    expect(render("user-a").preferences).toEqual(first);
    expect(render("user-b").preferences).toEqual(DEFAULT_USER_PREFERENCES);
    expect(render("visitor").preferences).toEqual(DEFAULT_USER_PREFERENCES);
    expect(document.documentElement.dataset.textSize).toBe("DEFAULT");
  });

  it("uses a new server preference snapshot instead of stale local context", () => {
    render("user-a").updatePreferences({ ...DEFAULT_USER_PREFERENCES, showGuide: false });
    const server = { ...DEFAULT_USER_PREFERENCES, reduceMotion: true };
    expect(render("user-a", server).preferences).toEqual(server);
  });
});
