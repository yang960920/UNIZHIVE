import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createEmptyGearLoadout,
  createEmptyPlannerLoadout,
  GEAR_SCHEMA_VERSION,
  PLANNER_SCHEMA_VERSION,
} from "@uniz/build-engine";
import type { CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
const database = vi.hoisted(() => ({
  active: null as ReturnType<typeof getDb> | null,
  original: null as typeof getDb | null,
}));
vi.mock("@uniz/db", async () => {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  database.original = actual.getDb;
  return { ...actual, getDb: () => database.active ?? actual.getDb() };
});
import {
  accounts,
  auditLogs,
  buildLoadoutEntries,
  buildLoadouts,
  builds,
  buildVersions,
  eq,
  getDb,
  memberProfiles,
  sql,
  users,
} from "@uniz/db";
import {
  getBuildLoadout,
  listBuildLoadouts,
  listLoadoutBuildChoices,
  persistBuildLoadout,
} from "../src/lib/server/build-loadouts";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Loadout verification requires the local uniz_hive database.");
class FixtureRollback extends Error {}
interface Fixture {
  owner: CurrentUser;
  other: CurrentUser;
  admin: CurrentUser;
  versions: string[];
  buildId: string;
  foreignVersion: string;
}
async function fixture(check: (value: Fixture) => Promise<void>) {
  const original = database.original!();
  const actors = ["MEMBER", "MEMBER", "ADMIN"].map(
    (role, index) =>
      ({ id: randomUUID(), name: `Loadout fixture ${index}`, role, isMock: false }) as CurrentUser,
  );
  try {
    await original.transaction(async (tx) => {
      database.active = tx as unknown as ReturnType<typeof getDb>;
      await tx.insert(users).values(actors.map(({ id, name, role }) => ({ id, name, role })));
      for (const actor of actors) {
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `loadout-${actor.id}`,
        });
        await tx.insert(memberProfiles).values({
          userId: actor.id,
          displayName: actor.name,
          handle: `l-${actor.id.slice(0, 20)}`,
          onceHumanUid: "loadout-test-uid",
          onceHumanNickname: "로드아웃 검증",
        });
      }
      const [build] = await tx
        .insert(builds)
        .values({ ownerId: actors[0].id, title: "내 빌드" })
        .returning({ id: builds.id });
      const versions = await tx
        .insert(buildVersions)
        .values(
          Array.from({ length: 12 }, (_, index) => ({
            buildId: build.id,
            version: index + 1,
            schemaVersion: GEAR_SCHEMA_VERSION,
            loadoutSnapshot: createEmptyGearLoadout() as unknown as Record<string, unknown>,
            title: `내 빌드 ${index + 1}`,
          })),
        )
        .returning({ id: buildVersions.id });
      const [foreign] = await tx
        .insert(builds)
        .values({ ownerId: actors[1].id, title: "타인 빌드" })
        .returning({ id: builds.id });
      const [foreignVersion] = await tx
        .insert(buildVersions)
        .values({
          buildId: foreign.id,
          version: 1,
          schemaVersion: GEAR_SCHEMA_VERSION,
          loadoutSnapshot: createEmptyGearLoadout() as unknown as Record<string, unknown>,
        })
        .returning({ id: buildVersions.id });
      await check({
        owner: actors[0],
        other: actors[1],
        admin: actors[2],
        versions: versions.map((row) => row.id),
        buildId: build.id,
        foreignVersion: foreignVersion.id,
      });
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    database.active = null;
  }
  for (const actor of actors) {
    expect(
      await original.select().from(buildLoadouts).where(eq(buildLoadouts.ownerId, actor.id)),
    ).toHaveLength(0);
    expect(await original.select().from(users).where(eq(users.id, actor.id))).toHaveLength(0);
    expect(
      await original.select().from(auditLogs).where(eq(auditLogs.actorId, actor.id)),
    ).toHaveLength(0);
  }
}
const save = (versions: string[], extra: Record<string, unknown> = {}) => ({
  action: "SAVE_LOADOUT",
  title: "보스와 파밍",
  notes: "번갈아 사용",
  buildVersionIds: versions,
  ...extra,
});
describe("private loadout repository with PostgreSQL", () => {
  it("pins versions in author order without exposing the group to other members or admins", async () =>
    fixture(async ({ owner, other, admin, versions, buildId }) => {
      const result = await persistBuildLoadout(owner, save([versions[1], versions[0]]));
      const detail = await getBuildLoadout(owner, result.id);
      expect(detail?.entries.map((entry) => entry.buildVersionId)).toEqual([
        versions[1],
        versions[0],
      ]);
      await getDb()
        .insert(buildVersions)
        .values({
          buildId,
          version: 13,
          schemaVersion: GEAR_SCHEMA_VERSION,
          loadoutSnapshot: createEmptyGearLoadout() as unknown as Record<string, unknown>,
        });
      expect(
        (await getBuildLoadout(owner, result.id))?.entries.map((entry) => entry.version),
      ).toEqual([2, 1]);
      expect(await getBuildLoadout(other, result.id)).toBeNull();
      expect(await getBuildLoadout(admin, result.id)).toBeNull();
      expect((await listBuildLoadouts(other)).items).toHaveLength(0);
    }));
  it("reorders, removes and adds entries atomically and rejects stale updates", async () =>
    fixture(async ({ owner, versions }) => {
      const result = await persistBuildLoadout(owner, save(versions.slice(0, 3)));
      const initial = (await getBuildLoadout(owner, result.id))!;
      await persistBuildLoadout(
        owner,
        save([versions[2], versions[3]], {
          loadoutId: result.id,
          expectedUpdatedAt: initial.updatedAt,
        }),
      );
      const next = (await getBuildLoadout(owner, result.id))!;
      expect(next.entries.map((entry) => entry.buildVersionId)).toEqual([versions[2], versions[3]]);
      expect(Date.parse(next.updatedAt)).toBeGreaterThan(Date.parse(initial.updatedAt));
      await expect(
        persistBuildLoadout(
          owner,
          save(versions.slice(0, 2), {
            loadoutId: result.id,
            expectedUpdatedAt: initial.updatedAt,
          }),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await getBuildLoadout(owner, result.id))?.entries).toEqual(next.entries);
    }));
  it("archives and restores without deleting the pinned composition", async () =>
    fixture(async ({ owner, versions }) => {
      const { id } = await persistBuildLoadout(owner, save(versions.slice(0, 2)));
      const initial = (await getBuildLoadout(owner, id))!;
      await persistBuildLoadout(owner, {
        action: "ARCHIVE_LOADOUT",
        loadoutId: id,
        expectedUpdatedAt: initial.updatedAt,
      });
      const archived = (await getBuildLoadout(owner, id))!;
      expect(archived.mayEdit).toBe(false);
      expect(archived.entries).toEqual(initial.entries);
      expect((await listBuildLoadouts(owner)).items).toHaveLength(0);
      expect((await listBuildLoadouts(owner, { archived: true })).items).toHaveLength(1);
      await expect(
        persistBuildLoadout(
          owner,
          save(versions.slice(0, 2), { loadoutId: id, expectedUpdatedAt: archived.updatedAt }),
        ),
      ).rejects.toMatchObject({ code: "ARCHIVED" });
      await persistBuildLoadout(owner, {
        action: "RESTORE_LOADOUT",
        loadoutId: id,
        expectedUpdatedAt: archived.updatedAt,
      });
      expect((await getBuildLoadout(owner, id))?.mayEdit).toBe(true);
    }));
  it("rejects foreign versions and duplicate identities before modifying a composition", async () =>
    fixture(async ({ owner, versions, foreignVersion }) => {
      await expect(
        persistBuildLoadout(owner, save([versions[0], foreignVersion])),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        persistBuildLoadout(owner, save([versions[0], versions[0]])),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect((await listBuildLoadouts(owner)).items).toHaveLength(0);
    }));
  it("enforces matching build and loadout ownership inside the database", async () =>
    fixture(async ({ owner, other, versions, buildId }) => {
      const { id } = await persistBuildLoadout(owner, save(versions.slice(0, 2)));
      await expect(
        getDb().transaction(async (tx) => {
          await tx.insert(buildLoadoutEntries).values({
            loadoutId: id,
            ownerId: other.id,
            buildId,
            buildVersionId: versions[3],
            position: 3,
          });
        }),
      ).rejects.toThrow();
      expect((await getBuildLoadout(owner, id))?.entries).toHaveLength(2);
    }));
  it("rechecks role, linked Discord account and completed profile from the database", async () =>
    fixture(async ({ owner, versions }) => {
      await getDb().update(users).set({ role: "APPLICANT" }).where(eq(users.id, owner.id));
      await expect(persistBuildLoadout(owner, save(versions.slice(0, 2)))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await getDb().update(users).set({ role: "MEMBER" }).where(eq(users.id, owner.id));
      await getDb()
        .update(memberProfiles)
        .set({ onceHumanUid: "" })
        .where(eq(memberProfiles.userId, owner.id));
      await expect(persistBuildLoadout(owner, save(versions.slice(0, 2)))).rejects.toMatchObject({
        code: "PROFILE_REQUIRED",
      });
      await getDb()
        .update(memberProfiles)
        .set({ onceHumanUid: "ready" })
        .where(eq(memberProfiles.userId, owner.id));
      await getDb().delete(accounts).where(eq(accounts.userId, owner.id));
      await expect(persistBuildLoadout(owner, save(versions.slice(0, 2)))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }));
  it("paginates beyond nine versions and keeps literal search characters literal", async () =>
    fixture(async ({ owner, versions }) => {
      const first = await listLoadoutBuildChoices(owner);
      const second = await listLoadoutBuildChoices(owner, { cursor: first.nextCursor! });
      expect(first.items).toHaveLength(9);
      expect(second.items).toHaveLength(3);
      expect(
        new Set([...first.items, ...second.items].map((entry) => entry.buildVersionId)).size,
      ).toBe(12);
      for (let index = 0; index < 11; index++)
        await persistBuildLoadout(
          owner,
          save(versions.slice(0, 2), { title: index === 0 ? "정확_%_이름" : `로드아웃 ${index}` }),
        );
      const groups = await listBuildLoadouts(owner);
      const tail = await listBuildLoadouts(owner, { cursor: groups.nextCursor! });
      expect(groups.items).toHaveLength(9);
      expect(tail.items).toHaveLength(2);
      expect(
        (await listBuildLoadouts(owner, { query: "_%_" })).items.map((row) => row.title),
      ).toEqual(["정확_%_이름"]);
      expect((await listLoadoutBuildChoices(owner, { query: "%" })).items).toHaveLength(0);
    }));
  it("rejects mock actors and checks RLS on both new tables", async () =>
    fixture(async ({ versions }) => {
      await expect(
        persistBuildLoadout(
          { id: "demo-member", role: "MEMBER", name: "mock", isMock: true },
          save(versions.slice(0, 2)),
        ),
      ).rejects.toMatchObject({ code: "MOCK_ACTOR" });
      const rows = await getDb().execute(
        sql`select relname, relrowsecurity from pg_class where relname in ('build_loadouts', 'build_loadout_entries')`,
      );
      expect(Array.from(rows).every((row) => row.relrowsecurity === true)).toBe(true);
    }));
  it("preserves archived source builds already in a group and refuses new archived versions", async () =>
    fixture(async ({ owner, versions, buildId }) => {
      const { id } = await persistBuildLoadout(owner, save(versions.slice(0, 2)));
      const initial = (await getBuildLoadout(owner, id))!;
      await getDb().update(builds).set({ archivedAt: new Date() }).where(eq(builds.id, buildId));
      expect((await getBuildLoadout(owner, id))?.entries.every((entry) => entry.archived)).toBe(
        true,
      );
      expect((await listLoadoutBuildChoices(owner)).items).toHaveLength(0);
      await persistBuildLoadout(
        owner,
        save([versions[1], versions[0]], { loadoutId: id, expectedUpdatedAt: initial.updatedAt }),
      );
      const next = (await getBuildLoadout(owner, id))!;
      await expect(
        persistBuildLoadout(
          owner,
          save([versions[1], versions[2]], { loadoutId: id, expectedUpdatedAt: next.updatedAt }),
        ),
      ).rejects.toMatchObject({ code: "ARCHIVED" });
      expect(
        (await getBuildLoadout(owner, id))?.entries.map((entry) => entry.buildVersionId),
      ).toEqual([versions[1], versions[0]]);
    }));
  it("keeps historical recording builds visible while clearly marking preparation as incomplete", async () =>
    fixture(async ({ owner, versions, buildId }) => {
      const [legacy] = await getDb()
        .insert(buildVersions)
        .values({
          buildId,
          version: 13,
          schemaVersion: PLANNER_SCHEMA_VERSION,
          loadoutSnapshot: createEmptyPlannerLoadout() as unknown as Record<string, unknown>,
          title: "이전 방식 기록",
        })
        .returning({ id: buildVersions.id });
      const { id } = await persistBuildLoadout(owner, save([versions[0], legacy.id]));
      const detail = (await getBuildLoadout(owner, id))!;
      expect(detail.entries[1].title).toBe("이전 방식 기록");
      expect(detail.preparation.complete).toBe(false);
      expect(
        detail.preparation.unresolved.some((issue) => issue.buildTitle === "이전 방식 기록"),
      ).toBe(true);
    }));
});
