import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  database: vi.fn(),
  eligibility: vi.fn(),
  rowSets: [] as unknown[][],
  selected: vi.fn(),
  where: vi.fn(),
  values: vi.fn(),
  conflict: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: boundary.cookieGet, set: boundary.cookieSet }),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: boundary.eligibility,
}));
vi.mock("@uniz/db", () => ({
  accounts: { id: "accounts.id", userId: "accounts.userId", provider: "accounts.provider" },
  users: { id: "users.id" },
  userPreferences: { userId: "preferences.userId", preferences: "preferences.json" },
  getDb: boundary.database,
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
}));

import { getUserPreferences, persistUserPreferences } from "../src/lib/server/user-preferences";
import { DEFAULT_USER_PREFERENCES, demoPreferencesCookieName } from "../src/lib/user-preferences";

const actor: CurrentUser = {
  id: "56d5078e-8b21-42ef-865e-93c9ef85fe41",
  name: "설정 테스트",
  role: "MEMBER",
  isMock: false,
};
function select(fields: unknown) {
  boundary.selected(fields);
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: (condition: unknown) => {
      boundary.where(condition);
      return builder;
    },
    for: () => builder,
    limit: async () => boundary.rowSets.shift() ?? [],
  };
  return builder;
}
const database = {
  select,
  execute: boundary.lock,
  transaction: boundary.transaction,
  insert: () => ({
    values: (value: unknown) => {
      boundary.values(value);
      return { onConflictDoUpdate: boundary.conflict };
    },
  }),
};

beforeEach(() => {
  boundary.cookies.clear();
  boundary.cookieGet
    .mockReset()
    .mockImplementation((name: string) =>
      boundary.cookies.has(name) ? { value: boundary.cookies.get(name) } : undefined,
    );
  boundary.cookieSet
    .mockReset()
    .mockImplementation((name: string, value: string) => boundary.cookies.set(name, value));
  boundary.database.mockReset().mockReturnValue(database);
  boundary.eligibility.mockReset().mockResolvedValue({ status: "MEMBER" });
  boundary.rowSets = [];
  boundary.selected.mockClear();
  boundary.where.mockClear();
  boundary.values.mockClear();
  boundary.conflict.mockReset().mockResolvedValue(undefined);
  boundary.lock.mockReset().mockResolvedValue(undefined);
  boundary.transaction
    .mockReset()
    .mockImplementation(async (callback: (transaction: typeof database) => Promise<void>) =>
      callback(database),
    );
});
afterEach(() => vi.unstubAllEnvs());

