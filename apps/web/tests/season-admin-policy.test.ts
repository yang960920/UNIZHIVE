import { describe, expect, it } from "vitest";
import {
  assertPhaseEdit,
  assertPhaseSchedules,
  assertSeasonIdentity,
  assertSeasonLifecycle,
  assertSeasonMutable,
  assertSeasonSchedule,
  assertSeasonVersion,
  nextSeasonVersion,
  nextSeasonPhaseOrder,
  requireSeasonAdministrator,
  requireSeasonMember,
  seasonAdministrationErrors,
  seasonAdministrationSchema,
  type PhaseSchedule,
  type SeasonSchedule,
} from "../src/lib/season-admin-policy";
import type { CurrentUser } from "../src/lib/auth-policy";

const now = new Date("2026-10-06T06:00:00.000Z");
const start = new Date("2026-10-01T00:00:00.000Z");
const end = new Date("2026-11-01T00:00:00.000Z");
const schedule: SeasonSchedule = { startsAt: start, settlementAt: end, voteClosesAt: null };
const phase: PhaseSchedule = { id: "phase", order: 1, startsAt: start, endsAt: end };
const actor: CurrentUser = {
  id: "fc6c37d7-3518-4ba9-80a3-64873d5309c1",
  name: "운영진",
  role: "OFFICER",
  isMock: false,
};
const scenarioId = "c2ec358b-ab2b-4d84-a395-91f36389a6da";
const serverId = "e5ea3142-6f2a-4de3-a771-bd814231d977";
const draft = {
  action: "SAVE_SEASON",
  seasonNumber: 1,
  name: "첫 시즌",
  scenarioId,
  serverId,
  status: "PLANNED",
  startsAt: start.toISOString(),
  settlementAt: end.toISOString(),
  voteClosesAt: null,
};
const voteOptions = { candidateCount: 2, previousVoteClosesAt: null, now };
const lifecycleOptions = { otherCurrentSeason: false, scheduledOperations: false, now };

describe("season administrator boundary", () => {
  it("permits approved members to submit requests without granting administration", () => {
    expect(requireSeasonMember({ ...actor, role: "MEMBER" })).toMatchObject({ role: "MEMBER" });
    expect(() => requireSeasonMember({ ...actor, role: "APPLICANT" })).toThrow(
      seasonAdministrationErrors.FORBIDDEN,
    );
    expect(() => requireSeasonMember({ ...actor, isMock: true })).toThrow(
      seasonAdministrationErrors.MOCK_ACTOR,
    );
  });
  it("accepts live officers and administrators, rejects member-level identities", () => {
    expect(requireSeasonAdministrator(actor)).toEqual(actor);
    expect(requireSeasonAdministrator({ ...actor, role: "ADMIN" })).toBeTruthy();
    for (const role of ["MEMBER", "APPLICANT", "GUEST"] as const)
      expect(() => requireSeasonAdministrator({ ...actor, role })).toThrow(
        seasonAdministrationErrors.FORBIDDEN,
      );
    expect(() => requireSeasonAdministrator(null)).toThrow(
      seasonAdministrationErrors.UNAUTHENTICATED,
    );
  });

  it("rejects development identities even when their role is ADMIN", () => {
    expect(() => requireSeasonAdministrator({ ...actor, role: "ADMIN", isMock: true })).toThrow(
      seasonAdministrationErrors.MOCK_ACTOR,
    );
    expect(() => requireSeasonAdministrator({ ...actor, id: "demo-admin" })).toThrow(
      seasonAdministrationErrors.MOCK_ACTOR,
    );
  });

  it("accepts only the documented action fields and requires an edit version", () => {
    expect(seasonAdministrationSchema.safeParse(draft).success).toBe(true);
    expect(seasonAdministrationSchema.safeParse({ ...draft, role: "ADMIN" }).success).toBe(false);
    expect(seasonAdministrationSchema.safeParse({ ...draft, id: actor.id }).success).toBe(false);
    expect(
      seasonAdministrationSchema.safeParse({ ...draft, expectedUpdatedAt: now.toISOString() })
        .success,
    ).toBe(false);
    expect(
      seasonAdministrationSchema.safeParse({
        ...draft,
        id: actor.id,
        expectedUpdatedAt: now.toISOString(),
      }).success,
    ).toBe(true);
  });

  it("rejects malformed catalog slugs, duplicate enrollments, and floating dates", () => {
    expect(
      seasonAdministrationSchema.safeParse({
        action: "CREATE_SCENARIO",
        slug: "../../oops",
        name: "기록",
      }).success,
    ).toBe(false);
    expect(
      seasonAdministrationSchema.safeParse({
        action: "ENROL_MEMBERS",
        seasonId: scenarioId,
        userIds: [actor.id, actor.id],
      }).success,
    ).toBe(false);
    expect(
      seasonAdministrationSchema.safeParse({ ...draft, startsAt: "2026-10-01T09:00:00" }).success,
    ).toBe(false);
  });

  it("detects optimistic conflicts and generates a strictly newer version", () => {
    expect(() => assertSeasonVersion(now.toISOString(), now)).not.toThrow();
    expect(() => assertSeasonVersion(start.toISOString(), now)).toThrow(
      seasonAdministrationErrors.CONFLICT,
    );
    expect(() => assertSeasonVersion(undefined, now)).toThrow(seasonAdministrationErrors.CONFLICT);
    expect(nextSeasonVersion(now, start).getTime()).toBe(now.getTime() + 1);
  });
});

