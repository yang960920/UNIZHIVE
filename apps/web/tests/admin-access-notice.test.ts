import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  user: { id: "fixture-officer", name: "검증 운영진", role: "OFFICER", isMock: false },
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => ({ user: fixture.user, status: "AUTHENTICATED" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`Redirect: ${url}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/lib/server/admin", () => import("../src/lib/server/admin"));
vi.mock("@/lib/member-policy", () => import("../src/lib/member-policy"));
vi.mock("@uniz/ui", () => ({
  Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  Card: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  PageHeader: ({
    title,
    description,
    action,
  }: {
    title: string;
    description: string;
    action: ReactNode;
  }) => createElement("header", null, title, description, action),
}));
import AdminPage from "../src/app/admin/page";
beforeEach(() => {
  fixture.user.role = "OFFICER";
});
describe("authenticated admin section denial notice", () => {
  it("shows administrator-only feedback and officer tools without suggesting another login", async () => {
    const html = renderToStaticMarkup(
      await AdminPage({ searchParams: Promise.resolve({ denied: "members" }) }),
    );
    expect(html).toContain("관리자 전용");
    expect(html).toContain("현재 로그인은 유지되고 있습니다");
    expect(html).toContain("검증 운영진");
    expect(html).toContain('href="/admin/seasons"');
    expect(html).not.toContain('href="/admin/members"');
    expect(html).not.toContain('href="/login"');
  });
  it("does not show stale or arbitrary denial text to an authorized administrator", async () => {
    fixture.user.role = "ADMIN";
    const html = renderToStaticMarkup(
      await AdminPage({ searchParams: Promise.resolve({ denied: "members" }) }),
    );
    expect(html).not.toContain("현재 로그인은 유지되고 있습니다");
    expect(html).toContain('href="/admin/members"');
    const unknown = renderToStaticMarkup(
      await AdminPage({ searchParams: Promise.resolve({ denied: "untrusted-denial-text" }) }),
    );
    expect(unknown).not.toContain("untrusted-denial-text");
  });
});
