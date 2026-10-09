import { describe, expect, it } from "vitest";
import {
  getAuthEnvironment,
  isAllowedSessionIdentity,
  resolveDevIdentity,
  resolveAuthSecret,
} from "../src/lib/auth-policy";

describe("development authentication boundary", () => {
  it("uses a random development fallback for blank secrets and never carries it into production", () => {
    expect(
      resolveAuthSecret(
        { NODE_ENV: "development", NEXTAUTH_SECRET: "" },
        "random-development-secret",
      ),
    ).toBe("random-development-secret");
    expect(
      resolveAuthSecret(
        { NODE_ENV: "development", NEXTAUTH_SECRET: "   " },
        "random-development-secret",
      ),
    ).toBe("random-development-secret");
    expect(
      resolveAuthSecret(
        { NODE_ENV: "production", NEXTAUTH_SECRET: "" },
        "random-development-secret",
      ),
    ).toBeUndefined();
    expect(
      resolveAuthSecret(
        { NODE_ENV: "production", NEXTAUTH_SECRET: " configured-secret " },
        "random-development-secret",
      ),
    ).toBe("configured-secret");
  });
  it("enables only in explicit development and respects opt-out", () => {
    expect(getAuthEnvironment({ NODE_ENV: "development" }).mockEnabled).toBe(true);
    expect(getAuthEnvironment({ NODE_ENV: "development", MOCK_AUTH: "false" }).mockEnabled).toBe(
      false,
    );
    expect(getAuthEnvironment({ NODE_ENV: "test", MOCK_AUTH: "true" }).mockEnabled).toBe(false);
    expect(getAuthEnvironment({ NODE_ENV: "production" }).mockEnabled).toBe(false);
  });

  it("fails closed when production accidentally requests mock auth", () => {
    expect(() => getAuthEnvironment({ NODE_ENV: "production", MOCK_AUTH: "true" })).toThrow(
      "forbidden",
    );
    expect(() => getAuthEnvironment({ NODE_ENV: "production", MOCK_AUTH: " TRUE " })).toThrow(
      "forbidden",
    );
  });

  it("accepts only known identity IDs and derives their roles server-side", () => {
    const env = { NODE_ENV: "development" };
    expect(resolveDevIdentity("demo-member", env)?.role).toBe("MEMBER");
    expect(resolveDevIdentity("demo-officer", env)?.role).toBe("OFFICER");
    expect(resolveDevIdentity("demo-admin", env)?.role).toBe("ADMIN");
    expect(resolveDevIdentity("ADMIN", env)).toBeNull();
    expect(resolveDevIdentity({ role: "ADMIN" }, env)).toBeNull();
  });

  it("rejects old mock cookies in production, even if the marker is tampered", () => {
    const production = { NODE_ENV: "production" };
    expect(isAllowedSessionIdentity({ id: "demo-admin", isMock: true }, production)).toBe(false);
    expect(isAllowedSessionIdentity({ id: "demo-admin", isMock: false }, production)).toBe(false);
    expect(isAllowedSessionIdentity({ id: "real-user", isMock: true }, production)).toBe(false);
    expect(isAllowedSessionIdentity({ id: "real-user", isMock: false }, production)).toBe(true);
  });

  it("does not enable live Discord with incomplete production configuration", () => {
    const env = {
      NODE_ENV: "production",
      DISCORD_CLIENT_ID: "id",
      DISCORD_CLIENT_SECRET: "secret",
      DISCORD_GUILD_ID: "guild",
      DATABASE_URL: "db",
    };
    expect(getAuthEnvironment(env).discordEnabled).toBe(false);
    expect(getAuthEnvironment({ ...env, NEXTAUTH_SECRET: "secret" }).discordEnabled).toBe(true);
  });
});
