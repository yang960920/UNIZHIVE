import "server-only";
import { z } from "zod";
import type { SteamAdapterOptions, SteamNewsAdapter, SteamNewsItem } from "./types";
import { assertSteamAppId, parseSteamJson, SteamApiError, steamTimeout } from "./transport";
import { shortPlainText } from "./news-text";
import { readKoreanSteamNews } from "./news-rss";

const officialFeed = "steam_community_announcements";
const uint32 = z.number().int().nonnegative().max(4_294_967_295);
const gid = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine((value) => BigInt(value) <= 18_446_744_073_709_551_615n);
const newsSchema = z.object({
  appnews: z.object({
    appid: uint32,
    newsitems: z
      .array(
        z.object({
          gid,
          title: z.string().trim().min(1).max(2_000),
          url: z.string().min(1).max(2_000),
          contents: z.string().max(32_000),
          date: uint32,
          feedname: z.string().min(1).max(200),
          feedlabel: z.string().max(200),
          appid: uint32,
        }),
      )
      .max(100),
  }),
});

function canonicalAnnouncementUrl(value: string, appId: number): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "steamcommunity.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const match = /^\/(?:games|ogg)\/(\d+)\/announcements\/detail\/([1-9]\d{0,19})\/?$/.exec(
      url.pathname,
    );
    if (!match || match[1] !== String(appId) || !gid.safeParse(match[2]).success) return null;
    return `https://steamcommunity.com/games/${appId}/announcements/detail/${match[2]}`;
  } catch {
    return null;
  }
}

/** The news-feed GID differs from the announcement GID; validate Steam's redirect instead. */
async function resolveAnnouncementUrl(
  value: string,
  appId: number,
  newsId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const direct = canonicalAnnouncementUrl(value, appId);
  if (direct) return direct;
  try {
    const proxy = new URL(value);
    if (
      !["https:", "http:"].includes(proxy.protocol) ||
      proxy.hostname !== "steamstore-a.akamaihd.net" ||
      proxy.pathname !== `/news/externalpost/${officialFeed}/${newsId}` ||
      proxy.port ||
      proxy.username ||
      proxy.password ||
      proxy.search ||
      proxy.hash
    )
      return null;
    // This exact official CDN route has been checked over HTTPS; never request HTTP.
    proxy.protocol = "https:";
    const response = await fetch(proxy, {
      method: "HEAD",
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return null;
    const location = response.headers.get("location");
    return location ? canonicalAnnouncementUrl(location, appId) : null;
  } catch {
    return null;
  }
}

export function createLiveSteamNewsAdapter(options: SteamAdapterOptions = {}): SteamNewsAdapter {
  const timeoutMs = steamTimeout(options.timeoutMs, 4_000);
  return {
    async getNewsForApp(appId, request = {}) {
      assertSteamAppId(appId);
      const count = request.count ?? 5;
      const maxLength = request.maxLength ?? 300;
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 5 ||
        !Number.isSafeInteger(maxLength) ||
        maxLength < 1 ||
        maxLength > 300 ||
        (request.language !== undefined && !["english", "koreana"].includes(request.language))
      )
        throw new SteamApiError("INVALID_INPUT");
      const signal = AbortSignal.timeout(timeoutMs);
      if (request.language === "koreana")
        return readKoreanSteamNews(appId, count, maxLength, signal);
      const url = new URL("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/");
      url.searchParams.set("appid", String(appId));
      url.searchParams.set("count", String(count));
      url.searchParams.set("maxlength", String(maxLength));
      url.searchParams.set("feeds", officialFeed);
      const data = await parseSteamJson(url, newsSchema, signal);
      if (data.appnews.appid !== appId) throw new SteamApiError("INVALID_RESPONSE");
      const officialItems = data.appnews.newsitems.filter((item) => item.feedname === officialFeed);
      if (officialItems.some((item) => item.appid !== appId))
        throw new SteamApiError("INVALID_RESPONSE");
      const seenIds = new Set<string>();
      const candidates = officialItems.filter((item) => {
        if (seenIds.has(item.gid)) return false;
        seenIds.add(item.gid);
        return true;
      });
      if (candidates.length === 0) return [];
      const slots = candidates.slice(0, count);
      const resolved = new Array<SteamNewsItem | null>(slots.length).fill(null);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, slots.length) }, async () => {
          while (next < slots.length && !signal.aborted) {
            const index = next++;
            const item = slots[index];
            const announcementUrl = await resolveAnnouncementUrl(item.url, appId, item.gid, signal);
            const title = shortPlainText(item.title, 200);
            if (!announcementUrl || !title) continue;
            resolved[index] = {
              id: item.gid,
              appId,
              title,
              url: announcementUrl,
              summary: shortPlainText(item.contents, maxLength),
              publishedAt: new Date(item.date * 1_000),
              feedLabel: shortPlainText(item.feedlabel, 120),
              source: "LIVE",
            };
          }
        }),
      );
      if (signal.aborted) throw new SteamApiError("TIMEOUT");
      const seenUrls = new Set<string>();
      const items = resolved.filter((item): item is SteamNewsItem => {
        if (!item || seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      });
      if (items.length === 0) throw new SteamApiError("CANONICAL_URL_UNAVAILABLE");
      return items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    },
  };
}
