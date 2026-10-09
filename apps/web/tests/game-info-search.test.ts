import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gameInfoCategory, gameInfoHref } from "../src/lib/game-info-examples";
import { getGameInfoRecords } from "../src/lib/server/game-info";
import { searchStaticContent } from "../src/lib/server/search-static";
import { SEARCH_CATEGORIES, searchCategory, searchHref } from "../src/lib/unified-search";

beforeEach(() => vi.stubEnv("GAME_INFO_EXAMPLES", "single"));
afterEach(() => vi.unstubAllEnvs());
const research = (query: string) =>
  searchStaticContent(query, null).filter((item) => item.category === "research");

describe("visible game information in unified search", () => {
  it("finds the single displayed DPS example and clearly separates it from verified measurements", () => {
    const records = getGameInfoRecords();
    expect(records).toHaveLength(1);
    const results = research("DPS");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: records[0].title,
      href: gameInfoHref(records[0]),
      detail: "화면 예시 · 실측 아님 · 미검증",
    });
    expect(results[0].excerpt).toContain("가상 값");
    expect(JSON.stringify(results)).not.toMatch(/COMMUNITY VERIFIED|OFFICIAL|실측 DPS|검증 완료/);
    expect(records[0]).toMatchObject({ exampleOnly: true, verification: "UNVERIFIED" });
  });
  it("searches measurement conditions and evidence instructions that are visible on the record", () => {
    for (const query of ["재장전 포함", "몸통 조준", "측정 오차", "시작 자원"]) {
      expect(research(query).map((item) => item.href)).toEqual([
        gameInfoHref(getGameInfoRecords()[0]),
      ]);
    }
  });
  it("removes example detail results when examples are disabled while keeping the game-info page", () => {
    const href = gameInfoHref(getGameInfoRecords()[0]);
    vi.stubEnv("GAME_INFO_EXAMPLES", "off");
    expect(getGameInfoRecords()).toEqual([]);
    expect(research("DPS")).toEqual([]);
    expect(searchStaticContent("측정 기록 예시", null).some((item) => item.href === href)).toBe(
      false,
    );
    expect(searchStaticContent("게임 정보", null).some((item) => item.href === "/db")).toBe(true);
  });
  it("emits detail links only for currently displayed records rather than empty categories", () => {
    const records = getGameInfoRecords();
    const urls = new Set(records.map(gameInfoHref));
    for (const result of research("측정")) {
      expect(urls.has(result.href)).toBe(true);
      const [, base, category, slug] = result.href.split("/");
      expect(base).toBe("db");
      expect(gameInfoCategory(category)).not.toBeNull();
      expect(
        records.some(
          (record) => record.category === category && record.slug === decodeURIComponent(slug),
        ),
      ).toBe(true);
    }
    expect(research("효과 검증")).toEqual([]);
    expect(research("측정 가이드")).toEqual([]);
    expect(gameInfoCategory("__proto__")).toBeNull();
  });
  it("exposes the new search category through the existing search URL contract", () => {
    expect(SEARCH_CATEGORIES.research).toBe("게임 정보");
    expect(searchCategory("research")).toBe("research");
    expect(searchHref("DPS", "research")).toBe("/search?q=DPS&category=research");
  });
});
