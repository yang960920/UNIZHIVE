import "server-only";
import { cookies } from "next/headers";
import { accounts, and, eq, getDb, sql, userPreferences, users } from "@uniz/db";
import type { CurrentUser } from "../auth-policy";
import {
  DEFAULT_USER_PREFERENCES,
  demoPreferencesCookieName,
  normalizeUserPreferences,
  userPreferencesSchema,
  type UserPreferences,
} from "../user-preferences";
import { getSessionGuildEligibilityState } from "./discord-authorization";

export async function getUserPreferences(user: CurrentUser | null): Promise<UserPreferences> {
  if (!user) return { ...DEFAULT_USER_PREFERENCES };
  if (user.isMock) {
    const value = (await cookies()).get(demoPreferencesCookieName(user.id))?.value;
    try {
      return normalizeUserPreferences(value ? JSON.parse(value) : null);
    } catch {
      return { ...DEFAULT_USER_PREFERENCES };
    }
  }
  // Only the server's signed identity supplies the key. Tokens and profile UID are never selected.
  const [row] = await getDb()
    .select({ preferences: userPreferences.preferences })
    .from(users)
    .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.provider, "discord")))
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) throw new Error("계정 연결을 확인한 후 다시 로그인해 주세요.");
  return normalizeUserPreferences(row.preferences);
}

export async function persistUserPreferences(
  actor: CurrentUser,
  input: unknown,
): Promise<UserPreferences> {
  const preferences = userPreferencesSchema.parse(input);
  if (actor.isMock) {
    (await cookies()).set(demoPreferencesCookieName(actor.id), JSON.stringify(preferences), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return preferences;
  }
  const eligibility = await getSessionGuildEligibilityState(actor.id);
  if (eligibility.status !== "MEMBER")
    throw new Error("Discord 연결을 확인한 후 다시 저장해 주세요.");
  await getDb().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock_shared(912743110)`);
    const [fresh] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, actor.id))
      .for("share")
      .limit(1);
    const [connected] = await transaction
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, actor.id), eq(accounts.provider, "discord")))
      .limit(1);
    if (!fresh || !connected) throw new Error("계정 연결을 확인한 후 다시 로그인해 주세요.");
    await transaction
      .insert(userPreferences)
      .values({ userId: fresh.id, preferences })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { preferences, updatedAt: new Date() },
      });
  });
  return preferences;
}
