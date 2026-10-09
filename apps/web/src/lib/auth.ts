import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { headers } from "next/headers";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import { getCurrentDiscordGuildMember } from "@uniz/integrations/server";
import {
  getAuthEnvironment,
  hasSessionCookie,
  isAllowedSessionIdentity,
  resolveDevIdentity,
  resolveAuthSecret,
  type AuthStatus,
  type CurrentAuthState,
  type CurrentUser,
} from "./auth-policy";
import { findAuthUser, persistDiscordIdentity } from "./server/auth-repository";
import {
  getSessionGuildEligibilityState,
  primeSessionGuildMembership,
} from "./server/discord-authorization";
import { hasDiscordMembershipScope } from "./server/discord-authorization-policy";
import { DISCORD_OAUTH_ISSUER, DISCORD_OAUTH_SCOPE } from "./discord-oauth-config";

export type { AuthStatus, CurrentAuthState, CurrentUser } from "./auth-policy";

// Process-local unpredictable secret supports credential-free development and survives HMR.
const authGlobal = globalThis as typeof globalThis & { __unizDevAuthSecret?: string };
const environment = getAuthEnvironment(process.env);
if (!environment.production && !authGlobal.__unizDevAuthSecret) {
  authGlobal.__unizDevAuthSecret = randomBytes(48).toString("hex");
}
export const authOptions: NextAuthOptions = {
  get secret() {
    // Development environment reloads must not retain a former fallback signing key.
    return resolveAuthSecret(process.env, authGlobal.__unizDevAuthSecret);
  },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  jwt: { maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    ...(environment.mockEnabled
      ? [
          CredentialsProvider({
            id: "development",
            name: "Development identity",
            credentials: { identityId: { label: "Development identity", type: "text" } },
            async authorize(credentials) {
              return resolveDevIdentity(credentials?.identityId, process.env);
            },
          }),
        ]
      : []),
    ...(environment.discordEnabled
      ? [
          DiscordProvider({
            clientId: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            issuer: DISCORD_OAUTH_ISSUER,
            authorization: { params: { scope: DISCORD_OAUTH_SCOPE } },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "development")
        return Boolean(resolveDevIdentity(user.id, process.env));
      if (
        account?.provider !== "discord" ||
        !environment.discordEnabled ||
        !account.access_token ||
        !account.expires_at ||
        !hasDiscordMembershipScope(account.scope)
      )
        return false;
      try {
        const member = await getCurrentDiscordGuildMember(
          process.env.DISCORD_GUILD_ID!,
          account.access_token,
        );
        if (!member || member.userId !== account.providerAccountId)
          return "/login?error=GuildMembership";
        const verifiedAt = Date.now();
        const persisted = await persistDiscordIdentity({
          discordId: account.providerAccountId,
          name: user.name ?? member.nickname ?? "UNIZ Applicant",
          image: user.image ?? null,
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? null,
          expiresAt: account.expires_at,
          scope: account.scope!,
        });
        user.id = persisted.id;
        user.name = persisted.name;
        // The successful sign-in already confirmed membership. Bind this verification
        // to the persisted grant instead of making a duplicate Discord call on landing.
        await primeSessionGuildMembership(persisted.id, {
          guildId: process.env.DISCORD_GUILD_ID!,
          discordId: account.providerAccountId,
          accessToken: account.access_token,
          verifiedAt,
        }).catch(() => undefined);
        return true;
      } catch {
        return "/login?error=DiscordUnavailable";
      }
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        token.userId = user.id;
        token.isMock = account.provider === "development";
        token.provider = account.provider;
      }
      // Do not preserve Discord tokens or trust roles from the JWT/session client payload.
      delete token.accessToken;
      delete token.refreshToken;
      delete token.access_token;
      delete token.refresh_token;
      delete token.id_token;
      delete token.role;
      return token;
    },
    async session({ session, token }) {
      const safeSession = session as typeof session & { authStatus: AuthStatus };
      // Status is recomputed here; never trust a status carried in the JWT or client payload.
      safeSession.authStatus = "REAUTH_REQUIRED";
      const identity = { id: token.userId, isMock: token.isMock };
      if (!isAllowedSessionIdentity(identity, process.env)) {
        delete session.user;
        return session;
      }
      // The login cookie represents identity. Discord availability must not erase that
      // identity; protected readers below verify Guild membership independently.
      try {
        const user =
          token.isMock === true
            ? resolveDevIdentity(token.userId, process.env)
            : await findAuthUser(String(token.userId));
        if (!user) {
          delete session.user;
          return safeSession;
        }
        session.user = user;
        safeSession.authStatus = "AUTHENTICATED";
        return safeSession;
      } catch {
        safeSession.authStatus = "UNAVAILABLE";
        delete session.user;
        return safeSession;
      }
    },
  },
};

type SessionRequest = Pick<Headers, "get">;

async function readCurrentSessionState(request: SessionRequest): Promise<CurrentAuthState> {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return {
        user: null,
        status: hasSessionCookie(request.get("cookie")) ? "REAUTH_REQUIRED" : "GUEST",
      };
    const status = (session as typeof session & { authStatus?: AuthStatus }).authStatus;
    if (status === "UNAVAILABLE" || status === "LEFT" || status === "REAUTH_REQUIRED") {
      return { user: null, status };
    }
    const user = session.user as CurrentUser | undefined;
    if (status !== "AUTHENTICATED" || !user || !isAllowedSessionIdentity(user, process.env))
      return { user: null, status: "REAUTH_REQUIRED" };
    return { user, status: "AUTHENTICATED" };
  } catch {
    return { user: null, status: "UNAVAILABLE" };
  }
}

