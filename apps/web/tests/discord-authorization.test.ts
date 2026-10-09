import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  account: {} as Record<string, unknown>,
  user: {} as Record<string, unknown>,
  audits: [] as Record<string, unknown>[],
  tail: Promise.resolve(),
  failDatabase: false,
  guildMember: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@uniz/integrations/server", () => {
  class DiscordApiError extends Error {
    constructor(
      readonly kind: "UNAVAILABLE" | "UNAUTHORIZED",
      readonly status: number | null = null,
      readonly retryAfterSeconds: number | null = null,
    ) {
      super(kind);
    }
  }
  return {
    DiscordApiError,
    getCurrentDiscordGuildMember: fixture.guildMember,
    refreshDiscordOAuthTokens: fixture.refresh,
  };
});
vi.mock("@uniz/db", () => {
  const accounts = { name: "accounts" };
  const users = { name: "users" };
  const auditLogs = { name: "audits" };
  const transaction = {
    execute: async () => undefined,
    select: () => ({
      from(table: { name: string }) {
        const query = {
          where: () => query,
          limit: () => query,
          for: async () =>
            table.name === "accounts" ? [{ ...fixture.account }] : [{ ...fixture.user }],
        };
        return query;
      },
    }),
    update(table: { name: string }) {
      return {
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            Object.assign(table.name === "accounts" ? fixture.account : fixture.user, values);
          },
        }),
      };
    },
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        fixture.audits.push(value);
      },
    }),
  };
  return {
    accounts,
    users,
    auditLogs,
    eq: () => undefined,
    and: () => undefined,
    sql: () => undefined,
    getDb: () => ({
      async transaction<T>(callback: (connection: typeof transaction) => Promise<T>) {
        if (fixture.failDatabase) throw new Error("Database unavailable");
        const previous = fixture.tail;
        let release = () => {};
        fixture.tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback(transaction);
        } finally {
          release();
        }
      },
    }),
  };
});

import { DiscordApiError } from "@uniz/integrations/server";
import {
  getLiveGuildEligibility,
  getLiveGuildEligibilityState,
  getSessionGuildEligibilityState,
  primeSessionGuildMembership,
} from "../src/lib/server/discord-authorization";
import { invalidateUserMembershipSnapshots } from "../src/lib/server/discord-membership-cache";
import { decryptDiscordToken, encryptDiscordToken } from "../src/lib/server/discord-token-crypto";

const secret = "test-only-secret-thirty-two-characters-and-longer";
const discordId = "123456789012345678";

beforeEach(() => {
  invalidateUserMembershipSnapshots("user-id", { negative: false });
  (
    globalThis as typeof globalThis & { __unizDiscordMembershipInvalidations?: Map<string, number> }
  ).__unizDiscordMembershipInvalidations?.clear();
  vi.stubEnv("DATABASE_URL", "test-only-database");
  vi.stubEnv("POSTGRES_URL", "");
  vi.stubEnv("DISCORD_CLIENT_ID", "123456789012345679");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "test-only-client-secret");
  vi.stubEnv("DISCORD_GUILD_ID", "123456789012345680");
  vi.stubEnv("NEXTAUTH_SECRET", secret);
  fixture.account = {
    id: "account-id",
    userId: "user-id",
    providerAccountId: discordId,
    access_token: encryptDiscordToken("access-before", `discord:${discordId}:access`, secret),
    refresh_token: encryptDiscordToken("refresh-before", `discord:${discordId}:refresh`, secret),
    expires_at: Math.floor(Date.now() / 1000) + 600,
    scope: "identify guilds.members.read",
  };
  fixture.user = { id: "user-id", name: "Test User", role: "ADMIN" };
  fixture.audits = [];
  fixture.tail = Promise.resolve();
  fixture.failDatabase = false;
  fixture.guildMember
    .mockReset()
    .mockResolvedValue({ userId: discordId, nickname: null, roleIds: [], source: "LIVE" });
  fixture.refresh.mockReset().mockResolvedValue({
    accessToken: "access-after",
    refreshToken: "refresh-after",
    expiresIn: 604800,
    scope: "identify guilds.members.read",
  });
});

