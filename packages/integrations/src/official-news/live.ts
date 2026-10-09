import type { OfficialNewsAdapter } from "./types";

/** No verified official feed/API has been configured; never scrape or invent a news endpoint. */
export function createUnconfiguredOfficialNewsAdapter(): OfficialNewsAdapter {
  return {
    async getLatestNews() {
      return [];
    },
  };
}
