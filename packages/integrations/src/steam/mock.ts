import type { SteamAdapter } from "./types";

export function createMockSteamAdapter(options: { playerCount?: number } = {}): SteamAdapter {
  return {
    async getCurrentPlayers(appId) {
      return {
        appId,
        count: options.playerCount ?? 47_832,
        observedAt: new Date(),
        source: "MOCK",
      };
    },
  };
}
