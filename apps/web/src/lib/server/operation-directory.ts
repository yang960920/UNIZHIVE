import "server-only";
import {
  accounts,
  and,
  eq,
  getDb,
  memberProfiles,
  operationParticipants,
  operationRoles,
  operations,
  seasonPhases,
  seasons,
  scenarios,
  servers,
  sql,
  users,
} from "@uniz/db";
import {
  canManageOperation,
  canOpenAdmin,
  getScenarioSeasonPhases,
  hasGravityContent,
  type HiveRole,
  type OperationType,
  type RSVPStatus,
  type SeasonStatus,
} from "@uniz/domain";
import { z } from "zod";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import {
  OperationalPolicyError,
  requireOpenOperation,
  requireOpenPartySeason,
  requireOpenSeason,
  requireOperationalActor,
  selectOperationalAccessMode,
} from "../operational-policy";
import {
  getPartyCalendarMonth,
  parsePartyCalendarFilters,
  partyCalendarDayRange,
  PARTY_CALENDAR_PAGE_SIZE,
  type PartyCalendarFilters,
  type PartyCalendarSearchParams,
} from "../party-calendar";
import { mayManageParty } from "../party-admin-policy";
import { getPartyContentOptions } from "../party-content";

export interface PartySeasonOption {
  id: string;
  name: string;
  serverAddress: string;
  scenarioSlug: string;
  status: SeasonStatus;
  gravityContentEnabled: boolean;
  myMembership: boolean;
  canCreate: boolean;
}

export interface OperationDirectorySummary {
  id: string;
  seasonId: string | null;
  title: string;
  type: OperationType;
  contentKey: string | null;
  description: string;
  meetingPoint: string;
  seasonName: string | null;
  startsAt: string;
  endsAt: string | null;
  updatedAt: string;
  capacity: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  goingCount: number;
  maybeCount: number;
  unavailableCount: number;
  myRsvp: RSVPStatus | null;
  myMembership: boolean;
  mayRespond: boolean;
  mayGo: boolean;
  mayMaybe: boolean;
  canCancelParticipation: boolean;
  responseNotice: string;
  timeConflictNotice: string | null;
  canManage: boolean;
}

export interface OperationDirectoryDetail extends OperationDirectorySummary {
  asOf: string;
  season: PartySeasonOption | null;
  canCreate: boolean;
  canManageParticipants: boolean;
  attendees: {
    id: string;
    userId: string;
    displayName: string;
    handle: string | null;
    status: RSVPStatus;
    roleName: string | null;
  }[];
  roles: { id: string; name: string; capacity: number; goingCount: number }[];
}

export interface OperationDirectoryData {
  operations: OperationDirectorySummary[];
  seasons: PartySeasonOption[];
  selectedSeasonId: string | null;
  month: string;
  selectedDay: string | null;
  calendarDays: { date: string; inMonth: boolean; isToday: boolean; operationCount: number }[];
  pagination: { page: number; pageSize: number; totalCount: number; hasNextPage: boolean };
  overflowNotice: string | null;
  filterNotice: string | null;
  canCreate: boolean;
  canManage: boolean;
  asOf: string;
}

type AccessMode = "DEMO" | "PENDING" | "ERROR" | "REAUTH" | "LEFT";
export type OperationDirectoryResult =
  | { mode: AccessMode; retryAfterSeconds?: number }
  | { mode: "LIVE"; role: HiveRole; data: OperationDirectoryData };
export type OperationDirectoryDetailResult =
  | { mode: AccessMode; retryAfterSeconds?: number }
  | { mode: "LIVE"; role: HiveRole; data: OperationDirectoryDetail | null };

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function operationFields(principal: CurrentUser, now: Date) {
  return {
    id: operations.id,
    seasonId: operations.seasonId,
    title: operations.title,
    type: operations.type,
    contentKey: operations.contentKey,
    description: operations.description,
    meetingPoint: operations.meetingPoint,
    startsAt: operations.startsAt,
    endsAt: operations.endsAt,
    updatedAt: operations.updatedAt,
    capacity: operations.capacity,
    status: operations.status,
    createdById: operations.createdById,
    // Scope to this user's indexed RSVP rows. Keep explicit outer table names: Drizzle's
    // single-table SELECT mapping strips qualifications from interpolated column objects.
    timeConflict: sql<boolean>`exists (
      select 1 from operation_participants conflicting_participant
      inner join operations conflicting_operation on conflicting_operation.id = conflicting_participant.operation_id
      where conflicting_participant.user_id = ${principal.id}
        and conflicting_participant.status = 'GOING'
        and conflicting_operation.status = 'SCHEDULED'
        and conflicting_operation.starts_at > ${now.toISOString()}::timestamptz
        and conflicting_operation.id <> "operations"."id"
        and (
          ((conflicting_operation.ends_at is null or "operations"."ends_at" is null)
            and conflicting_operation.starts_at = "operations"."starts_at")
          or (conflicting_operation.ends_at is not null and "operations"."ends_at" is not null
            and conflicting_operation.starts_at < "operations"."ends_at"
            and conflicting_operation.ends_at > "operations"."starts_at")
        )
    )`,
  };
}

