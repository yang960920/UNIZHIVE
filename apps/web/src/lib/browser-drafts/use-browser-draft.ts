"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUserPreferences } from "@/components/user-preferences-provider";
import {
  browserDraftError,
  deleteBrowserDraft,
  draftFingerprint,
  markBrowserDraftPublished,
  readBrowserDrafts,
  writeBrowserDraft,
  type BrowserDraftRecord,
} from "./store";

export interface BrowserDraftController {
  hydrated: boolean;
  status: "idle" | "saving" | "saved" | "error";
  savedAt: number | null;
  restored: boolean;
  error: string | null;
  recoveryKey: number;
  recoveries: { id: string; savedAt: number }[];
  restoreRecovery: (id: string) => Promise<void>;
  saveNow: () => Promise<boolean>;
  clear: () => Promise<void>;
}

export function useBrowserDraft<T>(options: {
  scope: string;
  value: T;
  hasContent: boolean;
  enabled?: boolean;
  restore: (value: T) => void;
  validate?: (value: unknown) => value is T;
}): BrowserDraftController {
  const { userKey } = useUserPreferences();
  const enabled = options.enabled !== false && userKey !== "visitor";
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const baseline = useRef(draftFingerprint(options.value));
  const record = useRef<BrowserDraftRecord<T> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(false);
  const cleared = useRef(false);
  const loaded = useRef(false);
  const writer = useRef("");
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<BrowserDraftController["status"]>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState(0);
  const [recoveries, setRecoveries] = useState<BrowserDraftController["recoveries"]>([]);
  const scope = options.scope;

  const refreshRecoveries = useCallback(async () => {
    const entries = await readBrowserDrafts<T>(userKey, scope);
    const seen = new Set<string>();
    const distinct = entries.filter((entry) => {
      if (
        seen.has(entry.fingerprint) ||
        (latest.current.validate && !latest.current.validate(entry.value))
      )
        return false;
      seen.add(entry.fingerprint);
      return true;
    });
    if (alive.current) setRecoveries(distinct.map(({ id, savedAt: at }) => ({ id, savedAt: at })));
    return distinct;
  }, [scope, userKey]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!enabled || !loaded.current || cleared.current) return false;
    const value = latest.current.value;
    const fingerprint = draftFingerprint(value);
    // Queue snapshots so slow image writes cannot replace newer input.
    const task = queue.current.then(async () => {
      if (cleared.current) return false;
      // Compare after earlier writes finish: reverting to the old value while a
      // different snapshot is in flight must still commit that reverted value.
      if (fingerprint === baseline.current && record.current) return true;
      if (alive.current) {
        setStatus("saving");
        setError(null);
      }
      try {
        const saved = await writeBrowserDraft({
          owner: userKey,
          scope,
          writer: writer.current,
          value,
          previous: record.current,
        });
        record.current = saved;
        baseline.current = fingerprint;
        if (alive.current) {
          setSavedAt(saved.savedAt);
          setStatus(draftFingerprint(latest.current.value) === fingerprint ? "saved" : "idle");
          void refreshRecoveries().catch(() => {});
        }
        return true;
      } catch (cause) {
        if (alive.current) {
          setStatus("error");
          setError(browserDraftError(cause));
        }
        return false;
      }
    });
    queue.current = task;
    return task;
  }, [enabled, refreshRecoveries, scope, userKey]);

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    if (!enabled) {
      // A successful submission disables the editor while clear() is awaiting its
      // transaction. Keep its record and stopped latch until that cleanup finishes.
      loaded.current = true;
      queueMicrotask(() => {
        if (alive.current) setHydrated(true);
      });
      return () => {
        alive.current = false;
      };
    }
    cleared.current = false;
    loaded.current = false;
    writer.current = crypto.randomUUID();
    record.current = null;
    queueMicrotask(() => {
      if (!cancelled) setHydrated(false);
    });
    void refreshRecoveries()
      .then((entries) => {
        if (cancelled) return;
        const saved = entries[0];
        if (saved) {
          record.current = saved;
          baseline.current = draftFingerprint(saved.value);
          latest.current.restore(saved.value);
          setRestored(true);
          setSavedAt(saved.savedAt);
          setStatus("saved");
        } else baseline.current = draftFingerprint(latest.current.value);
      })
      .catch((cause) => {
        if (!cancelled) {
          setStatus("error");
          setError(browserDraftError(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          loaded.current = true;
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
      alive.current = false;
      if (
        loaded.current &&
        !cleared.current &&
        (record.current || latest.current.hasContent) &&
        draftFingerprint(latest.current.value) !== baseline.current
      )
        void saveNow();
    };
  }, [enabled, refreshRecoveries, saveNow]);

  const fingerprint = draftFingerprint(options.value);
  useEffect(() => {
    if (!hydrated || !enabled || cleared.current || fingerprint === baseline.current) return;
    if (!record.current && !latest.current.hasContent) return;
    queueMicrotask(() => {
      if (alive.current && !cleared.current)
        setStatus((current) => (current === "error" || current === "saving" ? current : "idle"));
    });
    const timer = setTimeout(() => {
      void saveNow();
    }, 1000);
    return () => clearTimeout(timer);
  }, [enabled, fingerprint, hydrated, saveNow]);

  useEffect(() => {
    if (!hydrated || !enabled) return;
    const flush = () => {
      if (
        draftFingerprint(latest.current.value) !== baseline.current &&
        (record.current || latest.current.hasContent)
      )
        void saveNow();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const timer = setInterval(flush, 5000);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [enabled, hydrated, saveNow]);

  const clear = useCallback(async () => {
    cleared.current = true;
    await queue.current;
    const saved = record.current;
    if (saved) {
      markBrowserDraftPublished(saved);
      try {
        await deleteBrowserDraft(saved);
      } catch {
        // Retry a transient local-storage failure, while preserving publication success.
        try {
          await deleteBrowserDraft(saved);
        } catch {
          /* The server write already succeeded. */
        }
      }
    }
    record.current = null;
  }, []);

  const restoreRecovery = useCallback(
    async (id: string) => {
      // Keep the current version before switching to another tab's saved draft.
      if (draftFingerprint(latest.current.value) !== baseline.current && !(await saveNow())) return;
      try {
        const entries = await refreshRecoveries();
        const saved = entries.find((entry) => entry.id === id);
        if (!saved || cleared.current) return;
        record.current = saved;
        baseline.current = draftFingerprint(saved.value);
        latest.current.restore(saved.value);
        setRecoveryKey((key) => key + 1);
        setRestored(true);
        setSavedAt(saved.savedAt);
        setStatus("saved");
        setError(null);
      } catch (cause) {
        setStatus("error");
        setError(browserDraftError(cause));
      }
    },
    [refreshRecoveries, saveNow],
  );

  return {
    hydrated,
    status,
    savedAt,
    restored,
    error,
    recoveryKey,
    recoveries,
    restoreRecovery,
    saveNow,
    clear,
  };
}
