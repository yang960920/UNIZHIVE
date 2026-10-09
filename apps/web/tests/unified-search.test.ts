import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  compactSearchText,
  isSearchMember,
  normalizeSearchQuery,
  searchCategory,
  searchExcerpt,
  searchHref,
  searchMatches,
  searchPage,
  searchPattern,
} from "../src/lib/unified-search";
import { searchStaticContent } from "../src/lib/server/search-static";

describe("unified search input and actual public catalog", () => {
  it("matches attached Korean words, padded input and Unicode compatibility forms", () => {
    expect(normalizeSearchQuery("  빌드\n  연구실  ")).toBe("빌드 연구실");
    expect(searchMatches("빌드연구실", "빌드 연구실")).toBe(true);
    expect(searchMatches(" 닥터 테디 ".trim(), "닥터테디")).toBe(true);
    expect(compactSearchText("ＳＴＥＡＭ 공지")).toBe("steam공지");
    expect(Array.from(normalizeSearchQuery("🐝".repeat(90)))).toHaveLength(80);
  });
  it("keeps SQL wildcards and slash escapes literal and rejects unbounded page/category inputs", () => {
    expect(searchPattern("100%_test\\tag")).toBe("%100\\%\\_test\\\\tag%");
    expect(searchPage("50")).toBe(50);
    expect(searchPage("99")).toBe(50);
    expect(searchPage("99999")).toBe(1);
    expect(searchCategory("__proto__")).toBeNull();
    expect(searchCategory("gear")).toBe("gear");
    expect(searchExcerpt("<b>설명</b>\n 다음")).toBe("설명 다음");
    expect(searchHref("닥터 테디", "farming", 2)).toBe(
      "/search?q=%EB%8B%A5%ED%84%B0+%ED%85%8C%EB%94%94&category=farming&page=2",
    );
  });
  it("finds real game gear and reviewed farming/drop guidance with scenario-scoped links", () => {
    const predator = searchStaticContent("포식자", null);
    expect(predator.some((item) => item.category === "gear" && item.title.includes("포식자"))).toBe(
      true,
    );
    expect(
      predator
        .filter((item) => item.category === "gear")
        .every((item) => item.href.startsWith("/search/items/")),
    ).toBe(true);
    const teddy = searchStaticContent("닥터테디", null);
    expect(
      teddy.some((item) => item.category === "farming" && item.href.includes("target=dr-teddy")),
    ).toBe(true);
    expect(
      teddy.some((item) => item.category === "location" && item.href.includes("location=")),
    ).toBe(true);
    expect(
      searchStaticContent("빌드연구실", null).some(
        (item) => item.category === "menu" && item.href === "/lab",
      ),
    ).toBe(true);
  });
  it("does not treat a demo administrator, applicant or guessed client identity as an approved search actor", () => {
    const user = { id: "real-user", name: "Fixture", role: "ADMIN" as const, isMock: false };
    expect(isSearchMember(user)).toBe(true);
    expect(isSearchMember({ ...user, role: "APPLICANT" })).toBe(false);
    expect(isSearchMember({ ...user, isMock: true })).toBe(false);
    expect(isSearchMember({ ...user, id: "demo-admin" })).toBe(false);
    expect(searchStaticContent("멤버", null).some((item) => item.href === "/members")).toBe(false);
  });
});