const requestSessionStates = new WeakMap<object, Promise<CurrentAuthState>>();
function readRequestSession(request: SessionRequest): Promise<CurrentAuthState> {
  let state = requestSessionStates.get(request);
  if (!state) {
    state = readCurrentSessionState(request);
    requestSessionStates.set(request, state);
  }
  return state;
}

/** Identity for account/navigation display only. Never use this reader to authorize data or writes. */
export const getCurrentSessionState = cache(async (): Promise<CurrentAuthState> => {
  try {
    return await readRequestSession(await headers());
  } catch {
    return { user: null, status: "UNAVAILABLE" };
  }
});

async function readCurrentAuthState(request: SessionRequest): Promise<CurrentAuthState> {
  const identity = await readRequestSession(request);
  if (!identity.user || identity.status !== "AUTHENTICATED") return identity;
  try {
    if (!identity.user.isMock) {
      const eligibility = await getSessionGuildEligibilityState(identity.user.id);
      if (eligibility.status !== "MEMBER") {
        return {
          user: null,
          status: eligibility.status,
          ...(eligibility.retryAfterSeconds !== null
            ? { retryAfterSeconds: eligibility.retryAfterSeconds }
            : {}),
        };
      }
    }
    // Roles remain fresh even while a recent, bounded Guild verification is reused.
    const user = identity.user.isMock
      ? resolveDevIdentity(identity.user.id, process.env)
      : await findAuthUser(identity.user.id);
    return user ? { user, status: "AUTHENTICATED" } : { user: null, status: "REAUTH_REQUIRED" };
  } catch {
    return { user: null, status: "UNAVAILABLE" };
  }
}

// React.cache only deduplicates a server render. A Server Action can also call this reader
// several times before React renders its response. Next owns a distinct headers object
// per HTTP request and keeps it stable through the action and its revalidation render.
// Object identity (never a cookie/token/user ID) scopes the promise to that request;
// a later request revalidates the current grant and role; the Guild verification itself
// can be reused for five minutes without repeatedly consuming Discord's rate limit.
const requestAuthStates = new WeakMap<object, Promise<CurrentAuthState>>();
export const getCurrentAuthState = cache(async (): Promise<CurrentAuthState> => {
  try {
    const request = await headers();
    let state = requestAuthStates.get(request);
    if (!state) {
      state = readCurrentAuthState(request);
      requestAuthStates.set(request, state);
    }
    return await state;
  } catch {
    return { user: null, status: "UNAVAILABLE" };
  }
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return (await getCurrentAuthState()).user;
}
