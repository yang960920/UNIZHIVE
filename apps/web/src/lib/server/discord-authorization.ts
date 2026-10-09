import "server-only";
import { accounts, and, auditLogs, eq, getDb, sql, users } from "@uniz/db";
import { resolveDatabaseUrl } from "@uniz/db/environment";
import {
  DiscordApiError,
  getCurrentDiscordGuildMember,
  refreshDiscordOAuthTokens,
} from "@uniz/integrations/server";
import {
  hasDiscordMembershipScope,
  membershipDecision,
  shouldRefreshDiscordToken,
  type LiveGuildEligibility,
} from "./discord-authorization-policy";
import { decryptDiscordToken, encryptDiscordToken } from "./discord-token-crypto";
import {
  beginMembershipVerification,
  finishMembershipVerification,
  hasMembershipSnapshot,
  invalidateMembershipSnapshot,
  invalidateUserMembershipSnapshots,
  publishMembershipSnapshot,
  type MembershipGeneration,
} from "./discord-membership-cache";

export type { LiveGuildEligibility } from "./discord-authorization-policy";

export interface LiveGuildEligibilityState {
  status: LiveGuildEligibility;
  retryAfterSeconds: number | null;
}

function eligibilityState(
  status: LiveGuildEligibility,
  error?: unknown,
): LiveGuildEligibilityState {
  const retryAfter =
    error instanceof DiscordApiError && error.status === 429 ? error.retryAfterSeconds : null;
  return {
    status,
    retryAfterSeconds:
      status === "UNAVAILABLE" &&
      typeof retryAfter === "number" &&
      Number.isFinite(retryAfter) &&
      retryAfter >= 0
        ? retryAfter
        : null,
  };
}

interface TokenLease {
  discordId: string;
  accessToken: string;
  encryptedAccessToken: string;
  refreshed: boolean;
}

const clearedTokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null,
  token_type: null,
  scope: null,
  id_token: null,
  session_state: null,
};

async function getTokenLease(userId: string): Promise<TokenLease | LiveGuildEligibilityState> {
  return getDb().transaction(async (transaction) => {
    // This row lock serializes refresh rotation across all application processes.
    const [account] = await transaction
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
      .limit(1)
      .for("update");
    if (!account?.access_token || !hasDiscordMembershipScope(account.scope))
      return eligibilityState("REAUTH_REQUIRED");
    const secret = process.env.NEXTAUTH_SECRET ?? "";
    let accessToken: string;
    try {
      accessToken = decryptDiscordToken(
        account.access_token,
        `discord:${account.providerAccountId}:access`,
        secret,
      );
    } catch {
      return eligibilityState("REAUTH_REQUIRED");
    }
    if (!shouldRefreshDiscordToken(account.expires_at, Date.now())) {
      return {
        discordId: account.providerAccountId,
        accessToken,
        encryptedAccessToken: account.access_token,
        refreshed: false,
      };
    }
    if (!account.refresh_token) return eligibilityState("REAUTH_REQUIRED");
    let refreshToken: string;
    try {
      refreshToken = decryptDiscordToken(
        account.refresh_token,
        `discord:${account.providerAccountId}:refresh`,
        secret,
      );
    } catch {
      return eligibilityState("REAUTH_REQUIRED");
    }
    try {
      const refreshed = await refreshDiscordOAuthTokens({
        clientId: process.env.DISCORD_CLIENT_ID!,
        clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        refreshToken,
      });
      if (!hasDiscordMembershipScope(refreshed.scope)) {
        await transaction
          .update(accounts)
          .set({ ...clearedTokens, updatedAt: new Date() })
          .where(eq(accounts.id, account.id));
        return eligibilityState("REAUTH_REQUIRED");
      }
      const encryptedAccessToken = encryptDiscordToken(
        refreshed.accessToken,
        `discord:${account.providerAccountId}:access`,
        secret,
      );
      await transaction
        .update(accounts)
        .set({
          access_token: encryptedAccessToken,
          refresh_token: encryptDiscordToken(
            refreshed.refreshToken,
            `discord:${account.providerAccountId}:refresh`,
            secret,
          ),
          expires_at: Math.floor(Date.now() / 1000) + refreshed.expiresIn,
          scope: refreshed.scope,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, account.id));
      return {
        discordId: account.providerAccountId,
        accessToken: refreshed.accessToken,
        encryptedAccessToken,
        refreshed: true,
      };
    } catch (error) {
      if (error instanceof DiscordApiError && error.kind === "UNAUTHORIZED") {
        await transaction
          .update(accounts)
          .set({ ...clearedTokens, updatedAt: new Date() })
          .where(eq(accounts.id, account.id));
        return eligibilityState("REAUTH_REQUIRED");
      }
      return eligibilityState("UNAVAILABLE", error);
    }
  });
}

