import "server-only";
import { z } from "zod";
import {
  accounts,
  and,
  auditLogs,
  desc,
  eq,
  getDb,
  scenarios,
  seasonMemberships,
  seasonPhases,
  seasons,
  servers,
  sql,
  users,
} from "@uniz/db";
import {
  canViewMemberDirectory,
  getScenarioPhaseTemplate,
  getScenarioSeasonPhases,
  type HiveRole,
  type MigrationStatus,
  type SeasonStatus,
  type SeasonServerType,
  type TrancePhenomenon,
} from "@uniz/domain";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import {
  labelScenario,
  resolveSeasonServerSelection,
  type SeasonServerSelection,
} from "../season-selection";
import type { SeasonRecord } from "./season-administration";
import { nextSeasonVersion } from "../season-admin-policy";
import { OperationalPolicyError, requireOpenMigrationSeason } from "../operational-policy";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type SeasonRow = typeof seasons.$inferSelect;
const AUTHORIZATION_LOCK = 912743110;

export class SeasonParticipationError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "UNAVAILABLE" | "NOT_FOUND" | "CLOSED" | "INVALID",
  ) {
    super(
      {
        FORBIDDEN: "승인된 하이브 멤버만 시즌에 참여할 수 있습니다.",
        UNAVAILABLE: "로그인 연결을 확인한 뒤 다시 시도해주세요.",
        NOT_FOUND: "참여할 시즌을 찾을 수 없습니다.",
        CLOSED: "이 시즌은 현재 참가자를 모집하지 않습니다.",
        INVALID: "시즌을 확인하고 다시 시도해주세요.",
      }[code],
    );
    this.name = "SeasonParticipationError";
  }
}

async function sessionActor(): Promise<CurrentUser> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") throw new SeasonParticipationError("UNAVAILABLE");
  if (status !== "AUTHENTICATED" || !user || user.isMock || !canViewMemberDirectory(user))
    throw new SeasonParticipationError("FORBIDDEN");
  return user;
}

async function freshActor(transaction: Transaction, session: CurrentUser): Promise<CurrentUser> {
  const [actor] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, session.id))
    .for("share");
  if (!actor || !canViewMemberDirectory(actor)) throw new SeasonParticipationError("FORBIDDEN");
  const [discord] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
    .limit(1);
  if (!discord) throw new SeasonParticipationError("FORBIDDEN");
  return { ...actor, isMock: false };
}

export async function getSeasonMember(): Promise<CurrentUser> {
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
    return freshActor(transaction, session);
  });
}

export interface ParticipatingSeason {
  id: string;
  name: string;
  seasonNumber: number;
  scenarioName: string;
  serverName: string;
  region: string;
  status: SeasonStatus;
  startsAt: string;
  settlementAt: string | null;
  joined: boolean;
  participantCount: number;
  currentPhaseOrder: number;
  currentPhaseName: string | null;
  serverType: SeasonServerType;
  trancePhenomenon: TrancePhenomenon;
  migrationOpen: boolean;
}

export interface OwnSeasonRequest {
  id: string;
  name: string;
  serverName: string;
  scenarioName: string;
  serverType: SeasonServerType;
  trancePhenomenon: TrancePhenomenon;
  approvalStatus: "PENDING" | "REJECTED";
  updatedAt: string;
}

export interface SeasonParticipationData {
  role: HiveRole;
  seasons: ParticipatingSeason[];
  requests: OwnSeasonRequest[];
}

