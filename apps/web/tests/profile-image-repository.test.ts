import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  database: vi.fn(),
  eligibility: vi.fn(),
  rowSets: [] as unknown[][],
  selected: vi.fn(),
  where: vi.fn(),
  values: vi.fn(),
  conflict: vi.fn(),
  returning: vi.fn(),
  deleted: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: boundary.eligibility,
}));
vi.mock("@uniz/db", () => ({
  accounts: { id: "accounts.id", userId: "accounts.userId", provider: "accounts.provider" },
  users: { id: "users.id", name: "users.name", role: "users.role" },
  memberProfileImages: {
    id: "images.id",
    userId: "images.userId",
    revision: "images.revision",
    content: "images.content",
  },
  getDb: boundary.database,
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
}));

import {
  getOwnProfileImage,
  persistProfileImage,
  readProfileImage,
} from "../src/lib/server/profile-images";

const actor: CurrentUser = {
  id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
  name: "프로필 이미지 테스트",
  role: "MEMBER",
  isMock: false,
};
const assetId = "2c1f0c31-5506-472e-bc57-a27955d57be9";
const revision = "a".repeat(64);
const image = { content: Buffer.from("normalized-image"), revision };
function select(fields: unknown) {
  boundary.selected(fields);
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
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
  delete: () => ({ where: boundary.deleted }),
  insert: () => ({
    values: (value: unknown) => {
      boundary.values(value);
      return {
        onConflictDoUpdate: (value: unknown) => {
          boundary.conflict(value);
          return { returning: boundary.returning };
        },
      };
    },
  }),
};
function rowsForRead(
  reader = actor,
  ownerId = actor.id,
  ownerRole: CurrentUser["role"] = "MEMBER",
) {
  boundary.rowSets = [
    [{ id: reader.id, name: reader.name, role: reader.role }],
    [{ id: "discord-account" }],
    [{ userId: ownerId, role: ownerRole, revision }],
    [{ content: image.content }],
  ];
}
beforeEach(() => {
  boundary.database.mockReset().mockReturnValue(database);
  boundary.eligibility.mockReset().mockResolvedValue({ status: "MEMBER" });
  boundary.rowSets = [];
  for (const spy of [
    boundary.selected,
    boundary.where,
    boundary.values,
    boundary.conflict,
    boundary.returning,
    boundary.deleted,
    boundary.lock,
    boundary.transaction,
  ])
    spy.mockReset();
  boundary.returning.mockResolvedValue([{ id: assetId, revision }]);
  boundary.deleted.mockResolvedValue(undefined);
  boundary.lock.mockResolvedValue(undefined);
  boundary.transaction.mockImplementation(async (callback: (tx: typeof database) => unknown) =>
    callback(database),
  );
});

