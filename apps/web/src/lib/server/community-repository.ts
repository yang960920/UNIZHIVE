import "server-only";
import type { HiveRole } from "@uniz/domain";
import type { CommunityCategory, CommunitySection } from "../community-policy";
import {
  accounts,
  and,
  announcements,
  auditLogs,
  builds,
  buildVersions,
  communityComments,
  communityPosts,
  desc,
  eq,
  getDb,
  memberProfiles,
  memberProfileImages,
  sql,
  users,
} from "@uniz/db";
import { z } from "zod";
import { getCurrentAuthState } from "../auth";
import type { CurrentUser } from "../auth-policy";
import {
  announcementSaveSchema,
  CommunityError,
  COMMUNITY_BUILD_OPTION_LIMIT,
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_REPLY_PAGE_SIZE,
  communityArchiveSchema,
  communityDirectorySelection,
  communityCommentModerateSchema,
  communityCommentSaveSchema,
  communityModerateSchema,
  communityPage,
  communityPostSaveSchema,
  communitySearchPattern,
  isCommunityStaff,
  nextCommunityVersion,
  normalizeCommunityQuery,
  requireCommunityActor,
  requireCommunityOwner,
  requireCommunityStaff,
  requireCommunityVersion,
} from "../community-policy";
import { selectOperationalAccessMode } from "../operational-policy";
import { profileImageUrl } from "../profile-image";
import { getSessionGuildEligibilityState } from "./discord-authorization";
import { approvedBuildVersionAccessSql, readApprovedBuildMetadata } from "./build-sharing";
import { bindContentImages } from "./content-media";
import {
  contentExcerptText,
  contentImagePreview,
  contentPlainText,
  parseContentDocument,
  parseYouTubeUrl,
  type ContentDocument,
} from "../content-document";
export { CommunityError } from "../community-policy";

export interface CommunityAuthor {
  id: string;
  name: string;
  handle: string | null;
  imageUrl?: string | null;
}
export interface CommunityPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
}
export interface CommunityPostSummary {
  id: string;
  title: string;
  category: CommunityCategory;
  excerpt: string;
  author: CommunityAuthor;
  isPinned: boolean;
  hiddenAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  canEdit: boolean;
  canArchive: boolean;
  canModerate: boolean;
  hasBuildLink: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  canLike?: boolean;
  coverImage?: { url: string; alt: string } | null;
  imageCount?: number;
}
export interface CommunityComment {
  id: string;
  postId: string;
  body: string;
  author: CommunityAuthor;
  hiddenAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canArchive: boolean;
  canModerate: boolean;
  parentId?: string | null;
  isPlaceholder?: boolean;
  canReply?: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  canLike?: boolean;
  replies?: CommunityComment[];
  replyPagination?: CommunityPagination;
}
export interface CommunityBuildVersion {
  id: string;
  buildId: string;
  title: string;
  version: number;
  visibility: "HIVE" | "PUBLIC";
  href: string;
}
export interface AnnouncementSummary {
  id: string;
  title: string;
  excerpt: string;
  author: CommunityAuthor;
  isPinned: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
export interface AnnouncementDetail extends AnnouncementSummary {
  content: string;
  canManage: boolean;
}
export interface CommunityDirectoryData {
  posts: CommunityPostSummary[];
  announcements: AnnouncementSummary[];
  q: string;
  category: CommunityCategory | null;
  section?: CommunitySection;
  pagination: CommunityPagination;
  canCreate: boolean;
  canModerate: boolean;
  asOf: string;
}
export interface CommunityPostData {
  post: CommunityPostSummary & {
    body: string;
    bodyDocument?: ContentDocument | null;
    youtubeUrl?: string | null;
  };
  comments: CommunityComment[];
  commentPagination: CommunityPagination;
  linkedBuildVersion: CommunityBuildVersion | null;
  buildLinkNotice: string | null;
  canComment: boolean;
  asOf: string;
}
export interface CommunityEditorData {
  initial?: {
    id: string;
    title: string;
    body: string;
    bodyDocument?: ContentDocument | null;
    youtubeUrl?: string | null;
    category: CommunityCategory;
    buildVersionId: string | null;
    isPinned: boolean;
    updatedAt: string;
  };
  buildVersions: CommunityBuildVersion[];
  canPin: boolean;
  buildOptionsTruncated: boolean;
}
export type CommunityReadResult<T> =
  | { mode: "DEMO" | "PENDING" | "ERROR" | "REAUTH" | "LEFT"; retryAfterSeconds?: number }
  | { mode: "LIVE"; role: HiveRole; data: T };

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const AUTHORIZATION_LOCK = 912743110;

async function sessionActor(write: boolean): Promise<CurrentUser> {
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE") throw new CommunityError("UNAVAILABLE");
  if (state.status === "LEFT") throw new CommunityError("LEFT");
  if (state.status === "REAUTH_REQUIRED") throw new CommunityError("REAUTH");
  if (state.status !== "AUTHENTICATED") throw new CommunityError("UNAUTHENTICATED");
  const actor = requireCommunityActor(state.user);
  if (write) {
    const eligibility = await getSessionGuildEligibilityState(actor.id);
    if (eligibility.status !== "MEMBER")
      throw new CommunityError(
        eligibility.status === "LEFT"
          ? "LEFT"
          : eligibility.status === "REAUTH_REQUIRED"
            ? "REAUTH"
            : "UNAVAILABLE",
      );
  }
  return actor;
}

async function verifiedTransaction<T>(
  actor: CurrentUser,
  write: boolean,
  work: (transaction: Transaction, principal: CurrentUser) => Promise<T>,
): Promise<T> {
  return getDb().transaction(
    async (transaction) => {
      // Role changes hold the exclusive authorization gate; record writes share it and lock only
      // their own post/comment/build. This also prevents approved reads racing a demotion.
      await transaction.execute(sql`select pg_advisory_xact_lock_shared(${AUTHORIZATION_LOCK})`);
      const [fresh] = await transaction
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(eq(users.id, actor.id))
        .for("share");
      const principal = requireCommunityActor(fresh ? { ...fresh, isMock: false } : null);
      const [discord] = await transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, principal.id), eq(accounts.provider, "discord")))
        .limit(1);
      if (!discord) throw new CommunityError("REAUTH");
      return work(transaction, principal);
    },
    write ? undefined : { isolationLevel: "repeatable read" },
  );
}

