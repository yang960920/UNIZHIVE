import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAuthState } from "../src/lib/auth-policy";

const boundary = vi.hoisted(() => ({
  state: { user: null, status: "GUEST" } as CurrentAuthState,
  auth: vi.fn(),
  normalize: vi.fn(),
  persist: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({ getCurrentAuthState: boundary.auth }));
vi.mock("../src/lib/server/profile-image-processing", () => ({
  normalizeProfileImage: boundary.normalize,
  ProfileImageError: class ProfileImageError extends Error {},
}));
vi.mock("../src/lib/server/profile-images", () => ({ persistProfileImage: boundary.persist }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));

import { saveProfileImage } from "../src/lib/profile-image-actions";
import { ProfileImageError } from "../src/lib/server/profile-image-processing";

const actor = {
  id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
  name: "프로필 이미지 테스트",
  role: "MEMBER" as const,
  isMock: false,
};
const saved = {
  imageUrl: `/api/profile/image/2c1f0c31-5506-472e-bc57-a27955d57be9?v=${"a".repeat(64)}`,
  hasCustomImage: true,
};
const normalized = { content: Buffer.from("normalized pixels"), revision: "a".repeat(64) };
function upload() {
  const form = new FormData();
  form.set("action", "UPLOAD");
  form.set("image", new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" }));
  return form;
}
function remove() {
  const form = new FormData();
  form.set("action", "REMOVE");
  return form;
}
beforeEach(() => {
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.auth.mockReset().mockImplementation(async () => boundary.state);
  boundary.normalize.mockReset().mockResolvedValue(normalized);
  boundary.persist.mockReset().mockResolvedValue(saved);
  boundary.revalidate.mockClear();
});

describe("own profile image actions", () => {
  it.each(["GUEST", "LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"] as const)(
    "denies upload and removal in %s even with an identity attached",
    async (status) => {
      boundary.state = { user: actor, status };
      expect((await saveProfileImage(upload())).ok).toBe(false);
      expect((await saveProfileImage(remove())).ok).toBe(false);
      expect(boundary.normalize).not.toHaveBeenCalled();
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it("denies a missing signed identity, rejected role and development previews", async () => {
    for (const user of [
      null,
      { ...actor, role: "GUEST" as const },
      { ...actor, id: "demo-member", isMock: true },
    ]) {
      boundary.state = { user, status: "AUTHENTICATED" };
      expect((await saveProfileImage(upload())).ok).toBe(false);
      expect((await saveProfileImage(remove())).ok).toBe(false);
    }
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });

  it.each(["APPLICANT", "MEMBER", "OFFICER", "ADMIN"] as const)(
    "normalizes and saves an authenticated %s under the server identity",
    async (role) => {
      const user = { ...actor, role };
      boundary.state = { user, status: "AUTHENTICATED" };
      const form = upload();
      expect(await saveProfileImage(form)).toEqual({
        ok: true,
        message: "프로필 이미지를 저장했습니다.",
        ...saved,
      });
      expect(boundary.normalize).toHaveBeenCalledExactlyOnceWith(form.get("image"));
      expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(user, normalized);
      expect(boundary.revalidate.mock.calls).toEqual([
        ["/", "layout"],
        ["/members"],
        ["/admin/members"],
      ]);
    },
  );

  it("removes only the authenticated user's custom image without reading image bytes", async () => {
    boundary.persist.mockResolvedValue({ imageUrl: null, hasCustomImage: false });
    expect(await saveProfileImage(remove())).toEqual({
      ok: true,
      message: "기본 이미지로 변경했습니다.",
      imageUrl: null,
      hasCustomImage: false,
    });
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(actor, null);
  });

  it.each(["userId", "targetId", "role", "revision", "imageUrl"])(
    "rejects the submitted %s instead of targeting another account or asset",
    async (key) => {
      for (const form of [upload(), remove()]) {
        form.set(key, "another-account");
        expect((await saveProfileImage(form)).ok).toBe(false);
      }
      expect(boundary.normalize).not.toHaveBeenCalled();
      expect(boundary.persist).not.toHaveBeenCalled();
    },
  );

  it("rejects missing, unknown or duplicate actions and missing or duplicate files", async () => {
    const missingAction = upload();
    missingAction.delete("action");
    const unknownAction = upload();
    unknownAction.set("action", "REPLACE_USER");
    const duplicateAction = upload();
    duplicateAction.append("action", "REMOVE");
    const missingFile = upload();
    missingFile.delete("image");
    const stringFile = upload();
    stringFile.set("image", "https://example.com/avatar.png");
    const duplicateFile = upload();
    duplicateFile.append("image", new File(["other"], "other.png", { type: "image/png" }));
    const removalWithFile = upload();
    removalWithFile.set("action", "REMOVE");
    for (const form of [
      missingAction,
      unknownAction,
      duplicateAction,
      missingFile,
      stringFile,
      duplicateFile,
      removalWithFile,
    ])
      expect((await saveProfileImage(form)).ok).toBe(false);
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });

  it("reports a safe decoding error without any write or cache update", async () => {
    boundary.normalize.mockRejectedValue(new ProfileImageError("이미지를 읽을 수 없습니다."));
    expect(await saveProfileImage(upload())).toEqual({
      ok: false,
      message: "이미지를 읽을 수 없습니다.",
    });
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("does not expose decoder, database, UID or token diagnostics after a failed write", async () => {
    boundary.persist.mockRejectedValue(
      new Error("postgres private-uid oauth-token raw-image-bytes"),
    );
    const result = await saveProfileImage(upload());
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("imageUrl");
    expect(result).not.toHaveProperty("hasCustomImage");
    expect(result.message).not.toMatch(/postgres|private-uid|oauth-token|raw-image-bytes/);
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("rechecks the session on every mutation and leaves an existing image unchanged after departure", async () => {
    await saveProfileImage(upload());
    boundary.normalize.mockClear();
    boundary.persist.mockClear();
    boundary.revalidate.mockClear();
    boundary.state = { user: actor, status: "LEFT" };
    expect((await saveProfileImage(remove())).ok).toBe(false);
    expect(boundary.auth).toHaveBeenCalledTimes(2);
    expect(boundary.persist).not.toHaveBeenCalled();
  });
});
