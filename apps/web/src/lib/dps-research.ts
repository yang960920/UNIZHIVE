import { z } from "zod";
import type { CurrentUser } from "./auth-policy";
import {
  contentImageIds,
  parseContentDocument,
  parseYouTubeUrl,
  type ContentDocument,
} from "./content-document";

export const DPS_RESEARCH_STATUSES = {
  DRAFT: "임시 저장",
  PENDING: "검토 대기",
  CHANGES_REQUESTED: "보완 요청",
  REJECTED: "반려",
  APPROVED: "게시 승인",
  CANCELLED: "신청 취소",
  REVOKED: "게시 중단",
} as const;
export type DpsResearchStatus = keyof typeof DPS_RESEARCH_STATUSES;
export interface DpsTrial {
  dps: number | null;
  note: string;
}
export interface DpsResearchPayload {
  title: string;
  summary: string;
  buildVersionId: string | null;
  composition: string;
  gamePatch: string;
  scenario: string;
  trance: string;
  platform: string;
  target: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  reloadPolicy: string;
  hitPolicy: string;
  buffPolicy: string;
  procedure: string;
  measuredAt: string | null;
  trials: DpsTrial[];
  evidenceDocument: ContentDocument | null;
  evidenceText: string;
  youtubeUrl: string | null;
}
export interface DpsResearchSummary {
  id: string;
  versionId: string;
  version: number;
  ownerId: string;
  author: string;
  status: DpsResearchStatus;
  payload: DpsResearchPayload;
  updatedAt: string;
  recordUpdatedAt: string;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  publishedVersion: number | null;
  verified: boolean;
  verificationCount: number;
  archivedAt: string | null;
  hiddenAt: string | null;
}
export interface DpsVerification {
  reviewerId: string;
  reviewerName: string;
  note: string;
  confirmed: boolean;
  updatedAt: string;
}
export interface DpsResearchDetail extends DpsResearchSummary {
  isOwner: boolean;
  canEdit: boolean;
  canReview: boolean;
  canVerify: boolean;
  versions: {
    version: number;
    status: DpsResearchStatus;
    createdAt: string;
    isPublished: boolean;
  }[];
  verifications: DpsVerification[];
  buildLink: { title: string; href: string } | null;
}
export interface DpsDirectory {
  items: DpsResearchSummary[];
  page: number;
  hasNext: boolean;
}
export const dpsResearchHref = (record: { id: string; version?: number }) =>
  `/db/dps/${record.id}${record.version ? `?version=${record.version}` : ""}`;
export function isDpsMember(actor: CurrentUser | null | undefined): actor is CurrentUser {
  return (
    !!actor &&
    !actor.isMock &&
    !actor.id.startsWith("demo-") &&
    ["MEMBER", "OFFICER", "ADMIN"].includes(actor.role)
  );
}
export const isDpsStaff = (actor: CurrentUser | null | undefined) =>
  isDpsMember(actor) && ["OFFICER", "ADMIN"].includes(actor.role);
export const isDpsAdministrator = (actor: CurrentUser | null | undefined) =>
  isDpsMember(actor) && actor.role === "ADMIN";