describe("personal preference persistence", () => {
  it("gives guests defaults without reading cookies or the database", async () => {
    expect(await getUserPreferences(null)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(boundary.cookieGet).not.toHaveBeenCalled();
    expect(boundary.database).not.toHaveBeenCalled();
  });

  it("reads only the signed real user's settings and no tokens or private profile data", async () => {
    boundary.rowSets = [[{ preferences: { showGuide: false } }]];
    expect(await getUserPreferences(actor)).toEqual({
      ...DEFAULT_USER_PREFERENCES,
      showGuide: false,
    });
    expect(boundary.selected).toHaveBeenCalledExactlyOnceWith({ preferences: "preferences.json" });
    expect(boundary.where).toHaveBeenCalledExactlyOnceWith({ eq: ["users.id", actor.id] });
    expect(boundary.cookieGet).not.toHaveBeenCalled();
  });

  it("distinguishes a missing connected account from valid unset preferences", async () => {
    await expect(getUserPreferences(actor)).rejects.toThrow("계정 연결");
    boundary.rowSets = [[{ preferences: null }]];
    expect(await getUserPreferences(actor)).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("propagates real read failures instead of returning defaults that can overwrite settings", async () => {
    boundary.database.mockImplementation(() => {
      throw new Error("DB unavailable");
    });
    await expect(getUserPreferences(actor)).rejects.toThrow("DB unavailable");
  });

  it("isolates preview preferences by account and never writes a real database", async () => {
    const member = { ...actor, id: "demo-member", isMock: true };
    const admin = { ...actor, id: "demo-admin", role: "ADMIN" as const, isMock: true };
    const input = { ...DEFAULT_USER_PREFERENCES, showGuide: false };
    await persistUserPreferences(member, input);
    expect(await getUserPreferences(member)).toEqual(input);
    expect(await getUserPreferences(admin)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(boundary.cookieSet).toHaveBeenCalledWith(
      demoPreferencesCookieName(member.id),
      JSON.stringify(input),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.eligibility).not.toHaveBeenCalled();
  });

  it.each(["{broken", JSON.stringify({ textSize: "HUGE" })])(
    "recovers malformed preview preferences: %s",
    async (value) => {
      const member = { ...actor, id: "demo-member", isMock: true };
      boundary.cookies.set(demoPreferencesCookieName(member.id), value);
      expect(await getUserPreferences(member)).toEqual(DEFAULT_USER_PREFERENCES);
      expect(boundary.database).not.toHaveBeenCalled();
    },
  );

  it("rejects arbitrary preview identity names without cookie writes", async () => {
    const untrusted = { ...actor, id: "real-user", isMock: true };
    await expect(persistUserPreferences(untrusted, DEFAULT_USER_PREFERENCES)).rejects.toThrow(
      "Invalid preview identity",
    );
    expect(boundary.cookieSet).not.toHaveBeenCalled();
    expect(boundary.database).not.toHaveBeenCalled();
  });

  it.each(["userId", "targetId", "role"])(
    "rejects a submitted %s before any real or preview write",
    async (key) => {
      const input = { ...DEFAULT_USER_PREFERENCES, [key]: "someone-else" };
      for (const user of [actor, { ...actor, id: "demo-member", isMock: true }]) {
        await expect(persistUserPreferences(user, input)).rejects.toThrow();
      }
      expect(boundary.database).not.toHaveBeenCalled();
      expect(boundary.cookieSet).not.toHaveBeenCalled();
      expect(boundary.eligibility).not.toHaveBeenCalled();
    },
  );

  it.each(["LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"])(
    "denies disconnected Discord eligibility: %s",
    async (status) => {
      boundary.eligibility.mockResolvedValue({ status });
      await expect(persistUserPreferences(actor, DEFAULT_USER_PREFERENCES)).rejects.toThrow(
        "Discord 연결",
      );
      expect(boundary.eligibility).toHaveBeenCalledExactlyOnceWith(actor.id);
      expect(boundary.database).not.toHaveBeenCalled();
    },
  );

  it("locks and upserts only the fresh server account's settings", async () => {
    boundary.rowSets = [[{ id: actor.id }], [{ id: "discord-account" }]];
    const input = { ...DEFAULT_USER_PREFERENCES, textSize: "LARGE" as const };
    expect(await persistUserPreferences(actor, input)).toEqual(input);
    expect(boundary.transaction).toHaveBeenCalledOnce();
    expect(boundary.lock).toHaveBeenCalledOnce();
    expect(boundary.where.mock.calls).toEqual([
      [{ eq: ["users.id", actor.id] }],
      [{ and: [{ eq: ["accounts.userId", actor.id] }, { eq: ["accounts.provider", "discord"] }] }],
    ]);
    expect(boundary.values).toHaveBeenCalledExactlyOnceWith({
      userId: actor.id,
      preferences: input,
    });
    expect(boundary.conflict).toHaveBeenCalledWith({
      target: "preferences.userId",
      set: { preferences: input, updatedAt: expect.any(Date) },
    });
  });

  it.each(["user", "account"])(
    "does not insert when the connected %s disappears during save",
    async (missing) => {
      boundary.rowSets = [
        missing === "user" ? [] : [{ id: actor.id }],
        missing === "account" ? [] : [{ id: "discord-account" }],
      ];
      await expect(persistUserPreferences(actor, DEFAULT_USER_PREFERENCES)).rejects.toThrow(
        "계정 연결",
      );
      expect(boundary.values).not.toHaveBeenCalled();
      expect(boundary.conflict).not.toHaveBeenCalled();
    },
  );

  it("propagates upsert failures without claiming a saved preference result", async () => {
    boundary.rowSets = [[{ id: actor.id }], [{ id: "discord-account" }]];
    boundary.conflict.mockRejectedValue(new Error("DB write failed"));
    await expect(persistUserPreferences(actor, DEFAULT_USER_PREFERENCES)).rejects.toThrow(
      "DB write failed",
    );
  });
});
