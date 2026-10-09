import { describe, expect, it } from "vitest";
import {
  assertOperationSaveAllowed,
  operationAdministrationSchema,
  requireOperationAdministrator,
  type OperationAdministrationInput,
} from "../src/lib/operation-admin-policy";

const now = new Date("2026-10-06T09:00:00Z");
const seasonId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const actor = { id: operationId, name: "운영진", role: "OFFICER" as const, isMock: false };
const input: OperationAdministrationInput = {
  action: "SAVE_OPERATION",
  seasonId,
  title: "첫 레이드",
  type: "RAID",
  description: "참석할 시간을 확인해 주세요.",
  startsAt: "2026-10-07T09:00:00.000Z",
  endsAt: "2026-10-07T11:00:00.000Z",
  capacity: 10,
  status: "SCHEDULED",
};
const season = {
  id: seasonId,
  status: "ACTIVE" as const,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  settlementAt: new Date("2026-10-30T00:00:00Z"),
};
const existing = {
  seasonId,
  status: "SCHEDULED" as const,
  startsAt: new Date(input.startsAt),
  updatedAt: new Date("2026-10-06T08:00:00Z"),
};
const edit = {
  ...input,
  id: operationId,
  expectedUpdatedAt: existing.updatedAt.toISOString(),
};
const context = {
  input,
  existing: null,
  currentSeason: null,
  targetSeason: season,
  participantCount: 0,
  goingCount: 0,
  now,
};

describe("operation administration permissions and input", () => {
  it("permits live officers and administrators only", () => {
    expect(requireOperationAdministrator(actor).id).toBe(actor.id);
    expect(requireOperationAdministrator({ ...actor, role: "ADMIN" }).id).toBe(actor.id);
    for (const role of ["GUEST", "APPLICANT", "MEMBER"] as const)
      expect(() => requireOperationAdministrator({ ...actor, role })).toThrow("권한");
  });

  it("rejects absent, mock, and synthetic identities regardless of administrator role", () => {
    expect(() => requireOperationAdministrator(null)).toThrow("로그인");
    expect(() => requireOperationAdministrator({ ...actor, isMock: true })).toThrow("실제");
    expect(() => requireOperationAdministrator({ ...actor, id: "demo-admin" })).toThrow("실제");
  });

  it("rejects client actor fields, invalid dates and noninteger capacity", () => {
    expect(
      operationAdministrationSchema.safeParse({ ...input, actorId: operationId }).success,
    ).toBe(false);
    expect(
      operationAdministrationSchema.safeParse({ ...input, startsAt: "2026-10-07T09:00" }).success,
    ).toBe(false);
    expect(operationAdministrationSchema.safeParse({ ...input, capacity: 1.5 }).success).toBe(
      false,
    );
    expect(operationAdministrationSchema.safeParse({ ...input, capacity: 0 }).success).toBe(false);
  });

  it("requires an optimistic version for edits and pairs it with an existing ID", () => {
    expect(operationAdministrationSchema.safeParse(edit).success).toBe(true);
    expect(operationAdministrationSchema.safeParse({ ...input, id: operationId }).success).toBe(
      false,
    );
    expect(
      operationAdministrationSchema.safeParse({
        ...input,
        expectedUpdatedAt: edit.expectedUpdatedAt,
      }).success,
    ).toBe(false);
  });
});

