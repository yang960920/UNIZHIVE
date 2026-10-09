"use server";
import { getCurrentAuthState } from "./auth";
import {
  ContentMediaError,
  stageContentImage,
  type ContentImageAsset,
} from "./server/content-media";
export async function uploadContentImage(
  form: FormData,
): Promise<{ ok: boolean; message: string; image?: ContentImageAsset }> {
  const state = await getCurrentAuthState();
  if (state.status !== "AUTHENTICATED" || !state.user)
    return { ok: false, message: "로그인 연결을 확인한 후 다시 시도해 주세요." };
  if (
    [...form.keys()].some((key) => key !== "image") ||
    form.getAll("image").length !== 1 ||
    !(form.get("image") instanceof File)
  )
    return { ok: false, message: "이미지 한 개를 선택해 주세요." };
  try {
    const image = await stageContentImage(state.user, form.get("image") as File);
    return { ok: true, message: "이미지를 준비했습니다. 글을 저장하면 함께 등록됩니다.", image };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ContentMediaError
          ? error.message
          : "이미지를 준비하지 못했습니다. 파일과 글은 유지됩니다. 다시 시도해 주세요.",
    };
  }
}
