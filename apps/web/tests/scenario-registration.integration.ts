import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

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
  // Each repository transaction becomes a real PostgreSQL SAVEPOINT within the outer rollback.
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});

import { accounts, auditLogs, eq, getDb, scenarios, servers, sql, users } from "@uniz/db";
import { mutateSeasonAdministration } from "../src/lib/server/season-administration";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Scenario registration verification requires the local uniz_hive database.");
}

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const presets = [
  {
    key: "DEVIATION",
    slug: "deviation",
    name: "비정상수용(Deviation)",
    prefix: "Deviation-X",
  },
  { key: "MANIBUS", slug: "manibus", name: "땃쥐(Manibus)", prefix: "Manibus-X" },
  {
    key: "WINTER",
    slug: "the-way-of-winter",
    name: "설산(The Way Of Winter)",
    prefix: "W_Winter-X",
  },
  {
    key: "ENDLESS_DREAM",
    slug: "endless-dream",
    name: "무한의 꿈(Endless Dream)",
    prefix: "E_Dream-X",
  },
] as const;

async function canonicalRows(database: Database | Transaction) {
  return database
    .select({ id: scenarios.id, slug: scenarios.slug, name: scenarios.name })
    .from(scenarios)
    .where(sql`${scenarios.slug} in ('deviation', 'manibus', 'the-way-of-winter', 'endless-dream')`)
    .orderBy(scenarios.slug);
}

async function availableNumber(transaction: Transaction, scenarioId: string, prefix: string) {
  const rows = await transaction
    .select({ name: servers.name })
    .from(servers)
    .where(eq(servers.scenarioId, scenarioId));
  const occupied = new Set(rows.map((row) => row.name));
  for (let number = 0; number < 1000; number += 1) {
    const digits = String(number).padStart(4, "0");
    if (!occupied.has(`${prefix}${digits}`)) return digits;
  }
  throw new Error("No unused server number with a leading zero is available for verification.");
}

async function actorAudits(transaction: Transaction, actorId: string) {
  return transaction
    .select({ action: auditLogs.action, entityId: auditLogs.entityId })
    .from(auditLogs)
    .where(eq(auditLogs.actorId, actorId));
}

