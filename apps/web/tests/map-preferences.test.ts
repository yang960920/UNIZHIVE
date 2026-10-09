import { describe, expect, it } from "vitest";
import { getMapView } from "../src/lib/map-navigation";
import {
  mapSelectionCookieName,
  parseMapSelection,
  resolveMapPreferenceQuery,
  scenarioSlugToMap,
  serializeMapSelection,
} from "../src/lib/map-preferences";
import { DEFAULT_USER_PREFERENCES } from "../src/lib/user-preferences";

describe("personal map defaults and remembered public filters", () => {
  it("uses the current season or the manually selected default", () => {
    expect(
      resolveMapPreferenceQuery({}, DEFAULT_USER_PREFERENCES, "ENDLESS_DREAM", undefined),
    ).toEqual({ scenario: "ENDLESS_DREAM" });
    expect(
      resolveMapPreferenceQuery(
        {},
        { ...DEFAULT_USER_PREFERENCES, mapScenario: "WINTER" },
        "MANIBUS",
        undefined,
      ),
    ).toEqual({ scenario: "WINTER" });
    expect(scenarioSlugToMap("the-way-of-winter")).toBe("WINTER");
    expect(scenarioSlugToMap("unknown")).toBe("MANIBUS");
  });
  it("remembers verified target filters and respects disabling persistence", () => {
    const saved = serializeMapSelection(getMapView({ scenario: "MANIBUS", target: "99000011" }));
    expect(parseMapSelection(saved)).toEqual({ scenario: "MANIBUS", target: "99000011" });
    expect(resolveMapPreferenceQuery({}, DEFAULT_USER_PREFERENCES, "WINTER", saved)).toEqual({
      scenario: "MANIBUS",
      target: "99000011",
    });
    expect(
      resolveMapPreferenceQuery(
        {},
        { ...DEFAULT_USER_PREFERENCES, rememberMapFilters: false },
        "WINTER",
        saved,
      ),
    ).toEqual({ scenario: "WINTER" });
  });
  it.each([{ scenario: "WINTER" }, { target: "99000011" }, { location: "" }, { share: "draw_1" }])(
    "preserves explicit navigation and clear-filter links: %j",
    (query) => {
      expect(
        resolveMapPreferenceQuery(
          query,
          DEFAULT_USER_PREFERENCES,
          "ENDLESS_DREAM",
          '{"scenario":"WINTER"}',
        ),
      ).toEqual(query);
    },
  );
  it.each([
    '{"scenario":"https://evil.example"}',
    '{"scenario":"MANIBUS","share":"private_drawing"}',
    '{"scenario":"MANIBUS","target":"unknown"}',
    '{"scenario":"MANIBUS","location":"unknown"}',
    '{"scenario":"MANIBUS","target":"99000011","location":"locations-silos"}',
    '{"scenario":"MANIBUS","userId":"someone-else"}',
    "[]",
    "null",
    "invalid",
    "x".repeat(513),
  ])("ignores tampered or unsupported remembered selections: %s", (value) => {
    expect(parseMapSelection(value)).toBeNull();
  });
  it("never saves a shared drawing and isolates selection cookies by signed account", () => {
    expect(serializeMapSelection(getMapView({ scenario: "WINTER", share: "secret_123" }))).toBe(
      '{"scenario":"WINTER"}',
    );
    expect(mapSelectionCookieName("member-a")).not.toBe(mapSelectionCookieName("member-b"));
    expect(mapSelectionCookieName("visitor")).toBeNull();
    expect(mapSelectionCookieName("bad; Path=/")).toBeNull();
  });
});
