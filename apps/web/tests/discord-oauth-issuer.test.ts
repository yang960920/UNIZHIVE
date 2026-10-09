import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextAuthOptions } from "next-auth";
import { DISCORD_OAUTH_ISSUER, DISCORD_OAUTH_SCOPE } from "../src/lib/discord-oauth-config";

// Only application boundaries are mocked. The OAuth provider normalization,
// client construction and callback validation use the installed native libraries.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@uniz/integrations/server", () => ({ getCurrentDiscordGuildMember: vi.fn() }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: vi.fn(),
  primeSessionGuildMembership: vi.fn(),
}));
vi.mock("../src/lib/server/auth-repository", () => ({
  findAuthUser: vi.fn(),
  persistDiscordIdentity: vi.fn(),
}));

const webRequire = createRequire(new URL("../package.json", import.meta.url));
const nativeAuthRequire = createRequire(webRequire.resolve("next-auth"));
const parseProviders = nativeAuthRequire("./core/lib/providers.js").default as (options: {
  providers: NextAuthOptions["providers"];
  url: string;
  providerId: string;
}) => { provider: NormalizedDiscordProvider };
const createOAuthClient = nativeAuthRequire("./core/lib/oauth/client.js")
  .openidClient as (options: { provider: NormalizedDiscordProvider }) => Promise<NativeOAuthClient>;
const TokenSet = nativeAuthRequire("openid-client").TokenSet as new (
  tokens: TokenResponse,
) => TokenResponse;
const nativeStateCheck = nativeAuthRequire("./core/lib/oauth/checks.js").state as {
  use: (
    cookies: Record<string, string>,
    responseCookies: unknown[],
    options: {
      provider: NormalizedDiscordProvider;
      cookies: { state: { name: string } };
    },
    checks: Record<string, unknown>,
  ) => Promise<void>;
};

interface NormalizedDiscordProvider {
  id: string;
  issuer?: string;
  idToken: boolean;
  checks: string[];
  callbackUrl: string;
  authorization: { params: { scope: string } };
  userinfo: { url: string };
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface NativeOAuthClient {
  grant: ReturnType<typeof vi.fn>;
  oauthCallback: (
    redirectUri: string,
    parameters: Record<string, string>,
    checks: Record<string, string>,
  ) => Promise<TokenResponse>;
}

const callbackState = "synthetic-callback-state";
const responseParameters = {
  code: "synthetic-authorization-code",
  state: callbackState,
  iss: DISCORD_OAUTH_ISSUER,
};
let configuredProvider: NormalizedDiscordProvider;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MOCK_AUTH", "false");
  vi.stubEnv("NEXTAUTH_SECRET", "synthetic-test-secret-at-least-thirty-two-characters");
  vi.stubEnv("DATABASE_URL", "synthetic-test-database");
  vi.stubEnv("DISCORD_CLIENT_ID", "123456789012345678");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "synthetic-client-secret");
  vi.stubEnv("DISCORD_GUILD_ID", "123456789012345679");
  const { authOptions } = await import("../src/lib/auth");
  configuredProvider = parseProviders({
    providers: authOptions.providers,
    url: "http://127.0.0.1:3000/api/auth",
    providerId: "discord",
  }).provider;
});

afterAll(() => vi.unstubAllEnvs());

async function callbackClient(provider = configuredProvider) {
  const client = await createOAuthClient({ provider });
  // No network request, real authorization code, token or credential is used.
  client.grant = vi.fn().mockResolvedValue(
    new TokenSet({
      access_token: "synthetic-access-token",
      token_type: "Bearer",
      scope: DISCORD_OAUTH_SCOPE,
    }),
  );
  return client;
}

describe("Discord authorization-response issuer validation", () => {
  it("normalizes the application provider with the verified issuer, existing scopes and state protection", () => {
    expect(configuredProvider.issuer).toBe(DISCORD_OAUTH_ISSUER);
    expect(configuredProvider.authorization.params.scope).toBe(DISCORD_OAUTH_SCOPE);
    expect(configuredProvider.checks).toEqual(["state"]);
    expect(configuredProvider.idToken).toBe(false);
    expect(configuredProvider.userinfo.url).toBe("https://discord.com/api/users/@me");
  });

  it("reproduces the original missing-issuer failure before a token exchange", async () => {
    const client = await callbackClient({ ...configuredProvider, issuer: undefined });
    await expect(
      client.oauthCallback(configuredProvider.callbackUrl, responseParameters, {
        state: callbackState,
      }),
    ).rejects.toThrow("issuer must be configured on the issuer");
    expect(client.grant).not.toHaveBeenCalled();
  });

  it("accepts the expected Discord issuer and matching state through the actual OAuth callback", async () => {
    const client = await callbackClient();
    await expect(
      client.oauthCallback(configuredProvider.callbackUrl, responseParameters, {
        state: callbackState,
      }),
    ).resolves.toMatchObject({ token_type: "Bearer", scope: DISCORD_OAUTH_SCOPE });
    expect(client.grant).toHaveBeenCalledExactlyOnceWith(
      {
        grant_type: "authorization_code",
        code: "synthetic-authorization-code",
        redirect_uri: configuredProvider.callbackUrl,
        code_verifier: undefined,
      },
      { clientAssertionPayload: undefined, DPoP: undefined },
    );
  });

  it("rejects a foreign callback issuer before exchanging the code", async () => {
    const client = await callbackClient();
    await expect(
      client.oauthCallback(
        configuredProvider.callbackUrl,
        { ...responseParameters, iss: "https://attacker.example" },
        { state: callbackState },
      ),
    ).rejects.toThrow("iss mismatch");
    expect(client.grant).not.toHaveBeenCalled();
  });

  it("rejects a mismatched state before exchanging the code", async () => {
    const client = await callbackClient();
    await expect(
      client.oauthCallback(configuredProvider.callbackUrl, responseParameters, {
        state: "another-synthetic-state",
      }),
    ).rejects.toThrow("state mismatch");
    expect(client.grant).not.toHaveBeenCalled();
  });

  it("rejects a response missing state when the expected state exists", async () => {
    const client = await callbackClient();
    await expect(
      client.oauthCallback(
        configuredProvider.callbackUrl,
        { code: responseParameters.code, iss: DISCORD_OAUTH_ISSUER },
        { state: callbackState },
      ),
    ).rejects.toThrow("state missing from the response");
    expect(client.grant).not.toHaveBeenCalled();
  });

  it("rejects a response state without its expected validation state", async () => {
    const client = await callbackClient();
    await expect(
      client.oauthCallback(configuredProvider.callbackUrl, responseParameters, {}),
    ).rejects.toThrow("checks.state argument is missing");
    expect(client.grant).not.toHaveBeenCalled();
  });

  it("keeps NextAuth's rejection of a missing signed state cookie", async () => {
    await expect(
      nativeStateCheck.use(
        {},
        [],
        {
          provider: configuredProvider,
          cookies: { state: { name: "next-auth.state" } },
        },
        {},
      ),
    ).rejects.toThrow("State cookie was missing");
  });
});
