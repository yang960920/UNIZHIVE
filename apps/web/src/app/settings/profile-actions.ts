"use server";

import { canEditMemberProfile } from "@uniz/domain";
import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "@/lib/auth";
import { MemberManagementError, memberProfileSchema } from "@/lib/member-policy";
import type { ProfileImageState } from "@/lib/profile-image";
import { saveOwnProfileSettings } from "@/lib/server/member-management";
import { normalizeProfileImage, ProfileImageError } from "@/lib/server/profile-image-processing";

export async function saveProfileSettings(
  formData: FormData,
): Promise<{ ok: boolean; message: string } & Partial<ProfileImageState>> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    return { ok: false, message: "로그인은 유지됩니다. 연결을 확인한 후 다시 저장해 주세요." };
  if (status !== "AUTHENTICATED" || !user || !canEditMemberProfile(user, user.id))
    return { ok: false, message: "로그인한 후 다시 저장해 주세요." };

  const allowed = ["handle", "displayName", "nickname", "uid", "bio", "imageAction", "image"];
  const imageAction = formData.get("imageAction") ?? "KEEP";
  if (
    [...formData.keys()].some((key) => !allowed.includes(key)) ||
    allowed.some((key) => formData.getAll(key).length > 1) ||
    !["KEEP", "UPLOAD", "REMOVE"].includes(String(imageAction)) ||
    (imageAction !== "UPLOAD" && formData.has("image"))
  )
    return { ok: false, message: "프로필 설정 값을 확인해 주세요." };

  const parsed = memberProfileSchema.omit({ targetId: true }).safeParse({
    handle: formData.get("handle"),
    displayName: formData.get("displayName"),
    nickname: formData.get("nickname"),
    uid: formData.get("uid"),
    bio: formData.get("bio"),
  });
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "입력한 값을 확인해 주세요." };
  if (user.isMock)
    return {
      ok: imageAction === "KEEP",
      message:
        imageAction === "KEEP"
          ? "개발 프로필 입력을 확인했습니다. 미리보기에서는 UID가 저장되지 않습니다."
          : "실제 계정에서 프로필 이미지를 저장해 주세요.",
    };

  try {
    const file = formData.get("image");
    if (imageAction === "UPLOAD" && !(file instanceof File))
      return { ok: false, message: "이미지 파일을 선택해 주세요." };
    const imageChange =
      imageAction === "UPLOAD"
        ? await normalizeProfileImage(file as File)
        : imageAction === "REMOVE"
          ? null
          : undefined;
    const imageState = await saveOwnProfileSettings(
      { targetId: user.id, ...parsed.data },
      imageChange,
    );
    revalidatePath("/", "layout");
    revalidatePath("/onboarding");
    revalidatePath("/settings");
    revalidatePath("/members");
    revalidatePath("/admin/members");
    return { ok: true, message: "프로필을 저장했습니다.", ...(imageState ?? {}) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ProfileImageError || error instanceof MemberManagementError
          ? error.message
          : "프로필을 저장하지 못했습니다. 멤버 식별자 중복이나 연결 상태를 확인한 후 다시 시도해 주세요.",
    };
  }
}