async function provider<T>(
  work: (transaction: Transaction, principal: CurrentUser) => Promise<T>,
): Promise<CommunityReadResult<T>> {
  const state = await getCurrentAuthState();
  const mode = selectOperationalAccessMode(state.user, state.status);
  if (mode !== "LIVE")
    return {
      mode,
      ...(mode === "ERROR" &&
      typeof state.retryAfterSeconds === "number" &&
      Number.isFinite(state.retryAfterSeconds)
        ? { retryAfterSeconds: state.retryAfterSeconds }
        : {}),
    };
  if (!state.user) return { mode: "REAUTH" };
  try {
    let role: HiveRole = state.user.role;
    const data = await verifiedTransaction(state.user, false, async (transaction, principal) => {
      role = principal.role;
      return work(transaction, principal);
    });
    return { mode: "LIVE", role, data };
  } catch (error) {
    return {
      mode:
        error instanceof CommunityError && error.code === "FORBIDDEN"
          ? "PENDING"
          : error instanceof CommunityError && error.code === "REAUTH"
            ? "REAUTH"
            : "ERROR",
    };
  }
}

async function authorized<T>(
  write: boolean,
  work: (transaction: Transaction, principal: CurrentUser) => Promise<T>,
): Promise<T> {
  const actor = await sessionActor(write);
  try {
    return await verifiedTransaction(actor, write, work);
  } catch (error) {
    if (error instanceof CommunityError) throw error;
    throw new CommunityError("UNAVAILABLE");
  }
}
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CommunityError("INVALID_INPUT");
  return result.data;
}
function pageData(
  requested: unknown,
  totalCount: number,
  pageSize = COMMUNITY_PAGE_SIZE,
): CommunityPagination {
  const page = Math.min(communityPage(requested), Math.max(1, Math.ceil(totalCount / pageSize)));
  return {
    page,
    pageSize,
    totalCount,
    hasNextPage: page * pageSize < totalCount,
  };
}
function author(
  row: {
    authorId: string;
    authorName: string;
    authorHandle: string | null;
    authorRole?: HiveRole;
    authorAvatarId?: string | null;
    authorAvatarRevision?: string | null;
  },
  actor: CurrentUser,
): CommunityAuthor {
  const imageAllowed =
    row.authorId === actor.id ||
    actor.role === "ADMIN" ||
    (row.authorRole !== undefined && ["MEMBER", "OFFICER", "ADMIN"].includes(row.authorRole));
  return {
    id: row.authorId,
    name: row.authorName,
    handle: actor.role === "ADMIN" ? row.authorHandle : null,
    imageUrl:
      imageAllowed && row.authorAvatarId && row.authorAvatarRevision
        ? profileImageUrl(row.authorAvatarId, row.authorAvatarRevision)
        : null,
  };
}
const postFields = {
  id: communityPosts.id,
  title: communityPosts.title,
  body: communityPosts.body,
  bodyDocument: communityPosts.bodyDocument,
  youtubeUrl: communityPosts.youtubeUrl,
  category: communityPosts.category,
  buildVersionId: communityPosts.buildVersionId,
  authorId: communityPosts.authorId,
  authorRole: users.role,
  authorName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name}, '멤버')`,
  authorHandle: memberProfiles.handle,
  authorAvatarId: memberProfileImages.id,
  authorAvatarRevision: memberProfileImages.revision,
  isPinned: communityPosts.isPinned,
  hiddenAt: communityPosts.hiddenAt,
  archivedAt: communityPosts.archivedAt,
  createdAt: communityPosts.createdAt,
  updatedAt: communityPosts.updatedAt,
  commentCount: sql<number>`(select count(*)::int from community_comments counted_comment
    inner join users counted_author on counted_author.id = counted_comment.author_id
    where counted_comment.post_id = "community_posts"."id" and counted_comment.hidden_at is null
      and counted_comment.archived_at is null and counted_author.role in ('MEMBER','OFFICER','ADMIN')
      and (counted_comment.parent_id is null or exists (
        select 1 from community_comments counted_parent inner join users parent_author on parent_author.id = counted_parent.author_id
        where counted_parent.id = counted_comment.parent_id and counted_parent.hidden_at is null and parent_author.role in ('MEMBER','OFFICER','ADMIN'))))`,
  likeCount: sql<number>`(select count(*)::int from community_post_likes post_reaction inner join users reacting_member on reacting_member.id = post_reaction.user_id where post_reaction.post_id = "community_posts"."id" and reacting_member.role in ('MEMBER','OFFICER','ADMIN'))`,
};
function postReadFields(actorId: string) {
  return {
    ...postFields,
    likedByMe: sql<boolean>`exists(select 1 from community_post_likes own_post_reaction where own_post_reaction.post_id = "community_posts"."id" and own_post_reaction.user_id = ${actorId})`,
  };
}
type PostRow = typeof communityPosts.$inferSelect & {
  authorRole: HiveRole;
  authorName: string;
  authorHandle: string | null;
  authorAvatarId: string | null;
  authorAvatarRevision: string | null;
  commentCount: number;
  likeCount: number;
  likedByMe?: boolean;
};
function postDocument(value: unknown): ContentDocument | null {
  try {
    return parseContentDocument(value);
  } catch {
    // Invalid image metadata must not prevent reading the legacy text summary.
    return null;
  }
}
function postDto(
  row: PostRow,
  actor: CurrentUser,
  document = postDocument(row.bodyDocument),
): CommunityPostSummary {
  const active = !row.archivedAt;
  const preview = contentImagePreview(row.category === "SHOWCASE" ? document : null);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    excerpt: (document ? contentExcerptText(document) : row.body).slice(0, 200),
    author: author(row, actor),
    isPinned: row.isPinned,
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    commentCount: row.commentCount,
    canEdit: active && actor.id === row.authorId,
    canArchive: active && (actor.id === row.authorId || isCommunityStaff(actor)),
    canModerate: active && isCommunityStaff(actor),
    hasBuildLink: Boolean(row.buildVersionId),
    likeCount: row.likeCount,
    likedByMe: row.likedByMe ?? false,
    canLike: active && !row.hiddenAt && ["MEMBER", "OFFICER", "ADMIN"].includes(row.authorRole),
    ...preview,
  };
}
async function readPost(transaction: Transaction, actor: CurrentUser, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await transaction
    .select(postReadFields(actor.id))
    .from(communityPosts)
    .innerJoin(users, eq(users.id, communityPosts.authorId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
    .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
    .where(
      and(
        eq(communityPosts.id, id),
        isCommunityStaff(actor)
          ? undefined
          : sql`(
      (${communityPosts.hiddenAt} is null and ${communityPosts.archivedAt} is null and ${users.role} in ('MEMBER','OFFICER','ADMIN'))
      or ${communityPosts.authorId} = ${actor.id})`,
      ),
    )
    .limit(1);
  return row ?? null;
}
const announcementFields = {
  id: announcements.id,
  title: announcements.title,
  content: announcements.content,
  authorId: announcements.authorId,
  authorRole: users.role,
  authorName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name}, '멤버')`,
  authorHandle: memberProfiles.handle,
  authorAvatarId: memberProfileImages.id,
  authorAvatarRevision: memberProfileImages.revision,
  isPinned: announcements.isPinned,
  publishedAt: announcements.publishedAt,
  createdAt: announcements.createdAt,
  updatedAt: announcements.updatedAt,
  archivedAt: announcements.archivedAt,
};
type AnnouncementRow = typeof announcements.$inferSelect & {
  authorRole: HiveRole;
  authorName: string;
  authorHandle: string | null;
  authorAvatarId: string | null;
  authorAvatarRevision: string | null;
};
function announcementDto(row: AnnouncementRow, actor: CurrentUser): AnnouncementDetail {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.content.slice(0, 200),
    content: row.content,
    author: author(row, actor),
    isPinned: row.isPinned,
    publishedAt: row.publishedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    canManage: isCommunityStaff(actor) && !row.archivedAt,
  };
}
function announcementVisible(now: Date) {
  return and(
    sql`${announcements.archivedAt} is null`,
    sql`${announcements.publishedAt} <= ${now.toISOString()}::timestamptz`,
  );
}

