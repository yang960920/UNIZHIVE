import { describe, expect, it } from "vitest";
import type { SeasonPhase } from "@uniz/domain";
import {
  operationalMutationSchema,
  requireOpenOperation,
  requireOpenSeason,
  requireOpenMigrationSeason,
  requireOpenVote,
  requireOperationalActor,
  selectOperationalAccessMode,
} from "../src/lib/operational-policy";

const now = new Date("2026-10-06T09:00:00Z");
const seasonId = "00000000-0000-4000-8000-000000000001";
const actor = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Member",
  role: "MEMBER" as const,
  isMock: false,
};
const season = {
  id: seasonId,
  status: "ACTIVE" as const,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  settlementAt: new Date("2026-10-30T00:00:00Z"),
};
const phases: SeasonPhase[] = [
  {
    id: "phase",
    seasonId,
    name: "Open",
    order: 1,
    startsAt: season.startsAt,
    endsAt: season.settlementAt,
  },
];
const operation = {
  startsAt: new Date("2026-10-07T00:00:00Z"),
  status: "SCHEDULED" as const,
  capacity: 2,
};

describe("operational page access source", () => {
  it("keeps real auth outages, expired authorization and guild departure out of the public demo", () => {
    expect(selectOperationalAccessMode(null, "UNAVAILABLE")).toBe("ERROR");
    expect(selectOperationalAccessMode(actor, "UNAVAILABLE")).toBe("ERROR");
    expect(selectOperationalAccessMode(null, "REAUTH_REQUIRED")).toBe("REAUTH");
    expect(selectOperationalAccessMode(null, "LEFT")).toBe("LEFT");
    expect(selectOperationalAccessMode({ ...actor, role: "GUEST" }, "LEFT")).toBe("LEFT");
    expect(selectOperationalAccessMode(null, "AUTHENTICATED")).toBe("REAUTH");
  });

  it("reserves the demo for public guests and mock users and shows real nonmembers the joining notice", () => {
    expect(selectOperationalAccessMode(null, "GUEST")).toBe("DEMO");
    expect(selectOperationalAccessMode(null)).toBe("DEMO");
    expect(selectOperationalAccessMode({ ...actor, isMock: true }, "AUTHENTICATED")).toBe("DEMO");
    expect(selectOperationalAccessMode({ ...actor, role: "GUEST" }, "AUTHENTICATED")).toBe(
      "PENDING",
    );
    expect(selectOperationalAccessMode({ ...actor, role: "APPLICANT" }, "AUTHENTICATED")).toBe(
      "PENDING",
    );
    expect(selectOperationalAccessMode(actor, "AUTHENTICATED")).toBe("LIVE");
    expect(selectOperationalAccessMode(actor)).toBe("LIVE");
  });
});

describe("live operating mutation input", () => {
  it("accepts a persisted vote identifier but rejects client supplied actors and permissions", () => {
    const input = { action: "VOTE", seasonId, candidateId: "00000000-0000-4000-8000-000000000003" };
    expect(operationalMutationSchema.safeParse(input).success).toBe(true);
    expect(operationalMutationSchema.safeParse({ ...input, userId: actor.id }).success).toBe(false);
    expect(operationalMutationSchema.safeParse({ ...input, role: "ADMIN" }).success).toBe(false);
    expect(
      operationalMutationSchema.safeParse({ ...input, candidateId: "vote-mock" }).success,
    ).toBe(false);
  });

  it("rejects invalid RSVP and migration states", () => {
    expect(
      operationalMutationSchema.safeParse({
        action: "RSVP",
        operationId: seasonId,
        status: "CONFIRMED",
      }).success,
    ).toBe(false);
    expect(
      operationalMutationSchema.safeParse({ action: "MIGRATION", seasonId, status: "COMPLETE" })
        .success,
    ).toBe(false);
  });
});

describe("server operating permissions", () => {
  it("rejects unauthenticated, mock and pending principals even with a forged administrator role", () => {
    expect(() => requireOperationalActor(null, "VOTE")).toThrow(
      "Discord 멤버 로그인이 필요합니다.",
    );
    expect(() =>
      requireOperationalActor({ ...actor, isMock: true, role: "ADMIN" }, "RSVP"),
    ).toThrow("개발 계정");
    expect(() =>
      requireOperationalActor({ ...actor, id: "demo-admin", role: "ADMIN" }, "MIGRATION"),
    ).toThrow("개발 계정");
    expect(() => requireOperationalActor({ ...actor, role: "APPLICANT" }, "VOTE")).toThrow(
      "승인된",
    );
  });

  it("allows approved roles through the centralized domain permission policy", () => {
    for (const role of ["MEMBER", "OFFICER", "ADMIN"] as const) {
      for (const action of ["RSVP", "MIGRATION", "VOTE"] as const) {
        expect(requireOperationalActor({ ...actor, role }, action).id).toBe(actor.id);
      }
    }
  });
});

