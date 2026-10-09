"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "./auth";
import { userPreferencesSchema, type UserPreferences } from "./user-preferences";
import { persistUserPreferences } from "./server/user-preferences";

export async function saveUserPreferences(
  input: unknown,
): Promise<{ ok: boolean; message: string; preferences?: UserPreferences }> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    return { ok: false, message: "로그인은 유지됩니다. 연결 상태를 확인한 후 다시 저장해 주세요." };
  if (status !== "AUTHENTICATED" || !user)
    return { ok: false, message: "로그인한 후 다시 저장해 주세요." };
  const parsed = userPreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "설정 값을 확인해 주세요." };
  try {
    const preferences = await persistUserPreferences(user, parsed.data);
    revalidatePath("/", "layout");
    return {
      ok: true,
      preferences,
      message: user.isMock
        ? "미리보기 계정의 설정을 이 브라우저에 저장했습니다."
        : "내 설정을 저장했습니다.",
    };
  } catch {
    return {
      ok: false,
      message: "설정을 저장하지 못했습니다. 연결을 확인한 후 다시 시도해 주세요.",
    };
  }
}
