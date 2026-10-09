import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
import type { MemberProfileInput } from "../src/lib/member-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  eligibility: "MEMBER",
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getLiveGuildEligibility: async () => boundary.eligibility,
  getSessionGuildEligibilityState: async () => ({ status: boundary.eligibility }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});

import {
  accounts,
  auditLogs,
  eq,
  getDb,
  memberProfileImages,
  memberProfiles,
  users,
} from "@uniz/db";
import { findAuthUser } from "../src/lib/server/auth-repository";
import { saveOwnProfileSettings } from "../src/lib/server/member-management";
import { normalizeProfileImage } from "../src/lib/server/profile-image-processing";
import {
  getOwnProfileImage,
  persistProfileImage,
  readProfileImage,
} from "../src/lib/server/profile-images";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Atomic profile settings verification requires the local uniz_hive database.");

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Fixture = {
  owner: CurrentUser;
  other: CurrentUser;
  admin: CurrentUser;
  applicant: CurrentUser;
  rejected: CurrentUser;
  profiles: Record<string, MemberProfileInput>;
};
class FixtureRollback extends Error {}

async function withFixture(check: (transaction: Transaction, fixture: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const principals = Object.fromEntries(
    [
      ["owner", "MEMBER"],
      ["other", "MEMBER"],
      ["admin", "ADMIN"],
      ["applicant", "APPLICANT"],
      ["rejected", "GUEST"],
    ].map(([name, role]) => [
      name,
      { id: randomUUID(), name: `Profile Settings Fixture ${name}`, role, isMock: false },
    ]),
  ) as Omit<Fixture, "profiles">;
  const profiles: Record<string, MemberProfileInput> = {};
  boundary.eligibility = "MEMBER";
  try {
    await actual.getDb().transaction(async (transaction) => {
      boundary.transaction = transaction;
      for (const actor of Object.values(principals)) {
        await transaction
          .insert(users)
          .values({ id: actor.id, name: actor.name, role: actor.role });
        await transaction
          .insert(accounts)
          .values({
            userId: actor.id,
            provider: "discord",
            providerAccountId: `profile-settings-${actor.id}`,
            access_token: "private-profile-settings-fixture-token",
          });
        const input = {
          targetId: actor.id,
          handle: `ps_${actor.id.replaceAll("-", "").slice(0, 16)}`,
          displayName: "초기 표시 이름",
          nickname: "초기 캐릭터",
          uid: "private-settings-fixture-uid",
          bio: "초기 소개",
        };
        profiles[actor.id] = input;
        await transaction
          .insert(memberProfiles)
          .values({
            userId: actor.id,
            handle: input.handle,
            displayName: input.displayName,
            onceHumanNickname: input.nickname,
            onceHumanUid: input.uid,
            bio: input.bio,
          });
      }
      boundary.state = { user: principals.owner, status: "AUTHENTICATED" };
      await check(transaction, { ...principals, profiles });
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
    boundary.eligibility = "MEMBER";
  }
  for (const actor of Object.values(principals)) {
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: memberProfiles.id })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: memberProfileImages.id })
        .from(memberProfileImages)
        .where(eq(memberProfileImages.userId, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, actor.id)),
    ).toHaveLength(0);
  }
}

async function image(color: string) {
  const source = await sharp({ create: { width: 32, height: 24, channels: 3, background: color } })
    .png()
    .toBuffer();
  return normalizeProfileImage(
    new File([new Uint8Array(source)], "avatar.png", { type: "image/png" }),
  );
}
function reference(state: { imageUrl: string | null } | null) {
  expect(state?.imageUrl).not.toBeNull();
  const url = new URL(state!.imageUrl!, "http://localhost:3000");
  return { assetId: url.pathname.split("/").at(-1)!, revision: url.searchParams.get("v")! };
}
function edited(input: MemberProfileInput, displayName = "변경된 표시 이름") {
  return { ...input, displayName, nickname: "변경된 캐릭터", bio: "변경된 소개" };
}
async function profile(transaction: Transaction, userId: string) {
  const [row] = await transaction
    .select({
      handle: memberProfiles.handle,
      displayName: memberProfiles.displayName,
      nickname: memberProfiles.onceHumanNickname,
      uid: memberProfiles.onceHumanUid,
      bio: memberProfiles.bio,
    })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId));
  return row;
}

