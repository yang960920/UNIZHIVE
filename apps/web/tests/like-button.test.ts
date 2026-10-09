import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/reaction-actions", () => ({ saveReaction: vi.fn() }));
import { LikeButton } from "../src/components/like-button";

describe("shared like control accessibility", () => {
  it("shows a read-only count to readers who cannot react", () => {
    const html = renderToStaticMarkup(
      createElement(LikeButton, {
        kind: "BUILD",
        targetId: "build",
        initialCount: 4,
        canLike: false,
      }),
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="좋아요 4개"');
  });
  it("identifies an existing reaction as a cancellable pressed button", () => {
    const html = renderToStaticMarkup(
      createElement(LikeButton, {
        kind: "COMMUNITY_COMMENT",
        targetId: "comment",
        initialCount: 2,
        initialLiked: true,
        canLike: true,
      }),
    );
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="좋아요 취소 2개"');
    expect(html).toContain('type="button"');
  });
});
