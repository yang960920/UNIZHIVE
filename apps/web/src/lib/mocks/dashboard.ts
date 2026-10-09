import {
  changeSeasonVote,
  getCurrentSeasonPhase,
  getSeasonPhases,
  summarizeMigration,
  summarizeSeasonVotes,
  type BuildSummary,
  type CommunityPostSummary,
  type MigrationStatus,
  type RSVPStatus,
  type SeasonVote,
  type SeasonVoteCandidate,
} from "@uniz/domain";
import { mockAnnouncements } from "./announcements";
import {
  currentSeason,
  currentSeasonPhases,
  DEMO_NOW,
  mockScenarios,
  mockServers,
  MOCK_SOURCE,
  seasonHistory,
} from "./current-season";
import { mockMembers, mockSeasonMemberships, type MockMember } from "./members";
import { nextOperation, operationParticipants, operationRoles } from "./operations";

export interface DemoUserOverride {
  rsvp?: RSVPStatus;
  migrationStatus?: MigrationStatus;
  candidateId?: string;
}
export type DemoOverrides = Record<string, DemoUserOverride>;

export const mockVoteCandidates: SeasonVoteCandidate[] = mockScenarios.slice(1).map((scenario) => ({
  id: `vote-${scenario.id}`,
  seasonId: currentSeason.id,
  scenarioId: scenario.id,
  label: scenario.name,
  createdAt: DEMO_NOW,
  updatedAt: DEMO_NOW,
}));

export const mockSeasonVotes: SeasonVote[] = mockMembers.slice(1, 28).map((member, index) => ({
  id: `ballot-${member.userId}`,
  seasonId: currentSeason.id,
  candidateId: mockVoteCandidates[index < 14 ? 0 : index < 23 ? 1 : 2]!.id,
  userId: member.userId,
  createdAt: DEMO_NOW,
  updatedAt: DEMO_NOW,
}));

export const recentBuilds: BuildSummary[] = [
  {
    id: "corrosion",
    ownerId: "demo-officer",
    title: "부식 연사 · 보스용",
    description: "빌드 요약 예시 · 장비 데이터와 DPS는 아직 검증하지 않았습니다.",
    version: 3,
    buildVersionId: "corrosion-v3",
    tags: ["보스", "연사"],
    updatedAt: new Date("2026-10-03T00:00:00+09:00"),
  },
  {
    id: "burn-sniper",
    ownerId: "demo-member",
    title: "화상 저격 · 탐사용",
    description: "빌드 요약 예시",
    version: 2,
    buildVersionId: "burn-sniper-v2",
    tags: ["탐사", "저격"],
    updatedAt: new Date("2026-10-02T00:00:00+09:00"),
  },
  {
    id: "shield-tank",
    ownerId: "demo-admin",
    title: "실드 샷건",
    description: "빌드 요약 예시",
    version: 1,
    buildVersionId: "shield-tank-v1",
    tags: ["실드", "협동"],
    updatedAt: new Date("2026-09-30T00:00:00+09:00"),
  },
];

export const recentGuides: CommunityPostSummary[] = [
  {
    id: "first-72-hours",
    title: "신규 시즌 첫 72시간 루트",
    category: "GUIDE",
    authorId: "demo-officer",
    publishedAt: new Date("2026-10-04T00:00:00+09:00"),
    imageUrl: null,
    buildVersionId: null,
  },
  {
    id: "settlement-checklist",
    title: "정산 전 꼭 챙길 것 12",
    category: "GUIDE",
    authorId: "demo-member",
    publishedAt: new Date("2026-10-02T00:00:00+09:00"),
    imageUrl: null,
    buildVersionId: null,
  },
  {
    id: "hive-facilities",
    title: "하이브 시설 배치 가이드",
    category: "GUIDE",
    authorId: "demo-admin",
    publishedAt: new Date("2026-09-29T00:00:00+09:00"),
    imageUrl: null,
    buildVersionId: null,
  },
];

export interface GallerySummary {
  id: string;
  title: string;
  authorId: string;
  imageUrl: null;
}
export const gallery: GallerySummary[] = [
  { id: "base-night", title: "우리의 작은 거점", authorId: "demo-officer", imageUrl: null },
  { id: "raid-team", title: "함께한 레이드", authorId: "demo-member", imageUrl: null },
  { id: "dream-landscape", title: "Endless Dream의 풍경", authorId: "demo-admin", imageUrl: null },
];

export interface MigrationMember {
  member: MockMember;
  status: MigrationStatus;
}

