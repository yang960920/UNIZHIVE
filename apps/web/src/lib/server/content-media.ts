import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  accounts,
  and,
  builds,
  buildVersions,
  communityPosts,
  contentImageReferences,
  contentImages,
  eq,
  getDb,
  sql,
  users,
} from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import {
  contentImageIds,
  contentImageUrl,
  parseContentDocument,
  type ContentDocument,
} from "../content-document";
import { isApprovedRole } from "../member-policy";
import { getSessionGuildEligibilityState } from "./discord-authorization";
import { approvedBuildVersionAccessSql, submittedBuildVersionAccessSql } from "./build-sharing";
import { dpsResearchVersionAccessSql } from "./dps-research-access";
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_LIMIT_LABEL } from "../image-upload-limits";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export interface ContentImageAsset {
  id: string;
  url: string;
  width: number;
  height: number;
}
export class ContentMediaError extends Error {}
export function validateContentImageFile(file: File): string | null {
  return !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ? "PNG, JPG 또는 WebP 이미지를 선택해 주세요."
    : file.size < 1 || file.size > IMAGE_UPLOAD_MAX_BYTES
      ? `이미지는 ${IMAGE_UPLOAD_LIMIT_LABEL} 이하로 선택해 주세요.`
      : null;
}
export async function normalizeContentImage(
  file: File,
): Promise<{ content: Buffer; revision: string; width: number; height: number }> {
  const invalid = validateContentImageFile(file);
  if (invalid) throw new ContentMediaError(invalid);
  const input = Buffer.from(await file.arrayBuffer());
  const format =
    input.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
      ? "png"
      : input.subarray(0, 3).toString("hex") === "ffd8ff"
        ? "jpeg"
        : input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP"
          ? "webp"
          : null;
  if (!format || file.type !== `image/${format}`)
    throw new ContentMediaError("이미지 파일의 형식을 확인해 주세요.");
  try {
    const pipeline = sharp(input, { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await pipeline.metadata();
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 10000 ||
      metadata.height > 10000 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new ContentMediaError("움직이는 이미지나 지나치게 큰 이미지는 사용할 수 없습니다.");
    for (const quality of [85, 78, 72]) {
      const output = await pipeline
        .clone()
        .rotate()
        .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .timeout({ seconds: 5 })
        .toBuffer({ resolveWithObject: true });
      if (output.data.length <= 512 * 1024)
        return {
          content: output.data,
          revision: createHash("sha256").update(output.data).digest("hex"),
          width: output.info.width,
          height: output.info.height,
        };
    }
    throw new ContentMediaError("압축 후에도 이미지가 큽니다. 더 작은 이미지를 선택해 주세요.");
  } catch (error) {
    if (error instanceof ContentMediaError) throw error;
    throw new ContentMediaError("이미지를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.");
  }
}

async function readFreshActor(
  transaction: Transaction,
  actor: CurrentUser,
): Promise<CurrentUser | null> {
  const [fresh] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, actor.id))
    .for("share")
    .limit(1);
  const [connected] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
    .limit(1);
  return fresh && connected && isApprovedRole(fresh.role) ? { ...fresh, isMock: false } : null;
}
async function freshActor(transaction: Transaction, actor: CurrentUser): Promise<CurrentUser> {
  const fresh = await readFreshActor(transaction, actor);
  if (!fresh) throw new ContentMediaError("승인된 Discord 멤버로 로그인해 주세요.");
  return fresh;
}
export async function stageContentImage(
  actor: CurrentUser,
  file: File,
): Promise<ContentImageAsset> {
  if (actor.isMock || !isApprovedRole(actor.role))
    throw new ContentMediaError("승인된 실제 계정에서 이미지를 등록해 주세요.");
  if ((await getSessionGuildEligibilityState(actor.id)).status !== "MEMBER")
    throw new ContentMediaError("Discord 연결을 확인한 후 다시 시도해 주세요.");
  const normalized = await normalizeContentImage(file);
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
    const current = await freshActor(transaction, actor);
    // Clean only this actor's abandoned private uploads, preserving every referenced old version.
    const abandoned = await transaction
      .select({ id: contentImages.id })
      .from(contentImages)
      .where(
        and(
          eq(contentImages.ownerId, current.id),
          sql`${contentImages.updatedAt} < now() - interval '24 hours'`,
          sql`not exists (select 1 from ${contentImageReferences} where ${contentImageReferences.imageId} = ${contentImages.id})`,
        ),
      )
      .limit(100)
      .for("update", { skipLocked: true });
    if (abandoned.length)
      await transaction.delete(contentImages).where(
        and(
          sql`${contentImages.id} in (${sql.join(
            abandoned.map((row) => sql`${row.id}`),
            sql`, `,
          )})`,
          sql`not exists (select 1 from ${contentImageReferences} where ${contentImageReferences.imageId} = ${contentImages.id})`,
        ),
      );
    const [row] = await transaction
      .insert(contentImages)
      .values({ ownerId: current.id, ...normalized })
      .onConflictDoUpdate({
        target: [contentImages.ownerId, contentImages.revision],
        set: { updatedAt: new Date() },
      })
      .returning({
        id: contentImages.id,
        width: contentImages.width,
        height: contentImages.height,
      });
    if (!row) throw new ContentMediaError("이미지를 저장하지 못했습니다.");
    return { ...row, url: contentImageUrl(row.id) };
  });
}

