import "server-only";
import {
  accounts,
  and,
  auditLogs,
  desc,
  eq,
  getDb,
  memberProfiles,
  operationParticipants,
  operationRoles,
  operations,
  seasons,
  sql,
  users,
} from "@uniz/db";
import type { OperationType, RSVPStatus, SeasonStatus, PartyContribution } from "@uniz/domain";
import { z } from "zod";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import { readPartyContribution } from "../party-synergy";
import {
  assertOperationSaveAllowed,
  OperationAdministrationError,
  operationAdministrationSchema,
  requireOperationAdministrator,
} from "../operation-admin-policy";

export { OperationAdministrationError } from "../operation-admin-policy";

const AUTHORIZATION_LOCK = 912743110;
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function requireCurrentOperationAdministrator(): Promise<CurrentUser> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    throw new OperationAdministrationError(
      "로그인은 유지됩니다. Discord 연결을 잠시 확인할 수 없습니다. 연결 확인 후 다시 시도해 주세요.",
    );
  return requireOperationAdministrator(user);
}

export interface OperationAdminSummary {
  id: string;
  seasonId: string | null;
  seasonName: string | null;
  title: string;
  contentKey?: string | null;
  type: OperationType;
  description: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  updatedAt: string;
  goingCount: number;
  maybeCount: number;
  unavailableCount: number;
}

export interface OperationSeasonOption {
  id: string;
  name: string;
  status: SeasonStatus;
  startsAt: string;
  settlementAt: string | null;
}

export interface OperationAdminDetail extends OperationAdminSummary {
  attendees: {
    id: string;
    userId: string;
    displayName: string;
    handle: string | null;
    status: RSVPStatus;
    roleName: string | null;
    contribution: PartyContribution;
  }[];
  roles: { id: string; name: string; capacity: number }[];
}

export interface OperationAdminData {
  operations: OperationAdminSummary[];
  seasons: OperationSeasonOption[];
}

async function requirePersistedActor(transaction: Transaction, userId: string, write: boolean) {
  const [fresh] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .for(write ? "update" : "share");
  const actor = requireOperationAdministrator(fresh ? { ...fresh, isMock: false } : null);
  const [discord] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
    .limit(1);
  if (!discord)
    throw new OperationAdministrationError("Discord 연결을 확인한 후 다시 로그인해 주세요.");
  return actor;
}

