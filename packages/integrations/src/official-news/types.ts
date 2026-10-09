export interface OfficialNewsItem {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  source: "MOCK" | "LIVE";
}

export interface OfficialNewsAdapter {
  getLatestNews(): Promise<OfficialNewsItem[]>;
}
