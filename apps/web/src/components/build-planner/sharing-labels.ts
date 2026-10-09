import type { BuildShareStatus } from "@/lib/server/build-sharing";

export const shareStatusLabels: Record<BuildShareStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
  CANCELLED: "신청 취소",
  REVOKED: "승인 해제",
};
