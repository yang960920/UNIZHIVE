import { describe, expect, it } from "vitest";
import {
  hasDiscordMembershipScope,
  membershipDecision,
  roleAfterDiscordSignIn,
  shouldRefreshDiscordToken,
} from "../src/lib/server/discord-authorization-policy";

describe("live Discord authorization policy", () => {
  it("distinguishes a confirmed leave from revoked authorization and provider outages", () => {
    const expectedDiscordId = "123456789012345678";
    expect(membershipDecision({ kind: "ABSENT", expectedDiscordId })).toBe("LEFT");
    expect(membershipDecision({ kind: "UNAUTHORIZED", expectedDiscordId })).toBe("REAUTH_REQUIRED");
    expect(membershipDecision({ kind: "UNAVAILABLE", expectedDiscordId })).toBe("UNAVAILABLE");
    expect(
      membershipDecision({ kind: "FOUND", expectedDiscordId, returnedDiscordId: "other-user" }),
    ).toBe("UNAVAILABLE");
    expect(
      membershipDecision({
        kind: "FOUND",
        expectedDiscordId,
        returnedDiscordId: expectedDiscordId,
      }),
    ).toBe("MEMBER");
  });

  it("refreshes close-to-expiry and unknown-expiry tokens and requires both consent scopes", () => {
    const now = 1_800_000_000_000;
    expect(shouldRefreshDiscordToken(1_800_000_031, now)).toBe(false);
    expect(shouldRefreshDiscordToken(1_800_000_030, now)).toBe(true);
    expect(shouldRefreshDiscordToken(1_799_999_999, now)).toBe(true);
    expect(shouldRefreshDiscordToken(null, now)).toBe(true);
    expect(hasDiscordMembershipScope("identify guilds.members.read")).toBe(true);
    expect(hasDiscordMembershipScope("identify guilds")).toBe(false);
    expect(hasDiscordMembershipScope(null)).toBe(false);
  });

  it("requires approval again after leave/re-entry and preserves already-approved roles", () => {
    expect(roleAfterDiscordSignIn("GUEST")).toBe("APPLICANT");
    expect(roleAfterDiscordSignIn("APPLICANT")).toBe("APPLICANT");
    expect(roleAfterDiscordSignIn("ADMIN")).toBe("ADMIN");
  });
});
