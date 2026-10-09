import "server-only";
import {
  ONCE_HUMAN_STEAM_APP_ID,
  type SteamNewsItem,
  type SteamPlayerCount,
} from "@uniz/integrations";
import { createLiveSteamAdapter, createLiveSteamNewsAdapter } from "@uniz/integrations/server";
import type {
  SteamOverviewData,
  SteamOverviewNewsItem,
  SteamOverviewStatus,
} from "../data/steam-overview-types";

const NEWS_TTL_MS = 15 * 60_000;
const PLAYERS_TTL_MS = 5 * 60_000;
const RETRY_DELAY_MS = 60_000;
const REQUEST_DEADLINE_MS = 4_000;

interface FeedResult<T> {
  status: SteamOverviewStatus;
  data: T | null;
  observedAt: string | null;
}

interface FeedCache<T> {
  good: { data: T; observedAt: string; expiresAt: number } | null;
  retryAt: number;
  inFlight: Promise<FeedResult<T>> | null;
}

interface OverviewDependencies {
  loadNews: () => Promise<SteamNewsItem[]>;
  loadPlayers: () => Promise<SteamPlayerCount>;
  now?: () => Date;
  deadlineMs?: number;
}

async function beforeDeadline<T>(load: () => Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(load),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Steam request deadline exceeded.")), deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Each reader owns independent caches; production uses one reader for this server process. */
export function createSteamOverviewReader(dependencies: OverviewDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const requestedDeadline = dependencies.deadlineMs ?? REQUEST_DEADLINE_MS;
  const deadlineMs =
    Number.isFinite(requestedDeadline) && requestedDeadline > 0
      ? Math.min(requestedDeadline, REQUEST_DEADLINE_MS)
      : REQUEST_DEADLINE_MS;
  const newsCache: FeedCache<SteamOverviewNewsItem[]> = {
    good: null,
    retryAt: 0,
    inFlight: null,
  };
  const playersCache: FeedCache<number> = { good: null, retryAt: 0, inFlight: null };

  function cached<T>(cache: FeedCache<T>, status: "LIVE" | "STALE"): FeedResult<T> {
    return cache.good
      ? { status, data: cache.good.data, observedAt: cache.good.observedAt }
      : { status: "UNAVAILABLE", data: null, observedAt: null };
  }

  function read<T>(
    cache: FeedCache<T>,
    ttlMs: number,
    load: () => Promise<{ data: T; observedAt: string }>,
  ): Promise<FeedResult<T>> {
    const timestamp = now().getTime();
    if (cache.good && timestamp < cache.good.expiresAt)
      return Promise.resolve(cached(cache, "LIVE"));
    if (cache.inFlight) return cache.inFlight;
    if (timestamp < cache.retryAt) return Promise.resolve(cached(cache, "STALE"));
    const refresh = beforeDeadline(load, deadlineMs)
      .then((fresh) => {
        cache.good = { ...fresh, expiresAt: now().getTime() + ttlMs };
        cache.retryAt = 0;
        return cached(cache, "LIVE");
      })
      .catch(() => {
        cache.retryAt = now().getTime() + RETRY_DELAY_MS;
        return cached(cache, "STALE");
      })
      .finally(() => {
        cache.inFlight = null;
      });
    cache.inFlight = refresh;
    return refresh;
  }

  return async function getOverview(): Promise<SteamOverviewData> {
    const [news, players] = await Promise.all([
      read(newsCache, NEWS_TTL_MS, async () => {
        const items = await dependencies.loadNews();
        if (
          items.some(
            (item) =>
              item.source !== "LIVE" ||
              item.appId !== ONCE_HUMAN_STEAM_APP_ID ||
              !Number.isFinite(item.publishedAt.getTime()),
          )
        )
          throw new Error("Steam news did not match the requested application.");
        return {
          data: items.slice(0, 3).map((item) => ({
            id: item.id,
            title: item.title,
            url: item.url,
            summary: item.summary,
            publishedAt: item.publishedAt.toISOString(),
          })),
          observedAt: now().toISOString(),
        };
      }),
      read(playersCache, PLAYERS_TTL_MS, async () => {
        const result = await dependencies.loadPlayers();
        if (
          result.source !== "LIVE" ||
          result.appId !== ONCE_HUMAN_STEAM_APP_ID ||
          !Number.isSafeInteger(result.count) ||
          result.count < 0 ||
          !Number.isFinite(result.observedAt.getTime())
        )
          throw new Error("Steam player count did not match the requested application.");
        return { data: result.count, observedAt: result.observedAt.toISOString() };
      }),
    ]);
    return {
      appId: ONCE_HUMAN_STEAM_APP_ID,
      source: "STEAM",
      news: {
        status: news.status,
        items: news.data?.map((item) => ({ ...item })) ?? [],
        observedAt: news.observedAt,
      },
      players: { status: players.status, count: players.data, observedAt: players.observedAt },
    };
  };
}

const steam = createLiveSteamAdapter({ timeoutMs: 3_500 });
const steamNews = createLiveSteamNewsAdapter({ timeoutMs: 3_500 });
const readOverview = createSteamOverviewReader({
  loadNews: () =>
    steamNews.getNewsForApp(ONCE_HUMAN_STEAM_APP_ID, {
      count: 3,
      maxLength: 200,
      language: "koreana",
    }),
  loadPlayers: () => steam.getCurrentPlayers(ONCE_HUMAN_STEAM_APP_ID),
});

export function getSteamOverview(): Promise<SteamOverviewData> {
  return readOverview();
}
