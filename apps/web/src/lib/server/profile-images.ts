import "server-only";
import { canEditMemberProfile } from "@uniz/domain";
import { accounts, and, eq, getDb, memberProfileImages, sql, users } from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import { isApprovedRole } from "../member-policy";
import { profileImageUrl, type ProfileImageState } from "../profile-image";
import { getSessionGuildEligibilityState } from "./discord-authorization";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function requireFreshActor(transaction: Transaction, actor: CurrentUser) {
  const [fresh] = await transaction
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, actor.id))
    .for("share")
    .limit(1);
  const [account] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
    .limit(1);
  if (!fresh || !account || !canEditMemberProfile(fresh, fresh.id))
    throw new Error("계정 연결을 확인한 후 다시 로그인해 주세요.");
  return fresh;
}

export async function getOwnProfileImage(actor: CurrentUser): Promise<ProfileImageState> {
  if (actor.isMock) return { imageUrl: null, hasCustomImage: false };
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
    await requireFreshActor(transaction, actor);
    const [row] = await transaction
      .select({ id: memberProfileImages.id, revision: memberProfileImages.revision })
      .from(memberProfileImages)
      .where(eq(memberProfileImages.userId, actor.id))
      .limit(1);
    const imageUrl = row ? profileImageUrl(row.id, row.revision) : null;
    return { imageUrl, hasCustomImage: imageUrl !== null };
  });
}

export async function persistProfileImage(
  actor: CurrentUser,
  image: { content: Buffer; revision: string } | null,
): Promise<ProfileImageState> {
  if (actor.isMock) throw new Error("실제 계정에서 프로필 이미지를 저장해 주세요.");
  if ((await getSessionGuildEligibilityState(actor.id)).status !== "MEMBER")
    throw new Error("Discord 연결을 확인한 후 다시 저장해 주세요.");
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
    const fresh = await requireFreshActor(transaction, actor);
    return persistProfileImageInTransaction(transaction, fresh.id, image);
  });
}

/** Called only after the enclosing write has locked and authorized the profile owner. */
export async function persistProfileImageInTransaction(
  transaction: Transaction,
  userId: string,
  image: { content: Buffer; revision: string } | null,
): Promise<ProfileImageState> {
  if (!image) {
    await transaction.delete(memberProfileImages).where(eq(memberProfileImages.userId, userId));
    return { imageUrl: null, hasCustomImage: false };
  }
  const [row] = await transaction
    .insert(memberProfileImages)
    .values({ userId, ...image })
    .onConflictDoUpdate({
      target: memberProfileImages.userId,
      set: { ...image, updatedAt: new Date() },
    })
    .returning({ id: memberProfileImages.id, revision: memberProfileImages.revision });
  const imageUrl = row && profileImageUrl(row.id, row.revision);
  if (!imageUrl) throw new Error("이미지를 저장하지 못했습니다.");
  return { imageUrl, hasCustomImage: true };
}

export async function readProfileImage(
  actor: CurrentUser,
  assetId: string,
  revision: string | null,
): Promise<Buffer | null> {
  if (actor.isMock || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(assetId)) return null;
  if (revision !== null && !/^[a-f0-9]{64}$/.test(revision)) return null;
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
    const fresh = await requireFreshActor(transaction, actor);
    // Do not select image bytes until both the reader and subject permissions are established.
    const [owner] = await transaction
      .select({ userId: users.id, role: users.role, revision: memberProfileImages.revision })
      .from(memberProfileImages)
      .innerJoin(users, eq(users.id, memberProfileImages.userId))
      .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
      .where(eq(memberProfileImages.id, assetId))
      .limit(1);
    if (
      !owner ||
      (revision !== null && owner.revision !== revision) ||
      (fresh.id !== owner.userId &&
        fresh.role !== "ADMIN" &&
        (!isApprovedRole(fresh.role) || !isApprovedRole(owner.role)))
    )
      return null;
    const [image] = await transaction
      .select({ content: memberProfileImages.content })
      .from(memberProfileImages)
      .where(
        and(eq(memberProfileImages.id, assetId), eq(memberProfileImages.revision, owner.revision)),
      )
      .limit(1);
    return image ? Buffer.from(image.content) : null;
  });
}
