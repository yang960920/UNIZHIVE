import "server-only";
import {
  and,
  auditLogs,
  builds,
  buildVersions,
  buildPublications,
  buildShareRequests,
  desc,
  eq,
  getDb,
  memberProfiles,
  sql,
  users,
} from "@uniz/db";
import { parseVersionedPlannerSnapshot } from "@uniz/build-engine";
import { z } from "zod";
import type { CurrentUser } from "../auth-policy";
import type {
  PlannerBuildDetail,
  PlannerBuildLibrary,
  PlannerBuildSummary,
  PlannerVersionSummary,
  PlannerLibraryOptions,
} from "../data/build-planner-types";
import {
  decodeBuildCursor,
  encodeBuildCursor,
  literalSearchPattern,
  normalizeBuildQuery,
  PLANNER_LIBRARY_PAGE_SIZE,
  PLANNER_VERSION_PAGE_SIZE,
} from "./build-planner-query";
import {
  assertBuildOwner,
  BuildPlannerError,
  canReadPlannerBuild,
  nextBuildTimestamp,
  parseBuildPlannerMutation,
  requireBuildActor,
} from "../build-planner-policy";
import {
  approvedBuildVersionAccessSql,
  publishedBuildAccessSql,
  readApprovedBuildMetadata,
  readOwnerBuildSharing,
  requestBuildSharing,
  withdrawBuildSharing,
} from "./build-sharing";
import { parseContentDocument, parseYouTubeUrl, type ContentDocument } from "../content-document";
import { bindContentImages } from "./content-media";
import { getBuildLikeSummaries } from "./reactions";
import { AUTHORIZATION_LOCK, readFreshActor } from "./build-actor";

export { BuildPlannerError } from "../build-planner-policy";

