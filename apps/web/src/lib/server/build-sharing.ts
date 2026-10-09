import "server-only";
import {
  accounts,
  and,
  auditLogs,
  builds,
  buildPublications,
  buildShareRequests,
  buildVersions,
  desc,
  eq,
  getDb,
  sql,
  users,
} from "@uniz/db";
import { z } from "zod";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import { isApprovedBuildActor, nextBuildTimestamp } from "../build-planner-policy";
import { parseVersionedPlannerSnapshot } from "@uniz/build-engine";
import { parseContentDocument, parseYouTubeUrl } from "../content-document";

export type BuildShareStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REVOKED";
export interface BuildShareSummary {
  id: string;
  versionId: string;
  version: number;
  title: string;
  description: string;
  visibility: "HIVE" | "PUBLIC";
  status: BuildShareStatus;
  reviewNote: string;
  recommendationScore: number | null;
  recommendationNote: string;
  updatedAt: string;
  reviewedAt: string | null;
}
export interface BuildSharingState {
  published: BuildShareSummary | null;
  latestRequest: BuildShareSummary | null;
}
export type BuildTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
type SqlValue =
  ReturnType<typeof sql> | typeof buildVersions.id | typeof buildShareRequests.buildVersionId;
const AUTHORIZATION_LOCK = 912743110;
export class BuildSharingError extends Error {}

/** Caller must pass a server-verified fresh principal. Correlated SQL needs only builds in FROM. */
export function publishedBuildAccessSql(actor: CurrentUser | null) {
  const scope = isApprovedBuildActor(actor)
    ? sql`active_request.requested_visibility in ('HIVE','PUBLIC')`
    : sql`active_request.requested_visibility = 'PUBLIC'`;
  return sql`${builds.archivedAt} is null and exists (
    select 1 from build_publications active_publication
    join build_share_requests active_request on active_request.id = active_publication.request_id and active_request.build_id = active_publication.build_id
    join build_versions active_version on active_version.id = active_request.build_version_id and active_version.build_id = active_request.build_id
    join users active_owner on active_owner.id = ${builds.ownerId} and active_owner.role in ('MEMBER','OFFICER','ADMIN')
    where active_publication.build_id = ${builds.id} and active_request.status = 'APPROVED' and ${scope}
      and exists (select 1 from accounts owner_account where owner_account.user_id = active_owner.id and owner_account.provider = 'discord')
  )`;
}

/** Old approved links stay readable only while sharing is active and both audience scopes allow it. */
export function approvedBuildVersionAccessSql(actor: CurrentUser | null, versionId: SqlValue) {
  const scope = isApprovedBuildActor(actor)
    ? sql`approved_request.requested_visibility in ('HIVE','PUBLIC')`
    : sql`approved_request.requested_visibility = 'PUBLIC'`;
  return sql`${publishedBuildAccessSql(actor)} and exists (
    select 1 from build_share_requests approved_request
    join build_versions approved_version on approved_version.id = approved_request.build_version_id and approved_version.build_id = approved_request.build_id
    where approved_request.build_id = ${builds.id} and approved_request.build_version_id = ${versionId}
      and approved_request.status = 'APPROVED' and ${scope}
  )`;
}

/** ADMIN review access is confined to versions explicitly submitted, including review history. */
export function submittedBuildVersionAccessSql(actor: CurrentUser | null, versionId: SqlValue) {
  if (!isApprovedBuildActor(actor) || actor.role !== "ADMIN") return sql`false`;
  return sql`exists (select 1 from build_share_requests submitted_request where submitted_request.build_id = ${builds.id} and submitted_request.build_version_id = ${versionId})`;
}

