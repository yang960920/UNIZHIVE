"use client";

import { useEffect } from "react";

const RENEWAL_INTERVAL_MS = 15 * 60 * 1000;
const EVENT_THROTTLE_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15 * 1000;
const STOP_RENEWAL_EVENT = "uniz:stop-session-renewal";
const RENEWAL_CHANNEL = "uniz-session-renewal";

function openRenewalChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel(RENEWAL_CHANNEL) : null;
  } catch {
    return null;
  }
}

/** Stop renewal before explicit sign-out so a pending GET cannot restore its cookie. */
export function stopSessionRenewal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STOP_RENEWAL_EVENT));
  const channel = openRenewalChannel();
  try {
    channel?.postMessage({ type: "STOP_RENEWAL" });
  } catch {
    // Local cancellation already succeeded if cross-tab messaging is unavailable.
  } finally {
    channel?.close();
  }
}

/** Refresh the HTTP-only session cookie; response identities never authorize the UI or a write. */
export function SessionKeeper({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let lastAttempt = Number.NEGATIVE_INFINITY;
    let activeRequest: AbortController | null = null;
    let requestTimeout: number | null = null;
    let interval: number | null = null;
    const channel = openRenewalChannel();

    async function renew() {
      const now = Date.now();
      if (stopped || activeRequest || now - lastAttempt < EVENT_THROTTLE_MS) return;
      lastAttempt = now;
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      requestTimeout = timeout;
      try {
        await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        // The browser applies Set-Cookie. Neither a failed lookup nor a returned role changes
        // this client's signed identity; protected reads and writes recheck authorization.
      } catch {
        // A timeout, network failure or throttled lookup never triggers an automatic sign-out.
      } finally {
        window.clearTimeout(timeout);
        if (requestTimeout === timeout) requestTimeout = null;
        if (activeRequest === controller) activeRequest = null;
      }
    }

    function renewWhenVisible() {
      if (document.visibilityState === "visible") void renew();
    }

    function onChannelMessage(event: MessageEvent<unknown>) {
      const message = event.data;
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === "STOP_RENEWAL"
      )
        stop();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (interval !== null) window.clearInterval(interval);
      if (requestTimeout !== null) window.clearTimeout(requestTimeout);
      window.removeEventListener("focus", renewWhenVisible);
      document.removeEventListener("visibilitychange", renewWhenVisible);
      window.removeEventListener(STOP_RENEWAL_EVENT, stop);
      channel?.removeEventListener("message", onChannelMessage);
      channel?.close();
      activeRequest?.abort();
    }

    void renew();
    interval = window.setInterval(() => void renew(), RENEWAL_INTERVAL_MS);
    window.addEventListener("focus", renewWhenVisible);
    document.addEventListener("visibilitychange", renewWhenVisible);
    window.addEventListener(STOP_RENEWAL_EVENT, stop);
    channel?.addEventListener("message", onChannelMessage);
    return stop;
  }, [enabled]);

  return null;
}