const summarySelection = {
  id: builds.id,
  ownerId: builds.ownerId,
  title: builds.title,
  description: builds.description,
  visibility: builds.visibility,
  archivedAt: builds.archivedAt,
  updatedAt: builds.updatedAt,
  createdAt: builds.createdAt,
  ownerName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name})`,
  ownerHandle: memberProfiles.handle,
  latestVersion: sql<number>`(select max(${buildVersions.version})::integer from ${buildVersions} where ${buildVersions.buildId} = ${builds.id})`,
};

type SummaryRow = {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  visibility: "PRIVATE" | "HIVE" | "PUBLIC";
  archivedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  ownerName: string;
  ownerHandle: string | null;
  latestVersion: number | null;
};

function summaryDto(row: SummaryRow, actor: CurrentUser | null): PlannerBuildSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    visibility: row.visibility,
    owner: {
      id: row.ownerId,
      name: row.ownerName,
      handle: actor?.role === "ADMIN" ? row.ownerHandle : null,
    },
    latestVersion: row.latestVersion!,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    isOwner: Boolean(actor && actor.id === row.ownerId),
  };
}

function storageError(error: unknown): never {
  if (error instanceof BuildPlannerError) throw error;
  // Keep database diagnostics and stored JSON outside action responses and public pages.
  throw new BuildPlannerError("UNAVAILABLE");
}

export async function getBuildLibraryData(
  actor: CurrentUser | null,
  options: PlannerLibraryOptions = {},
): Promise<PlannerBuildLibrary> {
  if (actor?.isMock || actor?.id.startsWith("demo-")) return { owned: [], hive: [], public: [] };
  try {
    return await getDb().transaction(
      async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
        const { actor: principal } = await readFreshActor(transaction, actor);
        const query = normalizeBuildQuery(options.query);
        const archived = options.archived === true;
        const pattern = literalSearchPattern(query);
        const matching = query
          ? sql`(${builds.title} ILIKE ${pattern} OR ${builds.description} ILIKE ${pattern} OR EXISTS (
              SELECT 1 FROM ${buildVersions} bv_search
              WHERE bv_search.build_id = ${builds.id}
                AND bv_search.version = (SELECT max(bv_latest.version) FROM ${buildVersions} bv_latest WHERE bv_latest.build_id = ${builds.id})
                AND bv_search.schema_version = 'uniz-gear.v2'
                AND concat_ws(' ', bv_search.loadout_snapshot #>> '{recommendation,tags}', bv_search.loadout_snapshot #>> '{recommendation,contents}', bv_search.loadout_snapshot #>> '{recommendation,notes}') ILIKE ${pattern}
            ))`
          : sql`true`;
        const readPage = async (group: "owned" | "hive" | "public", token?: string) => {
          if ((group === "owned" || group === "hive") && !principal)
            return { items: [], next: null };
          if (group !== "owned") {
            const cursor = decodeBuildCursor(token);
            const publishedSearch = query
              ? sql`(${buildShareRequests.title} ILIKE ${pattern} OR ${buildShareRequests.description} ILIKE ${pattern} OR (${buildVersions.schemaVersion} = 'uniz-gear.v2' AND concat_ws(' ', ${buildVersions.loadoutSnapshot} #>> '{recommendation,tags}', ${buildVersions.loadoutSnapshot} #>> '{recommendation,contents}', ${buildVersions.loadoutSnapshot} #>> '{recommendation,notes}') ILIKE ${pattern}))`
              : sql`true`;
            const published = await transaction
              .select({
                ...summarySelection,
                title: buildShareRequests.title,
                description: buildShareRequests.description,
                visibility: buildShareRequests.requestedVisibility,
                latestVersion: buildVersions.version,
                updatedAt: buildPublications.updatedAt,
                recommendationScore: buildShareRequests.recommendationScore,
                recommendationNote: buildShareRequests.recommendationNote,
              })
              .from(builds)
              .innerJoin(users, eq(users.id, builds.ownerId))
              .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
              .innerJoin(buildPublications, eq(buildPublications.buildId, builds.id))
              .innerJoin(buildShareRequests, eq(buildShareRequests.id, buildPublications.requestId))
              .innerJoin(buildVersions, eq(buildVersions.id, buildShareRequests.buildVersionId))
              .where(
                and(
                  publishedBuildAccessSql(principal),
                  eq(buildShareRequests.requestedVisibility, group === "hive" ? "HIVE" : "PUBLIC"),
                  publishedSearch,
                  cursor
                    ? sql`(${buildPublications.updatedAt},${builds.id}) < (${cursor.updatedAt}::timestamptz,${cursor.id})`
                    : undefined,
                ),
              )
              .orderBy(desc(buildPublications.updatedAt), desc(builds.id))
              .limit(PLANNER_LIBRARY_PAGE_SIZE + 1);
            const items = published.slice(0, PLANNER_LIBRARY_PAGE_SIZE).map((row) => ({
              ...summaryDto(row, principal),
              publishedVersion: row.latestVersion,
              recommendationScore: row.recommendationScore,
              recommendationNote: row.recommendationNote,
            }));
            return {
              items,
              next:
                published.length > PLANNER_LIBRARY_PAGE_SIZE
                  ? encodeBuildCursor(items[items.length - 1])
                  : null,
            };
          }
          const access = and(
            eq(builds.ownerId, principal!.id),
            archived ? sql`${builds.archivedAt} IS NOT NULL` : sql`${builds.archivedAt} IS NULL`,
          );
          const cursor = decodeBuildCursor(token);
          const boundary = cursor
            ? sql`(${builds.updatedAt}, ${builds.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id})`
            : sql`true`;
          const rows = await transaction
            .select(summarySelection)
            .from(builds)
            .innerJoin(users, eq(users.id, builds.ownerId))
            .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
            .where(
              and(
                access,
                matching,
                boundary,
                sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
                sql`exists (select 1 from ${buildVersions} where ${buildVersions.buildId} = ${builds.id})`,
              ),
            )
            .orderBy(desc(builds.updatedAt), desc(builds.id))
            .limit(PLANNER_LIBRARY_PAGE_SIZE + 1);
          const summaries = await Promise.all(
            rows
              .filter((row) => row.latestVersion !== null && canReadPlannerBuild(principal, row))
              .map(async (row) => ({
                ...summaryDto(row, principal),
                sharing: await readOwnerBuildSharing(transaction, row.id),
              })),
          );
          const items = summaries.slice(0, PLANNER_LIBRARY_PAGE_SIZE);
          return {
            items,
            next:
              summaries.length > PLANNER_LIBRARY_PAGE_SIZE
                ? encodeBuildCursor(items[items.length - 1])
                : null,
          };
        };
        const owned = await readPage("owned", options.ownedCursor);
        const hive = await readPage("hive", options.hiveCursor);
        const publicPage = await readPage("public", options.publicCursor);
        return {
          owned: owned.items,
          hive: hive.items,
          public: publicPage.items,
          nextCursors: { owned: owned.next, hive: hive.next, public: publicPage.next },
        };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    return storageError(error);
  }
}

