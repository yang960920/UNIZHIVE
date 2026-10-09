import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../src/lib/auth-policy";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  eligibility: "MEMBER",
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: async () => ({ status: boundary.eligibility }),
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});

import { accounts, eq, getDb, memberProfileImages, users } from "@uniz/db";
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
  throw new Error("Profile image verification requires the local uniz_hive database.");

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Fixture = {
  owner: CurrentUser;
  other: CurrentUser;
  admin: CurrentUser;
  applicant: CurrentUser;
  rejected: CurrentUser;
};
class FixtureRollback extends Error {}

async function withFixture(check: (transaction: Transaction, fixture: Fixture) => Promise<void>) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const fixture = Object.fromEntries(
    [
      ["owner", "MEMBER"],
      ["other", "MEMBER"],
      ["admin", "ADMIN"],
      ["applicant", "APPLICANT"],
      ["rejected", "GUEST"],
    ].map(([name, role]) => [
      name,
      { id: randomUUID(), name: `Avatar Verification ${name}`, role, isMock: false },
    ]),
  ) as Fixture;
  boundary.eligibility = "MEMBER";
  try {
    await actual.getDb().transaction(async (transaction) => {
      boundary.transaction = transaction;
      for (const actor of Object.values(fixture)) {
        await transaction
          .insert(users)
          .values({ id: actor.id, name: actor.name, role: actor.role });
        await transaction.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `avatar-verification-${actor.id}`,
          access_token: "private-avatar-fixture-token",
        });
      }
      await check(transaction, fixture);
      throw new FixtureRollback();
    });
  } catch (error) {
    if (!(error instanceof FixtureRollback)) throw error;
  } finally {
    boundary.transaction = null;
    boundary.eligibility = "MEMBER";
  }
  for (const actor of Object.values(fixture)) {
    expect(
      await actual.getDb().select({ id: users.id }).from(users).where(eq(users.id, actor.id)),
    ).toHaveLength(0);
    expect(
      await actual
        .getDb()
        .select({ id: memberProfileImages.id })
        .from(memberProfileImages)
        .where(eq(memberProfileImages.userId, actor.id)),
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
function reference(state: { imageUrl: string | null }) {
  expect(state.imageUrl).not.toBeNull();
  const url = new URL(state.imageUrl!, "http://localhost:3000");
  return { assetId: url.pathname.split("/").at(-1)!, revision: url.searchParams.get("v")! };
}

describe("normalized personal avatars against local PostgreSQL with full rollback", () => {
  it("stores decoded pixels, replaces one owner's row and deletes without touching another account", async () => {
    await withFixture(async (tx, { owner, other }) => {
      const first = await image("red");
      const replacement = await image("blue");
      const otherImage = await image("green");
      const initialRef = reference(await persistProfileImage(owner, first));
      const otherRef = reference(await persistProfileImage(other, otherImage));
      const replacementRef = reference(await persistProfileImage(owner, replacement));
      expect(replacementRef.assetId).toBe(initialRef.assetId);
      expect(replacementRef.revision).not.toBe(initialRef.revision);
      const ownerRows = await tx
        .select()
        .from(memberProfileImages)
        .where(eq(memberProfileImages.userId, owner.id));
      expect(ownerRows).toHaveLength(1);
      expect(Buffer.from(ownerRows[0].content)).toEqual(replacement.content);
      expect(await readProfileImage(owner, initialRef.assetId, initialRef.revision)).toBeNull();
      expect(
        await readProfileImage(owner, replacementRef.assetId, replacementRef.revision),
      ).toEqual(replacement.content);
      expect(await persistProfileImage(owner, null)).toEqual({
        imageUrl: null,
        hasCustomImage: false,
      });
      expect(await getOwnProfileImage(owner)).toEqual({ imageUrl: null, hasCustomImage: false });
      expect(
        await readProfileImage(owner, replacementRef.assetId, replacementRef.revision),
      ).toBeNull();
      expect(await readProfileImage(other, otherRef.assetId, otherRef.revision)).toEqual(
        otherImage.content,
      );
      expect(
        await tx
          .select({ id: memberProfileImages.id })
          .from(memberProfileImages)
          .where(eq(memberProfileImages.userId, other.id)),
      ).toHaveLength(1);
    });
  });

  it("permits an applicant's own image and administrator review while isolating unapproved profiles", async () => {
    await withFixture(async (_tx, { owner, other, admin, applicant, rejected }) => {
      const pixels = await image("red");
      const applicantRef = reference(await persistProfileImage(applicant, pixels));
      const ownerRef = reference(await persistProfileImage(owner, pixels));
      expect(
        await readProfileImage(applicant, applicantRef.assetId, applicantRef.revision),
      ).toEqual(pixels.content);
      expect(await readProfileImage(admin, applicantRef.assetId, applicantRef.revision)).toEqual(
        pixels.content,
      );
      expect(await readProfileImage(other, applicantRef.assetId, applicantRef.revision)).toBeNull();
      expect(await readProfileImage(applicant, ownerRef.assetId, ownerRef.revision)).toBeNull();
      expect(await readProfileImage(other, ownerRef.assetId, ownerRef.revision)).toEqual(
        pixels.content,
      );
      await expect(persistProfileImage(rejected, pixels)).rejects.toThrow("계정 연결");
      await expect(readProfileImage(rejected, ownerRef.assetId, ownerRef.revision)).rejects.toThrow(
        "계정 연결",
      );
      expect(JSON.stringify(await getOwnProfileImage(applicant))).not.toContain(
        "private-avatar-fixture-token",
      );
    });
  });

  it("uses current database roles instead of stale administrative claims and hides newly rejected subjects", async () => {
    await withFixture(async (tx, { owner, other, admin, applicant }) => {
      const pixels = await image("red");
      const applicantRef = reference(await persistProfileImage(applicant, pixels));
      const ownerRef = reference(await persistProfileImage(owner, pixels));
      expect(
        await readProfileImage(
          { ...other, role: "ADMIN" },
          applicantRef.assetId,
          applicantRef.revision,
        ),
      ).toBeNull();
      await tx.update(users).set({ role: "MEMBER" }).where(eq(users.id, admin.id));
      expect(await readProfileImage(admin, applicantRef.assetId, applicantRef.revision)).toBeNull();
      await tx.update(users).set({ role: "GUEST" }).where(eq(users.id, owner.id));
      expect(await readProfileImage(other, ownerRef.assetId, ownerRef.revision)).toBeNull();
      await expect(persistProfileImage(owner, pixels)).rejects.toThrow("계정 연결");
      await expect(persistProfileImage(owner, null)).rejects.toThrow("계정 연결");
      expect(
        await tx
          .select({ revision: memberProfileImages.revision })
          .from(memberProfileImages)
          .where(eq(memberProfileImages.userId, owner.id)),
      ).toEqual([{ revision: pixels.revision }]);
    });
  });

  it("requires connected Discord accounts for both the reader and the subject", async () => {
    await withFixture(async (tx, { owner, other, admin }) => {
      const pixels = await image("red");
      const stored = reference(await persistProfileImage(owner, pixels));
      await tx.delete(accounts).where(eq(accounts.userId, owner.id));
      expect(await readProfileImage(other, stored.assetId, stored.revision)).toBeNull();
      expect(await readProfileImage(admin, stored.assetId, stored.revision)).toBeNull();
      await expect(getOwnProfileImage(owner)).rejects.toThrow("계정 연결");
      await expect(persistProfileImage(owner, null)).rejects.toThrow("계정 연결");
      expect(
        await tx
          .select({ revision: memberProfileImages.revision })
          .from(memberProfileImages)
          .where(eq(memberProfileImages.userId, owner.id)),
      ).toEqual([{ revision: pixels.revision }]);
    });
  });

  it("does not overwrite or remove a stored image during temporary or lost guild authorization", async () => {
    await withFixture(async (tx, { owner }) => {
      const pixels = await image("red");
      await persistProfileImage(owner, pixels);
      for (const status of ["LEFT", "UNAVAILABLE", "REAUTH_REQUIRED"]) {
        boundary.eligibility = status;
        await expect(persistProfileImage(owner, await image("blue"))).rejects.toThrow(
          "Discord 연결",
        );
        await expect(persistProfileImage(owner, null)).rejects.toThrow("Discord 연결");
        expect(
          await tx
            .select({ revision: memberProfileImages.revision })
            .from(memberProfileImages)
            .where(eq(memberProfileImages.userId, owner.id)),
        ).toEqual([{ revision: pixels.revision }]);
      }
    });
  });

  it("rejects obsolete and malformed asset references without affecting an existing normalized image", async () => {
    await withFixture(async (_tx, { owner }) => {
      const pixels = await image("red");
      const stored = reference(await persistProfileImage(owner, pixels));
      expect(await readProfileImage(owner, stored.assetId, "0".repeat(64))).toBeNull();
      expect(await readProfileImage(owner, stored.assetId, "invalid")).toBeNull();
      expect(await readProfileImage(owner, "../private", stored.revision)).toBeNull();
      expect(await readProfileImage(owner, randomUUID(), stored.revision)).toBeNull();
      expect(await readProfileImage(owner, stored.assetId, null)).toEqual(pixels.content);
    });
  });
});