describe("season phase and membership decisions", () => {
  const manualPhases: SeasonPhase[] = [1, 2, 3].map((order) => ({
    id: `manual-${order}`,
    seasonId,
    order,
    name: `${order}단계`,
    startsAt: null,
    endsAt: null,
  }));
  const manualSeason = { ...season, approvalStatus: "APPROVED" as const, currentPhaseOrder: 1 };

  it("keeps approved permanent operations open without a scenario phase requirement", () => {
    const permanent = {
      ...manualSeason,
      serverType: "PERMANENT" as const,
      settlementAt: null,
      currentPhaseOrder: 99,
    };
    for (const status of ["ACTIVE", "SETTLEMENT"] as const)
      expect(() => requireOpenSeason({ ...permanent, status }, [], true, now)).not.toThrow();
    for (const status of ["PLANNED", "ARCHIVED"] as const)
      expect(() => requireOpenSeason({ ...permanent, status }, [], true, now)).toThrow("시즌 상태");
    expect(() => requireOpenSeason(permanent, [], false, now)).toThrow("참가 명단");
    for (const approvalStatus of ["PENDING", "REJECTED", undefined] as const)
      expect(() => requireOpenSeason({ ...permanent, approvalStatus }, [], true, now)).toThrow(
        "시즌 상태",
      );
  });

  it("opens permanent migration only through its explicit gate independently of phase history", () => {
    const permanent = {
      ...manualSeason,
      serverType: "PERMANENT" as const,
      settlementAt: null,
    };
    expect(() => requireOpenMigrationSeason(permanent, manualPhases, true, now)).toThrow(
      "영구 서버의 HIVE 이동 신청",
    );
    expect(() =>
      requireOpenMigrationSeason({ ...permanent, currentPhaseOrder: 3 }, manualPhases, true, now),
    ).toThrow("영구 서버의 HIVE 이동 신청");
    const open = { ...permanent, migrationOpen: true };
    for (const status of ["PLANNED", "ACTIVE", "SETTLEMENT"] as const)
      expect(() =>
        requireOpenMigrationSeason({ ...open, status, currentPhaseOrder: 99 }, [], true, now),
      ).not.toThrow();
    expect(() => requireOpenMigrationSeason(open, [], false, now)).toThrow("참가 명단");
    expect(() =>
      requireOpenMigrationSeason({ ...open, status: "ARCHIVED" }, [], true, now),
    ).toThrow("시즌 상태");
    for (const approvalStatus of ["PENDING", "REJECTED", undefined] as const)
      expect(() => requireOpenMigrationSeason({ ...open, approvalStatus }, [], true, now)).toThrow(
        "시즌 상태",
      );
    expect(() =>
      requireOpenMigrationSeason({ ...manualSeason, migrationOpen: true }, manualPhases, true, now),
    ).toThrow("마지막 단계");
  });

  it("keeps manual current phases stable before start and after settlement dates", () => {
    expect(() =>
      requireOpenSeason(manualSeason, manualPhases, true, new Date("2020-01-01T00:00:00Z")),
    ).not.toThrow();
    expect(() =>
      requireOpenSeason(manualSeason, manualPhases, true, new Date("2030-01-01T00:00:00Z")),
    ).not.toThrow();
    expect(() =>
      requireOpenSeason({ ...manualSeason, currentPhaseOrder: 4 }, manualPhases, true, now),
    ).toThrow("진행 중인 시즌 단계");
  });

  it("opens migration on the last manual phase for planned, active and settlement seasons", () => {
    for (const status of ["PLANNED", "ACTIVE", "SETTLEMENT"] as const)
      expect(() =>
        requireOpenMigrationSeason(
          { ...manualSeason, status, currentPhaseOrder: 3 },
          manualPhases,
          true,
          new Date("2030-01-01T00:00:00Z"),
        ),
      ).not.toThrow();
    expect(() => requireOpenMigrationSeason(manualSeason, manualPhases, true, now)).toThrow(
      "마지막 단계",
    );
  });

  it("does not open normal season operations on planned manual seasons", () => {
    expect(() =>
      requireOpenSeason(
        { ...manualSeason, status: "PLANNED", currentPhaseOrder: 3 },
        manualPhases,
        true,
        now,
      ),
    ).toThrow("시즌 상태");
  });

  it("rejects manual migration without approval, participation, valid pointer or an unarchived season", () => {
    const last = { ...manualSeason, currentPhaseOrder: 3 };
    expect(() => requireOpenMigrationSeason(last, manualPhases, false, now)).toThrow("참가 명단");
    expect(() =>
      requireOpenMigrationSeason({ ...last, status: "ARCHIVED" }, manualPhases, true, now),
    ).toThrow("시즌 상태");
    for (const approvalStatus of ["PENDING", "REJECTED"] as const)
      expect(() =>
        requireOpenMigrationSeason({ ...last, approvalStatus }, manualPhases, true, now),
      ).toThrow("시즌 상태");
    expect(() =>
      requireOpenMigrationSeason({ ...last, currentPhaseOrder: 4 }, manualPhases, true, now),
    ).toThrow("진행 중인 시즌 단계");
  });

  it("preserves date-based legacy mock migration checks when no manual pointer exists", () => {
    expect(() => requireOpenMigrationSeason(season, phases, true, now)).not.toThrow();
    expect(() => requireOpenMigrationSeason(season, phases, true, season.settlementAt)).toThrow(
      "시즌 상태",
    );
  });

  it("allows an approved active season without a settlement date while retaining phase bounds", () => {
    const openEnded = { ...season, approvalStatus: "APPROVED" as const, settlementAt: null };
    const continuing = [{ ...phases[0]!, endsAt: null }];
    expect(() => requireOpenSeason(openEnded, continuing, true, season.settlementAt)).not.toThrow();
    expect(() => requireOpenSeason(openEnded, [], true, now)).toThrow("진행 중인 시즌 단계");
  });

  it("rejects pending and rejected seasons even when their status and dates look open", () => {
    for (const approvalStatus of ["PENDING", "REJECTED"] as const)
      expect(() => requireOpenSeason({ ...season, approvalStatus }, phases, true, now)).toThrow(
        "시즌 상태",
      );
  });

  it("requires a membership and rejects planned, archived, unstarted or overdue active seasons", () => {
    expect(() => requireOpenSeason(season, phases, false, now)).toThrow("참가 명단");
    for (const status of ["PLANNED", "ARCHIVED"] as const)
      expect(() => requireOpenSeason({ ...season, status }, phases, true, now)).toThrow(
        "시즌 상태",
      );
    expect(() => requireOpenSeason(season, phases, true, new Date("2026-09-30T00:00:00Z"))).toThrow(
      "시즌 상태",
    );
    expect(() => requireOpenSeason(season, phases, true, season.settlementAt)).toThrow("시즌 상태");
  });

  it("handles missing phases, gaps and exclusive end boundaries instead of inventing a phase", () => {
    expect(() => requireOpenSeason(season, [], true, now)).toThrow("진행 중인 시즌 단계");
    const ended = [{ ...phases[0]!, endsAt: now }];
    expect(() => requireOpenSeason(season, ended, true, now)).toThrow("진행 중인 시즌 단계");
    expect(() => requireOpenSeason(season, phases, true, now)).not.toThrow();
  });

  it("allows an explicit settlement phase after the active schedule", () => {
    expect(() =>
      requireOpenSeason(
        { ...season, status: "SETTLEMENT" },
        [{ ...phases[0]!, startsAt: season.settlementAt, endsAt: null }],
        true,
        season.settlementAt,
      ),
    ).not.toThrow();
  });

  it("closes voting exactly at the deadline and rejects a candidate from another season", () => {
    expect(() => requireOpenVote(null, true, now)).toThrow("마감");
    expect(() => requireOpenVote(now, true, now)).toThrow("마감");
    expect(() => requireOpenVote(new Date(now.getTime() + 1), false, now)).toThrow("투표 후보");
    expect(() => requireOpenVote(new Date(now.getTime() + 1), true, now)).not.toThrow();
  });
});

