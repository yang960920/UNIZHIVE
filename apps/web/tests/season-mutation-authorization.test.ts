import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  getCurrentAuthState: async () => boundary.state,
  getCurrentUser: async () => boundary.state.user,
}));
vi.mock("@uniz/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
import { mutateSeasonAdministration } from "../src/lib/server/season-administration";

const input = {
  action: "CREATE_SEASON_SETUP",
  scenarioKey: "DEVIATION",
  serverNumber: "0070",
  region: "한국",
  name: "시즌 하이브",
  startsAt: "2026-10-08T00:00:00.000Z",
  settlementAt: null,
};
beforeEach(() => {
  boundary.database.mockClear();
  boundary.state = { user: null, status: "GUEST" };
});
describe("season mutation authentication failures", () => {
  it.each(["NEXT", "PREVIOUS"] as const)(
    "rejects %s phase mutation before database access when Discord verification is unavailable",
    async (direction) => {
      boundary.state = {
        user: {
          id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
          name: "Cached identity",
          role: "ADMIN",
          isMock: false,
        },
        status: "UNAVAILABLE",
      };
      await expect(
        mutateSeasonAdministration({
          action: "CHANGE_SEASON_PHASE",
          seasonId: "a23040b5-ed76-48c2-a8a6-2c05d6e9eb6a",
          expectedUpdatedAt: "2026-10-06T00:00:00.000Z",
          direction,
        }),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(boundary.database).not.toHaveBeenCalled();
    },
  );
  it("reports temporary Discord unavailability without suggesting re-login or writing data", async () => {
    boundary.state = { user: null, status: "UNAVAILABLE" };
    await expect(mutateSeasonAdministration(input)).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: expect.stringContaining("잠시 후 다시 시도"),
    });
    expect(boundary.database).not.toHaveBeenCalled();
  });
  it("keeps guests and expired authentication separate from temporary connectivity", async () => {
    for (const status of ["GUEST", "REAUTH_REQUIRED", "LEFT"] as const) {
      boundary.state = { user: null, status };
      await expect(mutateSeasonAdministration(input)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
    expect(boundary.database).not.toHaveBeenCalled();
  });
  it("does not trust an attached identity when authentication status is unavailable", async () => {
    boundary.state = {
      user: {
        id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
        name: "Cached identity",
        role: "ADMIN",
        isMock: false,
      },
      status: "UNAVAILABLE",
    };
    await expect(mutateSeasonAdministration(input)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(boundary.database).not.toHaveBeenCalled();
  });
});
