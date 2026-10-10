"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "@/lib/auth";
import { BuildPlannerError } from "@/lib/build-planner-policy";
import { listLoadoutBuildChoices, persistBuildLoadout } from "@/lib/server/build-loadouts";
import type { LoadoutActionState, LoadoutChoicePage } from "@/lib/data/build-loadout-types";

async function commit(value: unknown): Promise<LoadoutActionState> {
  const auth = await getCurrentAuthState();
  if (auth.status === "UNAVAILABLE")
    return { ok: false, message: "로그인은 유지됩니다. 연결 확인 후 다시 저장해주세요." };
  if (auth.status !== "AUTHENTICATED" || !auth.user)
    return { ok: false, message: "로그인과 하이브 가입 상태를 확인해주세요." };
  try {
    const result = await persistBuildLoadout(auth.user, value);
    revalidatePath("/lab/loadouts");
    revalidatePath(`/lab/loadouts/${result.id}`);
    revalidatePath(`/lab/loadouts/${result.id}/edit`);
    return { ok: true, message: "로드아웃을 저장했습니다.", href: `/lab/loadouts/${result.id}` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BuildPlannerError
          ? error.message
          : "로드아웃을 저장하지 못했습니다. 입력 내용은 유지됩니다.",
    };
  }
}

export async function saveBuildLoadout(
  _previous: LoadoutActionState,
  form: FormData,
): Promise<LoadoutActionState> {
  return commit({
    action: "SAVE_LOADOUT",
    ...(form.get("loadoutId")
      ? { loadoutId: form.get("loadoutId"), expectedUpdatedAt: form.get("expectedUpdatedAt") }
      : {}),
    title: form.get("title"),
    notes: form.get("notes") ?? "",
    buildVersionIds: form.getAll("buildVersionId"),
  });
}
export async function archiveBuildLoadout(
  _previous: LoadoutActionState,
  form: FormData,
): Promise<LoadoutActionState> {
  return commit({
    action: "ARCHIVE_LOADOUT",
    loadoutId: form.get("loadoutId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
  });
}
export async function restoreBuildLoadout(
  _previous: LoadoutActionState,
  form: FormData,
): Promise<LoadoutActionState> {
  return commit({
    action: "RESTORE_LOADOUT",
    loadoutId: form.get("loadoutId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
  });
}
export async function searchLoadoutBuilds(
  query: string,
  cursor?: string,
): Promise<{ ok: boolean; message: string; page: LoadoutChoicePage }> {
  const empty = { items: [], nextCursor: null };
  if (
    typeof query !== "string" ||
    query.length > 160 ||
    (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 240))
  )
    return { ok: false, message: "검색어를 확인해주세요.", page: empty };
  const auth = await getCurrentAuthState();
  if (auth.status === "UNAVAILABLE")
    return { ok: false, message: "연결을 확인한 후 빌드를 다시 검색해주세요.", page: empty };
  if (auth.status !== "AUTHENTICATED" || !auth.user || auth.user.isMock)
    return { ok: false, message: "로그인한 멤버의 저장된 빌드만 검색할 수 있습니다.", page: empty };
  try {
    return {
      ok: true,
      message: "",
      page: await listLoadoutBuildChoices(auth.user, { query, cursor }),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BuildPlannerError ? error.message : "빌드 목록을 불러오지 못했습니다.",
      page: empty,
    };
  }
}
