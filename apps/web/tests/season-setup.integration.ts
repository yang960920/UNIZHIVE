import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";
import { SCENARIO_PRESETS, type ScenarioPreset } from "../src/lib/scenario-presets";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  user: null as CurrentUser | null,
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentUser: async () => boundary.user,
  getCurrentAuthState: async () => ({
    user: boundary.user,
    status: boundary.user ? "AUTHENTICATED" : "GUEST",
  }),
}));
vi.mock("@uniz/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});

import { accounts, auditLogs, eq, getDb, scenarios, seasons, servers, users } from "@uniz/db";
import { mutateSeasonAdministration } from "../src/lib/server/season-administration";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Season setup verification requires the local uniz_hive database.");
}

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const draft = {
  action: "CREATE_SEASON_SETUP",
  scenarioKey: "DEVIATION",
  serverNumber: "0000",
  region: "TEST",
  name: "Unified Season Setup Verification",
  startsAt: "2026-10-08T00:30:00.000Z",
  settlementAt: "2026-11-08T00:30:00.000Z",
};

async function snapshot(database: Database | Transaction) {
  return {
    scenarios: await database.select().from(scenarios).orderBy(scenarios.id),
    servers: await database.select().from(servers).orderBy(servers.id),
    seasons: await database.select().from(seasons).orderBy(seasons.id),
  };
}

async function actorAudits(transaction: Transaction, actorId: string) {
  return transaction
    .select({ action: auditLogs.action, entityId: auditLogs.entityId })
    .from(auditLogs)
    .where(eq(auditLogs.actorId, actorId))
    .orderBy(auditLogs.createdAt, auditLogs.id);
}

async function availableServerNumber(transaction: Transaction, preset: ScenarioPreset) {
  const [scenario] = await transaction
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(eq(scenarios.slug, preset.slug));
  if (!scenario) return "0000";
  const occupied = new Set(
    (
      await transaction
        .select({ name: servers.name })
        .from(servers)
        .where(eq(servers.scenarioId, scenario.id))
    ).map((row) => row.name),
  );
  for (let number = 0; number < 10_000; number += 1) {
    const digits = String(number).padStart(4, "0");
    if (!occupied.has(`${preset.serverPrefix}${digits}`)) return digits;
  }
  throw new Error("No unused server number is available for verification.");
}

async function withRollback(
  verify: (transaction: Transaction, actor: CurrentUser) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const database = actual.getDb();
  const before = await snapshot(database);
  const actor: CurrentUser = {
    id: randomUUID(),
    name: "Unified Season Verification Admin",
    role: "ADMIN",
    isMock: false,
  };
  const rollback = new Error("Intentional season setup verification rollback");
  try {
    // Repository transactions use PostgreSQL SAVEPOINTs inside this forced outer rollback.
    await database.transaction(async (transaction) => {
      boundary.transaction = transaction;
      boundary.user = actor;
      await transaction.insert(users).values({ id: actor.id, name: actor.name, role: "ADMIN" });
      await transaction.insert(accounts).values({
        userId: actor.id,
        provider: "discord",
        providerAccountId: `season-setup-verification-${actor.id}`,
      });
      await verify(transaction, actor);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.user = null;
  }
  expect(await snapshot(database)).toEqual(before);
  expect(
    await database.select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
  ).toHaveLength(0);
  expect(
    await database
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.actorId, actor.id)),
  ).toHaveLength(0);
}