const shareFields = {
  id: buildShareRequests.id,
  versionId: buildShareRequests.buildVersionId,
  version: buildVersions.version,
  title: buildShareRequests.title,
  description: buildShareRequests.description,
  visibility: buildShareRequests.requestedVisibility,
  status: buildShareRequests.status,
  reviewNote: buildShareRequests.reviewNote,
  recommendationScore: buildShareRequests.recommendationScore,
  recommendationNote: buildShareRequests.recommendationNote,
  updatedAt: buildShareRequests.updatedAt,
  reviewedAt: buildShareRequests.reviewedAt,
};
function shareDto(
  row: Omit<BuildShareSummary, "updatedAt" | "reviewedAt" | "visibility"> & {
    visibility: string;
    updatedAt: Date;
    reviewedAt: Date | null;
  },
): BuildShareSummary {
  return {
    id: row.id,
    versionId: row.versionId,
    version: row.version,
    title: row.title,
    description: row.description,
    visibility: row.visibility as "HIVE" | "PUBLIC",
    status: row.status,
    reviewNote: row.reviewNote,
    recommendationScore: row.recommendationScore,
    recommendationNote: row.recommendationNote,
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export async function readApprovedBuildMetadata(
  transaction: BuildTransaction,
  actor: CurrentUser | null,
  buildId: string,
  versionId?: string,
): Promise<BuildShareSummary | null> {
  const scope = isApprovedBuildActor(actor)
    ? sql`${buildShareRequests.requestedVisibility} in ('HIVE','PUBLIC')`
    : eq(buildShareRequests.requestedVisibility, "PUBLIC");
  const [row] = await transaction
    .select(shareFields)
    .from(buildShareRequests)
    .innerJoin(builds, eq(builds.id, buildShareRequests.buildId))
    .innerJoin(buildVersions, eq(buildVersions.id, buildShareRequests.buildVersionId))
    .where(
      and(
        eq(builds.id, buildId),
        eq(buildShareRequests.status, "APPROVED"),
        scope,
        versionId
          ? eq(buildShareRequests.buildVersionId, versionId)
          : sql`exists (select 1 from ${buildPublications} where ${buildPublications.buildId} = ${builds.id} and ${buildPublications.requestId} = ${buildShareRequests.id})`,
        approvedBuildVersionAccessSql(actor, buildShareRequests.buildVersionId),
      ),
    )
    .orderBy(desc(buildShareRequests.reviewedAt), desc(buildShareRequests.id))
    .limit(1);
  return row ? { ...shareDto(row), reviewNote: "" } : null;
}

/** Called only for a build already authorized as the caller's own private record. */
export async function readOwnerBuildSharing(
  transaction: BuildTransaction,
  buildId: string,
): Promise<BuildSharingState> {
  const [latest] = await transaction
    .select(shareFields)
    .from(buildShareRequests)
    .innerJoin(buildVersions, eq(buildVersions.id, buildShareRequests.buildVersionId))
    .where(eq(buildShareRequests.buildId, buildId))
    .orderBy(desc(buildShareRequests.createdAt), desc(buildShareRequests.id))
    .limit(1);
  const [published] = await transaction
    .select(shareFields)
    .from(buildPublications)
    .innerJoin(buildShareRequests, eq(buildShareRequests.id, buildPublications.requestId))
    .innerJoin(buildVersions, eq(buildVersions.id, buildShareRequests.buildVersionId))
    .where(and(eq(buildPublications.buildId, buildId), eq(buildShareRequests.status, "APPROVED")))
    .limit(1);
  return {
    latestRequest: latest ? shareDto(latest) : null,
    published: published ? shareDto(published) : null,
  };
}

export async function requestBuildSharing(
  transaction: BuildTransaction,
  actorId: string,
  input: {
    buildId: string;
    versionId: string;
    title: string;
    description: string;
    visibility: "HIVE" | "PUBLIC";
  },
  now: Date,
) {
  await transaction
    .update(buildShareRequests)
    .set({ status: "CANCELLED", updatedAt: now })
    .where(
      and(eq(buildShareRequests.buildId, input.buildId), eq(buildShareRequests.status, "PENDING")),
    );
  const [request] = await transaction
    .insert(buildShareRequests)
    .values({
      buildId: input.buildId,
      buildVersionId: input.versionId,
      title: input.title,
      description: input.description,
      requestedVisibility: input.visibility,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: buildShareRequests.id });
  await transaction.insert(auditLogs).values({
    actorId,
    action: "build.share.requested",
    entityType: "build_share_request",
    entityId: request.id,
    metadata: {
      buildId: input.buildId,
      versionId: input.versionId,
      visibility: input.visibility,
    },
  });
}

export async function withdrawBuildSharing(
  transaction: BuildTransaction,
  actorId: string,
  buildId: string,
  now: Date,
) {
  await transaction.delete(buildPublications).where(eq(buildPublications.buildId, buildId));
  await transaction
    .update(buildShareRequests)
    .set({ status: "CANCELLED", updatedAt: now })
    .where(and(eq(buildShareRequests.buildId, buildId), eq(buildShareRequests.status, "PENDING")));
  await transaction.insert(auditLogs).values({
    actorId,
    action: "build.share.withdrawn",
    entityType: "build",
    entityId: buildId,
    metadata: {},
  });
}

export async function requireBuildReviewAdministrator(): Promise<CurrentUser> {
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE")
    throw new BuildSharingError("로그인은 유지됩니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
  if (
    state.status !== "AUTHENTICATED" ||
    !isApprovedBuildActor(state.user) ||
    state.user.role !== "ADMIN"
  )
    throw new BuildSharingError("빌드 공유 검토는 관리자만 할 수 있습니다.");
  return state.user;
}

async function reviewTransaction<T>(
  work: (transaction: BuildTransaction, actor: CurrentUser) => Promise<T>,
): Promise<T> {
  const sessionActor = await requireBuildReviewAdministrator();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
    const [fresh] = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, sessionActor.id))
      .for("share");
    const actor = fresh ? { ...fresh, isMock: false } : null;
    const [account] = await transaction
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, sessionActor.id), eq(accounts.provider, "discord")))
      .limit(1);
    if (!actor || actor.role !== "ADMIN" || !account)
      throw new BuildSharingError("빌드 공유 검토는 현재 연결된 관리자만 할 수 있습니다.");
    return work(transaction, actor);
  });
}

