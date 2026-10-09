"use server";

import { revalidatePath } from "next/cache";
import { fromKstInput, type AdministrationActionState } from "@/lib/admin-format";
import { joinSeason, SeasonParticipationError } from "@/lib/server/season-participation";
import { mutateSeasonAdministration } from "@/lib/server/season-administration";
import { SeasonAdministrationError } from "@/lib/season-admin-policy";
import { mutateOperationalData } from "@/lib/operational-actions";

function refreshSeasonPages() {
  revalidatePath("/");
  revalidatePath("/season", "layout");
  revalidatePath("/admin/seasons", "layout");
  revalidatePath("/ops", "layout");
}

export async function participateInSeason(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await joinSeason({ seasonId: form.get("seasonId") });
    refreshSeasonPages();
    revalidatePath(`/season/${String(form.get("seasonId"))}`);
    return { ok: true, message: "시즌에 참여했습니다." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof SeasonParticipationError
          ? error.message
          : "참여하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.",
    };
  }
}

export async function updateSeasonMigration(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  const result = await mutateOperationalData({
    action: "MIGRATION",
    seasonId: form.get("seasonId"),
    status: form.get("status"),
  });
  if (!result.ok)
    return { ok: false, message: result.message ?? "이동 상태를 저장하지 못했습니다." };
  revalidatePath(`/season/${String(form.get("seasonId"))}`);
  return { ok: true, message: "하이브 이동 상태를 저장했습니다." };
}

export async function saveMemberSeason(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  let input: unknown;
  const id = form.get("id");
  try {
    const action = form.get("action");
    if (action !== "CREATE_SEASON_SETUP" && action !== "SAVE_SEASON_SETUP")
      return { ok: false, message: "등록 신청을 확인하고 다시 시도해주세요." };
    input = {
      action,
      ...(id ? { id, expectedUpdatedAt: form.get("expectedUpdatedAt") } : {}),
      scenarioKey: form.get("scenarioKey"),
      serverNumber: form.get("serverNumber"),
      region: form.get("region"),
      name: form.get("name"),
      serverType: form.get("serverType"),
      trancePhenomenon: form.get("trancePhenomenon"),
      startsAt: fromKstInput(form.get("startsAt"), false, form.get("originalStartsAt")),
      settlementAt: fromKstInput(
        form.get("settlementAt") ?? "",
        true,
        form.get("originalSettlementAt"),
      ),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "날짜를 확인해주세요." };
  }
  try {
    const result = await mutateSeasonAdministration(input);
    refreshSeasonPages();
    return {
      ok: true,
      message:
        result.approvalStatus === "PENDING"
          ? "등록 신청을 저장했습니다. 관리자의 승인을 기다려주세요."
          : "시즌을 저장했습니다.",
      href:
        result.approvalStatus === "PENDING"
          ? `/season/requests/${result.id}`
          : `/admin/seasons/${result.id}`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof SeasonAdministrationError || error instanceof SeasonParticipationError
          ? error.message
          : "신청을 저장하지 못했습니다. 입력 내용과 연결 상태를 확인해주세요.",
    };
  }
}
