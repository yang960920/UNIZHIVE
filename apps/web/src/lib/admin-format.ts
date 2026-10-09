import type { OperationType, SeasonStatus } from "@uniz/domain";

export const seasonStatusLabels: Record<SeasonStatus, string> = {
  PLANNED: "준비 중",
  ACTIVE: "진행 중",
  SETTLEMENT: "정산 중",
  ARCHIVED: "보관됨",
};
export const operationStatusLabels = {
  SCHEDULED: "예정",
  COMPLETED: "완료",
  CANCELLED: "취소",
} as const;
export const operationTypeLabels: Record<OperationType, string> = {
  PRIME_WAR: "프라임 워",
  RAID: "레이드",
  FARM: "파밍",
  EXPLORATION: "탐험",
  OTHER: "기타",
};

export function scheduleDate(value: string | null): string {
  if (!value) return "미정";
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value)) + " KST"
  );
}

export function toKstInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function fromKstInput(
  value: FormDataEntryValue | null,
  optional = false,
  original?: FormDataEntryValue | null,
): string | null {
  if (optional && value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("날짜와 시간을 확인해주세요. 모든 일정은 한국 시간(KST)으로 입력합니다.");
  const date = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(date.getTime()) || toKstInput(date.toISOString()) !== value)
    throw new Error("유효한 날짜와 시간을 입력해주세요.");
  // Keep imported record precision when the visible minute value was left unchanged.
  // This value is still validated as ordinary mutation input by the server policy.
  if (typeof original === "string" && /^\d{4}-\d{2}-\d{2}T/.test(original)) {
    const prior = new Date(original);
    if (Number.isFinite(prior.getTime()) && toKstInput(original) === value)
      return prior.toISOString();
  }
  return date.toISOString();
}

export interface AdministrationActionState {
  ok: boolean;
  message: string;
  href?: string;
}

export function seasonPhaseLabel(order: number, name: string): string {
  return name === `${order}단계` ? name : `${order}단계 · ${name}`;
}
