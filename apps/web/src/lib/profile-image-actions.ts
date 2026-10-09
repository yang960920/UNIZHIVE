"use server";

import { canEditMemberProfile } from "@uniz/domain";
import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "./auth";
import { normalizeProfileImage, ProfileImageError } from "./server/profile-image-processing";
import { persistProfileImage } from "./server/profile-images";
import type { ProfileImageState } from "./profile-image";

export async function saveProfileImage(
  formData: FormData,
): Promise<{ ok: boolean; message: string } & Partial<ProfileImageState>> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    return { ok: false, message: "로그인은 유지됩니다. 연결을 확인한 후 다시 저장해 주세요." };
  if (status !== "AUTHENTICATED" || !user || !canEditMemberProfile(user, user.id))
    return { ok: false, message: "로그인한 후 다시 저장해 주세요." };
  if (user.isMock) return { ok: false, message: "실제 계정에서 프로필 이미지를 저장해 주세요." };
  const action = formData.get("action");
  if (
    !["UPLOAD", "REMOVE"].includes(String(action)) ||
    [...formData.keys()].some((key) => key !== "action" && key !== "image") ||
    formData.getAll("action").length !== 1 ||
    formData.getAll("image").length > 1 ||
    (action === "REMOVE" && formData.has("image"))
  )
    return { ok: false, message: "이미지 설정 값을 확인해 주세요." };
  try {
    const file = formData.get("image");
    if (action === "UPLOAD" && !(file instanceof File))
      return { ok: false, message: "이미지 파일을 선택해 주세요." };
    const image = action === "UPLOAD" ? await normalizeProfileImage(file as File) : null;
    const saved = await persistProfileImage(user, image);
    revalidatePath("/", "layout");
    revalidatePath("/members");
    revalidatePath("/admin/members");
    return {
      ok: true,
      message: image ? "프로필 이미지를 저장했습니다." : "기본 이미지로 변경했습니다.",
      ...saved,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ProfileImageError
          ? error.message
          : "이미지를 저장하지 못했습니다. 연결을 확인한 후 다시 시도해 주세요.",
    };
  }
}
