import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { PROFILE_IMAGE_SIZE, validateProfileImageFile } from "../profile-image";

export class ProfileImageError extends Error {}

export async function normalizeProfileImage(file: File): Promise<{
  content: Buffer;
  revision: string;
}> {
  const invalid = validateProfileImageFile(file);
  if (invalid) throw new ProfileImageError(invalid);
  const input = Buffer.from(await file.arrayBuffer());
  const format =
    input.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
      ? "png"
      : input.subarray(0, 3).toString("hex") === "ffd8ff"
        ? "jpeg"
        : input.subarray(0, 4).toString() === "RIFF" && input.subarray(8, 12).toString() === "WEBP"
          ? "webp"
          : null;
  if (!format || file.type !== `image/${format}`)
    throw new ProfileImageError(
      "파일 형식이 올바르지 않습니다. JPG, PNG 또는 WebP를 선택해 주세요.",
    );
  try {
    const image = sharp(input, { limitInputPixels: 25_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 10000 ||
      metadata.height > 10000 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new ProfileImageError("움직이는 이미지나 지나치게 큰 이미지는 등록할 수 없습니다.");
    // Rotation honors EXIF; the encoded result strips metadata and contains only decoded pixels.
    const content = await image
      .rotate()
      .resize(PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 85, effort: 4 })
      .timeout({ seconds: 5 })
      .toBuffer();
    if (content.length > 512 * 1024) throw new ProfileImageError("더 작은 이미지를 선택해 주세요.");
    return { content, revision: createHash("sha256").update(content).digest("hex") };
  } catch (error) {
    if (error instanceof ProfileImageError) throw error;
    throw new ProfileImageError("이미지를 읽을 수 없습니다. 다른 이미지 파일을 선택해 주세요.");
  }
}
