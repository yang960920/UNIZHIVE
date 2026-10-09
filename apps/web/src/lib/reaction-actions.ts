"use server";
import { revalidatePath } from "next/cache";
import { CommunityError } from "./community-policy";
import { reactionSaveSchema, type LikeSummary } from "./reaction-policy";
import { setReaction } from "./server/reactions";

export async function saveReaction(
  input: unknown,
): Promise<{ ok: boolean; message: string } & Partial<LikeSummary>> {
  const parsed = reactionSaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "좋아요 정보를 확인해 주세요." };
  try {
    const summary = await setReaction(parsed.data);
    revalidatePath(parsed.data.kind === "BUILD" ? "/lab" : "/community", "layout");
    revalidatePath("/");
    return {
      ok: true,
      message: parsed.data.liked ? "좋아요를 표시했습니다." : "좋아요를 취소했습니다.",
      ...summary,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof CommunityError
          ? error.message
          : "좋아요를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
    };
  }
}
