import "server-only";
import {
  accounts,
  and,
  announcements,
  auditLogs,
  communityComments,
  communityPosts,
  desc,
  eq,
  getDb,
  memberProfiles,
  operationParticipants,
  operations,
  scenarios,
  seasonPhases,
  seasons,
  sql,
  users,
} from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import { getCurrentAuthState } from "../auth";
import { CommunityError, requireCommunityActor } from "../community-policy";
import { selectOperationalAccessMode } from "../operational-policy";
import {
  derivePersonalNotifications,
  enabledNotificationKinds,
  PERSONAL_NOTIFICATION_HISTORY_MS,
  type NotificationParty,
  type NotificationSeason,
} from "../personal-notification-model";
import type { PersonalNotificationResult } from "../personal-notification-types";
import { getUserPreferences } from "./user-preferences";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const SOURCE_LIMIT = 30;
const AUTHORIZATION_LOCK = 912743110;

function seasonFields(actorId: string) {
  return {
    id: seasons.id,
    name: seasons.name,
    status: seasons.status,
    approvalStatus: seasons.approvalStatus,
    startsAt: seasons.startsAt,
    settlementAt: seasons.settlementAt,
    currentPhaseOrder: seasons.currentPhaseOrder,
    serverType: seasons.serverType,
    migrationOpen: seasons.migrationOpen,
    trancePhenomenon: seasons.trancePhenomenon,
    gravityContentEnabled: seasons.gravityContentEnabled,
    scenarioSlug: scenarios.slug,
    myMembership: sql<boolean>`exists (
      select 1 from season_memberships notification_membership
      where notification_membership.season_id = ${seasons.id}
        and notification_membership.user_id = ${actorId}
        and notification_membership.removed_at is null
    )`,
  };
}

