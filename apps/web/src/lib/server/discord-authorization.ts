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
}

export interface DiscordSignInGrant {
  userId: string;
  discordId: string;
  encryptedAccessToken: string | null;
  rowVersion: string;
}

/** Capture before checking a fresh sign-in, so an old absence cannot revoke a newer grant. */
export async function captureDiscordSignInGrant(
  discordId: string,
): Promise<DiscordSignInGrant | null> {
  const [account] = await getDb()
    .select({
      userId: accounts.userId,
      discordId: accounts.providerAccountId,
      encryptedAccessToken: accounts.access_token,
      // This short-lived proof also distinguishes null -> new token -> null changes.
      rowVersion: sql<string>`xmin::text`,
    })
    .from(accounts)
    .where(and(eq(accounts.providerAccountId, discordId), eq(accounts.provider, "discord")))
    .limit(1);
  return account ?? null;
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

async function confirmGuildLeave(
  userId: string,
  lease: Pick<DiscordSignInGrant, "discordId" | "encryptedAccessToken"> & {
    rowVersion?: string;
  },
): Promise<LiveGuildEligibility> {
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(912743110)`);
    const [user] = await transaction.select().from(users).where(eq(users.id, userId)).for("update");
    const [account] = await transaction
      .select({
        id: accounts.id,
        providerAccountId: accounts.providerAccountId,
        access_token: accounts.access_token,
        rowVersion: sql<string>`xmin::text`,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
      .limit(1)
      .for("update");
    // A concurrent sign-in/refresh replaces ciphertext; discard this older check.
    if (
      !user ||
      !account ||
      account.providerAccountId !== lease.discordId ||
      account.access_token !== lease.encryptedAccessToken ||
      (lease.rowVersion !== undefined && account.rowVersion !== lease.rowVersion)
    )
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

/** Only a matching Discord identity with a confirmed Unknown Member response may call this. */
export async function confirmAbsentDiscordSignIn(
  grant: DiscordSignInGrant,
): Promise<LiveGuildEligibility> {
  return confirmGuildLeave(grant.userId, grant);
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

async function clearRejectedGrant(userId: string, lease: TokenLease): Promise<boolean> {
  return getDb().transaction(async (transaction) => {
    const [account] = await transaction
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
      .limit(1)
      .for("update");
    // An older 401 must never revoke a newer sign-in or refresh grant.
    if (
      !account ||
      account.providerAccountId !== lease.discordId ||
      account.access_token !== lease.encryptedAccessToken
    )
      return false;
    await transaction
      .update(accounts)
      .set({ ...clearedTokens, updatedAt: new Date() })
      .where(eq(accounts.id, account.id));
    return true;
  });
}

/** Explicit membership checks only: sign-in/approval, never ordinary session renewal. */
export async function getLiveGuildEligibilityState(
  userId: string,
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
    if ("status" in lease) return lease;
    try {
      const member = await getCurrentDiscordGuildMember(guildId, lease.accessToken);
      const decision = membershipDecision({
        kind: member ? "FOUND" : "ABSENT",
        expectedDiscordId: lease.discordId,
        returnedDiscordId: member?.userId,
      });
      if (decision !== "MEMBER") {
        return eligibilityState(
          decision === "LEFT" ? await confirmGuildLeave(userId, lease) : decision,
        );
      }
      return eligibilityState(
        (await isCurrentLease(userId, guildId, lease)) ? "MEMBER" : "UNAVAILABLE",
      );
    } catch (error) {
      if (error instanceof DiscordApiError && error.kind === "UNAUTHORIZED") {
        return eligibilityState(
          (await clearRejectedGrant(userId, lease)) ? "REAUTH_REQUIRED" : "UNAVAILABLE",
        );
      }
      return eligibilityState("UNAVAILABLE", error);
    }
  } catch {
    // Database, encryption, timeouts and malformed responses all deny access.
    return eligibilityState("UNAVAILABLE");
  }
}

/**
 * Local account eligibility for an already signed site session. MEMBER means the persisted
 * Discord link remains valid locally; it is not a new Guild membership assertion.
 * OAuth expiry is independent of the site's session and never triggers a remote refresh here.
 */
export async function getSessionGuildEligibilityState(
  userId: string,
): Promise<LiveGuildEligibilityState> {
  if (!resolveDatabaseUrl(process.env) || !process.env.NEXTAUTH_SECRET)
    return eligibilityState("UNAVAILABLE");
  try {
    const [account] = await getDb()
      .select({
        discordId: accounts.providerAccountId,
        accessToken: accounts.access_token,
        scope: accounts.scope,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, "discord")))
      .limit(1);
    if (!account?.accessToken || !hasDiscordMembershipScope(account.scope))
      return eligibilityState("REAUTH_REQUIRED");
    try {
      decryptDiscordToken(
        account.accessToken,
        `discord:${account.discordId}:access`,
        process.env.NEXTAUTH_SECRET,
      );
    } catch {
      return eligibilityState("REAUTH_REQUIRED");
    }
    return eligibilityState("MEMBER");
  } catch {
    return eligibilityState("UNAVAILABLE");
  }
}

/** Compatibility reader for authorization paths that only need the fail-closed status. */
export async function getLiveGuildEligibility(userId: string): Promise<LiveGuildEligibility> {
  return (await getLiveGuildEligibilityState(userId)).status;
}
