import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";
import {
  assertMemberProfileEditor,
  decideMemberRoleChange,
  memberChangeSchema,
  memberProfileSchema,
  type MemberChange,
} from "../src/lib/member-policy";

const actor: CurrentUser = {
  id: "24000146-c3ad-4f02-a7c1-359b5591f8ac",
  name: "Operator",
  role: "ADMIN",
  isMock: false,
};
const target = {
  id: "51000146-c3ad-4f02-a7c1-359b5591f8ac",
  role: "APPLICANT" as const,
  profileComplete: true,
};
const approval: MemberChange = { action: "approve", targetId: target.id, reason: "VERIFIED" };
const base = { actor, target, change: approval, adminCount: 2, guildEligible: true };

describe("member approval and privileged role invariants", () => {
  it("approves a complete guild member as MEMBER only", () => {
    expect(decideMemberRoleChange(base)).toBe("MEMBER");
  });
  it("denies forged development operators even with ADMIN in the payload", () => {
    expect(() => decideMemberRoleChange({ ...base, actor: { ...actor, isMock: true } })).toThrow(
      "실제 운영",
    );
  });
  it("denies officers, ordinary members and applicants acting as a member administrator", () => {
    for (const role of ["OFFICER", "MEMBER", "APPLICANT", "GUEST"] as const)
      expect(() => decideMemberRoleChange({ ...base, actor: { ...actor, role } })).toThrow();
  });
  it("requires game UID/profile completion and confirmed Discord membership", () => {
    expect(() =>
      decideMemberRoleChange({ ...base, target: { ...target, profileComplete: false } }),
    ).toThrow("프로필");
    expect(() => decideMemberRoleChange({ ...base, guildEligible: false })).toThrow("Discord");
  });
  it("rejects stale repeat approvals rather than generating a second transition", () => {
    expect(() =>
      decideMemberRoleChange({ ...base, target: { ...target, role: "MEMBER" } }),
    ).toThrow("승인 대기");
  });
  it("does not allow an actor to change their own authorization", () => {
    expect(() =>
      decideMemberRoleChange({
        ...base,
        target: { ...target, id: actor.id },
        change: { ...approval, targetId: actor.id },
      }),
    ).toThrow("자신");
  });
  it("does not accept a mismatched target identity", () => {
    expect(() =>
      decideMemberRoleChange({ ...base, change: { ...approval, targetId: actor.id } }),
    ).toThrow("대상");
  });
  it("requires ADMIN for OFFICER or ADMIN assignment", () => {
    for (const role of ["OFFICER", "ADMIN"] as const)
      expect(() =>
        decideMemberRoleChange({
          ...base,
          actor: { ...actor, role: "OFFICER" },
          target: { ...target, role: "MEMBER" },
          change: { action: "role", targetId: target.id, role, reason: "ROLE_REORGANIZATION" },
        }),
      ).toThrow("관리자");
  });
  it("blocks an officer from revoking another officer", () => {
    expect(() =>
      decideMemberRoleChange({
        ...base,
        actor: { ...actor, role: "OFFICER" },
        target: { ...target, role: "OFFICER" },
        change: { action: "undo", targetId: target.id, reason: "RECONSIDERATION" },
      }),
    ).toThrow("관리자");
  });
  it("prevents last-admin demotion for both role assignment and approval cancellation", () => {
    const adminTarget = { ...target, role: "ADMIN" as const };
    const changes: MemberChange[] = [
      { action: "role", targetId: target.id, role: "MEMBER", reason: "ROLE_REORGANIZATION" },
      { action: "undo", targetId: target.id, reason: "RECONSIDERATION" },
    ];
    for (const change of changes)
      expect(() =>
        decideMemberRoleChange({ ...base, target: adminTarget, change, adminCount: 1 }),
      ).toThrow("마지막 관리자");
  });
  it("permits changing another administrator when a second administrator remains", () => {
    expect(
      decideMemberRoleChange({
        ...base,
        target: { ...target, role: "ADMIN" },
        change: {
          action: "role",
          targetId: target.id,
          role: "MEMBER",
          reason: "ROLE_REORGANIZATION",
        },
      }),
    ).toBe("MEMBER");
  });
  it("rejects promotion of an unapproved account", () => {
    expect(() =>
      decideMemberRoleChange({
        ...base,
        change: {
          action: "role",
          targetId: target.id,
          role: "ADMIN",
          reason: "ROLE_REORGANIZATION",
        },
      }),
    ).toThrow("멤버 승인");
  });
  it("rejection requires a valid rejection reason and preserves the account as GUEST", () => {
    expect(() =>
      decideMemberRoleChange({
        ...base,
        change: { action: "reject", targetId: target.id, reason: "VERIFIED" },
      }),
    ).toThrow("사유");
    expect(
      decideMemberRoleChange({
        ...base,
        change: { action: "reject", targetId: target.id, reason: "PROFILE_REVIEW" },
      }),
    ).toBe("GUEST");
  });
  it("reopens only a held application with current membership proof", () => {
    const change: MemberChange = {
      action: "reopen",
      targetId: target.id,
      reason: "RECONSIDERATION",
    };
    expect(decideMemberRoleChange({ ...base, target: { ...target, role: "GUEST" }, change })).toBe(
      "APPLICANT",
    );
    expect(() =>
      decideMemberRoleChange({
        ...base,
        target: { ...target, role: "GUEST" },
        change,
        guildEligible: false,
      }),
    ).toThrow("Discord");
  });
});

describe("private profile and action validation", () => {
  it("does not accept client actor roles or UID-bearing free-form reasons", () => {
    expect(memberChangeSchema.safeParse({ ...approval, actorRole: "ADMIN" }).success).toBe(false);
    expect(memberChangeSchema.safeParse({ ...approval, reason: "UID 12345" }).success).toBe(false);
  });
  it("normalizes public handles and rejects malformed IDs and empty private identifiers", () => {
    const input = {
      targetId: target.id,
      handle: " HyunJun ",
      displayName: "현준",
      nickname: "현준",
      uid: "uid12345",
      bio: "",
    };
    expect(memberProfileSchema.parse(input).handle).toBe("hyunjun");
    expect(memberProfileSchema.safeParse({ ...input, targetId: "not-a-user" }).success).toBe(false);
    expect(memberProfileSchema.safeParse({ ...input, uid: " " }).success).toBe(false);
    expect(memberProfileSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
  });
  it("permits self-profile editing and denies editing someone else's private profile", () => {
    expect(() =>
      assertMemberProfileEditor({ ...actor, id: target.id, role: "APPLICANT" }, target.id),
    ).not.toThrow();
    expect(() => assertMemberProfileEditor({ ...actor, role: "MEMBER" }, target.id)).toThrow();
    expect(() => assertMemberProfileEditor({ ...actor, role: "GUEST" }, actor.id)).toThrow();
  });
  it("denies mock writes and officer cross-profile access while preserving self editing", () => {
    expect(() => assertMemberProfileEditor({ ...actor, isMock: true }, target.id)).toThrow();
    expect(() => assertMemberProfileEditor({ ...actor, role: "OFFICER" }, target.id)).toThrow();
    expect(() => assertMemberProfileEditor({ ...actor, role: "OFFICER" }, actor.id)).not.toThrow();
    expect(() => assertMemberProfileEditor(actor, target.id)).not.toThrow();
  });
});