const reviewSchema = z
  .object({
    requestId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    action: z.enum(["APPROVE", "REJECT", "REVOKE", "RATE"]),
    reviewNote: z.string().trim().max(1000).default(""),
    recommendationScore: z.number().int().min(1).max(5).nullable().default(null),
    recommendationNote: z.string().trim().max(500).default(""),
  })
  .strict();
export async function reviewBuildSharing(value: unknown): Promise<void> {
  const parsed = reviewSchema.safeParse(value);
  if (!parsed.success) throw new BuildSharingError("승인 항목과 추천도를 확인해 주세요.");
  const input = parsed.data;
  await reviewTransaction(async (transaction, actor) => {
    const [reference] = await transaction
      .select({ buildId: buildShareRequests.buildId })
      .from(buildShareRequests)
      .where(eq(buildShareRequests.id, input.requestId))
      .limit(1);
    if (!reference) throw new BuildSharingError("공유 신청을 찾을 수 없습니다.");
    const [build] = await transaction
      .select()
      .from(builds)
      .where(eq(builds.id, reference.buildId))
      .for("update");
    const [request] = await transaction
      .select()
      .from(buildShareRequests)
      .where(eq(buildShareRequests.id, input.requestId))
      .for("update");
    if (
      !build ||
      !request ||
      request.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()
    )
      throw new BuildSharingError("다른 변경이 먼저 저장되었습니다. 다시 확인해 주세요.");
    if ((input.action === "APPROVE" || input.action === "REJECT") && request.status !== "PENDING")
      throw new BuildSharingError("검토 대기 중인 신청만 처리할 수 있습니다.");
    if ((input.action === "RATE" || input.action === "REVOKE") && request.status !== "APPROVED")
      throw new BuildSharingError("승인된 버전만 변경할 수 있습니다.");
    const now = nextBuildTimestamp(request.updatedAt);
    if (input.action === "APPROVE") {
      const [owner] = await transaction
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, build.ownerId));
      const [connected] = await transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, build.ownerId), eq(accounts.provider, "discord")))
        .limit(1);
      if (
        build.archivedAt ||
        !owner ||
        !["MEMBER", "OFFICER", "ADMIN"].includes(owner.role) ||
        !connected
      )
        throw new BuildSharingError("현재 공유할 수 없는 작성자 또는 보관된 빌드입니다.");
      const [version] = await transaction
        .select({
          schemaVersion: buildVersions.schemaVersion,
          snapshot: buildVersions.loadoutSnapshot,
          bodyDocument: buildVersions.bodyDocument,
          youtubeUrl: buildVersions.youtubeUrl,
        })
        .from(buildVersions)
        .where(
          and(eq(buildVersions.id, request.buildVersionId), eq(buildVersions.buildId, build.id)),
        )
        .limit(1);
      if (!version || !parseVersionedPlannerSnapshot(version.schemaVersion, version.snapshot))
        throw new BuildSharingError(
          "읽을 수 없는 장비 구성입니다. 작성자에게 새 버전 저장을 요청해 주세요.",
        );
      try {
        parseContentDocument(version.bodyDocument);
        parseYouTubeUrl(version.youtubeUrl);
      } catch {
        throw new BuildSharingError("본문 또는 영상 정보를 확인해 주세요.");
      }
      await transaction
        .update(buildShareRequests)
        .set({
          status: "APPROVED",
          reviewerId: actor.id,
          reviewedAt: now,
          reviewNote: input.reviewNote,
          recommendationScore: input.recommendationScore,
          recommendationNote: input.recommendationNote,
          updatedAt: now,
        })
        .where(eq(buildShareRequests.id, request.id));
      await transaction
        .insert(buildPublications)
        .values({ buildId: build.id, requestId: request.id, updatedAt: now })
        .onConflictDoUpdate({
          target: buildPublications.buildId,
          set: { requestId: request.id, updatedAt: now },
        });
    } else if (input.action === "REJECT") {
      await transaction
        .update(buildShareRequests)
        .set({
          status: "REJECTED",
          reviewerId: actor.id,
          reviewedAt: now,
          reviewNote: input.reviewNote,
          updatedAt: now,
        })
        .where(eq(buildShareRequests.id, request.id));
    } else if (input.action === "REVOKE") {
      // Revoke this exact version across repeated audience requests as well.
      await transaction
        .delete(buildPublications)
        .where(
          and(
            eq(buildPublications.buildId, build.id),
            sql`exists (select 1 from ${buildShareRequests} revoked_request where revoked_request.id = ${buildPublications.requestId} and revoked_request.build_version_id = ${request.buildVersionId})`,
          ),
        );
      await transaction
        .update(buildShareRequests)
        .set({
          status: "REVOKED",
          reviewerId: actor.id,
          reviewedAt: now,
          reviewNote: input.reviewNote,
          updatedAt: now,
        })
        .where(
          and(
            eq(buildShareRequests.buildId, build.id),
            eq(buildShareRequests.buildVersionId, request.buildVersionId),
            eq(buildShareRequests.status, "APPROVED"),
          ),
        );
    } else {
      await transaction
        .update(buildShareRequests)
        .set({
          recommendationScore: input.recommendationScore,
          recommendationNote: input.recommendationNote,
          updatedAt: now,
        })
        .where(eq(buildShareRequests.id, request.id));
    }
    await transaction.insert(auditLogs).values({
      actorId: actor.id,
      action: `build.share.${input.action.toLowerCase()}`,
      entityType: "build_share_request",
      entityId: request.id,
      metadata: {
        buildId: build.id,
        versionId: request.buildVersionId,
        recommendationScore: input.recommendationScore,
      },
    });
  });
}

