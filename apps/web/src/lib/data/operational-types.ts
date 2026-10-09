import type {
  HiveRole,
  MigrationStatus,
  OperationType,
  RSVPStatus,
  SeasonStatus,
  SeasonServerType,
  TrancePhenomenon,
} from "@uniz/domain";
import type { AuthStatus } from "../auth-policy";

/** Explicit public DTO. ISO timestamps cross the server/client boundary without reviving dates. */
export interface OperationalMember {
  id: string;
  name: string;
  handle: string | null;
}

export interface OperationalSeason {
  id: string;
  seasonNumber: number;
  name: string;
  status: SeasonStatus;
  serverType?: SeasonServerType;
  trancePhenomenon?: TrancePhenomenon;
  migrationOpen?: boolean;
  scenario: string;
  server: string;
  startsAt: string;
  settlementAt: string | null;
  daysRemaining: number | null;
  phases: {
    id: string;
    name: string;
    order: number;
    startsAt: string | null;
    endsAt: string | null;
  }[];
  currentPhaseId: string | null;
  currentPhaseOrder: number;
  myMembership: boolean;
}

export interface OperationalData {
  source: "POSTGRESQL";
  asOf: string;
  currentSeason: OperationalSeason | null;
  nextOperation: {
    id: string;
    title: string;
    description: string;
    type: OperationType;
    contentKey?: string | null;
    seasonId?: string | null;
    seasonName?: string | null;
    meetingPoint?: string;
    startsAt: string;
    capacity: number;
    goingCount: number;
    maybeCount: number;
    myRsvp: RSVPStatus | null;
    mayRespond: boolean;
    mayGo?: boolean;
    mayMaybe?: boolean;
    responseNotice?: string;
    members: OperationalMember[];
  } | null;
  migration: {
    total: number;
    ready: number;
    percent: number;
    counts: Record<MigrationStatus, number>;
    myStatus: MigrationStatus | null;
    mayChange: boolean;
    members: (OperationalMember & { status: MigrationStatus })[];
  };
  vote: {
    closesAt: string;
    totalVotes: number;
    totalEligible: number;
    mayVote: boolean;
    candidates: {
      id: string;
      label: string;
      description: string | null;
      count: number;
      percent: number;
      selected: boolean;
    }[];
  } | null;
  announcements: {
    id: string;
    title: string;
    content: string;
    author: string;
    publishedAt: string;
    pinned: boolean;
  }[];
  memberCount: number;
  pendingCount: number | null;
  recentBuilds: { id: string; title: string; author: string; version: number; updatedAt: string }[];
  recentCommunityPosts?: {
    id: string;
    title: string;
    category: string;
    author: string;
    createdAt: string;
    pinned: boolean;
  }[];
  history: {
    id: string;
    seasonNumber: number;
    name: string;
    status: SeasonStatus;
    serverType?: SeasonServerType;
    trancePhenomenon?: TrancePhenomenon;
    scenario: string;
    server: string;
    members: number;
    completedOperations: number;
  }[];
}

export type OperationalPageData =
  | { mode: "DEMO" }
  | { mode: "PENDING" }
  | { mode: "ERROR"; retryAfterSeconds?: number }
  | { mode: "REAUTH" }
  | { mode: "LEFT" }
  | { mode: "LIVE"; data: OperationalData; role: HiveRole };

export type OperationalAuthStatus = AuthStatus;

export type OperationalMutationResult = { ok: true } | { ok: false; message: string };
