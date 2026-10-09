import "server-only";
import {
  accounts,
  and,
  auditLogs,
  builds,
  buildVersions,
  desc,
  dpsResearchRecords,
  dpsResearchVersions,
  dpsResearchPublications,
  dpsResearchVerifications,
  eq,
  getDb,
  memberProfiles,
  sql,
  users,
} from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import { getCurrentAuthState } from "../auth";
import {
  DPS_RESEARCH_STATUSES,
  dpsArchiveSchema,
  dpsHasVerification,
  dpsReviewSchema,
  dpsSaveSchema,
  dpsVerificationSchema,
  isDpsAdministrator,
  isDpsMember,
  isDpsStaff,
  type DpsDirectory,
  type DpsResearchDetail,
  type DpsResearchPayload,
  type DpsResearchStatus,
  type DpsResearchSummary,
  type DpsVerification,
} from "../dps-research";
import {
  communityPage,
  communitySearchPattern,
  normalizeCommunityQuery,
} from "../community-policy";
import { contentPlainText } from "../content-document";
import { bindContentImages } from "./content-media";
import { getSessionGuildEligibilityState } from "./discord-authorization";
import { approvedBuildVersionAccessSql, readApprovedBuildMetadata } from "./build-sharing";
import {
  dpsResearchPublishedVersionAccessSql,
  dpsResearchVerifiedSql,
  dpsResearchVersionAccessSql,
} from "./dps-research-access";
export { dpsResearchVersionAccessSql } from "./dps-research-access";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Permission = "MEMBER" | "STAFF" | "ADMIN";
const errors = {
  UNAUTHENTICATED: "로그인한 후 다시 시도해 주세요.",
  FORBIDDEN: "현재 계정으로 이 자료를 변경하거나 확인할 수 없습니다.",
  NOT_FOUND: "자료가 없거나 현재 확인할 수 없습니다.",
  CONFLICT: "자료가 변경되었습니다. 새로고침한 후 다시 시도해 주세요.",
  INVALID_INPUT: "측정 조건·결과·증거와 공개 승인된 빌드 연결을 확인해 주세요.",
  UNAVAILABLE: "로그인은 유지됩니다. 연결 상태를 확인한 후 다시 시도해 주세요.",
  REAUTH: "Discord로 다시 로그인해 주세요.",
  LEFT: "UNIZ Discord 서버의 멤버 상태를 확인해 주세요.",
} as const;
export class DpsResearchError extends Error {
  constructor(public readonly code: keyof typeof errors) {
    super(errors[code]);
    this.name = "DpsResearchError";
  }
}
function permitted(actor: CurrentUser | null, permission: Permission): boolean {
  return permission === "ADMIN"
    ? isDpsAdministrator(actor)
    : permission === "STAFF"
      ? isDpsStaff(actor)
      : isDpsMember(actor);
}
function requireActor(
  actor: CurrentUser | null,
  permission: Permission = "MEMBER",
): asserts actor is CurrentUser {
  if (!permitted(actor, permission)) throw new DpsResearchError("FORBIDDEN");
}
async function context<T>(
  permission: Permission | null,
  write: boolean,
  work: (tx: Transaction, actor: CurrentUser | null) => Promise<T>,
): Promise<T> {
  try {
    const state = await getCurrentAuthState();
    if (permission && state.status !== "AUTHENTICATED") {
      throw new DpsResearchError(
        state.status === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : state.status === "LEFT"
            ? "LEFT"
            : state.status === "REAUTH_REQUIRED"
              ? "REAUTH"
              : "UNAUTHENTICATED",
      );
    }
    const session = state.status === "AUTHENTICATED" && isDpsMember(state.user) ? state.user : null;
    if (permission && !permitted(session, permission)) throw new DpsResearchError("FORBIDDEN");
    if (write && session) {
      const guild = await getSessionGuildEligibilityState(session.id);
      if (guild.status !== "MEMBER")
        throw new DpsResearchError(
          guild.status === "LEFT"
            ? "LEFT"
            : guild.status === "REAUTH_REQUIRED"
              ? "REAUTH"
              : "UNAVAILABLE",
        );
    }
    return await getDb().transaction(
      async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
        let actor: CurrentUser | null = null;
        if (session) {
          const [fresh] = await tx
            .select({ id: users.id, name: users.name, role: users.role })
            .from(users)
            .where(eq(users.id, session.id))
            .for("share");
          const [connected] = await tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.userId, session.id), eq(accounts.provider, "discord")))
            .for("share")
            .limit(1);
          const candidate = fresh ? { ...fresh, isMock: false } : null;
          if (connected && isDpsMember(candidate)) actor = candidate;
        }
        if (permission) requireActor(actor, permission);
        return work(tx, actor);
      },
      { isolationLevel: write ? "read committed" : "repeatable read" },
    );
  } catch (error) {
    if (error instanceof DpsResearchError) throw error;
    throw new DpsResearchError("UNAVAILABLE");
  }
}
function timestamp(previous: Date) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}
function expected(input: string, actual: Date) {
  if (new Date(input).getTime() !== actual.getTime()) throw new DpsResearchError("CONFLICT");
}
function payload(value: unknown): DpsResearchPayload {
  const result = dpsSaveSchema.safeParse({ action: "DRAFT", payload: value });
  if (!result.success) throw new DpsResearchError("UNAVAILABLE");
  return result.data.payload;
}
const fields = {
  id: dpsResearchRecords.id,
  ownerId: dpsResearchRecords.ownerId,
  versionId: dpsResearchVersions.id,
  version: dpsResearchVersions.version,
  status: dpsResearchVersions.status,
  payload: dpsResearchVersions.payload,
  author: sql<string>`coalesce(${memberProfiles.displayName},${users.name},'멤버')`,
  updatedAt: dpsResearchVersions.updatedAt,
  recordUpdatedAt: dpsResearchRecords.updatedAt,
  createdAt: dpsResearchVersions.createdAt,
  submittedAt: dpsResearchVersions.submittedAt,
  reviewedAt: dpsResearchVersions.reviewedAt,
  reviewNote: dpsResearchVersions.reviewNote,
  archivedAt: dpsResearchRecords.archivedAt,
  hiddenAt: dpsResearchRecords.hiddenAt,
  publishedVersion: sql<
    number | null
  >`(select v.version from dps_research_publications p join dps_research_versions v on v.id = p.version_id where p.record_id = ${dpsResearchRecords.id})`,
  verified: dpsResearchVerifiedSql(dpsResearchVersions.id),
  verificationCount: sql<number>`(select count(distinct review.reviewer_id)::int from dps_research_verifications review join users verifier on verifier.id = review.reviewer_id where review.version_id = ${dpsResearchVersions.id} and review.confirmed and review.reviewer_id <> ${dpsResearchRecords.ownerId} and verifier.role in ('OFFICER','ADMIN') and exists(select 1 from accounts a where a.user_id = verifier.id and a.provider = 'discord'))`,
};
type Row = {
  id: string;
  ownerId: string;
  versionId: string;
  version: number;
  status: DpsResearchStatus;
  payload: unknown;
  author: string;
  updatedAt: Date;
  recordUpdatedAt: Date;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string;
  archivedAt: Date | null;
  hiddenAt: Date | null;
  publishedVersion: number | null;
  verified: boolean;
  verificationCount: number;
};
function dto(row: Row): DpsResearchSummary {
  return {
    ...row,
    payload: payload(row.payload),
    updatedAt: row.updatedAt.toISOString(),
    recordUpdatedAt: row.recordUpdatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
  };
}
function query(tx: Transaction) {
  return tx
    .select(fields)
    .from(dpsResearchVersions)
    .innerJoin(dpsResearchRecords, eq(dpsResearchRecords.id, dpsResearchVersions.recordId))
    .innerJoin(users, eq(users.id, dpsResearchRecords.ownerId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id));
}
export async function getDpsDirectory(
  input: { q?: unknown; page?: unknown } = {},
): Promise<DpsDirectory> {
  return context(null, false, async (tx) => {
    const page = communityPage(input.page);
    const q = normalizeCommunityQuery(input.q);
    const rows = await query(tx)
      .where(
        and(
          sql`exists(select 1 from dps_research_publications p where p.version_id = ${dpsResearchVersions.id})`,
          dpsResearchPublishedVersionAccessSql(dpsResearchVersions.id),
          q
            ? sql`concat_ws(' ', ${dpsResearchVersions.payload}->>'title', ${dpsResearchVersions.payload}->>'summary', ${dpsResearchVersions.payload}->>'composition', ${dpsResearchVersions.payload}->>'target', ${dpsResearchVersions.payload}->>'gamePatch', ${dpsResearchVersions.payload}->>'scenario', ${dpsResearchVersions.payload}->>'procedure', ${dpsResearchVersions.payload}->>'evidenceText') ilike ${communitySearchPattern(q)}`
            : undefined,
        ),
      )
      .orderBy(desc(dpsResearchVersions.reviewedAt), desc(dpsResearchVersions.id))
      .limit(10)
      .offset((page - 1) * 9);
    return { items: rows.slice(0, 9).map(dto), page, hasNext: rows.length > 9 };
  });
}
export async function getMyDpsRecords(input: { page?: unknown } = {}): Promise<DpsDirectory> {
  return context("MEMBER", false, async (tx, actor) => {
    requireActor(actor);
    const page = communityPage(input.page);
    const rows = await query(tx)
      .where(
        and(
          eq(dpsResearchRecords.ownerId, actor.id),
          sql`${dpsResearchVersions.version} = (select max(v.version) from dps_research_versions v where v.record_id = ${dpsResearchRecords.id})`,
        ),
      )
      .orderBy(desc(dpsResearchRecords.updatedAt), desc(dpsResearchRecords.id))
      .limit(21)
      .offset((page - 1) * 20);
    return { items: rows.slice(0, 20).map(dto), page, hasNext: rows.length > 20 };
  });
}
export async function getDpsReviewDirectory(
  input: { status?: unknown; page?: unknown } = {},
): Promise<DpsDirectory> {
  return context("STAFF", false, async (tx) => {
    const page = communityPage(input.page);
    const status =
      typeof input.status === "string" &&
      input.status !== "DRAFT" &&
      Object.hasOwn(DPS_RESEARCH_STATUSES, input.status)
        ? (input.status as DpsResearchStatus)
        : "PENDING";
    const rows = await query(tx)
      .where(
        and(
          eq(dpsResearchVersions.status, status),
          sql`${dpsResearchVersions.submittedAt} is not null`,
        ),
      )
      .orderBy(desc(dpsResearchVersions.submittedAt), desc(dpsResearchVersions.id))
      .limit(21)
      .offset((page - 1) * 20);
    return { items: rows.slice(0, 20).map(dto), page, hasNext: rows.length > 20 };
  });
}
async function detail(
  tx: Transaction,
  actor: CurrentUser | null,
  id: string,
  requested?: unknown,
): Promise<DpsResearchDetail | null> {
  const number =
    requested === undefined || requested === null || requested === "" ? null : Number(requested);
  if (number !== null && (!Number.isSafeInteger(number) || number < 1)) return null;
  const [row] = await query(tx)
    .where(
      and(
        eq(dpsResearchRecords.id, id),
        number ? eq(dpsResearchVersions.version, number) : undefined,
        dpsResearchVersionAccessSql(actor, dpsResearchVersions.id),
      ),
    )
    .orderBy(
      isDpsMember(actor)
        ? sql`case when ${dpsResearchRecords.ownerId} = ${actor.id} then 0 when exists(select 1 from dps_research_publications p where p.version_id = ${dpsResearchVersions.id}) then 0 else 1 end`
        : sql`case when exists(select 1 from dps_research_publications p where p.version_id = ${dpsResearchVersions.id}) then 0 else 1 end`,
      desc(dpsResearchVersions.version),
    )
    .limit(1);
  if (!row) return null;
  const summary = dto(row);
  const history = await tx
    .select({
      version: dpsResearchVersions.version,
      status: dpsResearchVersions.status,
      createdAt: dpsResearchVersions.createdAt,
      isPublished: sql<boolean>`exists(select 1 from dps_research_publications p where p.version_id = ${dpsResearchVersions.id})`,
    })
    .from(dpsResearchVersions)
    .where(
      and(
        eq(dpsResearchVersions.recordId, id),
        dpsResearchVersionAccessSql(actor, dpsResearchVersions.id),
      ),
    )
    .orderBy(desc(dpsResearchVersions.version))
    .limit(20);
  const reviews = await tx
    .select({
      reviewerId: dpsResearchVerifications.reviewerId,
      reviewerName: sql<string>`coalesce(${memberProfiles.displayName},${users.name},'검토자')`,
      note: dpsResearchVerifications.note,
      confirmed: dpsResearchVerifications.confirmed,
      updatedAt: dpsResearchVerifications.updatedAt,
    })
    .from(dpsResearchVerifications)
    .innerJoin(users, eq(users.id, dpsResearchVerifications.reviewerId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
    .where(
      and(
        eq(dpsResearchVerifications.versionId, row.versionId),
        sql`${users.role} in ('OFFICER','ADMIN') and exists(select 1 from accounts a where a.user_id = ${users.id} and a.provider = 'discord')`,
      ),
    )
    .orderBy(desc(dpsResearchVerifications.updatedAt));
  const verifications: DpsVerification[] = reviews.map((review) => ({
    ...review,
    updatedAt: review.updatedAt.toISOString(),
  }));
  let buildLink: DpsResearchDetail["buildLink"] = null;
  if (summary.payload.buildVersionId) {
    const [linked] = await tx
      .select({
        id: buildVersions.id,
        buildId: buildVersions.buildId,
        ownerId: builds.ownerId,
        title: buildVersions.title,
        version: buildVersions.version,
      })
      .from(buildVersions)
      .innerJoin(builds, eq(builds.id, buildVersions.buildId))
      .where(eq(buildVersions.id, summary.payload.buildVersionId))
      .limit(1);
    if (linked) {
      const approved = await readApprovedBuildMetadata(tx, null, linked.buildId, linked.id);
      if (approved)
        buildLink = {
          title: approved.title,
          href: `/lab/b/${linked.buildId}?version=${linked.version}`,
        };
      else if (actor?.id === linked.ownerId)
        buildLink = {
          title: linked.title ?? "내 빌드",
          href: `/lab/b/${linked.buildId}?version=${linked.version}`,
        };
    }
  }
  const active = !row.archivedAt && !row.hiddenAt;
  return {
    ...summary,
    isOwner: actor?.id === row.ownerId,
    canEdit: active && actor?.id === row.ownerId,
    canReview: active && isDpsAdministrator(actor) && ["PENDING", "APPROVED"].includes(row.status),
    canVerify:
      active &&
      isDpsStaff(actor) &&
      actor?.id !== row.ownerId &&
      row.status === "APPROVED" &&
      (await publicVersion(tx, row.versionId)),
    versions: history.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    verifications,
    verified: dpsHasVerification(summary.payload, row.ownerId, verifications),
    buildLink,
  };
}
async function publicVersion(tx: Transaction, versionId: string) {
  const [row] = await tx
    .select({ id: dpsResearchVersions.id })
    .from(dpsResearchVersions)
    .where(
      and(
        eq(dpsResearchVersions.id, versionId),
        dpsResearchPublishedVersionAccessSql(dpsResearchVersions.id),
      ),
    )
    .limit(1);
  return !!row;
}
export async function getDpsDetail(
  id: string,
  version?: unknown,
): Promise<DpsResearchDetail | null> {
  return context(null, false, (tx, actor) => detail(tx, actor, id, version));
}
export async function getDpsEditorData(id?: string): Promise<{
  initial: DpsResearchDetail | null;
  buildVersions: {
    id: string;
    title: string;
    version: number;
    visibility: "PRIVATE" | "HIVE" | "PUBLIC";
  }[];
}> {
  return context("MEMBER", false, async (tx, actor) => {
    requireActor(actor);
    const initial = id ? await detail(tx, actor, id) : null;
    if (id && (!initial || !initial.isOwner || !initial.canEdit))
      throw new DpsResearchError("NOT_FOUND");
    const options = await tx
      .select({
        id: buildVersions.id,
        title: sql<string>`coalesce(${buildVersions.title},${builds.title})`,
        version: buildVersions.version,
        visibility: sql<"PRIVATE" | "HIVE" | "PUBLIC">`case
          when ${approvedBuildVersionAccessSql(null, buildVersions.id)} then 'PUBLIC'
          when ${approvedBuildVersionAccessSql(actor, buildVersions.id)} then 'HIVE'
          else 'PRIVATE' end`,
      })
      .from(buildVersions)
      .innerJoin(builds, eq(builds.id, buildVersions.buildId))
      .where(and(eq(builds.ownerId, actor.id), sql`${builds.archivedAt} is null`))
      .orderBy(desc(buildVersions.createdAt), desc(buildVersions.id))
      .limit(100);
    return { initial, buildVersions: options };
  });
}
async function lockedRecord(tx: Transaction, id: string) {
  const [record] = await tx
    .select()
    .from(dpsResearchRecords)
    .where(eq(dpsResearchRecords.id, id))
    .for("update")
    .limit(1);
  if (!record) throw new DpsResearchError("NOT_FOUND");
  return record;
}
async function lockedVersion(tx: Transaction, id: string) {
  const [reference] = await tx
    .select({ recordId: dpsResearchVersions.recordId })
    .from(dpsResearchVersions)
    .where(eq(dpsResearchVersions.id, id))
    .limit(1);
  if (!reference) throw new DpsResearchError("NOT_FOUND");
  const record = await lockedRecord(tx, reference.recordId);
  const [version] = await tx
    .select()
    .from(dpsResearchVersions)
    .where(eq(dpsResearchVersions.id, id))
    .for("update")
    .limit(1);
  if (!version) throw new DpsResearchError("NOT_FOUND");
  return { record, version };
}
async function linkedBuild(
  tx: Transaction,
  actor: CurrentUser,
  p: DpsResearchPayload,
  publicOnly: boolean,
) {
  if (!p.buildVersionId) return;
  const [ref] = await tx
    .select({ buildId: buildVersions.buildId })
    .from(buildVersions)
    .where(eq(buildVersions.id, p.buildVersionId))
    .limit(1);
  if (!ref) throw new DpsResearchError("INVALID_INPUT");
  await tx.select({ id: builds.id }).from(builds).where(eq(builds.id, ref.buildId)).for("share");
  const [allowed] = await tx
    .select({ id: buildVersions.id })
    .from(buildVersions)
    .innerJoin(builds, eq(builds.id, buildVersions.buildId))
    .where(
      and(
        eq(buildVersions.id, p.buildVersionId),
        sql`${builds.archivedAt} is null`,
        publicOnly
          ? approvedBuildVersionAccessSql(null, buildVersions.id)
          : sql`(${builds.ownerId} = ${actor.id} or (${approvedBuildVersionAccessSql(actor, buildVersions.id)}))`,
      ),
    )
    .limit(1);
  if (!allowed) throw new DpsResearchError("INVALID_INPUT");
}
async function audit(
  tx: Transaction,
  actor: CurrentUser,
  recordId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await tx.insert(auditLogs).values({
    actorId: actor.id,
    entityType: "dps_research",
    entityId: recordId,
    action,
    metadata,
  });
}

export async function saveDpsResearch(
  value: unknown,
): Promise<{ id: string; version: number; versionId: string }> {
  const parsed = dpsSaveSchema.safeParse(value);
  if (!parsed.success) throw new DpsResearchError("INVALID_INPUT");
  const input = parsed.data;
  const p = {
    ...input.payload,
    evidenceText: input.payload.evidenceDocument
      ? contentPlainText(input.payload.evidenceDocument)
      : input.payload.evidenceText,
  };
  if (
    input.action === "SUBMIT" &&
    p.measuredAt! > new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  )
    throw new DpsResearchError("INVALID_INPUT");
  return context("MEMBER", true, async (tx, actor) => {
    requireActor(actor);
    const existing = input.id ? await lockedRecord(tx, input.id) : null;
    if (existing && (existing.ownerId !== actor.id || existing.archivedAt || existing.hiddenAt))
      throw new DpsResearchError("FORBIDDEN");
    if (existing) expected(input.expectedUpdatedAt!, existing.updatedAt);
    const now = existing ? timestamp(existing.updatedAt) : new Date();
    const [record] = existing
      ? [existing]
      : await tx
          .insert(dpsResearchRecords)
          .values({ ownerId: actor.id, createdAt: now, updatedAt: now })
          .returning();
    await linkedBuild(tx, actor, p, input.action === "SUBMIT");
    await tx
      .update(dpsResearchVersions)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(
        and(eq(dpsResearchVersions.recordId, record.id), eq(dpsResearchVersions.status, "PENDING")),
      );
    const [latest] = await tx
      .select({ version: dpsResearchVersions.version })
      .from(dpsResearchVersions)
      .where(eq(dpsResearchVersions.recordId, record.id))
      .orderBy(desc(dpsResearchVersions.version))
      .limit(1);
    const [version] = await tx
      .insert(dpsResearchVersions)
      .values({
        recordId: record.id,
        version: (latest?.version ?? 0) + 1,
        payload: p,
        status: input.action === "SUBMIT" ? "PENDING" : "DRAFT",
        submittedAt: input.action === "SUBMIT" ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await bindContentImages(tx, actor.id, { researchVersionId: version.id }, p.evidenceDocument);
    await tx
      .update(dpsResearchRecords)
      .set({ updatedAt: now })
      .where(eq(dpsResearchRecords.id, record.id));
    await audit(tx, actor, record.id, input.action === "SUBMIT" ? "dps.submitted" : "dps.saved", {
      versionId: version.id,
      version: version.version,
    });
    return { id: record.id, version: version.version, versionId: version.id };
  });
}
export async function reviewDpsResearch(value: unknown): Promise<void> {
  const parsed = dpsReviewSchema.safeParse(value);
  if (!parsed.success) throw new DpsResearchError("INVALID_INPUT");
  const input = parsed.data;
  await context("ADMIN", true, async (tx, actor) => {
    requireActor(actor, "ADMIN");
    const { record, version } = await lockedVersion(tx, input.versionId);
    expected(input.expectedUpdatedAt, version.updatedAt);
    if (
      record.hiddenAt ||
      record.archivedAt ||
      (input.action === "REVOKE" ? version.status !== "APPROVED" : version.status !== "PENDING")
    )
      throw new DpsResearchError("CONFLICT");
    if (input.action === "APPROVE") {
      const p = payload(version.payload);
      const validation = dpsSaveSchema.safeParse({ action: "SUBMIT", payload: p });
      if (!validation.success) throw new DpsResearchError("INVALID_INPUT");
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, record.ownerId),
            sql`${users.role} in ('MEMBER','OFFICER','ADMIN') and exists(select 1 from accounts a where a.user_id = ${users.id} and a.provider = 'discord')`,
          ),
        )
        .for("share")
        .limit(1);
      if (!owner) throw new DpsResearchError("FORBIDDEN");
      await linkedBuild(tx, actor, p, true);
    }
    const now = timestamp(version.updatedAt);
    const status =
      input.action === "APPROVE"
        ? "APPROVED"
        : input.action === "REJECT"
          ? "REJECTED"
          : input.action === "REVOKE"
            ? "REVOKED"
            : "CHANGES_REQUESTED";
    await tx
      .update(dpsResearchVersions)
      .set({
        status,
        reviewerId: actor.id,
        reviewedAt: now,
        reviewNote: input.note,
        updatedAt: now,
      })
      .where(eq(dpsResearchVersions.id, version.id));
    if (input.action === "APPROVE")
      await tx
        .insert(dpsResearchPublications)
        .values({ recordId: record.id, versionId: version.id, updatedAt: now })
        .onConflictDoUpdate({
          target: dpsResearchPublications.recordId,
          set: { versionId: version.id, updatedAt: now },
        });
    if (input.action === "REVOKE")
      await tx
        .delete(dpsResearchPublications)
        .where(
          and(
            eq(dpsResearchPublications.recordId, record.id),
            eq(dpsResearchPublications.versionId, version.id),
          ),
        );
    await tx
      .update(dpsResearchRecords)
      .set({ updatedAt: timestamp(record.updatedAt) })
      .where(eq(dpsResearchRecords.id, record.id));
    await audit(tx, actor, record.id, `dps.${status.toLowerCase()}`, { versionId: version.id });
  });
}
export async function verifyDpsResearch(value: unknown): Promise<void> {
  const parsed = dpsVerificationSchema.safeParse(value);
  if (!parsed.success) throw new DpsResearchError("INVALID_INPUT");
  const input = parsed.data;
  await context("STAFF", true, async (tx, actor) => {
    requireActor(actor, "STAFF");
    const { record, version } = await lockedVersion(tx, input.versionId);
    expected(input.expectedUpdatedAt, version.updatedAt);
    if (record.ownerId === actor.id || !(await publicVersion(tx, version.id)))
      throw new DpsResearchError("FORBIDDEN");
    await linkedBuild(tx, actor, payload(version.payload), true);
    const now = timestamp(version.updatedAt);
    await tx
      .insert(dpsResearchVerifications)
      .values({
        versionId: version.id,
        reviewerId: actor.id,
        confirmed: input.confirmed,
        note: input.note,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [dpsResearchVerifications.versionId, dpsResearchVerifications.reviewerId],
        set: { confirmed: input.confirmed, note: input.note, updatedAt: now },
      });
    await tx
      .update(dpsResearchVersions)
      .set({ updatedAt: now })
      .where(eq(dpsResearchVersions.id, version.id));
    await tx
      .update(dpsResearchRecords)
      .set({ updatedAt: timestamp(record.updatedAt) })
      .where(eq(dpsResearchRecords.id, record.id));
    await audit(tx, actor, record.id, "dps.verification_updated", {
      versionId: version.id,
      confirmed: input.confirmed,
    });
  });
}
export async function archiveDpsResearch(value: unknown): Promise<void> {
  const parsed = dpsArchiveSchema.safeParse(value);
  if (!parsed.success) throw new DpsResearchError("INVALID_INPUT");
  const input = parsed.data;
  await context("MEMBER", true, async (tx, actor) => {
    requireActor(actor);
    const record = await lockedRecord(tx, input.id);
    if (record.ownerId !== actor.id) throw new DpsResearchError("FORBIDDEN");
    expected(input.expectedUpdatedAt, record.updatedAt);
    const now = timestamp(record.updatedAt);
    await tx.delete(dpsResearchPublications).where(eq(dpsResearchPublications.recordId, record.id));
    await tx
      .update(dpsResearchVersions)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(
        and(eq(dpsResearchVersions.recordId, record.id), eq(dpsResearchVersions.status, "PENDING")),
      );
    await tx
      .update(dpsResearchRecords)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(dpsResearchRecords.id, record.id));
    await audit(tx, actor, record.id, "dps.archived", {});
  });
}