describe("season lifecycle and historical identity", () => {
  it("activates permanent servers without phases and archives them without a settlement step", () => {
    const permanentSchedule = { ...schedule, settlementAt: null };
    const options = { ...lifecycleOptions, serverType: "PERMANENT" as const };
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", permanentSchedule, [], options),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "ARCHIVED", permanentSchedule, [], options),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle("SETTLEMENT", "ARCHIVED", permanentSchedule, [], options),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "ARCHIVED", permanentSchedule, [], {
        ...options,
        scheduledOperations: true,
      }),
    ).toThrow(seasonAdministrationErrors.OPERATIONS_OPEN);
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "ARCHIVED", permanentSchedule, [phase], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.LIFECYCLE);
  });
  it("rejects permanent settlement dates while retaining activation schedule and archive boundaries", () => {
    const options = { ...lifecycleOptions, serverType: "PERMANENT" as const };
    const permanentSchedule = { ...schedule, settlementAt: null };
    expect(() => assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, [], options)).toThrow(
      seasonAdministrationErrors.PERMANENT_SETTLEMENT,
    );
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", permanentSchedule, [], {
        ...options,
        now: new Date(start.getTime() - 1),
      }),
    ).toThrow(seasonAdministrationErrors.ACTIVATION);
    expect(() =>
      assertSeasonLifecycle("ARCHIVED", "ACTIVE", permanentSchedule, [], options),
    ).toThrow(seasonAdministrationErrors.ARCHIVED);
  });
  it("uses the stored phase selection without requiring manual phase calendar dates", () => {
    const phases = [{ ...phase, startsAt: null, endsAt: null }];
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, phases, {
        ...lifecycleOptions,
        currentPhaseOrder: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, phases, {
        ...lifecycleOptions,
        currentPhaseOrder: 2,
      }),
    ).toThrow(seasonAdministrationErrors.ACTIVATION);
  });
  it("allows metadata updates after an active phase ends without bypassing activation transitions", () => {
    const options = { ...lifecycleOptions, now: end, allowExistingStatusMetadata: true };
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "ACTIVE", schedule, [phase], options),
    ).not.toThrow();
    expect(() => assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, [phase], options)).toThrow(
      seasonAdministrationErrors.ACTIVATION,
    );
  });
  it("activates an open-ended season, but requires a settlement date before settlement", () => {
    const open = { ...schedule, settlementAt: null };
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", open, [phase], lifecycleOptions),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "SETTLEMENT", open, [phase], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.DATES);
  });
  it("permits archived metadata saves while keeping archived status terminal", () => {
    const options = { ...lifecycleOptions, allowArchivedMetadata: true };
    expect(() =>
      assertSeasonLifecycle("ARCHIVED", "ARCHIVED", schedule, [phase], options),
    ).not.toThrow();
    expect(() => assertSeasonLifecycle("ARCHIVED", "ACTIVE", schedule, [phase], options)).toThrow(
      seasonAdministrationErrors.ARCHIVED,
    );
  });
  it("creates only PLANNED and follows each lifecycle step in order", () => {
    expect(() =>
      assertSeasonLifecycle(null, "PLANNED", schedule, [], lifecycleOptions),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle(null, "ACTIVE", schedule, [phase], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.LIFECYCLE);
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ARCHIVED", schedule, [phase], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.LIFECYCLE);
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "PLANNED", schedule, [phase], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.LIFECYCLE);
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "SETTLEMENT", schedule, [phase], lifecycleOptions),
    ).not.toThrow();
    expect(() =>
      assertSeasonLifecycle("SETTLEMENT", "ARCHIVED", schedule, [phase], lifecycleOptions),
    ).not.toThrow();
  });

  it("requires activation to have a current dated phase inside the season", () => {
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, [], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.ACTIVATION);
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, [phase], {
        ...lifecycleOptions,
        now: end,
      }),
    ).toThrow(seasonAdministrationErrors.ACTIVATION);
    expect(() =>
      assertSeasonLifecycle(
        "PLANNED",
        "ACTIVE",
        schedule,
        [{ ...phase, startsAt: null, endsAt: null }],
        lifecycleOptions,
      ),
    ).toThrow(seasonAdministrationErrors.ACTIVATION);
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, [phase], lifecycleOptions),
    ).not.toThrow();
  });

  it("blocks a second current season and requires operation resolution before closing", () => {
    expect(() =>
      assertSeasonLifecycle("PLANNED", "ACTIVE", schedule, [phase], {
        ...lifecycleOptions,
        otherCurrentSeason: true,
      }),
    ).toThrow(seasonAdministrationErrors.ACTIVE_EXISTS);
    expect(() =>
      assertSeasonLifecycle("ACTIVE", "SETTLEMENT", schedule, [phase], {
        ...lifecycleOptions,
        scheduledOperations: true,
      }),
    ).toThrow(seasonAdministrationErrors.OPERATIONS_OPEN);
    expect(() =>
      assertSeasonLifecycle("SETTLEMENT", "ARCHIVED", schedule, [phase], {
        ...lifecycleOptions,
        scheduledOperations: true,
      }),
    ).toThrow(seasonAdministrationErrors.OPERATIONS_OPEN);
  });

  it("treats archived season records as terminal", () => {
    expect(() => assertSeasonMutable("ARCHIVED")).toThrow(seasonAdministrationErrors.ARCHIVED);
    expect(() =>
      assertSeasonLifecycle("ARCHIVED", "ARCHIVED", schedule, [phase], lifecycleOptions),
    ).toThrow(seasonAdministrationErrors.ARCHIVED);
  });

  it("preserves identity after enrollment or launch while allowing unused planned edits", () => {
    const previous = { seasonNumber: 1, scenarioId, serverId, status: "PLANNED" as const };
    expect(() =>
      assertSeasonIdentity(previous, { ...previous, seasonNumber: 2 }, false),
    ).not.toThrow();
    expect(() => assertSeasonIdentity(previous, { ...previous, seasonNumber: 2 }, true)).toThrow(
      seasonAdministrationErrors.IDENTITY_LOCKED,
    );
    expect(() =>
      assertSeasonIdentity(
        { ...previous, status: "ACTIVE" },
        { ...previous, serverId: actor.id },
        false,
      ),
    ).toThrow(seasonAdministrationErrors.IDENTITY_LOCKED);
    expect(() => assertSeasonIdentity(previous, previous, true)).not.toThrow();
  });
});

