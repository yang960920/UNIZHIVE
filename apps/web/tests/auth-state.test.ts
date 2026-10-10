import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthOptions } from "next-auth";

const fixture = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  eligibility: vi.fn(),
  findUser: vi.fn(),
  member: vi.fn(),
  persist: vi.fn(),
  captureGrant: vi.fn(),
  confirmAbsent: vi.fn(),
  cookie: "",
}));

vi.mock("server-only", () => ({}));
// These calls model distinct HTTP requests; one-request deduplication has a separate fixture.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: fixture.cookie }),
}));
vi.mock("next-auth", () => ({ getServerSession: fixture.getServerSession }));
vi.mock("@uniz/integrations/server", () => ({ getCurrentDiscordGuildMember: fixture.member }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: fixture.eligibility,
  captureDiscordSignInGrant: fixture.captureGrant,
  confirmAbsentDiscordSignIn: fixture.confirmAbsent,
}));
vi.mock("../src/lib/server/auth-repository", () => ({
  findAuthUser: fixture.findUser,
  persistDiscordIdentity: fixture.persist,
}));

type SessionCallbackArgs = Parameters<
  NonNullable<NonNullable<NextAuthOptions["callbacks"]>["session"]>
>[0];
type SignInArgs = Parameters<NonNullable<NonNullable<NextAuthOptions["callbacks"]>["signIn"]>>[0];

function signInArgs(): SignInArgs {
  return {
    user: { id: "discord-user", name: "Live User" },
    account: {
      provider: "discord",
      type: "oauth",
      providerAccountId: "123456789012345680",
      access_token: "synthetic-sign-in-token",
      expires_at: 2_000_000_000,
      scope: "identify guilds.members.read",
    },
  } as SignInArgs;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MOCK_AUTH", "false");
  vi.stubEnv("NEXTAUTH_SECRET", "test-only-stable-secret-at-least-thirty-two-characters");
  vi.stubEnv("DATABASE_URL", "test-only-database");
  vi.stubEnv("DISCORD_CLIENT_ID", "123456789012345678");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "test-only-secret");
  vi.stubEnv("DISCORD_GUILD_ID", "123456789012345679");
  fixture.getServerSession.mockReset().mockResolvedValue(null);
  fixture.cookie = "";
  fixture.member.mockReset().mockResolvedValue({ userId: "123456789012345680", nickname: "User" });
  fixture.persist.mockReset().mockResolvedValue({ id: "live-user", name: "Live User" });
  fixture.captureGrant.mockReset().mockResolvedValue(null);
  fixture.confirmAbsent.mockReset().mockResolvedValue("LEFT");
  fixture.eligibility.mockReset().mockResolvedValue({ status: "MEMBER", retryAfterSeconds: null });
  fixture.findUser
    .mockReset()
    .mockResolvedValue({ id: "live-user", name: "Live User", role: "ADMIN", isMock: false });
});

afterEach(() => vi.unstubAllEnvs());

async function callbackSession(options: NextAuthOptions) {
  const args = {
    session: { user: { name: "Old Session Name" }, expires: "2099-01-01T00:00:00Z" },
    token: { userId: "live-user", isMock: false, authStatus: "AUTHENTICATED" },
    user: { id: "unused" },
  } as SessionCallbackArgs;
  return options.callbacks!.session!(args);
}

