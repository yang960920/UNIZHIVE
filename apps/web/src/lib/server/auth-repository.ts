import "server-only";
import { accounts, and, auditLogs, eq, getDb, memberProfileImages, sql, users } from "@uniz/db";
import { resolveDatabaseUrl } from "@uniz/db/environment";
import type { CurrentUser } from "../auth-policy";
import { hasDiscordMembershipScope, roleAfterDiscordSignIn } from "./discord-authorization-policy";
import { encryptDiscordToken } from "./discord-token-crypto";
import { profileImageUrl } from "../profile-image";

export async function findAuthUser(id: string): Promise<CurrentUser | null> {
  if (!resolveDatabaseUrl(process.env)) return null;
  const [user] = await getDb()
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
    .limit(1);
  return user
    ? {
        id: user.id,
        name: user.name,
        role: user.role,
        isMock: false,
        imageUrl:
          user.avatarId && user.avatarRevision
            ? profileImageUrl(user.avatarId, user.avatarRevision)
            : null,
      }
    : null;
}

export async function persistDiscordIdentity(identity: {
  discordId: string;
  name: string;
  image: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
}): Promise<{ id: string; name: string }> {
  if (
    !Number.isSafeInteger(identity.expiresAt) ||
    identity.expiresAt <= Math.floor(Date.now() / 1000) ||
    !hasDiscordMembershipScope(identity.scope)
  )
    throw new Error("Discord OAuth consent is incomplete.");
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const tokenValues = {
    access_token: encryptDiscordToken(
      identity.accessToken,
      `discord:${identity.discordId}:access`,
      secret,
    ),
    refresh_token: identity.refreshToken
      ? encryptDiscordToken(identity.refreshToken, `discord:${identity.discordId}:refresh`, secret)
      : null,
    expires_at: identity.expiresAt,
    scope: identity.scope,
    token_type: "Bearer",
    id_token: null,
    session_state: null,
    updatedAt: new Date(),
  };
  return getDb().transaction(async (transaction) => {
    // Shared lock order for approval/bootstrap/leave: advisory -> user -> account.
    await transaction.execute(sql`select pg_advisory_xact_lock(912743110)`);
    const [existing] = await transaction
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, identity.discordId)),
      )
      .limit(1);
    if (existing) {
      const [current] = await transaction
        .select()
        .from(users)
        .where(eq(users.id, existing.userId))
        .for("update");
      if (!current) throw new Error("Linked Discord identity has no user.");
      const role = roleAfterDiscordSignIn(current.role);
      const [updated] = await transaction
        .update(users)
        .set({ name: identity.name, image: identity.image, role, updatedAt: new Date() })
        .where(eq(users.id, existing.userId))
        .returning({ id: users.id, name: users.name });
      if (!updated) throw new Error("Linked Discord identity has no user.");
      await transaction
        .update(accounts)
        .set(tokenValues)
        .where(
          and(eq(accounts.provider, "discord"), eq(accounts.providerAccountId, identity.discordId)),
        );
      if (role !== current.role) {
        await transaction.insert(auditLogs).values({
          actorId: current.id,
          action: "auth.discord.rejoined",
          entityType: "user",
          entityId: current.id,
          metadata: { previousRole: current.role, role },
        });
      }
      return updated;
    }
    const [user] = await transaction
      .insert(users)
      .values({ name: identity.name, image: identity.image, role: "APPLICANT" })
      .returning({ id: users.id, name: users.name });
    if (!user) throw new Error("Failed to create Discord user.");
    // Tokens are authenticated ciphertext at rest and never part of the browser session.
    await transaction.insert(accounts).values({
      userId: user.id,
      type: "oauth",
      provider: "discord",
      providerAccountId: identity.discordId,
      ...tokenValues,
    });
    return user;
  });
}
