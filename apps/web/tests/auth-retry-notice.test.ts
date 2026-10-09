import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const fixture = vi.hoisted(() => ({
  state: { user: null, status: "UNAVAILABLE", retryAfterSeconds: 12.5 } as CurrentAuthState,
  requireAdmin: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: fixture.refresh }) }));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: async () => fixture.state }));
vi.mock("@/lib/member-policy", () => import("../src/lib/member-policy"));
vi.mock("@/lib/server/admin", () => ({
  requireAdmin: fixture.requireAdmin,
  getAdminNavigation: () => [],
}));
vi.mock("@/components/sidebar", () => ({
  Sidebar: () => React.createElement("aside", null, "Administration navigation"),
}));
vi.mock(
  "@/components/auth-retry-notice",
  async () => import("../src/components/auth-retry-notice"),
);
vi.mock("@uniz/ui", () => ({
  Card: ({ children }: { children: ReactNode }) => React.createElement("section", null, children),
  PageHeader: ({ title, description }: { title: string; description: string }) =>
    React.createElement(
      "header",
      null,
      React.createElement("h1", null, title),
      React.createElement("p", null, description),
    ),
}));

import { AuthRetryNotice } from "../src/components/auth-retry-notice";
import AdminLayout from "../src/app/admin/layout";

beforeEach(() => {
  // The test renderer executes JSX directly rather than through Next's automatic JSX compiler.
  vi.stubGlobal("React", React);
  fixture.state = { user: null, status: "UNAVAILABLE", retryAfterSeconds: 12.5 };
  fixture.requireAdmin
    .mockReset()
    .mockResolvedValue({ id: "admin", name: "Admin", role: "ADMIN", isMock: false });
  fixture.refresh.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("temporary authorization retry UI", () => {
  it("honors the server delay, withholds the retry action and does not request another login", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthRetryNotice, { retryAfterSeconds: 12.5 }),
    );
    expect(html).toContain("13초 후 다시 확인");
    expect(html).toContain("disabled");
    expect(html).not.toContain("/login");
    expect(fixture.refresh).not.toHaveBeenCalled();
  });

  it("uses a brief pause when a transient database/network error has no rate-limit delay", () => {
    const html = renderToStaticMarkup(React.createElement(AuthRetryNotice));
    expect(html).toContain("5초 후 다시 확인");
    expect(html).not.toContain("/login");
  });

  it("does not render privileged children or administration navigation while authorization is unavailable", async () => {
    const protectedChild = vi.fn(() =>
      React.createElement("div", null, "Private operating records"),
    );
    const layout = await AdminLayout({ children: React.createElement(protectedChild) });
    const html = renderToStaticMarkup(layout);
    expect(html).toContain("13초 후 다시 확인");
    expect(html).not.toContain("Private operating records");
    expect(html).not.toContain("Administration navigation");
    expect(protectedChild).not.toHaveBeenCalled();
    expect(fixture.requireAdmin).not.toHaveBeenCalled();
  });

  it("retains the administrator verification when rendering protected children", async () => {
    fixture.state = {
      user: { id: "admin", name: "Admin", role: "ADMIN", isMock: false },
      status: "AUTHENTICATED",
    };
    const layout = await AdminLayout({
      children: React.createElement("div", null, "Private operating records"),
    });
    const html = renderToStaticMarkup(layout);
    expect(fixture.requireAdmin).toHaveBeenCalledTimes(1);
    expect(html).toContain("Private operating records");
    expect(html).toContain("Administration navigation");
    expect(html).toContain("하이브 운영 공간 · 관리자");
  });
});