async function readOperationSummaries(transaction: Transaction, id?: string) {
  const selection = transaction
    .select({
      id: operations.id,
      seasonId: operations.seasonId,
      seasonName: seasons.name,
      title: operations.title,
      contentKey: operations.contentKey,
      type: operations.type,
      description: operations.description,
      startsAt: operations.startsAt,
      endsAt: operations.endsAt,
      capacity: operations.capacity,
      status: operations.status,
      updatedAt: operations.updatedAt,
      goingCount: sql<number>`(select count(*)::integer from ${operationParticipants} where ${operationParticipants.operationId} = ${operations.id} and ${operationParticipants.status} = 'GOING')`,
      maybeCount: sql<number>`(select count(*)::integer from ${operationParticipants} where ${operationParticipants.operationId} = ${operations.id} and ${operationParticipants.status} = 'MAYBE')`,
      unavailableCount: sql<number>`(select count(*)::integer from ${operationParticipants} where ${operationParticipants.operationId} = ${operations.id} and ${operationParticipants.status} = 'UNAVAILABLE')`,
    })
    .from(operations)
    .leftJoin(seasons, eq(seasons.id, operations.seasonId));
  const rows = await selection
    .where(id ? eq(operations.id, id) : undefined)
    .orderBy(desc(operations.startsAt));
  return rows.map((row): OperationAdminSummary => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getOperationAdminData(): Promise<OperationAdminData> {
  const actor = await requireCurrentOperationAdministrator();
  return getDb().transaction(async (transaction) => {
    await requirePersistedActor(transaction, actor.id, false);
    const summaries = await readOperationSummaries(transaction);
    const options = await transaction
      .select({
        id: seasons.id,
        name: seasons.name,
        status: seasons.status,
        startsAt: seasons.startsAt,
        settlementAt: seasons.settlementAt,
      })
      .from(seasons)
      .where(
        and(
          eq(seasons.approvalStatus, "APPROVED"),
          sql`${seasons.status} in ('PLANNED', 'ACTIVE')`,
        ),
      )
      .orderBy(desc(seasons.seasonNumber));
    return {
      operations: summaries,
      seasons: options.map((season) => ({
        ...season,
        startsAt: season.startsAt.toISOString(),
        settlementAt: season.settlementAt?.toISOString() ?? null,
      })),
    };
  });
}

export async function getOperationAdminDetail(id: string): Promise<OperationAdminDetail | null> {
  const actor = await requireCurrentOperationAdministrator();
  if (!z.uuid().safeParse(id).success) return null;
  return getDb().transaction(async (transaction) => {
    const principal = await requirePersistedActor(transaction, actor.id, false);
    const [operation] = await readOperationSummaries(transaction, id);
    if (!operation) return null;
    const attendees = await transaction
      .select({
        id: operationParticipants.id,
        userId: operationParticipants.userId,
        displayName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name}, '멤버')`,
        handle: memberProfiles.handle,
        status: operationParticipants.status,
        roleName: operationRoles.name,
        contribution: operationParticipants.contribution,
      })
      .from(operationParticipants)
      .innerJoin(users, eq(users.id, operationParticipants.userId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(operationRoles, eq(operationRoles.id, operationParticipants.roleId))
      .where(eq(operationParticipants.operationId, id))
      .orderBy(operationParticipants.createdAt);
    const roles = await transaction
      .select({
        id: operationRoles.id,
        name: operationRoles.name,
        capacity: operationRoles.capacity,
      })
      .from(operationRoles)
      .where(eq(operationRoles.operationId, id))
      .orderBy(operationRoles.name);
    return {
      ...operation,
      attendees: attendees.map((attendee) => ({
        ...attendee,
        contribution: readPartyContribution(attendee.contribution),
        handle: principal.role === "ADMIN" ? attendee.handle : null,
      })),
      roles,
    };
  });
}

export async function mutateOperationAdministration(value: unknown): Promise<{ id: string }> {
  const parsed = operationAdministrationSchema.safeParse(value);
  if (!parsed.success)
    throw new OperationAdministrationError(
      parsed.error.issues.some((issue) => issue.path.includes("expectedUpdatedAt"))
        ? "수정할 작전의 최신 저장 시각이 필요합니다. 화면을 새로고침해 주세요."
        : "작전 제목, 일정, 정원과 상태를 확인해 주세요.",
    );
  const input = parsed.data;
  const actor = await requireCurrentOperationAdministrator();
  return getDb().transaction(async (transaction) => {
    // All admin and operational writers take this before actor/season/operation locks.
    await transaction.execute(sql`select pg_advisory_xact_lock(${AUTHORIZATION_LOCK})`);
    const fresh = await requirePersistedActor(transaction, actor.id, true);
    const [before] = input.id
      ? await transaction
          .select({ seasonId: operations.seasonId })
          .from(operations)
          .where(eq(operations.id, input.id))
          .limit(1)
      : [];
    if (input.id && !before) throw new OperationAdministrationError("작전을 찾을 수 없습니다.");
    const seasonIds = [...new Set([before?.seasonId, input.seasonId].filter(Boolean))].sort();
    const lockedSeasons = [];
    for (const seasonId of seasonIds) {
      const [season] = await transaction
        .select({
          id: seasons.id,
          status: seasons.status,
          approvalStatus: seasons.approvalStatus,
          startsAt: seasons.startsAt,
          settlementAt: seasons.settlementAt,
        })
        .from(seasons)
        .where(eq(seasons.id, seasonId as string))
        .for("update");
      if (season) lockedSeasons.push(season);
    }
    const [existing] = input.id
      ? await transaction.select().from(operations).where(eq(operations.id, input.id)).for("update")
      : [];
    if (input.id && !existing) throw new OperationAdministrationError("작전을 찾을 수 없습니다.");
    if (existing?.contentKey)
      throw new OperationAdministrationError(
        "이 파티는 파티 모집 화면의 ‘모집 수정’에서 변경해 주세요.",
      );
    if (existing && existing.seasonId !== before?.seasonId)
      throw new OperationAdministrationError(
        "연결된 시즌이 변경되었습니다. 화면을 새로고침해 주세요.",
      );
    const [counts] = input.id
      ? await transaction
          .select({
            participants: sql<number>`count(*)::integer`,
            going: sql<number>`count(*) filter (where ${operationParticipants.status} = 'GOING')::integer`,
          })
          .from(operationParticipants)
          .where(eq(operationParticipants.operationId, input.id))
      : [];
    const now = new Date();
    assertOperationSaveAllowed({
      input,
      existing: existing ?? null,
      currentSeason: lockedSeasons.find((season) => season.id === existing?.seasonId) ?? null,
      targetSeason: lockedSeasons.find((season) => season.id === input.seasonId) ?? null,
      participantCount: counts?.participants ?? 0,
      goingCount: counts?.going ?? 0,
      now,
    });
    const values = {
      seasonId: input.seasonId,
      title: input.title,
      type: input.type,
      description: input.description,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      capacity: input.capacity,
      status: input.status,
      // Ensure a second edit in the same millisecond cannot reuse the old version.
      updatedAt: new Date(Math.max(now.getTime(), (existing?.updatedAt.getTime() ?? 0) + 1)),
    };
    const [saved] = existing
      ? await transaction
          .update(operations)
          .set(values)
          .where(eq(operations.id, existing.id))
          .returning({ id: operations.id })
      : await transaction
          .insert(operations)
          .values({ ...values, createdById: fresh.id })
          .returning({ id: operations.id });
    if (!saved) throw new OperationAdministrationError("작전을 저장하지 못했습니다.");
    await transaction.insert(auditLogs).values({
      actorId: fresh.id,
      action: existing ? "operation.updated" : "operation.created",
      entityType: "operation",
      entityId: saved.id,
      metadata: {
        seasonId: input.seasonId,
        previousStatus: existing?.status ?? null,
        status: input.status,
      },
    });
    return saved;
  });
}
