"use server";

import { revalidatePath } from "next/cache";
import { fromKstInput, type AdministrationActionState } from "@/lib/admin-format";
import {
  saveParty,
  managePartyParticipant,
  PartyAdministrationError,
} from "@/lib/server/party-administration";

function refreshParties() {
  revalidatePath("/ops", "layout");
  revalidatePath("/");
  revalidatePath("/season", "layout");
  revalidatePath("/admin/operations", "layout");
}

function readDate(form: FormData, name: "startsAt" | "endsAt", optional: boolean) {
  try {
    return fromKstInput(
      form.get(name),
      optional,
      form.get(name === "startsAt" ? "originalStartsAt" : "originalEndsAt"),
    );
  } catch {
    throw new PartyAdministrationError(
      "날짜와 시간을 확인해주세요. 한국 시간(KST)으로 입력합니다.",
    );
  }
}

export async function savePartyForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    const id = form.get("id");
    const result = await saveParty({
      ...(id ? { id, expectedUpdatedAt: form.get("expectedUpdatedAt") } : {}),
      seasonId: form.get("seasonId"),
      contentKey: form.get("contentKey"),
      title: form.get("title"),
      meetingPoint: form.get("meetingPoint"),
      description: form.get("description"),
      requestedContributions: form.getAll("requestedContributions"),
      startsAt: readDate(form, "startsAt", false),
      endsAt: readDate(form, "endsAt", true),
      capacity: Number(form.get("capacity")),
      status: form.get("status"),
    });
    refreshParties();
    return { ok: true, message: "파티 모집을 저장했습니다.", href: `/ops/${result.id}` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof PartyAdministrationError
          ? error.message
          : "저장하지 못했습니다. 입력 내용과 연결 상태를 확인해주세요.",
    };
  }
}

export async function managePartyParticipantForm(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  try {
    await managePartyParticipant({
      operationId: form.get("operationId"),
      userId: form.get("userId"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      action: form.get("action"),
      ...(form.get("action") === "SET_STATUS" ? { status: form.get("status") } : {}),
    });
    refreshParties();
    return { ok: true, message: "참가 명단을 변경했습니다." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof PartyAdministrationError
          ? error.message
          : "참가 명단을 변경하지 못했습니다. 다시 확인해주세요.",
    };
  }
}