export async function listBuildShareRequests(page = 1, status: BuildShareStatus = "PENDING") {
  return reviewTransaction(async (transaction) => {
    const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
    const rows = await transaction
      .select({ ...shareFields, buildId: buildShareRequests.buildId, ownerName: users.name })
      .from(buildShareRequests)
      .innerJoin(buildVersions, eq(buildVersions.id, buildShareRequests.buildVersionId))
      .innerJoin(builds, eq(builds.id, buildShareRequests.buildId))
      .innerJoin(users, eq(users.id, builds.ownerId))
      .where(eq(buildShareRequests.status, status))
      .orderBy(desc(buildShareRequests.updatedAt), desc(buildShareRequests.id))
      .limit(21)
      .offset((safePage - 1) * 20);
    return {
      items: rows
        .slice(0, 20)
        .map((row) => ({ ...shareDto(row), buildId: row.buildId, ownerName: row.ownerName })),
      page: safePage,
      hasNext: rows.length > 20,
    };
  });
}
export async function getBuildShareReview(requestId: string) {
  if (!z.uuid().safeParse(requestId).success) return null;
  return reviewTransaction(async (transaction) => {
    const [row] = await transaction
      .select({
        ...shareFields,
        buildId: buildShareRequests.buildId,
        ownerName: users.name,
        schemaVersion: buildVersions.schemaVersion,
        snapshot: buildVersions.loadoutSnapshot,
        notes: buildVersions.notes,
        bodyDocument: buildVersions.bodyDocument,
        youtubeUrl: buildVersions.youtubeUrl,
      })
      .from(buildShareRequests)
      .innerJoin(buildVersions, eq(buildVersions.id, buildShareRequests.buildVersionId))
      .innerJoin(builds, eq(builds.id, buildShareRequests.buildId))
      .innerJoin(users, eq(users.id, builds.ownerId))
      .where(eq(buildShareRequests.id, requestId))
      .limit(1);
    if (!row) return null;
    return {
      share: shareDto(row),
      buildId: row.buildId,
      ownerName: row.ownerName,
      loadout: parseVersionedPlannerSnapshot(row.schemaVersion, row.snapshot),
      notes: row.notes ?? "",
      bodyDocument: parseContentDocument(row.bodyDocument),
      youtubeUrl: parseYouTubeUrl(row.youtubeUrl),
    };
  });
}
