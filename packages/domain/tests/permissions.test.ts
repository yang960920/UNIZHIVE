import { describe, expect, it } from "vitest";
import {
  HIVE_ROLES,
  canApproveMember,
  canCreateOperation,
  canEditMemberProfile,
  canManageIntegrations,
  canManageOperation,
  canManageSeason,
  canModerateCommunity,
  canOpenAdmin,
  canRsvpOperation,
  canUpdateOwnMigration,
  canVerifyGameData,
  canViewMemberDirectory,
  canViewAdminMemberDirectory,
  canViewPrivateMemberData,
  canVoteInSeason,
  type HiveRole,
} from "../src";

describe("central permission policy", () => {
  it.each(HIVE_ROLES)("checks every policy for %s", (role) => {
    const principal = { id: "member-1", role };
    const isMember = ["MEMBER", "OFFICER", "ADMIN"].includes(role);
    const isOfficer = ["OFFICER", "ADMIN"].includes(role);
    for (const policy of [
      canViewMemberDirectory,
      canCreateOperation,
      canRsvpOperation,
      canUpdateOwnMigration,
      canVoteInSeason,
    ]) {
      expect(policy(principal)).toBe(isMember);
      expect(policy(role)).toBe(isMember);
    }
    for (const policy of [canManageSeason, canModerateCommunity, canVerifyGameData, canOpenAdmin]) {
      expect(policy(principal)).toBe(isOfficer);
      expect(policy(role)).toBe(isOfficer);
    }
    expect(canManageIntegrations(principal)).toBe(role === "ADMIN");
    for (const policy of [canApproveMember, canViewAdminMemberDirectory]) {
      expect(policy(principal)).toBe(role === "ADMIN");
      expect(policy(role)).toBe(role === "ADMIN");
    }
  });

  it("lets members manage their own operation and denies another member", () => {
    const operation = { createdById: "owner" };
    expect(canManageOperation({ id: "owner", role: "MEMBER" }, operation)).toBe(true);
    expect(canManageOperation({ id: "other", role: "MEMBER" }, operation)).toBe(false);
    expect(canManageOperation("MEMBER", operation)).toBe(false);
    expect(canManageOperation({ id: "owner", role: "APPLICANT" }, operation)).toBe(false);
    expect(canManageOperation({ id: "owner", role: "GUEST" }, operation)).toBe(false);
    expect(canManageOperation({ id: "owner", role: "MEMBER" })).toBe(false);
    expect(canManageOperation({ id: "", role: "MEMBER" }, { createdById: "" })).toBe(false);
    expect(canManageOperation("OFFICER", operation)).toBe(true);
    expect(canManageOperation("ADMIN", operation)).toBe(true);
  });

  it("limits private profile access to self or administrators while preserving officer self editing", () => {
    for (const policy of [canEditMemberProfile, canViewPrivateMemberData]) {
      expect(policy({ id: "own", role: "MEMBER" }, "own")).toBe(true);
      expect(policy({ id: "own", role: "APPLICANT" }, "own")).toBe(true);
      expect(policy({ id: "other", role: "MEMBER" }, "own")).toBe(false);
      expect(policy({ id: "own", role: "GUEST" }, "own")).toBe(false);
      expect(policy("MEMBER", "own")).toBe(false);
      expect(policy("OFFICER", "own")).toBe(false);
      expect(policy({ id: "own", role: "OFFICER" }, "own")).toBe(true);
      expect(policy({ id: "other", role: "OFFICER" }, "own")).toBe(false);
      expect(policy("ADMIN", "own")).toBe(true);
    }
  });

  it("denies missing and unrecognized roles", () => {
    for (const principal of [null, undefined, "OWNER" as HiveRole]) {
      expect(canOpenAdmin(principal)).toBe(false);
      expect(canManageSeason(principal)).toBe(false);
      expect(canCreateOperation(principal)).toBe(false);
      expect(canVoteInSeason(principal)).toBe(false);
      expect(canManageOperation(principal, { createdById: "owner" })).toBe(false);
      expect(canViewPrivateMemberData(principal, "owner")).toBe(false);
    }
  });
});
