import "server-only";
import { z } from "zod";
import {
  accounts,
  and,
  auditLogs,
  desc,
  eq,
  getDb,
  memberProfiles,
  operationParticipants,
  operations,
  scenarios,
  seasonMemberships,
  seasonPhases,
  seasons,
  seasonVoteCandidates,
  seasonVotes,
  servers,
  sql,
  users,
} from "@uniz/db";
import {
  canManageSeason,
  canViewMemberDirectory,
  getScenarioPhaseTemplate,
  hasGravityContent,
  SEASON_SERVER_TYPES,
  TRANCE_PHENOMENA,
  type HiveRole,
  type MigrationStatus,
  type SeasonStatus,
  type SeasonServerType,
  type TrancePhenomenon,
} from "@uniz/domain";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import { formatScenarioServerName, getScenarioPreset } from "../scenario-presets";
import {
  assertPhaseEdit,
  assertPhaseSchedules,
  assertSeasonIdentity,
  assertSeasonLifecycle,
  assertSeasonMutable,
  assertSeasonSchedule,
  assertSeasonVersion,
  nextSeasonVersion,
  nextSeasonPhaseOrder,
  requireSeasonAdministrator,
  requireSeasonMember,
  SeasonAdministrationError,
  seasonAdministrationSchema,
  type SavePhaseInput,
  type SaveSeasonInput,
  type SaveSeasonSetupInput,
  type SeasonAdministrationMutation,
} from "../season-admin-policy";

export { SeasonAdministrationError } from "../season-admin-policy";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function requireCurrentSeasonAdministrator(): Promise<CurrentUser> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") throw new SeasonAdministrationError("UNAVAILABLE");
  return requireSeasonAdministrator(user);
}
type SeasonRow = typeof seasons.$inferSelect;
type PhaseRow = typeof seasonPhases.$inferSelect;
const AUTHORIZATION_LOCK = 912743110;

export interface ScenarioOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}
export interface ServerOption {
  id: string;
  scenarioId: string;
  name: string;
  region: string;
}
export interface ApprovedMemberOption {
  id: string;
  name: string;
  handle: string | null;
  role: HiveRole;
}
export interface SeasonRecord {
  id: string;
  seasonNumber: number;
  name: string;
  scenarioId: string;
  serverId: string;
  status: SeasonStatus;
  startsAt: string;
  settlementAt: string | null;
  voteClosesAt: string | null;
  updatedAt: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  createdById: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  currentPhaseOrder: number;
  gravityContentEnabled: boolean;
  serverType: SeasonServerType;
  trancePhenomenon: TrancePhenomenon;
  migrationOpen: boolean;
}
export interface SeasonSummary extends SeasonRecord {
  scenarioName: string;
  serverName: string;
  memberCount: number;
  phaseCount: number;
  createdByName: string | null;
  region: string;
}
export interface PhaseRecord {
  id: string;
  seasonId: string;
  name: string;
  order: number;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}
export interface CandidateRecord {
  id: string;
  scenarioId: string;
  label: string;
}
export interface SeasonAdminData {
  scenarios: ScenarioOption[];
  servers: ServerOption[];
  seasons: SeasonSummary[];
  approvedMembers: ApprovedMemberOption[];
}
export interface SeasonAdminDetail {
  season: SeasonRecord;
  phases: PhaseRecord[];
  currentPhase: PhaseRecord | null;
  candidates: CandidateRecord[];
  enrolledMemberIds: string[];
  environmentHistory: {
    id: string;
    changedAt: string;
    previousServerType: SeasonServerType | null;
    previousTrancePhenomenon: TrancePhenomenon | null;
    serverType: SeasonServerType;
    trancePhenomenon: TrancePhenomenon;
  }[];
  memberships: {
    id: string;
    userId: string;
    name: string;
    handle: string | null;
    migrationStatus: MigrationStatus;
    updatedAt: string;
  }[];
}

function seasonDto(row: SeasonRow): SeasonRecord {
  return {
    id: row.id,
    seasonNumber: row.seasonNumber,
    name: row.name,
    scenarioId: row.scenarioId,
    serverId: row.serverId,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    settlementAt: row.settlementAt?.toISOString() ?? null,
    voteClosesAt: row.voteClosesAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    approvalStatus: row.approvalStatus,
    createdById: row.createdById,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    currentPhaseOrder: row.currentPhaseOrder,
    gravityContentEnabled: row.gravityContentEnabled,
    serverType: row.serverType,
    trancePhenomenon: row.trancePhenomenon,
    migrationOpen: row.migrationOpen,
  };
}

function phaseDto(row: PhaseRow): PhaseRecord {
  return {
    id: row.id,
    seasonId: row.seasonId,
    name: row.name,
    order: row.order,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireFreshActor(
  transaction: Transaction,
  sessionActor: CurrentUser,
  lock: "update" | "share",
  allowMember = false,
): Promise<CurrentUser> {
  const [fresh] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, sessionActor.id))
    .for(lock);
  const actor = (allowMember ? requireSeasonMember : requireSeasonAdministrator)(
    fresh ? { ...fresh, isMock: false } : null,
  );
  const [discord] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
    .limit(1);
  if (!discord) throw new SeasonAdministrationError("FORBIDDEN");
  return actor;
}