async function readSeasonOptions(
  transaction: Transaction,
  principal: CurrentUser,
  detailSeasonId?: string | null,
) {
  if (detailSeasonId === null) return [];
  const rows = await transaction
    .select({
      id: seasons.id,
      name: seasons.name,
      serverAddress: servers.name,
      scenarioSlug: scenarios.slug,
      scenarioId: seasons.scenarioId,
      status: seasons.status,
      approvalStatus: seasons.approvalStatus,
      currentPhaseOrder: seasons.currentPhaseOrder,
      serverType: seasons.serverType,
      startsAt: seasons.startsAt,
      settlementAt: seasons.settlementAt,
      gravityContentEnabled: seasons.gravityContentEnabled,
      trancePhenomenon: seasons.trancePhenomenon,
      myMembership: sql<boolean>`exists (
      select 1 from season_memberships party_membership
      where party_membership.season_id = ${seasons.id}
        and party_membership.user_id = ${principal.id}
        and party_membership.removed_at is null
    )`,
    })
    .from(seasons)
    .innerJoin(servers, eq(servers.id, seasons.serverId))
    .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
    .where(
      and(
        eq(seasons.approvalStatus, "APPROVED"),
        detailSeasonId ? eq(seasons.id, detailSeasonId) : undefined,
      ),
    )
    .orderBy(sql`${seasons.startsAt} DESC`, seasons.id);
  return rows.map((season) => {
    let canCreate = false;
    try {
      requireOpenPartySeason(season, season.myMembership || canOpenAdmin(principal));
      canCreate = true;
    } catch (error) {
      if (!(error instanceof OperationalPolicyError)) throw error;
    }
    return { ...season, canCreate };
  });
}

function publicSeason(
  season: Awaited<ReturnType<typeof readSeasonOptions>>[number],
): PartySeasonOption {
  return {
    id: season.id,
    name: season.name,
    serverAddress: season.serverAddress,
    scenarioSlug: season.scenarioSlug,
    status: season.status,
    gravityContentEnabled: hasGravityContent(season.trancePhenomenon, season.gravityContentEnabled),
    myMembership: season.myMembership,
    canCreate: season.canCreate,
  };
}

