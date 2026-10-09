import type { SeasonServerType, TrancePhenomenon } from "./season-environment";

export const HIVE_ROLES = ["GUEST", "APPLICANT", "MEMBER", "OFFICER", "ADMIN"] as const;
export type HiveRole = (typeof HIVE_ROLES)[number];

export interface AuditTimestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface User extends AuditTimestamps {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  role: HiveRole;
}

export interface MemberProfile extends AuditTimestamps {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  onceHumanNickname: string;
  /** Private server data. Never include this in a public member response. */
  onceHumanUid: string | null;
  bio: string | null;
  joinedAt: Date;
}

export type PublicMemberProfile = Omit<MemberProfile, "onceHumanUid">;

export function toPublicMemberProfile(profile: MemberProfile): PublicMemberProfile {
  const { onceHumanUid: privateUid, ...publicProfile } = profile;
  void privateUid;
  return publicProfile;
}

export interface Scenario {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface Server {
  id: string;
  scenarioId: string;
  name: string;
  region: string;
}

export const SEASON_STATUSES = ["PLANNED", "ACTIVE", "SETTLEMENT", "ARCHIVED"] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];
export const SEASON_APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type SeasonApprovalStatus = (typeof SEASON_APPROVAL_STATUSES)[number];

export interface Season extends AuditTimestamps {
  id: string;
  seasonNumber: number;
  scenarioId: string;
  serverId: string;
  name: string;
  status: SeasonStatus;
  /** Older public demo records predate approval; persisted seasons always have this field. */
  approvalStatus?: SeasonApprovalStatus;
  /** Optional only for public demo records created before server environments were recorded. */
  serverType?: SeasonServerType;
  trancePhenomenon?: TrancePhenomenon;
  /** Permanent servers open HIVE migration separately from scenario progress. */
  migrationOpen?: boolean;
  startsAt: Date;
  settlementAt: Date | null;
  currentPhaseId: string | null;
  /** Persisted seasons advance only when an administrator changes this order. */
  currentPhaseOrder?: number;
  voteClosesAt: Date | null;
}

/** A season can have any number of phases. The ordering starts at one. */
export interface SeasonPhase {
  id: string;
  seasonId: string;
  name: string;
  order: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export const MIGRATION_STATUSES = [
  "UNDECIDED",
  "JOINING",
  "PRE_REGISTERED",
  "READY",
  "MIGRATED",
] as const;
export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

/** Season participation is historical data, separate from identity and profile. */
export interface SeasonMembership extends AuditTimestamps {
  id: string;
  seasonId: string;
  userId: string;
  migrationStatus: MigrationStatus;
  joinedAt: Date;
  /** Removing participation preserves votes and other historical references. */
  removedAt?: Date | null;
  removedById?: string | null;
}

export interface SeasonVoteCandidate extends AuditTimestamps {
  id: string;
  seasonId: string;
  scenarioId: string;
  label: string;
}

export interface SeasonVote extends AuditTimestamps {
  id: string;
  seasonId: string;
  candidateId: string;
  userId: string;
}

export const OPERATION_TYPES = ["PRIME_WAR", "RAID", "FARM", "EXPLORATION", "OTHER"] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];
export const RSVP_STATUSES = ["GOING", "MAYBE", "UNAVAILABLE"] as const;
export type RSVPStatus = (typeof RSVP_STATUSES)[number];

export interface Operation extends AuditTimestamps {
  id: string;
  seasonId: string | null;
  title: string;
  type: OperationType;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  capacity: number;
  createdById: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
}

export interface OperationRole {
  id: string;
  operationId: string;
  name: string;
  capacity: number;
}

export interface OperationParticipant extends AuditTimestamps {
  id: string;
  operationId: string;
  userId: string;
  roleId: string | null;
  status: RSVPStatus;
}

export interface Announcement extends AuditTimestamps {
  id: string;
  title: string;
  content: string;
  authorId: string;
  isPinned: boolean;
  publishedAt: Date;
}

export interface CommunityPostSummary {
  id: string;
  title: string;
  category: "GUIDE" | "TIP" | "QUESTION" | "GALLERY" | "GENERAL";
  authorId: string;
  publishedAt: Date;
  imageUrl: string | null;
  buildVersionId: string | null;
}

export interface Build extends AuditTimestamps {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  visibility: "PRIVATE" | "HIVE" | "PUBLIC";
  archivedAt: Date | null;
}

/** An immutable snapshot; shape remains unverified until Build Data Specification v0.1. */
export interface BuildVersion {
  id: string;
  buildId: string;
  version: number;
  schemaVersion: string;
  loadoutSnapshot: Record<string, unknown>;
  notes: string | null;
  createdAt: Date;
}

export interface BuildSummary {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  version: number;
  buildVersionId: string;
  tags: readonly string[];
  updatedAt: Date;
}