describe("serialized RSVP capacity decisions", () => {
  it("also enforces an existing role assignment capacity while allowing a current Going member to keep it", () => {
    const role = { capacity: 1, goingCount: 1 };
    expect(() => requireOpenOperation(operation, "GOING", 1, "MAYBE", now, role)).toThrow(
      "역할의 정원이 찼습니다",
    );
    expect(() => requireOpenOperation(operation, "GOING", 1, "GOING", now, role)).not.toThrow();
    expect(() => requireOpenOperation(operation, "MAYBE", 1, "MAYBE", now, role)).not.toThrow();
  });
  it("blocks a new Going at capacity while allowing the same member to retain or release a place", () => {
    expect(() => requireOpenOperation(operation, "GOING", 2, null, now)).toThrow("정원이 찼습니다");
    expect(() => requireOpenOperation(operation, "GOING", 2, "GOING", now)).not.toThrow();
    expect(() => requireOpenOperation(operation, "MAYBE", 2, "GOING", now)).not.toThrow();
    expect(() => requireOpenOperation(operation, "UNAVAILABLE", 2, null, now)).not.toThrow();
    expect(() => requireOpenOperation(operation, "GOING", 1, null, now)).not.toThrow();
  });

  it("rejects all changes at the start time and for cancelled or completed operations", () => {
    expect(() => requireOpenOperation(operation, "MAYBE", 0, null, operation.startsAt)).toThrow(
      "작전에는 응답할 수 없습니다",
    );
    for (const status of ["CANCELLED", "COMPLETED"] as const)
      expect(() => requireOpenOperation({ ...operation, status }, "MAYBE", 0, null, now)).toThrow(
        "작전에는 응답할 수 없습니다",
      );
  });
});