export async function getCommunityDirectory(
  input: {
    q?: unknown;
    category?: unknown;
    page?: unknown;
    section?: CommunitySection;
    includeModerated?: boolean;
  } = {},
): Promise<CommunityReadResult<CommunityDirectoryData>> {
  return provider(async (transaction, actor) => {
    const q = normalizeCommunityQuery(input.q);
    const staff = isCommunityStaff(actor);
    const { section, category, includeModerated, excludeShowcase } = communityDirectorySelection(
      input,
      staff,
    );
    const scope = and(
      includeModerated
        ? undefined
        : sql`${communityPosts.archivedAt} is null and ${communityPosts.hiddenAt} is null and ${users.role} in ('MEMBER','OFFICER','ADMIN')`,
      excludeShowcase ? sql`${communityPosts.category} <> 'SHOWCASE'` : undefined,
      category ? eq(communityPosts.category, category) : undefined,
      q
        ? sql`(${communityPosts.title} ilike ${communitySearchPattern(q)} or ${communityPosts.body} ilike ${communitySearchPattern(q)})`
        : undefined,
    );
    const [total] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(communityPosts)
      .innerJoin(users, eq(users.id, communityPosts.authorId))
      .where(scope);
    const pagination = pageData(input.page, total?.count ?? 0);
    const rows = await transaction
      .select(postReadFields(actor.id))
      .from(communityPosts)
      .innerJoin(users, eq(users.id, communityPosts.authorId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .where(scope)
      .orderBy(desc(communityPosts.isPinned), desc(communityPosts.createdAt), communityPosts.id)
      .limit(COMMUNITY_PAGE_SIZE)
      .offset((pagination.page - 1) * COMMUNITY_PAGE_SIZE);
    const now = new Date();
    const notices = await transaction
      .select(announcementFields)
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.authorId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .where(announcementVisible(now))
      .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), announcements.id)
      .limit(6);
    return {
      posts: rows.map((row) => postDto(row, actor)),
      announcements: notices.map((row) => announcementDto(row, actor)),
      q,
      category,
      section,
      pagination,
      canCreate: true,
      canModerate: staff,
      asOf: now.toISOString(),
    };
  });
}