describe("manual season phase movement", () => {
  const phases = [{ order: 1 }, { order: 2 }, { order: 3 }];
  it("moves exactly one step forward or backward", () => {
    expect(nextSeasonPhaseOrder(1, phases, "NEXT")).toBe(2);
    expect(nextSeasonPhaseOrder(3, phases, "PREVIOUS")).toBe(2);
  });
  it("rejects first/last boundaries, invalid selections and gaps", () => {
    for (const [current, direction] of [
      [1, "PREVIOUS"],
      [3, "NEXT"],
      [0, "NEXT"],
      [4, "PREVIOUS"],
      [1.5, "NEXT"],
    ] as const)
      expect(() => nextSeasonPhaseOrder(current, phases, direction)).toThrow(
        seasonAdministrationErrors.PHASE_BOUNDS,
      );
    expect(() => nextSeasonPhaseOrder(1, [{ order: 1 }, { order: 3 }], "NEXT")).toThrow(
      seasonAdministrationErrors.PHASE_BOUNDS,
    );
  });
  it("requires an optimistic version and rejects client-supplied phase numbers", () => {
    const input = {
      action: "CHANGE_SEASON_PHASE",
      seasonId: actor.id,
      expectedUpdatedAt: now.toISOString(),
      direction: "NEXT",
    };
    expect(seasonAdministrationSchema.safeParse(input).success).toBe(true);
    expect(
      seasonAdministrationSchema.safeParse({ ...input, expectedUpdatedAt: undefined }).success,
    ).toBe(false);
    expect(seasonAdministrationSchema.safeParse({ ...input, currentPhaseOrder: 3 }).success).toBe(
      false,
    );
    expect(seasonAdministrationSchema.safeParse({ ...input, direction: "FIRST" }).success).toBe(
      false,
    );
  });
});

