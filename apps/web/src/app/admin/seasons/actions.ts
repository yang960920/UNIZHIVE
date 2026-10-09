"use server";

import { revalidatePath } from "next/cache";
import { mutateSeasonAdministration } from "@/lib/server/season-administration";
import { SeasonAdministrationError } from "@/lib/season-admin-policy";
import { fromKstInput, type AdministrationActionState } from "@/lib/admin-format";

export async function saveSeasonAdministration(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  const action = form.get("action");
  let input: unknown;
  try {
    const id = form.get("id");
    const version = form.get("expectedUpdatedAt");
    const edit = id ? { id, expectedUpdatedAt: version } : {};
    if (action === "REGISTER_SERVER")
      input = {
        action,
        scenarioKey: form.get("scenarioKey"),
        serverNumber: form.get("serverNumber"),
        region: form.get("region"),
      };
    else if (action === "CREATE_SEASON_SETUP" || action === "SAVE_SEASON_SETUP")
      input = {
        action,
        ...edit,
        scenarioKey: form.get("scenarioKey"),
        serverNumber: form.get("serverNumber"),
        region: form.get("region"),
        name: form.get("name"),
        serverType: form.get("serverType"),
        trancePhenomenon: form.get("trancePhenomenon"),
        ...(action === "SAVE_SEASON_SETUP" && form.has("migrationOpen")
          ? { migrationOpen: form.get("migrationOpen") === "true" }
          : {}),
        startsAt: fromKstInput(form.get("startsAt"), false, form.get("originalStartsAt")),
        settlementAt: fromKstInput(
          form.get("settlementAt") ?? "",
          true,
          form.get("originalSettlementAt"),
        ),
        ...(action === "SAVE_SEASON_SETUP" && form.has("status")
          ? {
              status: form.get("status"),
              voteClosesAt: fromKstInput(
                form.get("voteClosesAt") ?? "",
                true,
                form.get("originalVoteClosesAt"),
              ),
            }
          : {}),
      };
    else if (action === "SAVE_SEASON")
      input = {
        action,
        ...edit,
        seasonNumber: Number(form.get("seasonNumber")),
        name: form.get("name"),
        scenarioId: form.get("scenarioId"),
        serverId: form.get("serverId"),
        status: form.get("status"),
        startsAt: fromKstInput(form.get("startsAt"), false, form.get("originalStartsAt")),
        settlementAt: fromKstInput(
          form.get("settlementAt"),
          true,
          form.get("originalSettlementAt"),
        ),
        voteClosesAt: fromKstInput(
          form.get("voteClosesAt") ?? "",
          true,
          form.get("originalVoteClosesAt"),
        ),
      };
    else if (action === "CHANGE_SEASON_PHASE")
      input = {
        action,
        seasonId: form.get("seasonId"),
        expectedUpdatedAt: version,
        direction: form.get("direction"),
      };
    else if (action === "ADD_PRESET_CANDIDATE")
      input = {
        action,
        seasonId: form.get("seasonId"),
        scenarioKey: form.get("scenarioKey"),
        label: form.get("label"),
      };
    else if (action === "REVIEW_SEASON")
      input = {
        action,
        seasonId: form.get("seasonId"),
        expectedUpdatedAt: version,
        decision: form.get("decision"),
      };
    else if (action === "UPDATE_MEMBERSHIP" || action === "REMOVE_MEMBER")
      input = {
        action,
        seasonId: form.get("seasonId"),
        userId: form.get("userId"),
        expectedUpdatedAt: version,
        ...(action === "UPDATE_MEMBERSHIP" ? { migrationStatus: form.get("migrationStatus") } : {}),
      };
    else if (action === "ADD_CANDIDATE")
      input = {
        action,
        seasonId: form.get("seasonId"),
        scenarioId: form.get("scenarioId"),
        label: form.get("label"),
      };
    else if (action === "ENROL_MEMBERS")
      input = { action, seasonId: form.get("seasonId"), userIds: form.getAll("userIds") };
    else return { ok: false, message: "요청을 확인하고 다시 시도해주세요." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "날짜와 시간을 확인해주세요.",
    };
  }
  try {
    const result = await mutateSeasonAdministration(input);
    revalidatePath("/admin", "layout");
    revalidatePath("/");
    revalidatePath("/season");
    revalidatePath("/season/[id]", "page");
    revalidatePath("/season/requests/[id]", "page");
    revalidatePath("/ops");
    revalidatePath("/ops/[id]", "page");
    return {
      ok: true,
      message: action === "CHANGE_SEASON_PHASE" ? "시즌 단계를 변경했습니다." : "저장했습니다.",
      ...((action === "SAVE_SEASON" && !form.get("id")) || action === "CREATE_SEASON_SETUP"
        ? { href: `/admin/seasons/${result.id}` }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof SeasonAdministrationError
          ? error.message
          : "저장하지 못했습니다. 입력 내용과 연결 상태를 확인해주세요.",
    };
  }
}