afterEach(() => {
  invalidateUserMembershipSnapshots("user-id", { negative: false });
  (
    globalThis as typeof globalThis & { __unizDiscordMembershipInvalidations?: Map<string, number> }
  ).__unizDiscordMembershipInvalidations?.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("bounded session guild membership evidence", () => {
  it("verifies the Discord grant when the database is configured through the Supabase integration", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_URL", "postgresql://fixture@pooler.example.test/hive");
    expect(await getLiveGuildEligibility("user-id")).toBe("MEMBER");
    expect(fixture.guildMember).toHaveBeenCalledTimes(1);
  });

  it("rejects a delayed login proof that predates a newer forced 401 for the same persisted grant", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await getSessionGuildEligibilityState("user-id");
    const proof = {
      guildId: "123456789012345680",
      discordId,
      accessToken: "access-before",
      verifiedAt: Date.now(),
    };
    await vi.advanceTimersByTimeAsync(1);
    fixture.guildMember.mockRejectedValue(new DiscordApiError("UNAUTHORIZED", 401));
    await expect(getLiveGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    await expect(primeSessionGuildMembership("user-id", proof)).resolves.toBe(false);
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    fixture.guildMember.mockResolvedValue({
      userId: discordId,
      nickname: null,
      roleIds: [],
      source: "LIVE",
    });
    await expect(getLiveGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "MEMBER",
    });
    await expect(
      primeSessionGuildMembership("user-id", { ...proof, verifiedAt: Date.now() }),
    ).resolves.toBe(true);
  });

  it("reuses one positive proof across requests without extending its original five-minute deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "MEMBER",
    });
    await vi.advanceTimersByTimeAsync(299_999);
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "MEMBER",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(1);
    fixture.guildMember.mockResolvedValueOnce(null);
    await vi.advanceTimersByTimeAsync(1);
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toEqual({
      status: "LEFT",
      retryAfterSeconds: null,
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
    expect(fixture.user.role).toBe("GUEST");
    expect(fixture.account.access_token).toBeNull();
    expect(fixture.audits).toHaveLength(1);
  });

  it("denies an expired proof during 429 without extending it or altering OAuth/roles", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await getSessionGuildEligibilityState("user-id");
    await vi.advanceTimersByTimeAsync(300_000);
    fixture.guildMember.mockRejectedValue(new DiscordApiError("UNAVAILABLE", 429, 261));
    const before = { ...fixture.account };
    for (let request = 0; request < 2; request++) {
      await expect(getSessionGuildEligibilityState("user-id")).resolves.toEqual({
        status: "UNAVAILABLE",
        retryAfterSeconds: 261,
      });
    }
    expect(fixture.guildMember).toHaveBeenCalledTimes(3);
    expect(fixture.account).toEqual(before);
    expect(fixture.user.role).toBe("ADMIN");
    expect(fixture.audits).toHaveLength(0);
  });

  it("keeps forced target checks fresh and invalidates session evidence on confirmed departure", async () => {
    await getSessionGuildEligibilityState("user-id");
    fixture.guildMember.mockResolvedValueOnce(null);
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("LEFT");
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
  });

  it("checks current token presence, consent and expiry before a cached proof can authorize", async () => {
    await getSessionGuildEligibilityState("user-id");
    const access = fixture.account.access_token;
    fixture.account.access_token = null;
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(1);
    fixture.account.access_token = access;
    await getSessionGuildEligibilityState("user-id");
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
    fixture.account.scope = "identify";
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
    fixture.account.scope = "identify guilds.members.read";
    fixture.account.expires_at = 1;
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "MEMBER",
    });
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.guildMember).toHaveBeenCalledTimes(3);
    expect(fixture.guildMember.mock.calls.at(-1)?.[1]).toBe("access-after");
  });

  it("treats sign-in/token generation replacements as cold evidence, never reusing the previous proof", async () => {
    await getSessionGuildEligibilityState("user-id");
    fixture.account.access_token = encryptDiscordToken(
      "access-replaced",
      `discord:${discordId}:access`,
      secret,
    );
    fixture.guildMember.mockResolvedValueOnce(null);
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "LEFT",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
  });

  it("does not let a slower positive response resurrect evidence invalidated by a newer forced 401", async () => {
    let release!: (member: unknown) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => (markStarted = resolve));
    fixture.guildMember.mockImplementationOnce(() => {
      markStarted();
      return new Promise((resolve) => (release = resolve));
    });
    const older = getLiveGuildEligibilityState("user-id");
    await started;
    fixture.guildMember.mockRejectedValue(new DiscordApiError("UNAUTHORIZED", 401));
    await expect(getLiveGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    release({ userId: discordId, nickname: null, roleIds: [], source: "LIVE" });
    await expect(older).resolves.toMatchObject({ status: "UNAVAILABLE" });
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "REAUTH_REQUIRED",
    });
    expect(fixture.guildMember).toHaveBeenCalledTimes(3);
    expect(fixture.user.role).toBe("ADMIN");
  });

  it("rejects superseded live positive responses instead of seeding a new account generation", async () => {
    fixture.guildMember.mockImplementationOnce(async () => {
      fixture.account.access_token = encryptDiscordToken(
        "concurrent-sign-in-token",
        `discord:${discordId}:access`,
        secret,
      );
      return { userId: discordId, nickname: null, roleIds: [], source: "LIVE" };
    });
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "UNAVAILABLE",
    });
    await getSessionGuildEligibilityState("user-id");
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
  });

  it("primes only the matching persisted login proof and preserves the proof's actual age", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const proof = {
      guildId: "123456789012345680",
      discordId,
      accessToken: "access-before",
      verifiedAt: Date.now(),
    };
    await expect(
      primeSessionGuildMembership("user-id", { ...proof, accessToken: "wrong-token" }),
    ).resolves.toBe(false);
    await expect(
      primeSessionGuildMembership("user-id", { ...proof, guildId: "123456789012345681" }),
    ).resolves.toBe(false);
    await expect(primeSessionGuildMembership("user-id", proof)).resolves.toBe(true);
    await expect(getSessionGuildEligibilityState("user-id")).resolves.toMatchObject({
      status: "MEMBER",
    });
    expect(fixture.guildMember).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300_000);
    await expect(primeSessionGuildMembership("user-id", proof)).resolves.toBe(false);
    await getSessionGuildEligibilityState("user-id");
    expect(fixture.guildMember).toHaveBeenCalledTimes(1);
  });
});

