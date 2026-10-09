"use server";

import { revalidatePath } from "next/cache";
import { changeMemberRole, saveManagedMemberProfile } from "@/lib/server/member-management";
import { MemberManagementError, type MemberActionState } from "@/lib/member-policy";

export async function reviewMember(
  _previous: MemberActionState,
  form: FormData,
): Promise<MemberActionState> {
  const action = form.get("action");
  const input = {
    targetId: form.get("targetId"),
    action,
    reason: form.get("reason"),
    ...(action === "role" ? { role: form.get("role") } : {}),
  };
  try {
    await changeMemberRole(input);
    revalidatePath("/admin/members");
    revalidatePath("/members");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: "멤버 상태를 변경했습니다. 다음 요청부터 변경된 권한이 적용됩니다.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof MemberManagementError
          ? error.message
          : "변경을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function updateMemberProfile(
  _previous: MemberActionState,
  form: FormData,
): Promise<MemberActionState> {
  try {
    await saveManagedMemberProfile({
      targetId: form.get("targetId"),
      handle: form.get("handle"),
      displayName: form.get("displayName"),
      nickname: form.get("nickname"),
      uid: form.get("uid"),
      bio: form.get("bio"),
    });
    revalidatePath("/admin/members");
    revalidatePath("/members");
    revalidatePath("/onboarding");
    return { ok: true, message: "프로필을 저장했습니다." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof MemberManagementError
          ? error.message
          : "저장하지 못했습니다. 프로필 주소가 이미 사용 중인지 확인해 주세요.",
    };
  }
}
