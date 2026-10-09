import { describe, expect, it } from "vitest";
import {
  dpsHasVerification,
  dpsRepresentativeValue,
  dpsReviewSchema,
  dpsSaveSchema,
  isDpsAdministrator,
  isDpsMember,
  type DpsResearchPayload,
} from "../src/lib/dps-research";

const sample: DpsResearchPayload = {
  title: "Fixture measurement",
  summary: "",
  buildVersionId: null,
  composition: "Recorded equipment",
  gamePatch: "Fixture patch",
  scenario: "Fixture scenario",
  trance: "Unknown",
  platform: "PC",
  target: "Fixture target",
  durationSeconds: 30,
  distanceMeters: 0,
  reloadPolicy: "Reload included",
  hitPolicy: "Body hits",
  buffPolicy: "No external buffs",
  procedure: "First hit to 30 seconds",
  measuredAt: "2026-10-09",
  trials: [{ dps: 100, note: "" }],
  evidenceDocument: null,
  evidenceText: "",
  youtubeUrl: "https://www.youtube.com/watch?v=AbcDefGhI_9",
};
describe("DPS record publication and evidence rules", () => {
  it("lets an incomplete draft remain private while requiring complete conditions for submission", () => {
    expect(dpsSaveSchema.safeParse({ action: "DRAFT", payload: { title: "Draft" } }).success).toBe(
      true,
    );
    expect(dpsSaveSchema.safeParse({ action: "SUBMIT", payload: { title: "Draft" } }).success).toBe(
      false,
    );
    expect(dpsSaveSchema.safeParse({ action: "SUBMIT", payload: sample }).success).toBe(true);
  });
  it("requires original video or image evidence rather than a textual claim", () => {
    expect(
      dpsSaveSchema.safeParse({
        action: "SUBMIT",
        payload: { ...sample, youtubeUrl: null, evidenceText: "I verified it" },
      }).success,
    ).toBe(false);
    const image = {
      schemaVersion: "uniz-content.v1",
      type: "doc",
      content: [
        { type: "image", attrs: { imageId: "11111111-1111-4111-8111-111111111111", alt: "Proof" } },
      ],
    };
    expect(
      dpsSaveSchema.safeParse({
        action: "SUBMIT",
        payload: { ...sample, youtubeUrl: null, evidenceDocument: image },
      }).success,
    ).toBe(true);
    expect(
      dpsSaveSchema.safeParse({
        action: "SUBMIT",
        payload: { ...sample, youtubeUrl: "https://example.com/claim" },
      }).success,
    ).toBe(false);
  });
  it("preserves unfinished trial notes in a draft and excludes unknown values from averages", () => {
    const draft = {
      ...sample,
      trials: [
        { dps: null, note: "Measure after changing equipment" },
        { dps: 100, note: "Observed" },
      ],
    };
    const parsed = dpsSaveSchema.parse({ action: "DRAFT", payload: draft });
    expect(parsed.payload.trials[0]).toEqual(draft.trials[0]);
    expect(dpsSaveSchema.safeParse({ action: "SUBMIT", payload: draft }).success).toBe(false);
    expect(dpsRepresentativeValue(draft)).toBe(100);
    expect(dpsRepresentativeValue({ ...draft, trials: [draft.trials[0]] })).toBeNull();
  });
  it("keeps an exact build reference or composition mandatory and does not substitute missing values with zero", () => {
    expect(
      dpsSaveSchema.safeParse({ action: "SUBMIT", payload: { ...sample, composition: "" } })
        .success,
    ).toBe(false);
    for (const changed of [
      { distanceMeters: null },
      { durationSeconds: 0 },
      { gamePatch: "" },
      { procedure: "" },
      { trials: [] },
    ])
      expect(
        dpsSaveSchema.safeParse({ action: "SUBMIT", payload: { ...sample, ...changed } }).success,
      ).toBe(false);
    expect(
      dpsSaveSchema.safeParse({ action: "SUBMIT", payload: { ...sample, distanceMeters: 0 } })
        .success,
    ).toBe(true);
    expect(dpsRepresentativeValue({ ...sample, trials: [] })).toBeNull();
  });
  it("requires a saved-record token and rejects server-owned status or approval fields", () => {
    expect(
      dpsSaveSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        action: "DRAFT",
        payload: sample,
      }).success,
    ).toBe(false);
    expect(
      dpsSaveSchema.safeParse({ action: "SUBMIT", payload: sample, status: "APPROVED" }).success,
    ).toBe(false);
    expect(
      dpsSaveSchema.safeParse({ action: "SUBMIT", payload: { ...sample, verified: true } }).success,
    ).toBe(false);
    for (const action of ["CHANGES_REQUESTED", "REJECT", "REVOKE"])
      expect(
        dpsReviewSchema.safeParse({
          versionId: "11111111-1111-4111-8111-111111111111",
          expectedUpdatedAt: "2026-10-09T00:00:00Z",
          action,
          note: "",
        }).success,
      ).toBe(false);
  });
  it("rejects invalid or excessive measurements without calculating damage from equipment", () => {
    for (const dps of [NaN, Infinity, -1, 1e13])
      expect(
        dpsSaveSchema.safeParse({
          action: "SUBMIT",
          payload: { ...sample, trials: [{ dps, note: "" }] },
        }).success,
      ).toBe(false);
    expect(
      dpsSaveSchema.safeParse({
        action: "SUBMIT",
        payload: { ...sample, trials: Array.from({ length: 21 }, () => ({ dps: 100, note: "" })) },
      }).success,
    ).toBe(false);
    expect(
      dpsRepresentativeValue({
        ...sample,
        trials: [
          { dps: 10, note: "" },
          { dps: 20, note: "" },
          { dps: 24, note: "" },
        ],
      }),
    ).toBe(18);
  });
  it("separates publication from independent verification and excludes the author, duplicate reviewers and withdrawals", () => {
    const trials = { ...sample, trials: Array.from({ length: 3 }, () => ({ dps: 100, note: "" })) };
    expect(dpsHasVerification(trials, "author", [])).toBe(false);
    expect(
      dpsHasVerification(trials, "author", [
        { reviewerId: "author", confirmed: true },
        { reviewerId: "second", confirmed: true },
      ]),
    ).toBe(false);
    expect(
      dpsHasVerification(trials, "author", [
        { reviewerId: "second", confirmed: true },
        { reviewerId: "second", confirmed: true },
      ]),
    ).toBe(false);
    const reviews = [
      { reviewerId: "second", confirmed: true },
      { reviewerId: "third", confirmed: true },
    ];
    expect(dpsHasVerification(sample, "author", reviews)).toBe(false);
    expect(dpsHasVerification(trials, "author", reviews)).toBe(true);
    expect(
      dpsHasVerification(trials, "author", [{ ...reviews[0], confirmed: false }, reviews[1]]),
    ).toBe(false);
  });
  it("requires real member identities and reserves publication review for administrators", () => {
    const actor = { id: "real-user", role: "MEMBER" as const, name: "Fixture", isMock: false };
    expect(isDpsMember(actor)).toBe(true);
    expect(isDpsAdministrator(actor)).toBe(false);
    expect(isDpsAdministrator({ ...actor, role: "OFFICER" })).toBe(false);
    expect(isDpsAdministrator({ ...actor, role: "ADMIN" })).toBe(true);
    expect(isDpsMember({ ...actor, isMock: true })).toBe(false);
    expect(isDpsMember({ ...actor, id: "demo-admin", role: "ADMIN" })).toBe(false);
    expect(isDpsMember({ ...actor, role: "APPLICANT" })).toBe(false);
  });
});
