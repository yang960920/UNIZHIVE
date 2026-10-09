import "server-only";
import {
  accounts,
  and,
  auditLogs,
  desc,
  eq,
  getDb,
  memberProfileImages,
  memberProfiles,
  sql,
  users,
} from "@uniz/db";
import { canViewAdminMemberDirectory, type HiveRole } from "@uniz/domain";
import { getCurrentAuthState, type CurrentUser } from "../auth";
import { mockMembers } from "../mocks/members";
import { getLiveGuildEligibility, getSessionGuildEligibilityState } from "./discord-authorization";
import { profileImageUrl, type ProfileImageState } from "../profile-image";
import { persistProfileImageInTransaction } from "./profile-images";
import {
  assertMemberProfileEditor,
  decideMemberRoleChange,
  isApprovedRole,
  MemberManagementError,
  memberChangeSchema,
  memberProfileSchema,
  type MemberChange,
} from "../member-policy";

export const MEMBER_AUTHORIZATION_LOCK = 912743110;

export interface DirectoryMember {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  nickname: string;
  bio: string | null;
  role: HiveRole;
  joinedAt: string;
  imageUrl?: string | null;
}
export interface ManagedMember {
  id: string;
  name: string;
  role: HiveRole;
  handle: string | null;
  displayName: string | null;
  nickname: string | null;
  profileComplete: boolean;
  updatedAt: string;
  imageUrl?: string | null;
}
export interface EditableMemberProfile {
  targetId: string;
  handle: string;
  displayName: string;
  nickname: string;
  uid: string;
  bio: string;
}

async function requireMemberActor(): Promise<CurrentUser> {
  const { user: actor, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    throw new MemberManagementError(
      "로그인은 유지됩니다. Discord 연결을 잠시 확인할 수 없습니다. 연결 확인 후 다시 시도해 주세요.",
    );
  if (status !== "AUTHENTICATED" || !actor)
    throw new MemberManagementError("로그인한 후 다시 시도해 주세요.");
  return actor;
}

type MemberTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function assertMemberAdministrator(actor: CurrentUser): void {
  if (!canViewAdminMemberDirectory(actor))
    throw new MemberManagementError("멤버 정보는 관리자만 확인하거나 관리할 수 있습니다.");
}

async function requireConnectedAccount(transaction: MemberTransaction, actorId: string) {
  const [account] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, actorId), eq(accounts.provider, "discord")))
    .limit(1);
  if (!account) throw new MemberManagementError("Discord 연결을 확인한 후 다시 로그인해 주세요.");
}

