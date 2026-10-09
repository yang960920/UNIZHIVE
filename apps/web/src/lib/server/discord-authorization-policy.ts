import type { HiveRole } from "@uniz/domain";

export type LiveGuildEligibility = "MEMBER" | "LEFT" | "UNAVAILABLE" | "REAUTH_REQUIRED";

export function hasDiscordMembershipScope(scope: string | null | undefined): boolean {
  const scopes = new Set((scope ?? "").split(/\s+/));
  return scopes.has("identify") && scopes.has("guilds.members.read");
}

export function shouldRefreshDiscordToken(expiresAt: number | null, now: number): boolean {
  return (
    expiresAt === null ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000) + 30
  );
}

export function roleAfterDiscordSignIn(role: HiveRole): HiveRole {
  // Guild re-entry requires a new approval; no prior privileged role is restored.
  return role === "GUEST" ? "APPLICANT" : role;
}

export function membershipDecision(input: {
  kind: "FOUND" | "ABSENT" | "UNAUTHORIZED" | "UNAVAILABLE";
  expectedDiscordId: string;
  returnedDiscordId?: string;
}): LiveGuildEligibility {
  if (input.kind === "ABSENT") return "LEFT";
  if (input.kind === "UNAUTHORIZED") return "REAUTH_REQUIRED";
  if (input.kind === "FOUND" && input.returnedDiscordId === input.expectedDiscordId)
    return "MEMBER";
  return "UNAVAILABLE";
}
