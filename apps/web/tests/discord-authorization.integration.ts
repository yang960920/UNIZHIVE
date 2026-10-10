import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const discord = vi.hoisted(() => ({ userId: "", membership: "FOUND", refreshFailure: false }));
vi.mock("@uniz/integrations/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uniz/integrations/server")>();
  return {
    ...actual,
    getCurrentDiscordGuildMember: vi.fn(async () => {
      if (discord.membership === "UNAVAILABLE")
        throw new actual.DiscordApiError("UNAVAILABLE", 503);
      if (discord.membership === "LEFT") return null;
      return { userId: discord.userId, nickname: null, roleIds: [], source: "LIVE" };
    }),
    refreshDiscordOAuthTokens: vi.fn(async () => {
      if (discord.refreshFailure) throw new actual.DiscordApiError("UNAUTHORIZED", 401);
      return {
        accessToken: "synthetic-rotated-access",
        refreshToken: "synthetic-rotated-refresh",
        expiresIn: 3600,
        scope: "identify guilds.members.read",
      };
    }),
  };
});

import { accounts, auditLogs, eq, getDb, users } from "@uniz/db";
import { getCurrentDiscordGuildMember, refreshDiscordOAuthTokens } from "@uniz/integrations/server";
import { persistDiscordIdentity } from "../src/lib/server/auth-repository";
import {
  captureDiscordSignInGrant,
  confirmAbsentDiscordSignIn,
  getLiveGuildEligibility,
  getSessionGuildEligibilityState,
} from "../src/lib/server/discord-authorization";
import { decryptDiscordToken } from "../src/lib/server/discord-token-crypto";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Discord repository verification requires the local uniz_hive database.");
}
let userId: string | null = null;
const secret = "synthetic-test-secret-at-least-32-characters";

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("NEXTAUTH_SECRET", secret);
  vi.stubEnv("DISCORD_CLIENT_ID", "900000000000000001");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "synthetic-client-secret");
  vi.stubEnv("DISCORD_GUILD_ID", "900000000000000002");
  discord.userId = `900${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
  discord.membership = "FOUND";
  discord.refreshFailure = false;
  const persisted = await persistDiscordIdentity({
    discordId: discord.userId,
    name: "Discord verification fixture",
    image: null,
    accessToken: "synthetic-access-token",
    refreshToken: "synthetic-refresh-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    scope: "identify guilds.members.read",
  });
  userId = persisted.id;
});

afterEach(async () => {
  if (userId) {
    await getDb().transaction(async (tx) => {
      await tx.delete(auditLogs).where(eq(auditLogs.actorId, userId!));
      await tx.delete(users).where(eq(users.id, userId!));
    });
  }
  userId = null;
  vi.unstubAllEnvs();
});

describe("Discord token and authorization repositories against local PostgreSQL", () => {
  it("does not confuse different cleared-grant row versions during delayed sign-in absence", async () => {
    await getDb().update(users).set({ role: "ADMIN" }).where(eq(users.id, userId!));
    await getDb().update(accounts).set({ access_token: null }).where(eq(accounts.userId, userId!));
    const olderGrant = await captureDiscordSignInGrant(discord.userId);
    await persistDiscordIdentity({
      discordId: discord.userId,
      name: "Newer revoked sign-in fixture",
      image: null,
      accessToken: "synthetic-newer-access",
      refreshToken: "synthetic-newer-refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scope: "identify guilds.members.read",
    });
    await getDb().update(accounts).set({ access_token: null }).where(eq(accounts.userId, userId!));
    expect(await confirmAbsentDiscordSignIn(olderGrant!)).toBe("UNAVAILABLE");
    const [user] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId!));
    expect(user?.role).toBe("ADMIN");
    expect(
      await getDb().select().from(auditLogs).where(eq(auditLogs.actorId, userId!)),
    ).toHaveLength(0);
  });

  it("authorizes the current local link despite expired Discord tokens and an unavailable provider", async () => {
    await getDb()
      .update(accounts)
      .set({ expires_at: 1, refresh_token: null })
      .where(eq(accounts.userId, userId!));
    discord.membership = "UNAVAILABLE";
    for (let request = 0; request < 3; request++) {
      expect(await getSessionGuildEligibilityState(userId!)).toEqual({
        status: "MEMBER",
        retryAfterSeconds: null,
      });
    }
    expect(getCurrentDiscordGuildMember).not.toHaveBeenCalled();
    expect(refreshDiscordOAuthTokens).not.toHaveBeenCalled();
    await getDb().update(accounts).set({ access_token: null }).where(eq(accounts.userId, userId!));
    expect((await getSessionGuildEligibilityState(userId!)).status).toBe("REAUTH_REQUIRED");
  });

  it("does not let an older failed login revoke a newer persisted sign-in", async () => {
    await getDb().update(users).set({ role: "ADMIN" }).where(eq(users.id, userId!));
    const olderGrant = await captureDiscordSignInGrant(discord.userId);
    await persistDiscordIdentity({
      discordId: discord.userId,
      name: "Newer sign-in fixture",
      image: null,
      accessToken: "synthetic-newer-access",
      refreshToken: "synthetic-newer-refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scope: "identify guilds.members.read",
    });
    expect(await confirmAbsentDiscordSignIn(olderGrant!)).toBe("UNAVAILABLE");
    expect((await getSessionGuildEligibilityState(userId!)).status).toBe("MEMBER");
    const [user] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId!));
    expect(user?.role).toBe("ADMIN");
    expect(
      await getDb().select().from(auditLogs).where(eq(auditLogs.actorId, userId!)),
    ).toHaveLength(0);
  });

  it("revokes existing sessions when a login confirms absence for the captured current grant", async () => {
    await getDb().update(users).set({ role: "ADMIN" }).where(eq(users.id, userId!));
    const grant = await captureDiscordSignInGrant(discord.userId);
    expect(await confirmAbsentDiscordSignIn(grant!)).toBe("LEFT");
    expect((await getSessionGuildEligibilityState(userId!)).status).toBe("REAUTH_REQUIRED");
    const [user] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId!));
    expect(user?.role).toBe("GUEST");
    expect(getCurrentDiscordGuildMember).not.toHaveBeenCalled();
  });

  it("stores authenticated ciphertext and verifies the expected Discord identity", async () => {
    const [account] = await getDb().select().from(accounts).where(eq(accounts.userId, userId!));
    expect(account?.access_token).not.toContain("synthetic-access-token");
    expect(
      decryptDiscordToken(account!.access_token!, `discord:${discord.userId}:access`, secret),
    ).toBe("synthetic-access-token");
    expect(await getLiveGuildEligibility(userId!)).toBe("MEMBER");
  });

  it("revokes a departed user's role and tokens while retaining identity and history", async () => {
    await getDb().update(users).set({ role: "ADMIN" }).where(eq(users.id, userId!));
    discord.membership = "LEFT";
    expect(await getLiveGuildEligibility(userId!)).toBe("LEFT");
    const [user] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId!));
    const [account] = await getDb().select().from(accounts).where(eq(accounts.userId, userId!));
    expect(user?.role).toBe("GUEST");
    expect(account?.access_token).toBeNull();
    expect(account?.refresh_token).toBeNull();
    expect(account?.providerAccountId).toBe(discord.userId);
    const audit = await getDb()
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.actorId, userId!));
    expect(audit[0]?.action).toBe("auth.discord.guild_left");
    expect(JSON.stringify(audit)).not.toContain("synthetic-access-token");
    discord.membership = "FOUND";
    const signedInAgain = await persistDiscordIdentity({
      discordId: discord.userId,
      name: "Rejoined verification fixture",
      image: null,
      accessToken: "synthetic-rejoin-access",
      refreshToken: "synthetic-rejoin-refresh",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scope: "identify guilds.members.read",
    });
    expect(signedInAgain.id).toBe(userId);
    const [rejoined] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId!));
    expect(rejoined?.role).toBe("APPLICANT");
  });

  it("fails closed during Discord outages without recording a false departure", async () => {
    await getDb().update(users).set({ role: "MEMBER" }).where(eq(users.id, userId!));
    discord.membership = "UNAVAILABLE";
    expect(await getLiveGuildEligibility(userId!)).toBe("UNAVAILABLE");
    const [user] = await getDb()
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId!));
    expect(user?.role).toBe("MEMBER");
    expect(
      await getDb().select().from(auditLogs).where(eq(auditLogs.actorId, userId!)),
    ).toHaveLength(0);
  });

  it("refreshes an expired account once despite concurrent authorization requests", async () => {
    await getDb()
      .update(accounts)
      .set({ expires_at: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(accounts.userId, userId!));
    const decisions = await Promise.all([
      getLiveGuildEligibility(userId!),
      getLiveGuildEligibility(userId!),
      getLiveGuildEligibility(userId!),
    ]);
    expect(decisions).toEqual(["MEMBER", "MEMBER", "MEMBER"]);
    expect(refreshDiscordOAuthTokens).toHaveBeenCalledTimes(1);
    const [account] = await getDb().select().from(accounts).where(eq(accounts.userId, userId!));
    expect(
      decryptDiscordToken(account!.refresh_token!, `discord:${discord.userId}:refresh`, secret),
    ).toBe("synthetic-rotated-refresh");
  });

  it("clears rejected refresh credentials and requires a fresh sign-in", async () => {
    await getDb()
      .update(accounts)
      .set({ expires_at: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(accounts.userId, userId!));
    discord.refreshFailure = true;
    expect(await getLiveGuildEligibility(userId!)).toBe("REAUTH_REQUIRED");
    const [account] = await getDb().select().from(accounts).where(eq(accounts.userId, userId!));
    expect(account?.access_token).toBeNull();
    expect(account?.refresh_token).toBeNull();
  });
});