/** Read-model boundary: replace this provider, not individual UI cards, with live queries. */
export function getDashboardData(userId?: string, overrides: DemoOverrides = {}) {
  const phases = getSeasonPhases(currentSeasonPhases, currentSeason.id);
  const currentPhase = getCurrentSeasonPhase(phases, currentSeason.id, DEMO_NOW)!;
  const memberships = mockSeasonMemberships.map((membership) => ({
    ...membership,
    migrationStatus: overrides[membership.userId]?.migrationStatus ?? membership.migrationStatus,
  }));
  const migration = summarizeMigration(memberships, currentSeason.id);
  let votes = mockSeasonVotes;
  for (const [voterId, override] of Object.entries(overrides)) {
    if (!override.candidateId) continue;
    const result = changeSeasonVote(votes, mockVoteCandidates, memberships, {
      seasonId: currentSeason.id,
      userId: voterId,
      candidateId: override.candidateId,
      voteId: `ballot-${voterId}`,
      closesAt: currentSeason.voteClosesAt!,
      now: DEMO_NOW,
    });
    if (result.ok) votes = result.votes;
  }
  const tallies = summarizeSeasonVotes(mockVoteCandidates, votes, currentSeason.id);
  const myVote = votes.find((vote) => vote.userId === userId);
  const candidates = mockVoteCandidates.map((candidate) => {
    const tally = tallies.find((item) => item.candidateId === candidate.id)!;
    return {
      ...candidate,
      scenario: mockScenarios.find((scenario) => scenario.id === candidate.scenarioId)!,
      votes: tally.votes,
      percent: tally.percent,
      selected: myVote?.candidateId === candidate.id,
    };
  });
  const participants = operationParticipants.map((participant) => ({
    ...participant,
    status: overrides[participant.userId]?.rsvp ?? participant.status,
  }));
  // Season members without an initial RSVP can make their first local demo RSVP.
  for (const member of mockMembers) {
    const status = overrides[member.userId]?.rsvp;
    if (status && !participants.some((participant) => participant.userId === member.userId)) {
      participants.push({
        id: `participant-${member.userId}`,
        operationId: nextOperation.id,
        userId: member.userId,
        roleId: null,
        status,
        createdAt: DEMO_NOW,
        updatedAt: DEMO_NOW,
      });
    }
  }
  const going = participants.filter((participant) => participant.status === "GOING");
  const migrationMembers: MigrationMember[] = memberships.map((membership) => ({
    member: mockMembers.find((member) => member.userId === membership.userId)!,
    status: membership.migrationStatus,
  }));
  return {
    source: MOCK_SOURCE,
    demoNow: DEMO_NOW,
    currentSeason: {
      ...currentSeason,
      scenario: mockScenarios[0]!,
      server: mockServers[0]!,
      phases,
      currentPhase,
      settlementDaysRemaining: Math.ceil(
        (currentSeason.settlementAt.getTime() - DEMO_NOW.getTime()) / 86_400_000,
      ),
    },
    nextOperation: {
      ...nextOperation,
      roles: operationRoles,
      goingCount: going.length,
      maybeCount: participants.filter((participant) => participant.status === "MAYBE").length,
      unavailableCount: participants.filter((participant) => participant.status === "UNAVAILABLE")
        .length,
      myRsvp: participants.find((participant) => participant.userId === userId)?.status ?? null,
      participantMembers: going.map((participant) =>
        mockMembers.find((member) => member.userId === participant.userId)!,
      ),
    },
    migration: {
      total: migration.total,
      readyCount: migration.ready,
      percent: migration.readinessPercent,
      counts: migration.counts,
      members: migrationMembers,
      myStatus:
        memberships.find((membership) => membership.userId === userId)?.migrationStatus ?? null,
    },
    vote: {
      nextSeasonNumber: currentSeason.seasonNumber + 1,
      closesAt: currentSeason.voteClosesAt!,
      candidates,
      totalVotes: votes.length,
      totalEligible: memberships.length,
      selectedCandidateId: myVote?.candidateId ?? null,
    },
    members: mockMembers,
    announcements: mockAnnouncements,
    recentBuilds,
    recentGuides,
    gallery,
    steam: { count: null, source: MOCK_SOURCE },
    officialNews: {
      title: "공식 소식 연결 준비 중",
      description: "검증된 소식이 연결되면 여기에 표시합니다.",
      source: MOCK_SOURCE,
      publishedAt: null,
    },
    onlineCount: mockMembers.filter((member) => member.online).length,
    pendingCount: 2,
    seasonHistory,
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;
export type VoteCandidateView = DashboardData["vote"]["candidates"][number];
export const mockDashboard = getDashboardData();
