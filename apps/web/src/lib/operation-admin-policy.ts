import { z } from "zod";
import { canCreateOperation, OPERATION_TYPES, type Operation, type Season } from "@uniz/domain";
import type { CurrentUser } from "./auth-policy";

export class OperationAdministrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationAdministrationError";
  }
}

const date = z.iso.datetime({ offset: true });
export const operationAdministrationSchema = z
  .object({
    action: z.literal("SAVE_OPERATION"),
    id: z.uuid().optional(),
    expectedUpdatedAt: date.optional(),
    seasonId: z.uuid().nullable(),
    title: z.string().trim().min(2).max(120),
    type: z.enum(OPERATION_TYPES),
    description: z.string().trim().max(5000),
    startsAt: date,
    endsAt: date.nullable(),
    capacity: z.number().int().min(1).max(10000),
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]),
  })
  .strict()
  .refine((input) => Boolean(input.id) === Boolean(input.expectedUpdatedAt), {
    path: ["expectedUpdatedAt"],
    message: "수정할 작전의 최신 저장 시각이 필요합니다. 화면을 새로고침해 주세요.",
  });

export type OperationAdministrationInput = z.infer<typeof operationAdministrationSchema>;

export function requireOperationAdministrator(actor: CurrentUser | null): CurrentUser {
  if (!actor) throw new OperationAdministrationError("Discord로 로그인한 후 다시 시도해 주세요.");
  if (actor.isMock || actor.id.startsWith("demo-"))
    throw new OperationAdministrationError("실제 운영 계정으로 로그인해 주세요.");
  if (!canCreateOperation(actor) || (actor.role !== "OFFICER" && actor.role !== "ADMIN"))
    throw new OperationAdministrationError("작전 관리 권한이 필요합니다.");
  return actor;
}

type ExistingOperation = Pick<Operation, "seasonId" | "startsAt" | "status" | "updatedAt">;
type OperationSeason = Pick<
  Season,
  "id" | "status" | "startsAt" | "settlementAt" | "approvalStatus"
>;

/** Apply only to records held under the administration transaction's row locks. */
export function assertOperationSaveAllowed({
  input,
  existing,
  currentSeason,
  targetSeason,
  participantCount,
  goingCount,
  now,
}: {
  input: OperationAdministrationInput;
  existing: ExistingOperation | null;
  currentSeason: OperationSeason | null;
  targetSeason: OperationSeason | null;
  participantCount: number;
  goingCount: number;
  now: Date;
}): void {
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (endsAt && endsAt <= startsAt)
    throw new OperationAdministrationError("종료 시각은 시작 시각보다 늦어야 합니다.");
  if (!existing && input.status !== "SCHEDULED")
    throw new OperationAdministrationError("새 작전은 예정 상태로 등록해 주세요.");
  if (existing) {
    if (existing.status !== "SCHEDULED")
      throw new OperationAdministrationError("완료되거나 취소된 작전은 수정할 수 없습니다.");
    if (
      !input.expectedUpdatedAt ||
      new Date(input.expectedUpdatedAt).getTime() !== existing.updatedAt.getTime()
    )
      throw new OperationAdministrationError(
        "다른 관리자가 작전을 변경했습니다. 화면을 새로고침한 후 다시 저장해 주세요.",
      );
    if (existing.seasonId !== input.seasonId && participantCount > 0)
      throw new OperationAdministrationError("참석 응답이 있는 작전은 시즌을 변경할 수 없습니다.");
    if (existing.seasonId && !currentSeason)
      throw new OperationAdministrationError("연결된 시즌을 찾을 수 없습니다.");
    if (currentSeason && currentSeason.status !== "PLANNED" && currentSeason.status !== "ACTIVE")
      throw new OperationAdministrationError(
        "정산 중이거나 보관된 시즌의 작전은 수정할 수 없습니다.",
      );
    if (currentSeason?.approvalStatus && currentSeason.approvalStatus !== "APPROVED")
      throw new OperationAdministrationError("승인되지 않은 시즌의 작전은 수정할 수 없습니다.");
  }
  if (
    (input.status === "SCHEDULED" ||
      !existing ||
      startsAt.getTime() !== existing.startsAt.getTime()) &&
    startsAt <= now
  )
    throw new OperationAdministrationError("작전 시작 시각은 현재 시각보다 늦어야 합니다.");
  if (input.status === "COMPLETED" && startsAt > now)
    throw new OperationAdministrationError("시작 전 작전은 완료 처리할 수 없습니다.");
  if (input.capacity < goingCount)
    throw new OperationAdministrationError("작전 정원은 현재 참가 확정 인원보다 적을 수 없습니다.");
  if (input.seasonId) {
    if (!targetSeason || targetSeason.id !== input.seasonId)
      throw new OperationAdministrationError("연결할 시즌을 찾을 수 없습니다.");
    if (targetSeason.approvalStatus && targetSeason.approvalStatus !== "APPROVED")
      throw new OperationAdministrationError("승인된 시즌에만 작전을 등록할 수 있습니다.");
    if (targetSeason.status !== "PLANNED" && targetSeason.status !== "ACTIVE")
      throw new OperationAdministrationError(
        "예정 또는 진행 중인 시즌에만 작전을 등록할 수 있습니다.",
      );
    if (
      startsAt < targetSeason.startsAt ||
      (targetSeason.settlementAt !== null && (endsAt ?? startsAt) > targetSeason.settlementAt)
    )
      throw new OperationAdministrationError(
        "작전 일정은 시즌 시작부터 정산 시각 사이여야 합니다.",
      );
  }
}