describe("atomic own profile and avatar settings against PostgreSQL with full rollback", () => {
  it("saves text and an uploaded avatar together and exposes only its safe reference in the auth DTO", async () => {
    await withFixture(async (tx, fixture) => {
      const input = edited(fixture.profiles[fixture.owner.id]);
      const normalized = await image("red");
      const saved = await saveOwnProfileSettings(input, normalized);
      const ref = reference(saved);
      const expected = Object.fromEntries(
        Object.entries(input).filter(([key]) => key !== "targetId"),
      );
      expect(await profile(tx, fixture.owner.id)).toEqual(expected);
      expect(await readProfileImage(fixture.owner, ref.assetId, ref.revision)).toEqual(
        normalized.content,
      );
      expect(await readProfileImage(fixture.other, ref.assetId, ref.revision)).toEqual(
        normalized.content,
      );
      const authUser = await findAuthUser(fixture.owner.id);
      expect(authUser?.imageUrl).toBe(saved?.imageUrl);
      expect(Object.keys(authUser!).sort()).toEqual(["id", "imageUrl", "isMock", "name", "role"]);
      expect(JSON.stringify(authUser)).not.toMatch(
        /private-settings-fixture-uid|private-profile-settings-fixture-token/,
      );
      const audit = await tx
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.actorId, fixture.owner.id));
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit)).not.toMatch(
        /private-settings-fixture-uid|private-profile-settings-fixture-token/,
      );
      expect(await profile(tx, fixture.other.id)).toMatchObject({ displayName: "초기 표시 이름" });
    });
  });

  it("replaces an avatar and text together, preserves it during KEEP, then removes it with another text edit", async () => {
    await withFixture(async (tx, fixture) => {
      const original = await image("red");
      const replacement = await image("blue");
      const first = reference(
        await saveOwnProfileSettings(
          edited(fixture.profiles[fixture.owner.id], "첫 표시 이름"),
          original,
        ),
      );
      const second = reference(
        await saveOwnProfileSettings(
          edited(fixture.profiles[fixture.owner.id], "둘째 표시 이름"),
          replacement,
        ),
      );
      expect(second.assetId).toBe(first.assetId);
      expect(second.revision).not.toBe(first.revision);
      expect(await readProfileImage(fixture.owner, first.assetId, first.revision)).toBeNull();
      expect(await readProfileImage(fixture.owner, second.assetId, second.revision)).toEqual(
        replacement.content,
      );
      expect(
        await saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id], "유지 후 이름")),
      ).toBeNull();
      expect(await profile(tx, fixture.owner.id)).toMatchObject({ displayName: "유지 후 이름" });
      expect(await readProfileImage(fixture.owner, second.assetId, second.revision)).toEqual(
        replacement.content,
      );
      expect(
        await saveOwnProfileSettings(
          edited(fixture.profiles[fixture.owner.id], "삭제 후 이름"),
          null,
        ),
      ).toEqual({ imageUrl: null, hasCustomImage: false });
      expect(await profile(tx, fixture.owner.id)).toMatchObject({ displayName: "삭제 후 이름" });
      expect(await getOwnProfileImage(fixture.owner)).toEqual({
        imageUrl: null,
        hasCustomImage: false,
      });
      expect((await findAuthUser(fixture.owner.id))?.imageUrl).toBeNull();
      expect(await readProfileImage(fixture.owner, second.assetId, second.revision)).toBeNull();
    });
  });

  it("rolls back all fields and retains the existing avatar when a duplicate handle blocks upload or removal", async () => {
    await withFixture(async (tx, fixture) => {
      const original = await image("red");
      const replacement = await image("blue");
      const stored = reference(
        await saveOwnProfileSettings(
          edited(fixture.profiles[fixture.owner.id], "저장된 표시 이름"),
          original,
        ),
      );
      const before = await profile(tx, fixture.owner.id);
      const duplicate = {
        ...edited(fixture.profiles[fixture.owner.id], "저장되면 안 되는 이름"),
        handle: fixture.profiles[fixture.other.id].handle.toUpperCase(),
      };
      for (const imageChange of [replacement, null, undefined]) {
        await expect(saveOwnProfileSettings(duplicate, imageChange)).rejects.toThrow();
        expect(await profile(tx, fixture.owner.id)).toEqual(before);
        expect(await readProfileImage(fixture.owner, stored.assetId, stored.revision)).toEqual(
          original.content,
        );
      }
      expect(
        await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.actorId, fixture.owner.id)),
      ).toHaveLength(1);
    });
  });

  it("rolls back the preceding text edit when the image storage write fails", async () => {
    await withFixture(async (tx, fixture) => {
      const original = await image("red");
      const stored = reference(
        await saveOwnProfileSettings(
          edited(fixture.profiles[fixture.owner.id], "이전 표시 이름"),
          original,
        ),
      );
      const before = await profile(tx, fixture.owner.id);
      await expect(
        saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id], "실패한 표시 이름"), {
          content: original.content,
          revision: "invalid-storage-revision",
        }),
      ).rejects.toThrow();
      expect(await profile(tx, fixture.owner.id)).toEqual(before);
      expect(await readProfileImage(fixture.owner, stored.assetId, stored.revision)).toEqual(
        original.content,
      );
      expect(
        await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.actorId, fixture.owner.id)),
      ).toHaveLength(1);
    });
  });

  it("keeps own-settings mutations scoped to the authenticated owner even for an administrator", async () => {
    await withFixture(async (tx, fixture) => {
      boundary.state = { user: fixture.admin, status: "AUTHENTICATED" };
      const originalOther = await profile(tx, fixture.other.id);
      await expect(
        saveOwnProfileSettings(edited(fixture.profiles[fixture.other.id]), await image("blue")),
      ).rejects.toThrow("본인의 프로필");
      expect(await profile(tx, fixture.other.id)).toEqual(originalOther);
      expect(
        await tx
          .select({ id: memberProfileImages.id })
          .from(memberProfileImages)
          .where(eq(memberProfileImages.userId, fixture.other.id)),
      ).toHaveLength(0);
      expect(
        await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.actorId, fixture.admin.id)),
      ).toHaveLength(0);
      const saved = await saveOwnProfileSettings(
        edited(fixture.profiles[fixture.admin.id]),
        await image("red"),
      );
      expect(saved?.hasCustomImage).toBe(true);
    });
  });

  it("allows applicant own saves while refusing previews, revoked roles and disconnected accounts without partial edits", async () => {
    await withFixture(async (tx, fixture) => {
      const normalized = await image("red");
      boundary.state = { user: fixture.applicant, status: "AUTHENTICATED" };
      const stored = reference(
        await saveOwnProfileSettings(edited(fixture.profiles[fixture.applicant.id]), normalized),
      );
      expect(await readProfileImage(fixture.applicant, stored.assetId, stored.revision)).toEqual(
        normalized.content,
      );
      expect(await readProfileImage(fixture.other, stored.assetId, stored.revision)).toBeNull();
      boundary.state = { user: { ...fixture.owner, isMock: true }, status: "AUTHENTICATED" };
      await expect(
        saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id]), normalized),
      ).rejects.toThrow("권한");
      boundary.state = { user: fixture.owner, status: "AUTHENTICATED" };
      const before = await profile(tx, fixture.owner.id);
      await tx.update(users).set({ role: "GUEST" }).where(eq(users.id, fixture.owner.id));
      await expect(
        saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id]), normalized),
      ).rejects.toThrow("권한");
      expect(await profile(tx, fixture.owner.id)).toEqual(before);
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, fixture.owner.id));
      await tx.delete(accounts).where(eq(accounts.userId, fixture.owner.id));
      await expect(
        saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id]), normalized),
      ).rejects.toThrow("Discord 연결");
      expect(await profile(tx, fixture.owner.id)).toEqual(before);
      expect(
        await tx
          .select({ id: memberProfileImages.id })
          .from(memberProfileImages)
          .where(eq(memberProfileImages.userId, fixture.owner.id)),
      ).toHaveLength(0);
    });
  });

  it("does not save text or change an existing image after session or guild authorization fails", async () => {
    await withFixture(async (tx, fixture) => {
      const original = await image("red");
      const stored = reference(await persistProfileImage(fixture.owner, original));
      const before = await profile(tx, fixture.owner.id);
      for (const status of ["LEFT", "UNAVAILABLE", "REAUTH_REQUIRED", "GUEST"] as const) {
        boundary.state = { user: fixture.owner, status };
        await expect(
          saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id]), null),
        ).rejects.toThrow();
        expect(await profile(tx, fixture.owner.id)).toEqual(before);
      }
      boundary.state = { user: fixture.owner, status: "AUTHENTICATED" };
      for (const status of ["LEFT", "UNAVAILABLE", "REAUTH_REQUIRED"]) {
        boundary.eligibility = status;
        await expect(
          saveOwnProfileSettings(edited(fixture.profiles[fixture.owner.id]), null),
        ).rejects.toThrow("Discord 연결");
        expect(await profile(tx, fixture.owner.id)).toEqual(before);
      }
      expect(await readProfileImage(fixture.owner, stored.assetId, stored.revision)).toEqual(
        original.content,
      );
      expect(
        await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.actorId, fixture.owner.id)),
      ).toHaveLength(0);
    });
  });
});