describe("season and phase schedules", () => {
  it("allows open-ended calendars while preserving existing lower history bounds", () => {
    const open = { ...schedule, settlementAt: null };
    expect(() =>
      assertSeasonSchedule(
        open,
        [{ ...phase, endsAt: new Date("2027-01-01T00:00:00Z") }],
        [{ startsAt: now, endsAt: new Date("2027-02-01T00:00:00Z"), status: "COMPLETED" }],
        [],
        voteOptions,
      ),
    ).not.toThrow();
    expect(() =>
      assertSeasonSchedule({ ...open, startsAt: now }, [phase], [], [], voteOptions),
    ).toThrow(seasonAdministrationErrors.PHASE_DATES);
  });
  it("requires ordered season dates and paired phase dates within the season", () => {
    expect(() =>
      assertSeasonSchedule({ ...schedule, settlementAt: start }, [], [], [], voteOptions),
    ).toThrow(seasonAdministrationErrors.DATES);
    expect(() => assertPhaseSchedules(schedule, [{ ...phase, endsAt: null }])).toThrow(
      seasonAdministrationErrors.PHASE_DATES,
    );
    expect(() =>
      assertPhaseSchedules(schedule, [{ ...phase, startsAt: new Date("2026-09-30T00:00:00Z") }]),
    ).toThrow(seasonAdministrationErrors.PHASE_DATES);
    expect(() => assertPhaseSchedules(schedule, [{ ...phase, endsAt: start }])).toThrow(
      seasonAdministrationErrors.PHASE_DATES,
    );
    expect(() =>
      assertPhaseSchedules(schedule, [{ ...phase, startsAt: null, endsAt: null }]),
    ).not.toThrow();
  });

  it("accepts adjacent phases without imposing a fixed count", () => {
    const middle = new Date("2026-10-15T00:00:00Z");
    expect(() => assertPhaseSchedules(schedule, [phase])).not.toThrow();
    expect(() =>
      assertPhaseSchedules(schedule, [
        { ...phase, endsAt: middle },
        { ...phase, id: "second", order: 2, startsAt: middle },
      ]),
    ).not.toThrow();
  });

  it("rejects phase overlap, duplicate order, and reversed chronological order", () => {
    const middle = new Date("2026-10-15T00:00:00Z");
    expect(() =>
      assertPhaseSchedules(schedule, [phase, { ...phase, id: "second", order: 2 }]),
    ).toThrow(seasonAdministrationErrors.PHASE_OVERLAP);
    expect(() => assertPhaseSchedules(schedule, [phase, { ...phase, id: "second" }])).toThrow(
      seasonAdministrationErrors.PHASE_OVERLAP,
    );
    expect(() =>
      assertPhaseSchedules(schedule, [
        { ...phase, startsAt: middle },
        { ...phase, id: "second", order: 2, endsAt: middle },
      ]),
    ).toThrow(seasonAdministrationErrors.PHASE_OVERLAP);
  });

  it("protects the start/order and full existing duration of a begun phase", () => {
    expect(() => assertPhaseEdit(phase, { ...phase, order: 2 }, now)).toThrow(
      seasonAdministrationErrors.PHASE_STARTED,
    );
    expect(() => assertPhaseEdit(phase, { ...phase, startsAt: now }, now)).toThrow(
      seasonAdministrationErrors.PHASE_STARTED,
    );
    expect(() =>
      assertPhaseEdit(phase, { ...phase, endsAt: new Date("2026-10-07T00:00:00Z") }, now),
    ).toThrow(seasonAdministrationErrors.PHASE_STARTED);
    expect(() => assertPhaseEdit(phase, phase, now)).not.toThrow();
    expect(() =>
      assertPhaseEdit(
        { ...phase, startsAt: new Date("2026-10-07T00:00:00Z") },
        { ...phase, order: 2 },
        now,
      ),
    ).not.toThrow();
  });

  it("prevents season boundary edits from excluding any persisted operation history", () => {
    expect(() =>
      assertSeasonSchedule(
        schedule,
        [],
        [{ startsAt: new Date("2026-09-30T00:00:00Z"), endsAt: null, status: "COMPLETED" }],
        [],
        voteOptions,
      ),
    ).toThrow(seasonAdministrationErrors.HISTORY_DATES);
    expect(() =>
      assertSeasonSchedule(
        schedule,
        [],
        [{ startsAt: now, endsAt: new Date("2026-11-02T00:00:00Z"), status: "CANCELLED" }],
        [],
        voteOptions,
      ),
    ).toThrow(seasonAdministrationErrors.HISTORY_DATES);
    expect(() =>
      assertSeasonSchedule(
        schedule,
        [phase],
        [{ startsAt: now, endsAt: null, status: "SCHEDULED" }],
        [],
        voteOptions,
      ),
    ).not.toThrow();
  });
});

