import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
import {
  accounts,
  auditLogs,
  eq,
  getDb,
  memberProfiles,
  users,
  scenarios,
  servers,
  seasons,
  seasonMemberships,
  operations,
  operationParticipants,
} from "@uniz/db";
import {
  changeMemberRole,
  getEditableMemberProfile,
  getManagedMemberIdentity,
  getMemberDirectory,
  getMemberPublicProfile,
  listMemberManagement,
  saveManagedMemberProfile,
  saveMemberProfile,
} from "../src/lib/server/member-management";
import { reviewMember, updateMemberProfile } from "../src/app/admin/members/actions";
import {
  getSeasonAdminData,
  getSeasonAdminDetail,
  mutateSeasonAdministration,
} from "../src/lib/server/season-administration";
import { getOperationAdminDetail } from "../src/lib/server/operation-administration";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
)
  throw new Error("Member access verification requires the local uniz_hive database.");
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
function authenticate(user: CurrentUser) {
  boundary.state = { user, status: "AUTHENTICATED" };
}
async function withRollback(
  verify: (
    tx: Transaction,
    fixture: {
      admin: CurrentUser;
      officer: CurrentUser;
      member: CurrentUser;
      applicant: CurrentUser;
      guest: CurrentUser;
      profiles: Record<
        string,
        {
          targetId: string;
          handle: string;
          displayName: string;
          nickname: string;
          uid: string;
          bio: string;
        }
      >;
    },
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const rollback = new Error("Intentional member access rollback");
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      const principals = Object.fromEntries(
        ["admin", "officer", "member", "applicant", "guest"].map((name) => [
          name,
          {
            id: randomUUID(),
            name: `Access Fixture ${name}`,
            role: name.toUpperCase(),
            isMock: false,
          },
        ]),
      ) as unknown as {
        admin: CurrentUser;
        officer: CurrentUser;
        member: CurrentUser;
        applicant: CurrentUser;
        guest: CurrentUser;
      };
      const profiles: Record<
        string,
        {
          targetId: string;
          handle: string;
          displayName: string;
          nickname: string;
          uid: string;
          bio: string;
        }
      > = {};
      for (const principal of Object.values(principals)) {
        await tx
          .insert(users)
          .values({ id: principal.id, name: principal.name, role: principal.role });
        await tx.insert(accounts).values({
          userId: principal.id,
          provider: "discord",
          providerAccountId: `access-${principal.id}`,
        });
        const profile = {
          targetId: principal.id,
          handle: `ac_${principal.id.replaceAll("-", "").slice(0, 16)}`,
          displayName: principal.name,
          nickname: "Fixture Character",
          uid: "private-access-fixture",
          bio: "",
        };
        profiles[principal.id] = profile;
        await tx.insert(memberProfiles).values({
          userId: principal.id,
          handle: profile.handle,
          displayName: profile.displayName,
          onceHumanNickname: profile.nickname,
          onceHumanUid: profile.uid,
        });
      }
      authenticate(principals.admin);
      await verify(tx, { ...principals, profiles });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
  }
}
describe("administrator-only member access with rollback", () => {
  it("restricts season-wide member pickers and enrollment without hiding scoped attendee names", async () => {
    await withRollback(async (tx, f) => {
      const [scenario] = await tx
        .insert(scenarios)
        .values({ slug: `member-access-${randomUUID()}`, name: "Access Scenario" })
        .returning();
      const [server] = await tx
        .insert(servers)
        .values({ scenarioId: scenario.id, name: "Access Fixture Server", region: "TEST" })
        .returning();
      const [season] = await tx
        .insert(seasons)
        .values({
          scenarioId: scenario.id,
          serverId: server.id,
          seasonNumber: 1,
          name: "Scoped Season",
          startsAt: new Date(Date.now() - 3600000),
        })
        .returning();
      await tx.insert(seasonMemberships).values({ seasonId: season.id, userId: f.member.id });
      const [operation] = await tx
        .insert(operations)
        .values({
          seasonId: season.id,
          title: "Scoped Operation",
          type: "RAID",
          startsAt: new Date(Date.now() + 3600000),
          capacity: 4,
          createdById: f.admin.id,
        })
        .returning();
      await tx
        .insert(operationParticipants)
        .values({ operationId: operation.id, userId: f.member.id, status: "GOING" });
      expect(
        (await getSeasonAdminData()).approvedMembers.some((member) => member.id === f.member.id),
      ).toBe(true);
      expect((await getOperationAdminDetail(operation.id))?.attendees[0].handle).toBe(
        f.profiles[f.member.id].handle,
      );
      authenticate(f.officer);
      expect((await getSeasonAdminData()).approvedMembers).toHaveLength(0);
      const scoped = await getSeasonAdminDetail(season.id);
      expect(scoped?.season.name).toBe("Scoped Season");
      expect(scoped?.memberships[0].name).toBe(f.profiles[f.member.id].displayName);
      expect(scoped?.memberships[0].handle).toBeNull();
      const scopedOperation = await getOperationAdminDetail(operation.id);
      expect(scopedOperation?.attendees[0].displayName).toBe(f.profiles[f.member.id].displayName);
      expect(scopedOperation?.attendees[0].handle).toBeNull();
      await expect(
        mutateSeasonAdministration({
          action: "ENROL_MEMBERS",
          seasonId: season.id,
          userIds: [f.officer.id],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      authenticate(f.admin);
      await mutateSeasonAdministration({
        action: "ENROL_MEMBERS",
        seasonId: season.id,
        userIds: [f.officer.id],
      });
      expect((await getSeasonAdminDetail(season.id))?.memberships).toHaveLength(2);
      await tx.update(users).set({ role: "OFFICER" }).where(eq(users.id, f.admin.id));
      expect((await getSeasonAdminData()).approvedMembers).toHaveLength(0);
      expect(
        (await getSeasonAdminDetail(season.id))?.memberships.every(
          (member) => member.handle === null,
        ),
      ).toBe(true);
      expect(
        (await getOperationAdminDetail(operation.id))?.attendees.every(
          (member) => member.handle === null,
        ),
      ).toBe(true);
      await expect(
        mutateSeasonAdministration({
          action: "ENROL_MEMBERS",
          seasonId: season.id,
          userIds: [f.guest.id],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
  it("allows only administrators to read directory, profiles, identities and management lists", async () => {
    await withRollback(async (_tx, f) => {
      for (const principal of [f.officer, f.member, f.applicant, f.guest]) {
        authenticate(principal);
        for (const call of [
          () => getMemberDirectory(),
          () => getMemberPublicProfile(f.profiles[f.member.id].handle),
          () => getMemberPublicProfile("invalid"),
          () => listMemberManagement(),
          () => getManagedMemberIdentity(f.member.id),
        ])
          await expect(call()).rejects.toThrow("관리자");
        await expect(getEditableMemberProfile(f.admin.id)).rejects.toThrow("권한");
      }
      authenticate(f.admin);
      const directory = await getMemberDirectory();
      expect(directory.members.some((member) => member.userId === f.member.id)).toBe(true);
      expect(JSON.stringify(directory)).not.toContain("private-access-fixture");
      expect((await getMemberPublicProfile(f.profiles[f.member.id].handle))?.userId).toBe(
        f.member.id,
      );
      expect(
        (await listMemberManagement()).items.some((member) => member.id === f.applicant.id),
      ).toBe(true);
      expect((await getManagedMemberIdentity(f.officer.id))?.role).toBe("OFFICER");
      expect((await getEditableMemberProfile(f.member.id))?.uid).toBe("private-access-fixture");
    });
  });
  it("preserves own profiles while rejecting officer cross-profile writes and administrator-action use", async () => {
    await withRollback(async (tx, f) => {
      for (const principal of [f.member, f.officer, f.applicant]) {
        authenticate(principal);
        expect((await getEditableMemberProfile())?.targetId).toBe(principal.id);
        await saveMemberProfile({ ...f.profiles[principal.id], bio: "Own edit" });
        await expect(saveManagedMemberProfile(f.profiles[principal.id])).rejects.toThrow("관리자");
        const ownForm = new FormData();
        for (const [key, value] of Object.entries(f.profiles[principal.id]))
          ownForm.set(key, value);
        expect(await updateMemberProfile({ ok: false, message: "" }, ownForm)).toMatchObject({
          ok: false,
          message: expect.stringContaining("관리자"),
        });
        await expect(saveMemberProfile(f.profiles[f.admin.id])).rejects.toThrow("권한");
      }
      const [profile] = await tx
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, f.admin.id));
      expect(profile.bio).toBeNull();
    });
  });
  it("blocks stale administrator reads and actions after a persisted role change", async () => {
    await withRollback(async (tx, f) => {
      await tx.update(users).set({ role: "OFFICER" }).where(eq(users.id, f.admin.id));
      for (const call of [
        () => getMemberDirectory(),
        () => listMemberManagement(),
        () => getManagedMemberIdentity(f.member.id),
        () => getEditableMemberProfile(f.member.id),
        () => saveManagedMemberProfile(f.profiles[f.admin.id]),
        () => changeMemberRole({ action: "approve", targetId: f.applicant.id, reason: "VERIFIED" }),
      ])
        await expect(call()).rejects.toThrow(/관리자|권한/);
      const [target] = await tx.select().from(users).where(eq(users.id, f.applicant.id));
      expect(target.role).toBe("APPLICANT");
      expect(
        await tx.select().from(auditLogs).where(eq(auditLogs.actorId, f.admin.id)),
      ).toHaveLength(0);
      expect((await getEditableMemberProfile())?.targetId).toBe(f.admin.id);
    });
  });
  it("requires a current Discord connection and retains role-management success for a real administrator", async () => {
    await withRollback(async (tx, f) => {
      await changeMemberRole({ action: "approve", targetId: f.applicant.id, reason: "VERIFIED" });
      const [target] = await tx.select().from(users).where(eq(users.id, f.applicant.id));
      expect(target.role).toBe("MEMBER");
      await tx.delete(accounts).where(eq(accounts.userId, f.admin.id));
      await expect(getMemberDirectory()).rejects.toThrow("Discord");
      await expect(listMemberManagement()).rejects.toThrow("Discord");
      await expect(saveManagedMemberProfile(f.profiles[f.admin.id])).rejects.toThrow("Discord");
    });
  });
  it("denies direct member mutations to every non-administrator", async () => {
    await withRollback(async (_tx, f) => {
      for (const principal of [f.officer, f.member, f.applicant, f.guest]) {
        authenticate(principal);
        await expect(
          changeMemberRole({ action: "approve", targetId: f.applicant.id, reason: "VERIFIED" }),
        ).rejects.toThrow("관리자");
        const form = new FormData();
        form.set("targetId", f.applicant.id);
        form.set("action", "approve");
        form.set("reason", "VERIFIED");
        expect(await reviewMember({ ok: false, message: "" }, form)).toMatchObject({
          ok: false,
          message: expect.stringContaining("관리자"),
        });
      }
    });
  });
});
