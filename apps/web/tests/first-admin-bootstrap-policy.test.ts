import { describe, expect, it } from "vitest";
import {
  FIRST_ADMIN_LOGIN_WINDOW_MS,
  firstAdminBootstrapUninitialized,
  firstAdminTargetDecision,
  isExactBootstrapGuildMember,
  isPublicBootstrapAddress,
  parseProductionBootstrapArguments,
  productionBootstrapSettings,
  type FirstAdminTarget,
} from "../src/lib/server/first-admin-bootstrap-policy";

const discordId = "111111111111111111";
const now = new Date("2026-10-09T00:00:00.000Z");
const env = {
  DATABASE_URL:
    "postgresql://fixture:fixture-password@db.fixture.example.com/uniz_hive?sslmode=verify-full",
  NEXTAUTH_URL: "https://hive.fixture.example.com",
  DISCORD_GUILD_ID: "222222222222222222",
  NEXTAUTH_SECRET: "nonsecret-production-test-fixture-key-32",
};
const target: FirstAdminTarget = {
  id: "fixture-owner",
  name: "Fixture Owner",
  role: "APPLICANT",
  discordId,
  profileComplete: true,
  encryptedAccessToken: "oauth:v1:fixture:cipher:text",
  expiresAt: Math.floor(now.getTime() / 1000) + 300,
  scope: "identify guilds.members.read",
  accountUpdatedAt: now,
};

describe("explicit production first-admin arguments", () => {
  it("requires production opt-in and an exact selected Discord identity; defaults to dry-run", () => {
    expect(parseProductionBootstrapArguments(["--production", "--discord-id", discordId])).toEqual({
      discordId,
      apply: false,
    });
    expect(
      parseProductionBootstrapArguments(["--discord-id", discordId, "--production", "--apply"]),
    ).toEqual({ discordId, apply: true });
    for (const args of [
      ["--discord-id", discordId],
      ["--production"],
      ["--production", "--discord-id", "@owner"],
      ["--production", "--discord-id", discordId, "--production"],
      ["--production", "--discord-id", discordId, "--apply", "--apply"],
      ["--production", "--discord-id", discordId, "--force"],
      ["--production", "--discord-id", discordId, "--discord-id", discordId],
    ])
      expect(() => parseProductionBootstrapArguments(args)).toThrow("INVALID_ARGUMENTS");
  });
});

describe("production target and TLS boundary", () => {
  it("uses caller-provided deployed settings without exposing them in errors", () => {
    expect(productionBootstrapSettings(env)).toMatchObject({
      databaseHost: "db.fixture.example.com",
      guildId: env.DISCORD_GUILD_ID,
    });
    expect(() => productionBootstrapSettings({})).toThrow("INVALID_PRODUCTION_SETTINGS");
  });
  it("rejects local/private endpoints, weak TLS, conflicting URL options, and insecure auth settings", () => {
    for (const patch of [
      { DATABASE_URL: env.DATABASE_URL.replace("db.fixture.example.com", "localhost") },
      { DATABASE_URL: env.DATABASE_URL.replace("db.fixture.example.com", "127.0.0.1") },
      { DATABASE_URL: env.DATABASE_URL.replace("db.fixture.example.com", "10.0.0.2") },
      { DATABASE_URL: env.DATABASE_URL.replace("db.fixture.example.com", "db.internal") },
      { DATABASE_URL: env.DATABASE_URL.replace("verify-full", "require") },
      { DATABASE_URL: env.DATABASE_URL.replace("?sslmode=verify-full", "") },
      { DATABASE_URL: env.DATABASE_URL + "&sslmode=disable" },
      { DATABASE_URL: env.DATABASE_URL + "&ssl=false" },
      { DATABASE_URL: env.DATABASE_URL + "&host=localhost" },
      { NEXTAUTH_URL: "http://hive.fixture.example.com" },
      { NEXTAUTH_SECRET: "short" },
      { DISCORD_GUILD_ID: "guild-name" },
      { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    ])
      expect(() => productionBootstrapSettings({ ...env, ...patch })).toThrow(
        "INVALID_PRODUCTION_SETTINGS",
      );
  });
  it("rejects DNS results that would make a public-looking target local or reserved", () => {
    for (const address of [
      "127.0.0.1",
      "10.2.3.4",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.2.1",
      "203.0.113.1",
      "::1",
      "0:0:0:0:0:0:0:1",
      "::ffff:127.0.0.1",
      "fd00::1",
      "fe80::1",
      "2001:db8::1",
      "not-an-address",
      ":",
    ])
      expect(isPublicBootstrapAddress(address)).toBe(false);
    expect(isPublicBootstrapAddress("8.8.8.8")).toBe(true);
    expect(isPublicBootstrapAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("one-time identity, login, and membership gates", () => {
  it("preserves existing administrators and also prevents reuse after an earlier bootstrap", () => {
    expect(firstAdminBootstrapUninitialized(0, 0)).toBe(true);
    for (const state of [
      [1, 0],
      [0, 1],
      [1, 1],
      [Number.NaN, 0],
    ] as const)
      expect(firstAdminBootstrapUninitialized(...state)).toBe(false);
  });
  it("requires the exact linked account and a complete, non-held profile", () => {
    expect(firstAdminTargetDecision(target, discordId, now)).toBe("READY");
    expect(firstAdminTargetDecision(undefined, discordId, now)).toBe("LOGIN_AND_PROFILE_REQUIRED");
    expect(
      firstAdminTargetDecision({ ...target, discordId: "333333333333333333" }, discordId, now),
    ).toBe("LOGIN_AND_PROFILE_REQUIRED");
    expect(firstAdminTargetDecision({ ...target, profileComplete: false }, discordId, now)).toBe(
      "COMPLETE_PROFILE_AND_LOGIN_REQUIRED",
    );
    for (const role of ["GUEST", "ADMIN", "UNKNOWN"])
      expect(firstAdminTargetDecision({ ...target, role }, discordId, now)).toBe(
        "COMPLETE_PROFILE_AND_LOGIN_REQUIRED",
      );
  });
  it("requires recently stored encrypted OAuth consent and both Discord scopes", () => {
    for (const patch of [
      { scope: "identify" },
      { scope: "guilds.members.read" },
      { encryptedAccessToken: "plaintext-fixture" },
      { expiresAt: Math.floor(now.getTime() / 1000) + 30 },
      { expiresAt: null },
      { accountUpdatedAt: new Date(now.getTime() - FIRST_ADMIN_LOGIN_WINDOW_MS - 1) },
      { accountUpdatedAt: new Date(now.getTime() + 60_001) },
      { accountUpdatedAt: new Date(Number.NaN) },
    ])
      expect(firstAdminTargetDecision({ ...target, ...patch }, discordId, now)).toBe(
        "FRESH_DISCORD_LOGIN_REQUIRED",
      );
  });
  it("does not treat another account, a pending member, or a bot as the selected guild owner", () => {
    expect(isExactBootstrapGuildMember({ user: { id: discordId } }, discordId)).toBe(true);
    for (const member of [
      null,
      {},
      { user: { id: "333333333333333333" } },
      { user: { id: discordId, bot: true } },
      { user: { id: discordId }, pending: true },
    ])
      expect(isExactBootstrapGuildMember(member, discordId)).toBe(false);
  });
});
