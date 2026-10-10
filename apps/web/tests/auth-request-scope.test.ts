import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthOptions } from "next-auth";
import type { CurrentUser } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  request: new Headers(),
  headersUnavailable: false,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Request scope member",
    role: "ADMIN",
    isMock: false,
  } as CurrentUser,
  eligibility: vi.fn(),
  member: vi.fn(),
  serverSession: vi.fn(),
  authUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// An action's ordinary utility calls have no React render cache dispatcher.
vi.mock("react", () => ({ cache: (reader: unknown) => reader }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (boundary.headersUnavailable) throw new Error("No request context");
    return boundary.request;
  },
}));
vi.mock("next-auth", () => ({ getServerSession: boundary.serverSession }));
vi.mock("@uniz/integrations/server", () => ({ getCurrentDiscordGuildMember: boundary.member }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: boundary.eligibility,
  captureDiscordSignInGrant: vi.fn(),
  confirmAbsentDiscordSignIn: vi.fn(),
}));
vi.mock("../src/lib/server/auth-repository", () => ({
  findAuthUser: boundary.authUser,
  persistDiscordIdentity: vi.fn(),
}));

import { getCurrentAuthState, getCurrentSessionState, getCurrentUser } from "../src/lib/auth";

beforeEach(() => {
  boundary.request = new Headers({ cookie: "opaque-session-cookie" });
  boundary.headersUnavailable = false;
  boundary.member.mockReset();
  boundary.user = { ...boundary.user, role: "ADMIN" };
  boundary.eligibility.mockReset().mockResolvedValue({ status: "MEMBER", retryAfterSeconds: null });
  boundary.authUser.mockReset().mockImplementation(async () => ({ ...boundary.user }));
  boundary.serverSession.mockReset().mockImplementation(async (options: NextAuthOptions) => {
    return options.callbacks!.session!({
      session: { expires: "2026-10-07T00:00:00Z" },
      token: { userId: boundary.user.id, isMock: false },
    } as Parameters<NonNullable<NonNullable<NextAuthOptions["callbacks"]>["session"]>>[0]);
  });
});

describe("HTTP request authentication scope", () => {
  it("shares one local account authorization lookup between action utilities and its response render", async () => {
    expect((await getCurrentSessionState()).user?.role).toBe("ADMIN");
    expect(boundary.eligibility).not.toHaveBeenCalled();
    expect((await getCurrentUser())?.role).toBe("ADMIN");
    expect((await getCurrentAuthState()).status).toBe("AUTHENTICATED");
    expect((await getCurrentUser())?.id).toBe(boundary.user.id);
    expect(boundary.serverSession).toHaveBeenCalledTimes(1);
    expect(boundary.eligibility).toHaveBeenCalledTimes(1);
    expect(boundary.member).not.toHaveBeenCalled();
  });

  it("shares the pending local account read when multiple action readers run concurrently", async () => {
    const states = await Promise.all(Array.from({ length: 12 }, () => getCurrentAuthState()));
    expect(states.every((state) => state.status === "AUTHENTICATED")).toBe(true);
    expect(boundary.serverSession).toHaveBeenCalledTimes(1);
    expect(boundary.eligibility).toHaveBeenCalledTimes(1);
  });

  it("observes a locally cleared Discord account on the next request and requires sign-in again", async () => {
    expect((await getCurrentAuthState()).status).toBe("AUTHENTICATED");
    boundary.request = new Headers({ cookie: "opaque-session-cookie" });
    boundary.eligibility.mockResolvedValue({ status: "REAUTH_REQUIRED", retryAfterSeconds: null });
    expect(await getCurrentAuthState()).toEqual({ user: null, status: "REAUTH_REQUIRED" });
    expect(boundary.serverSession).toHaveBeenCalledTimes(2);
    expect(boundary.eligibility).toHaveBeenCalledTimes(2);
    expect(boundary.member).not.toHaveBeenCalled();
  });

  it("does not retain a local account database failure across requests or attach a retry delay", async () => {
    boundary.eligibility.mockResolvedValue({ status: "UNAVAILABLE", retryAfterSeconds: null });
    expect(await getCurrentAuthState()).toEqual({ user: null, status: "UNAVAILABLE" });
    expect(await getCurrentUser()).toBeNull();
    expect((await getCurrentSessionState()).user?.id).toBe(boundary.user.id);
    expect(boundary.eligibility).toHaveBeenCalledTimes(1);
    boundary.request = new Headers({ cookie: "opaque-session-cookie" });
    boundary.eligibility.mockResolvedValue({ status: "MEMBER", retryAfterSeconds: null });
    expect((await getCurrentAuthState()).status).toBe("AUTHENTICATED");
    expect(boundary.eligibility).toHaveBeenCalledTimes(2);
    expect(boundary.member).not.toHaveBeenCalled();
  });

  it("reads changed database roles on the next request rather than trusting the prior state", async () => {
    expect((await getCurrentUser())?.role).toBe("ADMIN");
    boundary.request = new Headers({ cookie: "opaque-session-cookie" });
    boundary.user = { ...boundary.user, role: "MEMBER" };
    expect((await getCurrentUser())?.role).toBe("MEMBER");
    expect(boundary.eligibility).toHaveBeenCalledTimes(2);
  });

  it("does not trust the display identity's role after a concurrent demotion during the local account read", async () => {
    expect((await getCurrentSessionState()).user?.role).toBe("ADMIN");
    boundary.eligibility.mockImplementation(async () => {
      boundary.user = { ...boundary.user, role: "MEMBER" };
      return { status: "MEMBER", retryAfterSeconds: null };
    });
    expect((await getCurrentUser())?.role).toBe("MEMBER");
    expect((await getCurrentSessionState()).user?.role).toBe("ADMIN");
    expect(boundary.eligibility).toHaveBeenCalledTimes(1);
  });

  it("keeps header-only page requests independent from the local account authorization read", async () => {
    for (let request = 0; request < 8; request++) {
      boundary.request = new Headers({ cookie: "opaque-session-cookie" });
      expect((await getCurrentSessionState()).status).toBe("AUTHENTICATED");
    }
    expect(boundary.serverSession).toHaveBeenCalledTimes(8);
    expect(boundary.eligibility).not.toHaveBeenCalled();
    expect(boundary.member).not.toHaveBeenCalled();
  });

  it("denies authorization when an HTTP request scope is unavailable", async () => {
    boundary.headersUnavailable = true;
    expect(await getCurrentAuthState()).toEqual({ user: null, status: "UNAVAILABLE" });
    expect(boundary.serverSession).not.toHaveBeenCalled();
    expect(boundary.eligibility).not.toHaveBeenCalled();
  });
});
