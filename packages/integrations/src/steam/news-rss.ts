import "server-only";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { SteamNewsItem } from "./types";
import { readSteamText, SteamApiError } from "./transport";
import { shortPlainText } from "./news-text";

const rssSchema = z.object({
  rss: z.object({
    channel: z.object({
      link: z.string().max(2_000),
      item: z
        .array(
          z.object({
            title: z.string().trim().min(1).max(2_000),
            description: z.string().max(256 * 1024),
            link: z.string().min(1).max(2_000),
            guid: z.string().min(1).max(2_000),
            pubDate: z.string().min(1).max(100),
          }),
        )
        .max(100)
        .default([]),
    }),
  }),
});

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: false,
  isArray: (tagName) => tagName === "item",
});

function steamStoreUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "store.steampowered.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function eventId(value: string, appId: number): string | null {
  const url = steamStoreUrl(value);
  if (!url) return null;
  const match = /^\/news\/app\/(\d+)\/view\/([1-9]\d{0,19})\/?$/.exec(url.pathname);
  if (!match || match[1] !== String(appId) || BigInt(match[2]!) > 18_446_744_073_709_551_615n)
    return null;
  return match[2]!;
}

/** Steam's localized RSS contains publisher-supplied Korean text. Its language
 * metadata still says en-us, so actual titles and blurbs are checked instead.
 * Verified feed and article links: outputs/steam-korean-news-research.json.
 */
export async function readKoreanSteamNews(
  appId: number,
  count: number,
  maxLength: number,
  signal: AbortSignal,
): Promise<SteamNewsItem[]> {
  const url = new URL(`https://store.steampowered.com/feeds/news/app/${appId}/`);
  url.searchParams.set("l", "koreana");
  try {
    const xml = await readSteamText(url, signal, 512 * 1024);
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new SteamApiError("INVALID_RESPONSE");
    const raw: unknown = parser.parse(xml, true);
    const parsed = rssSchema.safeParse(raw);
    if (!parsed.success) throw new SteamApiError("INVALID_RESPONSE");
    const channel = parsed.data.rss.channel;
    if (steamStoreUrl(channel.link)?.pathname !== `/news/app/${appId}/`)
      throw new SteamApiError("INVALID_RESPONSE");
    if (channel.item.length === 0) return [];

    const seen = new Set<string>();
    const items: SteamNewsItem[] = [];
    let hasValidUrl = false;
    for (const item of channel.item) {
      const id = eventId(item.link, appId);
      if (!id || eventId(item.guid, appId) !== id) continue;
      hasValidUrl = true;
      const publishedAt = new Date(item.pubDate);
      if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() < 0)
        throw new SteamApiError("INVALID_RESPONSE");
      const title = shortPlainText(item.title, 200, true);
      const summary = shortPlainText(item.description, maxLength, true);
      if (!/[가-힣]/.test(title) || (summary && !/[가-힣]/.test(summary))) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const articleUrl = new URL(`https://store.steampowered.com/news/app/${appId}/view/${id}`);
      articleUrl.searchParams.set("l", "koreana");
      items.push({
        id,
        appId,
        title,
        summary,
        url: articleUrl.toString(),
        publishedAt,
        feedLabel: "Steam 한국어 공식 소식",
        source: "LIVE",
      });
    }
    if (signal.aborted) throw new SteamApiError("TIMEOUT");
    if (items.length === 0)
      throw new SteamApiError(hasValidUrl ? "INVALID_RESPONSE" : "CANONICAL_URL_UNAVAILABLE");
    return items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, count);
  } catch (error) {
    if (signal.aborted) throw new SteamApiError("TIMEOUT");
    if (error instanceof SteamApiError) throw error;
    throw new SteamApiError("INVALID_RESPONSE");
  }
}