const text = (max: number) => z.string().trim().max(max);
const nullableNumber = (max: number) => z.number().finite().min(0).max(max).nullable();
const payloadSchema = z
  .object({
    title: text(100).min(2),
    summary: text(2000).default(""),
    buildVersionId: z.uuid().nullable().default(null),
    composition: text(5000).default(""),
    gamePatch: text(100).default(""),
    scenario: text(100).default(""),
    trance: text(100).default(""),
    platform: text(100).default("PC"),
    target: text(200).default(""),
    durationSeconds: nullableNumber(3600).default(null),
    distanceMeters: nullableNumber(10000).default(null),
    reloadPolicy: text(500).default(""),
    hitPolicy: text(500).default(""),
    buffPolicy: text(2000).default(""),
    procedure: text(5000).default(""),
    measuredAt: z.iso.date().nullable().default(null),
    trials: z
      .array(
        z
          .object({
            dps: z.number().finite().positive().max(1e12).nullable(),
            note: text(500).default(""),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    evidenceDocument: z
      .unknown()
      .optional()
      .transform((value, ctx) => {
        try {
          return parseContentDocument(value ?? null);
        } catch {
          ctx.addIssue({ code: "custom", message: "근거 이미지와 본문을 확인해 주세요." });
          return z.NEVER;
        }
      }),
    evidenceText: text(20000).default(""),
    youtubeUrl: z
      .string()
      .max(2048)
      .nullable()
      .optional()
      .transform((value, ctx) => {
        try {
          return parseYouTubeUrl(value ?? null);
        } catch {
          ctx.addIssue({ code: "custom", message: "유튜브 링크를 확인해 주세요." });
          return z.NEVER;
        }
      }),
  })
  .strict();
export const dpsSaveSchema = z
  .object({
    id: z.uuid().optional(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }).optional(),
    action: z.enum(["DRAFT", "SUBMIT"]),
    payload: payloadSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (input.id && !input.expectedUpdatedAt) issue("이전 저장 상태를 확인해 주세요.");
    if (input.action !== "SUBMIT") return;
    const p = input.payload;
    if (
      !p.gamePatch ||
      !p.scenario ||
      !p.target ||
      !p.platform ||
      !p.reloadPolicy ||
      !p.hitPolicy ||
      !p.buffPolicy ||
      !p.procedure ||
      !p.measuredAt ||
      !p.durationSeconds ||
      p.distanceMeters === null
    )
      issue("패치·측정일·대상·시간·거리·재현 조건을 모두 적어 주세요.");
    if (!p.buildVersionId && !p.composition)
      issue("빌드 버전 또는 사용한 장비 구성을 적어 주세요.");
    if (!p.trials.length) issue("측정 결과를 한 회 이상 입력해 주세요.");
    if (p.trials.some((trial) => trial.dps === null))
      issue("아직 측정하지 않은 회차의 DPS를 입력하거나 해당 회차를 제거해 주세요.");
    if (!p.youtubeUrl && !contentImageIds(p.evidenceDocument).length)
      issue("원본 유튜브 영상이나 측정 이미지를 첨부해 주세요.");
  });
export const dpsReviewSchema = z
  .object({
    versionId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    action: z.enum(["APPROVE", "CHANGES_REQUESTED", "REJECT", "REVOKE"]),
    note: text(2000).default(""),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.action !== "APPROVE" && input.note.length < 2)
      ctx.addIssue({ code: "custom", message: "보완·반려·게시 중단 사유를 적어 주세요." });
  });
export const dpsVerificationSchema = z
  .object({
    versionId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    confirmed: z.boolean(),
    note: text(1000).min(2),
  })
  .strict();
export const dpsArchiveSchema = z
  .object({ id: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }) })
  .strict();
export function dpsRepresentativeValue(payload: DpsResearchPayload): number | null {
  const measured = payload.trials.filter(
    (trial): trial is DpsTrial & { dps: number } => trial.dps !== null,
  );
  return measured.length
    ? Math.round((measured.reduce((sum, trial) => sum + trial.dps, 0) / measured.length) * 100) /
        100
    : null;
}
export function dpsHasVerification(
  payload: DpsResearchPayload,
  ownerId: string,
  reviews: readonly Pick<DpsVerification, "reviewerId" | "confirmed">[],
): boolean {
  return (
    payload.trials.filter((trial) => trial.dps !== null).length >= 3 &&
    !!(payload.youtubeUrl || contentImageIds(payload.evidenceDocument).length) &&
    new Set(reviews.filter((r) => r.confirmed && r.reviewerId !== ownerId).map((r) => r.reviewerId))
      .size >= 2
  );
}
