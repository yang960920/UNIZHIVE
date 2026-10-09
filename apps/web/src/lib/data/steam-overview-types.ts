export type SteamOverviewStatus = "LIVE" | "STALE" | "UNAVAILABLE";

export interface SteamOverviewNewsItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
}

/** Public Steam information only; no membership or authentication data. */
export interface SteamOverviewData {
  appId: number;
  source: "STEAM";
  news: {
    status: SteamOverviewStatus;
    items: SteamOverviewNewsItem[];
    observedAt: string | null;
  };
  players: {
    status: SteamOverviewStatus;
    count: number | null;
    observedAt: string | null;
  };
}
