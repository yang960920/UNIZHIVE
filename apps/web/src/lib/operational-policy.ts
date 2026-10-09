import { z } from "zod";
import {
  canRsvpOperation,
  canUpdateOwnMigration,
  canVoteInSeason,
  canViewMemberDirectory,
  getCurrentSeasonPhase,
  isFinalSeasonPhase,
  MIGRATION_STATUSES,
  RSVP_STATUSES,
  type Operation,
  type Season,
  type SeasonPhase,
} from "@uniz/domain";
import type { CurrentUser } from "./auth-policy";
import type { OperationalAuthStatus, OperationalPageData } from "./data/operational-types";

/** A cleared real session after a remote authorization failure must never turn into demo data. */
export function selectOperationalAccessMode(
  user: CurrentUser | null,
  status?: OperationalAuthStatus,
): OperationalPageData["mode"] {
  if (status === "UNAVAILABLE") return "ERROR";
  if (status === "REAUTH_REQUIRED") return "REAUTH";
  if (status === "LEFT") return "LEFT";
  if (!user) return status === "AUTHENTICATED" ? "REAUTH" : "DEMO";
  if (user.isMock) return "DEMO";
  return canViewMemberDirectory(user) ? "LIVE" : "PENDING";
}

const id = z.uuid();
export const operationalMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RSVP"), operationId: id, status: z.enum(RSVP_STATUSES) }).strict(),
  z
    .object({ action: z.literal("MIGRATION"), seasonId: id, status: z.enum(MIGRATION_STATUSES) })
    .strict(),
  z.object({ action: z.literal("VOTE"), seasonId: id, candidateId: id }).strict(),
]);
export type OperationalMutation = z.infer<typeof operationalMutationSchema>;

export const operationalErrors = {
  UNAUTHENTICATED: "Discord 멤버 로그인이 필요합니다.",
  MOCK_ACTOR: "개발 계정은 실제 운영 데이터를 변경할 수 없습니다.",
  FORBIDDEN: "승인된 하이브 멤버만 사용할 수 있습니다.",
  NOT_FOUND: "운영 기록을 찾을 수 없습니다. 화면을 새로고침해주세요.",
  NOT_A_SEASON_MEMBER: "이 시즌의 참가 명단에 등록되어 있지 않습니다. 시즌에 먼저 참여해 주세요.",
  SEASON_CLOSED: "현재 시즌 상태에서는 변경할 수 없습니다.",
  PHASE_NOT_OPEN: "진행 중인 시즌 단계가 없습니다. 운영진의 일정을 확인해주세요.",
  MIGRATION_NOT_OPEN: "마지막 단계에서 HIVE 이동을 신청할 수 있습니다.",
  PERMANENT_MIGRATION_NOT_OPEN: "운영진이 영구 서버의 HIVE 이동 신청을 열면 등록할 수 있습니다.",
  VOTE_CLOSED: "투표가 열리지 않았거나 마감되었습니다.",
  INVALID_CANDIDATE: "현재 시즌의 투표 후보를 선택해주세요.",
  OPERATION_CLOSED: "시작되었거나 취소·완료된 작전에는 응답할 수 없습니다.",
  CONTENT_UNAVAILABLE: "현재 시즌에서 사용할 수 없는 콘텐츠입니다. 모집 안내를 확인해 주세요.",
  CAPACITY_REACHED: "작전 정원이 찼습니다. Maybe를 선택하거나 운영진에게 문의해주세요.",
  ROLE_CAPACITY_REACHED:
    "배정된 역할의 정원이 찼습니다. Maybe를 선택하거나 운영진에게 문의해주세요.",
} as const;
export type OperationalErrorCode = keyof typeof operationalErrors;

export class OperationalPolicyError extends Error {
  constructor(public readonly code: OperationalErrorCode) {
    super(operationalErrors[code]);
    this.name = "OperationalPolicyError";
  }
}

export function requireOperationalActor(
  actor: CurrentUser | null,
  action: OperationalMutation["action"],
): CurrentUser {
  if (!actor) throw new OperationalPolicyError("UNAUTHENTICATED");
  if (actor.isMock || actor.id.startsWith("demo-")) throw new OperationalPolicyError("MOCK_ACTOR");
  const permitted =
    action === "RSVP"
      ? canRsvpOperation(actor)
      : action === "VOTE"
        ? canVoteInSeason(actor)
        : canUpdateOwnMigration(actor);
  if (!permitted) throw new OperationalPolicyError("FORBIDDEN");
  return actor;
}

