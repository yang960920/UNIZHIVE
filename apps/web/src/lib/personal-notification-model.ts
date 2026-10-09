import { getScenarioSeasonPhases, type Season, type SeasonPhase } from "@uniz/domain";
import { requireOpenPartySeason, requireOpenSeason, requireOpenVote } from "./operational-policy";
import { getPartyContentOptions } from "./party-content";
import type { UserPreferences } from "./user-preferences";
import type {
  PersonalNotification,
  PersonalNotificationFeed,
  PersonalNotificationKind,
} from "./personal-notification-types";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const PERSONAL_NOTIFICATION_LIMIT = 30;
export const PERSONAL_NOTIFICATION_HISTORY_MS = 7 * DAY_MS;

export type NotificationSeason = Pick<
  Season,
  | "id"
  | "name"
  | "status"
  | "approvalStatus"
  | "startsAt"
  | "settlementAt"
  | "currentPhaseOrder"
  | "serverType"
  | "migrationOpen"
  | "trancePhenomenon"
> & { scenarioSlug: string; gravityContentEnabled: boolean; myMembership: boolean };

export interface NotificationAnnouncement {
  id: string;
  title: string;
  publishedAt: Date;
  archivedAt: Date | null;
  pinned: boolean;
}

export interface NotificationParty {
  id: string;
  title: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  contentKey: string | null;
  startsAt: Date;
  participation: "GOING" | "MAYBE" | "UNAVAILABLE";
  participantCreatedAt: Date;
  season: NotificationSeason | null;
  changeId: string | null;
  changedAt: Date | null;
}

export interface NotificationVote {
  season: NotificationSeason;
  closesAt: Date | null;
  hasCandidates: boolean;
  hasVoted: boolean;
}

export interface NotificationComment {
  id: string;
  postId: string;
  postTitle: string;
  postOwnerId: string;
  parentId?: string | null;
  parentOwnerId?: string | null;
  parentVisible?: boolean;
  authorId: string;
  authorName: string;
  authorApproved: boolean;
  createdAt: Date;
  hiddenAt: Date | null;
  archivedAt: Date | null;
  postHiddenAt: Date | null;
  postArchivedAt: Date | null;
}

export interface NotificationSources {
  actorId: string;
  announcements: NotificationAnnouncement[];
  parties: NotificationParty[];
  votes: NotificationVote[];
  comments: NotificationComment[];
  phases: SeasonPhase[];
}

export function enabledNotificationKinds(preferences: UserPreferences): PersonalNotificationKind[] {
  const flags: [PersonalNotificationKind, boolean][] = [
    ["ANNOUNCEMENT", preferences.notifyAnnouncements],
    ["PARTY_CHANGE", preferences.notifyPartyChanges],
    ["PARTY_REMINDER", preferences.notifyPartyReminders],
    ["VOTE_DEADLINE", preferences.notifyVoteDeadlines],
    ["COMMENT", preferences.notifyComments],
  ];
  return flags.filter(([, enabled]) => enabled).map(([kind]) => kind);
}

function visibleParty(party: NotificationParty): boolean {
  return (
    party.participation !== "UNAVAILABLE" &&
    (!party.season || (party.season.approvalStatus === "APPROVED" && party.season.myMembership))
  );
}

function canAttend(party: NotificationParty, phases: SeasonPhase[], now: Date): boolean {
  if (!visibleParty(party) || party.status !== "SCHEDULED" || party.startsAt <= now) return false;
  if (!party.season) return party.contentKey === null;
  try {
    if (party.contentKey) {
      requireOpenPartySeason(party.season, party.season.myMembership);
      return getPartyContentOptions(party.season).some(
        (content) => content.key === party.contentKey,
      );
    }
    requireOpenSeason(
      party.season,
      getScenarioSeasonPhases(phases, party.season.id, party.season.scenarioSlug),
      party.season.myMembership,
      now,
    );
    return true;
  } catch {
    return false;
  }
}

