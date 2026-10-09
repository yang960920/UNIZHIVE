"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  canRsvpOperation,
  canUpdateOwnMigration,
  canVoteInSeason,
  MIGRATION_STATUSES,
  RSVP_STATUSES,
  type HiveRole,
  type MigrationStatus,
  type RSVPStatus,
} from "@uniz/domain";
import { currentSeason, DEMO_NOW } from "../mocks/current-season";
import {
  getDashboardData,
  mockVoteCandidates,
  type DemoOverrides,
  type DemoUserOverride,
} from "../mocks/dashboard";
import { mockMembers } from "../mocks/members";

const STORAGE_KEY = "uniz-hive:demo:season-13:v1";
const overrideSchema = z
  .object({
    rsvp: z.enum(RSVP_STATUSES).optional(),
    migrationStatus: z.enum(MIGRATION_STATUSES).optional(),
    candidateId: z
      .string()
      .refine((id) => mockVoteCandidates.some((candidate) => candidate.id === id))
      .optional(),
  })
  .strict();
const storageSchema = z
  .object({
    version: z.literal(1),
    seasonId: z.literal("season-13"),
    overrides: z.record(z.string(), overrideSchema),
  })
  .strict();

interface DemoSnapshot {
  overrides: DemoOverrides;
  hydrated: boolean;
  storageAvailable: boolean;
}
const serverSnapshot: DemoSnapshot = { overrides: {}, hydrated: false, storageAvailable: true };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}
function readStorage(): DemoSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    let candidate: unknown = { version: 1, seasonId: currentSeason.id, overrides: {} };
    if (raw) {
      try {
        candidate = JSON.parse(raw);
      } catch {
        return { overrides: {}, hydrated: true, storageAvailable: true };
      }
    }
    const result = storageSchema.safeParse(candidate);
    const overrides = result.success
      ? Object.fromEntries(
          Object.entries(result.data.overrides).filter(([id]) =>
            mockMembers.some((member) => member.userId === id),
          ),
        )
      : {};
    return { overrides, hydrated: true, storageAvailable: true };
  } catch {
    return { overrides: snapshot.overrides, hydrated: true, storageAvailable: false };
  }
}
function handleStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY || event.key === null) {
    snapshot = readStorage();
    announce();
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", handleStorage);
    snapshot = readStorage();
    announce();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
  };
}
function getSnapshot() {
  return snapshot;
}
function getServerSnapshot() {
  return serverSnapshot;
}
function writeOverride(userId: string, update: DemoUserOverride) {
  const parsed = overrideSchema.safeParse(update);
  if (!parsed.success) return false;
  const overrides = {
    ...snapshot.overrides,
    [userId]: { ...snapshot.overrides[userId], ...parsed.data },
  };
  let storageAvailable = snapshot.storageAvailable;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, seasonId: currentSeason.id, overrides }),
    );
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  snapshot = { overrides, hydrated: true, storageAvailable };
  announce();
  return true;
}

/** Local-only demonstration. No auth state, private UID, or live write is stored here. */
export function useDashboardData(userId?: string, role: HiveRole = "GUEST") {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const data = getDashboardData(userId, state.overrides);
  const knownMember = !!userId && mockMembers.some((member) => member.userId === userId);
  const canInteract = state.hydrated && knownMember;

  function setRsvp(status: RSVPStatus): boolean {
    if (
      !canInteract ||
      !userId ||
      !canRsvpOperation(role) ||
      !z.enum(RSVP_STATUSES).safeParse(status).success
    )
      return false;
    return writeOverride(userId, { rsvp: status });
  }
  function setVote(candidateId: string): boolean {
    if (
      !canInteract ||
      !userId ||
      !canVoteInSeason(role) ||
      DEMO_NOW >= data.vote.closesAt ||
      !mockVoteCandidates.some((candidate) => candidate.id === candidateId)
    )
      return false;
    return writeOverride(userId, { candidateId });
  }
  function setMigrationStatus(migrationStatus: MigrationStatus): boolean {
    if (
      !canInteract ||
      !userId ||
      !canUpdateOwnMigration(role) ||
      !z.enum(MIGRATION_STATUSES).safeParse(migrationStatus).success
    )
      return false;
    return writeOverride(userId, { migrationStatus });
  }
  function resetDemo() {
    if (!userId) return;
    const overrides = { ...state.overrides };
    delete overrides[userId];
    let storageAvailable = state.storageAvailable;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, seasonId: currentSeason.id, overrides }),
      );
    } catch {
      storageAvailable = false;
    }
    snapshot = { overrides, hydrated: true, storageAvailable };
    announce();
  }

  return {
    data,
    setRsvp,
    setVote,
    setMigrationStatus,
    resetDemo,
    hydrated: state.hydrated,
    storageAvailable: state.storageAvailable,
    canInteract,
  };
}

export const useHiveDemo = useDashboardData;
