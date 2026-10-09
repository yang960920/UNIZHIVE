import { z } from "zod";
import {
  canManageSeason,
  canViewMemberDirectory,
  MIGRATION_STATUSES,
  SEASON_SERVER_TYPES,
  SEASON_STATUSES,
  TRANCE_PHENOMENA,
  type SeasonServerType,
  type SeasonStatus,
} from "@uniz/domain";
import type { CurrentUser } from "./auth-policy";
import { SCENARIO_PRESET_KEYS } from "./scenario-presets";

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });
const title = z.string().trim().min(2).max(100);
const serverNumber = z
  .string()
  .length(4)
  .regex(/^[0-9]{4}$/);
const seasonNumber = z.number().int().min(0).max(1_000_000);
const version = { id: id.optional(), expectedUpdatedAt: instant.optional() };
const environmentFields = {
  serverType: z.enum(SEASON_SERVER_TYPES).optional(),
  trancePhenomenon: z.enum(TRANCE_PHENOMENA).optional(),
  migrationOpen: z.boolean().optional(),
};
const setupFields = {
  scenarioKey: z.enum(SCENARIO_PRESET_KEYS),
  serverNumber,
  region: title,
  name: title,
  startsAt: instant,
  settlementAt: instant.nullable(),
  gravityContentEnabled: z.boolean().optional(),
  ...environmentFields,
};

export const seasonAdministrationSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("REGISTER_SERVER"),
        scenarioKey: z.enum(SCENARIO_PRESET_KEYS),
        serverNumber,
        region: title,
      })
      .strict(),
    z
      .object({
        action: z.literal("CREATE_SEASON_SETUP"),
        ...setupFields,
      })
      .strict(),
    z
      .object({
        action: z.literal("SAVE_SEASON_SETUP"),
        ...version,
        ...setupFields,
        status: z.enum(SEASON_STATUSES).optional(),
        voteClosesAt: instant.nullable().optional(),
      })
      .strict(),
    z
      .object({
        action: z.literal("REVIEW_SEASON"),
        seasonId: id,
        expectedUpdatedAt: instant,
        decision: z.enum(["APPROVE", "REJECT"]),
      })
      .strict(),
    z
      .object({
        action: z.literal("CHANGE_SEASON_PHASE"),
        seasonId: id,
        expectedUpdatedAt: instant,
        direction: z.enum(["PREVIOUS", "NEXT"]),
      })
      .strict(),
    z
      .object({
        action: z.literal("CREATE_SCENARIO"),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(60),
        name: title,
        description: z.string().trim().max(2000).optional(),
      })
      .strict(),
    z
      .object({ action: z.literal("CREATE_SERVER"), scenarioId: id, name: title, region: title })
      .strict(),
    z
      .object({
        action: z.literal("SAVE_SEASON"),
        ...version,
        seasonNumber,
        name: title,
        scenarioId: id,
        serverId: id,
        status: z.enum(SEASON_STATUSES),
        startsAt: instant,
        settlementAt: instant.nullable(),
        voteClosesAt: instant.nullable(),
        gravityContentEnabled: z.boolean().optional(),
        ...environmentFields,
      })
      .strict(),
    z
      .object({
        action: z.literal("SAVE_PHASE"),
        ...version,
        seasonId: id,
        name: title,
        order: z.number().int().min(1).max(1000),
        startsAt: instant.nullable(),
        endsAt: instant.nullable(),
      })
      .strict(),
    z
      .object({ action: z.literal("ADD_CANDIDATE"), seasonId: id, scenarioId: id, label: title })
      .strict(),
    z
      .object({
        action: z.literal("ADD_PRESET_CANDIDATE"),
        seasonId: id,
        scenarioKey: z.enum(SCENARIO_PRESET_KEYS),
        label: title,
      })
      .strict(),
    z
      .object({
        action: z.literal("UPDATE_MEMBERSHIP"),
        seasonId: id,
        userId: id,
        expectedUpdatedAt: instant,
        migrationStatus: z.enum(MIGRATION_STATUSES),
      })
      .strict(),
    z
      .object({
        action: z.literal("REMOVE_MEMBER"),
        seasonId: id,
        userId: id,
        expectedUpdatedAt: instant,
      })
      .strict(),
    z
      .object({
        action: z.literal("ENROL_MEMBERS"),
        seasonId: id,
        userIds: z.array(id).min(1).max(200),
      })
      .strict(),
  ])
  .superRefine((input, context) => {
    if (
      input.action === "CREATE_SEASON_SETUP" ||
      input.action === "SAVE_SEASON_SETUP" ||
      input.action === "SAVE_SEASON"
    ) {
      const creating = input.action === "CREATE_SEASON_SETUP" || !input.id;
      if (creating) {
        for (const field of ["serverType", "trancePhenomenon"] as const) {
          if (input[field] === "UNKNOWN")
            context.addIssue({
              code: "custom",
              message: "새 시즌의 서버 유형과 트랜스 현상을 선택해 주세요.",
              path: [field],
            });
        }
      }
      if (input.serverType === "PERMANENT" && input.settlementAt !== null)
        context.addIssue({
          code: "custom",
          message: "영구 서버에는 정산일을 설정할 수 없습니다.",
          path: ["settlementAt"],
        });
    }
    if (
      (input.action === "SAVE_SEASON" ||
        input.action === "SAVE_SEASON_SETUP" ||
        input.action === "SAVE_PHASE") &&
      Boolean(input.id) !== Boolean(input.expectedUpdatedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "수정할 기록의 저장 시점을 확인해 주세요.",
        path: ["expectedUpdatedAt"],
      });
    }
    if (input.action === "ENROL_MEMBERS" && new Set(input.userIds).size !== input.userIds.length) {
      context.addIssue({
        code: "custom",
        message: "동일한 멤버를 중복 선택할 수 없습니다.",
        path: ["userIds"],
      });
    }
  });