async function readBuildVersion(
  transaction: Transaction,
  actor: CurrentUser,
  id: string,
  ownerId?: string,
) {
  const [row] = await transaction
    .select({
      id: buildVersions.id,
      buildId: builds.id,
      version: buildVersions.version,
    })
    .from(buildVersions)
    .innerJoin(builds, eq(builds.id, buildVersions.buildId))
    .innerJoin(users, eq(users.id, builds.ownerId))
    .where(
      and(
        eq(buildVersions.id, id),
        approvedBuildVersionAccessSql(actor, buildVersions.id),
        ownerId ? eq(builds.ownerId, ownerId) : undefined,
      ),
    )
    .for("share", { of: builds })
    .limit(1);
  const metadata = row
    ? await readApprovedBuildMetadata(transaction, actor, row.buildId, row.id)
    : null;
  return row && metadata
    ? {
        ...row,
        title: metadata.title,
        visibility: metadata.visibility,
        href: `/lab/b/${row.buildId}?version=${row.version}`,
      }
    : null;
}

function commentReadFields(actorId: string) {
  return {
    id: communityComments.id,
    postId: communityComments.postId,
    parentId: communityComments.parentId,
    body: communityComments.body,
    authorId: communityComments.authorId,
    authorRole: users.role,
    authorName: sql<string>`coalesce(${memberProfiles.displayName}, ${users.name}, '멤버')`,
    authorHandle: memberProfiles.handle,
    authorAvatarId: memberProfileImages.id,
    authorAvatarRevision: memberProfileImages.revision,
    hiddenAt: communityComments.hiddenAt,
    archivedAt: communityComments.archivedAt,
    createdAt: communityComments.createdAt,
    updatedAt: communityComments.updatedAt,
    likeCount: sql<number>`(select count(*)::int from community_comment_likes comment_reaction inner join users reacting_member on reacting_member.id = comment_reaction.user_id where comment_reaction.comment_id = "community_comments"."id" and reacting_member.role in ('MEMBER','OFFICER','ADMIN'))`,
    likedByMe: sql<boolean>`exists(select 1 from community_comment_likes own_comment_reaction where own_comment_reaction.comment_id = "community_comments"."id" and own_comment_reaction.user_id = ${actorId})`,
  };
}
type CommentRow = Pick<
  typeof communityComments.$inferSelect,
  | "id"
  | "postId"
  | "parentId"
  | "body"
  | "authorId"
  | "hiddenAt"
  | "archivedAt"
  | "createdAt"
  | "updatedAt"
> & {
  authorRole: HiveRole;
  authorName: string;
  authorHandle: string | null;
  authorAvatarId: string | null;
  authorAvatarRevision: string | null;
  likeCount: number;
  likedByMe: boolean;
};

function commentDto(
  comment: CommentRow,
  actor: CurrentUser,
  postOpen: boolean,
  parentVisible = true,
): CommunityComment {
  const placeholder = Boolean(comment.archivedAt && !isCommunityStaff(actor));
  const active =
    !comment.archivedAt &&
    !comment.hiddenAt &&
    ["MEMBER", "OFFICER", "ADMIN"].includes(comment.authorRole);
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    body: placeholder ? "" : comment.body,
    author: placeholder
      ? { id: "", name: "삭제된 댓글", handle: null, imageUrl: null }
      : author(comment, actor),
    hiddenAt: comment.hiddenAt?.toISOString() ?? null,
    archivedAt: comment.archivedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    isPlaceholder: placeholder,
    canEdit: !comment.archivedAt && comment.authorId === actor.id && postOpen && parentVisible,
    canArchive: !comment.archivedAt && (comment.authorId === actor.id || isCommunityStaff(actor)),
    canModerate: !comment.archivedAt && isCommunityStaff(actor),
    canReply: !comment.parentId && active && postOpen,
    likeCount: placeholder ? 0 : comment.likeCount,
    likedByMe: !placeholder && comment.likedByMe,
    canLike: active && postOpen && parentVisible,
  };
}

