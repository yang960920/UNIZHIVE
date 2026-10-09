import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getSignInFailureDiagnostics,
  logSignInFailure,
  type SignInFailureStage,
} from "../src/lib/server/auth-signin-diagnostics";

const canaries = {
  token: "CANARY_PRIVATE_OAUTH_TOKEN",
  secret: "CANARY_PRIVATE_AUTH_SECRET",
  url: "postgres://canary-user:CANARY_DATABASE_PASSWORD@private.invalid/database",
  query: "SELECT CANARY_PRIVATE_QUERY FROM accounts WHERE access_token = $1",
  identifier: "CANARY_PRIVATE_ACCOUNT_ID",
};

afterEach(() => vi.restoreAllMocks());

function expectNoCanaries(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const canary of Object.values(canaries)) expect(serialized).not.toContain(canary);
}

describe("safe sign-in failure diagnostics", () => {
  it("unwraps a Drizzle cause and emits only the stage and allowlisted SQLSTATE", () => {
    const databaseError = Object.assign(new Error(Object.values(canaries).join(" ")), {
      code: "42P01",
      detail: canaries.token,
      parameters: Object.values(canaries),
      table: canaries.identifier,
    });
    const wrapper = Object.assign(new Error(canaries.query, { cause: databaseError }), {
      query: canaries.query,
      params: Object.values(canaries),
      connection: canaries.url,
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    logSignInFailure("ACCOUNT_PERSISTENCE", wrapper);
    expect(logged).toHaveBeenCalledExactlyOnceWith("AUTH_SIGNIN_FAILURE", {
      stage: "ACCOUNT_PERSISTENCE",
      category: "POSTGRES",
      code: "42P01",
    });
    expectNoCanaries(logged.mock.calls);
  });

  it.each(["ENOTFOUND", "CONNECT_TIMEOUT", "ERR_TLS_CERT_ALTNAME_INVALID"])(
    "classifies the known connection code %s without copying its message",
    (code) => {
      const error = Object.assign(new Error(canaries.url), { code, host: canaries.identifier });
      const diagnostic = getSignInFailureDiagnostics("ACCOUNT_PERSISTENCE", error);
      expect(diagnostic).toEqual({ stage: "ACCOUNT_PERSISTENCE", category: "TRANSPORT", code });
      expectNoCanaries(diagnostic);
    },
  );

  it("keeps only safe Discord kind and numeric HTTP status", () => {
    const error = Object.assign(new Error(Object.values(canaries).join(" ")), {
      name: "DiscordApiError",
      kind: "UNAVAILABLE",
      status: 429,
      retryAfterSeconds: canaries.secret,
      response: { body: canaries.token },
    });
    expect(getSignInFailureDiagnostics("DISCORD_GUILD_CHECK", error)).toEqual({
      stage: "DISCORD_GUILD_CHECK",
      category: "DISCORD_API",
      kind: "UNAVAILABLE",
      status: 429,
    });
    error.status = canaries.token as unknown as number;
    const diagnostic = getSignInFailureDiagnostics("DISCORD_GUILD_CHECK", error);
    expect(diagnostic).toEqual({
      stage: "DISCORD_GUILD_CHECK",
      category: "DISCORD_API",
      kind: "UNAVAILABLE",
      status: null,
    });
    expectNoCanaries(diagnostic);
  });

  it("normalizes known token-storage validation without logging the literal message", () => {
    const error = new Error("A strong auth secret is required for OAuth storage.");
    const diagnostic = getSignInFailureDiagnostics("ACCOUNT_PERSISTENCE", error);
    expect(diagnostic).toEqual({
      stage: "ACCOUNT_PERSISTENCE",
      category: "VALIDATION",
      reason: "AUTH_SECRET_TOO_SHORT",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(error.message);
  });

  it("does not accept arbitrary codes, kind, stage, messages, or primitive errors", () => {
    const unknown = {
      code: canaries.secret,
      name: "DiscordApiError",
      kind: canaries.token,
      status: canaries.url,
      message: canaries.query,
    };
    const diagnostic = getSignInFailureDiagnostics(
      canaries.identifier as SignInFailureStage,
      unknown,
    );
    expect(diagnostic).toEqual({ stage: "UNKNOWN", category: "UNKNOWN" });
    expectNoCanaries(diagnostic);
    expect(getSignInFailureDiagnostics("DISCORD_GUILD_CHECK", canaries.token)).toEqual({
      stage: "DISCORD_GUILD_CHECK",
      category: "UNKNOWN",
    });
  });

  it("does not invoke hostile getters and handles revoked proxies", () => {
    const accessed = vi.fn(() => {
      throw new Error(canaries.secret);
    });
    const hostile = {};
    for (const key of ["code", "name", "kind", "status", "message", "cause"]) {
      Object.defineProperty(hostile, key, { get: accessed });
    }
    expect(getSignInFailureDiagnostics("DISCORD_GUILD_CHECK", hostile)).toEqual({
      stage: "DISCORD_GUILD_CHECK",
      category: "UNKNOWN",
    });
    expect(accessed).not.toHaveBeenCalled();
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(getSignInFailureDiagnostics("ACCOUNT_PERSISTENCE", proxy)).toEqual({
      stage: "ACCOUNT_PERSISTENCE",
      category: "UNKNOWN",
    });
  });

  it("bounds cyclic and long cause chains without leaking values or calling coercion hooks", () => {
    const coerced = vi.fn(() => canaries.secret);
    const cycle: { cause?: unknown; code: unknown; message: unknown } = {
      code: { toString: coerced },
      message: { toString: coerced },
    };
    cycle.cause = cycle;
    const diagnostic = getSignInFailureDiagnostics("ACCOUNT_PERSISTENCE", cycle);
    expect(diagnostic).toEqual({ stage: "ACCOUNT_PERSISTENCE", category: "UNKNOWN" });
    expectNoCanaries(diagnostic);
    expect(coerced).not.toHaveBeenCalled();

    let chain: object = { code: "42P01" };
    for (let depth = 0; depth < 8; depth++) chain = { cause: chain, message: canaries.token };
    expect(getSignInFailureDiagnostics("ACCOUNT_PERSISTENCE", chain)).toEqual({
      stage: "ACCOUNT_PERSISTENCE",
      category: "UNKNOWN",
    });
  });

  it("does not allow logger failure to escape the authentication boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error(canaries.secret);
    });
    expect(() => logSignInFailure("ACCOUNT_PERSISTENCE", { code: "42P01" })).not.toThrow();
  });
});