describe("Unified season setup against local PostgreSQL", () => {
  it("creates all four canonical servers and planned seasons with exact dates and atomic audits", async () => {
    await withRollback(async (transaction, actor) => {
      const before = await snapshot(transaction);
      for (const preset of SCENARIO_PRESETS) {
        const digits = await availableServerNumber(transaction, preset);
        const result = await mutateSeasonAdministration({
          ...draft,
          scenarioKey: preset.key,
          serverNumber: digits,
        });
        const [season] = await transaction.select().from(seasons).where(eq(seasons.id, result.id));
        expect(season).toMatchObject({
          seasonNumber: Number(digits),
          name: draft.name,
          status: "PLANNED",
          startsAt: new Date(draft.startsAt),
          settlementAt: new Date(draft.settlementAt),
          voteClosesAt: null,
          approvalStatus: "APPROVED",
          createdById: actor.id,
        });
        const [server] = await transaction
          .select()
          .from(servers)
          .where(eq(servers.id, season!.serverId));
        expect(server).toMatchObject({
          scenarioId: season!.scenarioId,
          name: `${preset.serverPrefix}${digits}`,
          region: draft.region,
        });
        const [scenario] = await transaction
          .select()
          .from(scenarios)
          .where(eq(scenarios.id, season!.scenarioId));
        const previous = before.scenarios.find((row) => row.slug === preset.slug);
        expect(scenario?.slug).toBe(preset.slug);
        expect(scenario?.name).toBe(previous?.name ?? preset.label);
        if (previous) expect(scenario).toEqual(previous);
        const audits = await actorAudits(transaction, actor.id);
        expect(audits).toContainEqual({ action: "server.created", entityId: server!.id });
        expect(audits).toContainEqual({ action: "season.created", entityId: season!.id });
        if (!previous)
          expect(audits).toContainEqual({ action: "scenario.created", entityId: scenario!.id });
      }
      const audits = await actorAudits(transaction, actor.id);
      expect(audits.filter((audit) => audit.action === "server.created")).toHaveLength(4);
      expect(audits.filter((audit) => audit.action === "season.created")).toHaveLength(4);
      expect(audits.filter((audit) => audit.action === "scenario.created")).toHaveLength(
        SCENARIO_PRESETS.filter(
          (preset) => !before.scenarios.some((row) => row.slug === preset.slug),
        ).length,
      );
    });
  });

  it("reuses an exact registered server without changing historical catalog metadata", async () => {
    await withRollback(async (transaction, actor) => {
      const preset = SCENARIO_PRESETS.find((row) => row.key === "MANIBUS")!;
      const digits = await availableServerNumber(transaction, preset);
      const [existing] = await transaction
        .select()
        .from(scenarios)
        .where(eq(scenarios.slug, preset.slug));
      const [scenario] = existing
        ? [existing]
        : await transaction
            .insert(scenarios)
            .values({
              slug: preset.slug,
              name: "Preserved Historical Scenario",
              description: "Existing description retained",
            })
            .returning();
      const [server] = await transaction
        .insert(servers)
        .values({
          scenarioId: scenario!.id,
          name: `${preset.serverPrefix}${digits}`,
          region: "Preserved Region",
        })
        .returning();
      const input = {
        ...draft,
        scenarioKey: preset.key,
        serverNumber: digits,
        region: server!.region,
      };
      const result = await mutateSeasonAdministration(input);
      const [season] = await transaction.select().from(seasons).where(eq(seasons.id, result.id));
      expect(season?.serverId).toBe(server!.id);
      expect(season?.scenarioId).toBe(scenario!.id);
      expect(await transaction.select().from(servers).where(eq(servers.id, server!.id))).toEqual([
        server,
      ]);
      expect(
        await transaction.select().from(scenarios).where(eq(scenarios.id, scenario!.id)),
      ).toEqual([scenario]);
      const audits = await actorAudits(transaction, actor.id);
      expect(audits).toHaveLength(3);
      expect(audits).toEqual(
        expect.arrayContaining([
          { action: "season.created", entityId: result.id },
          { action: "season.phases.initialized", entityId: result.id },
          { action: "season.environment.changed", entityId: result.id },
        ]),
      );
      const environmentAudit = (
        await transaction.select().from(auditLogs).where(eq(auditLogs.actorId, actor.id))
      ).find((audit) => audit.action === "season.environment.changed");
      expect(environmentAudit?.metadata).toMatchObject({
        previous: null,
        next: {
          serverType: season!.serverType,
          trancePhenomenon: season!.trancePhenomenon,
          migrationOpen: false,
        },
      });
    });
  });

  it("rolls back catalog registration and audits when either calendar date order is invalid", async () => {
    await withRollback(async (transaction, actor) => {
      const preset = SCENARIO_PRESETS[0]!;
      const input = {
        ...draft,
        scenarioKey: preset.key,
        serverNumber: await availableServerNumber(transaction, preset),
      };
      const before = await snapshot(transaction);
      for (const settlementAt of [draft.startsAt, "2026-10-07T00:30:00.000Z"]) {
        await expect(mutateSeasonAdministration({ ...input, settlementAt })).rejects.toMatchObject({
          code: "DATES",
        });
        expect(await snapshot(transaction)).toEqual(before);
        expect(await actorAudits(transaction, actor.id)).toHaveLength(0);
      }
    });
  });

  it("rejects registering the same season address twice without changing records or audits", async () => {
    await withRollback(async (transaction, actor) => {
      const first = SCENARIO_PRESETS[0]!;
      const input = {
        ...draft,
        scenarioKey: first.key,
        serverNumber: await availableServerNumber(transaction, first),
      };
      await mutateSeasonAdministration(input);
      const before = await snapshot(transaction);
      const auditsBefore = await actorAudits(transaction, actor.id);
      await expect(mutateSeasonAdministration(input)).rejects.toMatchObject({ code: "DUPLICATE" });
      expect(await snapshot(transaction)).toEqual(before);
      expect(await actorAudits(transaction, actor.id)).toEqual(auditsBefore);
    });
  });

  it("checks the administrator's current database role and Discord link before any registration", async () => {
    await withRollback(async (transaction, actor) => {
      const before = await snapshot(transaction);
      await transaction.update(users).set({ role: "APPLICANT" }).where(eq(users.id, actor.id));
      await expect(mutateSeasonAdministration(draft)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await transaction.update(users).set({ role: "ADMIN" }).where(eq(users.id, actor.id));
      await transaction.delete(accounts).where(eq(accounts.userId, actor.id));
      await expect(mutateSeasonAdministration(draft)).rejects.toMatchObject({ code: "FORBIDDEN" });
      boundary.user = null;
      await expect(mutateSeasonAdministration(draft)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
      expect(await snapshot(transaction)).toEqual(before);
      expect(await actorAudits(transaction, actor.id)).toHaveLength(0);
    });
  });
});
