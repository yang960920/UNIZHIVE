import { describe, expect, it } from "vitest";
import {
  assertPartyContent,
  mayManageParty,
  partyParticipantSchema,
  partySaveSchema,
  requirePartyActor,
} from "../src/lib/party-admin-policy";
import { getPartyContent, getPartyContentOptions } from "../src/lib/party-content";
const actor = { id: "member", name: "Member", role: "MEMBER" as const, isMock: false };
const input = {
  seasonId: "83f8ec66-eeb0-455f-b7cb-54e65d9c23f7",
  title: "파티 모집",
  contentKey: "raid",
  meetingPoint: "입구",
  description: "",
  startsAt: "2030-01-01T12:00:00Z",
  endsAt: null,
  capacity: 4,
  status: "SCHEDULED",
};
describe("party creation and content boundaries", () => {
  it("requires a real approved actor and preserves owner and season enrollment boundaries", () => {
    expect(() => requirePartyActor(null)).toThrow();
    expect(() => requirePartyActor({ ...actor, isMock: true })).toThrow();
    expect(() => requirePartyActor({ ...actor, role: "APPLICANT" })).toThrow();
    expect(mayManageParty(actor, actor.id, true)).toBe(true);
    expect(mayManageParty(actor, actor.id, false)).toBe(false);
    expect(mayManageParty(actor, "someone-else", true)).toBe(false);
    expect(mayManageParty({ ...actor, role: "OFFICER" }, "someone-else", false)).toBe(true);
  });
  it("prevents forged authors, null seasons, invalid capacities, and edits without a version", () => {
    expect(partySaveSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      { createdById: "forged" },
      { seasonId: null },
      { capacity: 0 },
      { capacity: 1.5 },
      { id: "fd7f5c77-a4c3-48b5-82db-9b55b6f6a95d" },
      { contentKey: "unknown" },
    ])
      expect(partySaveSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it("offers endless activities only in Endless Dream and condenser only in enabled seasons", () => {
    const generic = getPartyContentOptions({
      scenarioSlug: "manibus",
      gravityContentEnabled: false,
    });
    expect(generic.some((content) => content.key.startsWith("endless-"))).toBe(false);
    expect(generic.some((content) => content.key === "gravity-condenser")).toBe(false);
    expect(() => assertPartyContent("endless-deep", "manibus", true)).toThrow();
    expect(() => assertPartyContent("gravity-condenser", "endless-dream", false)).toThrow();
    expect(assertPartyContent("endless-kin", "endless-dream", false).type).toBe("RAID");
    expect(assertPartyContent("gravity-condenser", "manibus", true).type).toBe("RAID");
    expect(getPartyContent("prime-war")?.type).toBe("PRIME_WAR");
  });
  it("requires the party version and an explicit status for attendee changes", () => {
    const ids = { operationId: input.seasonId, userId: "fd7f5c77-a4c3-48b5-82db-9b55b6f6a95d" };
    expect(
      partyParticipantSchema.safeParse({ ...ids, action: "SET_STATUS", status: "GOING" }).success,
    ).toBe(false);
    expect(
      partyParticipantSchema.safeParse({
        ...ids,
        expectedUpdatedAt: input.startsAt,
        action: "SET_STATUS",
      }).success,
    ).toBe(false);
    expect(
      partyParticipantSchema.safeParse({
        ...ids,
        expectedUpdatedAt: input.startsAt,
        action: "REMOVE",
      }).success,
    ).toBe(true);
  });
  it("offers Dream activities independently from gravity phenomenon content", () => {
    const dream = getPartyContentOptions({
      scenarioSlug: "endless-dream",
      trancePhenomenon: "LUNAR_ORACLE",
      gravityContentEnabled: true,
    });
    expect(dream.some((content) => content.key === "endless-deep")).toBe(true);
    expect(dream.some((content) => content.key === "gravity-condenser")).toBe(false);
    for (const trancePhenomenon of ["STARFALL_INVERSION", "GRAVITY_ABYSS"] as const) {
      const manibus = getPartyContentOptions({ scenarioSlug: "manibus", trancePhenomenon });
      expect(manibus.some((content) => content.key === "gravity-condenser")).toBe(true);
      expect(manibus.some((content) => content.key.startsWith("endless-"))).toBe(false);
    }
    expect(
      getPartyContentOptions({
        scenarioSlug: "endless-dream",
        trancePhenomenon: "UNKNOWN",
        gravityContentEnabled: true,
      }).some((content) => content.key === "gravity-condenser"),
    ).toBe(true);
  });
});
