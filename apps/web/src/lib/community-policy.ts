import { z } from "zod";
import type { CurrentUser } from "./auth-policy";

export const COMMUNITY_CATEGORIES = [
  "GUIDE",
  "TIP",
  "QUESTION",
  "BUILD",
  "SHOWCASE",
  "GENERAL",
] as const;
export type CommunityCategory = (typeof COMMUNITY_CATEGORIES)[number];
export type CommunitySection = "BOARD" | "SHOWCASE";
export const COMMUNITY_CATEGORY_LABELS: Record<CommunityCategory, string> = {
  GUIDE: "공략",
  TIP: "팁",
  QUESTION: "질문",
  BUILD: "빌드 공유",
  SHOWCASE: "자랑",
  GENERAL: "자유게시",
};
export const COMMUNITY_PAGE_SIZE = 20;
export const COMMUNITY_REPLY_PAGE_SIZE = 10;
export const COMMUNITY_BUILD_OPTION_LIMIT = 100;
const date = z.iso.datetime({ offset: true });
export type CommunityErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_INPUT"
  | "UNAVAILABLE"
  | "LEFT"
  | "REAUTH";
const messages: Record<CommunityErrorCode, string> = {
  UNAUTHENTICATED: "승인된 Discord 멤버로 로그인해 주세요.",
  FORBIDDEN: "이 작업을 처리할 권한이 없습니다.",
  NOT_FOUND: "글을 찾을 수 없거나 현재 확인할 수 없습니다.",
  CONFLICT: "다른 변경이 저장되었습니다. 새로고침한 뒤 다시 확인해 주세요.",
  INVALID_INPUT: "제목, 본문, 카테고리와 연결할 공유 세팅을 확인해 주세요.",
  UNAVAILABLE: "로그인은 유지됩니다. 연결 확인 후 잠시 뒤 다시 시도해 주세요.",
  LEFT: "UNIZ Discord 서버의 멤버 상태를 확인해 주세요.",
  REAUTH: "Discord로 다시 로그인해 주세요.",
};
export class CommunityError extends Error {
  constructor(public readonly code: CommunityErrorCode) {
    super(messages[code]);
    this.name = "CommunityError";
  }
}
export function isCommunityStaff(actor: Pick<CurrentUser, "role">): boolean {
  return actor.role === "OFFICER" || actor.role === "ADMIN";
}
export function requireCommunityActor(actor: CurrentUser | null): CurrentUser {
  if (
    !actor ||
    actor.isMock ||
    actor.id.startsWith("demo-") ||
    !["MEMBER", "OFFICER", "ADMIN"].includes(actor.role)
  ) {
    throw new CommunityError("FORBIDDEN");
  }
  return actor;
}
export function requireCommunityStaff(actor: CurrentUser): void {
  if (!isCommunityStaff(actor)) throw new CommunityError("FORBIDDEN");
}
export function requireCommunityOwner(actor: CurrentUser, authorId: string): void {
  if (actor.id !== authorId) throw new CommunityError("FORBIDDEN");
}
export function requireCommunityVersion(expected: string, actual: Date): void {
  if (new Date(expected).getTime() !== actual.getTime()) throw new CommunityError("CONFLICT");
}
export function nextCommunityVersion(actual?: Date): Date {
  return new Date(Math.max(Date.now(), (actual?.getTime() ?? 0) + 1));
}
export const communityPostSaveSchema = z
  .object({
    id: z.uuid().optional(),
    expectedUpdatedAt: date.optional(),
    title: z.string().trim().min(2).max(160),
    body: z.string().trim().min(1).max(20000),
    bodyDocument: z.unknown().optional(),
    youtubeUrl: z.string().nullable().optional(),
    category: z.enum(COMMUNITY_CATEGORIES),
    buildVersionId: z.uuid().nullable(),
    isPinned: z.boolean(),
  })
  .strict()
  .refine((value) => Boolean(value.id) === Boolean(value.expectedUpdatedAt))
  .refine((value) => value.category !== "BUILD" || value.buildVersionId !== null);
export const communityArchiveSchema = z.object({ id: z.uuid(), expectedUpdatedAt: date }).strict();
export const communityModerateSchema = communityArchiveSchema
  .extend({ action: z.enum(["HIDE", "SHOW", "PIN", "UNPIN"]) })
  .strict();
export const communityCommentSaveSchema = z
  .object({
    id: z.uuid().optional(),
    expectedUpdatedAt: date.optional(),
    postId: z.uuid(),
    parentId: z.uuid().nullable().optional(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict()
  .refine((value) => Boolean(value.id) === Boolean(value.expectedUpdatedAt));
export const communityCommentModerateSchema = communityArchiveSchema
  .extend({ action: z.enum(["HIDE", "SHOW"]) })
  .strict();
export const announcementSaveSchema = z
  .object({
    id: z.uuid().optional(),
    expectedUpdatedAt: date.optional(),
    title: z.string().trim().min(2).max(160),
    content: z.string().trim().min(1).max(20000),
    isPinned: z.boolean(),
    publishedAt: date.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.id) === Boolean(value.expectedUpdatedAt));

function firstString(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : null;
}
export function communityDirectorySelection(
  input: { section?: unknown; category?: unknown; includeModerated?: boolean },
  isStaff: boolean,
): {
  section: CommunitySection;
  category: CommunityCategory | null;
  includeModerated: boolean;
  excludeShowcase: boolean;
} {
  const section = firstString(input.section) === "SHOWCASE" ? "SHOWCASE" : "BOARD";
  const includeModerated = Boolean(input.includeModerated && isStaff);
  const suppliedCategory = firstString(input.category);
  const category = COMMUNITY_CATEGORIES.find((value) => value === suppliedCategory) ?? null;
  return {
    section,
    category:
      section === "SHOWCASE"
        ? "SHOWCASE"
        : category === "SHOWCASE" && !includeModerated
          ? null
          : category,
    includeModerated,
    excludeShowcase: section === "BOARD" && !includeModerated,
  };
}
export function communityPage(value: unknown): number {
  const candidate = typeof value === "number" ? value : Number(firstString(value));
  return Number.isSafeInteger(candidate) && candidate >= 1 && candidate <= 100000 ? candidate : 1;
}
export function normalizeCommunityQuery(value: unknown): string {
  return (firstString(value) ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
}
export function communitySearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
