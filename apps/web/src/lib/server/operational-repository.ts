import "server-only";
import {
  accounts,
  and,
  announcements,
  auditLogs,
  builds,
  buildVersions,
  communityPosts,
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
  canApproveMember,
  canViewMemberDirectory,
  canViewAdminMemberDirectory,
  getCurrentSeasonPhase,
  getScenarioSeasonPhases,
  summarizeMigration,
} from "@uniz/domain";
import type { CurrentUser } from "../auth-policy";
import { nextSeasonVersion } from "../season-admin-policy";
import { getPartyContentOptions } from "../party-content";
import { publishedBuildAccessSql } from "./build-sharing";
import type {
  OperationalAuthStatus,
  OperationalData,
  OperationalPageData,
} from "../data/operational-types";
import {
  OperationalPolicyError,
  requireOpenOperation,
  requireOpenSeason,
  requireOpenPartySeason,
  requireOpenMigrationSeason,
  requireOpenVote,
  requireOperationalActor,
  selectOperationalAccessMode,
  operationalMutationSchema,
  type OperationalMutation,
} from "../operational-policy";

type DatabaseReader = Pick<ReturnType<typeof getDb>, "select">;

function allowed(check: () => void): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (error instanceof OperationalPolicyError) return false;
    throw error;
  }
}

