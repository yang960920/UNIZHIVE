import { describe, expect, it } from "vitest";
import {
  createCommunityPostDraft,
  isCommunityPostDraft,
} from "../src/components/community/post-draft";

describe("community post draft recovery data", () => {
  it("keeps incomplete titles and invalid video input until publication", () => {
    const draft = createCommunityPostDraft(undefined, "SHOWCASE");
    draft.title = "짧";
    draft.youtubeUrl = "아직 입력 중인 링크";
    draft.contentDraft.json = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "사진 설명" }] }],
    };
    expect(isCommunityPostDraft(draft)).toBe(true);
    expect(draft.category).toBe("SHOWCASE");
    expect(draft.expectedUpdatedAt).toBeNull();
  });

  it("preserves the original edit version instead of accepting a newer server version", () => {
    const draft = createCommunityPostDraft(
      {
        id: "f7ac0041-cef4-455a-96c9-9146a2e4eb6f",
        title: "작성하던 공략",
        body: "내용",
        category: "BUILD",
        buildVersionId: "81c43a8e-7b0e-47d6-bfa8-c169c2296a6e",
        isPinned: true,
        updatedAt: "2026-10-12T01:00:00.123Z",
      },
      "GENERAL",
    );
    expect(draft).toMatchObject({
      title: "작성하던 공략",
      category: "BUILD",
      isPinned: true,
      expectedUpdatedAt: "2026-10-12T01:00:00.123Z",
    });
    expect(isCommunityPostDraft(draft)).toBe(true);
    expect(draft.contentDraft.json.content?.[0].content?.[0].text).toBe("내용");
  });

  it("rejects malformed persisted payloads while allowing text over the publish limit for repair", () => {
    const draft = createCommunityPostDraft(undefined, "GENERAL");
    expect(isCommunityPostDraft({ ...draft, category: "ADMIN" })).toBe(false);
    expect(isCommunityPostDraft({ ...draft, expectedUpdatedAt: 123 })).toBe(false);
    expect(isCommunityPostDraft({ ...draft, contentDraft: { json: "<script>", images: [] } })).toBe(
      false,
    );
    expect(isCommunityPostDraft({ ...draft, bodyDocument: { type: "script" } })).toBe(false);
    expect(isCommunityPostDraft({ ...draft, body: "x".repeat(20_001) })).toBe(true);
  });
});
