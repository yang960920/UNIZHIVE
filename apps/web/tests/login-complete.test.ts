import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";
import { DISCORD_GRANT_HINT_COOKIE } from "../src/lib/login-flow";
import { DEFAULT_USER_PREFERENCES } from "../src/lib/user-preferences";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  preferences: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@/lib/login-flow", () => import("../src/lib/login-flow"));
vi.mock("@/lib/server/user-preferences", () => ({ getUserPreferences: boundary.preferences }));

import { GET } from "../src/app/login/complete/route";

const user = { id: "live-user", name: "Member", role: "MEMBER" as const, isMock: false };
const original = "/lab/b/id/edit?from=2";
const callback = `https://hive.example/login/complete?callbackUrl=${encodeURIComponent(original)}`;

beforeEach(() => {
  boundary.state = { user: null, status: "GUEST" };
  boundary.preferences.mockReset().mockResolvedValue(DEFAULT_USER_PREFERENCES);
  vi.stubEnv("DISCORD_CLIENT_ID", "test-application");
});
afterEach(() => vi.unstubAllEnvs());

describe("verified login completion", () => {
  it("uses the saved first page for a normal login but preserves an explicit destination", async () => {
    boundary.state = { user, status: "AUTHENTICATED" };
    boundary.preferences.mockResolvedValue({ ...DEFAULT_USER_PREFERENCES, startPage: "/map" });
    expect(
      (await GET(new Request("https://hive.example/login/complete"))).headers.get("location"),
    ).toBe("/map");
    expect((await GET(new Request(callback))).headers.get("location")).toBe(original);
    expect(boundary.preferences).toHaveBeenCalledTimes(1);
  });

  it("keeps login successful if preference storage is temporarily unavailable", async () => {
    boundary.state = { user, status: "AUTHENTICATED" };
    boundary.preferences.mockRejectedValue(new Error("offline"));
    expect(
      (await GET(new Request("https://hive.example/login/complete"))).headers.get("location"),
    ).toBe("/");
  });
  it.each(["MEMBER", "OFFICER", "ADMIN"] as const)(
    "returns an approved %s to the original page and remembers consent without storing identity",
    async (role) => {
      boundary.state = { user: { ...user, role }, status: "AUTHENTICATED" };
      const response = await GET(new Request(callback));
      expect(response.headers.get("location")).toBe(original);
      expect(response.status).toBe(303);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const cookie = response.cookies.get(DISCORD_GRANT_HINT_COOKIE);
      expect(cookie).toMatchObject({
        value: "test-application:identify guilds.members.read",
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/login",
      });
      expect(cookie?.value).not.toContain(user.id);
      expect(cookie?.value).not.toContain(user.role);
    },
  );

  it.each(["APPLICANT", "GUEST"] as const)(
    "sends a verified %s to onboarding regardless of requested protected destination",
    async (role) => {
      boundary.state = { user: { ...user, role }, status: "AUTHENTICATED" };
      const response = await GET(new Request(callback));
      expect(response.headers.get("location")).toBe("/onboarding");
      expect(response.cookies.has(DISCORD_GRANT_HINT_COOKIE)).toBe(false);
    },
  );

  it.each([
    ["UNAVAILABLE", "DiscordUnavailable"],
    ["LEFT", "GuildMembership"],
    ["REAUTH_REQUIRED", "AccessDenied"],
    ["GUEST", null],
  ] as const)(
    "never bypasses %s even with an attached approved identity",
    async (status, error) => {
      boundary.state = { user, status };
      const response = await GET(new Request(callback));
      const location = new URL(response.headers.get("location")!, callback);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("callbackUrl")).toBe(original);
      expect(location.searchParams.get("error")).toBe(error);
      expect(response.cookies.has(DISCORD_GRANT_HINT_COOKIE)).toBe(false);
    },
  );

  it("ignores external callbacks and never marks development accounts as Discord grants", async () => {
    boundary.state = { user: { ...user, isMock: true }, status: "AUTHENTICATED" };
    const response = await GET(
      new Request("http://127.0.0.1:3000/login/complete?callbackUrl=https://other.example"),
    );
    expect(response.headers.get("location")).toBe("/");
    expect(response.cookies.has(DISCORD_GRANT_HINT_COOKIE)).toBe(false);
  });

  it.each([
    ["AUTHENTICATED", "MEMBER", "/lab/b/id?version=4"],
    ["AUTHENTICATED", "APPLICANT", "/onboarding"],
    ["REAUTH_REQUIRED", "MEMBER", "/login"],
    ["UNAVAILABLE", "MEMBER", "/login"],
    ["LEFT", "MEMBER", "/login"],
  ] as const)(
    "keeps the browser cookie host when Next.js reports localhost for %s/%s",
    async (status, role, expectedPath) => {
      boundary.state = { user: { ...user, role }, status };
      const browserOrigin = "http://127.0.0.1:3000";
      const request = new Request(
        `http://localhost:3000/login/complete?callbackUrl=${encodeURIComponent("/lab/b/id?version=4")}`,
        { headers: { host: "127.0.0.1:3000" } },
      );
      const response = await GET(request);
      const relativeLocation = response.headers.get("location")!;
      expect(relativeLocation).toMatch(/^\/(?!\/)/);
      expect(relativeLocation).not.toContain("localhost");
      const browserTarget = new URL(relativeLocation, browserOrigin);
      expect(browserTarget.origin).toBe(browserOrigin);
      expect(
        `${browserTarget.pathname}${role === "MEMBER" && status === "AUTHENTICATED" ? browserTarget.search : ""}`,
      ).toBe(expectedPath);
    },
  );
});
