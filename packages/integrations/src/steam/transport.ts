import "server-only";
import type { z } from "zod";

export class SteamApiError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "HTTP_ERROR" | "TIMEOUT" | "INVALID_RESPONSE" | "CANONICAL_URL_UNAVAILABLE",
    public readonly status?: number,
  ) {
    super(`Steam request unavailable (${code}).`);
    this.name = "SteamApiError";
  }
}

export function assertSteamAppId(appId: number): void {
  if (!Number.isSafeInteger(appId) || appId < 1 || appId > 4_294_967_295)
    throw new SteamApiError("INVALID_INPUT");
}

export function steamTimeout(value: number | undefined, fallback: number): number {
  const timeoutMs = value ?? fallback;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8_000)
    throw new SteamApiError("INVALID_INPUT");
  return timeoutMs;
}

/** Small public payloads only. The same request deadline covers headers and streamed body. */
export async function readSteamText(
  url: URL,
  signal: AbortSignal,
  maxBytes = 256 * 1024,
): Promise<string> {
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal });
    if (!response.ok) throw new SteamApiError("HTTP_ERROR", response.status);
    if (!response.body) throw new SteamApiError("INVALID_RESPONSE");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let length = 0;
    let text = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > maxBytes) throw new SteamApiError("INVALID_RESPONSE");
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    return text;
  } catch (error) {
    if (signal.aborted) throw new SteamApiError("TIMEOUT");
    if (error instanceof SteamApiError) throw error;
    throw new SteamApiError("INVALID_RESPONSE");
  }
}

export async function parseSteamJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T> {
  try {
    const text = await readSteamText(url, signal);
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new SteamApiError("INVALID_RESPONSE");
    return parsed.data;
  } catch (error) {
    if (signal.aborted) throw new SteamApiError("TIMEOUT");
    if (error instanceof SteamApiError) throw error;
    throw new SteamApiError("INVALID_RESPONSE");
  }
}
