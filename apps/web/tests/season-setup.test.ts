import { describe, expect, it } from "vitest";
import { seasonAdministrationSchema } from "../src/lib/season-admin-policy";
import { SCENARIO_PRESETS } from "../src/lib/scenario-presets";

const draft = {
  action: "CREATE_SEASON_SETUP",
  scenarioKey: "DEVIATION",
  serverNumber: "0070",
  region: "한국",
  name: "첫 시즌",
  startsAt: "2026-10-08T09:30:00+09:00",
  settlementAt: "2026-11-08T09:30:00+09:00",
};

describe("unified season setup input boundary", () => {
  it("accepts all four preset identities, leading zeroes and explicit timezone dates", () => {
    for (const preset of SCENARIO_PRESETS) {
      const input = seasonAdministrationSchema.parse({ ...draft, scenarioKey: preset.key });
      expect(input).toMatchObject({ scenarioKey: preset.key, serverNumber: "0070" });
    }
  });

  it("rejects forged catalog, lifecycle and authorization fields", () => {
    for (const extra of [
      { prefix: "Forged-X" },
      { serverId: "7e67ebd2-e6ab-4d82-b72a-5c70f3a81d50" },
      { scenarioId: "7418d430-13ec-4129-bccd-ea3b14fc2634" },
      { status: "ACTIVE" },
      { voteClosesAt: draft.settlementAt },
      { actorId: "7e67ebd2-e6ab-4d82-b72a-5c70f3a81d50" },
      { role: "ADMIN" },
      { seasonNumber: 70 },
    ]) {
      expect(seasonAdministrationSchema.safeParse({ ...draft, ...extra }).success).toBe(false);
    }
  });

  it("accepts an optional settlement date and requires a version when editing", () => {
    expect(seasonAdministrationSchema.safeParse({ ...draft, settlementAt: null }).success).toBe(
      true,
    );
    const edit = {
      ...draft,
      action: "SAVE_SEASON_SETUP",
      id: "7e67ebd2-e6ab-4d82-b72a-5c70f3a81d50",
    };
    expect(seasonAdministrationSchema.safeParse(edit).success).toBe(false);
    expect(
      seasonAdministrationSchema.safeParse({ ...edit, expectedUpdatedAt: draft.startsAt }).success,
    ).toBe(true);
  });

  it("rejects noncanonical scenario numbers and incomplete calendar values", () => {
    for (const patch of [
      { scenarioKey: "UNKNOWN" },
      { serverNumber: "70" },
      { serverNumber: "00000" },
      { serverNumber: "00x0" },
      { serverNumber: "００７０" },
      { serverNumber: 70 },
      { startsAt: "2026-10-08" },
      { startsAt: "2026-10-08T09:30:00" },
      { settlementAt: "" },
      { seasonNumber: 0 },
      { seasonNumber: 1.5 },
    ]) {
      expect(seasonAdministrationSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
    }
  });

  it("keeps legacy omissions but requires explicitly selected values on new environment inputs", () => {
    expect(seasonAdministrationSchema.safeParse(draft).success).toBe(true);
    const environment = { serverType: "SEASONAL", trancePhenomenon: "GRAVITY_ABYSS" };
    expect(seasonAdministrationSchema.parse({ ...draft, ...environment })).toMatchObject(
      environment,
    );
    for (const patch of [
      { serverType: "UNKNOWN" },
      { trancePhenomenon: "UNKNOWN" },
      { serverType: "CUSTOM" },
      { trancePhenomenon: "OTHER" },
      { migrationOpen: "true" },
    ])
      expect(seasonAdministrationSchema.safeParse({ ...draft, ...patch }).success).toBe(false);

    expect(
      seasonAdministrationSchema.safeParse({
        ...draft,
        action: "SAVE_SEASON_SETUP",
        id: "7e67ebd2-e6ab-4d82-b72a-5c70f3a81d50",
        expectedUpdatedAt: draft.startsAt,
        serverType: "UNKNOWN",
        trancePhenomenon: "UNKNOWN",
      }).success,
    ).toBe(true);
  });

  it("requires permanent servers to have no settlement date", () => {
    const permanent = { ...draft, serverType: "PERMANENT", trancePhenomenon: "NONE" };
    expect(seasonAdministrationSchema.safeParse(permanent).success).toBe(false);
    expect(
      seasonAdministrationSchema.safeParse({
        ...permanent,
        settlementAt: null,
        migrationOpen: true,
      }).success,
    ).toBe(true);
  });
});