export async function getCommunityPost(
  id: string,
  input: {
    commentPage?: unknown;
    replyRoot?: unknown;
    replyPage?: unknown;
    replyTarget?: unknown;
  } = {},
): Promise<CommunityReadResult<CommunityPostData | null>> {
  return provider(async (transaction, actor) => {
    const row = await readPost(transaction, actor, id);
    if (!row) return null;
    const staff = isCommunityStaff(actor);
    const postOpen =
      !row.archivedAt && !row.hiddenAt && ["MEMBER", "OFFICER", "ADMIN"].includes(row.authorRole);
    const rootScope = and(
      eq(communityComments.postId, id),
      sql`${communityComments.parentId} is null`,
      staff
        ? undefined
        : sql`
      (${communityComments.hiddenAt} is null or ${communityComments.authorId} = ${actor.id})
      and ${users.role} in ('MEMBER','OFFICER','ADMIN')
      and (${communityComments.archivedAt} is null or exists(
        select 1 from community_comments surviving_reply inner join users reply_author on reply_author.id = surviving_reply.author_id
        where surviving_reply.parent_id = "community_comments"."id" and surviving_reply.hidden_at is null and surviving_reply.archived_at is null and reply_author.role in ('MEMBER','OFFICER','ADMIN')))`,
    );
    const suppliedRoot = Array.isArray(input.replyRoot) ? input.replyRoot[0] : input.replyRoot;
    const replyRoot = z.uuid().safeParse(suppliedRoot).success ? String(suppliedRoot) : null;
    let requestedPage = input.commentPage;
    if (replyRoot && requestedPage === undefined) {
      const [focused] = await transaction
        .select({ createdAt: communityComments.createdAt })
        .from(communityComments)
        .innerJoin(users, eq(users.id, communityComments.authorId))
        .where(and(rootScope, eq(communityComments.id, replyRoot)))
        .limit(1);
      if (focused) {
        const [preceding] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(communityComments)
          .innerJoin(users, eq(users.id, communityComments.authorId))
          .where(
            and(
              rootScope,
              sql`(${communityComments.createdAt} > ${focused.createdAt.toISOString()}::timestamptz or (${communityComments.createdAt} = ${focused.createdAt.toISOString()}::timestamptz and ${communityComments.id} < ${replyRoot}))`,
            ),
          );
        requestedPage = Math.floor((preceding?.count ?? 0) / COMMUNITY_PAGE_SIZE) + 1;
      }
    }
    const [total] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(communityComments)
      .innerJoin(users, eq(users.id, communityComments.authorId))
      .where(rootScope);
    const commentPagination = pageData(requestedPage, total?.count ?? 0);
    const roots = await transaction
      .select(commentReadFields(actor.id))
      .from(communityComments)
      .innerJoin(users, eq(users.id, communityComments.authorId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .where(rootScope)
      .orderBy(desc(communityComments.createdAt), communityComments.id)
      .limit(COMMUNITY_PAGE_SIZE)
      .offset((commentPagination.page - 1) * COMMUNITY_PAGE_SIZE);
    const comments: CommunityComment[] = [];
    // Twenty threads with at most ten replies each; a popular thread cannot turn this into an unbounded dump.
    for (const root of roots) {
      const item = commentDto(root, actor, postOpen);
      const childScope = and(
        eq(communityComments.postId, id),
        eq(communityComments.parentId, root.id),
        staff
          ? undefined
          : sql`${communityComments.archivedAt} is null and (${communityComments.hiddenAt} is null or ${communityComments.authorId} = ${actor.id}) and ${users.role} in ('MEMBER','OFFICER','ADMIN')`,
      );
      if (!staff && root.hiddenAt) {
        comments.push({ ...item, replies: [] });
        continue;
      }
      const [childTotal] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(communityComments)
        .innerJoin(users, eq(users.id, communityComments.authorId))
        .where(childScope);
      let childPage = replyRoot === root.id ? input.replyPage : 1;
      const suppliedTarget = Array.isArray(input.replyTarget)
        ? input.replyTarget[0]
        : input.replyTarget;
      if (replyRoot === root.id && z.uuid().safeParse(suppliedTarget).success) {
        const [focusedReply] = await transaction
          .select({ createdAt: communityComments.createdAt })
          .from(communityComments)
          .innerJoin(users, eq(users.id, communityComments.authorId))
          .where(and(childScope, eq(communityComments.id, String(suppliedTarget))))
          .limit(1);
        if (focusedReply) {
          const [precedingReplies] = await transaction
            .select({ count: sql<number>`count(*)::int` })
            .from(communityComments)
            .innerJoin(users, eq(users.id, communityComments.authorId))
            .where(
              and(
                childScope,
                sql`(${communityComments.createdAt} < ${focusedReply.createdAt.toISOString()}::timestamptz or (${communityComments.createdAt} = ${focusedReply.createdAt.toISOString()}::timestamptz and ${communityComments.id} < ${String(suppliedTarget)}))`,
              ),
            );
          childPage = Math.floor((precedingReplies?.count ?? 0) / COMMUNITY_REPLY_PAGE_SIZE) + 1;
        }
      }
      const pagination = pageData(childPage, childTotal?.count ?? 0, COMMUNITY_REPLY_PAGE_SIZE);
      const replies = await transaction
        .select(commentReadFields(actor.id))
        .from(communityComments)
        .innerJoin(users, eq(users.id, communityComments.authorId))
        .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
        .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
        .where(childScope)
        .orderBy(communityComments.createdAt, communityComments.id)
        .limit(COMMUNITY_REPLY_PAGE_SIZE)
        .offset((pagination.page - 1) * COMMUNITY_REPLY_PAGE_SIZE);
      comments.push({
        ...item,
        replies: replies.map((reply) =>
          commentDto(
            reply,
            actor,
            postOpen,
            !root.hiddenAt && ["MEMBER", "OFFICER", "ADMIN"].includes(root.authorRole),
          ),
        ),
        replyPagination: pagination,
      });
    }
    const linkedBuildVersion = row.buildVersionId
      ? await readBuildVersion(transaction, actor, row.buildVersionId)
      : null;
    const bodyDocument = parseContentDocument(row.bodyDocument);
    return {
      post: {
        ...postDto(row, actor, bodyDocument),
        body: row.body,
        bodyDocument,
        youtubeUrl: parseYouTubeUrl(row.youtubeUrl),
      },
      comments,
      commentPagination,
      linkedBuildVersion,
      buildLinkNotice:
        row.buildVersionId && !linkedBuildVersion
          ? "연결된 세팅은 현재 공유되지 않거나 확인할 수 없습니다."
          : null,
      canComment: postOpen,
      asOf: new Date().toISOString(),
    };
  });
}

export async function getCommunityEditorData(id?: string): Promise<CommunityEditorData> {
  if (id && !z.uuid().safeParse(id).success) throw new CommunityError("NOT_FOUND");
  return authorized(false, async (transaction, actor) => {
    const row = id ? await readPost(transaction, actor, id) : null;
    if (id && (!row || row.archivedAt)) throw new CommunityError("NOT_FOUND");
    if (row) requireCommunityOwner(actor, row.authorId);
    const versions = await transaction
      .select({
        id: buildVersions.id,
        buildId: builds.id,
        title: sql<string>`(select approved_title.title from build_share_requests approved_title where approved_title.build_id = ${builds.id} and approved_title.build_version_id = ${buildVersions.id} and approved_title.status = 'APPROVED' order by approved_title.reviewed_at desc, approved_title.id desc limit 1)`,
        version: buildVersions.version,
        visibility: sql<
          "HIVE" | "PUBLIC"
        >`(select approved_scope.requested_visibility from build_share_requests approved_scope where approved_scope.build_id = ${builds.id} and approved_scope.build_version_id = ${buildVersions.id} and approved_scope.status = 'APPROVED' order by approved_scope.reviewed_at desc, approved_scope.id desc limit 1)`,
      })
      .from(buildVersions)
      .innerJoin(builds, eq(builds.id, buildVersions.buildId))
      .where(
        and(eq(builds.ownerId, actor.id), approvedBuildVersionAccessSql(actor, buildVersions.id)),
      )
      .orderBy(desc(buildVersions.createdAt), buildVersions.id)
      .limit(COMMUNITY_BUILD_OPTION_LIMIT + 1);
    const buildVersionsDto: CommunityBuildVersion[] = versions
      .slice(0, COMMUNITY_BUILD_OPTION_LIMIT)
      .map((version) => ({
        ...version,
        visibility: version.visibility as "HIVE" | "PUBLIC",
        href: `/lab/b/${version.buildId}?version=${version.version}`,
      }));
    if (
      row?.buildVersionId &&
      !buildVersionsDto.some((version) => version.id === row.buildVersionId)
    ) {
      const selected = await readBuildVersion(transaction, actor, row.buildVersionId, actor.id);
      if (selected) {
        if (buildVersionsDto.length >= COMMUNITY_BUILD_OPTION_LIMIT) buildVersionsDto.pop();
        buildVersionsDto.push(selected);
      }
    }
    return {
      ...(row
        ? {
            initial: {
              id: row.id,
              title: row.title,
              body: row.body,
              bodyDocument: parseContentDocument(row.bodyDocument),
              youtubeUrl: parseYouTubeUrl(row.youtubeUrl),
              category: row.category,
              buildVersionId: row.buildVersionId,
              isPinned: row.isPinned,
              updatedAt: row.updatedAt.toISOString(),
            },
          }
        : {}),
      buildVersions: buildVersionsDto,
      canPin: isCommunityStaff(actor),
      buildOptionsTruncated: versions.length > COMMUNITY_BUILD_OPTION_LIMIT,
    };
  });
}

async function audit(
  transaction: Transaction,
  actor: CurrentUser,
  action: string,
  entityType: string,
  entityId: string,
) {
  await transaction
    .insert(auditLogs)
    .values({ actorId: actor.id, action, entityType, entityId, metadata: {} });
}
async function lockedPost(transaction: Transaction, id: string, allowArchived = false) {
  const [row] = await transaction
    .select()
    .from(communityPosts)
    .where(eq(communityPosts.id, id))
    .for("update");
  if (!row || (!allowArchived && row.archivedAt)) throw new CommunityError("NOT_FOUND");
  return row;
}
export async function saveCommunityPost(value: unknown): Promise<{ id: string }> {
  const input = parsed(communityPostSaveSchema, value);
  let document: ContentDocument | null;
  let youtubeUrl: string | null;
  try {
    document = parseContentDocument(input.bodyDocument);
    youtubeUrl = parseYouTubeUrl(input.youtubeUrl);
  } catch {
    throw new CommunityError("INVALID_INPUT");
  }
  const body = document ? contentPlainText(document) : input.body;
  if (!body.trim() || body.length > 20000) throw new CommunityError("INVALID_INPUT");
  return authorized(true, async (transaction, actor) => {
    const existing = input.id ? await lockedPost(transaction, input.id) : null;
    if (existing) {
      requireCommunityOwner(actor, existing.authorId);
      requireCommunityVersion(input.expectedUpdatedAt!, existing.updatedAt);
    }
    if (!isCommunityStaff(actor) && input.isPinned && !existing?.isPinned)
      throw new CommunityError("FORBIDDEN");
    if (
      input.buildVersionId &&
      !(await readBuildVersion(transaction, actor, input.buildVersionId, actor.id))
    )
      throw new CommunityError("INVALID_INPUT");
    const values = {
      title: input.title,
      body,
      bodyDocument: document,
      youtubeUrl,
      category: input.category,
      buildVersionId: input.buildVersionId,
      isPinned: isCommunityStaff(actor) ? input.isPinned : (existing?.isPinned ?? false),
      updatedAt: nextCommunityVersion(existing?.updatedAt),
    };
    const [saved] = existing
      ? await transaction
          .update(communityPosts)
          .set(values)
          .where(eq(communityPosts.id, existing.id))
          .returning({ id: communityPosts.id })
      : await transaction
          .insert(communityPosts)
          .values({ ...values, createdAt: values.updatedAt, authorId: actor.id })
          .returning({ id: communityPosts.id });
    await bindContentImages(transaction, actor.id, { postId: saved.id }, document);
    await audit(
      transaction,
      actor,
      existing ? "community.post_updated" : "community.post_created",
      "community_post",
      saved.id,
    );
    return saved;
  });
}
export async function archiveCommunityPost(value: unknown): Promise<void> {
  const input = parsed(communityArchiveSchema, value);
  await authorized(true, async (transaction, actor) => {
    const existing = await lockedPost(transaction, input.id);
    if (!isCommunityStaff(actor)) requireCommunityOwner(actor, existing.authorId);
    requireCommunityVersion(input.expectedUpdatedAt, existing.updatedAt);
    await transaction
      .update(communityPosts)
      .set({ archivedAt: new Date(), updatedAt: nextCommunityVersion(existing.updatedAt) })
      .where(eq(communityPosts.id, existing.id));
    await audit(transaction, actor, "community.post_archived", "community_post", existing.id);
  });
}
export async function moderateCommunityPost(value: unknown): Promise<void> {
  const input = parsed(communityModerateSchema, value);
  await authorized(true, async (transaction, actor) => {
    requireCommunityStaff(actor);
    const existing = await lockedPost(transaction, input.id);
    requireCommunityVersion(input.expectedUpdatedAt, existing.updatedAt);
    const changes =
      input.action === "HIDE"
        ? { hiddenAt: new Date() }
        : input.action === "SHOW"
          ? { hiddenAt: null }
          : { isPinned: input.action === "PIN" };
    await transaction
      .update(communityPosts)
      .set({ ...changes, updatedAt: nextCommunityVersion(existing.updatedAt) })
      .where(eq(communityPosts.id, existing.id));
    await audit(
      transaction,
      actor,
      `community.post_${input.action.toLowerCase()}`,
      "community_post",
      existing.id,
    );
  });
}

async function commentAndPost(transaction: Transaction, id: string) {
  const [reference] = await transaction
    .select({ postId: communityComments.postId })
    .from(communityComments)
    .where(eq(communityComments.id, id))
    .limit(1);
  if (!reference) throw new CommunityError("NOT_FOUND");
  const post = await lockedPost(transaction, reference.postId, true);
  const [comment] = await transaction
    .select()
    .from(communityComments)
    .where(eq(communityComments.id, id))
    .for("update");
  if (!comment || comment.archivedAt || comment.postId !== post.id)
    throw new CommunityError("NOT_FOUND");
  return { post, comment };
}
export async function saveCommunityComment(value: unknown): Promise<{ id: string }> {
  const input = parsed(communityCommentSaveSchema, value);
  return authorized(true, async (transaction, actor) => {
    const post = await lockedPost(transaction, input.postId);
    if (post.hiddenAt) throw new CommunityError("NOT_FOUND");
    const [owner] = await transaction
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, post.authorId));
    if (!owner || !["MEMBER", "OFFICER", "ADMIN"].includes(owner.role))
      throw new CommunityError("NOT_FOUND");
    const [existing] = input.id
      ? await transaction
          .select()
          .from(communityComments)
          .where(eq(communityComments.id, input.id))
          .for("update")
      : [];
    if (input.id && (!existing || existing.archivedAt || existing.postId !== post.id))
      throw new CommunityError("NOT_FOUND");
    const parentId = existing?.parentId ?? input.parentId ?? null;
    if (existing && input.parentId !== undefined && input.parentId !== existing.parentId)
      throw new CommunityError("INVALID_INPUT");
    if (parentId) {
      const [parent] = await transaction
        .select({
          id: communityComments.id,
          parentId: communityComments.parentId,
          archivedAt: communityComments.archivedAt,
          hiddenAt: communityComments.hiddenAt,
          role: users.role,
        })
        .from(communityComments)
        .innerJoin(users, eq(users.id, communityComments.authorId))
        .where(and(eq(communityComments.id, parentId), eq(communityComments.postId, post.id)))
        .for("share", { of: communityComments })
        .limit(1);
      if (
        !parent ||
        parent.parentId ||
        parent.hiddenAt ||
        (!existing && parent.archivedAt) ||
        !["MEMBER", "OFFICER", "ADMIN"].includes(parent.role)
      )
        throw new CommunityError("NOT_FOUND");
    }
    if (existing) {
      requireCommunityOwner(actor, existing.authorId);
      requireCommunityVersion(input.expectedUpdatedAt!, existing.updatedAt);
    }
    const values = { body: input.body, updatedAt: nextCommunityVersion(existing?.updatedAt) };
    const [saved] = existing
      ? await transaction
          .update(communityComments)
          .set(values)
          .where(eq(communityComments.id, existing.id))
          .returning({ id: communityComments.id })
      : await transaction
          .insert(communityComments)
          .values({
            ...values,
            createdAt: values.updatedAt,
            authorId: actor.id,
            postId: post.id,
            parentId,
          })
          .returning({ id: communityComments.id });
    await audit(
      transaction,
      actor,
      existing ? "community.comment_updated" : "community.comment_created",
      "community_comment",
      saved.id,
    );
    return saved;
  });
}
export async function archiveCommunityComment(value: unknown): Promise<void> {
  const input = parsed(communityArchiveSchema, value);
  await authorized(true, async (transaction, actor) => {
    const { comment } = await commentAndPost(transaction, input.id);
    if (!isCommunityStaff(actor)) requireCommunityOwner(actor, comment.authorId);
    requireCommunityVersion(input.expectedUpdatedAt, comment.updatedAt);
    await transaction
      .update(communityComments)
      .set({ archivedAt: new Date(), updatedAt: nextCommunityVersion(comment.updatedAt) })
      .where(eq(communityComments.id, comment.id));
    await audit(transaction, actor, "community.comment_archived", "community_comment", comment.id);
  });
}
export async function moderateCommunityComment(value: unknown): Promise<void> {
  const input = parsed(communityCommentModerateSchema, value);
  await authorized(true, async (transaction, actor) => {
    requireCommunityStaff(actor);
    const { comment } = await commentAndPost(transaction, input.id);
    requireCommunityVersion(input.expectedUpdatedAt, comment.updatedAt);
    await transaction
      .update(communityComments)
      .set({
        hiddenAt: input.action === "HIDE" ? new Date() : null,
        updatedAt: nextCommunityVersion(comment.updatedAt),
      })
      .where(eq(communityComments.id, comment.id));
    await audit(
      transaction,
      actor,
      `community.comment_${input.action.toLowerCase()}`,
      "community_comment",
      comment.id,
    );
  });
}

