import { describe, expect, it } from "vitest";
import {
  changeSeasonVote,
  getCurrentSeasonPhase,
  getSeasonPhases,
  getScenarioSeasonPhases,
  getScenarioPhaseTemplate,
  isFinalSeasonPhase,
  summarizeMigration,
  summarizeSeasonVotes,
  toPublicMemberProfile,
  type ChangeVoteInput,
  type MemberProfile,
  type MigrationStatus,
  type SeasonMembership,
  type SeasonPhase,
  type SeasonVote,
  type SeasonVoteCandidate,
} from "../src";

const createdAt = new Date("2026-10-01T00:00:00Z");
const now = new Date("2026-10-06T12:00:00Z");
const closesAt = new Date("2026-10-07T12:00:00Z");
const candidates: SeasonVoteCandidate[] = [
  {
    id: "a",
    seasonId: "season",
    scenarioId: "scenario-a",
    label: "A",
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "b",
    seasonId: "season",
    scenarioId: "scenario-b",
    label: "B",
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "foreign",
    seasonId: "history",
    scenarioId: "scenario-c",
    label: "C",
    createdAt,
    updatedAt: createdAt,
  },
];
const memberships = [{ seasonId: "season", userId: "member" }];
const input: ChangeVoteInput = {
  seasonId: "season",
  userId: "member",
  candidateId: "a",
  voteId: "vote",
  closesAt,
  now,
};
const vote = (candidateId: string, userId = "member", updatedAt = createdAt): SeasonVote => ({
  id: `vote-${userId}-${candidateId}`,
  seasonId: "season",
  userId,
  candidateId,
  createdAt,
  updatedAt,
});

