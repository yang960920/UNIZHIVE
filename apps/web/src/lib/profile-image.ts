import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_LIMIT_LABEL } from "./image-upload-limits";

export const PROFILE_IMAGE_MAX_BYTES = IMAGE_UPLOAD_MAX_BYTES;
export const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PROFILE_IMAGE_SIZE = 512;

export function validateProfileImageFile(file: Pick<File, "size" | "type">): string | null {
  if (file.size <= 0) return "이미지 파일을 선택해 주세요.";
  if (file.size > PROFILE_IMAGE_MAX_BYTES)
    return `이미지는 ${IMAGE_UPLOAD_LIMIT_LABEL} 이하로 선택해 주세요.`;
  if (!(PROFILE_IMAGE_TYPES as readonly string[]).includes(file.type))
    return "JPG, PNG 또는 WebP 이미지를 선택해 주세요.";
  return null;
}

export function profileImageUrl(assetId: string, revision: string): string | null {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(assetId)) return null;
  if (!/^[a-f0-9]{64}$/.test(revision)) return null;
  return `/api/profile/image/${assetId}?v=${revision}`;
}

export type ProfileImageState = {
  imageUrl: string | null;
  hasCustomImage: boolean;
};