export type SeasonAdministrationMutation = z.infer<typeof seasonAdministrationSchema>;
export type SaveSeasonInput = Extract<SeasonAdministrationMutation, { action: "SAVE_SEASON" }>;
export type SavePhaseInput = Extract<SeasonAdministrationMutation, { action: "SAVE_PHASE" }>;
export type SaveSeasonSetupInput = Extract<
  SeasonAdministrationMutation,
  { action: "SAVE_SEASON_SETUP" | "CREATE_SEASON_SETUP" }
>;

export const seasonAdministrationErrors = {
  UNAUTHENTICATED: "Discord 운영 계정으로 로그인해 주세요.",
  UNAVAILABLE: "Discord 연결을 잠시 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  FORBIDDEN: "시즌 관리는 승인된 운영진만 사용할 수 있습니다.",
  MOCK_ACTOR: "개발 계정은 실제 시즌을 변경할 수 없습니다.",
  INVALID_INPUT: "입력한 시즌 정보를 확인해 주세요.",
  NOT_FOUND: "등록된 기록을 찾을 수 없습니다. 화면을 새로고침해 주세요.",
  CONFLICT: "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 입력해 주세요.",
  DUPLICATE: "같은 번호·이름·순서의 기록이 이미 등록되어 있습니다.",
  SERVER_MISMATCH: "선택한 시나리오에 속한 서버를 선택해 주세요.",
  SERVER_REGION_MISMATCH: "등록된 서버의 지역과 입력값이 다릅니다. 새로고침 후 다시 선택해 주세요.",
  ARCHIVED: "보관된 시즌은 변경할 수 없습니다.",
  LIFECYCLE: "시즌은 계획 → 진행 → 정산 → 보관 순서로 변경해 주세요.",
  ACTIVE_EXISTS: "진행 또는 정산 중인 시즌을 먼저 마무리해 주세요.",
  ACTIVATION: "현재 시즌 단계와 시즌 시작 일정을 확인해 주세요.",
  IDENTITY_LOCKED: "참가 기록이 있거나 시작된 시즌의 번호·시나리오·서버는 변경할 수 없습니다.",
  DATES: "시작일보다 정산일이 뒤에 오도록 입력해 주세요.",
  PHASE_DATES: "단계의 시작·종료일을 함께 입력하고 시즌 기간 안에 설정해 주세요.",
  PHASE_OVERLAP: "시즌 단계의 날짜 또는 순서가 다른 단계와 겹칩니다.",
  PHASE_STARTED: "이미 시작된 단계의 시작일·순서를 바꾸거나 기간을 줄일 수 없습니다.",
  HISTORY_DATES: "기존 작전·투표·단계 기록을 벗어나는 일정으로 변경할 수 없습니다.",
  VOTE_CANDIDATES: "투표를 열려면 시나리오 후보를 두 개 이상 등록해 주세요.",
  VOTE_HISTORY: "투표 기록이 생긴 뒤에는 후보 추가·투표 제거·마감된 투표 재개가 불가능합니다.",
  OPERATIONS_OPEN: "예정된 작전을 완료 또는 취소한 후 시즌을 정산·보관해 주세요.",
  MEMBERS: "현재 승인된 Discord 멤버만 시즌에 등록할 수 있습니다.",
  APPROVAL: "관리자의 승인을 받은 시즌에서 사용할 수 있습니다.",
  REVIEW: "관리자만 승인 대기 중인 시즌을 검토할 수 있습니다.",
  PHASE_BOUNDS: "첫 단계 이전이나 마지막 단계 이후로 이동할 수 없습니다.",
  PERMANENT_PHASES: "영구 서버는 휴식기로 고정되어 단계를 변경할 수 없습니다.",
  PERMANENT_SETTLEMENT: "영구 서버에는 정산일을 설정할 수 없습니다.",
  FIXED_PHASES:
    "시나리오 단계는 자동으로 등록됩니다. 관리자의 이전·다음 단계 버튼을 이용해 주세요.",
} as const;
export type SeasonAdministrationErrorCode = keyof typeof seasonAdministrationErrors;