export async function getBuildDetailData(
  actor: CurrentUser | null,
  id: string,
  version?: number,
  versionsBefore?: number,
): Promise<PlannerBuildDetail | null> {
  if (
    !z.uuid().safeParse(id).success ||
    (version !== undefined &&
      (!Number.isSafeInteger(version) || version < 1 || version > 2_147_483_647)) ||
    (versionsBefore !== undefined &&
      (!Number.isSafeInteger(versionsBefore) ||
        versionsBefore < 1 ||
        versionsBefore > 2_147_483_647)) ||
    actor?.isMock ||
    actor?.id.startsWith("demo-")
  )
    return null;
  try {
    return await getDb().transaction(
      async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
        const { actor: principal, profileComplete } = await readFreshActor(transaction, actor);
        const [row] = await transaction
          .select(summarySelection)
          .from(builds)
          .innerJoin(users, eq(users.id, builds.ownerId))
          .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
          .where(and(eq(builds.id, id), sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`))
          .for("share", { of: builds });
        if (!row || row.latestVersion === null) return null;
        const own = Boolean(principal && principal.id === row.ownerId);
        const publication = await readApprovedBuildMetadata(transaction, principal, id);
        if (!own && !publication) return null;
        const [selected] = await transaction
          .select({
            id: buildVersions.id,
            version: buildVersions.version,
            schemaVersion: buildVersions.schemaVersion,
            createdAt: buildVersions.createdAt,
            notes: buildVersions.notes,
            snapshot: buildVersions.loadoutSnapshot,
            title: buildVersions.title,
            description: buildVersions.description,
            bodyDocument: buildVersions.bodyDocument,
            youtubeUrl: buildVersions.youtubeUrl,
          })
          .from(buildVersions)
          .innerJoin(builds, eq(builds.id, buildVersions.buildId))
          .where(
            and(
              eq(buildVersions.buildId, id),
              own ? undefined : approvedBuildVersionAccessSql(principal, buildVersions.id),
              eq(
                buildVersions.version,
                version ?? (own ? row.latestVersion : publication!.version),
              ),
            ),
          )
          .limit(1);
        if (!selected) return null;
        const approved = await readApprovedBuildMetadata(transaction, principal, id, selected.id);
        if (!own && !approved) return null;
        const versions = await transaction
          .select({
            id: buildVersions.id,
            version: buildVersions.version,
            createdAt: buildVersions.createdAt,
            notes: buildVersions.notes,
          })
          .from(buildVersions)
          .innerJoin(builds, eq(builds.id, buildVersions.buildId))
          .where(
            and(
              eq(buildVersions.buildId, id),
              own ? undefined : approvedBuildVersionAccessSql(principal, buildVersions.id),
              versionsBefore ? sql`${buildVersions.version} < ${versionsBefore}` : sql`true`,
            ),
          )
          .orderBy(desc(buildVersions.version))
          .limit(PLANNER_VERSION_PAGE_SIZE + 1);
        const versionDto = (entry: {
          id: string;
          version: number;
          createdAt: Date;
          notes: string | null;
        }): PlannerVersionSummary => ({
          id: entry.id,
          version: entry.version,
          createdAt: entry.createdAt.toISOString(),
          notes: entry.notes ?? "",
        });
        const loadout = parseVersionedPlannerSnapshot(selected.schemaVersion, selected.snapshot);
        const summary = summaryDto(
          own
            ? row
            : {
                ...row,
                title: approved!.title,
                description: approved!.description,
                visibility: approved!.visibility,
                latestVersion: publication!.version,
                updatedAt: new Date(publication!.reviewedAt ?? publication!.updatedAt),
              },
          principal,
        );
        if (own) {
          summary.title = selected.title ?? row.title;
          summary.description = selected.description ?? row.description ?? "";
          summary.sharing = await readOwnerBuildSharing(transaction, id);
        }
        const likes = publication
          ? (await getBuildLikeSummaries(transaction, [id], principal?.id ?? null)).get(id)
          : undefined;
        return {
          ...summary,
          recommendationScore: approved?.recommendationScore ?? null,
          recommendationNote: approved?.recommendationNote ?? "",
          likeCount: likes?.likeCount ?? 0,
          likedByMe: likes?.likedByMe ?? false,
          canLike: Boolean(publication && principal),
          versions: versions.slice(0, PLANNER_VERSION_PAGE_SIZE).map(versionDto),
          versionsNext:
            versions.length > PLANNER_VERSION_PAGE_SIZE
              ? versions[PLANNER_VERSION_PAGE_SIZE - 1].version
              : null,
          selectedVersion: {
            ...versionDto(selected),
            schemaVersion: selected.schemaVersion,
            loadout,
            bodyDocument: parseContentDocument(selected.bodyDocument),
            youtubeUrl: parseYouTubeUrl(selected.youtubeUrl),
            approvedVisibility: approved?.visibility ?? null,
          },
          mayEdit: summary.isOwner && !summary.archivedAt && profileComplete,
        };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    return storageError(error);
  }
}

export async function persistBuildMutation(
  actor: CurrentUser | null,
  value: unknown,
): Promise<{ id: string; version?: number; reviewRequested?: boolean }> {
  requireBuildActor(actor);
  const input = parseBuildPlannerMutation(value);
  try {
    return await getDb().transaction(async (transaction) => {
      // Shared authorization gate allows unrelated builds to save together while
      // exclusive role/membership changes still wait for authorized writes to finish.
      await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
      const { actor: principal } = await readFreshActor(transaction, actor, true);
      if (!principal) throw new BuildPlannerError("FORBIDDEN");
      const [existing] = input.buildId
        ? await transaction.select().from(builds).where(eq(builds.id, input.buildId)).for("update")
        : [];
      if (input.buildId && !existing) throw new BuildPlannerError("NOT_FOUND");
      if (existing)
        assertBuildOwner(principal, existing, input.expectedUpdatedAt!, input.action === "RESTORE");
      if (input.action === "RESTORE" && !existing?.archivedAt)
        throw new BuildPlannerError("NOT_ARCHIVED");
      const now = nextBuildTimestamp(existing?.updatedAt ?? null);
      if (input.action === "SAVE_BUILD") {
        const [latest] = existing
          ? await transaction
              .select({ version: sql<number>`coalesce(max(${buildVersions.version}), 0)::integer` })
              .from(buildVersions)
              .where(eq(buildVersions.buildId, existing.id))
          : [];
        const version = (latest?.version ?? 0) + 1;
        if (version > 2_147_483_647) throw new BuildPlannerError("VERSION_LIMIT");
        const metadata = {
          title: input.title,
          description: input.description,
          visibility: input.visibility,
          updatedAt: now,
        };
        const [saved] = existing
          ? await transaction
              .update(builds)
              .set(metadata)
              .where(eq(builds.id, existing.id))
              .returning({ id: builds.id })
          : await transaction
              .insert(builds)
              .values({ ...metadata, ownerId: principal.id })
              .returning({ id: builds.id });
        if (!saved) throw new BuildPlannerError("NOT_FOUND");
        const bodyDocument = input.bodyDocument as ContentDocument | null;
        const [savedVersion] = await transaction
          .insert(buildVersions)
          .values({
            buildId: saved.id,
            version,
            schemaVersion: input.loadout.schemaVersion,
            loadoutSnapshot: input.loadout,
            notes: input.notes,
            title: input.title,
            description: input.description,
            bodyDocument,
            youtubeUrl: input.youtubeUrl ?? null,
          })
          .returning({ id: buildVersions.id });
        if (bodyDocument)
          await bindContentImages(
            transaction,
            principal.id,
            { buildVersionId: savedVersion.id },
            bodyDocument,
          );
        if (input.visibility !== "PRIVATE")
          await requestBuildSharing(
            transaction,
            principal.id,
            {
              buildId: saved.id,
              versionId: savedVersion.id,
              title: input.title,
              description: input.description,
              visibility: input.visibility,
            },
            now,
          );
        await transaction.insert(auditLogs).values({
          actorId: principal.id,
          action: existing ? "build.version.saved" : "build.created",
          entityType: "build",
          entityId: saved.id,
          metadata: {
            version,
            visibility: input.visibility,
            schemaVersion: input.loadout.schemaVersion,
          },
        });
        return { id: saved.id, version, reviewRequested: input.visibility !== "PRIVATE" };
      }
      if (!existing) throw new BuildPlannerError("NOT_FOUND");
      await transaction
        .update(builds)
        .set(
          input.action === "ARCHIVE"
            ? { archivedAt: now, updatedAt: now }
            : input.action === "RESTORE"
              ? { archivedAt: null, visibility: "PRIVATE", updatedAt: now }
              : { visibility: input.visibility, updatedAt: now },
        )
        .where(eq(builds.id, existing.id));
      if (
        input.action === "ARCHIVE" ||
        (input.action === "SET_VISIBILITY" && input.visibility === "PRIVATE")
      ) {
        await withdrawBuildSharing(transaction, principal.id, existing.id, now);
      } else if (input.action === "SET_VISIBILITY" && input.visibility !== "PRIVATE") {
        const [latest] = await transaction
          .select({
            id: buildVersions.id,
            title: buildVersions.title,
            description: buildVersions.description,
          })
          .from(buildVersions)
          .where(eq(buildVersions.buildId, existing.id))
          .orderBy(desc(buildVersions.version))
          .limit(1);
        if (!latest) throw new BuildPlannerError("NOT_FOUND");
        await requestBuildSharing(
          transaction,
          principal.id,
          {
            buildId: existing.id,
            versionId: latest.id,
            title: latest.title ?? existing.title,
            description: latest.description ?? existing.description ?? "",
            visibility: input.visibility,
          },
          now,
        );
      }
      await transaction.insert(auditLogs).values({
        actorId: principal.id,
        action:
          input.action === "ARCHIVE"
            ? "build.archived"
            : input.action === "RESTORE"
              ? "build.restored"
              : "build.visibility.changed",
        entityType: "build",
        entityId: existing.id,
        metadata:
          input.action === "ARCHIVE"
            ? { archived: true }
            : input.action === "RESTORE"
              ? { archived: false }
              : { previousVisibility: existing.visibility, visibility: input.visibility },
      });
      return {
        id: existing.id,
        reviewRequested: input.action === "SET_VISIBILITY" && input.visibility !== "PRIVATE",
      };
    });
  } catch (error) {
    return storageError(error);
  }
}