export async function getAnnouncementAdminData(input: { page?: unknown } = {}): Promise<{
  announcements: AnnouncementDetail[];
  pagination: CommunityPagination;
  canManage: true;
}> {
  return authorized(false, async (transaction, actor) => {
    requireCommunityStaff(actor);
    const [total] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(announcements);
    const pagination = pageData(input.page, total?.count ?? 0);
    const rows = await transaction
      .select(announcementFields)
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.authorId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .orderBy(desc(announcements.publishedAt), announcements.id)
      .limit(COMMUNITY_PAGE_SIZE)
      .offset((pagination.page - 1) * COMMUNITY_PAGE_SIZE);
    return {
      announcements: rows.map((row) => announcementDto(row, actor)),
      pagination,
      canManage: true,
    };
  });
}
export async function getAnnouncement(
  id: string,
): Promise<CommunityReadResult<AnnouncementDetail | null>> {
  return provider(async (transaction, actor) => {
    if (!z.uuid().safeParse(id).success) return null;
    const [row] = await transaction
      .select(announcementFields)
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.authorId))
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .where(
        and(
          eq(announcements.id, id),
          isCommunityStaff(actor) ? undefined : announcementVisible(new Date()),
        ),
      )
      .limit(1);
    return row ? announcementDto(row, actor) : null;
  });
}
export async function saveAnnouncement(value: unknown): Promise<{ id: string }> {
  const input = parsed(announcementSaveSchema, value);
  return authorized(true, async (transaction, actor) => {
    requireCommunityStaff(actor);
    const [existing] = input.id
      ? await transaction
          .select()
          .from(announcements)
          .where(eq(announcements.id, input.id))
          .for("update")
      : [];
    if (input.id && (!existing || existing.archivedAt)) throw new CommunityError("NOT_FOUND");
    if (existing) requireCommunityVersion(input.expectedUpdatedAt!, existing.updatedAt);
    const values = {
      title: input.title,
      content: input.content,
      isPinned: input.isPinned,
      publishedAt: input.publishedAt
        ? new Date(input.publishedAt)
        : (existing?.publishedAt ?? new Date()),
      updatedAt: nextCommunityVersion(existing?.updatedAt),
    };
    const [saved] = existing
      ? await transaction
          .update(announcements)
          .set(values)
          .where(eq(announcements.id, existing.id))
          .returning({ id: announcements.id })
      : await transaction
          .insert(announcements)
          .values({ ...values, createdAt: values.updatedAt, authorId: actor.id })
          .returning({ id: announcements.id });
    await audit(
      transaction,
      actor,
      existing ? "community.announcement_updated" : "community.announcement_created",
      "announcement",
      saved.id,
    );
    return saved;
  });
}
export async function archiveAnnouncement(value: unknown): Promise<void> {
  const input = parsed(communityArchiveSchema, value);
  await authorized(true, async (transaction, actor) => {
    requireCommunityStaff(actor);
    const [existing] = await transaction
      .select()
      .from(announcements)
      .where(eq(announcements.id, input.id))
      .for("update");
    if (!existing || existing.archivedAt) throw new CommunityError("NOT_FOUND");
    requireCommunityVersion(input.expectedUpdatedAt, existing.updatedAt);
    await transaction
      .update(announcements)
      .set({ archivedAt: new Date(), updatedAt: nextCommunityVersion(existing.updatedAt) })
      .where(eq(announcements.id, existing.id));
    await audit(transaction, actor, "community.announcement_archived", "announcement", existing.id);
  });
}

export interface AnnouncementBellData {
  announcements: { id: string; title: string; publishedAt: string; pinned: boolean }[];
}
export async function getRecentAnnouncements(): Promise<CommunityReadResult<AnnouncementBellData>> {
  return provider(async (transaction) => {
    const rows = await transaction
      .select({
        id: announcements.id,
        title: announcements.title,
        publishedAt: announcements.publishedAt,
        pinned: announcements.isPinned,
      })
      .from(announcements)
      .where(announcementVisible(new Date()))
      .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), announcements.id)
      .limit(5);
    return {
      announcements: rows.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() })),
    };
  });
}