describe("authenticated session failure versus anonymous guest", () => {
  it("resolves the current configured signing key after module initialization and never uses a development fallback in production", async () => {
    const auth = await import("../src/lib/auth");
    expect(auth.authOptions.secret).toBe("test-only-stable-secret-at-least-thirty-two-characters");
    vi.stubEnv("NEXTAUTH_SECRET", "  a-new-test-only-signing-key-after-environment-reload  ");
    expect(auth.authOptions.secret).toBe("a-new-test-only-signing-key-after-environment-reload");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    const fallback = auth.authOptions.secret;
    expect(fallback).toMatch(/^[a-f0-9]{96}$/);
    expect(auth.authOptions.secret).toBe(fallback);
    vi.stubEnv("NODE_ENV", "production");
    expect(auth.authOptions.secret).toBeUndefined();
  });

  it("marks only a genuinely absent session as GUEST", async () => {
    const auth = await import("../src/lib/auth");
    await expect(auth.getCurrentAuthState()).resolves.toEqual({ user: null, status: "GUEST" });
  });

  it.each([
    "next-auth.session-token=opaque",
    "other=value; __Secure-next-auth.session-token.0=opaque; __Secure-next-auth.session-token.1=opaque",
  ])("requires reauthentication for an unreadable existing cookie", async (cookie) => {
    fixture.cookie = cookie;
    const auth = await import("../src/lib/auth");
    await expect(auth.getCurrentSessionState()).resolves.toEqual({
      user: null,
      status: "REAUTH_REQUIRED",
    });
    await expect(auth.getCurrentAuthState()).resolves.toEqual({
      user: null,
      status: "REAUTH_REQUIRED",
    });
    expect(fixture.eligibility).not.toHaveBeenCalled();
  });

  it("keeps a seven-day cookie and JWT lifetime with the same stable signing key", async () => {
    const { authOptions } = await import("../src/lib/auth");
    expect(authOptions.session?.maxAge).toBe(7 * 24 * 60 * 60);
    expect(authOptions.jwt?.maxAge).toBe(authOptions.session?.maxAge);
  });

  it("verifies live membership once at sign-in and reads local authorization on the following page", async () => {
    const auth = await import("../src/lib/auth");
    const args = signInArgs();
    await expect(auth.authOptions.callbacks!.signIn!(args)).resolves.toBe(true);
    expect(fixture.member).toHaveBeenCalledExactlyOnceWith(
      "123456789012345679",
      "synthetic-sign-in-token",
    );
    expect(fixture.captureGrant).toHaveBeenCalledExactlyOnceWith("123456789012345680");
    expect(fixture.captureGrant.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.member.mock.invocationCallOrder[0],
    );
    expect(fixture.persist).toHaveBeenCalledExactlyOnceWith({
      discordId: "123456789012345680",
      name: "Live User",
      image: null,
      accessToken: "synthetic-sign-in-token",
      refreshToken: null,
      expiresAt: 2_000_000_000,
      scope: "identify guilds.members.read",
    });
    expect(fixture.persist.mock.invocationCallOrder[0]).toBeGreaterThan(
      fixture.member.mock.invocationCallOrder[0],
    );
    expect(args.user).toMatchObject({ id: "live-user", name: "Live User" });
    fixture.getServerSession.mockResolvedValue(await callbackSession(auth.authOptions));
    await expect(auth.getCurrentAuthState()).resolves.toMatchObject({
      status: "AUTHENTICATED",
      user: { id: "live-user", role: "ADMIN" },
    });
    expect(fixture.eligibility).toHaveBeenCalledExactlyOnceWith("live-user");
    expect(fixture.member).toHaveBeenCalledTimes(1);
    expect(fixture.persist).toHaveBeenCalledTimes(1);
    expect(fixture.confirmAbsent).not.toHaveBeenCalled();
  });

  it.each(["identify", "guilds.members.read", ""])(
    "denies incomplete sign-in consent %s before checking membership or persisting identity",
    async (scope) => {
      const auth = await import("../src/lib/auth");
      const args = signInArgs();
      args.account!.scope = scope;
      await expect(auth.authOptions.callbacks!.signIn!(args)).resolves.toBe(false);
      expect(fixture.member).not.toHaveBeenCalled();
      expect(fixture.persist).not.toHaveBeenCalled();
      expect(fixture.eligibility).not.toHaveBeenCalled();
      expect(fixture.captureGrant).not.toHaveBeenCalled();
      expect(fixture.confirmAbsent).not.toHaveBeenCalled();
    },
  );

  it("denies absent sign-in membership for an unknown account without trying to revoke a grant", async () => {
    const auth = await import("../src/lib/auth");
    fixture.member.mockResolvedValue(null);
    await expect(auth.authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(
      "/login?error=GuildMembership",
    );
    expect(fixture.member).toHaveBeenCalledTimes(1);
    expect(fixture.persist).not.toHaveBeenCalled();
    expect(fixture.eligibility).not.toHaveBeenCalled();
    expect(fixture.confirmAbsent).not.toHaveBeenCalled();
  });

  it("denies mismatched sign-in identity without revoking the existing account grant", async () => {
    const auth = await import("../src/lib/auth");
    fixture.captureGrant.mockResolvedValue({
      userId: "live-user",
      discordId: "123456789012345680",
      encryptedAccessToken: "synthetic-current-grant",
    });
    fixture.member.mockResolvedValue({ userId: "123456789012345681", nickname: "Another User" });
    await expect(auth.authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(
      "/login?error=GuildMembership",
    );
    expect(fixture.member).toHaveBeenCalledTimes(1);
    expect(fixture.persist).not.toHaveBeenCalled();
    expect(fixture.eligibility).not.toHaveBeenCalled();
    expect(fixture.confirmAbsent).not.toHaveBeenCalled();
  });

  it.each(["LEFT", "UNAVAILABLE"])(
    "passes the captured grant to confirmed-absence handling and rejects the new login when the grant result is %s",
    async (result) => {
      const auth = await import("../src/lib/auth");
      const grant = Object.freeze({
        userId: "live-user",
        discordId: "123456789012345680",
        encryptedAccessToken: "synthetic-captured-grant",
      });
      fixture.captureGrant.mockResolvedValue(grant);
      fixture.member.mockResolvedValue(null);
      fixture.confirmAbsent.mockResolvedValue(result);
      await expect(auth.authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(
        "/login?error=GuildMembership",
      );
      expect(fixture.confirmAbsent).toHaveBeenCalledExactlyOnceWith(grant);
      expect(fixture.confirmAbsent.mock.invocationCallOrder[0]).toBeGreaterThan(
        fixture.member.mock.invocationCallOrder[0],
      );
      expect(fixture.captureGrant).toHaveBeenCalledTimes(1);
      expect(fixture.member).toHaveBeenCalledTimes(1);
      expect(fixture.persist).not.toHaveBeenCalled();
      expect(fixture.eligibility).not.toHaveBeenCalled();
    },
  );

  it("keeps distinct requests independent when no server render memoization scope is active", async () => {
    const auth = await import("../src/lib/auth");
    fixture.getServerSession
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ authStatus: "UNAVAILABLE", expires: "2099-01-01T00:00:00Z" });
    await expect(auth.getCurrentAuthState()).resolves.toEqual({ user: null, status: "GUEST" });
    await expect(auth.getCurrentAuthState()).resolves.toEqual({
      user: null,
      status: "UNAVAILABLE",
    });
    expect(fixture.getServerSession).toHaveBeenCalledTimes(2);
  });

  it.each(["UNAVAILABLE", "REAUTH_REQUIRED"])(
    "retains login identity during local account %s while denying protected access",
    async (status) => {
      fixture.eligibility.mockResolvedValue({ status, retryAfterSeconds: null });
      const auth = await import("../src/lib/auth");
      const session = await callbackSession(auth.authOptions);
      expect(session).toMatchObject({
        authStatus: "AUTHENTICATED",
        user: { id: "live-user", role: "ADMIN" },
      });
      expect(fixture.eligibility).not.toHaveBeenCalled();
      fixture.getServerSession.mockResolvedValue(session);
      await expect(auth.getCurrentSessionState()).resolves.toMatchObject({
        status: "AUTHENTICATED",
        user: { id: "live-user" },
      });
      await expect(auth.getCurrentAuthState()).resolves.toEqual({ user: null, status });
      await expect(auth.getCurrentUser()).resolves.toBeNull();
      expect(session.user).toMatchObject({ id: "live-user" });
    },
  );

  it("does not add a Discord retry delay to a local account database failure or lose login identity", async () => {
    fixture.eligibility.mockResolvedValue({ status: "UNAVAILABLE", retryAfterSeconds: null });
    const auth = await import("../src/lib/auth");
    const session = await callbackSession(auth.authOptions);
    fixture.getServerSession.mockResolvedValue(session);
    await expect(auth.getCurrentAuthState()).resolves.toEqual({
      user: null,
      status: "UNAVAILABLE",
    });
    await expect(auth.getCurrentSessionState()).resolves.toMatchObject({
      status: "AUTHENTICATED",
      user: { id: "live-user" },
    });
    expect(JSON.stringify(session)).not.toMatch(/access_token|refresh_token|client_secret/);
    expect(fixture.member).not.toHaveBeenCalled();
  });

  it("turns database failures during the session callback or final role read into UNAVAILABLE", async () => {
    const auth = await import("../src/lib/auth");
    fixture.findUser.mockRejectedValueOnce(new Error("Database unavailable"));
    const failed = await callbackSession(auth.authOptions);
    expect(failed).toMatchObject({ authStatus: "UNAVAILABLE" });
    expect(failed.user).toBeUndefined();
    const successful = await callbackSession(auth.authOptions);
    fixture.getServerSession.mockResolvedValue(successful);
    fixture.findUser.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(auth.getCurrentAuthState()).resolves.toEqual({
      user: null,
      status: "UNAVAILABLE",
    });
  });

  it("keeps a verified live identity with database GUEST role distinct from an anonymous guest", async () => {
    fixture.findUser.mockResolvedValue({
      id: "live-user",
      name: "Live User",
      role: "GUEST",
      isMock: false,
    });
    const auth = await import("../src/lib/auth");
    fixture.getServerSession.mockResolvedValue(await callbackSession(auth.authOptions));
    await expect(auth.getCurrentAuthState()).resolves.toMatchObject({
      status: "AUTHENTICATED",
      user: { role: "GUEST", isMock: false },
    });
  });

  it("denies malformed/session-read failures rather than classifying them as anonymous", async () => {
    const auth = await import("../src/lib/auth");
    fixture.getServerSession.mockResolvedValue({
      user: { id: "live-user", role: "ADMIN", isMock: false },
    });
    await expect(auth.getCurrentAuthState()).resolves.toEqual({
      user: null,
      status: "REAUTH_REQUIRED",
    });
    fixture.getServerSession.mockRejectedValue(new Error("Session read unavailable"));
    await expect(auth.getCurrentAuthState()).resolves.toEqual({
      user: null,
      status: "UNAVAILABLE",
    });
  });
});
