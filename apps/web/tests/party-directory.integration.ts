import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { CurrentAuthState, CurrentUser } from "../src/lib/auth-policy";
vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  transaction: null as unknown,
  lastError: null as unknown,
  state: { user: null, status: "GUEST" } as CurrentAuthState,
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: async () => boundary.state }));
vi.mock("@uniz/db", async (original) => {
  const actual = await original<typeof import("@uniz/db")>();
  return {
    ...actual,
    getDb: () => {
      if (!boundary.transaction) return actual.getDb();
      const transaction = boundary.transaction as ReturnType<typeof actual.getDb>;
      return {
        transaction: async (callback: Parameters<typeof transaction.transaction>[0]) => {
          try {
            return await transaction.transaction(callback);
          } catch (error) {
            boundary.lastError = error;
            throw error;
          }
        },
      };
    },
  };
});
import {
  accounts,
  eq,
  getDb,
  operations,
  operationParticipants,
  operationRoles,
  scenarios,
  seasons,
  seasonMemberships,
  servers,
  users,
} from "@uniz/db";
import {
  getOperationDirectory,
  getOperationDirectoryDetail,
} from "../src/lib/server/operation-directory";
import { partyCalendarDateKey } from "../src/lib/party-calendar";
process.loadEnvFile(new URL("../../../.env", import.meta.url));
const configured = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname) ||
  configured.pathname !== "/uniz_hive"
) {
  throw new Error("Party directory verification requires the local uniz_hive database.");
}
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
async function fixture(
  verify: (
    tx: Transaction,
    data: {
      member: CurrentUser;
      officer: CurrentUser;
      seasonId: string;
      otherSeasonId: string;
      pendingSeasonId: string;
      startsAt: Date;
      endsAt: Date;
    },
  ) => Promise<void>,
) {
  const actual = await vi.importActual<typeof import("@uniz/db")>("@uniz/db");
  const rollback = new Error("Intentional party directory verification rollback");
  try {
    await actual.getDb().transaction(async (tx) => {
      boundary.transaction = tx;
      boundary.lastError = null;
      const member: CurrentUser = {
        id: randomUUID(),
        name: "Directory Fixture Member",
        role: "MEMBER",
        isMock: false,
      };
      const officer: CurrentUser = {
        id: randomUUID(),
        name: "Directory Fixture Officer",
        role: "OFFICER",
        isMock: false,
      };
      for (const actor of [member, officer]) {
        await tx.insert(users).values({ id: actor.id, name: actor.name, role: actor.role });
        await tx.insert(accounts).values({
          userId: actor.id,
          provider: "discord",
          providerAccountId: `directory-${actor.id}`,
        });
      }
      const [scenario] = await tx
        .insert(scenarios)
        .values({ slug: `directory-${randomUUID()}`, name: "Directory Fixture" })
        .returning();
      const [server] = await tx
        .insert(servers)
        .values({ scenarioId: scenario.id, name: `Directory-${randomUUID()}`, region: "TEST" })
        .returning();
      const seasonIds: string[] = [];
      for (let index = 0; index < 3; index++) {
        const [season] = await tx
          .insert(seasons)
          .values({
            scenarioId: scenario.id,
            serverId: server.id,
            seasonNumber: index + 1,
            name: "동일한 하이브명",
            status: "ACTIVE",
            approvalStatus: index === 2 ? "PENDING" : "APPROVED",
            startsAt: new Date(Date.now() - 3_600_000),
          })
          .returning();
        seasonIds.push(season.id);
      }
      await tx.insert(seasonMemberships).values({ seasonId: seasonIds[0], userId: member.id });
      boundary.state = { user: member, status: "AUTHENTICATED" };
      const startsAt = new Date(Date.now() + 86_400_000);
      await verify(tx, {
        member,
        officer,
        seasonId: seasonIds[0],
        otherSeasonId: seasonIds[1],
        pendingSeasonId: seasonIds[2],
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    boundary.transaction = null;
    boundary.state = { user: null, status: "GUEST" };
  }
}
function requireLive<T extends { mode: string }>(
  result: T,
): asserts result is T & { mode: "LIVE" } {
  if (result.mode !== "LIVE")
    throw boundary.lastError ?? new Error(`Directory fixture mode: ${result.mode}`);
}
describe("party directory SQL rollback verification", () => {
  it("keeps withdrawal available after content is disabled and scopes staff roster tools to open new parties", async () => {
    await fixture(async (tx, f) => {
      const [party] = await tx
        .insert(operations)
        .values({
          seasonId: f.seasonId,
          title: "중단된 응축기",
          type: "RAID",
          contentKey: "gravity-condenser",
          startsAt: f.startsAt,
          endsAt: f.endsAt,
          capacity: 2,
          createdById: f.member.id,
        })
        .returning();
      await tx
        .insert(operationParticipants)
        .values({ operationId: party.id, userId: f.member.id, status: "GOING" });
      const withdrawal = await getOperationDirectoryDetail(party.id);
      expect(withdrawal).toMatchObject({
        mode: "LIVE",
        data: { mayRespond: true, mayGo: false, mayMaybe: false, canCancelParticipation: true },
      });
      boundary.state = { user: f.officer, status: "AUTHENTICATED" };
      const staff = await getOperationDirectoryDetail(party.id);
      expect(staff).toMatchObject({
        mode: "LIVE",
        data: { mayRespond: false, canManageParticipants: true },
      });
      const [legacy] = await tx
        .insert(operations)
        .values({
          seasonId: null,
          title: "기존 공통 작전",
          type: "RAID",
          startsAt: f.startsAt,
          capacity: 2,
          createdById: f.officer.id,
        })
        .returning();
      expect(await getOperationDirectoryDetail(legacy.id)).toMatchObject({
        mode: "LIVE",
        data: { canManageParticipants: false },
      });
      await tx.update(seasons).set({ status: "SETTLEMENT" }).where(eq(seasons.id, f.seasonId));
      expect(await getOperationDirectoryDetail(party.id)).toMatchObject({
        mode: "LIVE",
        data: { canManageParticipants: false },
      });
    });
  });
  it("scopes parties by season ID, groups KST counts and reads only the requested detail", async () => {
    await fixture(async (tx, f) => {
      const created = await tx
        .insert(operations)
        .values(
          [f.seasonId, f.otherSeasonId, f.pendingSeasonId].map((seasonId) => ({
            seasonId,
            title: "검증 모집",
            type: "RAID" as const,
            contentKey: "raid",
            meetingPoint: "입구",
            startsAt: f.startsAt,
            endsAt: f.endsAt,
            capacity: 2,
            createdById: f.member.id,
          })),
        )
        .returning();
      const [role] = await tx
        .insert(operationRoles)
        .values({ operationId: created[0].id, name: "지원", capacity: 1 })
        .returning();
      const [outsideMonth] = await tx
        .insert(operations)
        .values({
          seasonId: f.seasonId,
          title: "다른 달의 모집",
          type: "RAID",
          contentKey: "raid",
          startsAt: new Date(f.startsAt.getTime() + 90 * 86_400_000),
          capacity: 2,
          createdById: f.member.id,
        })
        .returning();
      const [orphanParty] = await tx
        .insert(operations)
        .values({
          seasonId: null,
          title: "시즌 정보 누락",
          type: "RAID",
          contentKey: "raid",
          startsAt: f.startsAt,
          capacity: 2,
          createdById: f.member.id,
        })
        .returning();
      await tx.insert(operationParticipants).values({
        operationId: created[0].id,
        userId: f.member.id,
        roleId: role.id,
        status: "GOING",
      });
      const day = partyCalendarDateKey(f.startsAt);
      const result = await getOperationDirectory({
        seasonId: f.seasonId,
        month: day.slice(0, 7),
        day,
      });
      requireLive(result);
      if (result.mode !== "LIVE") throw Error("Not live");
      expect(result.data.operations.map((row) => row.id)).toContain(created[0].id);
      expect(result.data.operations.map((row) => row.id)).not.toContain(created[1].id);
      expect(result.data.operations.map((row) => row.id)).not.toContain(outsideMonth.id);
      expect(result.data.operations.map((row) => row.id)).not.toContain(orphanParty.id);
      expect(result.data.seasons.map((row) => row.id)).not.toContain(f.pendingSeasonId);
      expect(
        result.data.calendarDays.find((cell) => cell.date === day)!.operationCount,
      ).toBeGreaterThanOrEqual(1);
      expect(result.data.canCreate).toBe(true);
      const detail = await getOperationDirectoryDetail(created[0].id);
      requireLive(detail);
      if (detail.mode !== "LIVE" || !detail.data) throw Error("Missing detail");
      expect(detail.data.goingCount).toBe(1);
      expect(detail.data.roles[0].goingCount).toBe(1);
      expect(detail.data.attendees[0].userId).toBe(f.member.id);
      expect(detail.data.canManage).toBe(true);
      expect(detail.data.canManageParticipants).toBe(false);
      const hidden = await getOperationDirectoryDetail(created[2].id);
      expect(hidden).toMatchObject({ mode: "LIVE", data: null });
      expect(await getOperationDirectoryDetail(orphanParty.id)).toMatchObject({
        mode: "LIVE",
        data: null,
      });
    });
  });
  it("warns about overlapping personal attendance without blocking another RSVP", async () => {
    await fixture(async (tx, f) => {
      const created = await tx
        .insert(operations)
        .values([
          {
            seasonId: f.seasonId,
            title: "기존 참가",
            type: "RAID" as const,
            contentKey: "raid",
            startsAt: f.startsAt,
            endsAt: f.endsAt,
            capacity: 2,
            createdById: f.officer.id,
          },
          {
            seasonId: f.seasonId,
            title: "시간 중복",
            type: "RAID" as const,
            contentKey: "raid",
            startsAt: new Date(f.startsAt.getTime() + 1_800_000),
            endsAt: new Date(f.endsAt.getTime() + 1_800_000),
            capacity: 2,
            createdById: f.officer.id,
          },
          {
            seasonId: f.seasonId,
            title: "종료 미정",
            type: "RAID" as const,
            contentKey: "raid",
            startsAt: new Date(f.startsAt.getTime() + 1_800_000),
            endsAt: null,
            capacity: 2,
            createdById: f.officer.id,
          },
        ])
        .returning();
      await tx
        .insert(operationParticipants)
        .values({ operationId: created[0].id, userId: f.member.id, status: "GOING" });
      const overlap = await getOperationDirectoryDetail(created[1].id);
      requireLive(overlap);
      if (overlap.mode !== "LIVE" || !overlap.data) throw Error("Missing overlap");
      expect(overlap.data.timeConflictNotice).not.toBeNull();
      expect(overlap.data.mayGo).toBe(true);
      const unknownEnd = await getOperationDirectoryDetail(created[2].id);
      expect(unknownEnd).toMatchObject({ mode: "LIVE", data: { timeConflictNotice: null } });
    });
  });
  it("keeps all monthly counts while paginating rows and checks removed/staff membership separately", async () => {
    await fixture(async (tx, f) => {
      const startsAt = new Date("2046-10-09T11:00:00.000Z");
      const created = await tx
        .insert(operations)
        .values(
          Array.from({ length: 9 }, (_, index) => ({
            seasonId: f.seasonId,
            title: `검증 ${index}`,
            type: "RAID" as const,
            contentKey: "raid",
            startsAt: new Date(startsAt.getTime() + index * 60_000),
            endsAt: new Date(startsAt.getTime() + (60 + index) * 60_000),
            capacity: 2,
            createdById: f.officer.id,
          })),
        )
        .returning();
      const day = partyCalendarDateKey(startsAt);
      const first = await getOperationDirectory({
        seasonId: f.seasonId,
        month: day.slice(0, 7),
        day,
      });
      requireLive(first);
      if (first.mode !== "LIVE") throw Error("Not live");
      expect(first.data.operations).toHaveLength(4);
      expect(first.data.pagination).toEqual({
        page: 1,
        pageSize: 4,
        totalCount: 9,
        hasNextPage: true,
      });
      expect(first.data.calendarDays.find((cell) => cell.date === day)?.operationCount).toBe(9);
      expect(first.data.overflowNotice).not.toBeNull();
      const second = await getOperationDirectory({
        seasonId: f.seasonId,
        month: day.slice(0, 7),
        day,
        page: "2",
      });
      requireLive(second);
      if (second.mode !== "LIVE") throw Error("Not live");
      expect(second.data.operations).toHaveLength(4);
      expect(second.data.pagination).toEqual({
        page: 2,
        pageSize: 4,
        totalCount: 9,
        hasNextPage: true,
      });
      const third = await getOperationDirectory({
        seasonId: f.seasonId,
        month: day.slice(0, 7),
        day,
        page: "3",
      });
      requireLive(third);
      if (third.mode !== "LIVE") throw Error("Not live");
      expect(third.data.operations).toHaveLength(1);
      expect(third.data.pagination).toEqual({
        page: 3,
        pageSize: 4,
        totalCount: 9,
        hasNextPage: false,
      });
      for (const result of [first, second, third]) {
        expect(result.data).toMatchObject({
          selectedSeasonId: f.seasonId,
          selectedDay: day,
          month: day.slice(0, 7),
        });
        expect(result.data.calendarDays).toEqual(first.data.calendarDays);
      }
      const allIds = new Set(
        [...first.data.operations, ...second.data.operations, ...third.data.operations].map(
          (row) => row.id,
        ),
      );
      expect([...allIds]).toEqual(created.map((operation) => operation.id));
      for (const operation of created) expect(allIds.has(operation.id)).toBe(true);
      const monthly = await getOperationDirectory({
        seasonId: f.seasonId,
        month: day.slice(0, 7),
      });
      requireLive(monthly);
      if (monthly.mode !== "LIVE") throw Error("Not live");
      expect(monthly.data.operations).toHaveLength(4);
      expect(monthly.data.pagination).toEqual(first.data.pagination);
      expect(monthly.data.calendarDays).toEqual(first.data.calendarDays);
      const beyondLastPage = await getOperationDirectory({
        seasonId: f.seasonId,
        month: day.slice(0, 7),
        day,
        page: "99",
      });
      requireLive(beyondLastPage);
      if (beyondLastPage.mode !== "LIVE") throw Error("Not live");
      expect(beyondLastPage.data.pagination).toEqual(third.data.pagination);
      expect(beyondLastPage.data.operations.map((operation) => operation.id)).toEqual(
        third.data.operations.map((operation) => operation.id),
      );
      boundary.state = { user: f.officer, status: "AUTHENTICATED" };
      const staff = await getOperationDirectoryDetail(created[0].id);
      expect(staff).toMatchObject({
        mode: "LIVE",
        data: { canManage: true, canCreate: true, myMembership: false, mayGo: false },
      });
      await tx
        .update(seasonMemberships)
        .set({ removedAt: new Date() })
        .where(eq(seasonMemberships.userId, f.member.id));
      boundary.state = { user: f.member, status: "AUTHENTICATED" };
      const removed = await getOperationDirectoryDetail(created[0].id);
      expect(removed).toMatchObject({
        mode: "LIVE",
        data: { canCreate: false, mayRespond: false },
      });
    });
  });
});
