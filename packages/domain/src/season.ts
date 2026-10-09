import {
  MIGRATION_STATUSES,
  type MigrationStatus,
  type SeasonMembership,
  type SeasonPhase,
  type SeasonVote,
  type SeasonVoteCandidate,
} from "./types";
import { getScenarioPhaseTemplate } from "./scenario-phases";

export function getSeasonPhases(phases: readonly SeasonPhase[], seasonId: string): SeasonPhase[] {
  return phases.filter((phase) => phase.seasonId === seasonId).sort((a, b) => a.order - b.order);
}

/** Older rows beyond a known scenario's fixed stages remain history, not live progress. */
export function getScenarioSeasonPhases(
  phases: readonly SeasonPhase[],
  seasonId: string,
  scenarioSlug: string,
): SeasonPhase[] {
  const ordered = getSeasonPhases(phases, seasonId);
  const template = getScenarioPhaseTemplate(scenarioSlug);
  return template
    ? ordered.filter((phase) => phase.order >= 1 && phase.order <= template.length)
    : ordered;
}

export function getCurrentSeasonPhase(
  phases: readonly SeasonPhase[],
  seasonId: string,
  now: Date,
  currentPhaseOrder?: number,
): SeasonPhase | null {
  if (currentPhaseOrder !== undefined) {
    if (!Number.isInteger(currentPhaseOrder) || currentPhaseOrder < 1) return null;
    return (
      getSeasonPhases(phases, seasonId).find((phase) => phase.order === currentPhaseOrder) ?? null
    );
  }
  return (
    getSeasonPhases(phases, seasonId).find(
      (phase) =>
        phase.startsAt !== null &&
        phase.startsAt !== undefined &&
        phase.startsAt.getTime() <= now.getTime() &&
        (phase.endsAt === null ||
          phase.endsAt === undefined ||
          now.getTime() < phase.endsAt.getTime()),
    ) ?? null
  );
}

/** Only the final stored phase opens a manual season's HIVE migration requests. */
export function isFinalSeasonPhase(
  phases: readonly SeasonPhase[],
  seasonId: string,
  currentPhaseOrder: number,
): boolean {
  const ordered = getSeasonPhases(phases, seasonId);
  return Boolean(
    Number.isInteger(currentPhaseOrder) &&
    currentPhaseOrder > 0 &&
    ordered.length &&
    ordered.at(-1)?.order === currentPhaseOrder,
  );
}

export interface MigrationSummary {
  total: number;
  ready: number;
  readinessPercent: number;
  counts: Record<MigrationStatus, number>;
}

export function summarizeMigration(
  memberships: readonly SeasonMembership[],
  seasonId?: string,
): MigrationSummary {
  const relevant = memberships.filter(
    (membership) => !membership.removedAt && (!seasonId || membership.seasonId === seasonId),
  );
  const counts = Object.fromEntries(MIGRATION_STATUSES.map((status) => [status, 0])) as Record<
    MigrationStatus,
    number
  >;
  for (const membership of relevant) counts[membership.migrationStatus] += 1;
  const ready = counts.READY + counts.MIGRATED;
  return {
    total: relevant.length,
    ready,
    readinessPercent: relevant.length === 0 ? 0 : Math.round((ready / relevant.length) * 100),
    counts,
  };
}

export interface CandidateVoteResult {
  candidateId: string;
  votes: number;
  percent: number;
}

export function summarizeSeasonVotes(
  candidates: readonly SeasonVoteCandidate[],
  votes: readonly SeasonVote[],
  seasonId: string,
): CandidateVoteResult[] {
  const relevant = candidates.filter((candidate) => candidate.seasonId === seasonId);
  const candidateIds = new Set(relevant.map((candidate) => candidate.id));
  const uniqueVoters = new Map<string, SeasonVote>();
  // Defend read models against stale duplicates: the latest vote is authoritative.
  for (const vote of votes) {
    if (vote.seasonId !== seasonId || !candidateIds.has(vote.candidateId)) continue;
    const previous = uniqueVoters.get(vote.userId);
    if (!previous || previous.updatedAt.getTime() <= vote.updatedAt.getTime()) {
      uniqueVoters.set(vote.userId, vote);
    }
  }
  const validVotes = [...uniqueVoters.values()];
  return relevant.map((candidate) => {
    const count = validVotes.filter((vote) => vote.candidateId === candidate.id).length;
    return {
      candidateId: candidate.id,
      votes: count,
      percent: validVotes.length === 0 ? 0 : Math.round((count / validVotes.length) * 100),
    };
  });
}

export type ChangeVoteResult =
  | { ok: true; votes: SeasonVote[] }
  | { ok: false; reason: "VOTE_CLOSED" | "INVALID_CANDIDATE" | "NOT_A_SEASON_MEMBER" };

export interface ChangeVoteInput {
  seasonId: string;
  userId: string;
  candidateId: string;
  voteId: string;
  closesAt: Date;
  now: Date;
}

/** Replace one member's choice in one season without mutating existing history. */
export function changeSeasonVote(
  votes: readonly SeasonVote[],
  candidates: readonly SeasonVoteCandidate[],
  memberships: readonly Pick<SeasonMembership, "seasonId" | "userId" | "removedAt">[],
  input: ChangeVoteInput,
): ChangeVoteResult {
  if (input.now.getTime() >= input.closesAt.getTime()) return { ok: false, reason: "VOTE_CLOSED" };
  if (
    !memberships.some(
      (member) =>
        !member.removedAt && member.seasonId === input.seasonId && member.userId === input.userId,
    )
  ) {
    return { ok: false, reason: "NOT_A_SEASON_MEMBER" };
  }
  if (
    !candidates.some(
      (candidate) => candidate.id === input.candidateId && candidate.seasonId === input.seasonId,
    )
  ) {
    return { ok: false, reason: "INVALID_CANDIDATE" };
  }
  const previous = votes.find(
    (vote) => vote.seasonId === input.seasonId && vote.userId === input.userId,
  );
  const nextVote: SeasonVote = {
    id: previous?.id ?? input.voteId,
    seasonId: input.seasonId,
    userId: input.userId,
    candidateId: input.candidateId,
    createdAt: previous?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  return {
    ok: true,
    votes: [
      ...votes.filter(
        (vote) => !(vote.seasonId === input.seasonId && vote.userId === input.userId),
      ),
      nextVote,
    ],
  };
}
