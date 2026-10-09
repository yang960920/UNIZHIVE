import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  beginMembershipVerification,
  finishMembershipVerification,
  hasMembershipSnapshot,
  invalidateMembershipSnapshot,
  invalidateUserMembershipSnapshots,
  MEMBERSHIP_SNAPSHOT_TTL_MS,
  publishMembershipSnapshot,
  type MembershipGeneration,
} from "../src/lib/server/discord-membership-cache";

const generation: MembershipGeneration = {
  userId: "private-user",
  guildId: "private-guild",
  discordId: "private-discord-identity",
  encryptedAccessToken: "private-ciphertext",
};
function seed(value = generation) {
  const verification = beginMembershipVerification(value);
  expect(publishMembershipSnapshot(verification)).toBe(true);
  finishMembershipVerification(verification);
}
beforeEach(() => {
  vi.useFakeTimers();
  invalidateUserMembershipSnapshots(generation.userId, { negative: false });
  invalidateUserMembershipSnapshots("different-user", { negative: false });
  (
    globalThis as typeof globalThis & { __unizDiscordMembershipInvalidations?: Map<string, number> }
  ).__unizDiscordMembershipInvalidations?.clear();
});
afterEach(() => {
  invalidateUserMembershipSnapshots(generation.userId, { negative: false });
  invalidateUserMembershipSnapshots("different-user", { negative: false });
  (
    globalThis as typeof globalThis & { __unizDiscordMembershipInvalidations?: Map<string, number> }
  ).__unizDiscordMembershipInvalidations?.clear();
  vi.useRealTimers();
});

describe("positive Discord membership evidence boundaries", () => {
  it("rejects an old external proof but accepts a new live verification begun after invalidation in the same millisecond", () => {
    const oldProofAt = Date.now();
    invalidateMembershipSnapshot(generation);
    const external = beginMembershipVerification(generation, oldProofAt, true);
    expect(publishMembershipSnapshot(external)).toBe(false);
    finishMembershipVerification(external);
    const current = beginMembershipVerification(generation);
    expect(publishMembershipSnapshot(current)).toBe(true);
    finishMembershipVerification(current);
    const olderExternal = beginMembershipVerification(generation, oldProofAt, true);
    expect(publishMembershipSnapshot(olderExternal)).toBe(false);
    finishMembershipVerification(olderExternal);
    expect(hasMembershipSnapshot(generation)).toBe(true);
  });

  it("isolates users, guilds, Discord identities and encrypted token generations, without storing roles or plaintext", () => {
    seed();
    expect(hasMembershipSnapshot(generation)).toBe(true);
    for (const changed of [
      { userId: "different-user" },
      { guildId: "different-guild" },
      { discordId: "different-discord" },
      { encryptedAccessToken: "different-ciphertext" },
    ])
      expect(hasMembershipSnapshot({ ...generation, ...changed })).toBe(false);
    const state = globalThis as typeof globalThis & {
      __unizDiscordMembershipSnapshots: Map<string, unknown>;
    };
    const serialized = JSON.stringify([...state.__unizDiscordMembershipSnapshots]);
    expect(serialized).not.toMatch(/private-|ADMIN|OFFICER|accessToken|refreshToken/);
  });

  it("anchors the deadline before delayed database publication and does not slide on hits", async () => {
    const verification = beginMembershipVerification(generation);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publishMembershipSnapshot(verification)).toBe(true);
    finishMembershipVerification(verification);
    await vi.advanceTimersByTimeAsync(MEMBERSHIP_SNAPSHOT_TTL_MS - 60_001);
    expect(hasMembershipSnapshot(generation)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(hasMembershipSnapshot(generation)).toBe(false);
    const delayed = beginMembershipVerification(generation);
    await vi.advanceTimersByTimeAsync(MEMBERSHIP_SNAPSHOT_TTL_MS);
    expect(publishMembershipSnapshot(delayed)).toBe(false);
    finishMembershipVerification(delayed);
  });

  it("invalidates older pending verification tickets without preventing a later fresh proof", () => {
    const old = beginMembershipVerification(generation);
    invalidateMembershipSnapshot(generation);
    const current = beginMembershipVerification(generation);
    expect(publishMembershipSnapshot(current)).toBe(true);
    expect(publishMembershipSnapshot(old)).toBe(false);
    finishMembershipVerification(old);
    finishMembershipVerification(current);
    expect(hasMembershipSnapshot(generation)).toBe(true);
    invalidateUserMembershipSnapshots(generation.userId);
    expect(hasMembershipSnapshot(generation)).toBe(false);
  });
});
