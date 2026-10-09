import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  select: vi.fn(),
  join: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@uniz/db", async (original) => ({
  ...(await original<typeof import("@uniz/db")>()),
  getDb: () => ({
    select: (fields: Record<string, unknown>) => {
      boundary.select(fields);
      const chain = {
        from: () => chain,
        leftJoin: (...args: unknown[]) => {
          boundary.join(...args);
          return chain;
        },
        where: () => chain,
        limit: async () => boundary.rows,
      };
      return chain;
    },
  }),
}));
import { findAuthUser } from "../src/lib/server/auth-repository";
const assetId = "cc14c3fc-9209-4b93-a9d5-44ce4bf77574";
const savedDatabaseUrl = process.env.DATABASE_URL;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://localhost/metadata-test";
  boundary.rows = [];
});
afterEach(() => {
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
});
describe("fresh avatar metadata in the safe signed identity", () => {
  it("selects only avatar ID/revision and returns neither binary content nor Discord image/token/UID", async () => {
    boundary.rows = [
      {
        id: "member-one",
        name: "Member",
        role: "MEMBER",
        avatarId: assetId,
        avatarRevision: "a".repeat(64),
        content: Buffer.from("PRIVATE_IMAGE_CANARY"),
        image: "https://cdn.discordapp.com/private-image",
        access_token: "TOKEN_CANARY",
        onceHumanUid: "UID_CANARY",
      },
    ];
    expect(await findAuthUser("member-one")).toEqual({
      id: "member-one",
      name: "Member",
      role: "MEMBER",
      isMock: false,
      imageUrl: `/api/profile/image/${assetId}?v=${"a".repeat(64)}`,
    });
    expect(Object.keys(boundary.select.mock.calls[0][0])).toEqual([
      "id",
      "name",
      "role",
      "avatarId",
      "avatarRevision",
    ]);
    expect(boundary.join).toHaveBeenCalledTimes(1);
  });
  it("reflects replacement metadata on a fresh read and falls back after deletion without JWT picture", async () => {
    const row = {
      id: "member-one",
      name: "Member",
      role: "MEMBER",
      avatarId: assetId,
      avatarRevision: "a".repeat(64),
    };
    boundary.rows = [row];
    const first = await findAuthUser("member-one");
    boundary.rows = [{ ...row, avatarRevision: "b".repeat(64) }];
    expect((await findAuthUser("member-one"))?.imageUrl).not.toBe(first?.imageUrl);
    boundary.rows = [{ ...row, avatarId: null, avatarRevision: null }];
    expect((await findAuthUser("member-one"))?.imageUrl).toBeNull();
  });
  it("does not forward malformed persisted IDs or revisions as image sources", async () => {
    boundary.rows = [
      {
        id: "member-one",
        name: "Member",
        role: "MEMBER",
        avatarId: "../secret",
        avatarRevision: "a".repeat(64),
      },
    ];
    expect((await findAuthUser("member-one"))?.imageUrl).toBeNull();
    boundary.rows = [];
    expect(await findAuthUser("missing")).toBeNull();
  });
});