async function readAsMemberAdministrator<T>(
  actor: CurrentUser,
  read: (transaction: MemberTransaction) => Promise<T>,
): Promise<T> {
  assertMemberAdministrator(actor);
  if (actor.isMock) throw new MemberManagementError("실제 관리자 계정으로 로그인해 주세요.");
  return getDb().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock_shared(${MEMBER_AUTHORIZATION_LOCK})`,
    );
    const [current] = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, actor.id))
      .for("share");
    if (!current) throw new MemberManagementError("계정을 확인할 수 없습니다.");
    assertMemberAdministrator({ ...current, isMock: false });
    await requireConnectedAccount(transaction, current.id);
    return read(transaction);
  });
}

export async function listMemberManagement(): Promise<{
  mode: "LIVE" | "PREVIEW";
  items: ManagedMember[];
}> {
  const actor = await requireMemberActor();
  assertMemberAdministrator(actor);
  if (actor.isMock) return { mode: "PREVIEW", items: [] };
  const rows = await readAsMemberAdministrator(actor, (transaction) =>
    transaction
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        handle: memberProfiles.handle,
        displayName: memberProfiles.displayName,
        nickname: memberProfiles.onceHumanNickname,
        // Approval status only: the private UID never enters the list response.
        profileComplete: sql<boolean>`coalesce(length(trim(${memberProfiles.onceHumanUid})) > 0 and length(trim(${memberProfiles.onceHumanNickname})) >= 2 and length(trim(${memberProfiles.handle})) >= 3, false)`,
        updatedAt: users.updatedAt,
        avatarId: memberProfileImages.id,
        avatarRevision: memberProfileImages.revision,
      })
      .from(users)
      .leftJoin(memberProfiles, eq(memberProfiles.userId, users.id))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .orderBy(desc(users.createdAt)),
  );
  return {
    mode: "LIVE",
    items: rows.map(({ avatarId, avatarRevision, ...row }) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
      imageUrl: avatarId && avatarRevision ? profileImageUrl(avatarId, avatarRevision) : null,
    })),
  };
}

export async function changeMemberRole(value: unknown): Promise<void> {
  const parsed = memberChangeSchema.safeParse(value);
  if (!parsed.success) throw new MemberManagementError("변경할 계정과 사유를 확인해 주세요.");
  const change: MemberChange = parsed.data;
  const sessionActor = await requireMemberActor();
  assertMemberAdministrator(sessionActor);
  if (sessionActor.isMock) throw new MemberManagementError("실제 운영 계정으로 로그인해 주세요.");
  // The membership helper can itself revoke a departed account. Call before taking our shared lock.
  const needsGuild =
    change.action === "approve" || change.action === "role" || change.action === "reopen";
  const guildEligible = needsGuild
    ? (await getLiveGuildEligibility(change.targetId)) === "MEMBER"
    : false;
  await getDb().transaction(async (transaction) => {
    // Shared with Discord revocation and first-admin bootstrap. Serializes the final-admin invariant.
    await transaction.execute(sql`select pg_advisory_xact_lock(${MEMBER_AUTHORIZATION_LOCK})`);
    const locked = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(sql`${users.id} in (${sessionActor.id}, ${change.targetId})`)
      .orderBy(users.id)
      .for("update");
    const actorRow = locked.find((row) => row.id === sessionActor.id);
    const target = locked.find((row) => row.id === change.targetId);
    if (!actorRow || !target)
      throw new MemberManagementError("계정을 찾을 수 없습니다. 화면을 새로고침해 주세요.");
    assertMemberAdministrator({ ...actorRow, isMock: false });
    await requireConnectedAccount(transaction, actorRow.id);
    const [profile] = await transaction
      .select({
        handle: memberProfiles.handle,
        nickname: memberProfiles.onceHumanNickname,
        uid: memberProfiles.onceHumanUid,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, target.id))
      .for("update");
    const [adminTotal] = await transaction
      .select({ value: sql<number>`count(*)::integer` })
      .from(users)
      .where(eq(users.role, "ADMIN"));
    const role = decideMemberRoleChange({
      actor: { ...actorRow, isMock: false },
      target: {
        ...target,
        profileComplete: Boolean(
          profile?.uid?.trim() &&
          profile.nickname.trim().length >= 2 &&
          profile.handle.trim().length >= 3,
        ),
      },
      change,
      guildEligible,
      adminCount: adminTotal?.value ?? 0,
    });
    await transaction
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    await transaction.insert(auditLogs).values({
      actorId: actorRow.id,
      action: `member.${change.action}`,
      entityType: "user",
      entityId: target.id,
      metadata: { previousRole: target.role, nextRole: role, reasonCode: change.reason },
    });
  });
}

/** Private form DTO. Only the profile owner or a live administrator may obtain this response. */
export async function getEditableMemberProfile(
  targetId?: string,
): Promise<EditableMemberProfile | null> {
  const actor = await requireMemberActor();
  if (actor.isMock) return null;
  const id = targetId ?? actor.id;
  assertMemberProfileEditor(actor, id);
  return getDb().transaction(async (transaction) => {
    // Prevent a concurrent administrator revocation from racing this private data read.
    const [current] = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, actor.id))
      .for("share");
    if (!current) throw new MemberManagementError("계정을 확인할 수 없습니다.");
    assertMemberProfileEditor({ ...current, isMock: false }, id);
    await requireConnectedAccount(transaction, current.id);
    const [profile] = await transaction
      .select({
        targetId: memberProfiles.userId,
        handle: memberProfiles.handle,
        displayName: memberProfiles.displayName,
        nickname: memberProfiles.onceHumanNickname,
        uid: memberProfiles.onceHumanUid,
        bio: memberProfiles.bio,
      })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, id))
      .limit(1);
    return profile ? { ...profile, uid: profile.uid ?? "", bio: profile.bio ?? "" } : null;
  });
}

export async function saveMemberProfile(value: unknown, administratorOnly = false): Promise<void> {
  await persistMemberProfile(value, administratorOnly);
}

/** Settings submits the owner's profile and optional avatar in one database transaction. */
export async function saveOwnProfileSettings(
  value: unknown,
  imageChange?: { content: Buffer; revision: string } | null,
): Promise<ProfileImageState | null> {
  return persistMemberProfile(value, false, true, imageChange);
}

async function persistMemberProfile(
  value: unknown,
  administratorOnly = false,
  ownerOnly = false,
  imageChange?: { content: Buffer; revision: string } | null,
): Promise<ProfileImageState | null> {
  const parsed = memberProfileSchema.safeParse(value);
  if (!parsed.success)
    throw new MemberManagementError(
      parsed.error.issues[0]?.message ?? "프로필 정보를 확인해 주세요.",
    );
  const data = parsed.data;
  const sessionActor = await requireMemberActor();
  if (ownerOnly && data.targetId !== sessionActor.id)
    throw new MemberManagementError("본인의 프로필만 수정할 수 있습니다.");
  if (administratorOnly) assertMemberAdministrator(sessionActor);
  assertMemberProfileEditor(sessionActor, data.targetId);
  // Eligibility can revoke a departed account, so check before acquiring our authorization lock.
  if (
    imageChange !== undefined &&
    (await getSessionGuildEligibilityState(sessionActor.id)).status !== "MEMBER"
  )
    throw new MemberManagementError("Discord 연결을 확인한 후 다시 저장해 주세요.");
  return getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(${MEMBER_AUTHORIZATION_LOCK})`);
    const locked = await transaction
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(sql`${users.id} in (${sessionActor.id}, ${data.targetId})`)
      .orderBy(users.id)
      .for("update");
    const actor = locked.find((row) => row.id === sessionActor.id);
    const target = locked.find((row) => row.id === data.targetId);
    if (!actor || !target) throw new MemberManagementError("대상 계정을 찾을 수 없습니다.");
    if (administratorOnly) assertMemberAdministrator({ ...actor, isMock: false });
    assertMemberProfileEditor({ ...actor, isMock: false }, target.id);
    await requireConnectedAccount(transaction, actor.id);
    const [profile] = await transaction
      .select({ id: memberProfiles.id })
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, target.id))
      .for("update");
    const values = {
      handle: data.handle,
      displayName: data.displayName,
      onceHumanNickname: data.nickname,
      onceHumanUid: data.uid,
      bio: data.bio || null,
      updatedAt: new Date(),
    };
    const [saved] = profile
      ? await transaction
          .update(memberProfiles)
          .set(values)
          .where(eq(memberProfiles.userId, target.id))
          .returning({ id: memberProfiles.id })
      : await transaction
          .insert(memberProfiles)
          .values({ userId: target.id, ...values })
          .returning({ id: memberProfiles.id });
    if (!saved) throw new MemberManagementError("프로필을 저장하지 못했습니다.");
    const imageState =
      imageChange === undefined
        ? null
        : await persistProfileImageInTransaction(transaction, actor.id, imageChange);
    await transaction.insert(auditLogs).values({
      actorId: actor.id,
      action: profile ? "profile.updated" : "profile.created",
      entityType: "member_profile",
      entityId: saved.id,
      metadata: {
        changedFields: ["handle", "displayName", "nickname", "bio"],
        privateIdentifierUpdated: true,
      },
    });
    return imageState;
  });
}

