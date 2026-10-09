import { describe, expect, it } from "vitest";
import {
  communityHref,
  communityPostHref,
  communityReturnFilters,
} from "../src/components/community/presentation";

describe("community board and showcase navigation", () => {
  it("keeps ordinary board filters and administrative category links", () => {
    expect(communityHref({ q: "공략", category: "GUIDE", page: 2 })).toBe(
      "/community?q=%EA%B3%B5%EB%9E%B5&category=GUIDE&page=2",
    );
    expect(communityHref({ category: "SHOWCASE", admin: true })).toBe(
      "/admin/community?category=SHOWCASE",
    );
    expect(communityHref({ section: "BOARD" })).toBe("/community");
  });
  it("normalizes legacy showcase links and keeps paging within the dedicated space", () => {
    const legacy = communityReturnFilters({ q: "집", category: "SHOWCASE", page: "3" });
    expect(communityHref(legacy)).toBe("/community/showcase?q=%EC%A7%91&page=3");
    expect(communityHref({ section: "SHOWCASE", category: "TIP" })).toBe("/community/showcase");
    expect(communityHref({ section: "SHOWCASE", q: "집", page: 2 })).toBe(
      "/community/showcase?q=%EC%A7%91&page=2",
    );
  });
  it("carries showcase context through details, creation and a return to its listing", () => {
    const filters = { section: "SHOWCASE" as const, q: "집", page: 2 };
    const href = communityPostHref("post-id", filters);
    expect(href).toBe("/community/post-id?q=%EC%A7%91&page=2&section=SHOWCASE");
    const query = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(communityHref(communityReturnFilters(query))).toBe(
      "/community/showcase?q=%EC%A7%91&page=2",
    );
    expect(communityPostHref("new", { section: "SHOWCASE" })).toBe(
      "/community/new?section=SHOWCASE",
    );
  });
  it("accepts the first query value and does not interpret unknown sections as showcase", () => {
    expect(communityReturnFilters({ section: ["SHOWCASE", "BOARD"] }).section).toBe("SHOWCASE");
    expect(communityReturnFilters({ section: "BAD" }).section).toBeUndefined();
    expect(communityPostHref("post-id", { section: "BOARD", category: "TIP" })).toBe(
      "/community/post-id?category=TIP",
    );
  });
});
