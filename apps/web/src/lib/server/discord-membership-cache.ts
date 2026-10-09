import "server-only";
import { createHash } from "node:crypto";

export const MEMBERSHIP_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

export interface MembershipGeneration {
  userId: string;
  guildId: string;
  discordId: string;
  encryptedAccessToken: string;
}

interface SnapshotState {
  ownerHash: string;
  expiresAt: number | null;
  pending: number;
}
export interface MembershipVerification {
  readonly key: string;
  readonly state: SnapshotState;
  readonly verifiedAt: number;
  readonly externalProof: boolean;
}

// Server-local positive membership evidence only. App roles and OAuth plaintext never enter
// this map. Object identity invalidates older pending checks when a negative result arrives.
const membershipGlobal = globalThis as typeof globalThis & {
  __unizDiscordMembershipSnapshots?: Map<string, SnapshotState>;
  __unizDiscordMembershipInvalidations?: Map<string, number>;
};
const snapshots = (membershipGlobal.__unizDiscordMembershipSnapshots ??= new Map<
  string,
  SnapshotState
>());
const invalidations = (membershipGlobal.__unizDiscordMembershipInvalidations ??= new Map<
  string,
  number
>());

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function generationKey(generation: MembershipGeneration): string {
  return hash(
    JSON.stringify([
      generation.userId,
      generation.guildId,
      generation.discordId,
      generation.encryptedAccessToken,
    ]),
  );
}
function removeExpired(now: number): void {
  for (const [key, state] of snapshots) {
    if ((state.expiresAt === null || state.expiresAt <= now) && state.pending === 0)
      snapshots.delete(key);
  }
  for (const [key, invalidatedAt] of invalidations) {
    if (invalidatedAt + MEMBERSHIP_SNAPSHOT_TTL_MS <= now) invalidations.delete(key);
  }
}

/** A hit never extends the five-minute evidence deadline. */
export function hasMembershipSnapshot(generation: MembershipGeneration): boolean {
  const now = Date.now();
  removeExpired(now);
  const state = snapshots.get(generationKey(generation));
  return state?.expiresAt !== null && state?.expiresAt !== undefined && state.expiresAt > now;
}

export function beginMembershipVerification(
  generation: MembershipGeneration,
  verifiedAt = Date.now(),
  externalProof = false,
): MembershipVerification {
  removeExpired(Date.now());
  const key = generationKey(generation);
  let state = snapshots.get(key);
  if (!state) {
    state = { ownerHash: hash(generation.userId), expiresAt: null, pending: 0 };
    snapshots.set(key, state);
  }
  state.pending++;
  return { key, state, verifiedAt, externalProof };
}

/** Publish only a newly confirmed positive result whose verification was not invalidated. */
export function publishMembershipSnapshot(verification: MembershipVerification): boolean {
  if (snapshots.get(verification.key) !== verification.state) return false;
  const now = Date.now();
  const expiresAt = verification.verifiedAt + MEMBERSHIP_SNAPSHOT_TTL_MS;
  if (
    !Number.isFinite(verification.verifiedAt) ||
    verification.verifiedAt > now ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  )
    return false;
  if (
    verification.externalProof &&
    verification.verifiedAt <=
      Math.max(
        invalidations.get(`generation:${verification.key}`) ?? Number.NEGATIVE_INFINITY,
        invalidations.get(`owner:${verification.state.ownerHash}`) ?? Number.NEGATIVE_INFINITY,
      )
  )
    return false;
  verification.state.expiresAt = Math.max(verification.state.expiresAt ?? 0, expiresAt);
  return true;
}

export function finishMembershipVerification(verification: MembershipVerification): void {
  verification.state.pending--;
  removeExpired(Date.now());
}

export function invalidateMembershipSnapshot(generation: MembershipGeneration): void {
  const key = generationKey(generation);
  invalidations.set(`generation:${key}`, Date.now());
  snapshots.delete(key);
}

export function invalidateUserMembershipSnapshots(
  userId: string,
  options: { negative?: boolean; except?: MembershipGeneration } = {},
): void {
  const ownerHash = hash(userId);
  if (options.negative !== false) invalidations.set(`owner:${ownerHash}`, Date.now());
  const exceptKey = options.except ? generationKey(options.except) : null;
  for (const [key, state] of snapshots) {
    if (state.ownerHash === ownerHash && key !== exceptKey) snapshots.delete(key);
  }
}