export class SeasonAdministrationError extends Error {
  constructor(public readonly code: SeasonAdministrationErrorCode) {
    super(seasonAdministrationErrors[code]);
    this.name = "SeasonAdministrationError";
  }
}

export function requireSeasonMember(actor: CurrentUser | null): CurrentUser {
  if (!actor) throw new SeasonAdministrationError("UNAUTHENTICATED");
  if (actor.isMock || actor.id.startsWith("demo-"))
    throw new SeasonAdministrationError("MOCK_ACTOR");
  if (!canViewMemberDirectory(actor)) throw new SeasonAdministrationError("FORBIDDEN");
  return actor;
}

export function requireSeasonAdministrator(actor: CurrentUser | null): CurrentUser {
  if (!actor) throw new SeasonAdministrationError("UNAUTHENTICATED");
  if (actor.isMock || actor.id.startsWith("demo-"))
    throw new SeasonAdministrationError("MOCK_ACTOR");
  if (!canManageSeason(actor)) throw new SeasonAdministrationError("FORBIDDEN");
  return actor;
}

export interface SeasonSchedule {
  startsAt: Date;
  settlementAt: Date | null;
  voteClosesAt: Date | null;
}
export interface PhaseSchedule {
  id: string;
  order: number;
  startsAt: Date | null;
  endsAt: Date | null;
}
export interface ScheduledOperation {
  startsAt: Date;
  endsAt: Date | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
}

export function assertSeasonMutable(status: SeasonStatus): void {
  if (status === "ARCHIVED") throw new SeasonAdministrationError("ARCHIVED");
}

export function assertSeasonVersion(expected: string | undefined, actual: Date): void {
  if (!expected || new Date(expected).getTime() !== actual.getTime())
    throw new SeasonAdministrationError("CONFLICT");
}

export function nextSeasonVersion(previous: Date, now = new Date()): Date {
  return new Date(Math.max(previous.getTime() + 1, now.getTime()));
}

export function nextSeasonPhaseOrder(
  current: number,
  phases: readonly Pick<PhaseSchedule, "order">[],
  direction: "PREVIOUS" | "NEXT",
): number {
  const next = current + (direction === "NEXT" ? 1 : -1);
  if (
    !Number.isInteger(current) ||
    current < 1 ||
    !phases.some((phase) => phase.order === current) ||
    !phases.some((phase) => phase.order === next)
  )
    throw new SeasonAdministrationError("PHASE_BOUNDS");
  return next;
}

export function assertSeasonLifecycle(
  previous: SeasonStatus | null,
  next: SeasonStatus,
  schedule: SeasonSchedule,
  phases: readonly PhaseSchedule[],
  options: {
    otherCurrentSeason: boolean;
    scheduledOperations: boolean;
    now: Date;
    allowArchivedMetadata?: boolean;
    allowExistingStatusMetadata?: boolean;
    currentPhaseOrder?: number;
    serverType?: SeasonServerType;
  },
): void {
  const permanent = options.serverType === "PERMANENT";
  if (permanent && schedule.settlementAt !== null)
    throw new SeasonAdministrationError("PERMANENT_SETTLEMENT");
  if (
    previous &&
    !(previous === "ARCHIVED" && next === "ARCHIVED" && options.allowArchivedMetadata)
  )
    assertSeasonMutable(previous);
  const order = SEASON_STATUSES;
  if (
    (!previous && next !== "PLANNED") ||
    (previous &&
      next !== previous &&
      order.indexOf(next) !== order.indexOf(previous) + 1 &&
      !(permanent && previous === "ACTIVE" && next === "ARCHIVED"))
  )
    throw new SeasonAdministrationError("LIFECYCLE");
  const existingStatusMetadata = options.allowExistingStatusMetadata && previous === next;
  if (
    (next === "ACTIVE" || next === "SETTLEMENT") &&
    options.otherCurrentSeason &&
    !existingStatusMetadata
  )
    throw new SeasonAdministrationError("ACTIVE_EXISTS");
  if (
    next === "ACTIVE" &&
    !existingStatusMetadata &&
    (options.now < schedule.startsAt ||
      (schedule.settlementAt && options.now >= schedule.settlementAt) ||
      (!permanent &&
        (options.currentPhaseOrder === undefined
          ? !phases.some(
              (phase) =>
                phase.startsAt &&
                phase.endsAt &&
                phase.startsAt <= options.now &&
                options.now < phase.endsAt,
            )
          : !phases.some((phase) => phase.order === options.currentPhaseOrder))))
  )
    throw new SeasonAdministrationError("ACTIVATION");
  if (next === "SETTLEMENT" && !schedule.settlementAt && !permanent)
    throw new SeasonAdministrationError("DATES");
  if (
    (next === "SETTLEMENT" || next === "ARCHIVED") &&
    next !== previous &&
    options.scheduledOperations
  )
    throw new SeasonAdministrationError("OPERATIONS_OPEN");
}

