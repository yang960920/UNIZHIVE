import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  state: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`Redirect: ${url}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: fixture.state }));
vi.mock("next/navigation", () => ({ redirect: fixture.redirect }));

import { getAdminDenialNotice, getAdminNavigation, requireAdmin } from "../src/lib/server/admin";

beforeEach(() => {
  fixture.state.mockReset();
  fixture.redirect.mockClear();
});

describe("admin authorization recovery", () => {
  it("keeps a live verification outage in the current admin flow instead of redirecting to login", async () => {
    fixture.state.mockResolvedValue({ user: null, status: "UNAVAILABLE" });
    await expect(requireAdmin("seasons")).rejects.toThrow(
      "Admin authorization is temporarily unavailable.",
    );
    expect(fixture.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["GUEST", "/login?callbackUrl=/admin"],
    ["REAUTH_REQUIRED", "/login?error=AccessDenied&callbackUrl=/admin"],
    ["LEFT", "/login?error=GuildMembership&callbackUrl=/admin"],
  ])("redirects %s to its appropriate login message", async (status, url) => {
    fixture.state.mockResolvedValue({ user: null, status });
    await expect(requireAdmin()).rejects.toThrow(`Redirect: ${url}`);
    expect(fixture.redirect).toHaveBeenCalledExactlyOnceWith(url);
  });

  it("continues enforcing section permissions for verified members, officers and admins", async () => {
    const user = { id: "test-user", name: "Test User", isMock: false };
    fixture.state.mockResolvedValue({ user: { ...user, role: "MEMBER" }, status: "AUTHENTICATED" });
    await expect(requireAdmin("operations")).rejects.toThrow("Redirect: /");
    fixture.state.mockResolvedValue({
      user: { ...user, role: "OFFICER" },
      status: "AUTHENTICATED",
    });
    await expect(requireAdmin("seasons")).resolves.toMatchObject({ role: "OFFICER" });
    await expect(requireAdmin("members")).rejects.toThrow("Redirect: /admin?denied=members");
    await expect(requireAdmin("builds")).rejects.toThrow("Redirect: /admin?denied=builds");
    await expect(requireAdmin("integrations")).rejects.toThrow(
      "Redirect: /admin?denied=integrations",
    );
    fixture.state.mockResolvedValue({ user: { ...user, role: "ADMIN" }, status: "AUTHENTICATED" });
    await expect(requireAdmin("integrations")).resolves.toMatchObject({ role: "ADMIN" });
    await expect(requireAdmin("members")).resolves.toMatchObject({ role: "ADMIN" });
    await expect(requireAdmin("builds")).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("retains an officer's valid session and allowed season tools after a member-access denial", async () => {
    const officer = {
      id: "test-officer",
      name: "Test officer",
      role: "OFFICER" as const,
      isMock: false,
    };
    const state = { user: officer, status: "AUTHENTICATED" };
    fixture.state.mockResolvedValue(state);
    await expect(requireAdmin("members")).rejects.toThrow("Redirect: /admin?denied=members");
    expect(state).toEqual({ user: officer, status: "AUTHENTICATED" });
    await expect(requireAdmin()).resolves.toBe(officer);
    await expect(requireAdmin("seasons")).resolves.toBe(officer);
    expect(getAdminNavigation(officer).some((item) => item.href === "/admin/members")).toBe(false);
    expect(getAdminDenialNotice("members", officer)).toContain("관리자 전용");
    expect(getAdminDenialNotice("members", officer)).toContain("로그인은 유지");
  });

  it("shows only known denied sections and never reflects arbitrary query text", () => {
    const user = {
      id: "test-officer",
      name: "Test officer",
      role: "OFFICER" as const,
      isMock: false,
    };
    expect(getAdminDenialNotice("unknown-section", user)).toBeNull();
    expect(getAdminDenialNotice(["members", "integrations"], user)).toBeNull();
    expect(getAdminDenialNotice("seasons", user)).toBeNull();
    expect(getAdminDenialNotice("members", { ...user, role: "ADMIN" })).toBeNull();
    expect(getAdminDenialNotice("integrations", user)).toContain("관리자 전용");
  });
});
