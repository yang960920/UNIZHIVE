import { describe, expect, it } from "vitest";
import {
  derivePersonalNotifications,
  type NotificationComment,
  type NotificationParty,
  type NotificationSeason,
  type NotificationSources,
  type NotificationVote,
} from "../src/lib/personal-notification-model";
import { DEFAULT_USER_PREFERENCES } from "../src/lib/user-preferences";

const now = new Date("2026-10-08T09:00:00Z");
const before = new Date("2026-10-08T08:00:00Z");
const season: NotificationSeason = {
  id: "season-one",
  name: "우리 시즌",
  status: "ACTIVE",
  approvalStatus: "APPROVED",
  startsAt: new Date("2026-10-01T00:00:00Z"),
  settlementAt: new Date("2026-11-01T00:00:00Z"),
  currentPhaseOrder: 1,
  serverType: "SEASONAL",
  migrationOpen: false,
  trancePhenomenon: "UNKNOWN",
  scenarioSlug: "endless-dream",
  gravityContentEnabled: false,
  myMembership: true,
};
const party: NotificationParty = {
  id: "party-one",
  title: "같이 파밍",
  status: "SCHEDULED",
  contentKey: "farm",
  startsAt: new Date("2026-10-08T09:20:00Z"),
  participation: "GOING",
  participantCreatedAt: new Date("2026-10-07T09:00:00Z"),
  season,
  changeId: "edit-one",
  changedAt: before,
};
const vote: NotificationVote = {
  season,
  closesAt: new Date("2026-10-09T08:00:00Z"),
  hasCandidates: true,
  hasVoted: false,
};
const comment: NotificationComment = {
  id: "comment-one",
  postId: "post-one",
  postTitle: "파밍 질문",
  postOwnerId: "me",
  authorId: "another-member",
  authorName: "동료",
  authorApproved: true,
  createdAt: before,
  hiddenAt: null,
  archivedAt: null,
  postHiddenAt: null,
  postArchivedAt: null,
};
function sources(overrides: Partial<NotificationSources> = {}): NotificationSources {
  return {
    actorId: "me",
    announcements: [
      {
        id: "notice-one",
        title: "하이브 공지",
        publishedAt: before,
        archivedAt: null,
        pinned: false,
      },
    ],
    parties: [party],
    votes: [vote],
    comments: [comment],
    phases: [
      {
        id: "phase-one",
        seasonId: season.id,
        name: "초기",
        order: 1,
        startsAt: null,
        endsAt: null,
      },
    ],
    ...overrides,
  };
}
const derive = (input = sources(), preferences = DEFAULT_USER_PREFERENCES) =>
  derivePersonalNotifications(input, preferences, now);

