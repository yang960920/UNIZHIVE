import type { HiveRole } from "@uniz/domain";
import { DISCORD_OAUTH_SCOPE } from "./discord-oauth-config";

export type LoginIntent = "login" | "join";
export const DISCORD_GRANT_HINT_COOKIE = "uniz-discord-grant";
const LOCAL_ORIGIN = "https://uniz.invalid";

/** Navigation only: every destination still performs its existing authorization checks. */
export function getSafeLoginDestination(value: unknown, origin?: string): string {
  if (typeof value !== "string" || !value || value.length > 2048) return "/";
  if (/[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//")) return "/";
  if (!value.startsWith("/") && !origin) return "/";
  try {
    const base = new URL(origin ?? LOCAL_ORIGIN);
    const url = new URL(value, base);
    if (url.origin !== base.origin || url.username || url.password) return "/";
    let pathname = url.pathname;
    for (let count = 0; count < 3; count++) {
      if (/[\\\u0000-\u0020\u007f]/.test(pathname) || pathname.startsWith("//")) return "/";
      const next = decodeURIComponent(pathname);
      if (next === pathname) break;
      pathname = next;
    }
    if (
      /[\\\u0000-\u0020\u007f]/.test(pathname) ||
      pathname.startsWith("//") ||
      /%[0-9a-f]{2}/i.test(pathname)
    )
      return "/";
    const segment = new URL(pathname, base).pathname.split("/")[1]?.toLowerCase();
    if (["login", "onboarding", "api"].includes(segment)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function getLoginCompletionUrl(destination: unknown, intent: LoginIntent = "login"): string {
  const params = new URLSearchParams({ callbackUrl: getSafeLoginDestination(destination) });
  if (intent === "join") params.set("intent", "join");
  return `/login/complete?${params}`;
}

/** NextAuth may return its stored, absolute completion URL after an OAuth failure. */
export function readLoginDestination(value: unknown, origin?: string): string {
  if (typeof value !== "string") return "/";
  try {
    const base = new URL(origin ?? LOCAL_ORIGIN);
    const url = new URL(value, base);
    if (url.origin === base.origin && url.pathname === "/login/complete") {
      return getSafeLoginDestination(url.searchParams.get("callbackUrl"), base.origin);
    }
  } catch {
    return "/";
  }
  return getSafeLoginDestination(value, origin);
}

export function isApprovedLoginRole(role: HiveRole): boolean {
  return role === "MEMBER" || role === "OFFICER" || role === "ADMIN";
}

/** This cookie is a consent-screen preference, never identity or membership evidence. */
export function getDiscordGrantHint(clientId: string | undefined): string | null {
  return clientId?.trim() ? `${clientId.trim()}:${DISCORD_OAUTH_SCOPE}` : null;
}

export function getDiscordLoginAuthorization(input: {
  intent: LoginIntent;
  rememberedGrant: boolean;
  hasError: boolean;
}): { prompt: "none" | "consent" } {
  return {
    prompt:
      input.intent === "login" && input.rememberedGrant && !input.hasError ? "none" : "consent",
  };
}
