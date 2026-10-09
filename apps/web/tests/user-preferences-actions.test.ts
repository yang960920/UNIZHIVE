import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  auth: vi.fn(),
  persist: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: boundary.auth }));
vi.mock("../src/lib/server/user-preferences", () => ({ persistUserPreferences: boundary.persist }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));

import { saveUserPreferences } from "../src/lib/user-preferences-actions";
import { DEFAULT_USER_PREFERENCES } from "../src/lib/user-preferences";

const actor = {
  id: "56d5078e-8b21-42ef-865e-93c9ef85fe41",
  name: "설정 테스트",
  role: "MEMBER" as const,
  isMock: false,
};
beforeEach(() => {
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.auth.mockReset().mockImplementation(async () => boundary.state);
  boundary.persist.mockReset().mockImplementation(async (_user, preferences) => preferences);
  boundary.revalidate.mockClear();
});

describe("personal preference actions", () => {
  it.each(["GUEST", "LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"] as const)(
    "rejects %s even if an identity is attached without saving or revalidation",
    async (status) => {
      boundary.state = { user: actor, status };
      const result = await saveUserPreferences(DEFAULT_USER_PREFERENCES);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("preferences");
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it("denies an authenticated result without a signed identity", async () => {
    boundary.state = { user: null, status: "AUTHENTICATED" };
    expect((await saveUserPreferences(DEFAULT_USER_PREFERENCES)).ok).toBe(false);
    expect(boundary.persist).not.toHaveBeenCalled();
  });

  it.each(["userId", "targetId", "role", "accessToken"])(
    "rejects a submitted %s instead of forwarding it",
    async (key) => {
      expect(
        (await saveUserPreferences({ ...DEFAULT_USER_PREFERENCES, [key]: "other-person" })).ok,
      ).toBe(false);
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it("rejects incomplete preferences rather than implicitly resetting fields", async () => {
    expect((await saveUserPreferences({ showGuide: false })).ok).toBe(false);
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it.each(["GUEST", "APPLICANT", "MEMBER", "OFFICER", "ADMIN"] as const)(
    "saves authenticated %s settings under the server's identity",
    async (role) => {
      const user = { ...actor, role };
      boundary.state = { user, status: "AUTHENTICATED" };
      const input = { ...DEFAULT_USER_PREFERENCES, showGuide: false };
      expect(await saveUserPreferences(input)).toEqual({
        ok: true,
        message: "내 설정을 저장했습니다.",
        preferences: input,
      });
      expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(user, input);
      expect(boundary.revalidate).toHaveBeenCalledExactlyOnceWith("/", "layout");
    },
  );

  it("returns confirmed preferences from persistence and distinct preview feedback", async () => {
    const user = { ...actor, id: "demo-member", isMock: true };
    boundary.state = { user, status: "AUTHENTICATED" };
    const confirmed = { ...DEFAULT_USER_PREFERENCES, textSize: "LARGE" as const };
    boundary.persist.mockResolvedValue(confirmed);
    expect(await saveUserPreferences(DEFAULT_USER_PREFERENCES)).toEqual({
      ok: true,
      message: "미리보기 계정의 설정을 이 브라우저에 저장했습니다.",
      preferences: confirmed,
    });
    expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(user, DEFAULT_USER_PREFERENCES);
  });

  it("reports a database failure without revalidation or exposing internal error details", async () => {
    boundary.persist.mockRejectedValue(new Error("postgres connection password private-value"));
    const result = await saveUserPreferences(DEFAULT_USER_PREFERENCES);
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("preferences");
    expect(result.message).not.toContain("postgres");
    expect(result.message).not.toContain("private-value");
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("verifies the current session again on the next action request", async () => {
    await saveUserPreferences(DEFAULT_USER_PREFERENCES);
    boundary.persist.mockClear();
    boundary.revalidate.mockClear();
    boundary.state = { user: actor, status: "LEFT" };
    expect((await saveUserPreferences(DEFAULT_USER_PREFERENCES)).ok).toBe(false);
    expect(boundary.auth).toHaveBeenCalledTimes(2);
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });
});