async function confirmGuildLeave(userId: string, lease: TokenLease): Promise<LiveGuildEligibility> {
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(912743110)`);
    const [user] = await transaction.select().from(users).where(eq(users.id, userId)).for("update");
    const [account] = await transaction
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
      .limit(1)
      .for("update");
    // A concurrent sign-in/refresh replaces ciphertext; discard this older check.
    if (!user || !account || account.access_token !== lease.encryptedAccessToken)
      return "UNAVAILABLE";
    await transaction
      .update(users)
      .set({ role: "GUEST", updatedAt: new Date() })
      .where(eq(users.id, userId));
    await transaction
      .update(accounts)
      .set({ ...clearedTokens, updatedAt: new Date() })
      .where(eq(accounts.id, account.id));
    await transaction.insert(auditLogs).values({
      actorId: userId,
      action: "auth.discord.guild_left",
      entityType: "user",
      entityId: userId,
      metadata: { previousRole: user.role, role: "GUEST", reason: "UNKNOWN_MEMBER" },
    });
    return "LEFT";
  });
}

async function isCurrentLease(
  userId: string,
  guildId: string,
  lease: TokenLease,
): Promise<boolean> {
  if (process.env.DISCORD_GUILD_ID !== guildId) return false;
  return getDb().transaction(async (transaction) => {
    const [account] = await transaction
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
      .limit(1)
      .for("share");
    return Boolean(
      account &&
      account.providerAccountId === lease.discordId &&
      account.access_token === lease.encryptedAccessToken &&
      hasDiscordMembershipScope(account.scope) &&
      !shouldRefreshDiscordToken(account.expires_at, Date.now()),
    );
  });
}

async function readGuildEligibilityState(
  userId: string,
  useSnapshot: boolean,
): Promise<LiveGuildEligibilityState> {
  if (
    !resolveDatabaseUrl(process.env) ||
    !process.env.DISCORD_GUILD_ID ||
    !process.env.DISCORD_CLIENT_ID ||
    !process.env.DISCORD_CLIENT_SECRET ||
    !process.env.NEXTAUTH_SECRET
  )
    return eligibilityState("UNAVAILABLE");
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const lease = await getTokenLease(userId);
    if ("status" in lease) {
      if (lease.status === "REAUTH_REQUIRED") invalidateUserMembershipSnapshots(userId);
      return lease;
    }
    const generation: MembershipGeneration = {
      userId,
      guildId,
      discordId: lease.discordId,
      encryptedAccessToken: lease.encryptedAccessToken,
    };
    if (lease.refreshed)
      invalidateUserMembershipSnapshots(userId, { negative: false, except: generation });
    if (useSnapshot && hasMembershipSnapshot(generation)) return eligibilityState("MEMBER");
    const verification = beginMembershipVerification(generation);
    try {
      const member = await getCurrentDiscordGuildMember(guildId, lease.accessToken);
      const decision = membershipDecision({
        kind: member ? "FOUND" : "ABSENT",
        expectedDiscordId: lease.discordId,
        returnedDiscordId: member?.userId,
      });
      if (decision !== "MEMBER") {
        invalidateMembershipSnapshot(generation);
        return eligibilityState(
          decision === "LEFT" ? await confirmGuildLeave(userId, lease) : decision,
        );
      }
      if (!(await isCurrentLease(userId, guildId, lease))) {
        invalidateMembershipSnapshot(generation);
        return eligibilityState("UNAVAILABLE");
      }
      return eligibilityState(publishMembershipSnapshot(verification) ? "MEMBER" : "UNAVAILABLE");
    } catch (error) {
      if (error instanceof DiscordApiError && error.kind === "UNAUTHORIZED")
        invalidateMembershipSnapshot(generation);
      return eligibilityState(
        membershipDecision({
          kind:
            error instanceof DiscordApiError && error.kind === "UNAUTHORIZED"
              ? "UNAUTHORIZED"
              : "UNAVAILABLE",
          expectedDiscordId: lease.discordId,
        }),
        error,
      );
    } finally {
      finishMembershipVerification(verification);
    }
  } catch {
    // Database, encryption, timeouts and malformed responses all deny access.
    return eligibilityState("UNAVAILABLE");
  }
}

/** Every call checks Discord freshly; use this for target membership approval/review. */
export async function getLiveGuildEligibilityState(
  userId: string,
): Promise<LiveGuildEligibilityState> {
  return readGuildEligibilityState(userId, false);
}

/** Credentials are checked on every request; positive guild evidence lasts at most five minutes. */
export async function getSessionGuildEligibilityState(
  userId: string,
): Promise<LiveGuildEligibilityState> {
  return readGuildEligibilityState(userId, true);
}

/** Called only after a successful live identity/membership check and persistence at sign-in. */
export async function primeSessionGuildMembership(
  userId: string,
  proof: { guildId: string; discordId: string; accessToken: string; verifiedAt?: number },
): Promise<boolean> {
  const verifiedAt = proof.verifiedAt ?? Date.now();
  try {
    if (proof.guildId !== process.env.DISCORD_GUILD_ID) return false;
    const lease = await getTokenLease(userId);
    if ("status" in lease) {
      if (lease.status === "REAUTH_REQUIRED") invalidateUserMembershipSnapshots(userId);
      return false;
    }
    if (lease.discordId !== proof.discordId || lease.accessToken !== proof.accessToken)
      return false;
    const generation = {
      userId,
      guildId: proof.guildId,
      discordId: lease.discordId,
      encryptedAccessToken: lease.encryptedAccessToken,
    };
    invalidateUserMembershipSnapshots(userId, { negative: false, except: generation });
    const verification = beginMembershipVerification(
      generation,
      verifiedAt,
      proof.verifiedAt !== undefined,
    );
    try {
      if (!(await isCurrentLease(userId, proof.guildId, lease))) return false;
      return publishMembershipSnapshot(verification);
    } finally {
      finishMembershipVerification(verification);
    }
  } catch {
    return false;
  }
}

/** Compatibility reader for authorization paths that only need the fail-closed status. */
export async function getLiveGuildEligibility(userId: string): Promise<LiveGuildEligibility> {
  return (await getLiveGuildEligibilityState(userId)).status;
}
