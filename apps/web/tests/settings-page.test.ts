import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  profile: vi.fn(),
  image: vi.fn(),
  preferences: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`Redirect: ${url}`);
  }),
  retry: function AuthRetryNotice() {
    return null;
  },
}));

vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@/lib/member-policy", () => import("../src/lib/member-policy"));
vi.mock("@/lib/server/member-management", () => ({ getEditableMemberProfile: boundary.profile }));
vi.mock("@/lib/server/user-preferences", () => ({ getUserPreferences: boundary.preferences }));
vi.mock("@/lib/server/profile-images", () => ({ getOwnProfileImage: boundary.image }));
vi.mock("@/components/auth-retry-notice", () => ({ AuthRetryNotice: boundary.retry }));
vi.mock("../src/app/settings/preferences-form", () => ({
  PreferencesForm: "PreferencesForm",
  AccountLogout: "AccountLogout",
}));
vi.mock("../src/app/settings/profile-form", () => ({ SettingsProfileForm: "SettingsProfileForm" }));
vi.mock("@uniz/ui", () => ({
  Badge: "Badge",
  Card: "Card",
  EmptyState: "EmptyState",
  PageHeader: "PageHeader",
}));

import SettingsPage from "../src/app/settings/page";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
const actor = {
  id: "7fe923ec-0b11-4bd4-8812-6d3bbd900128",
  name: "설정 멤버",
  role: "MEMBER" as const,
  isMock: false,
};
const profile = {
  targetId: actor.id,
  handle: "settings-user",
  displayName: "설정 멤버",
  nickname: "게임이름",
  uid: "private-uid",
  bio: "소개",
};

beforeEach(() => {
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.profile.mockReset().mockResolvedValue(profile);
  boundary.image.mockReset().mockResolvedValue({ imageUrl: null, hasCustomImage: false });
  boundary.preferences.mockReset().mockResolvedValue({ showGuide: true });
  boundary.redirect.mockClear();
});

describe("account settings page access and loading", () => {
  it.each([
    ["GUEST", "/login?callbackUrl=/settings"],
    ["REAUTH_REQUIRED", "/login?error=AccessDenied&callbackUrl=/settings"],
    ["LEFT", "/login?error=GuildMembership&callbackUrl=/settings"],
  ] as const)("rejects %s before reading personal settings", async (status, url) => {
    boundary.state = { user: actor, status };
    await expect(SettingsPage()).rejects.toThrow(`Redirect: ${url}`);
    expect(boundary.profile).not.toHaveBeenCalled();
    expect(boundary.image).not.toHaveBeenCalled();
    expect(boundary.preferences).not.toHaveBeenCalled();
  });

  it("shows connection recovery without reading private data or redirecting", async () => {
    boundary.state = { user: actor, status: "UNAVAILABLE", retryAfterSeconds: 45 };
    const page = await SettingsPage();
    expect(page.type).toBe(boundary.retry);
    expect(page.props).toEqual({ retryAfterSeconds: 45 });
    expect(boundary.profile).not.toHaveBeenCalled();
    expect(boundary.image).not.toHaveBeenCalled();
    expect(boundary.preferences).not.toHaveBeenCalled();
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it.each(["APPLICANT", "MEMBER", "OFFICER", "ADMIN"] as const)(
    "lets %s edit only their own profile",
    async (role) => {
      boundary.state = { user: { ...actor, role }, status: "AUTHENTICATED" };
      const nodes = elements(await SettingsPage());
      expect(boundary.profile).toHaveBeenCalledExactlyOnceWith();
      expect(nodes.find((node) => node.type === "SettingsProfileForm")?.props).toMatchObject({
        initial: profile,
        name: actor.name,
        image: { imageUrl: null, hasCustomImage: false },
        isMock: false,
      });
      expect(boundary.preferences).toHaveBeenCalledExactlyOnceWith(boundary.state.user);
      expect(boundary.image).toHaveBeenCalledExactlyOnceWith(boundary.state.user);
    },
  );

  it("denies profile editing and private profile reads for a held applicant", async () => {
    boundary.state = { user: { ...actor, role: "GUEST" }, status: "AUTHENTICATED" };
    const nodes = elements(await SettingsPage());
    expect(boundary.profile).not.toHaveBeenCalled();
    expect(boundary.image).not.toHaveBeenCalled();
    expect(nodes.some((node) => node.type === "SettingsProfileForm")).toBe(false);
    expect(nodes.some((node) => node.type === "EmptyState")).toBe(true);
    expect(nodes.some((node) => node.type === "PreferencesForm")).toBe(true);
  });

  it("does not substitute defaults for unavailable saved preferences", async () => {
    boundary.preferences.mockRejectedValue(new Error("DB unavailable"));
    const nodes = elements(await SettingsPage());
    expect(nodes.some((node) => node.type === "PreferencesForm")).toBe(false);
    expect(nodes.some((node) => node.type === "SettingsProfileForm")).toBe(true);
    expect(nodes.some((node) => node.props.role === "alert")).toBe(true);
    expect(nodes.some((node) => node.type === "a" && node.props.href === "/settings")).toBe(true);
  });

  it("does not expose an empty editable form when private profile loading fails", async () => {
    boundary.profile.mockRejectedValue(new Error("Profile unavailable"));
    const nodes = elements(await SettingsPage());
    expect(nodes.some((node) => node.type === "SettingsProfileForm")).toBe(false);
    expect(nodes.some((node) => node.type === "PreferencesForm")).toBe(true);
    expect(nodes.some((node) => node.props.role === "alert")).toBe(true);
  });

  it("keeps profile and preference editing available when only image loading fails", async () => {
    boundary.image.mockRejectedValue(new Error("Image metadata unavailable"));
    const nodes = elements(await SettingsPage());
    expect(nodes.find((node) => node.type === "SettingsProfileForm")?.props).toMatchObject({
      initial: profile,
      image: null,
    });
    expect(nodes.some((node) => node.type === "PreferencesForm")).toBe(true);
  });

  it("keeps mock accounts separate from private database profiles", async () => {
    boundary.state = { user: { ...actor, isMock: true }, status: "AUTHENTICATED" };
    const nodes = elements(await SettingsPage());
    expect(boundary.profile).not.toHaveBeenCalled();
    expect(nodes.find((node) => node.type === "PreferencesForm")?.props.isMock).toBe(true);
    expect(nodes.find((node) => node.type === "SettingsProfileForm")?.props.initial).toBeNull();
    expect(nodes.find((node) => node.type === "SettingsProfileForm")?.props.isMock).toBe(true);
  });
});