describe("season migration", () => {
  function member(status: MigrationStatus, seasonId = "season"): SeasonMembership {
    return {
      id: status,
      seasonId,
      userId: status,
      migrationStatus: status,
      joinedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
  }

  it("returns zero readiness for an empty board without NaN", () => {
    expect(summarizeMigration([])).toEqual({
      total: 0,
      ready: 0,
      readinessPercent: 0,
      counts: { UNDECIDED: 0, JOINING: 0, PRE_REGISTERED: 0, READY: 0, MIGRATED: 0 },
    });
  });

  it("excludes removed participants from current readiness without deleting their history", () => {
    const removed = { ...member("READY"), removedAt: now };
    expect(summarizeMigration([removed, member("JOINING")], "season")).toMatchObject({
      total: 1,
      ready: 0,
      counts: { READY: 0, JOINING: 1 },
    });
    expect(removed.migrationStatus).toBe("READY");
  });

  it("counts ready and migrated members and excludes other seasons", () => {
    const board = [
      member("UNDECIDED"),
      member("JOINING"),
      member("PRE_REGISTERED"),
      member("READY"),
      member("MIGRATED"),
      member("READY", "history"),
    ];
    expect(summarizeMigration(board, "season")).toMatchObject({
      total: 5,
      ready: 2,
      readinessPercent: 40,
    });
    expect(summarizeMigration(board, "missing").readinessPercent).toBe(0);
  });
});

describe("dynamic phase schedule", () => {
  const phases: SeasonPhase[] = Array.from({ length: 9 }, (_, index) => ({
    id: `phase-${index + 1}`,
    seasonId: "season",
    name: `Phase ${index + 1}`,
    order: index + 1,
    startsAt: new Date(Date.UTC(2026, 9, index + 1)),
    endsAt: new Date(Date.UTC(2026, 9, index + 2)),
  }));

  it("supports arbitrary phase counts and does not mutate input sorting", () => {
    const reversed = [...phases].reverse();
    expect(getSeasonPhases(reversed, "season").map((phase) => phase.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(reversed[0].order).toBe(9);
    expect(getSeasonPhases(phases.slice(0, 2), "season")).toHaveLength(2);
  });

  it("treats phase ends as exclusive and returns null outside the schedule", () => {
    expect(getCurrentSeasonPhase(phases, "season", new Date("2026-10-02T00:00:00Z"))?.id).toBe(
      "phase-2",
    );
    expect(getCurrentSeasonPhase(phases, "season", new Date("2026-10-10T00:00:00Z"))).toBeNull();
    expect(getCurrentSeasonPhase(phases, "other", now)).toBeNull();
    expect(
      getCurrentSeasonPhase(
        [{ id: "undated", seasonId: "season", name: "Undated", order: 1 }],
        "season",
        now,
      ),
    ).toBeNull();
  });

  it("uses stored manual order irrespective of future, expired or absent phase dates", () => {
    for (const clock of [new Date("2020-01-01T00:00:00Z"), new Date("2030-01-01T00:00:00Z")]) {
      expect(getCurrentSeasonPhase(phases, "season", clock, 3)?.id).toBe("phase-3");
      expect(
        getCurrentSeasonPhase(
          phases.map((phase) => ({ ...phase, startsAt: null, endsAt: null })),
          "season",
          clock,
          3,
        )?.id,
      ).toBe("phase-3");
    }
    for (const order of [0, -1, 1.5, 10])
      expect(getCurrentSeasonPhase(phases, "season", now, order)).toBeNull();
  });

  it("ignores extra legacy rows for a fixed scenario without deleting their metadata", () => {
    const fixed = getScenarioSeasonPhases(phases, "season", "the-way-of-winter");
    expect(fixed.map((phase) => phase.order)).toEqual([1, 2, 3, 4]);
    expect(fixed[0]).toBe(phases[0]);
    expect(phases).toHaveLength(9);
    expect(getScenarioSeasonPhases(phases, "season", "historical-custom")).toHaveLength(9);
    expect(isFinalSeasonPhase(fixed, "season", 4)).toBe(true);
    expect(isFinalSeasonPhase(fixed, "season", 3)).toBe(false);
    expect(isFinalSeasonPhase(fixed, "season", 9)).toBe(false);
    expect(isFinalSeasonPhase([], "season", 1)).toBe(false);
  });
});

describe("supplied scenario phase templates", () => {
  it("returns the fixed names and counts for all four canonical scenarios", () => {
    expect(getScenarioPhaseTemplate("deviation")).toEqual(["1단계", "2단계", "3단계"]);
    expect(getScenarioPhaseTemplate("manibus")).toEqual([
      "공중의 그림자",
      "스타로이드 제어",
      "스타더스트의 포효",
      "터치 오브 스카이",
      "새로운 새벽",
    ]);
    expect(getScenarioPhaseTemplate("the-way-of-winter")).toEqual([
      "얼어붙은 땅",
      "하늘을 메우는 불씨",
      "꺼지지 않는 불씨",
      "동틀 무렵",
    ]);
    expect(getScenarioPhaseTemplate("endless-dream")).toEqual([
      "악몽의 부상",
      "이상한 꿈의 확산",
      "불길한 징조의 침식",
      "현실과 허상의 교차",
      "끝없는 어둠",
      "무한한 꿈",
    ]);
  });

  it("does not fabricate a template for an unknown or inherited-object key", () => {
    expect(getScenarioPhaseTemplate("historical-custom")).toBeNull();
    expect(getScenarioPhaseTemplate("constructor")).toBeNull();
    expect(getScenarioPhaseTemplate("__proto__")).toBeNull();
  });
});

describe("season voting", () => {
  it("does not accept a vote from a removed participant but retains previous ballots", () => {
    const history = [vote("a")];
    expect(
      changeSeasonVote(history, candidates, [{ ...memberships[0]!, removedAt: now }], input),
    ).toEqual({ ok: false, reason: "NOT_A_SEASON_MEMBER" });
    expect(history).toHaveLength(1);
    expect(history[0]!.candidateId).toBe("a");
  });

  it("returns zero totals for every candidate when there are no votes", () => {
    expect(summarizeSeasonVotes(candidates, [], "season")).toEqual([
      { candidateId: "a", votes: 0, percent: 0 },
      { candidateId: "b", votes: 0, percent: 0 },
    ]);
  });

  it("deduplicates stale choices and ignores unknown or foreign candidates", () => {
    const votes = [
      vote("a"),
      vote("b", "member", now),
      vote("a", "member-2"),
      vote("foreign", "member-3"),
      vote("missing", "member-4"),
    ];
    expect(summarizeSeasonVotes(candidates, votes, "season")).toEqual([
      { candidateId: "a", votes: 1, percent: 50 },
      { candidateId: "b", votes: 1, percent: 50 },
    ]);
  });

  it("creates a vote and changes choice without adding a second voter", () => {
    const created = changeSeasonVote([], candidates, memberships, input);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("Expected successful vote");
    const oldVote = created.votes[0];
    const changed = changeSeasonVote(created.votes, candidates, memberships, {
      ...input,
      candidateId: "b",
      voteId: "new-id",
      now: new Date(now.getTime() + 1000),
    });
    if (!changed.ok) throw new Error("Expected successful changed vote");
    expect(changed.votes).toHaveLength(1);
    expect(changed.votes[0]).toMatchObject({ id: "vote", candidateId: "b", createdAt: now });
    expect(oldVote.candidateId).toBe("a");
  });

  it("preserves other users and other season history during a change", () => {
    const historical = { ...vote("foreign"), id: "historical", seasonId: "history" };
    const unrelated = vote("b", "member-2");
    const changed = changeSeasonVote([vote("a"), historical, unrelated], candidates, memberships, {
      ...input,
      candidateId: "b",
    });
    if (!changed.ok) throw new Error("Expected successful changed vote");
    expect(changed.votes).toContain(historical);
    expect(changed.votes).toContain(unrelated);
    expect(
      changed.votes.filter((item) => item.seasonId === "season" && item.userId === "member"),
    ).toHaveLength(1);
  });

  it("rejects voting exactly at and after the deadline", () => {
    expect(changeSeasonVote([], candidates, memberships, { ...input, now: closesAt })).toEqual({
      ok: false,
      reason: "VOTE_CLOSED",
    });
    expect(
      changeSeasonVote([], candidates, memberships, {
        ...input,
        now: new Date(closesAt.getTime() + 1),
      }),
    ).toEqual({ ok: false, reason: "VOTE_CLOSED" });
  });

  it("rejects unknown candidates and candidates from another season", () => {
    for (const candidateId of ["missing", "foreign"]) {
      expect(changeSeasonVote([], candidates, memberships, { ...input, candidateId })).toEqual({
        ok: false,
        reason: "INVALID_CANDIDATE",
      });
    }
  });

  it("requires a membership in the season being voted on", () => {
    expect(
      changeSeasonVote([], candidates, [{ seasonId: "history", userId: "member" }], input),
    ).toEqual({ ok: false, reason: "NOT_A_SEASON_MEMBER" });
    expect(changeSeasonVote([], candidates, memberships, { ...input, userId: "outsider" })).toEqual(
      { ok: false, reason: "NOT_A_SEASON_MEMBER" },
    );
  });
});

it("omits private Once Human UID from public profiles", () => {
  const profile: MemberProfile = {
    id: "profile",
    userId: "member",
    handle: "uniz-member",
    displayName: "Member",
    onceHumanNickname: "Member",
    onceHumanUid: "private-uid",
    bio: null,
    joinedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  expect(toPublicMemberProfile(profile)).not.toHaveProperty("onceHumanUid");
  expect(profile.onceHumanUid).toBe("private-uid");
});
