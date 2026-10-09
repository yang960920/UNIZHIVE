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
vi.mock("../src/lib/server/member-management", () => ({
  saveOwnProfileSettings: boundary.persist,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));

import { saveProfileSettings } from "../src/app/settings/profile-actions";
import { ProfileImageError } from "../src/lib/server/profile-image-processing";
import { MemberManagementError } from "../src/lib/member-policy";

const actor = {
  id: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
  name: "Profile Settings Verification",
  role: "MEMBER" as const,
  isMock: false,
};
const fields = {
  handle: "settings_test",
  displayName: "설정 검증",
  nickname: "게임 검증",
  uid: "private-settings-fixture",
  bio: "프로필 소개",
};
const normalized = { content: Buffer.from("normalized-webp"), revision: "a".repeat(64) };
const saved = {
  imageUrl: `/api/profile/image/2c1f0c31-5506-472e-bc57-a27955d57be9?v=${normalized.revision}`,
  hasCustomImage: true,
};
function form(action: "KEEP" | "UPLOAD" | "REMOVE" | null = "KEEP") {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  if (action !== null) data.set("imageAction", action);
  if (action === "UPLOAD")
    data.set("image", new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" }));
  return data;
}
beforeEach(() => {
  boundary.state = { user: actor, status: "AUTHENTICATED" };
  boundary.auth.mockReset().mockImplementation(async () => boundary.state);
  boundary.normalize.mockReset().mockResolvedValue(normalized);
  boundary.persist.mockReset().mockResolvedValue(saved);
  boundary.revalidate.mockClear();
});

describe("one atomic save for profile fields and a staged avatar", () => {
  it.each(["GUEST", "LEFT", "REAUTH_REQUIRED", "UNAVAILABLE"] as const)(
    "denies %s before inspecting or saving image/profile data",
    async (status) => {
      boundary.state = { user: actor, status };
      for (const action of ["KEEP", "UPLOAD", "REMOVE"] as const)
        expect((await saveProfileSettings(form(action))).ok).toBe(false);
      expect(boundary.normalize).not.toHaveBeenCalled();
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it("denies absent and rejected identities without persisting either part", async () => {
    for (const user of [null, { ...actor, role: "GUEST" as const }]) {
      boundary.state = { user, status: "AUTHENTICATED" };
      expect((await saveProfileSettings(form("UPLOAD"))).ok).toBe(false);
    }
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });

  it.each(["APPLICANT", "MEMBER", "OFFICER", "ADMIN"] as const)(
    "submits profile and normalized avatar in one repository call for %s",
    async (role) => {
      const user = { ...actor, role };
      boundary.state = { user, status: "AUTHENTICATED" };
      const input = form("UPLOAD");
      const result = await saveProfileSettings(input);
      expect(result.ok).toBe(true);
      expect(result).toMatchObject(saved);
      expect(boundary.normalize).toHaveBeenCalledExactlyOnceWith(input.get("image"));
      expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(
        { targetId: user.id, ...fields },
        normalized,
      );
      expect(boundary.revalidate).toHaveBeenCalledWith("/", "layout");
      expect(JSON.stringify(result)).not.toContain(fields.uid);
      expect(result).not.toHaveProperty("content");
      expect(result).not.toHaveProperty("revision");
    },
  );

  it.each(["KEEP", null] as const)(
    "preserves the avatar when imageAction is %s",
    async (action) => {
      boundary.persist.mockResolvedValue(null);
      const result = await saveProfileSettings(form(action));
      expect(result.ok).toBe(true);
      expect(boundary.normalize).not.toHaveBeenCalled();
      expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(
        { targetId: actor.id, ...fields },
        undefined,
      );
      expect(result).not.toHaveProperty("imageUrl");
      expect(result).not.toHaveProperty("hasCustomImage");
    },
  );

  it("stages removal with profile fields in the same save and returns the default avatar", async () => {
    boundary.persist.mockResolvedValue({ imageUrl: null, hasCustomImage: false });
    const result = await saveProfileSettings(form("REMOVE"));
    expect(result).toMatchObject({ ok: true, imageUrl: null, hasCustomImage: false });
    expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(
      { targetId: actor.id, ...fields },
      null,
    );
    expect(boundary.normalize).not.toHaveBeenCalled();
  });

  it("normalizes textual fields while deriving the owner exclusively from the session", async () => {
    const input = form();
    input.set("handle", " SETTINGS_TEST ");
    input.set("displayName", "  설정 검증  ");
    input.set("nickname", "  게임 검증  ");
    input.set("uid", " private-settings-fixture ");
    input.set("bio", " 프로필 소개 ");
    expect((await saveProfileSettings(input)).ok).toBe(true);
    expect(boundary.persist).toHaveBeenCalledExactlyOnceWith(
      { targetId: actor.id, ...fields },
      undefined,
    );
  });

  it.each(["targetId", "userId", "role", "imageUrl", "content", "revision"])(
    "rejects a submitted %s without invoking either mutation",
    async (key) => {
      const input = form("UPLOAD");
      input.set(key, "other-account");
      expect((await saveProfileSettings(input)).ok).toBe(false);
      expect(boundary.normalize).not.toHaveBeenCalled();
      expect(boundary.persist).not.toHaveBeenCalled();
      expect(boundary.revalidate).not.toHaveBeenCalled();
    },
  );

  it.each(["handle", "displayName", "nickname", "uid"])(
    "validates %s before decoding a staged avatar or writing profile fields",
    async (key) => {
      const input = form("UPLOAD");
      input.set(key, "");
      expect((await saveProfileSettings(input)).ok).toBe(false);
      expect(boundary.normalize).not.toHaveBeenCalled();
      expect(boundary.persist).not.toHaveBeenCalled();
    },
  );

  it("rejects duplicate textual fields, avatar actions and files", async () => {
    const inputs = ["handle", "displayName", "nickname", "uid", "bio", "imageAction"].map((key) => {
      const input = form("UPLOAD");
      input.append(key, "duplicate");
      return input;
    });
    const duplicateFile = form("UPLOAD");
    duplicateFile.append("image", new File(["other"], "other.png", { type: "image/png" }));
    inputs.push(duplicateFile);
    for (const input of inputs) expect((await saveProfileSettings(input)).ok).toBe(false);
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });

  it("rejects an unknown action, missing upload or file attached to KEEP/REMOVE", async () => {
    const unknown = form();
    unknown.set("imageAction", "CHANGE_OTHER_ACCOUNT");
    const missing = form("UPLOAD");
    missing.delete("image");
    const urlInsteadOfFile = form("UPLOAD");
    urlInsteadOfFile.set("image", "https://example.com/avatar.png");
    const accidentalKeep = form("UPLOAD");
    accidentalKeep.set("imageAction", "KEEP");
    const accidentalRemove = form("UPLOAD");
    accidentalRemove.set("imageAction", "REMOVE");
    for (const input of [unknown, missing, urlInsteadOfFile, accidentalKeep, accidentalRemove])
      expect((await saveProfileSettings(input)).ok).toBe(false);
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });

  it("prevents invalid avatar bytes from partially saving valid profile fields", async () => {
    boundary.normalize.mockRejectedValue(new ProfileImageError("이미지를 읽을 수 없습니다."));
    const result = await saveProfileSettings(form("UPLOAD"));
    expect(result).toEqual({ ok: false, message: "이미지를 읽을 수 없습니다." });
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("reports a safe domain error without a success avatar or revalidation", async () => {
    boundary.persist.mockRejectedValue(new MemberManagementError("프로필 정보를 확인해 주세요."));
    const result = await saveProfileSettings(form("UPLOAD"));
    expect(result).toEqual({ ok: false, message: "프로필 정보를 확인해 주세요." });
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("does not expose database diagnostics or claim partial success", async () => {
    boundary.persist.mockRejectedValue(
      new Error("postgres private-fixture-uid private-fixture-token bytea"),
    );
    const result = await saveProfileSettings(form("UPLOAD"));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("imageUrl");
    expect(result).not.toHaveProperty("hasCustomImage");
    expect(result.message).not.toMatch(/postgres|private-fixture-uid|private-fixture-token|bytea/);
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("keeps development profile/avatar previews away from actual persistence", async () => {
    boundary.state = {
      user: { ...actor, id: "demo-member", isMock: true },
      status: "AUTHENTICATED",
    };
    for (const action of ["KEEP", "UPLOAD", "REMOVE"] as const)
      expect((await saveProfileSettings(form(action))).ok).toBe(action === "KEEP");
    expect(boundary.normalize).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
  });
});