describe("personal notification preferences and safe summaries", () => {
  it("notifies a parent-comment owner on another member's post with an exact reply target", () => {
    const reply: NotificationComment = {
      ...comment,
      parentId: "parent-one",
      parentOwnerId: "me",
      postOwnerId: "someone-else",
      parentVisible: true,
    };
    const result = derive(sources({ comments: [reply] }));
    const notification = result.items.find((item) => item.id === "comment:comment-one");
    expect(notification?.description).toContain("내 댓글에 답글");
    expect(notification?.href).toBe(
      "/community/post-one?replyRoot=parent-one&replyTarget=comment-one#comment-comment-one",
    );
  });
  it("deduplicates a reply to the post owner's own comment and filters hidden parent threads", () => {
    const reply: NotificationComment = {
      ...comment,
      parentId: "parent-one",
      parentOwnerId: "me",
      parentVisible: true,
    };
    expect(
      derive(sources({ comments: [reply, reply] })).items.filter(
        (item) => item.id === "comment:comment-one",
      ),
    ).toHaveLength(1);
    expect(
      derive(sources({ comments: [{ ...reply, parentVisible: false }] })).items.some(
        (item) => item.kind === "COMMENT",
      ),
    ).toBe(false);
    expect(
      derive(sources({ comments: [reply] }), {
        ...DEFAULT_USER_PREFERENCES,
        notifyComments: false,
      }).items.some((item) => item.kind === "COMMENT"),
    ).toBe(false);
  });
  it("derives the five real on-site event kinds without body, UID, token or unread properties", () => {
    const result = derive();
    expect(new Set(result.items.map((item) => item.kind))).toEqual(
      new Set(["ANNOUNCEMENT", "PARTY_CHANGE", "PARTY_REMINDER", "VOTE_DEADLINE", "COMMENT"]),
    );
    for (const item of result.items)
      expect(
        Object.keys(item).every((key) =>
          ["id", "kind", "title", "description", "href", "occurredAt", "pinned"].includes(key),
        ),
      ).toBe(true);
    expect(result.items.find((item) => item.kind === "PARTY_CHANGE")?.description).toContain(
      "모집 정보",
    );
    expect(result.items.find((item) => item.kind === "COMMENT")?.href).toBe("/community/post-one");
  });
  it.each([
    ["notifyAnnouncements", "ANNOUNCEMENT"],
    ["notifyPartyChanges", "PARTY_CHANGE"],
    ["notifyPartyReminders", "PARTY_REMINDER"],
    ["notifyVoteDeadlines", "VOTE_DEADLINE"],
    ["notifyComments", "COMMENT"],
  ] as const)("honors disabling %s independently", (field, kind) => {
    const result = derive(sources(), { ...DEFAULT_USER_PREFERENCES, [field]: false });
    expect(result.items.some((item) => item.kind === kind)).toBe(false);
    expect(result.enabledKinds).not.toContain(kind);
    expect(result.items).toHaveLength(4);
  });
  it("returns no events when all categories are off", () => {
    expect(
      derive(sources(), {
        ...DEFAULT_USER_PREFERENCES,
        notifyAnnouncements: false,
        notifyPartyChanges: false,
        notifyPartyReminders: false,
        notifyVoteDeadlines: false,
        notifyComments: false,
      }),
    ).toMatchObject({ items: [], enabledKinds: [] });
  });
  it("excludes scheduled and archived announcements", () => {
    const input = sources({
      announcements: [
        {
          ...sources().announcements[0],
          id: "scheduled",
          publishedAt: new Date(now.getTime() + 1),
        },
        { ...sources().announcements[0], id: "archived", archivedAt: before },
      ],
    });
    expect(derive(input).items.some((item) => item.kind === "ANNOUNCEMENT")).toBe(false);
  });
  it("has stable deduplicated IDs and caps the feed by recent chronology", () => {
    const input = sources({
      parties: [party, party],
      comments: Array.from({ length: 50 }, (_, index) => ({ ...comment, id: `comment-${index}` })),
    });
    const first = derive(input);
    const again = derive(input);
    expect(first.items).toHaveLength(30);
    expect(new Set(first.items.map((item) => item.id)).size).toBe(30);
    expect(first.items.map((item) => item.id)).toEqual(again.items.map((item) => item.id));
    expect(
      first.items.every(
        (item, index) => index === 0 || first.items[index - 1].occurredAt >= item.occurredAt,
      ),
    ).toBe(true);
  });
});

