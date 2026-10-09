import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getLiveGuildEligibility: async () => "MEMBER",
}));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return { ...actual, getDb: () => boundary.transaction ?? actual.getDb() };
});
import { accounts, eq, memberProfileImages, memberProfiles, users } from "@uniz/db";
import { findAuthUser } from "../src/lib/server/auth-repository";
import {
  getManagedMemberIdentity,
  getMemberDirectory,
  getMemberPublicProfile,
  listMemberManagement,
} from "../src/lib/server/member-management";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const target = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/uniz_hive"
)
  throw new Error("Avatar consumer verification requires local uniz_hive PostgreSQL.");

describe("avatar metadata in authenticated/admin-only DTOs", () => {
  it("reads custom metadata across consumers, excludes raw/private data and preserves administrator membership access", async () => {
    const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
    const rollback = new Error("Intentional avatar consumer fixture rollback");
    try {
      await actual.getDb().transaction(async (tx) => {
        boundary.transaction = tx;
        const actors: CurrentUser[] = ["ADMIN", "MEMBER", "OFFICER"].map((role) => ({
          id: randomUUID(),
          name: `Avatar ${role}`,
          role: role as CurrentUser["role"],
          isMock: false,
        }));
        for (const actor of actors) {
          await tx
            .insert(users)
            .values({
              id: actor.id,
              name: actor.name,
              role: actor.role,
              image: "https://cdn.discordapp.com/avatar-not-exposed",
            });
          await tx
            .insert(accounts)
            .values({
              userId: actor.id,
              provider: "discord",
              providerAccountId: `avatar-${actor.id}`,
              access_token: "AVATAR_OAUTH_CANARY",
            });
          await tx
            .insert(memberProfiles)
            .values({
              userId: actor.id,
              displayName: actor.name,
              handle: `a-${actor.id.slice(0, 20)}`,
              onceHumanNickname: "Fixture",
              onceHumanUid: "AVATAR_PRIVATE_UID_CANARY",
            });
        }
        const content = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZsAAAAASUVORK5CYII=",
          "base64",
        );
        const revision = createHash("sha256").update(content).digest("hex");
        const [asset] = await tx
          .insert(memberProfileImages)
          .values({ userId: actors[1].id, revision, content })
          .returning({ id: memberProfileImages.id });
        const expectedUrl = `/api/profile/image/${asset.id}?v=${revision}`;
        const own = await findAuthUser(actors[1].id);
        expect(own?.imageUrl).toBe(expectedUrl);
        expect(own).not.toHaveProperty("avatarRevision");
        expect(own).not.toHaveProperty("content");
        boundary.state = { user: actors[0], status: "AUTHENTICATED" };
        const directory = await getMemberDirectory();
        const member = directory.members.find((row) => row.userId === actors[1].id)!;
        expect(member.imageUrl).toBe(expectedUrl);
        expect((await getMemberPublicProfile(member.handle))?.imageUrl).toBe(expectedUrl);
        expect(
          (await listMemberManagement()).items.find((row) => row.id === actors[1].id)?.imageUrl,
        ).toBe(expectedUrl);
        expect((await getManagedMemberIdentity(actors[1].id))?.imageUrl).toBe(expectedUrl);
        for (const dto of [own, member, await getManagedMemberIdentity(actors[1].id)]) {
          expect(JSON.stringify(dto)).not.toMatch(
            /AVATAR_OAUTH_CANARY|AVATAR_PRIVATE_UID_CANARY|cdn\.discordapp\.com|"content"|"avatarId"|"avatarRevision"/,
          );
        }
        for (const actor of actors.slice(1)) {
          boundary.state = { user: actor, status: "AUTHENTICATED" };
          await expect(getMemberDirectory()).rejects.toThrow("관리자");
          await expect(getMemberPublicProfile(member.handle)).rejects.toThrow("관리자");
          await expect(getManagedMemberIdentity(actors[1].id)).rejects.toThrow("관리자");
          await expect(listMemberManagement()).rejects.toThrow("관리자");
        }
        await tx.delete(memberProfileImages).where(eq(memberProfileImages.id, asset.id));
        expect((await findAuthUser(actors[1].id))?.imageUrl).toBeNull();
        boundary.state = { user: actors[0], status: "AUTHENTICATED" };
        expect(
          (await getMemberDirectory()).members.find((row) => row.userId === actors[1].id)?.imageUrl,
        ).toBeNull();
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      boundary.transaction = null;
      boundary.state = { user: null, status: "GUEST" };
    }
  });
});
