import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  database: vi.fn(),
  guild: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: boundary.guild,
}));
vi.mock("@uniz/db", async (original) => ({
  ...(await original<typeof import("@uniz/db")>()),
  getDb: boundary.database,
}));
import { setReaction } from "../src/lib/server/reactions";

const actor = {
  id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
  name: "Reaction Fixture",
  role: "MEMBER" as const,
  isMock: false,
};
const input = {
  kind: "COMMUNITY_POST",
  targetId: "2c1f0c31-5506-472e-bc57-a27955d57be9",
  liked: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.guild.mockResolvedValue({ status: "MEMBER" });
});

describe("reaction authorization before any database access", () => {
  it.each(["GUEST", "LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"] as const)(
    "denies %s for all three reaction kinds",
    async (status) => {
      boundary.state = { user: actor, status };
      for (const kind of ["COMMUNITY_POST", "COMMUNITY_COMMENT", "BUILD"])
        await expect(setReaction({ ...input, kind })).rejects.toThrow();
      expect(boundary.database).not.toHaveBeenCalled();
      expect(boundary.guild).not.toHaveBeenCalled();
    },
  );
  it("denies unapproved, preview and absent identities", async () => {
    for (const user of [
      null,
      { ...actor, role: "APPLICANT" as const },
      { ...actor, role: "GUEST" as const },
      { ...actor, id: "demo-member", isMock: true },
    ]) {
      boundary.state = { user, status: "AUTHENTICATED" };
      await expect(setReaction(input)).rejects.toThrow();
    }
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.guild).not.toHaveBeenCalled();
  });
  it.each(["LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"])(
    "rechecks %s guild eligibility before a write",
    async (status) => {
      boundary.guild.mockResolvedValue({ status });
      await expect(setReaction(input)).rejects.toThrow();
      expect(boundary.guild).toHaveBeenCalledExactlyOnceWith(actor.id);
      expect(boundary.database).not.toHaveBeenCalled();
    },
  );
  it.each(["userId", "actorId", "role", "likeCount"])(
    "rejects a submitted %s rather than trusting the client",
    async (key) => {
      await expect(setReaction({ ...input, [key]: "another-user" })).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(boundary.guild).not.toHaveBeenCalled();
      expect(boundary.database).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...input, liked: "true" },
    { ...input, targetId: "../private" },
    { ...input, kind: "COMMENT_REPLY" },
  ])("rejects malformed reaction data", async (value) => {
    await expect(setReaction(value)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(boundary.database).not.toHaveBeenCalled();
  });
});