function seasonRecord(row: SeasonRow): SeasonRecord {
  return {
    id: row.id,
    seasonNumber: row.seasonNumber,
    name: row.name,
    scenarioId: row.scenarioId,
    serverId: row.serverId,
    status: row.status,
    approvalStatus: row.approvalStatus,
    createdById: row.createdById,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    currentPhaseOrder: row.currentPhaseOrder,
    gravityContentEnabled: row.gravityContentEnabled,
    serverType: row.serverType,
    trancePhenomenon: row.trancePhenomenon,
    migrationOpen: row.migrationOpen,
    startsAt: row.startsAt.toISOString(),
    settlementAt: row.settlementAt?.toISOString() ?? null,
    voteClosesAt: row.voteClosesAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSeasonParticipationData(): Promise<SeasonParticipationData> {
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session);
    const rows = await transaction
      .select({ season: seasons, scenario: scenarios, server: servers })
      .from(seasons)
      .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
      .innerJoin(servers, eq(servers.id, seasons.serverId))
      .where(
        sql`${seasons.approvalStatus} = 'APPROVED' OR (${seasons.createdById} = ${actor.id} AND ${seasons.approvalStatus} IN ('PENDING', 'REJECTED'))`,
      )
      .orderBy(desc(seasons.startsAt), desc(seasons.createdAt));
    const memberships = await transaction
      .select({ seasonId: seasonMemberships.seasonId, userId: seasonMemberships.userId })
      .from(seasonMemberships)
      .innerJoin(users, eq(users.id, seasonMemberships.userId))
      .where(
        sql`${seasonMemberships.removedAt} IS NULL AND ${users.role} IN ('MEMBER', 'OFFICER', 'ADMIN')`,
      );
    return {
      role: actor.role,
      seasons: rows
        .filter(({ season }) => season.approvalStatus === "APPROVED")
        .map(({ season, scenario, server }) => {
          const participants = memberships.filter(
            (membership) => membership.seasonId === season.id,
          );
          return {
            id: season.id,
            name: season.name,
            seasonNumber: season.seasonNumber,
            scenarioName: labelScenario(scenario),
            serverName: server.name,
            region: server.region,
            status: season.status,
            serverType: season.serverType,
            trancePhenomenon: season.trancePhenomenon,
            migrationOpen: season.migrationOpen,
            startsAt: season.startsAt.toISOString(),
            settlementAt: season.settlementAt?.toISOString() ?? null,
            joined: participants.some((membership) => membership.userId === actor.id),
            participantCount: participants.length,
            currentPhaseOrder: season.currentPhaseOrder,
            currentPhaseName:
              season.serverType === "PERMANENT"
                ? "휴식기"
                : (getScenarioPhaseTemplate(scenario.slug)?.[season.currentPhaseOrder - 1] ?? null),
          };
        }),
      requests: rows
        .filter(
          ({ season }) => season.createdById === actor.id && season.approvalStatus !== "APPROVED",
        )
        .map(({ season, scenario, server }) => ({
          id: season.id,
          name: season.name,
          serverName: server.name,
          scenarioName: labelScenario(scenario),
          serverType: season.serverType,
          trancePhenomenon: season.trancePhenomenon,
          approvalStatus: season.approvalStatus as "PENDING" | "REJECTED",
          updatedAt: season.updatedAt.toISOString(),
        })),
    };
  });
}

export interface PublicSeasonDetail {
  role: HiveRole;
  season: ParticipatingSeason & { scenarioSlug: string; updatedAt: string };
  phases: {
    id: string;
    order: number;
    name: string;
    startsAt: string | null;
    endsAt: string | null;
  }[];
  ownMigrationStatus: MigrationStatus | null;
  migrationCounts: Record<MigrationStatus, number>;
  mayUpdateMigration: boolean;
  finalPhase: boolean;
}

/** A selected season never borrows the global current season's participation or phases. */
export async function getPublicSeasonDetail(id: string): Promise<PublicSeasonDetail | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session);
    const [row] = await transaction
      .select({ season: seasons, scenario: scenarios, server: servers })
      .from(seasons)
      .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
      .innerJoin(servers, eq(servers.id, seasons.serverId))
      .where(and(eq(seasons.id, id), eq(seasons.approvalStatus, "APPROVED")));
    if (!row) return null;
    const template = getScenarioPhaseTemplate(row.scenario.slug);
    const savedPhases = await transaction
      .select()
      .from(seasonPhases)
      .where(eq(seasonPhases.seasonId, id))
      .orderBy(seasonPhases.order);
    const visiblePhases = getScenarioSeasonPhases(savedPhases, id, row.scenario.slug);
    const memberships = await transaction
      .select({
        userId: seasonMemberships.userId,
        migrationStatus: seasonMemberships.migrationStatus,
      })
      .from(seasonMemberships)
      .innerJoin(users, eq(users.id, seasonMemberships.userId))
      .where(
        and(
          eq(seasonMemberships.seasonId, id),
          sql`${seasonMemberships.removedAt} IS NULL AND ${users.role} IN ('MEMBER', 'OFFICER', 'ADMIN')`,
        ),
      );
    const own = memberships.find((membership) => membership.userId === actor.id);
    const phaseCount = template?.length ?? visiblePhases.at(-1)?.order ?? 0;
    const finalPhase =
      row.season.serverType !== "PERMANENT" &&
      phaseCount > 0 &&
      row.season.currentPhaseOrder === phaseCount;
    let mayUpdateMigration = false;
    try {
      requireOpenMigrationSeason(row.season, visiblePhases, Boolean(own), new Date());
      mayUpdateMigration = true;
    } catch (error) {
      if (!(error instanceof OperationalPolicyError)) throw error;
    }
    const migrationCounts: Record<MigrationStatus, number> = {
      UNDECIDED: 0,
      JOINING: 0,
      PRE_REGISTERED: 0,
      READY: 0,
      MIGRATED: 0,
    };
    for (const membership of memberships) migrationCounts[membership.migrationStatus] += 1;
    return {
      role: actor.role,
      season: {
        id: row.season.id,
        name: row.season.name,
        seasonNumber: row.season.seasonNumber,
        scenarioName: labelScenario(row.scenario),
        scenarioSlug: row.scenario.slug,
        serverName: row.server.name,
        region: row.server.region,
        status: row.season.status,
        serverType: row.season.serverType,
        trancePhenomenon: row.season.trancePhenomenon,
        migrationOpen: row.season.migrationOpen,
        startsAt: row.season.startsAt.toISOString(),
        settlementAt: row.season.settlementAt?.toISOString() ?? null,
        updatedAt: row.season.updatedAt.toISOString(),
        joined: Boolean(own),
        participantCount: memberships.length,
        currentPhaseOrder: row.season.currentPhaseOrder,
        currentPhaseName:
          row.season.serverType === "PERMANENT"
            ? "휴식기"
            : (template?.[row.season.currentPhaseOrder - 1] ??
              visiblePhases.find((phase) => phase.order === row.season.currentPhaseOrder)?.name ??
              null),
      },
      phases:
        row.season.serverType === "PERMANENT"
          ? []
          : template
            ? template.map((name, index) => {
                const saved = visiblePhases.find((phase) => phase.order === index + 1);
                return {
                  id: saved?.id ?? `${id}-phase-${index + 1}`,
                  name,
                  order: index + 1,
                  startsAt: saved?.startsAt?.toISOString() ?? null,
                  endsAt: saved?.endsAt?.toISOString() ?? null,
                };
              })
            : visiblePhases.map((phase) => ({
                id: phase.id,
                name: phase.name,
                order: phase.order,
                startsAt: phase.startsAt?.toISOString() ?? null,
                endsAt: phase.endsAt?.toISOString() ?? null,
              })),
      ownMigrationStatus: own?.migrationStatus ?? null,
      migrationCounts,
      mayUpdateMigration,
      finalPhase,
    };
  });
}