async function readOperationalData(
  database: DatabaseReader,
  actor: CurrentUser,
): Promise<OperationalData> {
  const now = new Date();
  const allSeasons = await database
    .select()
    .from(seasons)
    .where(eq(seasons.approvalStatus, "APPROVED"))
    .orderBy(desc(seasons.seasonNumber));
  const allScenarios = await database.select().from(scenarios);
  const allServers = await database.select().from(servers);
  const allPhases = await database.select().from(seasonPhases);
  const publicUsers = await database
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      displayName: memberProfiles.displayName,
      handle: memberProfiles.handle,
    })
    .from(users)
    .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id));
  const approved = publicUsers.filter((member) => canViewMemberDirectory(member));
  const memberIds = new Set(approved.map((member) => member.id));
  const member = (id: string) => {
    const profile = approved.find((item) => item.id === id);
    return profile
      ? {
          id: profile.id,
          name: profile.displayName ?? profile.name,
          handle: canViewAdminMemberDirectory(actor) ? profile.handle : null,
        }
      : null;
  };
  const allMemberships = await database
    .select()
    .from(seasonMemberships)
    .where(sql`${seasonMemberships.removedAt} IS NULL`);
  const approvedSeasonIds = new Set(allSeasons.map((season) => season.id));
  const allOperations = (
    await database.select().from(operations).orderBy(operations.startsAt)
  ).filter((operation) => !operation.seasonId || approvedSeasonIds.has(operation.seasonId));
  const allParticipants = await database
    .select({
      operationId: operationParticipants.operationId,
      userId: operationParticipants.userId,
      status: operationParticipants.status,
    })
    .from(operationParticipants);
  const allCandidates = await database.select().from(seasonVoteCandidates);
  const allVotes = await database
    .select({
      seasonId: seasonVotes.seasonId,
      candidateId: seasonVotes.candidateId,
      userId: seasonVotes.userId,
    })
    .from(seasonVotes);
  const bulletin = await database
    .select({
      id: announcements.id,
      title: announcements.title,
      content: sql<string>`case when length(${announcements.content}) > 320 then left(${announcements.content}, 320) || '…' else ${announcements.content} end`,
      authorId: announcements.authorId,
      publishedAt: announcements.publishedAt,
      pinned: announcements.isPinned,
    })
    .from(announcements)
    .where(
      and(
        sql`${announcements.archivedAt} IS NULL`,
        sql`${announcements.publishedAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), desc(announcements.id))
    .limit(5);
  const recentCommunity = await database
    .select({
      id: communityPosts.id,
      title: communityPosts.title,
      category: communityPosts.category,
      author: sql<string>`case when ${users.role} in ('MEMBER','OFFICER','ADMIN') then coalesce(${memberProfiles.displayName}, ${users.name}, '멤버') else '이전 멤버' end`,
      createdAt: communityPosts.createdAt,
      pinned: communityPosts.isPinned,
    })
    .from(communityPosts)
    .innerJoin(users, eq(users.id, communityPosts.authorId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
    .where(
      and(
        sql`${communityPosts.archivedAt} IS NULL`,
        sql`${communityPosts.hiddenAt} IS NULL`,
        sql`${communityPosts.category} <> 'SHOWCASE'`,
        sql`${users.role} in ('MEMBER','OFFICER','ADMIN')`,
      ),
    )
    .orderBy(desc(communityPosts.isPinned), desc(communityPosts.createdAt), desc(communityPosts.id))
    .limit(4);
  const buildRows = await database
    .select({
      id: builds.id,
      title: sql<string>`case when ${builds.ownerId} = ${actor.id} then ${builds.title} else (select shared_request.title from build_publications shared_publication join build_share_requests shared_request on shared_request.id = shared_publication.request_id where shared_publication.build_id = ${builds.id}) end`,
      ownerId: builds.ownerId,
      visibility: builds.visibility,
      archivedAt: builds.archivedAt,
      updatedAt:
        sql<Date>`case when ${builds.ownerId} = ${actor.id} then ${builds.updatedAt} else (select updated_at from build_publications where build_id = ${builds.id}) end`.mapWith(
          builds.updatedAt,
        ),
      version: sql<number>`case when ${builds.ownerId} = ${actor.id} then (select max(version) from build_versions where build_id = ${builds.id}) else (select shared_version.version from build_publications shared_publication join build_share_requests shared_request on shared_request.id = shared_publication.request_id join build_versions shared_version on shared_version.id = shared_request.build_version_id where shared_publication.build_id = ${builds.id}) end`,
    })
    .from(builds)
    .innerJoin(users, eq(users.id, builds.ownerId))
    .where(
      and(
        sql`${builds.archivedAt} is null`,
        sql`(${builds.ownerId} = ${actor.id} or (${publishedBuildAccessSql(actor)}))`,
        sql`exists (select 1 from ${buildVersions} where ${buildVersions.buildId} = ${builds.id})`,
      ),
    )
    .orderBy(
      desc(
        sql`case when ${builds.ownerId} = ${actor.id} then ${builds.updatedAt} else (select updated_at from build_publications where build_id = ${builds.id}) end`,
      ),
      desc(builds.id),
    )
    .limit(5);

  const current =
    allSeasons.find((season) => season.status === "ACTIVE" || season.status === "SETTLEMENT") ??
    null;
  const currentPhases = current
    ? getScenarioSeasonPhases(
        allPhases,
        current.id,
        allScenarios.find((item) => item.id === current.scenarioId)?.slug ?? "",
      )
    : [];
  const currentMemberships = current
    ? allMemberships.filter(
        (membership) => membership.seasonId === current.id && memberIds.has(membership.userId),
      )
    : [];
  const ownMembership = currentMemberships.find((membership) => membership.userId === actor.id);
  const summary = summarizeMigration(currentMemberships);
  const mySeasonIds = new Set(
    allMemberships
      .filter((membership) => membership.userId === actor.id)
      .map((row) => row.seasonId),
  );
  const next =
    allOperations.find(
      (operation) =>
        operation.status === "SCHEDULED" &&
        operation.startsAt > now &&
        (!operation.seasonId || mySeasonIds.has(operation.seasonId)),
    ) ?? null;
  const participants = next
    ? allParticipants.filter((participant) => participant.operationId === next.id)
    : [];
  const going = participants.filter((participant) => participant.status === "GOING");
  const ownParticipant = participants.find((participant) => participant.userId === actor.id);
  const operationSeason = next?.seasonId
    ? allSeasons.find((season) => season.id === next.seasonId)
    : null;
  const nextContentAvailable =
    !next?.contentKey ||
    Boolean(
      operationSeason &&
      getPartyContentOptions({
        scenarioSlug:
          allScenarios.find((item) => item.id === operationSeason.scenarioId)?.slug ?? "",
        trancePhenomenon: operationSeason.trancePhenomenon,
        gravityContentEnabled: operationSeason.gravityContentEnabled,
      }).some((content) => content.key === next.contentKey),
    );
  const mayRespond = Boolean(
    next &&
    allowed(() => {
      requireOpenOperation(next, "MAYBE", going.length, ownParticipant?.status ?? null, now);
      if (next.seasonId) {
        if (!operationSeason) throw new OperationalPolicyError("NOT_FOUND");
        const enrolled = mySeasonIds.has(operationSeason.id);
        if (next.contentKey) {
          requireOpenPartySeason(operationSeason, enrolled);
          if (!nextContentAvailable && !ownParticipant)
            throw new OperationalPolicyError("CONTENT_UNAVAILABLE");
        } else
          requireOpenSeason(
            operationSeason,
            getScenarioSeasonPhases(
              allPhases,
              operationSeason.id,
              allScenarios.find((item) => item.id === operationSeason.scenarioId)?.slug ?? "",
            ),
            enrolled,
            now,
          );
      }
    }),
  );
  const migrationOpen = Boolean(
    current &&
    allowed(() => requireOpenMigrationSeason(current, currentPhases, Boolean(ownMembership), now)),
  );
  const seasonOpen = Boolean(
    current &&
    allowed(() => requireOpenSeason(current, currentPhases, Boolean(ownMembership), now)),
  );
  const candidates = current
    ? allCandidates.filter((candidate) => candidate.seasonId === current.id)
    : [];
  const eligibleIds = new Set(currentMemberships.map((membership) => membership.userId));
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const ballots = current
    ? allVotes.filter(
        (ballot) =>
          ballot.seasonId === current.id &&
          eligibleIds.has(ballot.userId) &&
          candidateIds.has(ballot.candidateId),
      )
    : [];
  const selected = ballots.find((ballot) => ballot.userId === actor.id)?.candidateId;
  const scenario = (id: string) => allScenarios.find((item) => item.id === id);
  const server = (id: string) => allServers.find((item) => item.id === id);
  return {
    source: "POSTGRESQL",
    asOf: now.toISOString(),
    currentSeason: current
      ? {
          id: current.id,
          seasonNumber: current.seasonNumber,
          name: current.name,
          status: current.status,
          serverType: current.serverType,
          trancePhenomenon: current.trancePhenomenon,
          migrationOpen: current.migrationOpen,
          scenario: scenario(current.scenarioId)?.name ?? "시나리오 정보 없음",
          server: server(current.serverId)?.name ?? "서버 정보 없음",
          startsAt: current.startsAt.toISOString(),
          settlementAt: current.settlementAt?.toISOString() ?? null,
          daysRemaining: current.settlementAt
            ? Math.max(0, Math.ceil((current.settlementAt.getTime() - now.getTime()) / 86_400_000))
            : null,
          phases:
            current.serverType === "PERMANENT"
              ? []
              : currentPhases.map((phase) => ({
                  id: phase.id,
                  name: phase.name,
                  order: phase.order,
                  startsAt: phase.startsAt?.toISOString() ?? null,
                  endsAt: phase.endsAt?.toISOString() ?? null,
                })),
          currentPhaseId:
            getCurrentSeasonPhase(currentPhases, current.id, now, current.currentPhaseOrder)?.id ??
            null,
          currentPhaseOrder: current.currentPhaseOrder,
          myMembership: Boolean(ownMembership),
        }
      : null,
    nextOperation: next
      ? {
          id: next.id,
          title: next.title,
          description: next.description,
          type: next.type,
          contentKey: next.contentKey,
          seasonId: next.seasonId,
          seasonName: operationSeason?.name ?? null,
          meetingPoint: next.meetingPoint,
          startsAt: next.startsAt.toISOString(),
          capacity: next.capacity,
          goingCount: going.length,
          maybeCount: participants.filter((participant) => participant.status === "MAYBE").length,
          myRsvp: ownParticipant?.status ?? null,
          mayRespond,
          mayGo: mayRespond && nextContentAvailable,
          mayMaybe: mayRespond && nextContentAvailable,
          ...(!nextContentAvailable
            ? {
                responseNotice:
                  "현재 트랜스 현상에서 사용할 수 없는 콘텐츠입니다. 기존 참가 응답은 불참으로 변경할 수 있습니다.",
              }
            : {}),
          members: going.flatMap((participant) => {
            const person = member(participant.userId);
            return person ? [person] : [];
          }),
        }
      : null,
    migration: {
      total: summary.total,
      ready: summary.ready,
      percent: summary.readinessPercent,
      counts: summary.counts,
      myStatus: ownMembership?.migrationStatus ?? null,
      mayChange: migrationOpen,
      members: (canViewAdminMemberDirectory(actor) || ownMembership
        ? currentMemberships
        : []
      ).flatMap((membership) => {
        const person = member(membership.userId);
        return person ? [{ ...person, status: membership.migrationStatus }] : [];
      }),
    },
    vote:
      current?.voteClosesAt && candidates.length > 0
        ? {
            closesAt: current.voteClosesAt.toISOString(),
            totalVotes: ballots.length,
            totalEligible: currentMemberships.length,
            mayVote: seasonOpen && allowed(() => requireOpenVote(current.voteClosesAt, true, now)),
            candidates: candidates.map((candidate) => {
              const count = ballots.filter((ballot) => ballot.candidateId === candidate.id).length;
              return {
                id: candidate.id,
                label: candidate.label,
                description: scenario(candidate.scenarioId)?.description ?? null,
                count,
                percent: ballots.length ? Math.round((count / ballots.length) * 100) : 0,
                selected: candidate.id === selected,
              };
            }),
          }
        : null,
    announcements: bulletin
      .filter((item) => item.publishedAt <= now)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        author: member(item.authorId)?.name ?? "운영진",
        publishedAt: item.publishedAt.toISOString(),
        pinned: item.pinned,
      })),
    memberCount: approved.length,
    recentCommunityPosts: recentCommunity.map((post) => ({
      id: post.id,
      title: post.title,
      category: post.category,
      author: post.author,
      createdAt: post.createdAt.toISOString(),
      pinned: post.pinned,
    })),
    pendingCount: canApproveMember(actor)
      ? publicUsers.filter((person) => person.role === "APPLICANT").length
      : null,
    recentBuilds: buildRows
      .flatMap((build) => {
        return build.version
          ? [
              {
                id: build.id,
                title: build.title,
                author: member(build.ownerId)?.name ?? "멤버",
                version: build.version,
                updatedAt: build.updatedAt.toISOString(),
              },
            ]
          : [];
      })
      .slice(0, 5),
    history: allSeasons.map((season) => ({
      id: season.id,
      seasonNumber: season.seasonNumber,
      name: season.name,
      status: season.status,
      serverType: season.serverType,
      trancePhenomenon: season.trancePhenomenon,
      scenario: scenario(season.scenarioId)?.name ?? "시나리오 정보 없음",
      server: server(season.serverId)?.name ?? "서버 정보 없음",
      members: allMemberships.filter((membership) => membership.seasonId === season.id).length,
      completedOperations: allOperations.filter(
        (operation) => operation.seasonId === season.id && operation.status === "COMPLETED",
      ).length,
    })),
  };
}

export async function getOperationalPageData(
  user: CurrentUser | null,
  status?: OperationalAuthStatus,
  retryAfterSeconds?: number,
): Promise<OperationalPageData> {
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
  if (!user) return { mode: "REAUTH" };
  try {
    return await getDb().transaction(
      async (transaction) => {
        const [fresh] = await transaction
          .select({ id: users.id, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.id, user.id))
          .for("share");
        const actor = requireOperationalActor(
          fresh ? { ...fresh, isMock: false } : null,
          "MIGRATION",
        );
        return {
          mode: "LIVE" as const,
          data: await readOperationalData(transaction, actor),
          role: actor.role,
        };
      },
      { isolationLevel: "repeatable read" },
    );
  } catch (error) {
    if (error instanceof OperationalPolicyError) return { mode: "PENDING" };
    // Deliberately return neither database diagnostics nor a demo fallback to authenticated members.
    return { mode: "ERROR" };
  }
}

export async function persistOperationalMutation(
  actor: CurrentUser,
  value: OperationalMutation,
): Promise<void> {
  // Keep direct repository callers behind the same strict boundary as Server Actions.
  const input = operationalMutationSchema.parse(value);
  requireOperationalActor(actor, input.action);
  await getDb().transaction(async (transaction) => {
    // Match administration and membership writers before taking user/entity locks.
    await transaction.execute(sql`select pg_advisory_xact_lock(912743110)`);
    // Every writer holds the actor lock until commit; concurrent role revocation cannot slip past it.
    const [fresh] = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, actor.id))
      .for("update");
    const principal = requireOperationalActor(
      fresh ? { ...fresh, isMock: false } : null,
      input.action,
    );
    const [discord] = await transaction
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, principal.id), eq(accounts.provider, "discord")))
      .limit(1);
    if (!discord) throw new OperationalPolicyError("FORBIDDEN");
    if (input.action === "RSVP") {
      const [reference] = await transaction
        .select({ seasonId: operations.seasonId })
        .from(operations)
        .where(eq(operations.id, input.operationId));
      if (!reference) throw new OperationalPolicyError("NOT_FOUND");
      const [season] = reference.seasonId
        ? await transaction
            .select()
            .from(seasons)
            .where(eq(seasons.id, reference.seasonId))
            .for("update")
        : [];
      if (reference.seasonId && !season) throw new OperationalPolicyError("NOT_FOUND");
      // The operation row serializes capacity decisions, including first RSVPs from different users.
      const [operation] = await transaction
        .select()
        .from(operations)
        .where(eq(operations.id, input.operationId))
        .for("update");
      if (!operation) throw new OperationalPolicyError("NOT_FOUND");
      if (operation.seasonId !== reference.seasonId) throw new OperationalPolicyError("NOT_FOUND");
      if (
        input.expectedUpdatedAt &&
        new Date(input.expectedUpdatedAt).getTime() !== operation.updatedAt.getTime()
      )
        throw new OperationalPolicyError("STALE_OPERATION");
      if (season) {
        const [membership] = await transaction
          .select({ id: seasonMemberships.id })
          .from(seasonMemberships)
          .where(
            and(
              eq(seasonMemberships.seasonId, season.id),
              eq(seasonMemberships.userId, principal.id),
              sql`${seasonMemberships.removedAt} IS NULL`,
            ),
          );
        if (operation.contentKey) {
          requireOpenPartySeason(season, Boolean(membership));
          if (input.status !== "UNAVAILABLE") {
            const [scenario] = await transaction
              .select({ slug: scenarios.slug })
              .from(scenarios)
              .where(eq(scenarios.id, season.scenarioId));
            if (
              !getPartyContentOptions({
                scenarioSlug: scenario?.slug ?? "",
                gravityContentEnabled: season.gravityContentEnabled,
                trancePhenomenon: season.trancePhenomenon,
              }).some((content) => content.key === operation.contentKey)
            )
              throw new OperationalPolicyError("CONTENT_UNAVAILABLE");
          }
        } else {
          const phases = await transaction
            .select()
            .from(seasonPhases)
            .where(eq(seasonPhases.seasonId, season.id));
          const [scenario] = await transaction
            .select({ slug: scenarios.slug })
            .from(scenarios)
            .where(eq(scenarios.id, season.scenarioId));
          requireOpenSeason(
            season,
            getScenarioSeasonPhases(phases, season.id, scenario?.slug ?? ""),
            Boolean(membership),
            new Date(),
          );
        }
      }
      const participants = await transaction
        .select({
          userId: operationParticipants.userId,
          status: operationParticipants.status,
        })
        .from(operationParticipants)
        .where(eq(operationParticipants.operationId, operation.id));
      const previous = participants.find((participant) => participant.userId === principal.id);
      requireOpenOperation(
        operation,
        input.status,
        participants.filter((participant) => participant.status === "GOING").length,
        previous?.status ?? null,
        new Date(),
      );
      await transaction
        .insert(operationParticipants)
        .values({
          operationId: operation.id,
          userId: principal.id,
          status: input.status,
          ...(input.contribution === undefined ? {} : { contribution: input.contribution }),
        })
        .onConflictDoUpdate({
          target: [operationParticipants.operationId, operationParticipants.userId],
          set: {
            status: input.status,
            updatedAt: new Date(),
            ...(input.contribution === undefined ? {} : { contribution: input.contribution }),
          },
        });
      await transaction
        .update(operations)
        .set({ updatedAt: nextSeasonVersion(operation.updatedAt) })
        .where(eq(operations.id, operation.id));
      await transaction.insert(auditLogs).values({
        actorId: principal.id,
        action: "OPERATION_RSVP_CHANGED",
        entityType: "operation",
        entityId: operation.id,
        metadata: {
          status: input.status,
          previousStatus: previous?.status ?? null,
          contributionUpdated: input.contribution !== undefined,
        },
      });
      return;
    }
    const [season] = await transaction
      .select()
      .from(seasons)
      .where(eq(seasons.id, input.seasonId))
      .for("update");
    if (!season) throw new OperationalPolicyError("NOT_FOUND");
    const phases = await transaction
      .select()
      .from(seasonPhases)
      .where(eq(seasonPhases.seasonId, season.id));
    const [scenario] = await transaction
      .select({ slug: scenarios.slug })
      .from(scenarios)
      .where(eq(scenarios.id, season.scenarioId));
    const currentPhases = getScenarioSeasonPhases(phases, season.id, scenario?.slug ?? "");
    const [membership] = await transaction
      .select()
      .from(seasonMemberships)
      .where(
        and(
          eq(seasonMemberships.seasonId, season.id),
          eq(seasonMemberships.userId, principal.id),
          sql`${seasonMemberships.removedAt} IS NULL`,
        ),
      );
    const now = new Date();
    if (input.action === "MIGRATION") {
      requireOpenMigrationSeason(season, currentPhases, Boolean(membership), now);
      if (!membership) throw new OperationalPolicyError("NOT_A_SEASON_MEMBER");
      await transaction
        .update(seasonMemberships)
        .set({
          migrationStatus: input.status,
          updatedAt: nextSeasonVersion(membership.updatedAt, now),
        })
        .where(eq(seasonMemberships.id, membership.id));
      await transaction.insert(auditLogs).values({
        actorId: principal.id,
        action: "MIGRATION_STATUS_CHANGED",
        entityType: "season_membership",
        entityId: membership.id,
        metadata: {
          seasonId: season.id,
          status: input.status,
          previousStatus: membership.migrationStatus,
        },
      });
      return;
    }
    requireOpenSeason(season, currentPhases, Boolean(membership), now);
    const [candidate] = await transaction
      .select({ id: seasonVoteCandidates.id })
      .from(seasonVoteCandidates)
      .where(
        and(
          eq(seasonVoteCandidates.id, input.candidateId),
          eq(seasonVoteCandidates.seasonId, season.id),
        ),
      );
    requireOpenVote(season.voteClosesAt, Boolean(candidate), now);
    await transaction
      .insert(seasonVotes)
      .values({ seasonId: season.id, userId: principal.id, candidateId: input.candidateId })
      .onConflictDoUpdate({
        target: [seasonVotes.seasonId, seasonVotes.userId],
        set: { candidateId: input.candidateId, updatedAt: now },
      });
    await transaction.insert(auditLogs).values({
      actorId: principal.id,
      action: "SEASON_VOTE_CHANGED",
      entityType: "season",
      entityId: season.id,
      metadata: { candidateId: input.candidateId },
    });
  });
}
