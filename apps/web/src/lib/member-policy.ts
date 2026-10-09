import { z } from "zod";
import { canApproveMember, canEditMemberProfile, type HiveRole } from "@uniz/domain";
import type { CurrentUser } from "./auth-policy";

export const MEMBER_ROLE_LABELS: Record<HiveRole, string> = {
  GUEST: "가입 보류",
  APPLICANT: "승인 대기",
  MEMBER: "멤버",
  OFFICER: "운영진",
  ADMIN: "관리자",
};

// Controlled reasons prevent private UID or OAuth tokens being entered in audit metadata.
export const REVIEW_REASONS = {
  VERIFIED: "가입 정보 확인 완료",
  PROFILE_REVIEW: "게임 정보 추가 확인 필요",
  MEMBERSHIP_CRITERIA: "가입 기준 미충족",
  DUPLICATE_REQUEST: "중복 신청",
  RECONSIDERATION: "가입 재검토",
  ROLE_REORGANIZATION: "운영 역할 조정",
} as const;
const reviewReasonSchema = z.enum(
  Object.keys(REVIEW_REASONS) as [
    keyof typeof REVIEW_REASONS,
    ...Array<keyof typeof REVIEW_REASONS>,
  ],
);

export const memberChangeSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("approve"), targetId: z.uuid(), reason: reviewReasonSchema })
    .strict(),
  z
    .object({ action: z.literal("reject"), targetId: z.uuid(), reason: reviewReasonSchema })
    .strict(),
  z.object({ action: z.literal("undo"), targetId: z.uuid(), reason: reviewReasonSchema }).strict(),
  z
    .object({ action: z.literal("reopen"), targetId: z.uuid(), reason: reviewReasonSchema })
    .strict(),
  z
    .object({
      action: z.literal("role"),
      targetId: z.uuid(),
      role: z.enum(["MEMBER", "OFFICER", "ADMIN"]),
      reason: reviewReasonSchema,
    })
    .strict(),
]);
export type MemberChange = z.infer<typeof memberChangeSchema>;

export const memberProfileSchema = z
  .object({
    targetId: z.uuid(),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, "프로필 주소는 3자 이상 입력해 주세요.")
      .max(24)
      .regex(/^[a-z0-9_-]+$/, "프로필 주소에는 영문, 숫자, - 및 _를 사용할 수 있습니다."),
    displayName: z.string().trim().min(2, "표시 이름은 2자 이상 입력해 주세요.").max(32),
    nickname: z.string().trim().min(2, "게임 닉네임은 2자 이상 입력해 주세요.").max(32),
    uid: z
      .string()
      .trim()
      .min(1, "게임 UID를 입력해 주세요.")
      .max(32)
      .regex(/^[a-zA-Z0-9_-]+$/, "게임 UID를 확인해 주세요."),
    bio: z.string().trim().max(500, "소개는 500자 이내로 입력해 주세요."),
  })
  .strict();
export type MemberProfileInput = z.infer<typeof memberProfileSchema>;

export interface MemberActionState {
  ok: boolean;
  message: string;
}
export class MemberManagementError extends Error {}

export function isApprovedRole(role: HiveRole): boolean {
  return role === "MEMBER" || role === "OFFICER" || role === "ADMIN";
}

/** Runs on freshly locked database rows, never on a role submitted by the browser. */
export function decideMemberRoleChange(input: {
  actor: CurrentUser;
  target: { id: string; role: HiveRole; profileComplete: boolean };
  change: MemberChange;
  adminCount: number;
  guildEligible: boolean;
}): HiveRole {
  const { actor, target, change, adminCount, guildEligible } = input;
  if (actor.isMock) throw new MemberManagementError("실제 운영 계정으로 로그인해 주세요.");
  if (!canApproveMember(actor))
    throw new MemberManagementError("멤버 관리는 관리자만 처리할 수 있습니다.");
  if (change.targetId !== target.id) throw new MemberManagementError("대상 계정을 확인해 주세요.");
  if (actor.id === target.id)
    throw new MemberManagementError("자신의 권한은 이 화면에서 변경할 수 없습니다.");
  if (
    (target.role === "OFFICER" || target.role === "ADMIN" || change.action === "role") &&
    actor.role !== "ADMIN"
  ) {
    throw new MemberManagementError("운영진과 관리자 권한은 관리자만 변경할 수 있습니다.");
  }
  let nextRole: HiveRole;
  switch (change.action) {
    case "approve":
      if (target.role !== "APPLICANT")
        throw new MemberManagementError("승인 대기 중인 계정만 승인할 수 있습니다.");
      if (!target.profileComplete)
        throw new MemberManagementError("신청자의 게임 프로필 등록이 먼저 필요합니다.");
      if (!guildEligible)
        throw new MemberManagementError(
          "신청자의 Discord 서버 가입 상태를 확인하지 못했습니다. 신청자가 다시 로그인한 뒤 시도해 주세요.",
        );
      nextRole = "MEMBER";
      break;
    case "reject":
      if (target.role !== "APPLICANT")
        throw new MemberManagementError("승인 대기 중인 계정만 보류할 수 있습니다.");
      if (change.reason === "VERIFIED")
        throw new MemberManagementError("가입 보류 사유를 선택해 주세요.");
      nextRole = "GUEST";
      break;
    case "undo":
      if (!isApprovedRole(target.role))
        throw new MemberManagementError("승인된 계정만 승인 취소할 수 있습니다.");
      nextRole = "APPLICANT";
      break;
    case "reopen":
      if (target.role !== "GUEST")
        throw new MemberManagementError("보류된 신청만 다시 검토할 수 있습니다.");
      if (!guildEligible)
        throw new MemberManagementError(
          "Discord 서버 가입 확인이 필요합니다. 대상자가 다시 로그인한 뒤 시도해 주세요.",
        );
      nextRole = "APPLICANT";
      break;
    case "role":
      if (!isApprovedRole(target.role))
        throw new MemberManagementError("멤버 승인 후 운영 역할을 지정해 주세요.");
      if (!guildEligible || !target.profileComplete)
        throw new MemberManagementError(
          "Discord 서버 가입과 프로필 등록이 확인된 멤버만 역할을 변경할 수 있습니다.",
        );
      nextRole = change.role;
      break;
  }
  if (nextRole === target.role)
    throw new MemberManagementError("이미 선택한 권한을 가지고 있습니다.");
  if (target.role === "ADMIN" && nextRole !== "ADMIN" && adminCount <= 1) {
    throw new MemberManagementError("마지막 관리자의 권한은 해제할 수 없습니다.");
  }
  return nextRole;
}

export function assertMemberProfileEditor(actor: CurrentUser, targetId: string): void {
  if (actor.isMock || !canEditMemberProfile(actor, targetId)) {
    throw new MemberManagementError("이 프로필을 수정할 권한이 없습니다.");
  }
}