/** Administrator action boundary; the owner-only onboarding path uses saveMemberProfile directly. */
export async function saveManagedMemberProfile(value: unknown): Promise<void> {
  await saveMemberProfile(value, true);
}

export async function getMemberDirectory(): Promise<{
  mode: "LIVE" | "PREVIEW";
  members: DirectoryMember[];
}> {
  const actor = await requireMemberActor();
  assertMemberAdministrator(actor);
  if (actor.isMock)
    return {
      mode: "PREVIEW",
      members: mockMembers.map((member) => ({
        id: member.id,
        userId: member.userId,
        handle: member.handle,
        displayName: member.displayName,
        nickname: member.onceHumanNickname,
        bio: member.bio,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
        imageUrl: null,
      })),
    };
  const rows = await readAsMemberAdministrator(actor, (transaction) =>
    transaction
      .select({
        id: memberProfiles.id,
        userId: users.id,
        handle: memberProfiles.handle,
        displayName: memberProfiles.displayName,
        nickname: memberProfiles.onceHumanNickname,
        bio: memberProfiles.bio,
        role: users.role,
        joinedAt: memberProfiles.joinedAt,
        avatarId: memberProfileImages.id,
        avatarRevision: memberProfileImages.revision,
      })
      .from(memberProfiles)
      .innerJoin(users, eq(users.id, memberProfiles.userId))
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .where(sql`${users.role} in ('MEMBER', 'OFFICER', 'ADMIN')`)
      .orderBy(memberProfiles.displayName),
  );
  return {
    mode: "LIVE",
    members: rows
      .filter((row) => isApprovedRole(row.role))
      .map(({ avatarId, avatarRevision, ...row }) => ({
        ...row,
        joinedAt: row.joinedAt.toISOString(),
        imageUrl: avatarId && avatarRevision ? profileImageUrl(avatarId, avatarRevision) : null,
      })),
  };
}

export async function getMemberPublicProfile(handle: string): Promise<DirectoryMember | null> {
  // Authorization is checked even for malformed handles; this route is not a public member lookup.
  const actor = await requireMemberActor();
  assertMemberAdministrator(actor);
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(handle)) return null;
  const directory = await getMemberDirectory();
  return (
    directory.members.find((member) => member.handle.toLowerCase() === handle.toLowerCase()) ?? null
  );
}

export async function getManagedMemberIdentity(
  id: string,
): Promise<{ id: string; name: string; role: HiveRole; imageUrl?: string | null } | null> {
  const actor = await requireMemberActor();
  assertMemberAdministrator(actor);
  if (actor.isMock) throw new MemberManagementError("실제 운영 계정으로 로그인해 주세요.");
  const [target] = await readAsMemberAdministrator(actor, (transaction) =>
    transaction
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        avatarId: memberProfileImages.id,
        avatarRevision: memberProfileImages.revision,
      })
      .from(users)
      .leftJoin(memberProfileImages, eq(memberProfileImages.userId, users.id))
      .where(eq(users.id, id))
      .limit(1),
  );
  if (!target) return null;
  const { avatarId, avatarRevision, ...identity } = target;
  return {
    ...identity,
    imageUrl: avatarId && avatarRevision ? profileImageUrl(avatarId, avatarRevision) : null,
  };
}
