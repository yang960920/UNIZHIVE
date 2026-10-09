"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "@/lib/auth";
import { BuildPlannerError } from "@/lib/build-planner-policy";
import { persistBuildMutation } from "@/lib/server/build-planner";
import type { PlannerActionState } from "@/lib/data/build-planner-types";

async function commit(input: unknown): Promise<PlannerActionState> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE")
    return { ok: false, message: "로그인은 유지됩니다. 연결을 확인한 후 다시 저장해주세요." };
  if (status !== "AUTHENTICATED" || !user)
    return { ok: false, message: "Discord 로그인과 하이브 가입 상태를 확인해주세요." };
  try {
    const result = await persistBuildMutation(user, input);
    revalidatePath("/lab");
    revalidatePath("/lab/new");
    revalidatePath("/lab/b/[id]", "page");
    revalidatePath("/lab/b/[id]/edit", "page");
    revalidatePath("/");
    revalidatePath("/admin/builds");
    return {
      ok: true,
      message: result.reviewRequested
        ? `${result.version ? `v${result.version}을 저장하고 ` : ""}관리자에게 공유 승인을 요청했습니다.`
        : result.version
          ? `v${result.version}으로 저장했습니다.`
          : "변경사항을 저장했습니다.",
      href: result.version ? `/lab/b/${result.id}?version=${result.version}` : "/lab",
      ...(result.version ? { version: result.version } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BuildPlannerError
          ? error.message
          : "빌드를 저장하지 못했습니다. 입력 내용은 유지되며 다시 시도할 수 있습니다.",
    };
  }
}

export async function saveBuildPlanner(
  _previous: PlannerActionState,
  form: FormData,
): Promise<PlannerActionState> {
  if (form.get("contentMediaReady") === "false")
    return { ok: false, message: "본문과 이미지 준비가 끝난 후 다시 저장해주세요." };
  const serialized = form.get("loadout");
  if (typeof serialized !== "string" || serialized.length > 512 * 1024)
    return { ok: false, message: "장비 구성을 확인해주세요." };
  let loadout: unknown;
  try {
    loadout = JSON.parse(serialized);
  } catch {
    return { ok: false, message: "장비 구성을 읽지 못했습니다. 입력 내용을 확인해주세요." };
  }
  const bodyDocument = form.get("bodyDocument");
  if (
    bodyDocument !== null &&
    (typeof bodyDocument !== "string" || bodyDocument.length > 256 * 1024)
  )
    return { ok: false, message: "본문을 확인해주세요." };
  return commit({
    action: "SAVE_BUILD",
    ...(form.get("buildId")
      ? { buildId: form.get("buildId"), expectedUpdatedAt: form.get("expectedUpdatedAt") }
      : {}),
    title: form.get("title"),
    description: form.get("description") ?? "",
    visibility: form.get("visibility"),
    notes: form.get("notes") ?? "",
    loadout,
    bodyDocument: bodyDocument ?? null,
    youtubeUrl: form.get("youtubeUrl") ?? null,
  });
}

export async function setBuildPlannerVisibility(
  _previous: PlannerActionState,
  form: FormData,
): Promise<PlannerActionState> {
  return commit({
    action: "SET_VISIBILITY",
    buildId: form.get("buildId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
    visibility: form.get("visibility"),
  });
}

export async function archiveBuildPlanner(
  _previous: PlannerActionState,
  form: FormData,
): Promise<PlannerActionState> {
  return commit({
    action: "ARCHIVE",
    buildId: form.get("buildId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
  });
}

export async function restoreBuildPlanner(
  _previous: PlannerActionState,
  form: FormData,
): Promise<PlannerActionState> {
  return commit({
    action: "RESTORE",
    buildId: form.get("buildId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
  });
}
