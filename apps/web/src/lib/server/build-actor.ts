import "server-only";
import { accounts, and, eq, getDb, memberProfiles, sql, users } from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import {
  BuildPlannerError,
  isApprovedBuildActor,
  requireBuildActor,
} from "../build-planner-policy";

export type BuildTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
export const AUTHORIZATION_LOCK = 912743110;

/** The caller supplies the server-verified session, never a form-supplied identity. */
export async function readFreshActor(
  transaction: BuildTransaction,
  sessionActor: CurrentUser | null,
  write = false,
): Promise<{ actor: CurrentUser | null; profileComplete: boolean }> {
  if (!sessionActor || sessionActor.isMock || sessionActor.id.startsWith("demo-")) {
    if (write) requireBuildActor(sessionActor);
    return { actor: null, profileComplete: false };
  }
  const [fresh] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, sessionActor.id))
    .for("share");
  const candidate: CurrentUser | null = fresh ? { ...fresh, isMock: false } : null;
  if (!isApprovedBuildActor(candidate)) {
    if (write) throw new BuildPlannerError("FORBIDDEN");
    return { actor: null, profileComplete: false };
  }
  const [discord] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, candidate.id), eq(accounts.provider, "discord")))
    .limit(1);
  if (!discord) {
    if (write) throw new BuildPlannerError("FORBIDDEN");
    return { actor: null, profileComplete: false };
  }
  const [profile] = await transaction
    .select({
      complete: sql<boolean>`coalesce(length(trim(${memberProfiles.onceHumanUid})) > 0 and length(trim(${memberProfiles.onceHumanNickname})) >= 2 and length(trim(${memberProfiles.handle})) >= 3, false)`,
    })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, candidate.id))
    .limit(1);
  const profileComplete = profile?.complete === true;
  if (write && !profileComplete) throw new BuildPlannerError("PROFILE_REQUIRED");
  return { actor: candidate, profileComplete };
}
