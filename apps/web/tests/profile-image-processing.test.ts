import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_SIZE,
  profileImageUrl,
  validateProfileImageFile,
} from "../src/lib/profile-image";
import {
  normalizeProfileImage,
  ProfileImageError,
} from "../src/lib/server/profile-image-processing";

function file(content: Uint8Array, type: string, name = "profile-image") {
  return new File([new Uint8Array(content)], name, { type });
}

describe("decoded personal profile images", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "decodes %s and stores a bounded 512px WebP with a content revision",
    async (format) => {
      const input = await sharp({
        create: { width: 80, height: 40, channels: 4, background: "#23ddb4" },
      })
        .toFormat(format)
        .toBuffer();
      const result = await normalizeProfileImage(file(input, `image/${format}`));
      const metadata = await sharp(result.content).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(PROFILE_IMAGE_SIZE);
      expect(metadata.height).toBe(PROFILE_IMAGE_SIZE);
      expect(metadata.pages ?? 1).toBe(1);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content.length).toBeLessThanOrEqual(512 * 1024);
      expect(result.revision).toBe(createHash("sha256").update(result.content).digest("hex"));
      expect(result.content.equals(input)).toBe(false);
    },
  );

  it.each(["png", "webp"] as const)(
    "preserves fully transparent, translucent and opaque pixels from a %s cutout",
    async (format) => {
      const pixels = Buffer.alloc(64 * 64 * 4);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const offset = (y * 64 + x) * 4;
          pixels[offset] = 32;
          pixels[offset + 1] = 220;
          pixels[offset + 2] = 180;
          pixels[offset + 3] = x < 16 ? 0 : x < 48 ? 128 : 255;
        }
      const input = await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } })
        .toFormat(format)
        .toBuffer();
      expect((await sharp(input).metadata()).hasAlpha).toBe(true);

      const { content } = await normalizeProfileImage(file(input, `image/${format}`));
      const metadata = await sharp(content).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(PROFILE_IMAGE_SIZE);
      expect(metadata.height).toBe(PROFILE_IMAGE_SIZE);
      expect(metadata.hasAlpha).toBe(true);
      const decoded = await sharp(content).ensureAlpha().raw().toBuffer();
      for (const y of [64, 256, 448]) {
        expect(decoded[(y * 512 + 64) * 4 + 3]).toBe(0);
        expect(decoded[(y * 512 + 256) * 4 + 3]).toBe(128);
        expect(decoded[(y * 512 + 448) * 4 + 3]).toBe(255);
      }
    },
  );

  it("honors orientation while stripping EXIF, author data and color profiles", async () => {
    const pixels = Buffer.alloc(20 * 10 * 3);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 20; x++) {
        const offset = (y * 20 + x) * 3;
        pixels[offset] = x < 10 ? 255 : 0;
        pixels[offset + 2] = x < 10 ? 0 : 255;
      }
    const input = await sharp(pixels, { raw: { width: 20, height: 10, channels: 3 } })
      .withExif({ IFD0: { Artist: "private-profile-author", Copyright: "private-copyright" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif?.length).toBeGreaterThan(0);
    const { content } = await normalizeProfileImage(file(input, "image/jpeg"));
    const metadata = await sharp(content).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    const decoded = await sharp(content).removeAlpha().raw().toBuffer();
    const top = (128 * 512 + 256) * 3;
    const bottom = (384 * 512 + 256) * 3;
    expect(decoded[top]).toBeGreaterThan(decoded[top + 2]);
    expect(decoded[bottom + 2]).toBeGreaterThan(decoded[bottom]);
    expect(content.includes(Buffer.from("private-profile-author"))).toBe(false);
  });

  it("rejects valid animated WebP instead of silently retaining its first frame", async () => {
    const pixels = Buffer.alloc(16 * 32 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = offset < 16 * 16 * 4 ? 255 : 0;
      pixels[offset + 2] = offset < 16 * 16 * 4 ? 0 : 255;
      pixels[offset + 3] = 255;
    }
    const animated = await sharp(pixels, {
      raw: { width: 16, height: 32, channels: 4, pageHeight: 16 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(normalizeProfileImage(file(animated, "image/webp"))).rejects.toThrow(
      ProfileImageError,
    );
  });

  it.each([
    ["image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    [
      "image/gif",
      Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    ],
    ["image/png", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["image/png", Buffer.from("not an image")],
    ["image/png", Buffer.from("89504e470d0a1a0a", "hex")],
    ["image/jpeg", Buffer.from("ffd8ff", "hex")],
    ["image/webp", Buffer.from("RIFF0000WEBPcorrupt")],
  ])("rejects unsupported or invalid bytes declared as %s", async (type, bytes) => {
    await expect(normalizeProfileImage(file(bytes, type))).rejects.toThrow(ProfileImageError);
  });

  it("rejects a mismatched content type despite valid decoded pixels", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(normalizeProfileImage(file(png, "image/jpeg"))).rejects.toThrow(ProfileImageError);
  });

  it("limits input dimensions and pixel count before raster output", async () => {
    const oversized = await sharp({
      create: { width: 10001, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(normalizeProfileImage(file(oversized, "image/png"))).rejects.toThrow(
      ProfileImageError,
    );
    // Both dimensions fit the separate 10,000px cap; only the decoded-pixel
    // budget rejects this highly compressed upload.
    const excessPixels = await sharp({
      create: { width: 5001, height: 5000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect(excessPixels.length).toBeLessThan(PROFILE_IMAGE_MAX_BYTES);
    await expect(normalizeProfileImage(file(excessPixels, "image/png"))).rejects.toThrow(
      ProfileImageError,
    );
  });

  it("rejects an empty image and bytes above 4MiB", async () => {
    await expect(normalizeProfileImage(file(new Uint8Array(), "image/png"))).rejects.toThrow(
      ProfileImageError,
    );
    await expect(
      normalizeProfileImage(file(new Uint8Array(PROFILE_IMAGE_MAX_BYTES + 1), "image/png")),
    ).rejects.toThrow(ProfileImageError);
  });
});

describe("profile image client preflight and local URL references", () => {
  it("accepts supported image types up to the byte boundary", () => {
    expect(PROFILE_IMAGE_MAX_BYTES).toBe(4 * 1024 * 1024);
    for (const type of ["image/png", "image/jpeg", "image/webp"])
      expect(validateProfileImageFile({ type, size: PROFILE_IMAGE_MAX_BYTES })).toBeNull();
    expect(
      validateProfileImageFile({ type: "image/png", size: PROFILE_IMAGE_MAX_BYTES + 1 }),
    ).toContain("4MB 이하");
    expect(validateProfileImageFile({ type: "image/gif", size: 10 })).not.toBeNull();
    expect(validateProfileImageFile({ type: "image/png", size: 0 })).not.toBeNull();
  });

  it("accepts only local opaque asset IDs and exact revisions", () => {
    const id = "360fd9fd-7447-4ba9-9d5b-cba957fd3307";
    const revision = "a".repeat(64);
    expect(profileImageUrl(id, revision)).toBe(`/api/profile/image/${id}?v=${revision}`);
    for (const invalid of ["../private", "https://example.com/image", "not-a-uuid", ""])
      expect(profileImageUrl(invalid, revision)).toBeNull();
    for (const invalid of ["a".repeat(63), "A".repeat(64), "a".repeat(65), "../../"])
      expect(profileImageUrl(id, invalid)).toBeNull();
  });
});
