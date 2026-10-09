import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({
  save: vi.fn(),
  review: vi.fn(),
  verify: vi.fn(),
  archive: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.refresh }));
vi.mock("@/lib/server/dps-research-repository", () => ({
  saveDpsResearch: boundary.save,
  reviewDpsResearch: boundary.review,
  verifyDpsResearch: boundary.verify,
  archiveDpsResearch: boundary.archive,
  DpsResearchError: class DpsResearchError extends Error {},
}));
import {
  archiveDpsResearchForm,
  reviewDpsResearchForm,
  saveDpsResearchForm,
  verifyDpsResearchForm,
} from "../src/app/db/actions";
import { DpsResearchError } from "../src/lib/server/dps-research-repository";

const id = "55db0df4-ab6b-4b99-9a85-00ebc44d8ef6",
  versionId = "c7eaf543-4645-4b89-8700-6c871fb17b81",
  stamp = "2026-10-09T01:00:00.000Z";
function draft() {
  const form = new FormData();
  form.set("title", "실측 연구");
  form.set("action", "DRAFT");
  form.set("trials", "[]");
  return form;
}
function submission() {
  const form = draft();
  form.set("action", "SUBMIT");
  for (const [key, value] of Object.entries({
    composition: "확인한 장비 구성",
    gamePatch: "3.0.7",
    measuredAt: "2026-10-09",
    scenario: "무한의 꿈",
    platform: "PC",
    target: "훈련 허수아비",
    durationSeconds: "60",
    distanceMeters: "0",
    reloadPolicy: "재장전 포함",
    hitPolicy: "몸통만",
    buffPolicy: "버프 없음",
    procedure: "60초간 동일 위치에서 반복 사격",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ?t=1m",
    trials: JSON.stringify([{ dps: 12345.5, note: "1회" }]),
  }))
    form.set(key, value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.save.mockResolvedValue({ id, version: 2, versionId });
  boundary.review.mockResolvedValue({});
  boundary.verify.mockResolvedValue({});
  boundary.archive.mockResolvedValue({});
});
describe("DPS form mutation boundaries", () => {
  it("preserves a memo-only unmeasured trial in drafts and requires its measurement before submission", async () => {
    const form = draft();
    form.set("trials", JSON.stringify([{ dps: null, note: "측정 전에 적어 둔 조건" }]));
    expect((await saveDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(true);
    expect(boundary.save.mock.calls[0][0].payload.trials).toEqual([
      { dps: null, note: "측정 전에 적어 둔 조건" },
    ]);
    const submitted = submission();
    submitted.set("trials", JSON.stringify([{ dps: null, note: "측정 전 조건" }]));
    expect((await saveDpsResearchForm({ ok: false, message: "" }, submitted)).ok).toBe(false);
    expect(boundary.save).toHaveBeenCalledTimes(1);
  });
  it("keeps incomplete conditions valid for a draft and binds subsequent saves to the record version", async () => {
    const form = draft();
    form.set("id", id);
    form.set("expectedUpdatedAt", stamp);
    const result = await saveDpsResearchForm({ ok: false, message: "" }, form);
    expect(result.ok).toBe(true);
    expect(boundary.save.mock.calls[0][0]).toMatchObject({
      id,
      expectedUpdatedAt: stamp,
      action: "DRAFT",
      payload: {
        title: "실측 연구",
        trials: [],
        durationSeconds: null,
        distanceMeters: null,
        evidenceDocument: null,
      },
    });
    expect(result.href).toBe(`/db/dps/${id}?version=2`);
    expect(boundary.refresh).toHaveBeenCalledWith("/db", "layout");
  });
  it("parses actual decimal measurements, zero-distance conditions and a canonical video before submission", async () => {
    const result = await saveDpsResearchForm({ ok: false, message: "" }, submission());
    expect(result.ok).toBe(true);
    expect(boundary.save.mock.calls[0][0]).toMatchObject({
      action: "SUBMIT",
      payload: {
        durationSeconds: 60,
        distanceMeters: 0,
        trials: [{ dps: 12345.5, note: "1회" }],
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60s",
      },
    });
  });
  it("requires complete conditions and original evidence for publishing, without revalidation on failure", async () => {
    for (const missing of ["gamePatch", "measuredAt", "composition", "youtubeUrl"]) {
      const form = submission();
      form.delete(missing);
      const result = await saveDpsResearchForm({ ok: false, message: "" }, form);
      expect(result.ok).toBe(false);
    }
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("blocks an unfinished media upload and refuses duplicate, unknown, invalid trial or arbitrary video fields", async () => {
    const pending = draft();
    pending.set("contentMediaReady", "false");
    expect((await saveDpsResearchForm({ ok: false, message: "" }, pending)).message).toContain(
      "이미지",
    );
    for (const mutate of [
      (form: FormData) => form.append("title", "duplicate"),
      (form: FormData) => form.set("ownerId", "forged"),
      (form: FormData) => form.set("trials", "{bad"),
      (form: FormData) => form.set("trials", JSON.stringify([{ dps: -1, note: "" }])),
      (form: FormData) => form.set("youtubeUrl", "https://evil.example/video"),
    ]) {
      const form = draft();
      mutate(form);
      expect((await saveDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(false);
    }
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("preserves the canonical evidence document instead of putting uploaded image bytes in the payload", async () => {
    const form = submission();
    form.delete("youtubeUrl");
    form.set(
      "evidenceDocument",
      JSON.stringify({
        schemaVersion: "uniz-content.v1",
        type: "doc",
        content: [{ type: "image", attrs: { imageId: id, alt: "실측 결과" } }],
      }),
    );
    form.set("evidenceText", "실측 결과");
    expect((await saveDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(true);
    expect(boundary.save.mock.calls[0][0].payload.evidenceDocument.content[0].attrs).toEqual({
      imageId: id,
      alt: "실측 결과",
    });
    expect(JSON.stringify(boundary.save.mock.calls[0][0])).not.toContain("base64");
  });
  it("returns a safe repository permission error and hides database diagnostics", async () => {
    boundary.save.mockRejectedValueOnce(new DpsResearchError("권한을 확인해 주세요."));
    expect((await saveDpsResearchForm({ ok: false, message: "" }, draft())).message).toContain(
      "권한",
    );
    boundary.save.mockRejectedValueOnce(new Error("private postgres diagnostics"));
    expect((await saveDpsResearchForm({ ok: false, message: "" }, draft())).message).not.toContain(
      "postgres",
    );
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("reviews the fixed version using its own update stamp and requires a reason for negative decisions", async () => {
    const form = new FormData();
    form.set("versionId", versionId);
    form.set("expectedUpdatedAt", stamp);
    form.set("decision", "APPROVE");
    form.set("note", "");
    expect((await reviewDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(true);
    expect(boundary.review).toHaveBeenCalledWith({
      versionId,
      expectedUpdatedAt: stamp,
      action: "APPROVE",
      note: "",
    });
    boundary.review.mockClear();
    boundary.refresh.mockClear();
    form.set("decision", "REJECT");
    expect((await reviewDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(false);
    expect(boundary.review).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("records both positive reproduction checks and explicit withdrawal without accepting forged checkbox values", async () => {
    const form = new FormData();
    form.set("versionId", versionId);
    form.set("expectedUpdatedAt", stamp);
    form.set("note", "동일 조건으로 확인");
    form.set("confirmed", "on");
    expect((await verifyDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(true);
    expect(boundary.verify.mock.calls[0][0].confirmed).toBe(true);
    form.delete("confirmed");
    expect((await verifyDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(true);
    expect(boundary.verify.mock.calls[1][0].confirmed).toBe(false);
    form.set("confirmed", "ADMIN");
    expect((await verifyDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(false);
    expect(boundary.verify).toHaveBeenCalledTimes(2);
  });
  it("archives with the parent-record stamp and refuses a guessed extra target", async () => {
    const form = new FormData();
    form.set("id", id);
    form.set("expectedUpdatedAt", stamp);
    expect((await archiveDpsResearchForm({ ok: false, message: "" }, form)).href).toBe("/db/mine");
    expect(boundary.archive).toHaveBeenCalledWith({ id, expectedUpdatedAt: stamp });
    boundary.archive.mockClear();
    form.set("versionId", versionId);
    expect((await archiveDpsResearchForm({ ok: false, message: "" }, form)).ok).toBe(false);
    expect(boundary.archive).not.toHaveBeenCalled();
  });
});
