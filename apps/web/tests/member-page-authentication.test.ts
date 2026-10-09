import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  redirect: vi.fn((url: string): never => {
    throw new Error(`Redirect: ${url}`);
  }),
  directory: vi.fn(),
  publicProfile: vi.fn(),
  editableProfile: vi.fn(),
  saveProfile: vi.fn(),
  revalidate: vi.fn(),
  retryNotice: function AuthRetryNotice() {
    return null;
  },
  accessRequired: function MemberAccessRequired() {
    return null;
  },
}));

vi.mock("next/navigation", () => ({
  redirect: boundary.redirect,
  notFound: () => {
    throw new Error("Not found");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));
vi.mock("next/link", () => ({
  default: function Link() {
    return null;
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@/lib/server/member-management", () => ({
  getMemberDirectory: boundary.directory,
  getMemberPublicProfile: boundary.publicProfile,
  getEditableMemberProfile: boundary.editableProfile,
  saveMemberProfile: boundary.saveProfile,
}));
vi.mock("@/components/auth-retry-notice", () => ({ AuthRetryNotice: boundary.retryNotice }));
vi.mock("@/components/feature-page", () => ({ MemberAccessRequired: boundary.accessRequired }));
vi.mock("../src/app/members/member-admin-access-required", () => ({
  MemberAdminAccessRequired: boundary.accessRequired,
}));
vi.mock("@/lib/member-policy", () => import("../src/lib/member-policy"));
vi.mock("@/lib/login-flow", () => import("../src/lib/login-flow"));
vi.mock("../src/app/onboarding/profile-form", () => ({
  ProfileForm: function ProfileForm() {
    return null;
  },
}));
vi.mock("@uniz/ui", () => ({
  Avatar: function Avatar() {
    return null;
  },
  Badge: function Badge() {
    return null;
  },
  Card: function Card() {
    return null;
  },
  EmptyState: function EmptyState() {
    return null;
  },
  PageHeader: function PageHeader() {
    return null;
  },
}));

import OnboardingPage from "../src/app/onboarding/page";
import MembersPage from "../src/app/members/page";
import MemberPage from "../src/app/members/[handle]/page";
import { saveOnboarding } from "../src/app/onboarding/actions";

const actor = {
  id: "7fe923ec-0b11-4bd4-8812-6d3bbd900128",
  name: "Page test member",
  role: "MEMBER" as const,
  isMock: false,
};

beforeEach(() => {
  boundary.state = { user: null, status: "GUEST" };
  boundary.redirect.mockClear();
  boundary.directory.mockReset().mockResolvedValue({ mode: "LIVE", members: [] });
  boundary.publicProfile.mockReset().mockResolvedValue({
    userId: actor.id,
    handle: "fixture-member",
    displayName: "Page test member",
    nickname: "Fixture nickname",
    joinedAt: "2026-10-06T00:00:00Z",
    role: "MEMBER",
  });
  boundary.editableProfile.mockReset().mockResolvedValue(null);
  boundary.saveProfile.mockReset().mockResolvedValue(undefined);
  boundary.revalidate.mockReset();
});

describe("member page connection recovery", () => {
  it.each([
    ["onboarding", () => OnboardingPage()],
    ["directory", () => MembersPage()],
    ["public profile", () => MemberPage({ params: Promise.resolve({ handle: "fixture-member" }) })],
  ] as const)(
    "shows retry feedback on %s without reading profiles or suggesting login",
    async (_name, page) => {
      boundary.state = {
        user: { ...actor, role: "ADMIN" },
        status: "UNAVAILABLE",
        retryAfterSeconds: 65,
      };
      const result = await page();
      expect(result.type).toBe(boundary.retryNotice);
      expect(result.props).toEqual({ retryAfterSeconds: 65 });
      expect(boundary.redirect).not.toHaveBeenCalled();
      expect(boundary.directory).not.toHaveBeenCalled();
      expect(boundary.publicProfile).not.toHaveBeenCalled();
      expect(boundary.editableProfile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GUEST", "/login"],
    ["REAUTH_REQUIRED", "/login?error=AccessDenied&callbackUrl=/onboarding"],
    ["LEFT", "/login?error=GuildMembership&callbackUrl=/onboarding"],
  ] as const)("preserves the distinct onboarding redirect for %s", async (status, url) => {
    boundary.state = { user: actor, status };
    await expect(OnboardingPage()).rejects.toThrow(`Redirect: ${url}`);
    expect(boundary.editableProfile).not.toHaveBeenCalled();
  });

  it("keeps self editing separate from administrator member directory reads", async () => {
    boundary.state = { user: { ...actor, role: "GUEST" }, status: "AUTHENTICATED" };
    await OnboardingPage();
    expect(boundary.editableProfile).not.toHaveBeenCalled();
    boundary.state = { user: { ...actor, role: "APPLICANT" }, status: "AUTHENTICATED" };
    expect((await MembersPage()).type).toBe(boundary.accessRequired);
    expect((await MemberPage({ params: Promise.resolve({ handle: "fixture-member" }) })).type).toBe(
      boundary.accessRequired,
    );
    expect(boundary.directory).not.toHaveBeenCalled();
    expect(boundary.publicProfile).not.toHaveBeenCalled();
    boundary.state = { user: actor, status: "AUTHENTICATED" };
    await OnboardingPage({ searchParams: Promise.resolve({ edit: "1" }) });
    expect((await MembersPage()).type).toBe(boundary.accessRequired);
    expect((await MemberPage({ params: Promise.resolve({ handle: "fixture-member" }) })).type).toBe(
      boundary.accessRequired,
    );
    boundary.state = { user: { ...actor, role: "ADMIN" }, status: "AUTHENTICATED" };
    await MembersPage();
    await MemberPage({ params: Promise.resolve({ handle: "fixture-member" }) });
    expect(boundary.editableProfile).toHaveBeenCalledTimes(1);
    expect(boundary.directory).toHaveBeenCalledTimes(1);
    expect(boundary.publicProfile).toHaveBeenCalledExactlyOnceWith("fixture-member");
  });

  it.each(["GUEST", "APPLICANT", "MEMBER", "OFFICER"] as const)(
    "denies direct directory/profile routes to %s without invoking member reads",
    async (role) => {
      boundary.state = { user: { ...actor, role }, status: "AUTHENTICATED" };
      expect((await MembersPage()).type).toBe(boundary.accessRequired);
      expect(
        (await MemberPage({ params: Promise.resolve({ handle: "fixture-member" }) })).type,
      ).toBe(boundary.accessRequired);
      expect(boundary.directory).not.toHaveBeenCalled();
      expect(boundary.publicProfile).not.toHaveBeenCalled();
    },
  );

  it.each(["MEMBER", "OFFICER", "ADMIN"] as const)(
    "skips first-time onboarding for an approved %s while preserving explicit profile editing",
    async (role) => {
      boundary.state = { user: { ...actor, role }, status: "AUTHENTICATED" };
      await expect(OnboardingPage()).rejects.toThrow("Redirect: /");
      expect(boundary.editableProfile).not.toHaveBeenCalled();
      await OnboardingPage({ searchParams: Promise.resolve({ edit: "1" }) });
      expect(boundary.editableProfile).toHaveBeenCalledTimes(1);
    },
  );
});

describe("onboarding save connection recovery", () => {
  it("preserves login feedback and never writes when verification is unavailable", async () => {
    boundary.state = { user: { ...actor, role: "ADMIN" }, status: "UNAVAILABLE" };
    const result = await saveOnboarding({ ok: false, message: "" }, new FormData());
    expect(result).toEqual({
      ok: false,
      message: "로그인은 유지되고 있습니다. 연결 확인 후 다시 저장해 주세요.",
    });
    expect(boundary.saveProfile).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("still rejects guests and blocked sessions even if an identity is attached", async () => {
    for (const status of ["GUEST", "LEFT", "REAUTH_REQUIRED"] as const) {
      boundary.state = { user: actor, status };
      expect(await saveOnboarding({ ok: false, message: "" }, new FormData())).toMatchObject({
        ok: false,
      });
    }
    expect(boundary.saveProfile).not.toHaveBeenCalled();
  });
});
