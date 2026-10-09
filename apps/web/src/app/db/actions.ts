"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  dpsArchiveSchema,
  dpsResearchHref,
  dpsReviewSchema,
  dpsSaveSchema,
  dpsVerificationSchema,
} from "@/lib/dps-research";
import {
  archiveDpsResearch,
  DpsResearchError,
  reviewDpsResearch,
  saveDpsResearch,
  verifyDpsResearch,
} from "@/lib/server/dps-research-repository";

export interface DpsActionState {
  ok: boolean;
  message: string;
  href?: string;
}
const fields = [
  "title",
  "summary",
  "buildVersionId",
  "composition",
  "gamePatch",
  "scenario",
  "trance",
  "platform",
  "target",
  "durationSeconds",
  "distanceMeters",
  "reloadPolicy",
  "hitPolicy",
  "buffPolicy",
  "procedure",
  "measuredAt",
  "trials",
  "evidenceDocument",
  "evidenceText",
  "youtubeUrl",
] as const;
function checkFields(form: FormData, allowed: readonly string[]) {
  for (const key of form.keys()) {
    if (key.startsWith("$ACTION_")) continue;
    if (!allowed.includes(key) || form.getAll(key).length !== 1) throw new Error("INVALID_FORM");
  }
}
function value(form: FormData, name: string) {
  return form.get(name) ?? "";
}
function number(form: FormData, name: string) {
  const raw = form.get(name);
  return raw === null || raw === ""
    ? null
    : typeof raw === "string" && raw.trim()
      ? Number(raw)
      : raw;
}
function refreshResearch() {
  revalidatePath("/db", "layout");
  revalidatePath("/admin/database", "layout");
  revalidatePath("/search");
}
function failure(error: unknown): DpsActionState {
  if (error instanceof DpsResearchError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError)
    return {
      ok: false,
      message:
        error.issues.find((issue) => /[가-힣]/.test(issue.message))?.message ??
        "제목·측정 조건과 입력한 수치의 형식을 확인해 주세요.",
    };
  return {
    ok: false,
    message: "저장하지 못했습니다. 작성한 내용은 유지됩니다. 입력과 연결 상태를 확인해 주세요.",
  };
}
export async function saveDpsResearchForm(
  _previous: DpsActionState,
  form: FormData,
): Promise<DpsActionState> {
  try {
    checkFields(form, [...fields, "id", "expectedUpdatedAt", "action", "contentMediaReady"]);
    if (form.get("contentMediaReady") === "false")
      return { ok: false, message: "근거 이미지 등록을 마친 후 저장해 주세요." };
    const trialText = form.get("trials") ?? "[]";
    if (typeof trialText !== "string" || trialText.length > 32000)
      return { ok: false, message: "측정 결과는 최대 20회까지 입력해 주세요." };
    let trials: unknown;
    try {
      trials = JSON.parse(trialText);
    } catch {
      return { ok: false, message: "측정 결과의 형식을 확인해 주세요." };
    }
    const payload = Object.fromEntries(fields.map((field) => [field, value(form, field)]));
    Object.assign(payload, {
      buildVersionId: form.get("buildVersionId") || null,
      durationSeconds: number(form, "durationSeconds"),
      distanceMeters: number(form, "distanceMeters"),
      measuredAt: form.get("measuredAt") || null,
      trials,
      youtubeUrl: form.get("youtubeUrl") || null,
      evidenceDocument: form.get("evidenceDocument") || null,
    });
    const input = dpsSaveSchema.parse({
      ...(form.get("id")
        ? { id: form.get("id"), expectedUpdatedAt: form.get("expectedUpdatedAt") }
        : {}),
      action: form.get("action"),
      payload,
    });
    const result = await saveDpsResearch(input);
    refreshResearch();
    return {
      ok: true,
      message:
        input.action === "SUBMIT" ? "이 버전을 게시 검토에 제출했습니다." : "초안을 저장했습니다.",
      href: dpsResearchHref({ id: result.id, version: result.version }),
    };
  } catch (error) {
    return failure(error);
  }
}
export async function reviewDpsResearchForm(
  _previous: DpsActionState,
  form: FormData,
): Promise<DpsActionState> {
  try {
    checkFields(form, ["versionId", "expectedUpdatedAt", "decision", "note"]);
    const input = dpsReviewSchema.parse({
      versionId: form.get("versionId"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      action: form.get("decision"),
      note: value(form, "note"),
    });
    await reviewDpsResearch(input);
    refreshResearch();
    return {
      ok: true,
      message:
        input.action === "APPROVE"
          ? "이 버전을 게임 정보에 공개했습니다."
          : "검토 결과를 저장했습니다.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function verifyDpsResearchForm(
  _previous: DpsActionState,
  form: FormData,
): Promise<DpsActionState> {
  try {
    checkFields(form, ["versionId", "expectedUpdatedAt", "confirmed", "note"]);
    const raw = form.get("confirmed");
    if (raw !== null && raw !== "on")
      return { ok: false, message: "재현 확인 항목을 다시 선택해 주세요." };
    const input = dpsVerificationSchema.parse({
      versionId: form.get("versionId"),
      expectedUpdatedAt: form.get("expectedUpdatedAt"),
      confirmed: raw === "on",
      note: value(form, "note"),
    });
    await verifyDpsResearch(input);
    refreshResearch();
    return {
      ok: true,
      message: input.confirmed
        ? "이 버전의 재현 확인을 기록했습니다."
        : "재현 확인을 철회했습니다.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function archiveDpsResearchForm(
  _previous: DpsActionState,
  form: FormData,
): Promise<DpsActionState> {
  try {
    checkFields(form, ["id", "expectedUpdatedAt"]);
    await archiveDpsResearch(
      dpsArchiveSchema.parse({
        id: form.get("id"),
        expectedUpdatedAt: form.get("expectedUpdatedAt"),
      }),
    );
    refreshResearch();
    return { ok: true, message: "자료를 보관했습니다.", href: "/db/mine" };
  } catch (error) {
    return failure(error);
  }
}
