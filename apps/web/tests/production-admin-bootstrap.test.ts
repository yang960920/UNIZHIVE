import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { encryptDiscordToken } from "../src/lib/server/discord-token-crypto";
import {
  executeProductionFirstAdminBootstrap,
  runProductionAdminBootstrapCli,
} from "../scripts/bootstrap-production-admin.mjs";

const discordId = "111111111111111111";
const guildId = "222222222222222222";
const now = new Date("2026-10-09T00:00:00.000Z");
const secret = "nonsecret-production-test-fixture-key-32";
const env = {
  DATABASE_URL:
    "postgresql://fixture:fixture-password@db.fixture.example.com/uniz_hive?sslmode=verify-full",
  NEXTAUTH_URL: "https://hive.fixture.example.com",
  DISCORD_GUILD_ID: guildId,
  NEXTAUTH_SECRET: secret,
};
const settings = { guildId, authSecret: secret };
const encrypted = encryptDiscordToken("fixture-oauth-token", `discord:${discordId}:access`, secret);

function databaseFixture(
  options: {
    admins?: number;
    audits?: number;
    target?: boolean;
    profile?: boolean;
    role?: string;
    encrypted?: string;
    auditFailure?: boolean;
  } = {},
) {
  const state = {
    admins: options.admins ?? 0,
    audits: options.audits ?? 0,
    role: options.role ?? "APPLICANT",
    writes: 0,
  };
  const queries: string[] = [];
  const transaction = Object.assign(
    async (strings: TemplateStringsArray, ...parameters: unknown[]) => {
      const sql = strings.join("?");
      queries.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes("as admin_count"))
        return [{ admin_count: state.admins, bootstrap_count: state.audits }];
      if (sql.includes("from users u")) {
        expect(parameters).toEqual([discordId]);
        return options.target === false
          ? []
          : [
              {
                id: "fixture-owner",
                name: "Fixture Owner",
                role: state.role,
                discord_id: discordId,
                profile_complete: options.profile ?? true,
                access_token: options.encrypted ?? encrypted,
                expires_at: Math.floor(now.getTime() / 1000) + 300,
                scope: "identify guilds.members.read",
                account_updated_at: now,
              },
            ];
      }
      if (sql.includes("update users set role")) {
        state.writes++;
        state.role = "ADMIN";
        state.admins++;
        return [];
      }
      if (sql.includes("insert into audit_logs")) {
        if (options.auditFailure) throw new Error("fixture-only audit failure");
        state.writes++;
        state.audits++;
        return [];
      }
      throw new Error("Unexpected fixture query");
    },
    { json: (value: unknown) => value },
  );
  const database = {
    async begin<T>(fn: (t: typeof transaction) => Promise<T>) {
      const previous = { ...state };
      try {
        return await fn(transaction);
      } catch (error) {
        Object.assign(state, previous);
        throw error;
      }
    },
    end: vi.fn(async () => {}),
  };
  return { database, state, queries };
}

describe("production operator transaction", () => {
  it("verifies the exact owner on a dry-run without elevating any account", async () => {
    const fixture = databaseFixture();
    const verifyMembership = vi.fn(async () => true);
    expect(
      await executeProductionFirstAdminBootstrap(
        fixture.database,
        { discordId, apply: false },
        settings,
        { now: () => now, verifyMembership },
      ),
    ).toEqual({ status: "READY", userId: "fixture-owner", name: "Fixture Owner" });
    expect(verifyMembership).toHaveBeenCalledWith(guildId, discordId, "fixture-oauth-token");
    expect(fixture.state).toMatchObject({ role: "APPLICANT", admins: 0, audits: 0, writes: 0 });
    expect(fixture.queries[0]).toContain("pg_advisory_xact_lock(912743110)");
  });
  it("commits the one explicit promotion and audit together, then denies another bootstrap", async () => {
    const fixture = databaseFixture();
    const dependencies = { now: () => now, verifyMembership: vi.fn(async () => true) };
    expect(
      await executeProductionFirstAdminBootstrap(
        fixture.database,
        { discordId, apply: true },
        settings,
        dependencies,
      ),
    ).toMatchObject({ status: "APPLIED" });
    expect(fixture.state).toMatchObject({ role: "ADMIN", admins: 1, audits: 1, writes: 2 });
    expect(
      await executeProductionFirstAdminBootstrap(
        fixture.database,
        { discordId, apply: true },
        settings,
        dependencies,
      ),
    ).toEqual({ status: "ALREADY_INITIALIZED" });
    expect(dependencies.verifyMembership).toHaveBeenCalledTimes(1);
    expect(fixture.state.writes).toBe(2);
  });
  it("preserves an existing administrator and does not become a recovery path after a prior audit", async () => {
    for (const state of [{ admins: 1 }, { audits: 1 }]) {
      const fixture = databaseFixture(state),
        verifyMembership = vi.fn(async () => true);
      expect(
        await executeProductionFirstAdminBootstrap(
          fixture.database,
          { discordId, apply: true },
          settings,
          { now: () => now, verifyMembership },
        ),
      ).toEqual({ status: "ALREADY_INITIALIZED" });
      expect(fixture.state.writes).toBe(0);
      expect(verifyMembership).not.toHaveBeenCalled();
    }
  });
  it("cannot promote a missing profile, a held account, a wrong-context token, or unconfirmed guild member", async () => {
    for (const options of [
      { target: false },
      { profile: false },
      { role: "GUEST" },
      {
        encrypted: encryptDiscordToken(
          "fixture-oauth-token",
          "discord:333333333333333333:access",
          secret,
        ),
      },
    ]) {
      const fixture = databaseFixture(options),
        verifyMembership = vi.fn(async () => true);
      const result = await executeProductionFirstAdminBootstrap(
        fixture.database,
        { discordId, apply: true },
        settings,
        { now: () => now, verifyMembership },
      );
      expect(result.status).not.toBe("APPLIED");
      expect(fixture.state.writes).toBe(0);
      expect(verifyMembership).not.toHaveBeenCalled();
    }
    const fixture = databaseFixture();
    expect(
      await executeProductionFirstAdminBootstrap(
        fixture.database,
        { discordId, apply: true },
        settings,
        { now: () => now, verifyMembership: async () => false },
      ),
    ).toEqual({ status: "DISCORD_MEMBERSHIP_NOT_CONFIRMED" });
    expect(fixture.state.writes).toBe(0);
  });
  it("does not retain a role change when the audit append fails", async () => {
    const fixture = databaseFixture({ auditFailure: true });
    await expect(
      executeProductionFirstAdminBootstrap(fixture.database, { discordId, apply: true }, settings, {
        now: () => now,
        verifyMembership: async () => true,
      }),
    ).rejects.toThrow("fixture-only audit failure");
    expect(fixture.state).toMatchObject({ role: "APPLICANT", admins: 0, audits: 0, writes: 0 });
  });
});

