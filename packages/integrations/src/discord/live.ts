import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildDiscordChannelLink, type DiscordAdapter, type DiscordGuildMember } from "./types";

const guildMemberSchema = z.object({
  nick: z.string().nullable().optional(),
  roles: z.array(z.string()),
  user: z.object({ id: z.string() }),
});

function assertDiscordId(id: string): void {
  if (!/^\d{17,20}$/.test(id)) throw new Error("Invalid Discord ID.");
}

/** Errors expose only a classification and HTTP status, never credentials or response bodies. */
export class DiscordApiError extends Error {
  readonly retryAfterSeconds: number | null;

  constructor(
    readonly kind: "UNAUTHORIZED" | "UNAVAILABLE",
    readonly status: number | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(`Discord API ${kind.toLowerCase()}.`);
    this.name = "DiscordApiError";
    this.retryAfterSeconds =
      status === 429 &&
      typeof retryAfterSeconds === "number" &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds >= 0
        ? retryAfterSeconds
        : null;
  }
}

export interface DiscordOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

const oauthTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  scope: z.string(),
});

// Only rate-limit timestamps live across requests. No membership, identity, OAuth token,
// role or successful authorization result is stored here. Globals retain the server's
// cooldown across development module reloads and separate action/render module instances.
const discordGlobal = globalThis as typeof globalThis & {
  __unizDiscordRateCooldowns?: Map<string, number>;
  __unizDiscordMemberInFlight?: Map<string, Promise<DiscordGuildMember | null>>;
};
const discordRateCooldowns = (discordGlobal.__unizDiscordRateCooldowns ??= new Map<
  string,
  number
>());
const discordMemberInFlight = (discordGlobal.__unizDiscordMemberInFlight ??= new Map<
  string,
  Promise<DiscordGuildMember | null>
>());

function rateLimitKeys(guildId: string, accessToken: string) {
  const tokenHash = createHash("sha256").update(accessToken).digest("hex");
  return {
    route: `member:${tokenHash}:${guildId}`,
    global: `global:${tokenHash}`,
    shared: `member:shared:${guildId}`,
  };
}

function rememberCooldown(key: string, delay: number): void {
  const now = Date.now();
  // Expired entries cannot affect a future request and do not accumulate indefinitely.
  for (const [storedKey, until] of discordRateCooldowns) {
    if (until <= now) discordRateCooldowns.delete(storedKey);
  }
  const until = now + delay;
  if (delay > 0 && Number.isFinite(until)) {
    discordRateCooldowns.set(key, Math.max(discordRateCooldowns.get(key) ?? 0, until));
  }
}

function cooldownDelay(keys: ReturnType<typeof rateLimitKeys>): number {
  const now = Date.now();
  let delay = 0;
  for (const key of Object.values(keys)) {
    const until = discordRateCooldowns.get(key);
    if (until !== undefined && until <= now) discordRateCooldowns.delete(key);
    else if (until !== undefined) delay = Math.max(delay, until - now);
  }
  return Math.ceil(delay);
}

function responseRateKey(response: Response, keys: ReturnType<typeof rateLimitKeys>): string {
  if (response.headers.get("X-RateLimit-Global") === "true") return keys.global;
  const scope = response.headers.get("X-RateLimit-Scope");
  return scope === "global" ? keys.global : scope === "shared" ? keys.shared : keys.route;
}

function parseSeconds(value: string | null): number | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function rememberExhaustedBucket(response: Response, keys: ReturnType<typeof rateLimitKeys>) {
  if (response.headers.get("X-RateLimit-Remaining")?.trim() !== "0") return;
  const delay = parseSeconds(response.headers.get("X-RateLimit-Reset-After"));
  if (delay !== null) rememberCooldown(responseRateKey(response, keys), Math.ceil(delay * 1000));
}

function waitForDiscordRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DiscordApiError("UNAVAILABLE"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(new DiscordApiError("UNAVAILABLE"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function discordRetryDelay(
  response: Response,
): Promise<{ delay: number | null; global: boolean }> {
  const headerSeconds = parseSeconds(response.headers.get("Retry-After"));
  const body = await response.json().catch(() => null);
  const bodySeconds =
    body && typeof body === "object" && typeof body.retry_after === "number"
      ? body.retry_after
      : null;
  const valid = [headerSeconds, bodySeconds].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  // Honor the longer server-provided delay if header rounding differs from its JSON value.
  return {
    delay: valid.length ? Math.ceil(Math.max(...valid) * 1_000) : null,
    global: Boolean(body && typeof body === "object" && body.global === true),
  };
}

/** Refresh is called only by a server-side, database-serialized token owner. */
export async function refreshDiscordOAuthTokens(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<DiscordOAuthTokens> {
  assertDiscordId(input.clientId);
  try {
    const tokenHash = createHash("sha256").update(input.refreshToken).digest("hex");
    const rateKeys = {
      route: `refresh:${input.clientId}:${tokenHash}`,
      global: `refresh:global:${input.clientId}`,
      shared: `refresh:shared:${input.clientId}`,
    };
    const cooldown = cooldownDelay(rateKeys);
    if (cooldown > 0) throw new DiscordApiError("UNAVAILABLE", 429, cooldown / 1000);
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 429) {
      const { delay, global } = await discordRetryDelay(response);
      if (delay !== null)
        rememberCooldown(global ? rateKeys.global : responseRateKey(response, rateKeys), delay);
      throw new DiscordApiError("UNAVAILABLE", 429, delay === null ? null : delay / 1000);
    }
    rememberExhaustedBucket(response, rateKeys);
    if (response.status === 400 || response.status === 401) {
      const error = await response.json().catch(() => null);
      // invalid_client is application configuration, not proof that a user's grant was revoked.
      const invalidGrant = error && typeof error === "object" && error.error === "invalid_grant";
      throw new DiscordApiError(invalidGrant ? "UNAUTHORIZED" : "UNAVAILABLE", response.status);
    }
    if (!response.ok) throw new DiscordApiError("UNAVAILABLE", response.status);
    const parsed = oauthTokensSchema.safeParse(await response.json());
    if (!parsed.success) throw new DiscordApiError("UNAVAILABLE", response.status);
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresIn: parsed.data.expires_in,
      scope: parsed.data.scope,
    };
  } catch (error) {
    if (error instanceof DiscordApiError) throw error;
    throw new DiscordApiError("UNAVAILABLE");
  }
}

async function fetchCurrentDiscordGuildMember(
  guildId: string,
  accessToken: string,
): Promise<DiscordGuildMember | null> {
  assertDiscordId(guildId);
  try {
    const deadline = performance.now() + 8_000;
    const signal = AbortSignal.timeout(8_000);
    const rateKeys = rateLimitKeys(guildId, accessToken);
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      if (performance.now() >= deadline) throw new DiscordApiError("UNAVAILABLE");
      const cooldown = cooldownDelay(rateKeys);
      if (cooldown > 0) {
        if (cooldown >= deadline - performance.now())
          throw new DiscordApiError("UNAVAILABLE", 429, cooldown / 1000);
        await waitForDiscordRetry(cooldown, signal);
        // A concurrent response may extend the same cooldown while this request waits.
        if (cooldownDelay(rateKeys) > 0) {
          attempt--;
          continue;
        }
      }
      response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal,
      });
      if (performance.now() >= deadline) throw new DiscordApiError("UNAVAILABLE", response.status);
      if (response.status !== 429) {
        rememberExhaustedBucket(response, rateKeys);
        break;
      }
      const { delay, global } = await discordRetryDelay(response);
      if (delay !== null)
        rememberCooldown(global ? rateKeys.global : responseRateKey(response, rateKeys), delay);
      if (attempt >= 2 || delay === null || delay >= deadline - performance.now())
        throw new DiscordApiError("UNAVAILABLE", 429, delay === null ? null : delay / 1000);
    }
    if (response.status === 401) throw new DiscordApiError("UNAUTHORIZED", 401);
    if (response.status === 404) {
      const body = await response.json().catch(() => null);
      // 10007 is Unknown Member. Unknown Guild/configuration and missing scopes are not a leave.
      if (body && typeof body === "object" && body.code === 10007) return null;
    }
    if (!response.ok) throw new DiscordApiError("UNAVAILABLE", response.status);
    const parsed = guildMemberSchema.safeParse(await response.json());
    if (!parsed.success) throw new DiscordApiError("UNAVAILABLE", response.status);
    return {
      userId: parsed.data.user.id,
      nickname: parsed.data.nick ?? null,
      roleIds: parsed.data.roles,
      source: "LIVE",
    };
  } catch (error) {
    if (error instanceof DiscordApiError) throw error;
    throw new DiscordApiError("UNAVAILABLE");
  }
}

/**
 * Only concurrent pending checks for this grant/guild share the same live HTTP result.
 * The entry is removed on either resolution or rejection; every later request checks anew.
 * OAuth tokens are consumed server-side and never returned to callers or map keys.
 */
export async function getCurrentDiscordGuildMember(
  guildId: string,
  accessToken: string,
): Promise<DiscordGuildMember | null> {
  assertDiscordId(guildId);
  const key = rateLimitKeys(guildId, accessToken).route;
  const existing = discordMemberInFlight.get(key);
  if (existing) return existing;
  const pending = fetchCurrentDiscordGuildMember(guildId, accessToken).finally(() => {
    if (discordMemberInFlight.get(key) === pending) discordMemberInFlight.delete(key);
  });
  discordMemberInFlight.set(key, pending);
  return pending;
}

/** Bot adapter is foundation only: constructing it does not run a Discord bot. */
export function createLiveDiscordAdapter(botToken: string): DiscordAdapter {
  if (!botToken) throw new Error("A server-only Discord bot token is required.");
  return {
    async getGuildMember(guildId, userId) {
      assertDiscordId(guildId);
      assertDiscordId(userId);
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
        {
          headers: { Authorization: `Bot ${botToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Discord member lookup failed (${response.status}).`);
      const member = guildMemberSchema.parse(await response.json());
      return {
        userId: member.user.id,
        nickname: member.nick ?? null,
        roleIds: member.roles,
        source: "LIVE",
      };
    },
    async getGuildOnlineCount(guildId) {
      assertDiscordId(guildId);
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
        {
          headers: { Authorization: `Bot ${botToken}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) throw new Error(`Discord guild lookup failed (${response.status}).`);
      const guild = z
        .object({ approximate_presence_count: z.number().int().nonnegative().optional() })
        .parse(await response.json());
      return guild.approximate_presence_count ?? null;
    },
    getChannelLink: buildDiscordChannelLink,
  };
}
