import { describe, expect, it } from "vitest";
import { requireOpenPartySeason } from "../src/lib/operational-policy";
import { seasonAdministrationSchema } from "../src/lib/season-admin-policy";

describe("party enrollment boundaries", () => {
  it("accepts approved planned and active seasons without a phase/date precondition", () => {
    for (const status of ["PLANNED", "ACTIVE"] as const)
      expect(() =>
        requireOpenPartySeason({ status, approvalStatus: "APPROVED" }, true),
      ).not.toThrow();
  });
  it("rejects nonmembers independently of season approval or administrator UI", () => {
    expect(() =>
      requireOpenPartySeason({ status: "ACTIVE", approvalStatus: "APPROVED" }, false),
    ).toThrow("참가 명단");
  });
  it("does not open pending, rejected, settled or archived parties", () => {
    for (const approvalStatus of ["PENDING", "REJECTED"] as const)
      expect(() => requireOpenPartySeason({ status: "PLANNED", approvalStatus }, true)).toThrow(
        "시즌 상태",
      );
    for (const status of ["SETTLEMENT", "ARCHIVED"] as const)
      expect(() => requireOpenPartySeason({ status, approvalStatus: "APPROVED" }, true)).toThrow(
        "시즌 상태",
      );
  });
});

describe("season content availability input", () => {
  const draft = {
    action: "CREATE_SEASON_SETUP",
    scenarioKey: "ENDLESS_DREAM",
    serverNumber: "0010",
    region: "한국",
    name: "하이브",
    startsAt: "2026-10-08T00:00:00Z",
    settlementAt: null,
  };
  it("accepts an explicit availability flag but does not coerce text into a boolean", () => {
    expect(
      seasonAdministrationSchema.parse({ ...draft, gravityContentEnabled: true }),
    ).toMatchObject({ gravityContentEnabled: true });
    expect(
      seasonAdministrationSchema.safeParse({ ...draft, gravityContentEnabled: "false" }).success,
    ).toBe(false);
    expect(seasonAdministrationSchema.safeParse(draft).success).toBe(true);
  });
});
