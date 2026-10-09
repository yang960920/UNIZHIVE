"use server";

import { canEditMemberProfile } from "@uniz/domain";
import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "@/lib/auth";
import { MemberManagementError, memberProfileSchema } from "@/lib/member-policy";
import { saveMemberProfile } from "@/lib/server/member-management";

export interface OnboardingState {
  ok: boolean;
  message: string;
}

export async function saveOnboarding(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    return {
      ok: false,
      message: "로그인은 유지되고 있습니다. 연결 확인 후 다시 저장해 주세요.",
    };
  if (status !== "AUTHENTICATED" || !user || !canEditMemberProfile(user, user.id))
    return { ok: false, message: "로그인한 후 프로필을 등록해 주세요." };
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
      ok: true,
      message: "개발 프로필 입력을 확인했습니다. 미리보기에서는 UID가 저장되지 않습니다.",
    };
  try {
    await saveMemberProfile({ targetId: user.id, ...parsed.data });
    revalidatePath("/onboarding");
    revalidatePath("/settings");
    revalidatePath("/members");
    revalidatePath("/admin/members");
    return {
      ok: true,
      message:
        user.role === "APPLICANT"
          ? "프로필을 등록했습니다. 운영진이 확인하면 멤버 권한을 받을 수 있습니다."
          : "프로필을 저장했습니다.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof MemberManagementError
          ? error.message
          : "프로필을 저장하지 못했습니다. 프로필 주소가 이미 사용 중인지 확인해 주세요.",
    };
  }
}
