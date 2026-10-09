import { describe, expect, it } from "vitest";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  announcementSaveSchema,
  communityArchiveSchema,
  communityCommentSaveSchema,
  communityDirectorySelection,
  communityModerateSchema,
  communityPage,
  communityPostSaveSchema,
  communitySearchPattern,
  nextCommunityVersion,
  normalizeCommunityQuery,
  requireCommunityActor,
  requireCommunityOwner,
  requireCommunityStaff,
  requireCommunityVersion,
} from "../src/lib/community-policy";
const id = "360fd9fd-7447-4ba9-9d5b-cba957fd3307";
const member = { id, name: "Fixture", role: "MEMBER" as const, isMock: false };
const post = {
  title: "검증 제목",
  body: "내용",
  category: "GENERAL",
  buildVersionId: null,
  isPinned: false,
};
describe("community input and authority policy", () => {
  it("keeps showcase out of the default board even when a non-staff caller requests management", () => {
    expect(communityDirectorySelection({}, false)).toMatchObject({
      section: "BOARD",
      category: null,
      excludeShowcase: true,
    });
    expect(
      communityDirectorySelection({ category: "SHOWCASE", includeModerated: true }, false),
    ).toEqual({
      section: "BOARD",
      category: null,
      includeModerated: false,
      excludeShowcase: true,
    });
    expect(communityDirectorySelection({ section: "UNKNOWN", category: ["TIP"] }, false)).toEqual({
      section: "BOARD",
      category: "TIP",
      includeModerated: false,
      excludeShowcase: true,
    });
  });
  it("restricts an explicit showcase section to its own category", () => {
    expect(communityDirectorySelection({ section: "SHOWCASE", category: "TIP" }, false)).toEqual({
      section: "SHOWCASE",
      category: "SHOWCASE",
      includeModerated: false,
      excludeShowcase: false,
    });
  });
  it("preserves the staff management directory across both board and showcase posts", () => {
    expect(communityDirectorySelection({ includeModerated: true }, true)).toEqual({
      section: "BOARD",
      category: null,
      includeModerated: true,
      excludeShowcase: false,
    });
    expect(
      communityDirectorySelection({ category: "SHOWCASE", includeModerated: true }, true),
    ).toMatchObject({ category: "SHOWCASE", excludeShowcase: false });
  });
  it("accepts showcase posts without requiring images or a linked build", () => {
    expect(COMMUNITY_CATEGORY_LABELS.SHOWCASE).toBe("자랑");
    expect(
      communityPostSaveSchema.safeParse({ ...post, category: "SHOWCASE", body: "자랑할 내용" })
        .success,
    ).toBe(true);
    expect(
      communityPostSaveSchema.safeParse({ ...post, category: "SHOWCASE", body: "x".repeat(20000) })
        .success,
    ).toBe(true);
    for (const category of COMMUNITY_CATEGORIES) {
      expect(
        communityPostSaveSchema.safeParse({
          ...post,
          category,
          buildVersionId: category === "BUILD" ? id : null,
        }).success,
      ).toBe(true);
    }
    expect(communityPostSaveSchema.safeParse({ ...post, category: "UNKNOWN" }).success).toBe(false);
  });
  it("requires immutable build-version links for build posts and rejects author/status injection", () => {
    expect(communityPostSaveSchema.safeParse(post).success).toBe(true);
    expect(communityPostSaveSchema.safeParse({ ...post, category: "BUILD" }).success).toBe(false);
    expect(
      communityPostSaveSchema.safeParse({ ...post, category: "BUILD", buildVersionId: id }).success,
    ).toBe(true);
    expect(communityPostSaveSchema.safeParse({ ...post, authorId: id }).success).toBe(false);
    expect(communityPostSaveSchema.safeParse({ ...post, hiddenAt: null }).success).toBe(false);
  });
  it("requires an expected version for every edit, archive and moderation", () => {
    expect(communityPostSaveSchema.safeParse({ ...post, id }).success).toBe(false);
    expect(communityCommentSaveSchema.safeParse({ postId: id, body: "댓글", id }).success).toBe(
      false,
    );
    expect(communityArchiveSchema.safeParse({ id }).success).toBe(false);
    expect(
      communityModerateSchema.safeParse({
        id,
        expectedUpdatedAt: "2026-10-07T00:00:00Z",
        action: "RESTORE",
      }).success,
    ).toBe(false);
    expect(() =>
      requireCommunityVersion("2026-10-07T00:00:00Z", new Date("2026-10-07T00:00:01Z")),
    ).toThrow();
    expect(nextCommunityVersion(new Date("2100-01-01T00:00:00Z")).getTime()).toBe(
      new Date("2100-01-01T00:00:00Z").getTime() + 1,
    );
  });
  it("rejects mock/unapproved actors and separates own edits from staff moderation", () => {
    expect(() => requireCommunityActor({ ...member, isMock: true })).toThrow();
    expect(() => requireCommunityActor({ ...member, role: "APPLICANT" })).toThrow();
    expect(() => requireCommunityStaff(member)).toThrow();
    expect(() => requireCommunityOwner(member, "other")).toThrow();
    expect(() => requireCommunityStaff({ ...member, role: "OFFICER" })).not.toThrow();
    expect(() => requireCommunityOwner(member, id)).not.toThrow();
  });
  it("bounds plain text/search/pagination and treats wildcard characters literally", () => {
    expect(communityPostSaveSchema.safeParse({ ...post, body: "x".repeat(20001) }).success).toBe(
      false,
    );
    expect(
      communityCommentSaveSchema.safeParse({ postId: id, body: "x".repeat(4001) }).success,
    ).toBe(false);
    expect(
      announcementSaveSchema.safeParse({
        title: "공지",
        content: "<script>text</script>",
        isPinned: true,
      }).success,
    ).toBe(true);
    expect(normalizeCommunityQuery("  가나다\n  검색  ")).toBe("가나다 검색");
    expect(normalizeCommunityQuery("x".repeat(200)).length).toBe(120);
    expect(communitySearchPattern("100%_\\")).toBe("%100\\%\\_\\\\%");
    expect(communityPage("-1")).toBe(1);
    expect(communityPage("2")).toBe(2);
  });
});
