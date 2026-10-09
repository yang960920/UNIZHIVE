import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/server/build-sharing", () => ({
  approvedBuildVersionAccessSql: vi.fn(),
  submittedBuildVersionAccessSql: vi.fn(),
}));
vi.mock("../src/lib/server/discord-authorization", () => ({
  getSessionGuildEligibilityState: vi.fn(),
}));
import { normalizeContentImage, validateContentImageFile } from "../src/lib/server/content-media";
import { IMAGE_UPLOAD_MAX_BYTES } from "../src/lib/image-upload-limits";

describe("article image normalization", () => {
  it("keeps portrait/landscape ratio and transparency and produces only bounded WebP bytes", async () => {
    const original = await sharp({
      create: {
        width: 3000,
        height: 1500,
        channels: 4,
        background: { r: 20, g: 150, b: 220, alpha: 0.3 },
      },
    })
      .png()
      .toBuffer();
    const image = await normalizeContentImage(
      new File([new Uint8Array(original)], "transparent.png", { type: "image/png" }),
    );
    expect(image.width).toBe(1920);
    expect(image.height).toBe(960);
    expect(image.content.length).toBeLessThanOrEqual(512 * 1024);
    expect(image.revision).toMatch(/^[a-f0-9]{64}$/);
    const metadata = await sharp(image.content).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.exif).toBeUndefined();
    const raw = await sharp(image.content).raw().toBuffer({ resolveWithObject: true });
    expect(raw.info.channels).toBe(4);
    expect(raw.data[3]).toBeGreaterThan(0);
    expect(raw.data[3]).toBeLessThan(255);
  });
  it("does not enlarge small source images and strips private source metadata", async () => {
    const original = await sharp({
      create: { width: 64, height: 128, channels: 3, background: "red" },
    })
      .withExif({ IFD0: { Copyright: "private metadata" } })
      .jpeg()
      .toBuffer();
    const image = await normalizeContentImage(
      new File([new Uint8Array(original)], "portrait.jpg", { type: "image/jpeg" }),
    );
    expect([image.width, image.height]).toEqual([64, 128]);
    expect((await sharp(image.content).metadata()).exif).toBeUndefined();
  });
  it("rejects disguised SVG, unsupported MIME and corrupted decoded image contents", async () => {
    for (const file of [
      new File(["<svg></svg>"], "disguised.png", { type: "image/png" }),
      new File(["GIF89a"], "animated.gif", { type: "image/gif" }),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "broken.png", {
        type: "image/png",
      }),
    ])
      await expect(normalizeContentImage(file)).rejects.toThrow();
  });
  it("accepts the exact 4MiB input boundary and rejects the next byte before decoding", () => {
    expect(IMAGE_UPLOAD_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(
      validateContentImageFile(
        new File([new Uint8Array(4 * 1024 * 1024)], "limit.png", { type: "image/png" }),
      ),
    ).toBeNull();
    expect(
      validateContentImageFile(
        new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
      ),
    ).toContain("4MB 이하");
  });
  it("rejects empty and over-4MiB input before decoding", async () => {
    await expect(
      normalizeContentImage(new File([], "empty.png", { type: "image/png" })),
    ).rejects.toThrow();
    await expect(
      normalizeContentImage(
        new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
      ),
    ).rejects.toThrow();
  });
});
