import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { SteamOverviewData } from "../src/lib/data/steam-overview-types";

const boundary = vi.hoisted(() => ({
  auth: vi.fn(),
  operational: vi.fn(),
  steam: vi.fn(),
  LiveDashboard: function LiveDashboard() {},
  Dashboard: function Dashboard() {},
  OperationalAccessNotice: function OperationalAccessNotice() {},
  SteamOverview: function SteamOverview() {},
}));
vi.mock("@/lib/auth", () => ({ getCurrentAuthState: boundary.auth }));
vi.mock("@/lib/server/operational-repository", () => ({
  getOperationalPageData: boundary.operational,
}));
vi.mock("@/lib/server/steam-overview", () => ({ getSteamOverview: boundary.steam }));
vi.mock("@/components/dashboard", () => ({ Dashboard: boundary.Dashboard }));
vi.mock("@/components/live-operations", () => ({
  LiveDashboard: boundary.LiveDashboard,
  OperationalAccessNotice: boundary.OperationalAccessNotice,
}));
vi.mock("@/components/steam-overview", () => ({ SteamOverview: boundary.SteamOverview }));

import HomePage from "../src/app/page";

const steamData: SteamOverviewData = {
  appId: 2139460,
  source: "STEAM",
  news: { status: "UNAVAILABLE", items: [], observedAt: null },
  players: { status: "LIVE", count: 12345, observedAt: "2026-10-08T03:00:00.000Z" },
};
const user = { id: "member-a", name: "Member A", role: "MEMBER", isMock: false };

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.auth.mockResolvedValue({ user, status: "AUTHENTICATED" });
  boundary.steam.mockResolvedValue(steamData);
  boundary.operational.mockResolvedValue({ mode: "LIVE", role: "MEMBER", data: { fixture: true } });
});

describe("home public Steam data boundary", () => {
  it("starts Steam loading independently while membership data is pending and forwards separate props", async () => {
    let resolveOperational!: (value: unknown) => void;
    boundary.operational.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOperational = resolve;
      }),
    );
    const pending = HomePage();
    await Promise.resolve();
    await Promise.resolve();
    expect(boundary.steam).toHaveBeenCalledTimes(1);
    expect(boundary.operational).toHaveBeenCalledWith(user, "AUTHENTICATED", undefined);
    resolveOperational({ mode: "LIVE", role: "MEMBER", data: { fixture: true } });
    const result = (await pending) as ReactElement<Record<string, unknown>>;
    expect(result.type).toBe(boundary.LiveDashboard);
    expect(result.props.steamOverview).toEqual(steamData);
    expect(result.props.data).toEqual({ fixture: true });
    expect(result.props.data).not.toHaveProperty("steamOverview");
  });

  it("provides the same public Steam result to the guest demonstration dashboard", async () => {
    boundary.auth.mockResolvedValue({ user: null, status: "GUEST" });
    boundary.operational.mockResolvedValue({ mode: "DEMO" });
    const result = (await HomePage()) as ReactElement<Record<string, unknown>>;
    expect(result.type).toBe(boundary.Dashboard);
    expect(result.props.steamOverview).toEqual(steamData);
    expect(result.props.userId).toBeUndefined();
  });

  it.each(["ERROR", "PENDING", "REAUTH", "LEFT"])(
    "keeps the %s access notice and public Steam card while withholding both dashboards",
    async (mode) => {
      boundary.operational.mockResolvedValue({ mode, retryAfterSeconds: 12 });
      const nodes = elements(await HomePage());
      const notice = nodes.find((node) => node.type === boundary.OperationalAccessNotice);
      const steam = nodes.find((node) => node.type === boundary.SteamOverview);
      expect(notice?.props.mode).toBe(mode);
      expect(notice?.props.retryAfterSeconds).toBe(mode === "ERROR" ? 12 : undefined);
      expect(notice?.props).not.toHaveProperty("steamOverview");
      expect(notice?.props).not.toHaveProperty("data");
      expect(steam?.props).toEqual({ data: steamData });
      expect(nodes.some((node) => node.type === boundary.LiveDashboard)).toBe(false);
      expect(nodes.some((node) => node.type === boundary.Dashboard)).toBe(false);
      expect(boundary.steam).toHaveBeenCalledTimes(1);
    },
  );
});
