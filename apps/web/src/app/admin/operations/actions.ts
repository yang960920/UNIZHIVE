"use server";

import { revalidatePath } from "next/cache";
import { mutateOperationAdministration } from "@/lib/server/operation-administration";
import { OperationAdministrationError } from "@/lib/operation-admin-policy";
import { fromKstInput, type AdministrationActionState } from "@/lib/admin-format";

export async function saveOperationAdministration(
  _previous: AdministrationActionState,
  form: FormData,
): Promise<AdministrationActionState> {
  let startsAt: string | null, endsAt: string | null;
  try {
    startsAt = fromKstInput(form.get("startsAt"), false, form.get("originalStartsAt"));
    endsAt = fromKstInput(form.get("endsAt"), true, form.get("originalEndsAt"));
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "날짜와 시간을 확인해주세요.",
    };
  }
  try {
    const id = form.get("id");
    const result = await mutateOperationAdministration({
      action: "SAVE_OPERATION",
      ...(id ? { id, expectedUpdatedAt: form.get("expectedUpdatedAt") } : {}),
      seasonId: form.get("seasonId") || null,
      title: form.get("title"),
      type: form.get("type"),
      description: form.get("description"),
      startsAt,
      endsAt,
      capacity: Number(form.get("capacity")),
      status: form.get("status"),
    });
    revalidatePath("/admin", "layout");
    revalidatePath("/");
    revalidatePath("/season");
    revalidatePath("/ops");
    revalidatePath("/ops/[id]", "page");
    return {
      ok: true,
      message: "작전을 저장했습니다.",
      ...(!id ? { href: `/admin/operations/${result.id}` } : {}),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof OperationAdministrationError
          ? error.message
          : "저장하지 못했습니다. 입력 내용과 연결 상태를 확인해주세요.",
    };
  }
}