describe("personal image persistence and byte authorization", () => {
  it("keeps development previews outside actual image reads and writes", async () => {
    const preview = { ...actor, id: "demo-member", isMock: true };
    expect(await getOwnProfileImage(preview)).toEqual({ imageUrl: null, hasCustomImage: false });
    expect(await readProfileImage(preview, assetId, revision)).toBeNull();
    await expect(persistProfileImage(preview, image)).rejects.toThrow("실제 계정");
    await expect(persistProfileImage(preview, null)).rejects.toThrow("실제 계정");
    expect(boundary.database).not.toHaveBeenCalled();
    expect(boundary.eligibility).not.toHaveBeenCalled();
  });

  it.each(["LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"])(
    "denies %s before either write",
    async (status) => {
      boundary.eligibility.mockResolvedValue({ status });
      await expect(persistProfileImage(actor, image)).rejects.toThrow("Discord 연결");
      await expect(persistProfileImage(actor, null)).rejects.toThrow("Discord 연결");
      expect(boundary.database).not.toHaveBeenCalled();
    },
  );

  it("upserts only the signed account and returns an opaque local asset URL", async () => {
    boundary.rowSets = [[actor], [{ id: "discord-account" }]];
    expect(await persistProfileImage(actor, image)).toEqual({
      imageUrl: `/api/profile/image/${assetId}?v=${revision}`,
      hasCustomImage: true,
    });
    expect(boundary.eligibility).toHaveBeenCalledExactlyOnceWith(actor.id);
    expect(boundary.lock).toHaveBeenCalledOnce();
    expect(boundary.values).toHaveBeenCalledExactlyOnceWith({ userId: actor.id, ...image });
    expect(boundary.conflict).toHaveBeenCalledExactlyOnceWith({
      target: "images.userId",
      set: { ...image, updatedAt: expect.any(Date) },
    });
    expect(boundary.where.mock.calls).toEqual([
      [{ eq: ["users.id", actor.id] }],
      [{ and: [{ eq: ["accounts.userId", actor.id] }, { eq: ["accounts.provider", "discord"] }] }],
    ]);
  });

  it("deletes only the fresh account's image and returns the default state", async () => {
    boundary.rowSets = [[actor], [{ id: "discord-account" }]];
    expect(await persistProfileImage(actor, null)).toEqual({
      imageUrl: null,
      hasCustomImage: false,
    });
    expect(boundary.deleted).toHaveBeenCalledExactlyOnceWith({ eq: ["images.userId", actor.id] });
    expect(boundary.values).not.toHaveBeenCalled();
  });

  it.each(["missing-user", "missing-account", "rejected-role"])(
    "rejects %s inside the transaction before modifying pixels",
    async (failure) => {
      boundary.rowSets = [
        failure === "missing-user"
          ? []
          : [{ ...actor, role: failure === "rejected-role" ? "GUEST" : actor.role }],
        failure === "missing-account" ? [] : [{ id: "discord-account" }],
      ];
      await expect(persistProfileImage(actor, image)).rejects.toThrow("계정 연결");
      expect(boundary.values).not.toHaveBeenCalled();
      expect(boundary.deleted).not.toHaveBeenCalled();
    },
  );

  it("reads only own reference fields for settings, without reading pixels or private profile data", async () => {
    boundary.rowSets = [[actor], [{ id: "discord-account" }], [{ id: assetId, revision }]];
    expect(await getOwnProfileImage(actor)).toEqual({
      imageUrl: `/api/profile/image/${assetId}?v=${revision}`,
      hasCustomImage: true,
    });
    expect(boundary.selected.mock.calls.at(-1)).toEqual([
      { id: "images.id", revision: "images.revision" },
    ]);
    expect(boundary.where.mock.calls.at(-1)).toEqual([{ eq: ["images.userId", actor.id] }]);
    expect(boundary.selected).not.toHaveBeenCalledWith({ content: "images.content" });
    expect(JSON.stringify(boundary.selected.mock.calls)).not.toMatch(
      /onceHumanUid|access_token|refresh_token/,
    );
  });

  it("returns the default own image when no stored asset exists", async () => {
    boundary.rowSets = [[actor], [{ id: "discord-account" }], []];
    expect(await getOwnProfileImage(actor)).toEqual({ imageUrl: null, hasCustomImage: false });
  });

  it.each([
    ["../untrusted", revision],
    [assetId, "a".repeat(63)],
    [assetId, "A".repeat(64)],
  ])("denies invalid asset or revision %s before touching the database", async (id, version) => {
    expect(await readProfileImage(actor, id, version)).toBeNull();
    expect(boundary.database).not.toHaveBeenCalled();
  });

  it.each(["MEMBER", "OFFICER", "ADMIN"] as const)(
    "allows a fresh approved %s to read an approved member",
    async (role) => {
      const reader = { ...actor, role };
      rowsForRead(reader, "another-account", "MEMBER");
      expect(await readProfileImage(reader, assetId, revision)).toEqual(image.content);
      expect(boundary.selected.mock.calls.at(-1)).toEqual([{ content: "images.content" }]);
      expect(boundary.where.mock.calls.at(-1)).toEqual([
        { and: [{ eq: ["images.id", assetId] }, { eq: ["images.revision", revision] }] },
      ]);
    },
  );

  it("allows an applicant to read their own image, and admin to read a connected applicant", async () => {
    const applicant = { ...actor, role: "APPLICANT" as const };
    rowsForRead(applicant, applicant.id, "APPLICANT");
    expect(await readProfileImage(applicant, assetId, revision)).toEqual(image.content);
    const admin = { ...actor, role: "ADMIN" as const };
    rowsForRead(admin, "applicant-owner", "APPLICANT");
    expect(await readProfileImage(admin, assetId, null)).toEqual(image.content);
  });

  it.each([
    ["APPLICANT", "MEMBER"],
    ["MEMBER", "APPLICANT"],
    ["OFFICER", "APPLICANT"],
    ["MEMBER", "GUEST"],
  ] as const)(
    "denies reader %s to subject %s before selecting image bytes",
    async (readerRole, ownerRole) => {
      const reader = { ...actor, role: readerRole };
      rowsForRead(reader, "another-account", ownerRole);
      expect(await readProfileImage(reader, assetId, revision)).toBeNull();
      expect(boundary.selected).not.toHaveBeenCalledWith({ content: "images.content" });
    },
  );

  it("uses the freshly locked role instead of cached administrator claims", async () => {
    rowsForRead(actor, "another-account", "APPLICANT");
    expect(await readProfileImage({ ...actor, role: "ADMIN" }, assetId, revision)).toBeNull();
    expect(boundary.selected).not.toHaveBeenCalledWith({ content: "images.content" });
  });

  it("does not retrieve bytes for a missing subject or obsolete revision", async () => {
    rowsForRead();
    boundary.rowSets[2] = [];
    expect(await readProfileImage(actor, assetId, revision)).toBeNull();
    rowsForRead();
    expect(await readProfileImage(actor, assetId, "b".repeat(64))).toBeNull();
    expect(boundary.selected).not.toHaveBeenCalledWith({ content: "images.content" });
  });

  it("fails closed when a fresh rejected user attempts to read even their own image", async () => {
    rowsForRead({ ...actor, role: "GUEST" });
    await expect(readProfileImage(actor, assetId, revision)).rejects.toThrow("계정 연결");
    expect(boundary.selected).not.toHaveBeenCalledWith({ content: "images.content" });
  });
});
