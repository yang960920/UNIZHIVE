"use server";

import { revalidatePath } from "next/cache";
import { BuildSharingError, reviewBuildSharing } from "@/lib/server/build-sharing";

export interface BuildReviewState {
  ok: boolean;
  message: string;
}
export async function reviewBuildShare(
  _previous: BuildReviewState,
  form: FormData,
): Promise<BuildReviewState> {
  const score = form.get("recommendationScore");
  try {
    await reviewBuildSharing({
      requestId: form.get("requestId"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      action: form.get("decision"),
      reviewNote: form.get("reviewNote") ?? "",
      recommendationScore:
        score === null || score === ""
          ? null
          : typeof score === "string" && /^[1-5]$/.test(score)
            ? Number(score)
            : score,
      recommendationNote: form.get("recommendationNote") ?? "",
    });
    revalidatePath("/admin/builds");
    revalidatePath("/admin/builds/[requestId]", "page");
    revalidatePath("/lab");
    revalidatePath("/lab/b/[id]", "page");
    revalidatePath("/");
    revalidatePath("/community");
    revalidatePath("/community/[id]", "page");
    return { ok: true, message: "공유 검토 결과를 저장했습니다." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BuildSharingError
          ? error.message
          : "공유 검토 결과를 저장하지 못했습니다. 다시 확인해 주세요.",
    };
  }
}