async function lockSeason(
  transaction: Transaction,
  id: string,
  allowMetadata = false,
): Promise<SeasonRow> {
  const [season] = await transaction.select().from(seasons).where(eq(seasons.id, id)).for("update");
  if (!season) throw new SeasonAdministrationError("NOT_FOUND");
  if (!allowMetadata) {
    assertSeasonMutable(season.status);
    if (season.approvalStatus !== "APPROVED") throw new SeasonAdministrationError("APPROVAL");
  }
  return season;
}

async function recordAudit(
  transaction: Transaction,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await transaction.insert(auditLogs).values({ actorId, action, entityType, entityId, metadata });
}

async function touchSeason(transaction: Transaction, season: SeasonRow): Promise<void> {
  await transaction
    .update(seasons)
    .set({ updatedAt: nextSeasonVersion(season.updatedAt) })
    .where(eq(seasons.id, season.id));
}

export async function getSeasonAdminData(): Promise<SeasonAdminData> {
  const actor = await requireCurrentSeasonAdministrator();
  return getDb().transaction(
    async (transaction) => {
      const principal = await requireFreshActor(transaction, actor, "share");
      const catalog = await transaction
        .select({
          id: scenarios.id,
          slug: scenarios.slug,
          name: scenarios.name,
          description: scenarios.description,
        })
        .from(scenarios)
        .orderBy(scenarios.name);
      const serverRows = await transaction
        .select({
          id: servers.id,
          scenarioId: servers.scenarioId,
          name: servers.name,
          region: servers.region,
        })
        .from(servers)
        .orderBy(servers.name);
      const seasonRows = await transaction
        .select()
        .from(seasons)
        .orderBy(desc(seasons.seasonNumber));
      const phaseRows = await transaction
        .select({ seasonId: seasonPhases.seasonId })
        .from(seasonPhases);
      const memberships = await transaction
        .select({ seasonId: seasonMemberships.seasonId })
        .from(seasonMemberships)
        .where(sql`${seasonMemberships.removedAt} is null`);
      const authors = await transaction
        .select({ id: users.id, name: users.name, displayName: memberProfiles.displayName })
        .from(users)
        .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id));
      const members =
        principal.role === "ADMIN"
          ? await transaction
              .select({
                id: users.id,
                name: users.name,
                role: users.role,
                handle: memberProfiles.handle,
                displayName: memberProfiles.displayName,
              })
              .from(users)
              .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
              .where(sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`)
              .orderBy(users.name)
          : [];
      return {
        scenarios: catalog,
        servers: serverRows,
        seasons: seasonRows.map((season) => ({
          ...seasonDto(season),
          scenarioName:
            catalog.find((scenario) => scenario.id === season.scenarioId)?.name ??
            "시나리오 정보 없음",
          serverName:
            serverRows.find((server) => server.id === season.serverId)?.name ?? "서버 정보 없음",
          region: serverRows.find((server) => server.id === season.serverId)?.region ?? "",
          createdByName:
            authors.find((author) => author.id === season.createdById)?.displayName ??
            authors.find((author) => author.id === season.createdById)?.name ??
            null,
          phaseCount:
            getScenarioPhaseTemplate(
              catalog.find((scenario) => scenario.id === season.scenarioId)?.slug ?? "",
            )?.length ?? phaseRows.filter((phase) => phase.seasonId === season.id).length,
          memberCount: memberships.filter((membership) => membership.seasonId === season.id).length,
        })),
        approvedMembers: members.map((member) => ({
          id: member.id,
          name: member.displayName ?? member.name,
          handle: member.handle,
          role: member.role,
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

export async function getSeasonAdminDetail(id: string): Promise<SeasonAdminDetail | null> {
  const actor = await requireCurrentSeasonAdministrator();
  // A route parameter is untrusted even when only linked from an authorized list.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    return null;
  return getDb().transaction(
    async (transaction) => {
      const principal = await requireFreshActor(transaction, actor, "share");
      const [season] = await transaction.select().from(seasons).where(eq(seasons.id, id)).limit(1);
      if (!season) return null;
      const phases = await transaction
        .select()
        .from(seasonPhases)
        .where(eq(seasonPhases.seasonId, id))
        .orderBy(seasonPhases.order);
      const [scenario] = await transaction
        .select({ slug: scenarios.slug })
        .from(scenarios)
        .where(eq(scenarios.id, season.scenarioId));
      const template = getScenarioPhaseTemplate(scenario?.slug ?? "");
      const displayedPhases =
        season.serverType === "PERMANENT"
          ? []
          : template
            ? phases.filter((phase) => phase.order >= 1 && phase.order <= template.length)
            : phases;
      const candidates = await transaction
        .select({
          id: seasonVoteCandidates.id,
          scenarioId: seasonVoteCandidates.scenarioId,
          label: seasonVoteCandidates.label,
        })
        .from(seasonVoteCandidates)
        .where(eq(seasonVoteCandidates.seasonId, id))
        .orderBy(seasonVoteCandidates.label);
      const memberships = await transaction
        .select({
          id: seasonMemberships.id,
          userId: seasonMemberships.userId,
          migrationStatus: seasonMemberships.migrationStatus,
          updatedAt: seasonMemberships.updatedAt,
          name: users.name,
          displayName: memberProfiles.displayName,
          handle: memberProfiles.handle,
        })
        .from(seasonMemberships)
        .innerJoin(users, eq(users.id, seasonMemberships.userId))
        .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
        .where(and(eq(seasonMemberships.seasonId, id), sql`${seasonMemberships.removedAt} is null`))
        .orderBy(users.name);
      const environmentChanges = await transaction
        .select({ id: auditLogs.id, createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, "season"),
            eq(auditLogs.entityId, id),
            eq(auditLogs.action, "season.environment.changed"),
          ),
        )
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
      const environmentSchema = z.object({
        serverType: z.enum(SEASON_SERVER_TYPES),
        trancePhenomenon: z.enum(TRANCE_PHENOMENA),
      });
      return {
        season: seasonDto(season),
        phases: displayedPhases.map(phaseDto),
        currentPhase: displayedPhases.find((phase) => phase.order === season.currentPhaseOrder)
          ? phaseDto(displayedPhases.find((phase) => phase.order === season.currentPhaseOrder)!)
          : null,
        candidates,
        enrolledMemberIds: memberships.map((membership) => membership.userId),
        environmentHistory: environmentChanges.flatMap((change) => {
          const next = environmentSchema.safeParse(change.metadata.next);
          const previous = environmentSchema.nullable().safeParse(change.metadata.previous);
          if (!next.success || !previous.success) return [];
          if (
            previous.data &&
            previous.data.serverType === next.data.serverType &&
            previous.data.trancePhenomenon === next.data.trancePhenomenon
          )
            return [];
          return [
            {
              id: change.id,
              changedAt: change.createdAt.toISOString(),
              previousServerType: previous.data?.serverType ?? null,
              previousTrancePhenomenon: previous.data?.trancePhenomenon ?? null,
              ...next.data,
            },
          ];
        }),
        memberships: memberships.map((membership) => ({
          id: membership.id,
          userId: membership.userId,
          name: membership.displayName ?? membership.name,
          handle: principal.role === "ADMIN" ? membership.handle : null,
          migrationStatus: membership.migrationStatus,
          updatedAt: membership.updatedAt.toISOString(),
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

async function saveSeason(
  transaction: Transaction,
  actor: CurrentUser,
  input: SaveSeasonInput,
  options: { unified?: boolean; approvalStatus?: SeasonRecord["approvalStatus"] } = {},
): Promise<string> {
  const previous = input.id
    ? await lockSeason(transaction, input.id, Boolean(options.unified))
    : null;
  if (previous) assertSeasonVersion(input.expectedUpdatedAt, previous.updatedAt);
  const serverType = input.serverType ?? previous?.serverType ?? "SEASONAL";
  const trancePhenomenon = input.trancePhenomenon ?? previous?.trancePhenomenon ?? "UNKNOWN";
  const migrationOpen =
    serverType === "PERMANENT" ? (input.migrationOpen ?? previous?.migrationOpen ?? false) : false;
  if (serverType === "PERMANENT" && input.settlementAt)
    throw new SeasonAdministrationError("PERMANENT_SETTLEMENT");
  if (input.migrationOpen === true && serverType !== "PERMANENT")
    throw new SeasonAdministrationError("INVALID_INPUT");
  if (migrationOpen !== (previous?.migrationOpen ?? false)) {
    if (actor.role !== "ADMIN") throw new SeasonAdministrationError("FORBIDDEN");
    if (
      migrationOpen &&
      (!previous || previous.approvalStatus !== "APPROVED" || previous.status === "ARCHIVED")
    )
      throw new SeasonAdministrationError("APPROVAL");
  }
  const [server] = await transaction
    .select({ id: servers.id, slug: scenarios.slug })
    .from(servers)
    .innerJoin(scenarios, eq(scenarios.id, servers.scenarioId))
    .where(and(eq(servers.id, input.serverId), eq(servers.scenarioId, input.scenarioId)))
    .limit(1);
  if (!server) throw new SeasonAdministrationError("SERVER_MISMATCH");
  const sameNumbers = await transaction
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.seasonNumber, input.seasonNumber),
        eq(seasons.scenarioId, input.scenarioId),
        serverType === "UNKNOWN"
          ? undefined
          : sql`${seasons.serverType} in (${serverType}, 'UNKNOWN')`,
      ),
    );
  if (sameNumbers.some((season) => season.id !== previous?.id))
    throw new SeasonAdministrationError("DUPLICATE");
  const phases = previous
    ? await transaction.select().from(seasonPhases).where(eq(seasonPhases.seasonId, previous.id))
    : [];
  const template = getScenarioPhaseTemplate(server.slug);
  const effectivePhases = template
    ? template.map((_name, index) => ({
        id: phases.find((phase) => phase.order === index + 1)?.id ?? `template-${index + 1}`,
        order: index + 1,
        startsAt: null,
        endsAt: null,
      }))
    : phases;
  const scenarioChanged = Boolean(previous && previous.scenarioId !== input.scenarioId);
  const currentPhaseOrder = scenarioChanged ? 1 : (previous?.currentPhaseOrder ?? 1);
  const associatedOperations = previous
    ? await transaction
        .select({
          startsAt: operations.startsAt,
          endsAt: operations.endsAt,
          status: operations.status,
        })
        .from(operations)
        .where(eq(operations.seasonId, previous.id))
    : [];
  const memberships = previous
    ? await transaction
        .select({ id: seasonMemberships.id })
        .from(seasonMemberships)
        .where(eq(seasonMemberships.seasonId, previous.id))
        .limit(1)
    : [];
  const ballots = previous
    ? await transaction
        .select({ createdAt: seasonVotes.createdAt, updatedAt: seasonVotes.updatedAt })
        .from(seasonVotes)
        .where(eq(seasonVotes.seasonId, previous.id))
    : [];
  const candidates = previous
    ? await transaction
        .select({ id: seasonVoteCandidates.id })
        .from(seasonVoteCandidates)
        .where(eq(seasonVoteCandidates.seasonId, previous.id))
    : [];
  if (previous && !options.unified)
    assertSeasonIdentity(
      previous,
      input,
      memberships.length > 0 || associatedOperations.length > 0 || ballots.length > 0,
    );
  const schedule = {
    startsAt: new Date(input.startsAt),
    settlementAt: input.settlementAt ? new Date(input.settlementAt) : null,
    voteClosesAt: input.voteClosesAt ? new Date(input.voteClosesAt) : null,
  };
  const now = new Date();
  assertSeasonSchedule(
    schedule,
    effectivePhases,
    associatedOperations,
    ballots.flatMap((ballot) => [ballot.createdAt, ballot.updatedAt]),
    {
      candidateCount: candidates.length,
      previousVoteClosesAt: previous?.voteClosesAt ?? null,
      now,
    },
  );
  // The shared advisory lock serializes the global current-season decision across all administrators.
  const currentSeasons = await transaction
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      sql`${seasons.status} in ('ACTIVE', 'SETTLEMENT') and ${seasons.approvalStatus} = 'APPROVED'`,
    );
  assertSeasonLifecycle(previous?.status ?? null, input.status, schedule, effectivePhases, {
    otherCurrentSeason: currentSeasons.some((season) => season.id !== previous?.id),
    scheduledOperations: associatedOperations.some((operation) => operation.status === "SCHEDULED"),
    now,
    allowArchivedMetadata: options.unified,
    allowExistingStatusMetadata: options.unified,
    serverType,
    ...(template ? { currentPhaseOrder } : {}),
  });
  const values = {
    seasonNumber: input.seasonNumber,
    name: input.name,
    scenarioId: input.scenarioId,
    serverId: input.serverId,
    status: input.status,
    currentPhaseOrder,
    serverType,
    trancePhenomenon,
    migrationOpen,
    gravityContentEnabled: hasGravityContent(
      trancePhenomenon,
      input.gravityContentEnabled ?? previous?.gravityContentEnabled ?? false,
    ),
    ...schedule,
    updatedAt: previous ? nextSeasonVersion(previous.updatedAt, now) : now,
    approvalStatus: options.approvalStatus ?? previous?.approvalStatus ?? "APPROVED",
    createdById: previous ? previous.createdById : actor.id,
    ...(options.approvalStatus === "PENDING" ? { reviewedById: null, reviewedAt: null } : {}),
  };
  const [saved] = previous
    ? await transaction
        .update(seasons)
        .set(values)
        .where(eq(seasons.id, previous.id))
        .returning({ id: seasons.id })
    : await transaction.insert(seasons).values(values).returning({ id: seasons.id });
  if (!saved) throw new SeasonAdministrationError("NOT_FOUND");
  if (template)
    await synchronizeFixedPhases(
      transaction,
      actor,
      saved.id,
      template,
      phases,
      scenarioChanged,
      previous?.currentPhaseOrder ?? null,
    );
  await recordAudit(
    transaction,
    actor.id,
    previous ? "season.updated" : "season.created",
    "season",
    saved.id,
    {
      previousStatus: previous?.status ?? null,
      nextStatus: input.status,
      changedFields: [
        "seasonNumber",
        "name",
        "scenarioId",
        "serverId",
        "status",
        "startsAt",
        "settlementAt",
        "voteClosesAt",
      ],
    },
  );
  if (
    !previous ||
    previous.serverType !== serverType ||
    previous.trancePhenomenon !== trancePhenomenon ||
    previous.migrationOpen !== migrationOpen
  ) {
    await recordAudit(transaction, actor.id, "season.environment.changed", "season", saved.id, {
      previous: previous
        ? {
            serverType: previous.serverType,
            trancePhenomenon: previous.trancePhenomenon,
            migrationOpen: previous.migrationOpen,
          }
        : null,
      next: { serverType, trancePhenomenon, migrationOpen },
    });
  }
  return saved.id;
}

async function synchronizeFixedPhases(
  transaction: Transaction,
  actor: CurrentUser,
  seasonId: string,
  template: readonly string[],
  previous: readonly PhaseRow[],
  scenarioChanged: boolean,
  previousOrder: number | null,
): Promise<void> {
  let changed = false;
  for (const [index, name] of template.entries()) {
    const order = index + 1;
    const existing = previous.find((phase) => phase.order === order);
    if (!existing) {
      await transaction
        .insert(seasonPhases)
        .values({ seasonId, name, order, startsAt: null, endsAt: null });
      changed = true;
    } else if (existing.name !== name) {
      await transaction
        .update(seasonPhases)
        .set({ name, updatedAt: nextSeasonVersion(existing.updatedAt) })
        .where(eq(seasonPhases.id, existing.id));
      changed = true;
    }
  }
  if (changed || scenarioChanged) {
    await recordAudit(
      transaction,
      actor.id,
      scenarioChanged ? "season.phases.reconfigured" : "season.phases.initialized",
      "season",
      seasonId,
      {
        previousPhaseOrder: previousOrder,
        currentPhaseOrder: scenarioChanged ? 1 : (previousOrder ?? 1),
        previousPhases: previous.map((phase) => ({ order: phase.order, name: phase.name })),
        phases: template.map((name, index) => ({ order: index + 1, name })),
      },
    );
  }
}

async function resolveScenarioServer(
  transaction: Transaction,
  actor: CurrentUser,
  input: Pick<
    Extract<SeasonAdministrationMutation, { action: "REGISTER_SERVER" }>,
    "scenarioKey" | "serverNumber" | "region"
  > & { serverType?: SeasonServerType },
  reuseExisting: boolean,
  seasonId?: string,
  updateRegion = false,
): Promise<{ scenarioId: string; id: string }> {
  const preset = getScenarioPreset(input.scenarioKey);
  if (!preset) throw new SeasonAdministrationError("INVALID_INPUT");
  let [scenario] = await transaction
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(eq(scenarios.slug, preset.slug))
    .limit(1);
  if (!scenario) {
    [scenario] = await transaction
      .insert(scenarios)
      .values({ slug: preset.slug, name: preset.label })
      .returning({ id: scenarios.id });
    if (!scenario) throw new SeasonAdministrationError("NOT_FOUND");
    await recordAudit(transaction, actor.id, "scenario.created", "scenario", scenario.id, {
      changedFields: ["slug", "name"],
    });
  }
  // Reuse the canonical identity; another season's server metadata is never rewritten.
  const name = formatScenarioServerName(input.scenarioKey, input.serverNumber);
  const [existing] = await transaction
    .select({ id: servers.id, region: servers.region })
    .from(servers)
    .where(and(eq(servers.scenarioId, scenario.id), eq(servers.name, name)))
    .limit(1);
  if (existing) {
    if (!reuseExisting) throw new SeasonAdministrationError("DUPLICATE");
    const assigned = await transaction
      .select({ id: seasons.id, serverType: seasons.serverType })
      .from(seasons)
      .where(eq(seasons.serverId, existing.id));
    if (
      assigned.some(
        (season) =>
          season.id !== seasonId &&
          (season.serverType === (input.serverType ?? "SEASONAL") ||
            season.serverType === "UNKNOWN" ||
            input.serverType === "UNKNOWN"),
      )
    )
      throw new SeasonAdministrationError("DUPLICATE");
    if (existing.region !== input.region) {
      if (assigned.some((season) => season.id !== seasonId))
        throw new SeasonAdministrationError("SERVER_REGION_MISMATCH");
      if (!updateRegion) throw new SeasonAdministrationError("SERVER_REGION_MISMATCH");
      await transaction
        .update(servers)
        .set({ region: input.region })
        .where(eq(servers.id, existing.id));
      await recordAudit(transaction, actor.id, "server.updated", "server", existing.id, {
        changedFields: ["region"],
      });
    }
    return { scenarioId: scenario.id, id: existing.id };
  }
  const [saved] = await transaction
    .insert(servers)
    .values({ scenarioId: scenario.id, name, region: input.region })
    .returning({ id: servers.id });
  if (!saved) throw new SeasonAdministrationError("NOT_FOUND");
  await recordAudit(transaction, actor.id, "server.created", "server", saved.id, {
    scenarioId: scenario.id,
    changedFields: ["name", "region"],
  });
  return { scenarioId: scenario.id, id: saved.id };
}

async function saveSeasonSetup(
  transaction: Transaction,
  actor: CurrentUser,
  input: SaveSeasonSetupInput,
): Promise<{ id: string; approvalStatus: SeasonRecord["approvalStatus"] }> {
  const previous =
    input.action === "SAVE_SEASON_SETUP" && input.id
      ? await lockSeason(transaction, input.id, true)
      : null;
  if (previous && input.action === "SAVE_SEASON_SETUP")
    assertSeasonVersion(input.expectedUpdatedAt, previous.updatedAt);
  const manages = canManageSeason(actor);
  if (!manages) {
    if (previous && (previous.createdById !== actor.id || previous.approvalStatus === "APPROVED"))
      throw new SeasonAdministrationError("FORBIDDEN");
    if (
      input.action === "SAVE_SEASON_SETUP" &&
      ((input.status && input.status !== "PLANNED") || input.voteClosesAt)
    )
      throw new SeasonAdministrationError("FORBIDDEN");
  }
  const status =
    input.action === "SAVE_SEASON_SETUP"
      ? (input.status ?? previous?.status ?? "PLANNED")
      : "PLANNED";
  const approvalStatus = manages ? (previous?.approvalStatus ?? "APPROVED") : "PENDING";
  if (approvalStatus !== "APPROVED" && status !== "PLANNED")
    throw new SeasonAdministrationError("APPROVAL");
  const serverType = input.serverType ?? previous?.serverType ?? "SEASONAL";
  const server = await resolveScenarioServer(
    transaction,
    actor,
    { ...input, serverType },
    true,
    previous?.id,
    true,
  );
  const id = await saveSeason(
    transaction,
    actor,
    {
      action: "SAVE_SEASON",
      ...(previous && input.action === "SAVE_SEASON_SETUP"
        ? { id: previous.id, expectedUpdatedAt: input.expectedUpdatedAt }
        : {}),
      seasonNumber: Number(input.serverNumber),
      name: input.name,
      scenarioId: server.scenarioId,
      serverId: server.id,
      status,
      startsAt: input.startsAt,
      settlementAt: input.settlementAt,
      gravityContentEnabled:
        input.gravityContentEnabled ?? previous?.gravityContentEnabled ?? false,
      serverType,
      trancePhenomenon: input.trancePhenomenon ?? previous?.trancePhenomenon ?? "UNKNOWN",
      migrationOpen: input.migrationOpen,
      voteClosesAt:
        input.action === "SAVE_SEASON_SETUP"
          ? input.voteClosesAt === undefined
            ? (previous?.voteClosesAt?.toISOString() ?? null)
            : input.voteClosesAt
          : null,
    },
    { unified: true, approvalStatus },
  );
  return { id, approvalStatus };
}

async function savePhase(
  transaction: Transaction,
  actor: CurrentUser,
  input: SavePhaseInput,
): Promise<string> {
  const season = await lockSeason(transaction, input.seasonId);
  if (season.serverType === "PERMANENT") throw new SeasonAdministrationError("PERMANENT_PHASES");
  const [scenario] = await transaction
    .select({ slug: scenarios.slug })
    .from(scenarios)
    .where(eq(scenarios.id, season.scenarioId));
  if (getScenarioPhaseTemplate(scenario?.slug ?? ""))
    throw new SeasonAdministrationError("FIXED_PHASES");
  const phases = await transaction
    .select()
    .from(seasonPhases)
    .where(eq(seasonPhases.seasonId, season.id))
    .orderBy(seasonPhases.order)
    .for("update");
  const previous = input.id ? phases.find((phase) => phase.id === input.id) : null;
  if (input.id && !previous) throw new SeasonAdministrationError("NOT_FOUND");
  if (previous) assertSeasonVersion(input.expectedUpdatedAt, previous.updatedAt);
  const now = new Date();
  const draft = {
    id: input.id ?? "new-phase",
    order: input.order,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  };
  if (previous && season.status !== "PLANNED") assertPhaseEdit(previous, draft, now);
  assertPhaseSchedules(season, [...phases.filter((phase) => phase.id !== previous?.id), draft]);
  const values = {
    name: input.name,
    order: input.order,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    updatedAt: previous ? nextSeasonVersion(previous.updatedAt, now) : now,
  };
  const [saved] = previous
    ? await transaction
        .update(seasonPhases)
        .set(values)
        .where(eq(seasonPhases.id, previous.id))
        .returning({ id: seasonPhases.id })
    : await transaction
        .insert(seasonPhases)
        .values({ seasonId: season.id, ...values })
        .returning({ id: seasonPhases.id });
  if (!saved) throw new SeasonAdministrationError("NOT_FOUND");
  await touchSeason(transaction, season);
  await recordAudit(
    transaction,
    actor.id,
    previous ? "season.phase.updated" : "season.phase.created",
    "season_phase",
    saved.id,
    { seasonId: season.id, changedFields: ["name", "order", "startsAt", "endsAt"] },
  );
  return saved.id;
}

export async function mutateSeasonAdministration(
  value: unknown,
): Promise<{ id: string; approvalStatus?: SeasonRecord["approvalStatus"] }> {
  const parsed = seasonAdministrationSchema.safeParse(value);
  if (!parsed.success) throw new SeasonAdministrationError("INVALID_INPUT");
  const input = parsed.data;
  const setupAction =
    input.action === "CREATE_SEASON_SETUP" || input.action === "SAVE_SEASON_SETUP";
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE") throw new SeasonAdministrationError("UNAVAILABLE");
  const sessionActor = (setupAction ? requireSeasonMember : requireSeasonAdministrator)(
    state.status === "AUTHENTICATED" ? state.user : null,
  );
  return getDb().transaction(async (transaction) => {
    // Same lock order as approval, guild revocation, and operation/season writers: advisory → actor → season.
    await transaction.execute(sql`select pg_advisory_xact_lock(${AUTHORIZATION_LOCK})`);
    const actor = await requireFreshActor(transaction, sessionActor, "update", setupAction);
    if (input.action === "CREATE_SEASON_SETUP" || input.action === "SAVE_SEASON_SETUP")
      return saveSeasonSetup(transaction, actor, input);
    if (input.action === "SAVE_SEASON") return { id: await saveSeason(transaction, actor, input) };
    if (input.action === "SAVE_PHASE") return { id: await savePhase(transaction, actor, input) };
    if (input.action === "CHANGE_SEASON_PHASE") {
      if (actor.role !== "ADMIN") throw new SeasonAdministrationError("FORBIDDEN");
      const season = await lockSeason(transaction, input.seasonId);
      if (season.serverType === "PERMANENT")
        throw new SeasonAdministrationError("PERMANENT_PHASES");
      assertSeasonVersion(input.expectedUpdatedAt, season.updatedAt);
      const [scenario] = await transaction
        .select({ slug: scenarios.slug })
        .from(scenarios)
        .where(eq(scenarios.id, season.scenarioId));
      const template = getScenarioPhaseTemplate(scenario?.slug ?? "");
      const phaseRows = await transaction
        .select()
        .from(seasonPhases)
        .where(eq(seasonPhases.seasonId, season.id))
        .orderBy(seasonPhases.order)
        .for("update");
      const phases = template
        ? phaseRows.filter((phase) => phase.order >= 1 && phase.order <= template.length)
        : phaseRows;
      const order = nextSeasonPhaseOrder(season.currentPhaseOrder, phases, input.direction);
      await transaction
        .update(seasons)
        .set({ currentPhaseOrder: order, updatedAt: nextSeasonVersion(season.updatedAt) })
        .where(eq(seasons.id, season.id));
      await recordAudit(transaction, actor.id, "season.phase.changed", "season", season.id, {
        direction: input.direction,
        previousPhaseOrder: season.currentPhaseOrder,
        currentPhaseOrder: order,
        previousPhaseName:
          phases.find((phase) => phase.order === season.currentPhaseOrder)?.name ?? null,
        currentPhaseName: phases.find((phase) => phase.order === order)?.name ?? null,
      });
      return { id: season.id };
    }
    if (input.action === "REVIEW_SEASON") {
      if (actor.role !== "ADMIN") throw new SeasonAdministrationError("REVIEW");
      const season = await lockSeason(transaction, input.seasonId, true);
      assertSeasonVersion(input.expectedUpdatedAt, season.updatedAt);
      if (season.approvalStatus !== "PENDING" || season.status !== "PLANNED")
        throw new SeasonAdministrationError("REVIEW");
      await transaction
        .update(seasons)
        .set({
          approvalStatus: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedById: actor.id,
          reviewedAt: new Date(),
          updatedAt: nextSeasonVersion(season.updatedAt),
        })
        .where(eq(seasons.id, season.id));
      await recordAudit(
        transaction,
        actor.id,
        input.decision === "APPROVE" ? "season.approved" : "season.rejected",
        "season",
        season.id,
        { createdById: season.createdById },
      );
      return { id: season.id };
    }
    if (input.action === "REGISTER_SERVER") {
      return { id: (await resolveScenarioServer(transaction, actor, input, false)).id };
    }
    if (input.action === "CREATE_SCENARIO") {
      const [existing] = await transaction
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(eq(scenarios.slug, input.slug))
        .limit(1);
      if (existing) throw new SeasonAdministrationError("DUPLICATE");
      const [saved] = await transaction
        .insert(scenarios)
        .values({ slug: input.slug, name: input.name, description: input.description || null })
        .returning({ id: scenarios.id });
      if (!saved) throw new SeasonAdministrationError("NOT_FOUND");
      await recordAudit(transaction, actor.id, "scenario.created", "scenario", saved.id, {
        changedFields: ["slug", "name", "description"],
      });
      return { id: saved.id };
    }
    if (input.action === "CREATE_SERVER") {
      const [scenario] = await transaction
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(eq(scenarios.id, input.scenarioId))
        .limit(1);
      if (!scenario) throw new SeasonAdministrationError("NOT_FOUND");
      const [existing] = await transaction
        .select({ id: servers.id })
        .from(servers)
        .where(and(eq(servers.scenarioId, input.scenarioId), eq(servers.name, input.name)))
        .limit(1);
      if (existing) throw new SeasonAdministrationError("DUPLICATE");
      const [saved] = await transaction
        .insert(servers)
        .values({ scenarioId: input.scenarioId, name: input.name, region: input.region })
        .returning({ id: servers.id });
      if (!saved) throw new SeasonAdministrationError("NOT_FOUND");
      await recordAudit(transaction, actor.id, "server.created", "server", saved.id, {
        scenarioId: input.scenarioId,
        changedFields: ["name", "region"],
      });
      return { id: saved.id };
    }
    const membershipAction =
      input.action === "ENROL_MEMBERS" ||
      input.action === "UPDATE_MEMBERSHIP" ||
      input.action === "REMOVE_MEMBER";
    if (input.action === "ENROL_MEMBERS" && actor.role !== "ADMIN")
      throw new SeasonAdministrationError("FORBIDDEN");
    const season = await lockSeason(transaction, input.seasonId, membershipAction);
    if (season.approvalStatus !== "APPROVED") throw new SeasonAdministrationError("APPROVAL");
    if (input.action === "UPDATE_MEMBERSHIP" || input.action === "REMOVE_MEMBER") {
      if (actor.role !== "ADMIN") throw new SeasonAdministrationError("FORBIDDEN");
      const [membership] = await transaction
        .select()
        .from(seasonMemberships)
        .where(
          and(
            eq(seasonMemberships.seasonId, season.id),
            eq(seasonMemberships.userId, input.userId),
            sql`${seasonMemberships.removedAt} is null`,
          ),
        )
        .for("update");
      if (!membership) throw new SeasonAdministrationError("NOT_FOUND");
      assertSeasonVersion(input.expectedUpdatedAt, membership.updatedAt);
      await transaction
        .update(seasonMemberships)
        .set(
          input.action === "REMOVE_MEMBER"
            ? {
                removedAt: new Date(),
                removedById: actor.id,
                updatedAt: nextSeasonVersion(membership.updatedAt),
              }
            : {
                migrationStatus: input.migrationStatus,
                updatedAt: nextSeasonVersion(membership.updatedAt),
              },
        )
        .where(eq(seasonMemberships.id, membership.id));
      await touchSeason(transaction, season);
      if (input.action === "REMOVE_MEMBER") {
        const now = new Date();
        const futureParties = await transaction
          .select({ id: operations.id, updatedAt: operations.updatedAt })
          .from(operations)
          .where(
            and(
              eq(operations.seasonId, season.id),
              eq(operations.status, "SCHEDULED"),
              sql`${operations.startsAt} > ${now.toISOString()}::timestamptz`,
            ),
          )
          .orderBy(operations.id)
          .for("update");
        for (const party of futureParties) {
          const released = await transaction
            .update(operationParticipants)
            .set({ status: "UNAVAILABLE", roleId: null, updatedAt: now })
            .where(
              and(
                eq(operationParticipants.operationId, party.id),
                eq(operationParticipants.userId, input.userId),
                sql`${operationParticipants.status} != 'UNAVAILABLE'`,
              ),
            )
            .returning({ id: operationParticipants.id });
          if (released.length) {
            await transaction
              .update(operations)
              .set({ updatedAt: nextSeasonVersion(party.updatedAt, now) })
              .where(eq(operations.id, party.id));
            await recordAudit(
              transaction,
              actor.id,
              "party.reservation.released",
              "operation",
              party.id,
              { userId: input.userId, reason: "season_membership_removed" },
            );
          }
        }
      }
      await recordAudit(
        transaction,
        actor.id,
        input.action === "REMOVE_MEMBER" ? "season.member.removed" : "season.member.updated",
        "season_membership",
        membership.id,
        {
          seasonId: season.id,
          userId: input.userId,
          ...(input.action === "UPDATE_MEMBERSHIP"
            ? { migrationStatus: input.migrationStatus }
            : {}),
        },
      );
      return { id: season.id };
    }
    if (input.action === "ADD_CANDIDATE" || input.action === "ADD_PRESET_CANDIDATE") {
      if (season.status !== "PLANNED" && season.status !== "ACTIVE")
        throw new SeasonAdministrationError("VOTE_HISTORY");
      const [ballot] = await transaction
        .select({ id: seasonVotes.id })
        .from(seasonVotes)
        .where(eq(seasonVotes.seasonId, season.id))
        .limit(1);
      if (ballot) throw new SeasonAdministrationError("VOTE_HISTORY");
      let scenarioId: string;
      if (input.action === "ADD_PRESET_CANDIDATE") {
        const preset = getScenarioPreset(input.scenarioKey)!;
        let [presetScenario] = await transaction
          .select({ id: scenarios.id })
          .from(scenarios)
          .where(eq(scenarios.slug, preset.slug));
        if (!presetScenario) {
          [presetScenario] = await transaction
            .insert(scenarios)
            .values({ slug: preset.slug, name: preset.label })
            .returning({ id: scenarios.id });
          if (!presetScenario) throw new SeasonAdministrationError("NOT_FOUND");
          await recordAudit(
            transaction,
            actor.id,
            "scenario.created",
            "scenario",
            presetScenario.id,
            { changedFields: ["slug", "name"] },
          );
        }
        scenarioId = presetScenario.id;
      } else scenarioId = input.scenarioId;
      const [scenario] = await transaction
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(eq(scenarios.id, scenarioId))
        .limit(1);
      if (!scenario) throw new SeasonAdministrationError("NOT_FOUND");
      const [existing] = await transaction
        .select({ id: seasonVoteCandidates.id })
        .from(seasonVoteCandidates)
        .where(
          and(
            eq(seasonVoteCandidates.seasonId, season.id),
            eq(seasonVoteCandidates.scenarioId, scenarioId),
          ),
        )
        .limit(1);
      if (existing) throw new SeasonAdministrationError("DUPLICATE");
      const [saved] = await transaction
        .insert(seasonVoteCandidates)
        .values({ seasonId: season.id, scenarioId, label: input.label })
        .returning({ id: seasonVoteCandidates.id });
      if (!saved) throw new SeasonAdministrationError("NOT_FOUND");
      await touchSeason(transaction, season);
      await recordAudit(
        transaction,
        actor.id,
        "season.candidate.created",
        "season_vote_candidate",
        saved.id,
        { seasonId: season.id, scenarioId },
      );
      return { id: saved.id };
    }
    // Target rows are sorted to keep enrollment locks deterministic. Existing memberships are preserved.
    const targets = await transaction
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(
        sql`${users.id} in (${sql.join(
          input.userIds.map((userId) => sql`${userId}`),
          sql`, `,
        )})`,
      )
      .orderBy(users.id)
      .for("update");
    if (
      targets.length !== input.userIds.length ||
      targets.some((member) => !canViewMemberDirectory(member))
    )
      throw new SeasonAdministrationError("MEMBERS");
    const linked = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, "discord"),
          sql`${accounts.userId} in (${sql.join(
            input.userIds.map((userId) => sql`${userId}`),
            sql`, `,
          )})`,
        ),
      );
    const linkedIds = new Set(linked.map((account) => account.userId));
    if (targets.some((member) => !linkedIds.has(member.id)))
      throw new SeasonAdministrationError("MEMBERS");
    const inserted = await transaction
      .insert(seasonMemberships)
      .values(targets.map((member) => ({ seasonId: season.id, userId: member.id })))
      .onConflictDoUpdate({
        target: [seasonMemberships.seasonId, seasonMemberships.userId],
        set: {
          removedAt: null,
          removedById: null,
          migrationStatus: "UNDECIDED",
          updatedAt: sql`greatest(${seasonMemberships.updatedAt} + interval '1 millisecond', ${new Date().toISOString()}::timestamptz)`,
        },
        setWhere: sql`${seasonMemberships.removedAt} is not null`,
      })
      .returning({ id: seasonMemberships.id });
    if (inserted.length) {
      await touchSeason(transaction, season);
      await recordAudit(transaction, actor.id, "season.members.enrolled", "season", season.id, {
        enrolledCount: inserted.length,
      });
    }
    return { id: season.id };
  });
}