export async function getOwnSeasonRequest(id: string): Promise<{
  season: SeasonRecord;
  selection: SeasonServerSelection | null;
} | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session);
    const [row] = await transaction
      .select({ season: seasons, scenario: scenarios, server: servers })
      .from(seasons)
      .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
      .innerJoin(servers, eq(servers.id, seasons.serverId))
      .where(
        and(
          eq(seasons.id, id),
          eq(seasons.createdById, actor.id),
          sql`${seasons.approvalStatus} IN ('PENDING', 'REJECTED')`,
        ),
      );
    if (!row) return null;
    return {
      season: seasonRecord(row.season),
      selection: resolveSeasonServerSelection(
        { scenarios: [row.scenario], servers: [row.server] },
        row.server.id,
      ),
    };
  });
}

/** The account, role and season state are checked again in the same locked transaction as enrollment. */
export async function joinSeason(value: unknown): Promise<{ joined: boolean }> {
  const parsed = z.object({ seasonId: z.string().uuid() }).strict().safeParse(value);
  if (!parsed.success) throw new SeasonParticipationError("INVALID");
  const session = await sessionActor();
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(${AUTHORIZATION_LOCK})`);
    const actor = await freshActor(transaction, session);
    const [season] = await transaction
      .select()
      .from(seasons)
      .where(eq(seasons.id, parsed.data.seasonId))
      .for("update");
    if (!season || season.approvalStatus !== "APPROVED")
      throw new SeasonParticipationError("NOT_FOUND");
    if (season.status !== "PLANNED" && season.status !== "ACTIVE")
      throw new SeasonParticipationError("CLOSED");
    const [existing] = await transaction
      .select()
      .from(seasonMemberships)
      .where(and(eq(seasonMemberships.seasonId, season.id), eq(seasonMemberships.userId, actor.id)))
      .for("update");
    if (existing && !existing.removedAt) return { joined: true };
    if (existing) {
      await transaction
        .update(seasonMemberships)
        .set({
          removedAt: null,
          removedById: null,
          migrationStatus: "UNDECIDED",
          updatedAt: nextSeasonVersion(existing.updatedAt),
        })
        .where(eq(seasonMemberships.id, existing.id));
    } else {
      await transaction.insert(seasonMemberships).values({ seasonId: season.id, userId: actor.id });
    }
    await transaction
      .update(seasons)
      .set({ updatedAt: nextSeasonVersion(season.updatedAt) })
      .where(eq(seasons.id, season.id));
    await transaction.insert(auditLogs).values({
      actorId: actor.id,
      action: "season.participation.joined",
      entityType: "season",
      entityId: season.id,
      metadata: { restored: Boolean(existing) },
    });
    return { joined: true };
  });
}