describe("my RSVP party changes and reminder eligibility", () => {
  it.each([15, 30, 60] as const)(
    "uses exactly the configured %i minute window",
    (reminderMinutes) => {
      const startsAt = new Date(now.getTime() + reminderMinutes * 60_000);
      const inWindow = derive(sources({ parties: [{ ...party, startsAt }] }), {
        ...DEFAULT_USER_PREFERENCES,
        reminderMinutes,
      });
      const tooEarly = derive(
        sources({ parties: [{ ...party, startsAt: new Date(startsAt.getTime() + 1) }] }),
        { ...DEFAULT_USER_PREFERENCES, reminderMinutes },
      );
      expect(inWindow.items.some((item) => item.kind === "PARTY_REMINDER")).toBe(true);
      expect(tooEarly.items.some((item) => item.kind === "PARTY_REMINDER")).toBe(false);
    },
  );
  it("includes MAYBE with a clear undecided response and excludes UNAVAILABLE", () => {
    const maybe = derive(sources({ parties: [{ ...party, participation: "MAYBE" }] }));
    expect(maybe.items.find((item) => item.kind === "PARTY_REMINDER")?.description).toContain(
      "미정",
    );
    expect(
      derive(sources({ parties: [{ ...party, participation: "UNAVAILABLE" }] })).items.some(
        (item) => item.kind.startsWith("PARTY_"),
      ),
    ).toBe(false);
  });
  it.each(["CANCELLED", "COMPLETED"] as const)("never reminds a %s party", (status) => {
    const result = derive(sources({ parties: [{ ...party, status }] }));
    expect(result.items.some((item) => item.kind === "PARTY_REMINDER")).toBe(false);
    if (status === "CANCELLED")
      expect(result.items.find((item) => item.kind === "PARTY_CHANGE")?.title).toContain("취소");
    else expect(result.items.some((item) => item.kind === "PARTY_CHANGE")).toBe(false);
  });
  it("does not invent changes from the row version or edits predating joining", () => {
    for (const input of [
      { ...party, changeId: null, changedAt: null },
      { ...party, changedAt: party.participantCreatedAt },
      { ...party, changedAt: new Date("2026-09-01T00:00:00Z") },
    ]) {
      expect(
        derive(sources({ parties: [input] })).items.some((item) => item.kind === "PARTY_CHANGE"),
      ).toBe(false);
    }
  });
  it("does not remind at or after start, or for currently unavailable scenario content", () => {
    for (const input of [
      { ...party, startsAt: now },
      { ...party, contentKey: "gravity-condenser" },
      { ...party, contentKey: "endless-deep", season: { ...season, scenarioSlug: "manibus" } },
    ]) {
      expect(
        derive(sources({ parties: [input] })).items.some((item) => item.kind === "PARTY_REMINDER"),
      ).toBe(false);
    }
  });
  it("preserves cancellation notices even if scenario content later becomes unavailable", () => {
    const result = derive(
      sources({ parties: [{ ...party, status: "CANCELLED", contentKey: "gravity-condenser" }] }),
    );
    expect(result.items.find((item) => item.kind === "PARTY_CHANGE")?.title).toContain("취소");
  });
  it("keeps revoked season registration and unapproved seasons outside personal notifications", () => {
    for (const invalid of [
      { ...season, myMembership: false },
      { ...season, approvalStatus: "PENDING" as const },
    ]) {
      expect(
        derive(sources({ parties: [{ ...party, season: invalid }] })).items.some((item) =>
          item.kind.startsWith("PARTY_"),
        ),
      ).toBe(false);
    }
  });
  it("uses phase progression for legacy operations and permits valid common operations", () => {
    expect(
      derive(
        sources({
          parties: [{ ...party, contentKey: null, season: { ...season, currentPhaseOrder: 99 } }],
        }),
      ).items.some((item) => item.kind === "PARTY_REMINDER"),
    ).toBe(false);
    expect(
      derive(sources({ parties: [{ ...party, contentKey: null, season: null }] })).items.some(
        (item) => item.kind === "PARTY_REMINDER",
      ),
    ).toBe(true);
  });
});

describe("current member vote and own visible post comments", () => {
  it("shows only an open, uncast vote in the final 24 hours", () => {
    const excluded: NotificationVote[] = [
      { ...vote, hasVoted: true },
      { ...vote, hasCandidates: false },
      { ...vote, closesAt: now },
      { ...vote, closesAt: new Date(now.getTime() + 24 * 60 * 60_000 + 1) },
      { ...vote, season: { ...season, myMembership: false } },
      { ...vote, season: { ...season, status: "ARCHIVED" } },
      { ...vote, season: { ...season, currentPhaseOrder: 99 } },
    ];
    for (const invalid of excluded)
      expect(
        derive(sources({ votes: [invalid] })).items.some((item) => item.kind === "VOTE_DEADLINE"),
      ).toBe(false);
    expect(derive().items.find((item) => item.kind === "VOTE_DEADLINE")?.href).toBe(
      "/season#scenario-vote",
    );
  });
  it.each(["hiddenAt", "archivedAt", "postHiddenAt", "postArchivedAt"] as const)(
    "never reports comments with %s",
    (field) => {
      expect(
        derive(sources({ comments: [{ ...comment, [field]: before }] })).items.some(
          (item) => item.kind === "COMMENT",
        ),
      ).toBe(false);
    },
  );
  it("excludes self comments, another person's posts, demoted authors, and old/future comments", () => {
    for (const invalid of [
      { ...comment, authorId: "me" },
      { ...comment, postOwnerId: "other" },
      { ...comment, authorApproved: false },
      { ...comment, createdAt: new Date("2026-09-01T00:00:00Z") },
      { ...comment, createdAt: new Date(now.getTime() + 1) },
    ]) {
      expect(
        derive(sources({ comments: [invalid] })).items.some((item) => item.kind === "COMMENT"),
      ).toBe(false);
    }
  });
});
