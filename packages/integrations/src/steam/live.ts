import "server-only";
import { z } from "zod";
import type { SteamAdapter, SteamAdapterOptions } from "./types";
import { assertSteamAppId, parseSteamJson, SteamApiError, steamTimeout } from "./transport";

const playerCountSchema = z.object({
  response: z.object({
    player_count: z.number().int().nonnegative().max(4_294_967_295),
    result: z.literal(1),
    appid: z.number().int().positive().max(4_294_967_295).optional(),
  }),
});

export function createLiveSteamAdapter(options: SteamAdapterOptions = {}): SteamAdapter {
  const timeoutMs = steamTimeout(options.timeoutMs, 8_000);
  return {
    async getCurrentPlayers(appId) {
      assertSteamAppId(appId);
      const url = new URL(
        "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/",
      );
      url.searchParams.set("appid", String(appId));
      const data = await parseSteamJson(url, playerCountSchema, AbortSignal.timeout(timeoutMs));
      if (data.response.appid !== undefined && data.response.appid !== appId)
        throw new SteamApiError("INVALID_RESPONSE");
      return { appId, count: data.response.player_count, observedAt: new Date(), source: "LIVE" };
    },
  };
}
