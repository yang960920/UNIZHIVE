import type { HiveRole, Operation, User } from "./types";

export type PermissionPrincipal = HiveRole | Pick<User, "id" | "role"> | null | undefined;

function hasRole(principal: PermissionPrincipal, allowed: readonly HiveRole[]): boolean {
  const role = typeof principal === "string" ? principal : principal?.role;
  return role !== undefined && allowed.includes(role);
}

const MEMBERS: readonly HiveRole[] = ["MEMBER", "OFFICER", "ADMIN"];
const OFFICERS: readonly HiveRole[] = ["OFFICER", "ADMIN"];

/** Approved operational eligibility retained for compatibility; does not authorize full member reads. */
export const canViewMemberDirectory = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, MEMBERS);

/** Full member information is administrator-only; operational eligibility remains separate above. */
export const canViewAdminMemberDirectory = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, ["ADMIN"]);

export const canCreateOperation = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, MEMBERS);

export function canManageOperation(
  principal: PermissionPrincipal,
  operation?: Pick<Operation, "createdById">,
): boolean {
  if (hasRole(principal, OFFICERS)) return true;
  return (
    typeof principal === "object" &&
    principal !== null &&
    hasRole(principal, ["MEMBER"]) &&
    operation !== undefined &&
    principal.id.length > 0 &&
    principal.id === operation.createdById
  );
}

export const canManageSeason = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, OFFICERS);
export const canApproveMember = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, ["ADMIN"]);
export const canModerateCommunity = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, OFFICERS);
export const canVerifyGameData = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, OFFICERS);
export const canOpenAdmin = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, OFFICERS);
export const canManageIntegrations = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, ["ADMIN"]);
export const canVoteInSeason = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, MEMBERS);
export const canRsvpOperation = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, MEMBERS);
export const canUpdateOwnMigration = (principal: PermissionPrincipal): boolean =>
  hasRole(principal, MEMBERS);

export function canEditMemberProfile(principal: PermissionPrincipal, userId: string): boolean {
  return (
    hasRole(principal, ["ADMIN"]) ||
    (typeof principal === "object" &&
      principal !== null &&
      hasRole(principal, ["APPLICANT", ...MEMBERS]) &&
      principal.id.length > 0 &&
      principal.id === userId)
  );
}

/** Server authorization only; never make UID visibility a client-side decision. */
export const canViewPrivateMemberData = canEditMemberProfile;