describe("live authorization and token lifecycle", () => {
  it("preserves OAuth grants and roles while exposing only safe rate-limit delay metadata", async () => {
    fixture.guildMember.mockRejectedValue(new DiscordApiError("UNAVAILABLE", 429, 261));
    const before = { ...fixture.account };
    await expect(getLiveGuildEligibilityState("user-id")).resolves.toEqual({
      status: "UNAVAILABLE",
      retryAfterSeconds: 261,
    });
    expect(fixture.account).toEqual(before);
    expect(fixture.user.role).toBe("ADMIN");
    expect(fixture.audits).toHaveLength(0);
  });

  it("preserves expired grants during a transient refresh rate limit and retries after recovery", async () => {
    fixture.account.expires_at = 1;
    fixture.refresh.mockRejectedValueOnce(new DiscordApiError("UNAVAILABLE", 429, 261));
    const before = { ...fixture.account };
    await expect(getLiveGuildEligibilityState("user-id")).resolves.toEqual({
      status: "UNAVAILABLE",
      retryAfterSeconds: 261,
    });
    expect(fixture.account).toEqual(before);
    expect(fixture.guildMember).not.toHaveBeenCalled();
    await expect(getLiveGuildEligibilityState("user-id")).resolves.toEqual({
      status: "MEMBER",
      retryAfterSeconds: null,
    });
    expect(fixture.refresh).toHaveBeenCalledTimes(2);
    expect(fixture.user.role).toBe("ADMIN");
  });

  it("checks Discord afresh for every authorized request instead of caching membership", async () => {
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("MEMBER");
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("MEMBER");
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
    expect(fixture.refresh).not.toHaveBeenCalled();
  });

  it("rotates one expired refresh token under serialized concurrent requests and encrypts both replacements", async () => {
    fixture.account.expires_at = Math.floor(Date.now() / 1000) - 1;
    expect(
      await Promise.all([getLiveGuildEligibility("user-id"), getLiveGuildEligibility("user-id")]),
    ).toEqual(["MEMBER", "MEMBER"]);
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(fixture.refresh.mock.calls[0][0].refreshToken).toBe("refresh-before");
    expect(
      decryptDiscordToken(
        String(fixture.account.access_token),
        `discord:${discordId}:access`,
        secret,
      ),
    ).toBe("access-after");
    expect(
      decryptDiscordToken(
        String(fixture.account.refresh_token),
        `discord:${discordId}:refresh`,
        secret,
      ),
    ).toBe("refresh-after");
    expect(fixture.guildMember).toHaveBeenCalledTimes(2);
  });

  it("demotes confirmed leavers, clears credentials and keeps identity/history records", async () => {
    fixture.guildMember.mockResolvedValue(null);
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("LEFT");
    expect(fixture.user).toMatchObject({ id: "user-id", name: "Test User", role: "GUEST" });
    expect(fixture.account).toMatchObject({
      id: "account-id",
      access_token: null,
      refresh_token: null,
    });
    expect(fixture.audits).toHaveLength(1);
    expect(fixture.audits[0]).toMatchObject({
      action: "auth.discord.guild_left",
      metadata: { previousRole: "ADMIN", role: "GUEST" },
    });
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("REAUTH_REQUIRED");
  });

  it("denies outages and unauthorized tokens without falsely marking the user as a leaver", async () => {
    fixture.guildMember.mockRejectedValueOnce(new DiscordApiError("UNAVAILABLE"));
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("UNAVAILABLE");
    fixture.guildMember.mockRejectedValueOnce(new DiscordApiError("UNAUTHORIZED"));
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("REAUTH_REQUIRED");
    expect(fixture.user.role).toBe("ADMIN");
    expect(fixture.audits).toHaveLength(0);
    fixture.failDatabase = true;
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("UNAVAILABLE");
  });

  it("requires re-consent after expired/revoked refresh tokens and never authorizes with old access tokens", async () => {
    fixture.account.expires_at = 1;
    fixture.refresh.mockRejectedValue(new DiscordApiError("UNAUTHORIZED"));
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("REAUTH_REQUIRED");
    expect(fixture.guildMember).not.toHaveBeenCalled();
    expect(fixture.account.access_token).toBeNull();
    expect(fixture.account.refresh_token).toBeNull();
    expect(fixture.user.role).toBe("ADMIN");
  });

  it("preserves expired credentials for retry when refresh is unavailable", async () => {
    fixture.account.expires_at = 1;
    fixture.refresh.mockRejectedValue(new DiscordApiError("UNAVAILABLE"));
    const before = { ...fixture.account };
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("UNAVAILABLE");
    expect(fixture.account).toEqual(before);
    expect(fixture.guildMember).not.toHaveBeenCalled();
    expect(fixture.user.role).toBe("ADMIN");
  });

  it("ignores an old leave response if a concurrent sign-in replaced the checked token", async () => {
    fixture.guildMember.mockImplementationOnce(async () => {
      fixture.account.access_token = encryptDiscordToken(
        "concurrent-sign-in-token",
        `discord:${discordId}:access`,
        secret,
      );
      return null;
    });
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("UNAVAILABLE");
    expect(fixture.user.role).toBe("ADMIN");
    expect(fixture.audits).toHaveLength(0);
    expect(fixture.account.access_token).not.toBeNull();
  });

  it("rejects expired tokens without refresh grants and successful refreshes with lost scope", async () => {
    fixture.account.expires_at = 1;
    fixture.account.refresh_token = null;
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("REAUTH_REQUIRED");
    expect(fixture.refresh).not.toHaveBeenCalled();
    fixture.account.refresh_token = encryptDiscordToken(
      "refresh-before",
      `discord:${discordId}:refresh`,
      secret,
    );
    fixture.refresh.mockResolvedValue({
      accessToken: "access-after",
      refreshToken: "refresh-after",
      expiresIn: 600,
      scope: "identify",
    });
    await expect(getLiveGuildEligibility("user-id")).resolves.toBe("REAUTH_REQUIRED");
    expect(fixture.account.access_token).toBeNull();
    expect(fixture.guildMember).not.toHaveBeenCalled();
  });
});
