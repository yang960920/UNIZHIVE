import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createLiveSteamNewsAdapter } from "../src/steam/news";
import { ONCE_HUMAN_STEAM_APP_ID } from "../src/steam/types";

const appId = ONCE_HUMAN_STEAM_APP_ID;
const eventId = "719043624313028636";
const eventUrl = `https://store.steampowered.com/news/app/${appId}/view/${eventId}`;
const channelUrl = `https://store.steampowered.com/news/app/${appId}/`;
const rssUrl = `https://store.steampowered.com/feeds/news/app/${appId}/?l=koreana`;

interface RssItemFixture {
  id?: string;
  title?: string;
  description?: string;
  descriptionCdata?: boolean;
  link?: string;
  guid?: string;
  pubDate?: string;
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Same public structure as the 2026-10-08 Steam KR RSS: no author field,
 * encoded description HTML, URL GUID and a misleading en-us channel language. */
function itemXml(options: RssItemFixture = {}): string {
  const link = options.link ?? `${channelUrl}view/${options.id ?? eventId}`;
  const description = options.description ?? "<p>한국어 공식 업데이트 안내입니다.</p>";
  return `<item>
    <title>${xmlText(options.title ?? "[심연의 손길] 업데이트 안내")}</title>
    <description>${options.descriptionCdata ? `<![CDATA[${description}]]>` : xmlText(description)}</description>
    <link><![CDATA[${link}]]></link>
    <pubDate>${xmlText(options.pubDate ?? "Wed, 30 Sep 2026 09:16:23 +0000")}</pubDate>
    <guid isPermaLink="true">${xmlText(options.guid ?? link)}</guid>
  </item>`;
}

function feedXml(items: string[] = [itemXml()], channelLink = channelUrl): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
      <atom:link href="${xmlText(channelLink)}" rel="self" type="application/rss+xml" />
      <title>${appId} RSS 피드</title>
      <link><![CDATA[${channelLink}]]></link>
      <description><![CDATA[${appId}용 이벤트 및 공지]]></description>
      <language>en-us</language>
      <generator>Steam 뉴스 RSS</generator>
      ${items.join("\n")}
    </channel>
  </rss>`;
}

function xmlResponse(body = feedXml(), status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Korean Steam announcement RSS", () => {
  it("requests the public Korean feed without an API key and normalizes the store event identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(xmlResponse());
    vi.stubGlobal("fetch", fetcher);

    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: eventId,
      appId,
      title: "[심연의 손길] 업데이트 안내",
      summary: "한국어 공식 업데이트 안내입니다.",
      url: `${eventUrl}?l=koreana`,
      source: "LIVE",
    });
    expect(items[0].publishedAt).toEqual(new Date("2026-09-30T09:16:23.000Z"));
    expect(items[0]).not.toHaveProperty("contents");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requested, options] = fetcher.mock.calls[0];
    expect(String(requested)).toBe(rssUrl);
    expect(new URL(String(requested)).searchParams.has("key")).toBe(false);
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([false, true])(
    "cleans encoded HTML and CDATA while preserving Korean item brackets (%s)",
    async (descriptionCdata) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          xmlResponse(
            feedXml([
              itemXml({
                title: "[심연의 손길] 안내 & 개선 <script>titleAttack()</script>",
                descriptionCdata,
                description:
                  "<script>bodyAttack()</script><style>hiddenStyle</style><iframe>hiddenFrame</iframe>" +
                  "<p>\\[심연의 손길] 장비 &amp; 보상을 확인하세요.</p>" +
                  '<img src="javascript:unsafe" /><a href="javascript:unsafe">안전한 설명</a>',
              }),
            ]),
          ),
        ),
      );

      const [item] = await createLiveSteamNewsAdapter().getNewsForApp(appId, {
        language: "koreana",
      });

      expect(item.title).toBe("[심연의 손길] 안내 & 개선");
      expect(item.summary).toContain("[심연의 손길] 장비 & 보상을 확인하세요.");
      expect(item.summary).toContain("안전한 설명");
      expect(item.summary).not.toMatch(/bodyAttack|hiddenStyle|hiddenFrame|javascript|<|>/);
    },
  );

  it("removes doubly encoded active markup before producing a Korean blurb", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        xmlResponse(
          feedXml([
            itemXml({
              descriptionCdata: true,
              description:
                "&amp;lt;script&amp;gt;hiddenAttack()&amp;lt;/script&amp;gt; " +
                "&#x3c;style&#x3e;hiddenStyle&#x3c;/style&#x3e;한국어 안전 안내",
            }),
          ]),
        ),
      ),
    );

    const [item] = await createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" });
    expect(item.summary).toBe("한국어 안전 안내");
  });

  it("bounds summaries by Unicode code points without corrupting Korean text or emoji", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          xmlResponse(feedXml([itemXml({ description: "한국어 " + "🧬".repeat(500) })])),
        ),
    );

    const [item] = await createLiveSteamNewsAdapter().getNewsForApp(appId, {
      language: "koreana",
      maxLength: 200,
    });
    expect(Array.from(item.summary)).toHaveLength(200);
    expect(item.summary).not.toContain("�");
    expect(item.summary.startsWith("한국어 ")).toBe(true);
  });

  it("sorts by publication date, deduplicates event GUIDs and returns the requested latest three", async () => {
    const rows = [
      itemXml({ id: "101", pubDate: "Tue, 29 Sep 2026 09:00:00 +0000" }),
      itemXml({ id: "102", pubDate: "Wed, 30 Sep 2026 09:00:00 +0000" }),
      itemXml({ id: "102", pubDate: "Wed, 30 Sep 2026 09:00:00 +0000" }),
      itemXml({ id: "103", pubDate: "Thu, 01 Oct 2026 09:00:00 +0000" }),
      itemXml({ id: "104", pubDate: "Fri, 02 Oct 2026 09:00:00 +0000" }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(feedXml(rows))));

    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId, {
      language: "koreana",
      count: 3,
    });
    expect(items.map((item) => item.id)).toEqual(["104", "103", "102"]);
    expect(new Set(items.map((item) => item.url)).size).toBe(3);
  });

  it("applies the existing maximum count to a larger valid RSS feed", async () => {
    const rows = Array.from({ length: 9 }, (_, index) => itemXml({ id: String(index + 1) }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(feedXml(rows))));

    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" });
    expect(items).toHaveLength(5);
  });

  it("accepts a genuinely empty valid feed despite its en-us channel language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(feedXml([]))));
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).resolves.toEqual([]);
  });

  it("rejects English-only articles without silently requesting an English replacement", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        xmlResponse(
          feedXml([itemXml({ title: "English update", description: "English body only." })]),
        ),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(rssUrl);
  });

  it("skips an untranslated English article while retaining a valid Korean one", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        xmlResponse(
          feedXml([
            itemXml({ id: "101", title: "English update", description: "English body only." }),
            itemXml({ id: "102", title: "한국어 업데이트 안내" }),
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetcher);

    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" });
    expect(items.map((item) => item.id)).toEqual(["102"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    "javascript:alert(1)",
    "http://store.steampowered.com/news/app/2139460/view/101",
    "https://store.steampowered.com.evil.example/news/app/2139460/view/101",
    "https://store.steampowered.com@evil.example/news/app/2139460/view/101",
    "https://store.steampowered.com:444/news/app/2139460/view/101",
    "https://store.steampowered.com/news/app/570/view/101",
    "https://store.steampowered.com/news/app/2139460/view/not-numeric",
    "https://store.steampowered.com/news/app/2139460/view/18446744073709551616",
    "https://store.steampowered.com/news/app/2139460/view/101?redirect=https://evil.example/",
  ])("fails closed for unsafe or malformed store event URLs: %s", async (link) => {
    const fetcher = vi.fn().mockResolvedValue(xmlResponse(feedXml([itemXml({ link })])));
    vi.stubGlobal("fetch", fetcher);

    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "CANONICAL_URL_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("skips a wrong-app item while preserving a safe Korean article", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          xmlResponse(
            feedXml([
              itemXml(),
              itemXml({ link: "https://store.steampowered.com/news/app/570/view/101" }),
            ]),
          ),
        ),
    );

    const items = await createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" });
    expect(items.map((item) => item.id)).toEqual([eventId]);
    expect(items[0].url).toBe(`${eventUrl}?l=koreana`);
  });

  it("rejects another application's channel", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          xmlResponse(feedXml([itemXml()], "https://store.steampowered.com/news/app/570/")),
        ),
    );
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([{ pubDate: "not-a-date" }, { title: "" }])(
    "rejects malformed article identity or required metadata: %s",
    async (invalid) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(feedXml([itemXml(invalid)]))));
      await expect(
        createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );

  it("rejects a mismatched store event GUID instead of inventing an announcement identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          xmlResponse(
            feedXml([
              itemXml({ guid: "https://store.steampowered.com/news/app/2139460/view/999" }),
            ]),
          ),
        ),
    );
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "CANONICAL_URL_UNAVAILABLE" });
  });

  it.each([
    "<rss><channel><item><title>공지</title></channel></rss>",
    "<html><body>점검 안내</body></html>",
    '<!DOCTYPE rss SYSTEM "https://evil.example/external.dtd">' + feedXml(),
    '<!DOCTYPE rss [<!ENTITY test "한국어 외부 엔티티">]>' + feedXml(),
  ])(
    "rejects malformed XML and DTD declarations without making a secondary request",
    async (body) => {
      const fetcher = vi.fn().mockResolvedValue(xmlResponse(body));
      vi.stubGlobal("fetch", fetcher);

      await expect(
        createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects oversized XML before producing an article", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          xmlResponse(feedXml([itemXml({ description: "한국어 " + "x".repeat(600_000) })])),
        ),
    );
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a description over 256 Ki characters within an otherwise bounded body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          xmlResponse(feedXml([itemXml({ description: "한국어 " + "x".repeat(270_000) })])),
        ),
    );
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects over 100 entries instead of silently accepting an unbounded feed", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => itemXml({ id: String(index + 1) }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse(feedXml(rows))));

    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("reports HTTP service errors as failures rather than a successful empty feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(xmlResponse("점검 중", 503)));
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 503 });
  });

  it("keeps waiting for response headers inside the configured timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal!.addEventListener("abort", () => reject(options.signal!.reason), {
              once: true,
            });
          }),
      ),
    );
    await expect(
      createLiveSteamNewsAdapter({ timeoutMs: 20 }).getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("keeps reading the streamed RSS body inside the same deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, options: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('<rss version="2.0"><channel>'));
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
      createLiveSteamNewsAdapter({ timeoutMs: 20 }).getNewsForApp(appId, { language: "koreana" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects an unsupported requested language before fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    // External callers may bypass the TypeScript union; validate the runtime boundary too.
    await expect(
      createLiveSteamNewsAdapter().getNewsForApp(appId, { language: "unsupported" as "koreana" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