async function readFeed(transaction: Transaction, actor: CurrentUser) {
  const preferences = await getUserPreferences(actor);
  const now = new Date();
  const earliest = new Date(now.getTime() - PERSONAL_NOTIFICATION_HISTORY_MS);
  const reminderUntil = new Date(now.getTime() + preferences.reminderMinutes * 60_000);
  const notices = preferences.notifyAnnouncements
    ? await transaction
        .select({
          id: announcements.id,
          title: announcements.title,
          publishedAt: announcements.publishedAt,
          archivedAt: announcements.archivedAt,
          pinned: announcements.isPinned,
        })
        .from(announcements)
        .where(
          and(
            sql`${announcements.archivedAt} is null`,
            sql`${announcements.publishedAt} <= ${now.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), announcements.id)
        .limit(10)
    : [];
  // RSVP and participant writes also update the party's row version. Only actual recruitment
  // edits are changes here; audit metadata, other members' RSVP and credentials stay server-side.
  const lastChangeWhere = sql`notification_change.entity_type = 'operation'
    and notification_change.entity_id = ${operations.id}
    and notification_change.action in ('party.updated', 'operation.updated')`;
  const changedAt =
    sql<Date | null>`(select notification_change.created_at from audit_logs notification_change
    where ${lastChangeWhere} order by notification_change.created_at desc, notification_change.id desc limit 1)`.mapWith(
      auditLogs.createdAt,
    );
  const partyRows =
    preferences.notifyPartyChanges || preferences.notifyPartyReminders
      ? await transaction
          .select({
            id: operations.id,
            title: operations.title,
            status: operations.status,
            contentKey: operations.contentKey,
            startsAt: operations.startsAt,
            participation: operationParticipants.status,
            participantCreatedAt: operationParticipants.createdAt,
            changeId: sql<
              string | null
            >`(select notification_change.id from audit_logs notification_change
            where ${lastChangeWhere} order by notification_change.created_at desc, notification_change.id desc limit 1)`,
            changedAt,
            season: seasonFields(actor.id),
          })
          .from(operations)
          .innerJoin(operationParticipants, eq(operationParticipants.operationId, operations.id))
          .leftJoin(seasons, eq(seasons.id, operations.seasonId))
          .leftJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
          .where(
            and(
              eq(operationParticipants.userId, actor.id),
              sql`${operationParticipants.status} in ('GOING', 'MAYBE')`,
              sql`${operations.status} <> 'COMPLETED'`,
              sql`${operations.startsAt} >= ${earliest.toISOString()}::timestamptz`,
              sql`((${operations.seasonId} is null and ${operations.contentKey} is null) or (
            ${seasons.approvalStatus} = 'APPROVED' and ${seasonFields(actor.id).myMembership}
          ))`,
              sql`((${preferences.notifyPartyReminders} and ${operations.status} = 'SCHEDULED'
            and ${operations.startsAt} > ${now.toISOString()}::timestamptz
            and ${operations.startsAt} <= ${reminderUntil.toISOString()}::timestamptz)
            or (${preferences.notifyPartyChanges} and ${changedAt} >= ${earliest.toISOString()}::timestamptz))`,
            ),
          )
          .orderBy(
            sql`case when ${operations.status} = 'SCHEDULED' and ${operations.startsAt} > ${now.toISOString()}::timestamptz
            and ${operations.startsAt} <= ${reminderUntil.toISOString()}::timestamptz then 0 else 1 end`,
            sql`${changedAt} desc nulls last`,
            operations.id,
          )
          .limit(SOURCE_LIMIT)
      : [];
  const parties: NotificationParty[] = partyRows.map((row) => ({
    ...row,
    // All selected season columns except settlementAt are non-null in the schema. A matched
    // season ID proves this LEFT JOIN has a row; the scenario fallback closes content checks.
    season: row.season?.id
      ? ({ ...row.season, scenarioSlug: row.season.scenarioSlug ?? "" } as NotificationSeason)
      : null,
  }));
  // Match the season hub's currently selected approved ACTIVE/SETTLEMENT season, so a vote
  // notification always leads to the vote the member can actually see at /season.
  const voteRows = preferences.notifyVoteDeadlines
    ? await transaction
        .select({
          season: seasonFields(actor.id),
          closesAt: seasons.voteClosesAt,
          hasCandidates: sql<boolean>`exists (select 1 from season_vote_candidates notification_candidate where notification_candidate.season_id = ${seasons.id})`,
          hasVoted: sql<boolean>`exists (select 1 from season_votes notification_vote where notification_vote.season_id = ${seasons.id} and notification_vote.user_id = ${actor.id})`,
        })
        .from(seasons)
        .innerJoin(scenarios, eq(scenarios.id, seasons.scenarioId))
        .where(
          and(
            eq(seasons.approvalStatus, "APPROVED"),
            sql`${seasons.status} in ('ACTIVE', 'SETTLEMENT')`,
          ),
        )
        .orderBy(desc(seasons.seasonNumber), seasons.id)
        .limit(1)
    : [];
  const phaseSeasonIds = [
    ...new Set(
      [
        ...parties.filter((party) => !party.contentKey).map((party) => party.season?.id),
        ...voteRows.map((vote) => vote.season.id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const phases = phaseSeasonIds.length
    ? await transaction
        .select()
        .from(seasonPhases)
        .where(
          sql`${seasonPhases.seasonId} in (${sql.join(
            phaseSeasonIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
    : [];
  const comments = preferences.notifyComments
    ? await transaction
        .select({
          id: communityComments.id,
          postId: communityPosts.id,
          postTitle: communityPosts.title,
          postOwnerId: communityPosts.authorId,
          parentId: communityComments.parentId,
          parentOwnerId: sql<
            string | null
          >`(select reply_parent.author_id from community_comments reply_parent where reply_parent.id = ${communityComments.parentId})`,
          parentVisible: sql<boolean>`(${communityComments.parentId} is null or exists(select 1 from community_comments visible_parent join users visible_parent_author on visible_parent_author.id = visible_parent.author_id where visible_parent.id = ${communityComments.parentId} and visible_parent.hidden_at is null and visible_parent_author.role in ('MEMBER','OFFICER','ADMIN')))`,
          authorId: communityComments.authorId,
          authorName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name}, '멤버')`,
          authorApproved: sql<boolean>`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
          createdAt: communityComments.createdAt,
          hiddenAt: communityComments.hiddenAt,
          archivedAt: communityComments.archivedAt,
          postHiddenAt: communityPosts.hiddenAt,
          postArchivedAt: communityPosts.archivedAt,
        })
        .from(communityComments)
        .innerJoin(communityPosts, eq(communityPosts.id, communityComments.postId))
        .innerJoin(users, eq(users.id, communityComments.authorId))
        .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
        .where(
          and(
            sql`(${communityPosts.authorId} = ${actor.id} or exists(select 1 from community_comments own_parent where own_parent.id = ${communityComments.parentId} and own_parent.author_id = ${actor.id}))`,
            sql`${communityComments.authorId} <> ${actor.id}`,
            sql`${communityPosts.hiddenAt} is null and ${communityPosts.archivedAt} is null`,
            sql`${communityComments.hiddenAt} is null and ${communityComments.archivedAt} is null`,
            sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`,
            sql`exists(select 1 from users post_owner where post_owner.id = ${communityPosts.authorId} and post_owner.role in ('MEMBER','OFFICER','ADMIN'))`,
            sql`(${communityComments.parentId} is null or exists(select 1 from community_comments visible_parent join users visible_parent_author on visible_parent_author.id = visible_parent.author_id where visible_parent.id = ${communityComments.parentId} and visible_parent.hidden_at is null and visible_parent_author.role in ('MEMBER','OFFICER','ADMIN')))`,
            sql`${communityComments.createdAt} >= ${earliest.toISOString()}::timestamptz`,
            sql`${communityComments.createdAt} <= ${now.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(desc(communityComments.createdAt), communityComments.id)
        .limit(SOURCE_LIMIT)
    : [];
  return derivePersonalNotifications(
    { actorId: actor.id, announcements: notices, parties, votes: voteRows, comments, phases },
    preferences,
    now,
  );
}

export async function getPersonalNotifications(): Promise<PersonalNotificationResult> {
  const state = await getCurrentAuthState();
  const mode = selectOperationalAccessMode(state.user, state.status);
  if (mode === "DEMO" && state.user?.isMock) {
    try {
      return { mode, enabledKinds: enabledNotificationKinds(await getUserPreferences(state.user)) };
    } catch {
      return { mode: "ERROR" };
    }
  }
  if (mode !== "LIVE")
    return {
      mode,
      ...(mode === "ERROR" &&
      typeof state.retryAfterSeconds === "number" &&
      Number.isFinite(state.retryAfterSeconds) &&
      state.retryAfterSeconds >= 0
        ? { retryAfterSeconds: state.retryAfterSeconds }
        : {}),
    };
  if (!state.user) return { mode: "REAUTH" };
  try {
    const data = await getDb().transaction(
      async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
        const [fresh] = await transaction
          .select({ id: users.id, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.id, state.user!.id))
          .for("share");
        const actor = requireCommunityActor(fresh ? { ...fresh, isMock: false } : null);
        const [discord] = await transaction
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
          .limit(1);
        if (!discord) throw new CommunityError("REAUTH");
        return readFeed(transaction, actor);
      },
      { isolationLevel: "repeatable read" },
    );
    return { mode: "LIVE", data };
  } catch (error) {
    return {
      mode:
        error instanceof CommunityError && error.code === "FORBIDDEN"
          ? "PENDING"
          : error instanceof CommunityError && error.code === "REAUTH"
            ? "REAUTH"
            : "ERROR",
    };
  }
}