/** Derive a current on-site feed; these records do not claim delivery or unread status. */
export function derivePersonalNotifications(
  sources: NotificationSources,
  preferences: UserPreferences,
  now: Date,
): PersonalNotificationFeed {
  const items: PersonalNotification[] = [];
  const enabledKinds = enabledNotificationKinds(preferences);
  const earliest = now.getTime() - PERSONAL_NOTIFICATION_HISTORY_MS;
  if (preferences.notifyAnnouncements) {
    for (const announcement of sources.announcements) {
      if (announcement.archivedAt || announcement.publishedAt > now) continue;
      items.push({
        id: `announcement:${announcement.id}`,
        kind: "ANNOUNCEMENT",
        title: announcement.title,
        description: "하이브 공지를 확인해 주세요.",
        href: `/announcements/${encodeURIComponent(announcement.id)}`,
        occurredAt: announcement.publishedAt.toISOString(),
        pinned: announcement.pinned,
      });
    }
  }
  for (const party of sources.parties) {
    if (!visibleParty(party)) continue;
    const href = `/ops/${encodeURIComponent(party.id)}`;
    if (
      preferences.notifyPartyChanges &&
      party.status !== "COMPLETED" &&
      party.changedAt &&
      party.changeId &&
      party.changedAt.getTime() >= earliest &&
      party.changedAt <= now &&
      party.changedAt > party.participantCreatedAt
    ) {
      items.push({
        id: `party-change:${party.id}:${party.changeId}`,
        kind: "PARTY_CHANGE",
        title:
          party.status === "CANCELLED"
            ? `파티 취소 · ${party.title}`
            : `모집 변경 · ${party.title}`,
        description:
          party.status === "CANCELLED"
            ? "참가·미정으로 응답한 파티가 취소되었습니다."
            : "참가·미정으로 응답한 파티의 모집 정보가 변경되었습니다.",
        href,
        occurredAt: party.changedAt.toISOString(),
      });
    }
    const reminderStartsAt = new Date(
      party.startsAt.getTime() - preferences.reminderMinutes * 60_000,
    );
    if (
      preferences.notifyPartyReminders &&
      now >= reminderStartsAt &&
      canAttend(party, sources.phases, now)
    ) {
      items.push({
        id: `party-reminder:${party.id}:${party.startsAt.toISOString()}`,
        kind: "PARTY_REMINDER",
        title: `곧 시작하는 파티 · ${party.title}`,
        description: `${Math.ceil((party.startsAt.getTime() - now.getTime()) / 60_000)}분 뒤 시작합니다.${party.participation === "MAYBE" ? " 미정으로 응답한 파티입니다." : ""}`,
        href,
        occurredAt: reminderStartsAt.toISOString(),
      });
    }
  }
  if (preferences.notifyVoteDeadlines) {
    for (const vote of sources.votes) {
      if (vote.hasVoted || !vote.closesAt || vote.closesAt.getTime() - now.getTime() > DAY_MS)
        continue;
      try {
        requireOpenSeason(
          vote.season,
          getScenarioSeasonPhases(sources.phases, vote.season.id, vote.season.scenarioSlug),
          vote.season.myMembership,
          now,
        );
        requireOpenVote(vote.closesAt, vote.hasCandidates, now);
      } catch {
        continue;
      }
      items.push({
        id: `vote-deadline:${vote.season.id}:${vote.closesAt.toISOString()}`,
        kind: "VOTE_DEADLINE",
        title: `투표 마감 안내 · ${vote.season.name}`,
        description: "다음 시나리오 투표가 24시간 안에 마감됩니다. 아직 투표하지 않았습니다.",
        href: "/season#scenario-vote",
        occurredAt: new Date(vote.closesAt.getTime() - DAY_MS).toISOString(),
      });
    }
  }
  if (preferences.notifyComments) {
    for (const comment of sources.comments) {
      if (
        (comment.postOwnerId !== sources.actorId && comment.parentOwnerId !== sources.actorId) ||
        comment.parentVisible === false ||
        comment.authorId === sources.actorId ||
        !comment.authorApproved ||
        comment.hiddenAt ||
        comment.archivedAt ||
        comment.postHiddenAt ||
        comment.postArchivedAt ||
        comment.createdAt.getTime() < earliest ||
        comment.createdAt > now
      )
        continue;
      items.push({
        id: `comment:${comment.id}`,
        kind: "COMMENT",
        title: `${comment.parentId ? "새 답글" : "새 댓글"} · ${comment.postTitle}`,
        description:
          comment.parentId && comment.parentOwnerId === sources.actorId
            ? `${comment.authorName}님이 내 댓글에 답글을 남겼습니다.`
            : `${comment.authorName}님이 내 게시글에 ${comment.parentId ? "답글" : "댓글"}을 남겼습니다.`,
        href: comment.parentId
          ? `/community/${encodeURIComponent(comment.postId)}?replyRoot=${encodeURIComponent(comment.parentId)}&replyTarget=${encodeURIComponent(comment.id)}#comment-${encodeURIComponent(comment.id)}`
          : `/community/${encodeURIComponent(comment.postId)}`,
        occurredAt: comment.createdAt.toISOString(),
      });
    }
  }
  const unique = new Map(items.map((item) => [item.id, item]));
  return {
    items: [...unique.values()]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
      .slice(0, PERSONAL_NOTIFICATION_LIMIT),
    enabledKinds,
    asOf: now.toISOString(),
  };
}
