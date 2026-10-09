import { afterEach, describe, expect, it, vi } from "vitest";
import type { SteamNewsItem, SteamPlayerCount } from "@uniz/integrations";

vi.mock("server-only", () => ({}));
vi.mock("@uniz/integrations/server", () => ({
  createLiveSteamAdapter: () => ({ getCurrentPlayers: vi.fn() }),
  createLiveSteamNewsAdapter: () => ({ getNewsForApp: vi.fn() }),
}));

import { createSteamOverviewReader } from "../src/lib/server/steam-overview";

const initialTime = Date.parse("2026-10-08T03:00:00.000Z");
const newsItem: SteamNewsItem = {
  id: "12345",
  appId: 2139460,
  title: "한국어 공식 업데이트",
  summary: "한국어 공식 소식 요약입니다.",
  url: "https://store.steampowered.com/news/app/2139460/view/12345?l=koreana",
  feedLabel: "Community Announcements",
  publishedAt: new Date("2026-10-07T08:00:00.000Z"),
  source: "LIVE",
};

function setup() {
  let clock = initialTime;
  const now = () => new Date(clock);
  const loadNews = vi.fn(async () => [{ ...newsItem }]);
  const loadPlayers = vi.fn(async (): Promise<SteamPlayerCount> => ({
    appId: 2139460,
    count: 12345,
    observedAt: now(),
    source: "LIVE",
  }));
  return {
    reader: createSteamOverviewReader({ loadNews, loadPlayers, now }),
    loadNews,
    loadPlayers,
    advance(ms: number) {
      clock += ms;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("public Steam overview cache", () => {
  it("coalesces simultaneous readers and projects only serializable public fields", async () => {
    const fixture = setup();
    const [a, b, c] = await Promise.all([fixture.reader(), fixture.reader(), fixture.reader()]);
    expect(fixture.loadNews).toHaveBeenCalledTimes(1);
    expect(fixture.loadPlayers).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    expect(a.news.status).toBe("LIVE");
    expect(a.players).toEqual({
      status: "LIVE",
      count: 12345,
      observedAt: "2026-10-08T03:00:00.000Z",
    });
    expect(a.news.items[0].publishedAt).toBe("2026-10-07T08:00:00.000Z");
    expect(Object.keys(a.news.items[0]).sort()).toEqual([
      "id",
      "publishedAt",
      "summary",
      "title",
      "url",
    ]);
    a.news.items[0].title = "Caller changed its own DTO";
    expect((await fixture.reader()).news.items[0].title).toBe("한국어 공식 업데이트");
  });

  it("refreshes players after five minutes and news after fifteen minutes independently", async () => {
    const fixture = setup();
    await fixture.reader();
    fixture.advance(5 * 60_000);
    const afterFive = await fixture.reader();
    expect(fixture.loadPlayers).toHaveBeenCalledTimes(2);
    expect(fixture.loadNews).toHaveBeenCalledTimes(1);
    expect(afterFive.players.observedAt).toBe("2026-10-08T03:05:00.000Z");
    expect(afterFive.news.observedAt).toBe("2026-10-08T03:00:00.000Z");
    fixture.advance(10 * 60_000);
    await fixture.reader();
    expect(fixture.loadNews).toHaveBeenCalledTimes(2);
    expect(fixture.loadPlayers).toHaveBeenCalledTimes(3);
  });

  it("keeps last good news when refresh fails, backs off, and recovers without changing its timestamp", async () => {
    const fixture = setup();
    const original = await fixture.reader();
    fixture.loadNews.mockRejectedValueOnce(new Error("private upstream diagnostics"));
    fixture.advance(15 * 60_000);
    const failed = await fixture.reader();
    expect(failed.news).toEqual({ ...original.news, status: "STALE" });
    expect(failed.players.status).toBe("LIVE");
    expect(JSON.stringify(failed)).not.toContain("diagnostics");
    fixture.advance(30_000);
    expect((await fixture.reader()).news.status).toBe("STALE");
    expect(fixture.loadNews).toHaveBeenCalledTimes(2);
    fixture.advance(30_000);
    const recovered = await fixture.reader();
    expect(recovered.news.status).toBe("LIVE");
    expect(recovered.news.observedAt).toBe("2026-10-08T03:16:00.000Z");
    expect(fixture.loadNews).toHaveBeenCalledTimes(3);
  });

  it("isolates an initial player failure while keeping valid news and never invents a zero", async () => {
    const fixture = setup();
    fixture.loadPlayers.mockRejectedValueOnce(new Error("unavailable"));
    const result = await fixture.reader();
    expect(result.news.status).toBe("LIVE");
    expect(result.players).toEqual({ status: "UNAVAILABLE", count: null, observedAt: null });
    await fixture.reader();
    expect(fixture.loadPlayers).toHaveBeenCalledTimes(1);
  });

  it("keeps valid empty official news and a genuinely observed zero distinct from failure", async () => {
    const fixture = setup();
    fixture.loadNews.mockResolvedValueOnce([]);
    fixture.loadPlayers.mockResolvedValueOnce({
      appId: 2139460,
      count: 0,
      observedAt: new Date(initialTime),
      source: "LIVE",
    });
    const result = await fixture.reader();
    expect(result.news.status).toBe("LIVE");
    expect(result.news.items).toEqual([]);
    expect(result.players.count).toBe(0);
    expect(result.players.status).toBe("LIVE");
  });

  it("rejects mock or mismatched application results from becoming real statistics", async () => {
    const fixture = setup();
    fixture.loadNews.mockResolvedValueOnce([{ ...newsItem, appId: 1 }]);
    fixture.loadPlayers.mockResolvedValueOnce({
      appId: 2139460,
      count: 100,
      observedAt: new Date(initialTime),
      source: "MOCK",
    });
    const result = await fixture.reader();
    expect(result.news.status).toBe("UNAVAILABLE");
    expect(result.news.items).toEqual([]);
    expect(result.players.count).toBeNull();
  });

  it("bounds a hung initial request to four seconds and coalesces failures", async () => {
    vi.useFakeTimers();
    const loadNews = vi.fn(() => new Promise<SteamNewsItem[]>(() => {}));
    const loadPlayers = vi.fn(() => new Promise<SteamPlayerCount>(() => {}));
    const reader = createSteamOverviewReader({
      loadNews,
      loadPlayers,
      deadlineMs: 60_000,
      now: () => new Date(initialTime),
    });
    const pending = Promise.all([reader(), reader()]);
    await vi.advanceTimersByTimeAsync(4_000);
    const result = await pending;
    expect(loadNews).toHaveBeenCalledTimes(1);
    expect(loadPlayers).toHaveBeenCalledTimes(1);
    expect(result[0].news.status).toBe("UNAVAILABLE");
    expect(result[0].players.count).toBeNull();
    expect(result[0]).toEqual(result[1]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