describe("production CLI safety and diagnostic privacy", () => {
  it("denies missing production opt-in before DNS, membership, or database connection", async () => {
    const connect = vi.fn(),
      confirmTarget = vi.fn(),
      error = vi.fn();
    expect(
      await runProductionAdminBootstrapCli({
        argv: ["--discord-id", discordId, "--apply"],
        env,
        connect,
        confirmTarget,
        error,
      }),
    ).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    expect(confirmTarget).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join(" ")).not.toContain(env.DATABASE_URL);
  });
  it("denies incomplete or non-public settings before resolving or connecting", async () => {
    for (const suppliedEnv of [
      {},
      { ...env, DATABASE_URL: env.DATABASE_URL.replace("db.fixture.example.com", "localhost") },
      { ...env, DATABASE_URL: env.DATABASE_URL.replace("verify-full", "require") },
    ]) {
      const connect = vi.fn(),
        confirmTarget = vi.fn();
      expect(
        await runProductionAdminBootstrapCli({
          argv: ["--production", "--discord-id", discordId],
          env: suppliedEnv,
          connect,
          confirmTarget,
          error: vi.fn(),
        }),
      ).toBe(1);
      expect(connect).not.toHaveBeenCalled();
      expect(confirmTarget).not.toHaveBeenCalled();
    }
  });
  it("does not connect when DNS target confirmation fails", async () => {
    const connect = vi.fn(),
      log = vi.fn();
    expect(
      await runProductionAdminBootstrapCli({
        argv: ["--production", "--discord-id", discordId],
        env,
        connect,
        confirmTarget: async () => {
          throw new Error("INVALID_PRODUCTION_TARGET");
        },
        error: vi.fn(),
        log,
      }),
    ).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it("uses only supplied settings and keeps dry-run logs free of OAuth and database secrets", async () => {
    const fixture = databaseFixture(),
      log = vi.fn(),
      error = vi.fn();
    expect(
      await runProductionAdminBootstrapCli({
        argv: ["--production", "--discord-id", discordId],
        env,
        connect: () => fixture.database,
        confirmTarget: async () => {},
        dependencies: { now: () => now, verifyMembership: async () => true },
        log,
        error,
      }),
    ).toBe(0);
    expect(fixture.state.writes).toBe(0);
    expect(fixture.database.end).toHaveBeenCalledOnce();
    const output = log.mock.calls.flat().join(" ");
    expect(output).toContain("READY");
    for (const privateValue of [
      secret,
      env.DATABASE_URL,
      encrypted,
      "fixture-oauth-token",
      "fixture-password",
    ])
      expect(output).not.toContain(privateValue);
    expect(error).not.toHaveBeenCalled();
  });
  it("suppresses private lower-level failure details, including connection cleanup errors", async () => {
    const fixture = databaseFixture(),
      log = vi.fn(),
      error = vi.fn();
    fixture.database.end.mockRejectedValue(new Error("fixture-password cleanup detail"));
    expect(
      await runProductionAdminBootstrapCli({
        argv: ["--production", "--discord-id", discordId],
        env,
        connect: () => fixture.database,
        confirmTarget: async () => {},
        dependencies: {
          now: () => now,
          verifyMembership: async () => {
            throw new Error("fixture-oauth-token private transport detail");
          },
        },
        log,
        error,
      }),
    ).toBe(1);
    expect(log).not.toHaveBeenCalled();
    const output = error.mock.calls.flat().join(" ");
    expect(output).not.toMatch(/fixture-password|fixture-oauth-token|private transport detail/);
  });
});
