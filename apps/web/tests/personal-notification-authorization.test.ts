import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
import { DEFAULT_USER_PREFERENCES } from "../src/lib/user-preferences";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
  preferences: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/user-preferences", () => ({ getUserPreferences: boundary.preferences }));
vi.mock("@uniz/db", async (original) => ({
  ...(await original<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
import { accounts, users } from "@uniz/db";
import { getPersonalNotifications } from "../src/lib/server/personal-notifications";

const member: CurrentUser = {
  id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
  name: "Member",
  role: "MEMBER",
  isMock: false,
};
function database(fresh: CurrentUser | null = member, connected = true) {
  const tables: unknown[] = [];
  const execute = vi.fn().mockResolvedValue(undefined);
  const transaction = {
    execute,
    select: vi.fn(() => {
      let table: unknown;
      const chain = {
        from(value: unknown) {
          table = value;
          tables.push(value);
          return chain;
        },
        where() {
          return chain;
        },
        for() {
          return chain;
        },
        limit() {
          return chain;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(
            resolve(
              table === users
                ? fresh
                  ? [fresh]
                  : []
                : table === accounts
                  ? connected
                    ? [{ id: "discord-account" }]
                    : []
                  : [],
            ),
          );
        },
      };
      return chain;
    }),
  };
  boundary.database.mockReturnValue({
    transaction: async (work: (value: unknown) => Promise<unknown>) => work(transaction),
  });
  return { tables, transaction };
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.state = { user: null, status: "GUEST" };
  boundary.preferences.mockResolvedValue({
    ...DEFAULT_USER_PREFERENCES,
    notifyAnnouncements: false,
    notifyPartyChanges: false,
    notifyPartyReminders: false,
    notifyVoteDeadlines: false,
    notifyComments: false,
  });
});

describe("personal notification authorization boundary", () => {
  it("applies preview notification settings without reading live content", async () => {
    boundary.state = {
      user: { ...member, id: "demo-member", isMock: true },
      status: "AUTHENTICATED",
    };
    expect(await getPersonalNotifications()).toEqual({ mode: "DEMO", enabledKinds: [] });
    expect(boundary.preferences).toHaveBeenCalledWith(boundary.state.user);
    expect(boundary.database).not.toHaveBeenCalled();
  });
  it.each([
    ["GUEST", "DEMO"],
    ["UNAVAILABLE", "ERROR"],
    ["REAUTH_REQUIRED", "REAUTH"],
    ["LEFT", "LEFT"],
  ] as const)("returns %s without private storage access", async (status, mode) => {
    boundary.state = { user: null, status };
    expect((await getPersonalNotifications()).mode).toBe(mode);
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.preferences).not.toHaveBeenCalled();
  });
  it("never reads live content for a mock or unapproved identity", async () => {
    for (const [actor, mode] of [
      [{ ...member, isMock: true }, "DEMO"],
      [{ ...member, role: "APPLICANT" as const }, "PENDING"],
      [{ ...member, role: "GUEST" as const }, "PENDING"],
    ] as const) {
      boundary.state = { user: actor, status: "AUTHENTICATED" };
      expect((await getPersonalNotifications()).mode).toBe(mode);
    }
    expect(boundary.database).not.toHaveBeenCalled();
  });
  it("rechecks the DB role under the authorization lock before preferences or content", async () => {
    boundary.state = { user: { ...member, role: "ADMIN" }, status: "AUTHENTICATED" };
    const db = database({ ...member, role: "APPLICANT" });
    expect((await getPersonalNotifications()).mode).toBe("PENDING");
    expect(db.transaction.execute).toHaveBeenCalledTimes(1);
    expect(db.tables).toEqual([users]);
    expect(boundary.preferences).not.toHaveBeenCalled();
  });
  it("rejects a removed Discord DB connection before reading settings or notifications", async () => {
    boundary.state = { user: member, status: "AUTHENTICATED" };
    const db = database(member, false);
    expect((await getPersonalNotifications()).mode).toBe("REAUTH");
    expect(db.tables).toEqual([users, accounts]);
    expect(boundary.preferences).not.toHaveBeenCalled();
  });
  it("honors disabling all kinds by skipping every content query and uses the fresh actor", async () => {
    boundary.state = { user: { ...member, role: "ADMIN" }, status: "AUTHENTICATED" };
    const db = database();
    expect(await getPersonalNotifications()).toMatchObject({
      mode: "LIVE",
      data: { items: [], enabledKinds: [] },
    });
    expect(db.tables).toEqual([users, accounts]);
    expect(boundary.preferences).toHaveBeenCalledWith(member);
  });
  it("returns a safe temporary failure without falling back to examples or exposing diagnostics", async () => {
    boundary.state = { user: member, status: "AUTHENTICATED" };
    boundary.database.mockImplementation(() => {
      throw new Error("private token or DB message");
    });
    expect(await getPersonalNotifications()).toEqual({ mode: "ERROR" });
  });
  it("preserves the retry delay of a temporary guild verification failure", async () => {
    boundary.state = { user: null, status: "UNAVAILABLE", retryAfterSeconds: 12 };
    expect(await getPersonalNotifications()).toEqual({ mode: "ERROR", retryAfterSeconds: 12 });
    expect(boundary.database).not.toHaveBeenCalled();
  });
});
