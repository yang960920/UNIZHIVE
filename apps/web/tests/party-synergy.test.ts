import { describe, expect, it } from "vitest";
import { emptyPartyContribution, type PartyContribution } from "@uniz/domain";
import {
  PARTY_CONTRIBUTIONS,
  PARTY_SYNERGY_GUIDE,
  PARTY_VULNERABILITY_CAP,
  partyContributionKeysSchema,
  partyContributionSchema,
  readPartyContribution,
  summarizePartySynergy,
} from "../src/lib/party-synergy";

function setup(values: Partial<PartyContribution> = {}): PartyContribution {
  return { ...emptyPartyContribution(), ...values };
}

describe("optional party contributions", () => {
  it("accepts a free setup and trims a gear/deviation note", () => {
    expect(partyContributionSchema.parse({})).toEqual(emptyPartyContribution());
    expect(
      partyContributionSchema.parse({ loadoutNote: "  저주 인형 · 리커브  " }).loadoutNote,
    ).toBe("저주 인형 · 리커브");
  });

  it("rejects fixed roles, unknown fields and duplicate contribution selections", () => {
    for (const value of [["Tank"], ["healing", "healing"], ["DPS"], ["support"]])
      expect(partyContributionKeysSchema.safeParse(value).success).toBe(false);
    expect(partyContributionSchema.safeParse({ roleId: "op-support" }).success).toBe(false);
    expect(partyContributionSchema.safeParse({ loadoutNote: "x".repeat(241) }).success).toBe(false);
  });

  it("rejects invalid or non-finite percentages instead of coercing them", () => {
    for (const value of [-1, 101, Infinity, NaN, "60", [], {}])
      expect(partyContributionSchema.safeParse({ vulnerability: { weapon: value } }).success).toBe(
        false,
      );
    expect(
      partyContributionSchema.safeParse({ vulnerability: { weapon: 0, status: 34.5 } }).success,
    ).toBe(true);
  });

  it("keeps unknown percentages distinct from a declared zero", () => {
    const unknown = summarizePartySynergy([{ status: "GOING", contribution: setup() }]);
    const zero = summarizePartySynergy([
      {
        status: "GOING",
        contribution: setup({ vulnerability: { weapon: 0, status: null, melee: null } }),
      },
    ]);
    expect(unknown.vulnerability.weapon.enteredCount).toBe(0);
    expect(zero.vulnerability.weapon).toEqual({ rawTotal: 0, cappedTotal: 0, enteredCount: 1 });
  });

  it("caps confirmed attendees' sums at 100 independently for each damage type", () => {
    const result = summarizePartySynergy([
      {
        status: "GOING",
        contribution: setup({
          keys: ["weapon-vulnerability", "status-vulnerability", "melee-vulnerability"],
          vulnerability: { weapon: 60, status: 60, melee: 60 },
        }),
      },
      {
        status: "GOING",
        contribution: setup({
          keys: ["bulls-eye", "healing"],
          vulnerability: { weapon: 60, status: 34, melee: 60 },
        }),
      },
      {
        status: "MAYBE",
        contribution: setup({ vulnerability: { weapon: 100, status: 100, melee: 100 } }),
      },
      {
        status: "UNAVAILABLE",
        contribution: setup({ vulnerability: { weapon: 100, status: 100, melee: 100 } }),
      },
    ]);
    expect(PARTY_VULNERABILITY_CAP).toBe(100);
    expect(result.goingCount).toBe(2);
    expect(result.vulnerability).toEqual({
      weapon: { rawTotal: 120, cappedTotal: 100, enteredCount: 2 },
      status: { rawTotal: 94, cappedTotal: 94, enteredCount: 2 },
      melee: { rawTotal: 120, cappedTotal: 100, enteredCount: 2 },
    });
    expect(result.contributions.find((item) => item.key === "healing")?.count).toBe(1);
  });

  it("avoids floating point noise and safely reads legacy empty records", () => {
    const result = summarizePartySynergy(
      [0.1, 0.2].map((weapon) => ({
        status: "GOING",
        contribution: setup({ vulnerability: { weapon, status: null, melee: null } }),
      })),
    );
    expect(result.vulnerability.weapon.rawTotal).toBe(0.3);
    expect(readPartyContribution({})).toEqual(emptyPartyContribution());
    expect(readPartyContribution(null)).toEqual(emptyPartyContribution());
    expect(readPartyContribution({ keys: ["Tank"] })).toEqual(emptyPartyContribution());
    const original = emptyPartyContribution();
    original.keys.push("healing");
    expect(emptyPartyContribution().keys).toEqual([]);
  });

  it("covers every selectable contribution with scoped, sourced interaction guidance", () => {
    for (const contribution of PARTY_CONTRIBUTIONS)
      expect(
        PARTY_SYNERGY_GUIDE.some((guide) => guide.categoryKeys.includes(contribution.key)),
      ).toBe(true);
    for (const guide of PARTY_SYNERGY_GUIDE) {
      expect(guide.scope.length).toBeGreaterThan(0);
      expect(guide.caution.length).toBeGreaterThan(0);
      expect(guide.sources.length).toBeGreaterThan(0);
    }
  });
});
