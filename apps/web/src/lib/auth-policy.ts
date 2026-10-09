import type { HiveRole } from "@uniz/domain";

export interface CurrentUser {
  id: string;
  name: string;
  role: HiveRole;
  isMock: boolean;
  /** Server-selected private avatar endpoint; Discord images and binary data stay out of DTOs. */
  imageUrl?: string | null;
}

export type AuthStatus = "GUEST" | "AUTHENTICATED" | "REAUTH_REQUIRED" | "UNAVAILABLE" | "LEFT";

export interface CurrentAuthState {
  user: CurrentUser | null;
  status: AuthStatus;
  retryAfterSeconds?: number;
}

/** A failed cookie decode is different from a visitor who has never signed in. */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  return /(?:^|;\s*)(?:__Secure-)?next-auth\.session-token(?:\.\d+)?=/.test(cookieHeader ?? "");
}

export interface AuthEnvironment {
  mockEnabled: boolean;
  discordEnabled: boolean;
  production: boolean;
}

export const DEV_IDENTITIES: readonly CurrentUser[] = [
  { id: "demo-member", name: "Kiri", role: "MEMBER", isMock: true },
  { id: "demo-officer", name: "Moss", role: "OFFICER", isMock: true },
  { id: "demo-admin", name: "Yun", role: "ADMIN", isMock: true },
];

export function getAuthEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): AuthEnvironment {
  const production = env.NODE_ENV === "production";
  if (production && env.MOCK_AUTH?.trim().toLowerCase() === "true") {
    throw new Error(
      "MOCK_AUTH is forbidden in production. Remove this setting before starting the app.",
    );
  }
  return {
    production,
    mockEnabled: env.NODE_ENV === "development" && env.MOCK_AUTH?.trim().toLowerCase() !== "false",
    discordEnabled: Boolean(
      env.DISCORD_CLIENT_ID?.trim() &&
      env.DISCORD_CLIENT_SECRET?.trim() &&
      env.DISCORD_GUILD_ID?.trim() &&
      env.DATABASE_URL?.trim() &&
      (!production || env.NEXTAUTH_SECRET?.trim()),
    ),
  };
}

export function resolveAuthSecret(
  env: Readonly<Record<string, string | undefined>>,
  developmentSecret: string | undefined,
): string | undefined {
  return (
    env.NEXTAUTH_SECRET?.trim() || (env.NODE_ENV === "production" ? undefined : developmentSecret)
  );
}

/** Client input chooses an opaque development identity; it can never supply its own role. */
export function resolveDevIdentity(
  identityId: unknown,
  env: Readonly<Record<string, string | undefined>>,
): CurrentUser | null {
  if (!getAuthEnvironment(env).mockEnabled || typeof identityId !== "string") return null;
  const identity = DEV_IDENTITIES.find((user) => user.id === identityId);
  return identity ? { ...identity } : null;
}

/** Rejects development cookies carried into production, even if the same signing key was reused. */
export function isAllowedSessionIdentity(
  identity: { id?: unknown; isMock?: unknown },
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const config = getAuthEnvironment(env);
  if (typeof identity.id !== "string") return false;
  const devIdentity = DEV_IDENTITIES.some((user) => user.id === identity.id);
  if (identity.isMock === true || devIdentity) {
    return config.mockEnabled && identity.isMock === true && devIdentity;
  }
  return identity.isMock === false;
}
