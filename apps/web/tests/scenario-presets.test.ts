import { describe, expect, it } from "vitest";
import {
  formatScenarioServerName,
  getScenarioPreset,
  isScenarioServerNumber,
  SCENARIO_PRESETS,
  type ScenarioPresetKey,
} from "../src/lib/scenario-presets";
import { seasonAdministrationSchema } from "../src/lib/season-admin-policy";

const registration = {
  action: "REGISTER_SERVER",
  scenarioKey: "DEVIATION",
  serverNumber: "0007",
  region: "Asia",
};

describe("scenario presets and server addresses", () => {
  it.each([
    ["DEVIATION", "비정상수용(Deviation)", "deviation", "Deviation-X0007"],
    ["MANIBUS", "땃쥐(Manibus)", "manibus", "Manibus-X0007"],
    ["WINTER", "설산(The Way Of Winter)", "the-way-of-winter", "W_Winter-X0007"],
    ["ENDLESS_DREAM", "무한의 꿈(Endless Dream)", "endless-dream", "E_Dream-X0007"],
  ] as const)(
    "formats %s with its canonical label, slug, and fixed prefix",
    (key, label, slug, address) => {
      expect(getScenarioPreset(key)).toMatchObject({ key, label, slug });
      expect(formatScenarioServerName(key, "0007")).toBe(address);
      expect(seasonAdministrationSchema.parse({ ...registration, scenarioKey: key })).toMatchObject(
        { serverNumber: "0007" },
      );
    },
  );

  it("accepts the complete four-digit range while preserving leading zeros", () => {
    for (const number of ["0000", "0001", "0999", "9999"]) {
      expect(isScenarioServerNumber(number)).toBe(true);
      expect(formatScenarioServerName("MANIBUS", number)).toBe(`Manibus-X${number}`);
      expect(
        seasonAdministrationSchema.safeParse({ ...registration, serverNumber: number }).success,
      ).toBe(true);
    }
  });

  it.each([
    "",
    "0",
    "123",
    "12345",
    "10000",
    "-001",
    "+001",
    "1e03",
    "1.00",
    " 001",
    "0001 ",
    "0001\n",
    "１２３４",
    "١٢٣٤",
    "Manibus-X0001",
  ])("rejects malformed or injected server number %j", (serverNumber) => {
    expect(isScenarioServerNumber(serverNumber)).toBe(false);
    expect(() => formatScenarioServerName("DEVIATION", serverNumber)).toThrow(RangeError);
    expect(seasonAdministrationSchema.safeParse({ ...registration, serverNumber }).success).toBe(
      false,
    );
  });

  it("rejects client-supplied prefixes, names, slugs, scenario IDs, and role overrides", () => {
    for (const injection of [
      { serverPrefix: "Unknown-X" },
      { name: "Unknown-X0007" },
      { slug: "custom" },
      { scenarioId: "094c6679-b793-4f76-ad57-a06e611bb1cc" },
      { role: "ADMIN" },
    ])
      expect(seasonAdministrationSchema.safeParse({ ...registration, ...injection }).success).toBe(
        false,
      );
  });

  it("requires a known scenario key and a string number", () => {
    expect(SCENARIO_PRESETS).toHaveLength(4);
    for (const scenarioKey of ["", "deviation", "Manibus", "UNKNOWN", "DEVIATION "])
      expect(seasonAdministrationSchema.safeParse({ ...registration, scenarioKey }).success).toBe(
        false,
      );
    for (const serverNumber of [7, 1000, null, undefined])
      expect(seasonAdministrationSchema.safeParse({ ...registration, serverNumber }).success).toBe(
        false,
      );
    expect(getScenarioPreset("UNKNOWN")).toBeUndefined();
    expect(() => formatScenarioServerName("UNKNOWN" as ScenarioPresetKey, "0007")).toThrow(
      RangeError,
    );
  });
});