export function assertSeasonIdentity(
  previous: Pick<SaveSeasonInput, "seasonNumber" | "scenarioId" | "serverId" | "status">,
  next: Pick<SaveSeasonInput, "seasonNumber" | "scenarioId" | "serverId">,
  hasHistory: boolean,
): void {
  if (
    (hasHistory || previous.status !== "PLANNED") &&
    (previous.seasonNumber !== next.seasonNumber ||
      previous.scenarioId !== next.scenarioId ||
      previous.serverId !== next.serverId)
  )
    throw new SeasonAdministrationError("IDENTITY_LOCKED");
}

export function assertPhaseSchedules(
  schedule: SeasonSchedule,
  phases: readonly PhaseSchedule[],
): void {
  for (const phase of phases) {
    if (
      Boolean(phase.startsAt) !== Boolean(phase.endsAt) ||
      (phase.startsAt &&
        phase.endsAt &&
        (phase.endsAt <= phase.startsAt ||
          phase.startsAt < schedule.startsAt ||
          (schedule.settlementAt && phase.endsAt > schedule.settlementAt)))
    )
      throw new SeasonAdministrationError("PHASE_DATES");
  }
  if (new Set(phases.map((phase) => phase.order)).size !== phases.length)
    throw new SeasonAdministrationError("PHASE_OVERLAP");
  const dated = phases
    .filter((phase) => phase.startsAt && phase.endsAt)
    .sort((a, b) => a.order - b.order);
  for (let index = 1; index < dated.length; index += 1) {
    const previous = dated[index - 1]!;
    const current = dated[index]!;
    if (previous.endsAt! > current.startsAt!) throw new SeasonAdministrationError("PHASE_OVERLAP");
  }
}

export function assertPhaseEdit(previous: PhaseSchedule, next: PhaseSchedule, now: Date): void {
  if (
    previous.startsAt &&
    previous.startsAt <= now &&
    (previous.startsAt.getTime() !== next.startsAt?.getTime() ||
      previous.order !== next.order ||
      !next.endsAt ||
      (previous.endsAt && next.endsAt < previous.endsAt))
  )
    throw new SeasonAdministrationError("PHASE_STARTED");
}

export function assertSeasonSchedule(
  schedule: SeasonSchedule,
  phases: readonly PhaseSchedule[],
  operations: readonly ScheduledOperation[],
  voteDates: readonly Date[],
  options: { candidateCount: number; previousVoteClosesAt: Date | null; now: Date },
): void {
  if (schedule.settlementAt && schedule.settlementAt <= schedule.startsAt)
    throw new SeasonAdministrationError("DATES");
  assertPhaseSchedules(schedule, phases);
  if (
    operations.some(
      (operation) =>
        operation.startsAt < schedule.startsAt ||
        (schedule.settlementAt && (operation.endsAt ?? operation.startsAt) > schedule.settlementAt),
    )
  )
    throw new SeasonAdministrationError("HISTORY_DATES");
  if (schedule.voteClosesAt) {
    if (
      schedule.voteClosesAt <= schedule.startsAt ||
      (schedule.settlementAt && schedule.voteClosesAt > schedule.settlementAt)
    )
      throw new SeasonAdministrationError("HISTORY_DATES");
    if (options.candidateCount < 2) throw new SeasonAdministrationError("VOTE_CANDIDATES");
  }
  if (
    voteDates.length &&
    (!schedule.voteClosesAt ||
      voteDates.some((date) => date < schedule.startsAt || date >= schedule.voteClosesAt!) ||
      (options.previousVoteClosesAt &&
        options.previousVoteClosesAt <= options.now &&
        schedule.voteClosesAt > options.now))
  )
    throw new SeasonAdministrationError("VOTE_HISTORY");
}
