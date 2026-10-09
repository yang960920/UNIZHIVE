import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthOptions } from "next-auth";

const boundary = vi.hoisted(() => ({ member: vi.fn(), persist: vi.fn(), prime: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@uniz/integrations/server", () => ({ getCurrentDiscordGuildMember: boundary.member }));
vi.mock("../src/lib/server/auth-repository", () => ({
  findAuthUser: vi.fn(),
  persistDiscordIdentity: boundary.persist,
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: vi.fn(),
  primeSessionGuildMembership: boundary.prime,
}));

type SignInArgs = Parameters<NonNullable<NonNullable<NextAuthOptions["callbacks"]>["signIn"]>>[0];

function signInArgs(): SignInArgs {
  return {
    user: { id: "CANARY_USER_ID", name: "CANARY_USER_NAME" },
    account: {
      provider: "discord",
      type: "oauth",
      providerAccountId: "CANARY_DISCORD_ACCOUNT_ID",
      access_token: "CANARY_ACCESS_TOKEN",
      refresh_token: "CANARY_REFRESH_TOKEN",
      expires_at: 2_000_000_000,
      scope: "identify guilds.members.read",
    },
  } as SignInArgs;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MOCK_AUTH", "false");
  vi.stubEnv("NEXTAUTH_SECRET", "CANARY_AUTH_SECRET_at_least_thirty_two_characters");
  vi.stubEnv("DATABASE_URL", "postgres://canary:CANARY_DB_PASSWORD@canary.invalid/canary");
  vi.stubEnv("DISCORD_CLIENT_ID", "CANARY_CLIENT_ID");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "CANARY_CLIENT_SECRET");
  vi.stubEnv("DISCORD_GUILD_ID", "CANARY_GUILD_ID");
  boundary.member.mockReset().mockResolvedValue({ userId: "CANARY_DISCORD_ACCOUNT_ID" });
  boundary.persist
    .mockReset()
    .mockResolvedValue({ id: "CANARY_DATABASE_USER", name: "CANARY_NAME" });
  boundary.prime.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sign-in logging preserves the authentication boundary", () => {
  it("reports a guild failure at its stage without exposing any user or grant fields", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    boundary.member.mockRejectedValue({
      name: "DiscordApiError",
      kind: "UNAVAILABLE",
      status: 403,
      message: "CANARY_ACCESS_TOKEN CANARY_CLIENT_SECRET CANARY_GUILD_ID",
    });
    const { authOptions } = await import("../src/lib/auth");
    await expect(authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(
      "/login?error=DiscordUnavailable",
    );
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledExactlyOnceWith("AUTH_SIGNIN_FAILURE", {
      stage: "DISCORD_GUILD_CHECK",
      category: "DISCORD_API",
      kind: "UNAVAILABLE",
      status: 403,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("CANARY");
  });

  it("reports a nested database failure after guild verification with the same public redirect", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    boundary.persist.mockRejectedValue({
      message: "CANARY_SQL_QUERY CANARY_REFRESH_TOKEN CANARY_DB_PASSWORD",
      cause: { code: "42P01", message: "CANARY_DATABASE_URL", parameters: signInArgs() },
    });
    const { authOptions } = await import("../src/lib/auth");
    await expect(authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(
      "/login?error=DiscordUnavailable",
    );
    expect(boundary.member).toHaveBeenCalledTimes(1);
    expect(boundary.prime).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledExactlyOnceWith("AUTH_SIGNIN_FAILURE", {
      stage: "ACCOUNT_PERSISTENCE",
      category: "POSTGRES",
      code: "42P01",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("CANARY");
  });

  it("keeps confirmed nonmembership and incomplete consent separate from server failures", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { authOptions } = await import("../src/lib/auth");
    boundary.member.mockResolvedValue(null);
    await expect(authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(
      "/login?error=GuildMembership",
    );
    const incomplete = signInArgs();
    incomplete.account!.scope = "identify";
    await expect(authOptions.callbacks!.signIn!(incomplete)).resolves.toBe(false);
    expect(boundary.member).toHaveBeenCalledTimes(1);
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("preserves successful login when optional membership priming fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    boundary.prime.mockRejectedValue(new Error("CANARY_PRIMING_FAILURE"));
    const { authOptions } = await import("../src/lib/auth");
    await expect(authOptions.callbacks!.signIn!(signInArgs())).resolves.toBe(true);
    expect(logged).not.toHaveBeenCalled();
  });
});
