"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAuthState } from "./auth";
import {
  operationalMutationSchema,
  OperationalPolicyError,
  requireOperationalActor,
} from "./operational-policy";
import { persistOperationalMutation } from "./server/operational-repository";
import type { OperationalMutationResult } from "./data/operational-types";

export async function mutateOperationalData(input: unknown): Promise<OperationalMutationResult> {
  const parsed = operationalMutationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "입력값을 확인해주세요. 화면을 새로고침한 후 다시 시도해주세요." };
  try {
    const { user, status } = await getCurrentAuthState();
    if (status === "UNAVAILABLE")
      return {
        ok: false,
        message:
          "로그인은 유지됩니다. Discord 연결을 잠시 확인할 수 없습니다. 연결 확인 후 다시 시도해 주세요.",
      };
    const actor = requireOperationalActor(user, parsed.data.action);
    await persistOperationalMutation(actor, parsed.data);
    revalidatePath("/");
    revalidatePath("/season");
    revalidatePath("/ops");
    revalidatePath("/admin", "layout");
    if (parsed.data.action === "RSVP") revalidatePath(`/ops/${parsed.data.operationId}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof OperationalPolicyError
          ? error.message
          : "저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
    };
  }
}
