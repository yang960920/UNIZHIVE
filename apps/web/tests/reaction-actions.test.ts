import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ save: vi.fn(), revalidate: vi.fn() }));
vi.mock("../src/lib/server/reactions", () => ({ setReaction: boundary.save }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));
import { saveReaction } from "../src/lib/reaction-actions";
import { CommunityError } from "../src/lib/community-policy";
const input = {
  kind: "COMMUNITY_POST",
  targetId: "2c1f0c31-5506-472e-bc57-a27955d57be9",
  liked: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  boundary.save.mockResolvedValue({ likeCount: 2, likedByMe: true });
});
describe("explicit desired-state reactions", () => {
  it.each(["COMMUNITY_POST", "COMMUNITY_COMMENT", "BUILD"])(
    "returns confirmed %s counts and refreshes only after success",
    async (kind) => {
      const result = await saveReaction({ ...input, kind });
      expect(result).toMatchObject({ ok: true, likeCount: 2, likedByMe: true });
      expect(boundary.save).toHaveBeenCalledExactlyOnceWith({ ...input, kind });
      expect(boundary.revalidate).toHaveBeenCalledWith(
        kind === "BUILD" ? "/lab" : "/community",
        "layout",
      );
    },
  );
  it("passes an explicit removal state and returns server counts", async () => {
    boundary.save.mockResolvedValue({ likeCount: 1, likedByMe: false });
    expect(await saveReaction({ ...input, liked: false })).toMatchObject({
      ok: true,
      likeCount: 1,
      likedByMe: false,
    });
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith({ ...input, liked: false });
  });
  it("rejects forged principals before delegating or revalidating", async () => {
    expect((await saveReaction({ ...input, userId: "other-user" })).ok).toBe(false);
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });
  it.each([new CommunityError("FORBIDDEN"), new Error("postgres private-token game-uid")])(
    "leaves counts unchanged and hides diagnostics on failure",
    async (error) => {
      boundary.save.mockRejectedValue(error);
      const result = await saveReaction(input);
      expect(result.ok).toBe(false);
      expect(result).not.toHaveProperty("likeCount");
      expect(result).not.toHaveProperty("likedByMe");
      expect(result.message).not.toMatch(/postgres|private-token|game-uid/);
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );
});
