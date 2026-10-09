import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DiscordApiError,
  getCurrentDiscordGuildMember,
  refreshDiscordOAuthTokens,
} from "../src/discord/live";

afterEach(() => {
  (
    globalThis as typeof globalThis & { __unizDiscordRateCooldowns?: Map<string, number> }
  ).__unizDiscordRateCooldowns?.clear();
  (
    globalThis as typeof globalThis & { __unizDiscordMemberInFlight?: Map<string, unknown> }
  ).__unizDiscordMemberInFlight?.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Discord OAuth transport", () => {
  it("shares only concurrent pending membership requests and performs a fresh leave check afterward", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveResponse = resolve)))
      .mockResolvedValueOnce(Response.json({ code: 10007 }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const requests = Array.from({ length: 8 }, () =>
      getCurrentDiscordGuildMember("123456789012345679", "private-token"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveResponse(Response.json({ user: { id: "123456789012345678" }, roles: [] }));
    expect((await Promise.all(requests)).every((member) => member?.source === "LIVE")).toBe(true);
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "private-token"),
    ).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    const state = globalThis as typeof globalThis & {
      __unizDiscordMemberInFlight?: Map<string, unknown>;
      __unizDiscordRateCooldowns?: Map<string, unknown>;
    };
    expect(state.__unizDiscordMemberInFlight?.size).toBe(0);
    expect([...state.__unizDiscordRateCooldowns!.keys()].join()).not.toContain("private-token");
  });

  it("removes rejected pending requests so an outage never becomes a cached membership verdict", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ user: { id: "123456789012345678" }, roles: [] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).resolves.toMatchObject({ source: "LIVE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("waits for a short Discord 429 retry_after and then verifies current membership within one budget", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ retry_after: 0.25 }, { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({ user: { id: "123456789012345678" }, nick: null, roles: [] }),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = getCurrentDiscordGuildMember("123456789012345679", "test-token");
    const resolved = expect(result).resolves.toMatchObject({
      userId: "123456789012345678",
      source: "LIVE",
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await resolved;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
    expect(fetcher.mock.calls[1][1].cache).toBe("no-store");
  });

  it("honors numeric Retry-After header when the JSON rate field is absent", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 429, headers: { "Retry-After": "0.1" } }))
      .mockResolvedValueOnce(Response.json({ user: { id: "123456789012345678" }, roles: [] }));
    vi.stubGlobal("fetch", fetcher);
    const resolved = expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).resolves.toMatchObject({ source: "LIVE" });
    await vi.advanceTimersByTimeAsync(100);
    await resolved;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([{ retry_after: 30 }, { retry_after: "0.1" }, { retry_after: -1 }, {}])(
    "denies oversized or malformed 429 delays without retrying (%j)",
    async (body) => {
      const fetcher = vi.fn().mockResolvedValue(Response.json(body, { status: 429 }));
      vi.stubGlobal("fetch", fetcher);
      await expect(
        getCurrentDiscordGuildMember("123456789012345679", "test-token"),
      ).rejects.toMatchObject({ kind: "UNAVAILABLE", status: 429 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("exposes only a validated server retry delay when a long rate limit cannot fit the request budget", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { retry_after: 260.25, message: "private-response", access_token: "private-token" },
          { status: 429, headers: { "Retry-After": "261" } },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const error = await getCurrentDiscordGuildMember("123456789012345679", "private-token").catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ kind: "UNAVAILABLE", status: 429, retryAfterSeconds: 261 });
    expect(JSON.stringify(error)).not.toContain("private-");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([NaN, Infinity, -1])("rejects unsafe retry metadata (%s)", (retryAfter) => {
    expect(new DiscordApiError("UNAVAILABLE", 429, retryAfter).retryAfterSeconds).toBeNull();
    expect(new DiscordApiError("UNAUTHORIZED", 401, 10).retryAfterSeconds).toBeNull();
  });

  it("honors a long cross-request cooldown without caching membership, then checks departure afresh", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ retry_after: 261 }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ code: 10007 }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const request = () => getCurrentDiscordGuildMember("123456789012345679", "test-token");
    await expect(request()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 261 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(request()).rejects.toMatchObject({ status: 429, retryAfterSeconds: 260 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(260_000);
    await expect(request()).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].cache).toBe("no-store");
  });

  it("keeps per-user route limits separate and honors global limits across guilds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ retry_after: 261 }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ user: { id: "123456789012345678" }, roles: [] }))
      .mockResolvedValueOnce(Response.json({ retry_after: 261, global: true }, { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "first-user-token"),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "second-user-token"),
    ).resolves.toMatchObject({ source: "LIVE" });
    await expect(
      getCurrentDiscordGuildMember("123456789012345680", "second-user-token"),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      getCurrentDiscordGuildMember("123456789012345681", "second-user-token"),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("honors a shared resource cooldown across tokens without blocking a different guild", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { retry_after: 261 },
          { status: 429, headers: { "X-RateLimit-Scope": "shared" } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ user: { id: "123456789012345678" }, roles: [] }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "first-user-token"),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "second-user-token"),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      getCurrentDiscordGuildMember("123456789012345680", "second-user-token"),
    ).resolves.toMatchObject({ source: "LIVE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("waits for an exhausted successful bucket before the next request and never reuses its membership result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { user: { id: "123456789012345678" }, roles: [] },
          { headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset-After": "0.5" } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ code: 10007 }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).resolves.toMatchObject({ source: "LIVE" });
    const next = expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(499);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("limits successive 429 responses to two retries and preserves the overall eight-second budget", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const fetcher = vi
      .fn()
      .mockImplementation(() => Response.json({ retry_after: 0.1 }, { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    const rejected = expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE", status: 429 });
    await vi.advanceTimersByTimeAsync(200);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(100);
    fetcher
      .mockReset()
      .mockImplementation(() => Response.json({ retry_after: 5 }, { status: 429 }));
    const bounded = expect(
      getCurrentDiscordGuildMember("123456789012345679", "test-token"),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE", status: 429 });
    await vi.advanceTimersByTimeAsync(5_000);
    await bounded;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("treats only Unknown Member as a confirmed leave; 403/Unknown Guild/outage fail closed", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValueOnce(Response.json({ code: 10007 }, { status: 404 }));
    await expect(getCurrentDiscordGuildMember("123456789012345678", "token")).resolves.toBeNull();
    for (const response of [
      Response.json({ code: 10004 }, { status: 404 }),
      Response.json({ code: 50001 }, { status: 403 }),
      Response.json({}, { status: 503 }),
    ]) {
      fetcher.mockResolvedValueOnce(response);
      await expect(
        getCurrentDiscordGuildMember("123456789012345678", "token"),
      ).rejects.toMatchObject({ kind: "UNAVAILABLE" });
    }
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(getCurrentDiscordGuildMember("123456789012345678", "token")).rejects.toMatchObject(
      { kind: "UNAUTHORIZED" },
    );
  });

  it("refreshes with a server-only form body and returns validated rotated credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 604800,
        token_type: "Bearer",
        scope: "identify guilds.members.read",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      refreshDiscordOAuthTokens({
        clientId: "123456789012345678",
        clientSecret: "test-secret",
        refreshToken: "old-refresh",
      }),
    ).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresIn: 604800,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://discord.com/api/oauth2/token");
    expect(url).not.toContain("test-secret");
    expect(options.cache).toBe("no-store");
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(options.body.get("grant_type")).toBe("refresh_token");
    expect(options.body.get("refresh_token")).toBe("old-refresh");
  });

  it("retains only hashed refresh cooldown metadata and exposes safe retry time", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { retry_after: 261, refresh_token: "private-refresh", message: "private-body" },
          { status: 429 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const input = {
      clientId: "123456789012345678",
      clientSecret: "private-secret",
      refreshToken: "private-refresh",
    };
    await expect(refreshDiscordOAuthTokens(input)).rejects.toMatchObject({
      kind: "UNAVAILABLE",
      status: 429,
      retryAfterSeconds: 261,
    });
    await expect(refreshDiscordOAuthTokens(input)).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const keys = [
      ...(
        globalThis as typeof globalThis & { __unizDiscordRateCooldowns: Map<string, unknown> }
      ).__unizDiscordRateCooldowns.keys(),
    ];
    expect(keys.join()).not.toContain("private-");
  });

  it("keeps private response bodies and malformed token fields out of thrown errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: "invalid_grant",
            access_token: "private-token",
            error_description: "private-refresh-token",
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: "private-token", token_type: "Bearer" }),
      );
    vi.stubGlobal("fetch", fetcher);
    const input = {
      clientId: "123456789012345678",
      clientSecret: "private-secret",
      refreshToken: "private-refresh-token",
    };
    await expect(refreshDiscordOAuthTokens(input)).rejects.toEqual(
      new DiscordApiError("UNAUTHORIZED", 400),
    );
    await expect(refreshDiscordOAuthTokens(input)).rejects.toEqual(
      new DiscordApiError("UNAVAILABLE", 200),
    );
  });

  it("preserves recoverable user grants when the application credentials are misconfigured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "invalid_client" }, { status: 401 })),
    );
    await expect(
      refreshDiscordOAuthTokens({
        clientId: "123456789012345678",
        clientSecret: "test-secret",
        refreshToken: "test-refresh",
      }),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE", status: 401 });
  });
});