export function requireOpenSeason(
  season: OperationalSeasonState,
  phases: readonly SeasonPhase[],
  member: boolean,
  now: Date,
): void {
  if (!member) throw new OperationalPolicyError("NOT_A_SEASON_MEMBER");
  if (season.serverType === "PERMANENT") {
    if (
      season.approvalStatus !== "APPROVED" ||
      (season.status !== "ACTIVE" && season.status !== "SETTLEMENT")
    )
      throw new OperationalPolicyError("SEASON_CLOSED");
    return;
  }
  if (
    (season.approvalStatus !== undefined && season.approvalStatus !== "APPROVED") ||
    (season.status !== "ACTIVE" && season.status !== "SETTLEMENT") ||
    (season.currentPhaseOrder === undefined &&
      (now < season.startsAt ||
        (season.status === "ACTIVE" && season.settlementAt !== null && now >= season.settlementAt)))
  ) {
    throw new OperationalPolicyError("SEASON_CLOSED");
  }
  if (!getCurrentSeasonPhase(phases, season.id, now, season.currentPhaseOrder))
    throw new OperationalPolicyError("PHASE_NOT_OPEN");
}

type OperationalSeasonState = Pick<
  Season,
  | "id"
  | "status"
  | "startsAt"
  | "settlementAt"
  | "approvalStatus"
  | "currentPhaseOrder"
  | "serverType"
  | "migrationOpen"
>;

/** Party reservations can open before a manually progressed season starts. */
export function requireOpenPartySeason(
  season: Pick<Season, "status" | "approvalStatus">,
  member: boolean,
): void {
  if (!member) throw new OperationalPolicyError("NOT_A_SEASON_MEMBER");
  if (
    season.approvalStatus !== "APPROVED" ||
    (season.status !== "PLANNED" && season.status !== "ACTIVE")
  )
    throw new OperationalPolicyError("SEASON_CLOSED");
}

/** Planned manual seasons can open migration requests once an administrator reaches the last phase. */
export function requireOpenMigrationSeason(
  season: OperationalSeasonState,
  phases: readonly SeasonPhase[],
  member: boolean,
  now: Date,
): void {
  if (season.serverType === "PERMANENT") {
    if (!member) throw new OperationalPolicyError("NOT_A_SEASON_MEMBER");
    if (season.approvalStatus !== "APPROVED" || season.status === "ARCHIVED")
      throw new OperationalPolicyError("SEASON_CLOSED");
    if (!season.migrationOpen) throw new OperationalPolicyError("PERMANENT_MIGRATION_NOT_OPEN");
    return;
  }
  if (season.currentPhaseOrder === undefined) {
    requireOpenSeason(season, phases, member, now);
    return;
  }
  if (!member) throw new OperationalPolicyError("NOT_A_SEASON_MEMBER");
  if (
    (season.approvalStatus !== undefined && season.approvalStatus !== "APPROVED") ||
    season.status === "ARCHIVED"
  )
    throw new OperationalPolicyError("SEASON_CLOSED");
  if (!getCurrentSeasonPhase(phases, season.id, now, season.currentPhaseOrder))
    throw new OperationalPolicyError("PHASE_NOT_OPEN");
  if (!isFinalSeasonPhase(phases, season.id, season.currentPhaseOrder))
    throw new OperationalPolicyError("MIGRATION_NOT_OPEN");
}

export function requireOpenVote(closesAt: Date | null, validCandidate: boolean, now: Date): void {
  if (!closesAt || now >= closesAt) throw new OperationalPolicyError("VOTE_CLOSED");
  if (!validCandidate) throw new OperationalPolicyError("INVALID_CANDIDATE");
}

export function requireOpenOperation(
  operation: Pick<Operation, "startsAt" | "status" | "capacity">,
  status: (typeof RSVP_STATUSES)[number],
  goingCount: number,
  previousStatus: (typeof RSVP_STATUSES)[number] | null,
  now: Date,
  assignedRole?: { capacity: number; goingCount: number },
): void {
  if (operation.status !== "SCHEDULED" || now >= operation.startsAt)
    throw new OperationalPolicyError("OPERATION_CLOSED");
  if (status === "GOING" && previousStatus !== "GOING" && goingCount >= operation.capacity)
    throw new OperationalPolicyError("CAPACITY_REACHED");
  if (
    status === "GOING" &&
    previousStatus !== "GOING" &&
    assignedRole &&
    assignedRole.goingCount >= assignedRole.capacity
  )
    throw new OperationalPolicyError("ROLE_CAPACITY_REACHED");
}
