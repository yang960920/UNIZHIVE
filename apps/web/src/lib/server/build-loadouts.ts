import "server-only";
import {
  and,
  auditLogs,
  buildLoadoutEntries,
  buildLoadouts,
  builds,
  buildVersions,
  desc,
  eq,
  getDb,
  inArray,
  sql,
} from "@uniz/db";
import {
  GEAR_SCHEMA_VERSION,
  makeLoadoutPreparationText,
  parseVersionedPlannerSnapshot,
  prepareBuildLoadout,
} from "@uniz/build-engine";
import { z } from "zod";
import type { CurrentUser } from "../auth-policy";
import {
  assertBuildOwner,
  BuildPlannerError,
  nextBuildTimestamp,
  requireBuildActor,
} from "../build-planner-policy";
import { parseBuildLoadoutMutation } from "../build-loadout-policy";
import type {
  BuildLoadoutDetail,
  BuildLoadoutSummary,
  LoadoutBuildChoice,
  LoadoutChoicePage,
} from "../data/build-loadout-types";
import { AUTHORIZATION_LOCK, readFreshActor } from "./build-actor";
import {
  decodeBuildCursor,
  encodeBuildCursor,
  literalSearchPattern,
  normalizeBuildQuery,
} from "./build-planner-query";

export const LOADOUT_PAGE_SIZE = 9;
function storageError(error: unknown): never {
  if (error instanceof BuildPlannerError) throw error;
  const code =
    typeof error === "object" && error
      ? ((error as { code?: string; cause?: { code?: string } }).code ??
        (error as { cause?: { code?: string } }).cause?.code)
      : undefined;
  throw new BuildPlannerError(code === "40001" || code === "40P01" ? "CONFLICT" : "UNAVAILABLE");
}
const summaryColumns = {
  id: buildLoadouts.id,
  title: buildLoadouts.title,
  notes: buildLoadouts.notes,
  updatedAt: buildLoadouts.updatedAt,
  archivedAt: buildLoadouts.archivedAt,
  entryCount: sql<number>`(select count(*)::integer from ${buildLoadoutEntries} where ${buildLoadoutEntries.loadoutId} = ${buildLoadouts.id})`,
};
function summaryDto(row: {
  id: string;
  title: string;
  notes: string;
  updatedAt: Date;
  archivedAt: Date | null;
  entryCount: number;
}): BuildLoadoutSummary {
  return {
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export async function listBuildLoadouts(
  actor: CurrentUser | null,
  options: { query?: string; cursor?: string; archived?: boolean } = {},
): Promise<{ items: BuildLoadoutSummary[]; nextCursor: string | null }> {
  try {
    return await getDb().transaction(
      async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
        const { actor: principal } = await readFreshActor(tx, actor);
        if (!principal) return { items: [], nextCursor: null };
        const query = normalizeBuildQuery(options.query);
        const cursor = decodeBuildCursor(options.cursor);
        const rows = await tx
          .select(summaryColumns)
          .from(buildLoadouts)
          .where(
            and(
              eq(buildLoadouts.ownerId, principal.id),
              options.archived
                ? sql`${buildLoadouts.archivedAt} is not null`
                : sql`${buildLoadouts.archivedAt} is null`,
              query ? sql`${buildLoadouts.title} ilike ${literalSearchPattern(query)}` : undefined,
              cursor
                ? sql`(${buildLoadouts.updatedAt}, ${buildLoadouts.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id})`
                : undefined,
            ),
          )
          .orderBy(desc(buildLoadouts.updatedAt), desc(buildLoadouts.id))
          .limit(LOADOUT_PAGE_SIZE + 1);
        const items = rows.slice(0, LOADOUT_PAGE_SIZE).map(summaryDto);
        return {
          items,
          nextCursor: rows.length > LOADOUT_PAGE_SIZE ? encodeBuildCursor(items.at(-1)!) : null,
        };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    return storageError(error);
  }
}

/** Every saved version remains reachable; search pages do not cap the user's build library. */
export async function listLoadoutBuildChoices(
  actor: CurrentUser | null,
  options: { query?: string; cursor?: string } = {},
): Promise<LoadoutChoicePage> {
  try {
    return await getDb().transaction(
      async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
        const { actor: principal } = await readFreshActor(tx, actor);
        if (!principal) return { items: [], nextCursor: null };
        const cursor = decodeBuildCursor(options.cursor);
        const query = normalizeBuildQuery(options.query);
        const date = sql<Date>`date_trunc('milliseconds', ${buildVersions.createdAt})`.mapWith(
          buildVersions.createdAt,
        );
        const title = sql<string>`coalesce(${buildVersions.title}, ${builds.title})`;
        const rows = await tx
          .select({
            buildId: builds.id,
            buildVersionId: buildVersions.id,
            version: buildVersions.version,
            title,
            createdAt: date,
          })
          .from(buildVersions)
          .innerJoin(builds, eq(builds.id, buildVersions.buildId))
          .where(
            and(
              eq(builds.ownerId, principal.id),
              sql`${builds.archivedAt} is null`,
              query ? sql`${title} ilike ${literalSearchPattern(query)}` : undefined,
              cursor
                ? sql`(${date}, ${buildVersions.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id})`
                : undefined,
            ),
          )
          .orderBy(sql`${date} desc`, desc(buildVersions.id))
          .limit(LOADOUT_PAGE_SIZE + 1);
        const page = rows.slice(0, LOADOUT_PAGE_SIZE);
        return {
          items: page.map(({ buildId, buildVersionId, version, title }) => ({
            buildId,
            buildVersionId,
            version,
            title,
            archived: false,
          })),
          nextCursor:
            rows.length > LOADOUT_PAGE_SIZE
              ? encodeBuildCursor({
                  id: page.at(-1)!.buildVersionId,
                  updatedAt: page.at(-1)!.createdAt.toISOString(),
                })
              : null,
        };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    return storageError(error);
  }
}

export async function getBuildLoadout(
  actor: CurrentUser | null,
  id: string,
): Promise<BuildLoadoutDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  try {
    return await getDb().transaction(
      async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
        const { actor: principal, profileComplete } = await readFreshActor(tx, actor);
        if (!principal) return null;
        const [group] = await tx
          .select(summaryColumns)
          .from(buildLoadouts)
          .where(and(eq(buildLoadouts.id, id), eq(buildLoadouts.ownerId, principal.id)))
          .for("share");
        if (!group) return null;
        const rows = await tx
          .select({
            buildId: builds.id,
            buildVersionId: buildVersions.id,
            version: buildVersions.version,
            title: sql<string>`coalesce(${buildVersions.title}, ${builds.title})`,
            archivedAt: builds.archivedAt,
            schemaVersion: buildVersions.schemaVersion,
            snapshot: buildVersions.loadoutSnapshot,
          })
          .from(buildLoadoutEntries)
          .innerJoin(buildVersions, eq(buildVersions.id, buildLoadoutEntries.buildVersionId))
          .innerJoin(builds, eq(builds.id, buildLoadoutEntries.buildId))
          .where(and(eq(buildLoadoutEntries.loadoutId, id), eq(builds.ownerId, principal.id)))
          .orderBy(buildLoadoutEntries.position);
        const entries: LoadoutBuildChoice[] = rows.map(
          ({ buildId, buildVersionId, version, title, archivedAt }) => ({
            buildId,
            buildVersionId,
            version,
            title,
            archived: Boolean(archivedAt),
          }),
        );
        const preparation = prepareBuildLoadout(
          rows.map((row) => {
            const snapshot = parseVersionedPlannerSnapshot(row.schemaVersion, row.snapshot);
            return {
              buildId: row.buildId,
              version: row.version,
              title: row.title,
              loadout: snapshot?.schemaVersion === GEAR_SCHEMA_VERSION ? snapshot : null,
            };
          }),
        );
        return {
          ...summaryDto(group),
          entries,
          preparation,
          preparationText: makeLoadoutPreparationText(preparation),
          mayEdit: profileComplete && !group.archivedAt,
          mayRestore: profileComplete && Boolean(group.archivedAt),
        };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    return storageError(error);
  }
}

export async function persistBuildLoadout(
  actor: CurrentUser | null,
  value: unknown,
): Promise<{ id: string }> {
  requireBuildActor(actor);
  const input = parseBuildLoadoutMutation(value);
  try {
    return await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
      const { actor: principal } = await readFreshActor(tx, actor, true);
      if (!principal) throw new BuildPlannerError("FORBIDDEN");
      const [existing] = input.loadoutId
        ? await tx
            .select()
            .from(buildLoadouts)
            .where(
              and(eq(buildLoadouts.id, input.loadoutId), eq(buildLoadouts.ownerId, principal.id)),
            )
            .for("update")
        : [];
      if (input.loadoutId && !existing) throw new BuildPlannerError("NOT_FOUND");
      if (existing)
        assertBuildOwner(
          principal,
          existing,
          input.expectedUpdatedAt!,
          input.action === "RESTORE_LOADOUT",
        );
      if (input.action === "RESTORE_LOADOUT" && !existing?.archivedAt)
        throw new BuildPlannerError("NOT_ARCHIVED");
      const now = nextBuildTimestamp(existing?.updatedAt ?? null);
      let groupId: string;
      if (input.action === "SAVE_LOADOUT") {
        const selected = await tx
          .select({
            buildId: builds.id,
            buildVersionId: buildVersions.id,
            ownerId: builds.ownerId,
            archivedAt: builds.archivedAt,
          })
          .from(buildVersions)
          .innerJoin(builds, eq(builds.id, buildVersions.buildId))
          .where(
            and(inArray(buildVersions.id, input.buildVersionIds), eq(builds.ownerId, principal.id)),
          )
          .orderBy(builds.id, buildVersions.id)
          .for("share", { of: builds });
        if (selected.length !== input.buildVersionIds.length)
          throw new BuildPlannerError("FORBIDDEN");
        const previous = existing
          ? await tx
              .select({ buildVersionId: buildLoadoutEntries.buildVersionId })
              .from(buildLoadoutEntries)
              .where(eq(buildLoadoutEntries.loadoutId, existing.id))
          : [];
        const previousIds = new Set(previous.map((row) => row.buildVersionId));
        if (selected.some((row) => row.archivedAt && !previousIds.has(row.buildVersionId)))
          throw new BuildPlannerError("ARCHIVED");
        const [saved] = existing
          ? await tx
              .update(buildLoadouts)
              .set({ title: input.title, notes: input.notes, updatedAt: now })
              .where(eq(buildLoadouts.id, existing.id))
              .returning({ id: buildLoadouts.id })
          : await tx
              .insert(buildLoadouts)
              .values({
                ownerId: principal.id,
                title: input.title,
                notes: input.notes,
                createdAt: now,
                updatedAt: now,
              })
              .returning({ id: buildLoadouts.id });
        groupId = saved.id;
        if (existing)
          await tx.delete(buildLoadoutEntries).where(eq(buildLoadoutEntries.loadoutId, groupId));
        const byVersion = new Map(selected.map((row) => [row.buildVersionId, row]));
        await tx.insert(buildLoadoutEntries).values(
          input.buildVersionIds.map((versionId, position) => ({
            loadoutId: groupId,
            ownerId: principal.id,
            buildId: byVersion.get(versionId)!.buildId,
            buildVersionId: versionId,
            position,
            createdAt: now,
            updatedAt: now,
          })),
        );
      } else {
        groupId = existing!.id;
        await tx
          .update(buildLoadouts)
          .set({ archivedAt: input.action === "ARCHIVE_LOADOUT" ? now : null, updatedAt: now })
          .where(eq(buildLoadouts.id, groupId));
      }
      await tx.insert(auditLogs).values({
        actorId: principal.id,
        action: input.action,
        entityType: "build_loadout",
        entityId: groupId,
        metadata: {
          entryCount: input.action === "SAVE_LOADOUT" ? input.buildVersionIds.length : undefined,
        },
      });
      return { id: groupId };
    });
  } catch (error) {
    return storageError(error);
  }
}
