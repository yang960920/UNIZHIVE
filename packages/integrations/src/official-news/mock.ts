import type { OfficialNewsAdapter, OfficialNewsItem } from "./types";

/** Demo copy is explicitly labelled and links to the official home, never a fabricated article. */
const demoItems: readonly OfficialNewsItem[] = [
  {
    id: "news-demo-1",
    title: "[미리보기] 시즌 업데이트와 이벤트 소식",
    url: "https://www.oncehuman.game/",
    publishedAt: new Date("2026-10-06T00:00:00Z"),
    source: "MOCK",
  },
];

export function createMockOfficialNewsAdapter(
  items: readonly OfficialNewsItem[] = demoItems,
): OfficialNewsAdapter {
  return {
    async getLatestNews() {
      return items.map((item) => ({ ...item, source: "MOCK" }));
    },
  };
}
