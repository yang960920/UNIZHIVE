import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createLiveSteamAdapter } from "../src/steam/live";
import { createLiveSteamNewsAdapter } from "../src/steam/news";
import { ONCE_HUMAN_STEAM_APP_ID } from "../src/steam/types";

const appId = ONCE_HUMAN_STEAM_APP_ID;
const feed = "steam_community_announcements";
const newsId = "1845383656376853";
const announcementId = "719043624313028637";
const proxy = `https://steamstore-a.akamaihd.net/news/externalpost/${feed}/${newsId}`;
const canonical = `https://steamcommunity.com/games/${appId}/announcements/detail/${announcementId}`;
function article(overrides: Record<string, unknown> = {}) {
  return {
    gid: newsId,
    title: "Once Human update",
    url: canonical,
    contents: "A brief official update.",
    date: 1_790_759_783,
    feedname: feed,
    feedlabel: "Community Announcements",
    appid: appId,
    ...overrides,
  };
}
function news(items = [article()], responseAppId = appId) {
  return Response.json({ appnews: { appid: responseAppId, newsitems: items } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live Steam current players", () => {
  it("requests the documented endpoint and preserves an observed zero as live data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ response: { player_count: 0, result: 1 } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await createLiveSteamAdapter().getCurrentPlayers(appId);
    expect(result).toMatchObject({ appId, count: 0, source: "LIVE" });
    expect(result.observedAt).toBeInstanceOf(Date);
    const [requested, options] = fetcher.mock.calls[0];
    expect(requested.href).toBe(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
    );
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 4_294_967_296])(
    "rejects an invalid uint32 app ID %s before requesting",
    async (invalidAppId) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(createLiveSteamAdapter().getCurrentPlayers(invalidAppId)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    { player_count: -1, result: 1 },
    { player_count: 1.5, result: 1 },
    { player_count: "10", result: 1 },
    { player_count: 10, result: 0 },
    { player_count: 4_294_967_296, result: 1 },
    { player_count: 10, result: 1, appid: 570 },
  ])("rejects malformed or mismatched player counts", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ response })));
    await expect(createLiveSteamAdapter().getCurrentPlayers(appId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("reports service errors without returning a mock count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(createLiveSteamAdapter().getCurrentPlayers(appId)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 503,
    });
  });

  it("honors a bounded caller timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) =>
            options.signal!.addEventListener("abort", () => reject(options.signal!.reason), {
              once: true,
            }),
          ),
      ),
    );
    await expect(
      createLiveSteamAdapter({ timeoutMs: 20 }).getCurrentPlayers(appId),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("official Steam announcement adapter", () => {
  it("requests only the official feed and returns short plain text with a canonical URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      news([
        article({
          title: "[b]Update[/b] &amp; news <script>alert(1)</script>",
          contents:
            "<script>malicious()</script>[img]unsafe.png[/img]<b>Hello</b> &amp; [url=javascript:bad]world[/url] " +
            "🐝".repeat(400),
        }),
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: newsId,
      appId,
      title: "Update & news",
      url: canonical,
      source: "LIVE",
    });
    expect(items[0].publishedAt).toEqual(new Date(1_790_759_783_000));
    expect(items[0].summary.startsWith("Hello & world ")).toBe(true);
    expect(Array.from(items[0].summary)).toHaveLength(300);
    expect(items[0].summary).not.toMatch(/script|unsafe|javascript|<|\[img\]/i);
    const requested = fetcher.mock.calls[0][0] as URL;
    expect(requested.origin + requested.pathname).toBe(
      "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/",
    );
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      appid: String(appId),
      count: "5",
      maxlength: "300",
      feeds: feed,
    });
    expect(items[0]).not.toHaveProperty("contents");
  });

  it("resolves the separate announcement GID from Steam's redirect without following arbitrary locations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(news([article({ url: proxy.replace("https:", "http:") })]))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: canonical.replace("/games/", "/ogg/") },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId, {
      count: 3,
      maxLength: 200,
    });
    expect(items[0].url).toBe(canonical);
    expect(items[0].url).not.toContain(`/detail/${newsId}`);
    expect((fetcher.mock.calls[1][0] as URL).href).toBe(proxy);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
    });
    expect(fetcher.mock.calls[1][1].signal).toBe(fetcher.mock.calls[0][1].signal);
  });

  it("treats a genuinely empty or non-official feed as empty live data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(news([]))
      .mockResolvedValueOnce(
        news([article({ feedname: "external_press", url: "https://example.com/article" })]),
      );
    vi.stubGlobal("fetch", fetcher);
    const adapter = createLiveSteamNewsAdapter();
    await expect(adapter.getNewsForApp(appId)).resolves.toEqual([]);
    await expect(adapter.getNewsForApp(appId)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("skips unsafe individual URLs while keeping another valid official announcement", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      news([
        article({ gid: "1", url: "javascript:alert(1)" }),
        article({
          gid: "2",
          url: "https://steamcommunity.com.evil.example/games/2139460/announcements/detail/5",
        }),
        article({ gid: "3", url: "https://steamcommunity.com/games/570/announcements/detail/5" }),
        article({
          gid: "4",
          url: "https://steamcommunity.com/games/2139460/announcements/detail/5",
        }),
      ]),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await createLiveSteamNewsAdapter().getNewsForApp(appId)).toMatchObject([{ id: "4" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    "javascript:alert(1)",
    "http://steamcommunity.com/games/2139460/announcements/detail/5",
    "https://steamcommunity.com@games.example/announcements/detail/5",
    "https://steamcommunity.com:444/games/2139460/announcements/detail/5",
    "https://steamcommunity.com/games/2139460/announcements/detail/18446744073709551616",
    "https://steamcommunity.com/games/2139460/announcements/detail/5?redirect=bad",
    "https://steamstore-a.akamaihd.net/news/externalpost/external_press/1845383656376853",
  ])("fails rather than claiming an empty feed when every URL is unsafe: %s", async (unsafe) => {
    const fetcher = vi.fn().mockResolvedValue(news([article({ url: unsafe })]));
    vi.stubGlobal("fetch", fetcher);
    await expect(createLiveSteamNewsAdapter().getNewsForApp(appId)).rejects.toMatchObject({
      code: "CANONICAL_URL_UNAVAILABLE",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects an untrusted redirect and never requests its target", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(news([article({ url: proxy })]))
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(createLiveSteamNewsAdapter().getNewsForApp(appId)).rejects.toMatchObject({
      code: "CANONICAL_URL_UNAVAILABLE",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not accept another app's payload or article", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(news([article()], 570))
      .mockResolvedValueOnce(news([article({ appid: 570 })]));
    vi.stubGlobal("fetch", fetcher);
    const adapter = createLiveSteamNewsAdapter();
    await expect(adapter.getNewsForApp(appId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(adapter.getNewsForApp(appId)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    { gid: "not-a-number" },
    { gid: "18446744073709551616" },
    { title: "" },
    { date: -1 },
    { date: 1.5 },
    { contents: null },
  ])("rejects malformed news identity, title, timestamp or contents", async (invalid) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(news([article(invalid)])));
    await expect(createLiveSteamNewsAdapter().getNewsForApp(appId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("removes duplicate news and announcement IDs and orders the result by publication date", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          news([
            article({ gid: "1", url: canonical, date: 10 }),
            article({ gid: "1", url: canonical, date: 10 }),
            article({ gid: "2", url: canonical, date: 10 }),
            article({ gid: "3", url: canonical.replace(announcementId, "6"), date: 20 }),
          ]),
        ),
    );
    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId);
    expect(items.map((item) => item.id)).toEqual(["3", "1"]);
  });

  it("keeps all announcement lookups inside one shared deadline and limits concurrency to three", async () => {
    let active = 0;
    let highest = 0;
    const signals = new Set<AbortSignal>();
    const fetcher = vi.fn().mockImplementation(async (url: URL, options: RequestInit) => {
      signals.add(options.signal as AbortSignal);
      if (url.hostname === "api.steampowered.com") {
        return news(
          Array.from({ length: 5 }, (_, index) =>
            article({
              gid: String(index + 1),
              url: `https://steamstore-a.akamaihd.net/news/externalpost/${feed}/${index + 1}`,
            }),
          ),
        );
      }
      active++;
      highest = Math.max(highest, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://steamcommunity.com/ogg/${appId}/announcements/detail/${url.pathname.split("/").at(-1)}`,
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await createLiveSteamNewsAdapter().getNewsForApp(appId)).toHaveLength(5);
    expect(highest).toBe(3);
    expect(signals.size).toBe(1);
  });

  it("times out announcement resolution instead of reporting an empty official feed", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(news([article({ url: proxy })]))
      .mockImplementation(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal!.addEventListener("abort", () => reject(options.signal!.reason), {
              once: true,
            });
          }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createLiveSteamNewsAdapter({ timeoutMs: 20 }).getNewsForApp(appId),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it.each([{ count: 6 }, { count: 0 }, { maxLength: 301 }, { maxLength: 0 }])(
    "bounds requests before fetching",
    async (options) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        createLiveSteamNewsAdapter().getNewsForApp(appId, options),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});

it("removes encoded active markup before producing a text blurb", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      news([
        article({
          contents:
            "&amp;lt;script&amp;gt;hidden()&amp;lt;/script&amp;gt; &#x3c;style&#x3e;body{}&#x3c;/style&#x3e;Safe text",
        }),
      ]),
    ),
  );
  const items = await createLiveSteamNewsAdapter().getNewsForApp(appId);
  expect(items[0].summary).toBe("Safe text");
});

it("rejects oversized payloads before returning an article", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(news([article({ contents: "x".repeat(300_000) })])),
  );
  await expect(createLiveSteamNewsAdapter().getNewsForApp(appId)).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
});

it("keeps the response-body read inside the same timeout", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((_url, options: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"appnews":'));
              options.signal!.addEventListener(
                "abort",
                () => controller.error(options.signal!.reason),
                { once: true },
              );
            },
          }),
        ),
      ),
    ),
  );
  await expect(
    createLiveSteamNewsAdapter({ timeoutMs: 20 }).getNewsForApp(appId),
  ).rejects.toMatchObject({ code: "TIMEOUT" });
});
