import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  effect: null as (() => void | (() => void)) | null,
}));
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => {
    lifecycle.effect = effect;
  },
}));

import { SessionKeeper, stopSessionRenewal } from "../src/components/session-keeper";

const request = vi.fn();
let cleanup: (() => void) | undefined;

function mount(enabled = true) {
  expect(SessionKeeper({ enabled })).toBeNull();
  cleanup = lifecycle.effect?.() || undefined;
}

function visibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
  lifecycle.effect = null;
  cleanup = undefined;
  request.mockReset().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    }),
  );
  const browserDocument = new EventTarget();
  Object.defineProperty(browserDocument, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  vi.stubGlobal("document", browserDocument);
});

afterEach(() => {
  cleanup?.();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("signed browser session renewal lifecycle", () => {
  it("does not renew anonymous or mock sessions when disabled", async () => {
    mount(false);
    window.dispatchEvent(new Event("focus"));
    visibility("visible");
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renews the HTTP-only cookie on mount and every fifteen minutes using a same-origin uncached GET", async () => {
    mount();
    expect(request).toHaveBeenCalledWith("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("throttles focus and visibility events together and skips hidden-tab events", async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("focus"));
    visibility("visible");
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 1000);
    visibility("hidden");
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(1);
    visibility("visible");
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 1000);
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("keeps renewing after network failures and throttling without reading or trusting response roles", async () => {
    const readIdentity = vi.fn().mockResolvedValue({ user: { role: "ADMIN" } });
    request
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce({ ok: false, status: 429, json: readIdentity })
      .mockResolvedValueOnce({ ok: true, status: 200, json: readIdentity });
    mount();
    await vi.advanceTimersByTimeAsync(30 * 1000);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(30 * 1000);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(3);
    expect(readIdentity).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not overlap renewals and can retry a timed-out lookup", async () => {
    request.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(new Error("Timed out")), {
            once: true,
          });
        }),
    );
    mount();
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(1);
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(15 * 1000);
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(15 * 1000);
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("removes listeners and timers and aborts in-flight work when unmounted", async () => {
    request.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(new Error("Unmounted")), {
            once: true,
          });
        }),
    );
    mount();
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    cleanup?.();
    cleanup = undefined;
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("focus"));
    visibility("visible");
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops a pending renewal before sign-out and ignores its late completion and subsequent focus", async () => {
    let finishLookup: ((response: unknown) => void) | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
    );
    mount();
    const signal = request.mock.calls[0][1].signal as AbortSignal;
    stopSessionRenewal();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("focus"));
    visibility("visible");
    finishLookup?.({ ok: true, status: 200 });
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("makes sign-out and cleanup idempotent while allowing a fresh signed-in mount to renew", async () => {
    mount();
    stopSessionRenewal();
    stopSessionRenewal();
    cleanup?.();
    cleanup?.();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(30 * 1000);
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(1);
    mount();
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 1000);
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("cancels renewal on a cross-tab stop message and closes channel receivers during cleanup", async () => {
    const channels = new Set<RenewalChannel>();
    const messages: unknown[] = [];
    class RenewalChannel extends EventTarget {
      constructor(readonly name: string) {
        super();
        channels.add(this);
      }
      postMessage(data: unknown) {
        messages.push(data);
        for (const receiver of [...channels]) {
          if (receiver !== this && receiver.name === this.name)
            receiver.dispatchEvent(new MessageEvent("message", { data }));
        }
      }
      close() {
        channels.delete(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", RenewalChannel);
    mount();
    await vi.advanceTimersByTimeAsync(0);
    const otherTab = new RenewalChannel("uniz-session-renewal");
    otherTab.postMessage({ type: "OTHER_EVENT", role: "ADMIN" });
    await vi.advanceTimersByTimeAsync(30 * 1000);
    window.dispatchEvent(new Event("focus"));
    expect(request).toHaveBeenCalledTimes(2);
    otherTab.postMessage({ type: "STOP_RENEWAL" });
    expect(channels.size).toBe(1);
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(request).toHaveBeenCalledTimes(2);
    cleanup?.();
    cleanup = undefined;
    otherTab.close();
    mount();
    stopSessionRenewal();
    expect(messages.at(-1)).toEqual({ type: "STOP_RENEWAL" });
    expect(channels.size).toBe(0);
  });

  it("still cancels locally when the browser rejects channel creation", async () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("Messaging disabled");
        }
      },
    );
    mount();
    stopSessionRenewal();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