async function readDirectory(
  transaction: Transaction,
  principal: CurrentUser,
  filters: PartyCalendarFilters,
  detailId?: string,
) {
  const now = new Date();
  const calendar = getPartyCalendarMonth(filters.month, now);
  const approvedOperation = sql`((${operations.seasonId} is null and ${operations.contentKey} is null) or exists (
    select 1 from seasons visible_season
    where visible_season.id = ${operations.seasonId} and visible_season.approval_status = 'APPROVED'
  ))`;
  const detailRows = detailId
    ? await transaction
        .select(operationFields(principal, now))
        .from(operations)
        .where(and(eq(operations.id, detailId), approvedOperation))
        .limit(1)
    : [];
  const seasonRows = await readSeasonOptions(
    transaction,
    principal,
    detailId ? (detailRows[0]?.seasonId ?? null) : undefined,
  );
  const seasonById = new Map(seasonRows.map((season) => [season.id, season]));
  const selected =
    seasonById.get(filters.seasonId ?? "") ??
    seasonRows.find((season) => season.myMembership && season.status === "ACTIVE") ??
    seasonRows.find((season) => season.myMembership && season.canCreate) ??
    seasonRows.find((season) => season.status === "ACTIVE" || season.status === "PLANNED") ??
    seasonRows[0] ??
    null;
  // Keep historical common operations, while new parties are isolated by exact season ID.
  const scope = selected
    ? sql`(${operations.seasonId} = ${selected.id} or (${operations.seasonId} is null and ${operations.contentKey} is null))`
    : sql`${operations.seasonId} is null and ${operations.contentKey} is null`;
  const gridRange = and(
    scope,
    approvedOperation,
    sql`${operations.startsAt} >= ${calendar.startsAt.toISOString()}::timestamptz`,
    sql`${operations.startsAt} < ${calendar.endsAt.toISOString()}::timestamptz`,
  );
  const listRange = filters.day ? partyCalendarDayRange(filters.day) : calendar;
  const listWhere = and(
    scope,
    approvedOperation,
    sql`${operations.startsAt} >= ${listRange.startsAt.toISOString()}::timestamptz`,
    sql`${operations.startsAt} < ${listRange.endsAt.toISOString()}::timestamptz`,
  );
  const dayKey = sql<string>`to_char(${operations.startsAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
  const counts = detailId
    ? []
    : await transaction
        .select({ date: dayKey, count: sql<number>`count(*)::int` })
        .from(operations)
        .where(gridRange)
        .groupBy(dayKey);
  const [total] = detailId
    ? [{ count: detailRows.length }]
    : await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(operations)
        .where(listWhere);
  const totalCount = total?.count ?? 0;
  const page = Math.min(
    filters.page,
    Math.max(1, Math.ceil(totalCount / PARTY_CALENDAR_PAGE_SIZE)),
  );
  const rows = detailId
    ? detailRows
    : await transaction
        .select(operationFields(principal, now))
        .from(operations)
        .where(listWhere)
        .orderBy(operations.startsAt, operations.id)
        .limit(PARTY_CALENDAR_PAGE_SIZE)
        .offset((page - 1) * PARTY_CALENDAR_PAGE_SIZE);

  const operationIds = sql.join(
    rows.map((row) => sql`${row.id}`),
    sql`, `,
  );
  const countRows = rows.length
    ? await transaction
        .select({
          operationId: operationParticipants.operationId,
          status: operationParticipants.status,
          count: sql<number>`count(*)::int`,
        })
        .from(operationParticipants)
        .where(sql`${operationParticipants.operationId} in (${operationIds})`)
        .groupBy(operationParticipants.operationId, operationParticipants.status)
    : [];
  const ownRows = rows.length
    ? await transaction
        .select({
          operationId: operationParticipants.operationId,
          roleId: operationParticipants.roleId,
          status: operationParticipants.status,
        })
        .from(operationParticipants)
        .where(
          and(
            sql`${operationParticipants.operationId} in (${operationIds})`,
            eq(operationParticipants.userId, principal.id),
          ),
        )
    : [];
  const roleRows = rows.length
    ? await transaction
        .select({
          id: operationRoles.id,
          operationId: operationRoles.operationId,
          name: operationRoles.name,
          capacity: operationRoles.capacity,
        })
        .from(operationRoles)
        .where(sql`${operationRoles.operationId} in (${operationIds})`)
    : [];
  const roleCountRows = rows.length
    ? await transaction
        .select({
          roleId: operationParticipants.roleId,
          count: sql<number>`count(*)::int`,
        })
        .from(operationParticipants)
        .where(
          and(
            sql`${operationParticipants.operationId} in (${operationIds})`,
            eq(operationParticipants.status, "GOING"),
          ),
        )
        .groupBy(operationParticipants.roleId)
    : [];
  const countsByOperation = new Map<
    string,
    { GOING: number; MAYBE: number; UNAVAILABLE: number }
  >();
  for (const row of countRows) {
    const counts = countsByOperation.get(row.operationId) ?? { GOING: 0, MAYBE: 0, UNAVAILABLE: 0 };
    counts[row.status] = row.count;
    countsByOperation.set(row.operationId, counts);
  }
  const ownByOperation = new Map(ownRows.map((row) => [row.operationId, row]));
  const roleById = new Map(roleRows.map((row) => [row.id, row]));
  const countByRole = new Map(roleCountRows.map((row) => [row.roleId, row.count]));
  const legacySeasonIds = [
    ...new Set(rows.filter((row) => !row.contentKey && row.seasonId).map((row) => row.seasonId!)),
  ];
  const phases = legacySeasonIds.length
    ? await transaction
        .select()
        .from(seasonPhases)
        .where(
          sql`${seasonPhases.seasonId} in (${sql.join(
            legacySeasonIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
    : [];
  const summaries = rows.map((operation): OperationDirectorySummary => {
    const counts = countsByOperation.get(operation.id) ?? { GOING: 0, MAYBE: 0, UNAVAILABLE: 0 };
    const own = ownByOperation.get(operation.id);
    const assignedRole = own?.roleId ? roleById.get(own.roleId) : null;
    const season = operation.seasonId ? seasonById.get(operation.seasonId) : null;
    let mayRespond = true;
    let mayGo = true;
    let mayMaybe = true;
    const contentAvailable =
      !operation.contentKey ||
      Boolean(
        season &&
        getPartyContentOptions(season).some((content) => content.key === operation.contentKey),
      );
    let responseNotice = "시작 전까지 참가 응답을 변경할 수 있습니다.";
    try {
      requireOpenOperation(operation, "MAYBE", counts.GOING, own?.status ?? null, now);
      if (operation.seasonId) {
        if (!season) throw new OperationalPolicyError("NOT_FOUND");
        if (operation.contentKey) requireOpenPartySeason(season, season.myMembership);
        else
          requireOpenSeason(
            season,
            getScenarioSeasonPhases(phases, season.id, season.scenarioSlug),
            season.myMembership,
            now,
          );
      }
      try {
        if (!contentAvailable) {
          mayGo = false;
          mayMaybe = false;
          mayRespond = Boolean(own);
          responseNotice =
            "현재 시즌에서 사용할 수 없는 콘텐츠입니다. 기존 참가 응답은 불참으로 변경할 수 있습니다.";
        } else {
          requireOpenOperation(
            operation,
            "GOING",
            counts.GOING,
            own?.status ?? null,
            now,
            assignedRole
              ? {
                  capacity: assignedRole.capacity,
                  goingCount: countByRole.get(assignedRole.id) ?? 0,
                }
              : undefined,
          );
        }
      } catch (error) {
        if (!(error instanceof OperationalPolicyError)) throw error;
        mayGo = false;
        responseNotice = error.message;
      }
    } catch (error) {
      if (!(error instanceof OperationalPolicyError)) throw error;
      mayRespond = false;
      mayGo = false;
      mayMaybe = false;
      responseNotice = error.message;
    }
    return {
      id: operation.id,
      seasonId: operation.seasonId,
      title: operation.title,
      type: operation.type,
      contentKey: operation.contentKey,
      description: operation.description,
      meetingPoint: operation.meetingPoint,
      seasonName: season?.name ?? null,
      startsAt: operation.startsAt.toISOString(),
      endsAt: operation.endsAt?.toISOString() ?? null,
      updatedAt: operation.updatedAt.toISOString(),
      capacity: operation.capacity,
      status: operation.status,
      goingCount: counts.GOING,
      maybeCount: counts.MAYBE,
      unavailableCount: counts.UNAVAILABLE,
      myRsvp: own?.status ?? null,
      myMembership: season?.myMembership ?? false,
      mayRespond,
      mayGo,
      mayMaybe,
      canCancelParticipation: mayRespond && (contentAvailable || Boolean(own)),
      responseNotice,
      timeConflictNotice:
        operation.timeConflict && operation.status === "SCHEDULED" && operation.startsAt > now
          ? "참가 예정인 다른 파티와 시간이 겹칩니다. 참가 전에 일정을 확인해주세요."
          : null,
      canManage: operation.contentKey
        ? Boolean(
            season &&
            (season.status === "PLANNED" || season.status === "ACTIVE") &&
            mayManageParty(principal, operation.createdById, season.myMembership),
          )
        : canOpenAdmin(principal) && canManageOperation(principal, operation),
    };
  });

  let detail: OperationDirectoryDetail | null = null;
  if (detailId && summaries[0]) {
    const attendees = await transaction
      .select({
        id: operationParticipants.id,
        userId: operationParticipants.userId,
        displayName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name}, '멤버')`,
        handle: memberProfiles.handle,
        status: operationParticipants.status,
        roleName: operationRoles.name,
      })
      .from(operationParticipants)
      .innerJoin(users, eq(users.id, operationParticipants.userId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(operationRoles, eq(operationRoles.id, operationParticipants.roleId))
      .where(
        and(
          eq(operationParticipants.operationId, detailId),
          sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
        ),
      )
      .orderBy(operationParticipants.createdAt, operationParticipants.id);
    const summary = summaries[0];
    const season = summary.seasonId ? seasonById.get(summary.seasonId) : null;
    detail = {
      ...summary,
      asOf: now.toISOString(),
      season: season ? publicSeason(season) : null,
      canCreate: season?.canCreate ?? false,
      canManageParticipants:
        canOpenAdmin(principal) &&
        Boolean(
          summary.contentKey &&
          season &&
          (season.status === "PLANNED" || season.status === "ACTIVE") &&
          summary.status === "SCHEDULED" &&
          new Date(summary.startsAt) > now,
        ),
      attendees: attendees.map((attendee) => ({
        ...attendee,
        handle: principal.role === "ADMIN" ? attendee.handle : null,
      })),
      roles: roleRows.map((role) => ({
        id: role.id,
        name: role.name,
        capacity: role.capacity,
        goingCount: countByRole.get(role.id) ?? 0,
      })),
    };
  }
  const countByDate = new Map(counts.map((row) => [row.date, row.count]));
  const data: OperationDirectoryData = {
    operations: summaries,
    seasons: seasonRows.map(publicSeason),
    selectedSeasonId: selected?.id ?? null,
    month: filters.month,
    selectedDay: filters.day,
    calendarDays: calendar.days.map((day) => ({
      ...day,
      operationCount: countByDate.get(day.date) ?? 0,
    })),
    pagination: {
      page,
      pageSize: PARTY_CALENDAR_PAGE_SIZE,
      totalCount,
      hasNextPage: page * PARTY_CALENDAR_PAGE_SIZE < totalCount,
    },
    overflowNotice:
      totalCount > PARTY_CALENDAR_PAGE_SIZE
        ? `${totalCount}개의 일정이 있습니다. 한 페이지에 ${PARTY_CALENDAR_PAGE_SIZE}개씩 표시합니다. 이전·다음 목록으로 다른 일정을 확인하세요.`
        : null,
    filterNotice:
      filters.invalidFields.length || (filters.seasonId && !seasonById.has(filters.seasonId))
        ? "잘못되었거나 표시할 수 없는 선택을 기본 일정으로 변경했습니다."
        : null,
    canCreate: selected?.canCreate ?? false,
    canManage: canOpenAdmin(principal),
    asOf: now.toISOString(),
  };
  return { data, detail };
}

async function readAuthorizedDirectory(input: PartyCalendarSearchParams = {}, detailId?: string) {
  const { user, status, retryAfterSeconds } = await getCurrentAuthState();
  const mode = selectOperationalAccessMode(user, status);
  if (mode !== "LIVE")
    return {
      mode,
      ...(mode === "ERROR" &&
      typeof retryAfterSeconds === "number" &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds >= 0
        ? { retryAfterSeconds }
        : {}),
    };
  if (!user) return { mode: "REAUTH" as const };
  try {
    return await getDb().transaction(
      async (transaction) => {
        const [fresh] = await transaction
          .select({ id: users.id, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.id, user.id))
          .for("share");
        const principal = requireOperationalActor(
          fresh ? { ...fresh, isMock: false } : null,
          "RSVP",
        );
        const [discord] = await transaction
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.userId, principal.id), eq(accounts.provider, "discord")))
          .limit(1);
        if (!discord) return { mode: "REAUTH" as const };
        if (detailId !== undefined && !z.uuid().safeParse(detailId).success)
          return { mode: "LIVE" as const, role: principal.role, data: null, detail: null };
        const result = await readDirectory(
          transaction,
          principal,
          parsePartyCalendarFilters(input),
          detailId,
        );
        return { mode: "LIVE" as const, role: principal.role, ...result };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    return {
      mode: error instanceof OperationalPolicyError ? ("PENDING" as const) : ("ERROR" as const),
    };
  }
}

export async function getOperationDirectory(
  input: PartyCalendarSearchParams = {},
): Promise<OperationDirectoryResult> {
  const result = await readAuthorizedDirectory(input);
  if (result.mode !== "LIVE") return result;
  if (!result.data) return { mode: "ERROR" };
  return { mode: "LIVE", role: result.role, data: result.data };
}

export async function getOperationDirectoryDetail(
  id: string,
): Promise<OperationDirectoryDetailResult> {
  const result = await readAuthorizedDirectory({}, id);
  if (result.mode !== "LIVE") return result;
  return { mode: "LIVE", role: result.role, data: result.detail };
}