/** The caller has already authorized and locked this post or new immutable-version target. */
export async function bindContentImages(
  transaction: Transaction,
  actorId: string,
  target: { postId: string } | { buildVersionId: string } | { researchVersionId: string },
  document: ContentDocument | null,
): Promise<void> {
  document = parseContentDocument(document);
  const ids = contentImageIds(document);
  const scope =
    "postId" in target
      ? eq(contentImageReferences.postId, z.uuid().parse(target.postId))
      : "buildVersionId" in target
        ? eq(contentImageReferences.buildVersionId, z.uuid().parse(target.buildVersionId))
        : eq(contentImageReferences.researchVersionId, z.uuid().parse(target.researchVersionId));
  if (ids.length) {
    const rows = await transaction
      .select({ id: contentImages.id, ownerId: contentImages.ownerId })
      .from(contentImages)
      .where(
        sql`${contentImages.id} in (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
      .for("share");
    const existing = await transaction
      .select({ imageId: contentImageReferences.imageId })
      .from(contentImageReferences)
      .where(scope);
    const allowed = new Set(existing.map((row) => row.imageId));
    if (
      rows.length !== ids.length ||
      rows.some((row) => row.ownerId !== actorId && !allowed.has(row.id))
    )
      throw new ContentMediaError("본문에 연결할 이미지의 등록 계정을 확인해 주세요.");
  }
  await transaction.delete(contentImageReferences).where(
    and(
      scope,
      ids.length
        ? sql`${contentImageReferences.imageId} not in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : undefined,
    ),
  );
  if (ids.length)
    await transaction
      .insert(contentImageReferences)
      .values(ids.map((imageId) => ({ imageId, ...target })))
      .onConflictDoNothing();
}

export async function readContentImage(
  actor: CurrentUser | null,
  id: string,
): Promise<Buffer | null> {
  if (!z.uuid().safeParse(id).success || actor?.isMock) return null;
  return getDb().transaction(
    async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
      const current =
        actor && isApprovedRole(actor.role) ? await readFreshActor(transaction, actor) : null;
      const [image] = await transaction
        .select({ id: contentImages.id, ownerId: contentImages.ownerId })
        .from(contentImages)
        .where(eq(contentImages.id, id))
        .limit(1);
      if (!image) return null;
      let allowed = current?.id === image.ownerId;
      if (!allowed && current) {
        const [post] = await transaction
          .select({ id: communityPosts.id })
          .from(contentImageReferences)
          .innerJoin(communityPosts, eq(communityPosts.id, contentImageReferences.postId))
          .innerJoin(users, eq(users.id, communityPosts.authorId))
          .where(
            and(
              eq(contentImageReferences.imageId, id),
              current.role === "ADMIN" || current.role === "OFFICER"
                ? undefined
                : sql`(${communityPosts.authorId} = ${current.id} or (${communityPosts.hiddenAt} is null and ${communityPosts.archivedAt} is null and ${users.role} in ('MEMBER','OFFICER','ADMIN'))) `,
            ),
          )
          .limit(1);
        allowed = Boolean(post);
      }
      if (!allowed) {
        const [version] = await transaction
          .select({ id: buildVersions.id })
          .from(contentImageReferences)
          .innerJoin(buildVersions, eq(buildVersions.id, contentImageReferences.buildVersionId))
          .innerJoin(builds, eq(builds.id, buildVersions.buildId))
          .where(
            and(
              eq(contentImageReferences.imageId, id),
              current?.role === "ADMIN"
                ? sql`(${approvedBuildVersionAccessSql(current, buildVersions.id)} or ${submittedBuildVersionAccessSql(current, buildVersions.id)})`
                : approvedBuildVersionAccessSql(current, buildVersions.id),
            ),
          )
          .limit(1);
        allowed = Boolean(version);
      }
      if (!allowed) {
        const [research] = await transaction
          .select({ id: contentImageReferences.id })
          .from(contentImageReferences)
          .where(
            and(
              eq(contentImageReferences.imageId, id),
              dpsResearchVersionAccessSql(current, contentImageReferences.researchVersionId),
            ),
          )
          .limit(1);
        allowed = Boolean(research);
      }
      if (!allowed) return null;
      const [bytes] = await transaction
        .select({ content: contentImages.content })
        .from(contentImages)
        .where(eq(contentImages.id, id))
        .limit(1);
      return bytes ? Buffer.from(bytes.content) : null;
    },
    { isolationLevel: "repeatable read" },
  );
}
