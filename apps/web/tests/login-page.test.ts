import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";
import {
  DISCORD_GRANT_HINT_COOKIE,
  getDiscordGrantHint,
  getLoginCompletionUrl,
} from "../src/lib/login-flow";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  cookieValues: {} as Record<string, string>,
  buttons: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`Redirect: ${url}`);
  }),
  retryNotice: function AuthRetryNotice() {
    return null;
  },
}));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      boundary.cookieValues[name] ? { name, value: boundary.cookieValues[name] } : undefined,
  }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@/lib/auth-policy", () => ({
  getAuthEnvironment: () => ({ mockEnabled: false, discordEnabled: true, production: false }),
}));
vi.mock("@/lib/login-flow", () => import("../src/lib/login-flow"));
vi.mock("@/components/auth-retry-notice", () => ({ AuthRetryNotice: boundary.retryNotice }));
vi.mock("@/components/logo", () => ({ Logo: () => null }));
vi.mock("../src/app/login/login-buttons", () => ({
  LoginButtons: (props: unknown) => {
    boundary.buttons(props);
    return null;
  },
}));
vi.mock("@uniz/ui", () => ({
  Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  Card: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

import LoginPage from "../src/app/login/page";
const user = { id: "live-user", name: "Member", role: "MEMBER" as const, isMock: false };

beforeEach(() => {
  boundary.state = { user: null, status: "GUEST" };
  boundary.cookieValues = {};
  boundary.buttons.mockReset();
  boundary.redirect.mockClear();
  vi.stubEnv("NEXTAUTH_URL", "http://127.0.0.1:3000");
  vi.stubEnv("DISCORD_CLIENT_ID", "test-application");
});
afterEach(() => vi.unstubAllEnvs());

describe("login page returning and first-time flow", () => {
  it("returns an active approved member directly to the requested editor", async () => {
    boundary.state = { user, status: "AUTHENTICATED" };
    await expect(
      LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/lab/b/id/edit?from=2" }) }),
    ).rejects.toThrow("Redirect: /lab/b/id/edit?from=2");
    expect(boundary.buttons).not.toHaveBeenCalled();
  });

  it.each(["APPLICANT", "GUEST"] as const)(
    "continues onboarding for a verified %s instead of honoring a protected callback",
    async (role) => {
      boundary.state = { user: { ...user, role }, status: "AUTHENTICATED" };
      await expect(
        LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/admin" }) }),
      ).rejects.toThrow("Redirect: /onboarding");
    },
  );

  it("shows connection recovery without confusing a temporary outage with logout", async () => {
    boundary.state = { user, status: "UNAVAILABLE", retryAfterSeconds: 65 };
    const result = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(result.type).toBe(boundary.retryNotice);
    expect(result.props).toEqual({ retryAfterSeconds: 65 });
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it("restores the callback after OAuth failure and requires consent on retry despite the hint", async () => {
    boundary.cookieValues[DISCORD_GRANT_HINT_COOKIE] = getDiscordGrantHint("test-application")!;
    boundary.cookieValues["next-auth.callback-url"] =
      `http://127.0.0.1:3000${getLoginCompletionUrl("/season?phase=2")}`;
    const result = await LoginPage({ searchParams: Promise.resolve({ error: "OAuthCallback" }) });
    const html = renderToStaticMarkup(result);
    expect(html).toContain("Discord 인증을 완료하지 못했습니다.");
    expect(boundary.buttons).toHaveBeenCalledExactlyOnceWith({
      mockEnabled: false,
      discordEnabled: true,
      destination: "/season?phase=2",
      rememberedGrant: true,
      hasError: true,
    });
  });

  it("does not reuse an old callback on an ordinary new visit or treat a cookie hint as login", async () => {
    boundary.cookieValues[DISCORD_GRANT_HINT_COOKIE] = getDiscordGrantHint("test-application")!;
    boundary.cookieValues["next-auth.callback-url"] =
      `http://127.0.0.1:3000${getLoginCompletionUrl("/admin")}`;
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("가입 신청과 멤버 승인을 다시");
    expect(boundary.buttons).toHaveBeenCalledWith(
      expect.objectContaining({ destination: "/", rememberedGrant: true, hasError: false }),
    );
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it.each(["LEFT", "REAUTH_REQUIRED"] as const)(
    "keeps %s on the login screen even with an attached approved identity",
    async (status) => {
      boundary.state = { user, status };
      renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
      expect(boundary.buttons).toHaveBeenCalledTimes(1);
      expect(boundary.redirect).not.toHaveBeenCalled();
    },
  );
});
