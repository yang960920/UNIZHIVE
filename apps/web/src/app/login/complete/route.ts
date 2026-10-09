import { NextResponse } from "next/server";
import { getCurrentAuthState } from "@/lib/auth";
import { getUserPreferences } from "@/lib/server/user-preferences";
import {
  DISCORD_GRANT_HINT_COOKIE,
  getDiscordGrantHint,
  getSafeLoginDestination,
  isApprovedLoginRole,
} from "@/lib/login-flow";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = getSafeLoginDestination(url.searchParams.get("callbackUrl"), url.origin);
  const state = await getCurrentAuthState();
  const loginParams = new URLSearchParams({ callbackUrl: destination });
  let target: string;
  if (state.status === "UNAVAILABLE") {
    loginParams.set("error", "DiscordUnavailable");
    target = `/login?${loginParams}`;
  } else if (state.status === "LEFT") {
    loginParams.set("error", "GuildMembership");
    target = `/login?${loginParams}`;
  } else if (state.status === "REAUTH_REQUIRED") {
    loginParams.set("error", "AccessDenied");
    target = `/login?${loginParams}`;
  } else if (state.status !== "AUTHENTICATED" || !state.user) {
    target = `/login?${loginParams}`;
  } else if (isApprovedLoginRole(state.user.role)) {
    target =
      destination === "/"
        ? await getUserPreferences(state.user)
            .then((preferences) => preferences.startPage)
            .catch(() => "/")
        : destination;
  } else {
    target = "/onboarding";
  }
  // Next.js can expose an internal localhost URL here even when the browser uses
  // 127.0.0.1 or a public host. A relative Location preserves that browser's cookie host.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
  const hint = getDiscordGrantHint(process.env.DISCORD_CLIENT_ID);
  if (
    hint &&
    state.status === "AUTHENTICATED" &&
    state.user &&
    !state.user.isMock &&
    isApprovedLoginRole(state.user.role)
  ) {
    response.cookies.set(DISCORD_GRANT_HINT_COOKIE, hint, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/login",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