describe("vote history and opening rules", () => {
  it("requires two scenario candidates and a deadline inside the season", () => {
    expect(() =>
      assertSeasonSchedule({ ...schedule, voteClosesAt: end }, [], [], [], {
        ...voteOptions,
        candidateCount: 1,
      }),
    ).toThrow(seasonAdministrationErrors.VOTE_CANDIDATES);
    expect(() =>
      assertSeasonSchedule({ ...schedule, voteClosesAt: start }, [], [], [], voteOptions),
    ).toThrow(seasonAdministrationErrors.HISTORY_DATES);
    expect(() =>
      assertSeasonSchedule({ ...schedule, voteClosesAt: end }, [], [], [], voteOptions),
    ).not.toThrow();
  });

  it("preserves votes when changing a deadline and rejects deleting their ballot period", () => {
    const previousVoteClosesAt = new Date("2026-10-20T00:00:00Z");
    const options = { ...voteOptions, previousVoteClosesAt };
    expect(() => assertSeasonSchedule(schedule, [], [], [now], options)).toThrow(
      seasonAdministrationErrors.VOTE_HISTORY,
    );
    expect(() =>
      assertSeasonSchedule({ ...schedule, voteClosesAt: now }, [], [], [now], options),
    ).toThrow(seasonAdministrationErrors.VOTE_HISTORY);
    expect(() =>
      assertSeasonSchedule(
        { ...schedule, voteClosesAt: new Date("2026-10-07T00:00:00Z") },
        [],
        [],
        [now],
        options,
      ),
    ).not.toThrow();
  });

  it("cannot reopen an expired vote after ballots exist", () => {
    expect(() =>
      assertSeasonSchedule({ ...schedule, voteClosesAt: end }, [], [], [start], {
        ...voteOptions,
        previousVoteClosesAt: new Date("2026-10-05T00:00:00Z"),
      }),
    ).toThrow(seasonAdministrationErrors.VOTE_HISTORY);
    expect(() =>
      assertSeasonSchedule({ ...schedule, voteClosesAt: end }, [], [], [], {
        ...voteOptions,
        previousVoteClosesAt: new Date("2026-10-05T00:00:00Z"),
      }),
    ).not.toThrow();
  });
});
