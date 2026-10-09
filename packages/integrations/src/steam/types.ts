export interface SteamPlayerCount {
  appId: number;
  count: number;
  observedAt: Date;
  source: "MOCK" | "LIVE";
}

export interface SteamAdapter {
  getCurrentPlayers(appId: number): Promise<SteamPlayerCount>;
}

export interface SteamNewsItem {
  id: string;
  appId: number;
  title: string;
  /** Validated Steam announcement or store-news URL, never an arbitrary external URL. */
  url: string;
  /** Plain text blurb only; no HTML, BBCode or original full article. */
  summary: string;
  publishedAt: Date;
  feedLabel: string;
  source: "LIVE";
}

export interface SteamNewsOptions {
  count?: number;
  maxLength?: number;
  /** Korean news uses Steam's localized RSS; the JSON news API has no locale parameter. */
  language?: "english" | "koreana";
}

export interface SteamNewsAdapter {
  getNewsForApp(appId: number, options?: SteamNewsOptions): Promise<SteamNewsItem[]>;
}

export interface SteamAdapterOptions {
  timeoutMs?: number;
}

export const ONCE_HUMAN_STEAM_APP_ID = 2139460;