describe("operation lifecycle and time constraints", () => {
  it("permits operations without inventing a settlement date and still enforces season start", () => {
    expect(() =>
      assertOperationSaveAllowed({ ...context, targetSeason: { ...season, settlementAt: null } }),
    ).not.toThrow();
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        targetSeason: { ...season, settlementAt: null, startsAt: new Date("2026-10-08T00:00:00Z") },
      }),
    ).toThrow("시즌 시작");
  });

  it("rejects linking a new operation to a pending or rejected season", () => {
    for (const approvalStatus of ["PENDING", "REJECTED"] as const)
      expect(() =>
        assertOperationSaveAllowed({ ...context, targetSeason: { ...season, approvalStatus } }),
      ).toThrow("승인된 시즌");
  });

  it("rejects editing an operation whose current season is not approved", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: edit,
        existing,
        currentSeason: { ...season, approvalStatus: "PENDING" },
      }),
    ).toThrow("승인되지 않은 시즌");
  });

  it("registers a future scheduled operation inside an active or planned season", () => {
    expect(() => assertOperationSaveAllowed(context)).not.toThrow();
    expect(() =>
      assertOperationSaveAllowed({ ...context, targetSeason: { ...season, status: "PLANNED" } }),
    ).not.toThrow();
  });

  it("allows an independent operation without inventing a season", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...input, seasonId: null },
        targetSeason: null,
      }),
    ).not.toThrow();
  });

  it("rejects creation in terminal states and starts at or before now", () => {
    for (const status of ["COMPLETED", "CANCELLED"] as const)
      expect(() => assertOperationSaveAllowed({ ...context, input: { ...input, status } })).toThrow(
        "예정",
      );
    expect(() =>
      assertOperationSaveAllowed({ ...context, input: { ...input, startsAt: now.toISOString() } }),
    ).toThrow("현재");
  });

  it("rejects an end at or before the start", () => {
    expect(() =>
      assertOperationSaveAllowed({ ...context, input: { ...input, endsAt: input.startsAt } }),
    ).toThrow("종료");
  });

  it("requires the operation interval to stay inside the season", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        targetSeason: { ...season, startsAt: new Date("2026-10-08T00:00:00Z") },
      }),
    ).toThrow("시즌 시작");
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        targetSeason: { ...season, settlementAt: new Date("2026-10-07T10:00:00Z") },
      }),
    ).toThrow("시즌 시작");
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...input, endsAt: null },
        targetSeason: { ...season, settlementAt: new Date(input.startsAt) },
      }),
    ).not.toThrow();
  });

  it("rejects unknown, mismatched and terminal target seasons", () => {
    expect(() => assertOperationSaveAllowed({ ...context, targetSeason: null })).toThrow(
      "시즌을 찾을",
    );
    expect(() =>
      assertOperationSaveAllowed({ ...context, targetSeason: { ...season, id: operationId } }),
    ).toThrow("시즌을 찾을");
    for (const status of ["SETTLEMENT", "ARCHIVED"] as const)
      expect(() =>
        assertOperationSaveAllowed({ ...context, targetSeason: { ...season, status } }),
      ).toThrow("진행 중");
  });

  it("does not modify completed or cancelled records", () => {
    for (const status of ["COMPLETED", "CANCELLED"] as const)
      expect(() =>
        assertOperationSaveAllowed({
          ...context,
          input: edit,
          existing: { ...existing, status },
          currentSeason: season,
        }),
      ).toThrow("수정할 수 없습니다");
  });

  it("rejects stale edit versions before writing", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, expectedUpdatedAt: now.toISOString() },
        existing,
        currentSeason: season,
      }),
    ).toThrow("다른 관리자");
  });

  it("retains response history and blocks season reassignment even with zero going attendees", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, seasonId: null },
        existing,
        currentSeason: season,
        participantCount: 1,
        goingCount: 0,
      }),
    ).toThrow("참석 응답");
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, seasonId: null },
        existing,
        currentSeason: season,
        targetSeason: null,
      }),
    ).not.toThrow();
  });

  it("keeps capacity at least the count of all stored confirmed attendees", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, capacity: 2 },
        existing,
        currentSeason: season,
        participantCount: 4,
        goingCount: 3,
      }),
    ).toThrow("참가 확정");
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, capacity: 3 },
        existing,
        currentSeason: season,
        participantCount: 4,
        goingCount: 3,
      }),
    ).not.toThrow();
  });

  it("allows cancellation before start but prevents premature completion", () => {
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, status: "CANCELLED" },
        existing,
        currentSeason: season,
      }),
    ).not.toThrow();
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, status: "COMPLETED" },
        existing,
        currentSeason: season,
      }),
    ).toThrow("시작 전");
  });

  it("allows completing a started operation while retaining its original start time", () => {
    const started = new Date("2026-10-05T09:00:00Z");
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, startsAt: started.toISOString(), endsAt: null, status: "COMPLETED" },
        existing: { ...existing, startsAt: started },
        currentSeason: season,
      }),
    ).not.toThrow();
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: { ...edit, startsAt: "2026-10-04T09:00:00Z", endsAt: null, status: "COMPLETED" },
        existing: { ...existing, startsAt: started },
        currentSeason: season,
      }),
    ).toThrow("현재");
  });

  it("blocks edits linked to a closed or missing current season", () => {
    expect(() => assertOperationSaveAllowed({ ...context, input: edit, existing })).toThrow(
      "연결된 시즌",
    );
    expect(() =>
      assertOperationSaveAllowed({
        ...context,
        input: edit,
        existing,
        currentSeason: { ...season, status: "SETTLEMENT" },
      }),
    ).toThrow("정산");
  });
});