async function withRollback(
  verify: (
    transaction: Transaction,
    actor: CurrentUser,
    createdServerIds: string[],
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const database = actual.getDb();
  const originalCanonicalRows = await canonicalRows(database);
  const actor: CurrentUser = {
    id: randomUUID(),
    name: "Preset Registration Verification Admin",
    role: "ADMIN",
    isMock: false,
  };
  const createdServerIds: string[] = [];
  const rollback = new Error("Intentional verification rollback");
  try {
    await database.transaction(async (transaction) => {
      boundary.transaction = transaction;
      boundary.user = actor;
      await transaction.insert(users).values({ id: actor.id, name: actor.name, role: "ADMIN" });
      await transaction.insert(accounts).values({
        userId: actor.id,
        provider: "discord",
        providerAccountId: `preset-verification-${actor.id}`,
      });
      await verify(transaction, actor, createdServerIds);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.user = null;
  }
  // Verify rollback through another actual database transaction, without deleting any records.
  await database.transaction(async (transaction) => {
    expect(await canonicalRows(transaction)).toEqual(originalCanonicalRows);
    expect(
      await transaction.select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(await actorAudits(transaction, actor.id)).toHaveLength(0);
    for (const serverId of createdServerIds) {
      expect(
        await transaction.select({ id: servers.id }).from(servers).where(eq(servers.id, serverId)),
      ).toHaveLength(0);
    }
  });
}

describe("Preset scenario registration against local PostgreSQL", () => {
  it("registers all four exact prefixes, preserves leading zeroes and rolls back every fixture", async () => {
    await withRollback(async (transaction, actor, createdServerIds) => {
      const original = await canonicalRows(transaction);
      for (const preset of presets) {
        const previous = original.find((row) => row.slug === preset.slug);
        const digits = previous
          ? await availableNumber(transaction, previous.id, preset.prefix)
          : "0000";
        const result = await mutateSeasonAdministration({
          action: "REGISTER_SERVER",
          scenarioKey: preset.key,
          serverNumber: digits,
          region: "TEST",
        });
        createdServerIds.push(result.id);
        const [registered] = await transaction
          .select()
          .from(servers)
          .where(eq(servers.id, result.id));
        expect(registered?.name).toBe(`${preset.prefix}${digits}`);
        expect(registered?.region).toBe("TEST");
        const [scenario] = await transaction
          .select({ id: scenarios.id, slug: scenarios.slug, name: scenarios.name })
          .from(scenarios)
          .where(eq(scenarios.id, registered!.scenarioId));
        expect(scenario?.slug).toBe(preset.slug);
        expect(scenario?.name).toBe(previous?.name ?? preset.name);
        if (previous) expect(scenario?.id).toBe(previous.id);
      }
      const audits = await actorAudits(transaction, actor.id);
      expect(audits.filter((audit) => audit.action === "server.created")).toHaveLength(4);
      expect(audits.filter((audit) => audit.action === "scenario.created")).toHaveLength(
        presets.length - original.length,
      );
    });
  });

  it("reuses a historical canonical scenario and rejects duplicate registration without extra audits", async () => {
    await withRollback(async (transaction, actor, createdServerIds) => {
      const [existing] = await transaction
        .select()
        .from(scenarios)
        .where(eq(scenarios.slug, "manibus"));
      const [scenario] = existing
        ? [existing]
        : await transaction
            .insert(scenarios)
            .values({ slug: "manibus", name: "Preserved Historical Scenario Name" })
            .returning();
      const digits = await availableNumber(transaction, scenario!.id, "Manibus-X");
      const input = {
        action: "REGISTER_SERVER",
        scenarioKey: "MANIBUS",
        serverNumber: digits,
        region: "TEST",
      };
      const result = await mutateSeasonAdministration(input);
      createdServerIds.push(result.id);
      const auditsBeforeDuplicate = await actorAudits(transaction, actor.id);
      await expect(mutateSeasonAdministration(input)).rejects.toMatchObject({ code: "DUPLICATE" });
      expect(await actorAudits(transaction, actor.id)).toEqual(auditsBeforeDuplicate);
      const [preserved] = await transaction
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, scenario!.id));
      expect(preserved?.name).toBe(scenario!.name);
      const matches = await transaction
        .select({ id: servers.id })
        .from(servers)
        .where(
          sql`${servers.scenarioId} = ${scenario!.id} and ${servers.name} = ${`Manibus-X${digits}`}`,
        );
      expect(matches).toEqual([{ id: result.id }]);
      expect(auditsBeforeDuplicate).toEqual([{ action: "server.created", entityId: result.id }]);
    });
  });

  it("rejects forged names, prefixes and non-ASCII numbers without creating catalog rows or audits", async () => {
    await withRollback(async (transaction, actor) => {
      const catalogBefore = await canonicalRows(transaction);
      const serversBefore = await transaction
        .select({ id: servers.id })
        .from(servers)
        .orderBy(servers.id);
      const input = {
        action: "REGISTER_SERVER",
        scenarioKey: "DEVIATION",
        serverNumber: "0000",
        region: "TEST",
      };
      for (const patch of [
        { name: "Forged-X0000" },
        { prefix: "Forged-X" },
        { scenarioKey: "UNKNOWN" },
        { serverNumber: "00x0" },
        { serverNumber: "００００" },
        { serverNumber: "00000" },
      ]) {
        await expect(mutateSeasonAdministration({ ...input, ...patch })).rejects.toMatchObject({
          code: "INVALID_INPUT",
        });
      }
      expect(await canonicalRows(transaction)).toEqual(catalogBefore);
      expect(
        await transaction.select({ id: servers.id }).from(servers).orderBy(servers.id),
      ).toEqual(serversBefore);
      expect(await actorAudits(transaction, actor.id)).toHaveLength(0);
    });
  });
});
