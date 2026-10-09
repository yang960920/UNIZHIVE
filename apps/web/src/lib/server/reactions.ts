import "server-only";
import {
  accounts,
  and,
  auditLogs,
  buildLikes,
  builds,
  communityCommentLikes,
  communityComments,
  communityPostLikes,
  communityPosts,
  eq,
  getDb,
  inArray,
  sql,
  users,
} from "@uniz/db";
import { getCurrentAuthState } from "../auth";
import { CommunityError, requireCommunityActor } from "../community-policy";
import { reactionSaveSchema, type LikeSummary } from "../reaction-policy";
import { getSessionGuildEligibilityState } from "./discord-authorization";
import { publishedBuildAccessSql } from "./build-sharing";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const approved = sql`${users.role} in ('MEMBER','OFFICER','ADMIN')`;

/** Call only with build IDs already authorized by the enclosing read query. */
export async function getBuildLikeSummaries(
  transaction: Transaction,
  buildIds: string[],
  viewerId: string | null,
): Promise<Map<string, LikeSummary>> {
  const ids = [...new Set(buildIds)].slice(0, 200);
  const result = new Map(ids.map((id) => [id, { likeCount: 0, likedByMe: false }]));
  if (!ids.length) return result;
  const rows = await transaction
    .select({
      targetId: buildLikes.buildId,
      likeCount: sql<number>`count(*)::int`,
      likedByMe: viewerId
        ? sql<boolean>`bool_or(${buildLikes.userId} = ${viewerId})`
        : sql<boolean>`false`,
    })
    .from(buildLikes)
    .innerJoin(users, eq(users.id, buildLikes.userId))
    .where(and(inArray(buildLikes.buildId, ids), approved))
    .groupBy(buildLikes.buildId);
  for (const row of rows)
    result.set(row.targetId, { likeCount: row.likeCount, likedByMe: row.likedByMe });
  return result;
}

export async function setReaction(value: unknown): Promise<LikeSummary> {
  const parsed = reactionSaveSchema.safeParse(value);
  if (!parsed.success) throw new CommunityError("INVALID_INPUT");
  const input = parsed.data;
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE") throw new CommunityError("UNAVAILABLE");
  if (state.status === "LEFT") throw new CommunityError("LEFT");
  if (state.status === "REAUTH_REQUIRED") throw new CommunityError("REAUTH");
  if (state.status !== "AUTHENTICATED") throw new CommunityError("UNAUTHENTICATED");
  const actor = requireCommunityActor(state.user);
  const eligibility = await getSessionGuildEligibilityState(actor.id);
  if (eligibility.status !== "MEMBER")
    throw new CommunityError(
      eligibility.status === "LEFT"
        ? "LEFT"
        : eligibility.status === "REAUTH_REQUIRED"
          ? "REAUTH"
          : "UNAVAILABLE",
    );
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
    const [row] = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, actor.id))
      .for("share");
    const fresh = requireCommunityActor(row ? { ...row, isMock: false } : null);
    const [account] = await transaction
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, fresh.id), eq(accounts.provider, "discord")))
      .limit(1);
    if (!account) throw new CommunityError("REAUTH");
    if (input.kind === "BUILD") {
      const [build] = await transaction
        .select({ id: builds.id })
        .from(builds)
        .where(eq(builds.id, input.targetId))
        .for("share", { of: builds })
        .limit(1);
      if (!build) throw new CommunityError("NOT_FOUND");
      // Read publication after acquiring the build lock: a revoke that held the
      // row lock may have committed while this transaction was waiting.
      const [published] = await transaction
        .select({ id: builds.id })
        .from(builds)
        .where(and(eq(builds.id, input.targetId), publishedBuildAccessSql(fresh)))
        .limit(1);
      if (!published) throw new CommunityError("NOT_FOUND");
    } else {
      const [reference] =
        input.kind === "COMMUNITY_COMMENT"
          ? await transaction
              .select({ postId: communityComments.postId, parentId: communityComments.parentId })
              .from(communityComments)
              .where(eq(communityComments.id, input.targetId))
              .limit(1)
          : [{ postId: input.targetId, parentId: null }];
      if (!reference) throw new CommunityError("NOT_FOUND");
      const [post] = await transaction
        .select({ id: communityPosts.id })
        .from(communityPosts)
        .innerJoin(users, eq(users.id, communityPosts.authorId))
        .where(
          and(
            eq(communityPosts.id, reference.postId),
            sql`${communityPosts.hiddenAt} is null and ${communityPosts.archivedAt} is null`,
            approved,
          ),
        )
        .for("share", { of: communityPosts })
        .limit(1);
      if (!post) throw new CommunityError("NOT_FOUND");
      if (input.kind === "COMMUNITY_COMMENT") {
        if (reference.parentId) {
          const [parent] = await transaction
            .select({ id: communityComments.id })
            .from(communityComments)
            .innerJoin(users, eq(users.id, communityComments.authorId))
            .where(
              and(
                eq(communityComments.id, reference.parentId),
                eq(communityComments.postId, post.id),
                sql`${communityComments.parentId} is null and ${communityComments.hiddenAt} is null`,
                approved,
              ),
            )
            .for("share", { of: communityComments })
            .limit(1);
          if (!parent) throw new CommunityError("NOT_FOUND");
        }
        const [comment] = await transaction
          .select({ id: communityComments.id })
          .from(communityComments)
          .innerJoin(users, eq(users.id, communityComments.authorId))
          .where(
            and(
              eq(communityComments.id, input.targetId),
              eq(communityComments.postId, post.id),
              sql`${communityComments.hiddenAt} is null and ${communityComments.archivedAt} is null`,
              approved,
            ),
          )
          .for("update", { of: communityComments })
          .limit(1);
        if (!comment) throw new CommunityError("NOT_FOUND");
      }
    }
    const table =
      input.kind === "BUILD"
        ? buildLikes
        : input.kind === "COMMUNITY_POST"
          ? communityPostLikes
          : communityCommentLikes;
    const targetColumn =
      input.kind === "BUILD"
        ? buildLikes.buildId
        : input.kind === "COMMUNITY_POST"
          ? communityPostLikes.postId
          : communityCommentLikes.commentId;
    const condition = and(eq(targetColumn, input.targetId), eq(table.userId, fresh.id));
    let changed: boolean;
    if (input.liked) {
      // Explicit desired state + unique(target,user) makes retries idempotent.
      const values =
        input.kind === "BUILD"
          ? { buildId: input.targetId, userId: fresh.id }
          : input.kind === "COMMUNITY_POST"
            ? { postId: input.targetId, userId: fresh.id }
            : { commentId: input.targetId, userId: fresh.id };
      const inserted = await transaction
        .insert(table)
        .values(values as typeof table.$inferInsert)
        .onConflictDoNothing()
        .returning({ id: table.id });
      changed = inserted.length > 0;
    } else {
      const removed = await transaction.delete(table).where(condition).returning({ id: table.id });
      changed = removed.length > 0;
    }
    if (changed)
      await transaction.insert(auditLogs).values({
        actorId: fresh.id,
        action: input.liked ? "reaction.liked" : "reaction.unliked",
        entityType: input.kind.toLowerCase(),
        entityId: input.targetId,
        metadata: {},
      });
    const [summary] = await transaction
      .select({ likeCount: sql<number>`count(*)::int` })
      .from(table)
      .innerJoin(users, eq(users.id, table.userId))
      .where(and(eq(targetColumn, input.targetId), approved));
    return { likeCount: summary?.likeCount ?? 0, likedByMe: input.liked };
  });
}
