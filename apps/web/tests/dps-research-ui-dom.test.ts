// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchFixture } from "./dps-research-fixture";
const boundary = vi.hoisted(() => ({
  save: vi.fn(),
  review: vi.fn(),
  verify: vi.fn(),
  archive: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/db/actions", () => ({
  saveDpsResearchForm: boundary.save,
  reviewDpsResearchForm: boundary.review,
  verifyDpsResearchForm: boundary.verify,
  archiveDpsResearchForm: boundary.archive,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: boundary.push, refresh: boundary.refresh }),
}));
vi.mock("@/components/content/editor", () => ({
  ContentEditor: function ContentEditor(props: {
    name: string;
    textName: string;
    initialDocument: unknown;
    initialText: string;
    disabled: boolean;
    onReadyChange: (ready: boolean) => void;
  }) {
    const { onReadyChange, disabled } = props;
    useEffect(() => onReadyChange(!disabled), [disabled, onReadyChange]);
    return createElement(
      "div",
      {},
      createElement("input", {
        type: "hidden",
        name: props.name,
        value: JSON.stringify(
          props.initialDocument ?? {
            schemaVersion: "uniz-content.v1",
            type: "doc",
            content: [{ type: "paragraph" }],
          },
        ),
      }),
      createElement("input", { type: "hidden", name: props.textName, value: props.initialText }),
      createElement(
        "button",
        { type: "button", onClick: () => props.onReadyChange(false) },
        "이미지 등록 대기",
      ),
    );
  },
}));
vi.mock("@/components/content/presentation", () => ({
  YouTubeField: ({ initialUrl, disabled }: { initialUrl: string | null; disabled: boolean }) =>
    createElement("input", { name: "youtubeUrl", defaultValue: initialUrl ?? "", disabled }),
  ContentBody: () => null,
  VideoReference: () => null,
}));
import {
  DpsArchiveForm,
  DpsResearchForm,
  DpsReviewForm,
  DpsVerificationForm,
} from "../src/components/game-info/research-forms";
let container: HTMLDivElement, root: Root;
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  ) as HTMLButtonElement;
async function mount(node: React.ReactNode) {
  await act(async () => root.render(node));
}
async function text(name: string, value: string) {
  const input = container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  for (const action of [boundary.save, boundary.review, boundary.verify, boundary.archive])
    action.mockResolvedValue({ ok: false, message: "연결 실패" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("DPS research form user flow", () => {
  it("keeps an unmeasured trial's saved memo and serializes its empty DPS as null", async () => {
    const record = researchFixture();
    record.payload.trials = [{ dps: null, note: "측정 준비 메모" }];
    await mount(createElement(DpsResearchForm, { data: { initial: record, buildVersions: [] } }));
    expect(container.querySelector('input[id*="-dps-"]')?.getAttribute("value")).toBe("");
    const draftButton = button("초안 저장");
    expect(draftButton.formNoValidate).toBe(true);
    // jsdom's requestSubmit omits submitter.formNoValidate; dispatch its submit event directly.
    await act(async () =>
      draftButton.form!.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: draftButton }),
      ),
    );
    expect(JSON.parse(String((boundary.save.mock.calls[0][1] as FormData).get("trials")))).toEqual([
      { dps: null, note: "측정 준비 메모" },
    ]);
  });
  it("submits the actual condition and trial fields once, preserving all controlled inputs on failure", async () => {
    const record = researchFixture();
    await mount(createElement(DpsResearchForm, { data: { initial: record, buildVersions: [] } }));
    await text("title", "변경한 연구 제목");
    await text("target", "수정한 측정 대상");
    await act(async () => button("초안 저장").click());
    expect(boundary.save).toHaveBeenCalledOnce();
    const form = boundary.save.mock.calls[0][1] as FormData;
    expect(form.get("id")).toBe(record.id);
    expect(form.get("expectedUpdatedAt")).toBe(record.recordUpdatedAt);
    expect(form.get("action")).toBe("DRAFT");
    expect(form.get("title")).toBe("변경한 연구 제목");
    expect(form.get("target")).toBe("수정한 측정 대상");
    expect(JSON.parse(String(form.get("trials")))).toEqual(record.payload.trials);
    expect(form.get("evidenceText")).toBe(record.payload.evidenceText);
    expect((container.querySelector('[name="title"]') as HTMLInputElement).value).toBe(
      "변경한 연구 제목",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("연결 실패");
    expect(boundary.refresh).not.toHaveBeenCalled();
  });
  it("blocks both submit intents while image upload is not ready", async () => {
    await mount(createElement(DpsResearchForm, { data: { initial: null, buildVersions: [] } }));
    expect(button("초안 저장").disabled).toBe(false);
    await act(async () => button("이미지 등록 대기").click());
    expect(button("초안 저장").disabled).toBe(true);
    expect(button("게시 검토 요청").disabled).toBe(true);
    expect(boundary.save).not.toHaveBeenCalled();
    expect(container.textContent).toContain("게시 승인되면 게임 정보에서 누구나 볼 수 있습니다");
  });
  it("limits dynamic measurement rows to twenty and keeps at least one row", async () => {
    await mount(createElement(DpsResearchForm, { data: { initial: null, buildVersions: [] } }));
    expect(container.querySelector('[aria-label="1회 측정 삭제"]')?.hasAttribute("disabled")).toBe(
      true,
    );
    for (let count = 1; count < 20; count++) await act(async () => button("측정 추가").click());
    expect(container.querySelectorAll('[aria-label$="측정 삭제"]')).toHaveLength(20);
    expect(button("측정 추가").disabled).toBe(true);
    await act(async () =>
      (container.querySelector('[aria-label="20회 측정 삭제"]') as HTMLButtonElement).click(),
    );
    expect(container.querySelectorAll('[aria-label$="측정 삭제"]')).toHaveLength(19);
    expect(button("측정 추가").disabled).toBe(false);
  });
  it("locks pending fields and refreshes the saved fixed-version destination on success", async () => {
    let finish!: (value: unknown) => void;
    boundary.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount(
      createElement(DpsResearchForm, { data: { initial: researchFixture(), buildVersions: [] } }),
    );
    await act(async () => button("초안 저장").click());
    expect((container.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    await act(async () =>
      finish({ ok: true, message: "초안 저장", href: "/db/dps/saved?version=3" }),
    );
    expect(boundary.push).toHaveBeenCalledWith("/db/dps/saved?version=3");
    expect(boundary.refresh).toHaveBeenCalled();
  });
  it("shows approval controls only for ADMIN review access, including an administrator's own submitted record", async () => {
    const record = researchFixture({ canReview: true });
    await mount(createElement(DpsReviewForm, { record, administrator: false }));
    expect(container.querySelector("form")).toBeNull();
    await mount(createElement(DpsReviewForm, { record, administrator: true }));
    expect(button("게시 승인")).toBeTruthy();
    expect(container.querySelector('[name="versionId"]')?.getAttribute("value")).toBe(
      record.versionId,
    );
    expect(container.querySelector('[name="expectedUpdatedAt"]')?.getAttribute("value")).toBe(
      record.updatedAt,
    );
    await act(async () => button("게시 승인").click());
    expect((boundary.review.mock.calls[0][1] as FormData).get("decision")).toBe("APPROVE");
  });
  it("keeps reproduction confirmation staff-only and owner-excluded, preserving a prior review for withdrawal", async () => {
    const record = researchFixture({ status: "APPROVED", canVerify: true, isOwner: true });
    await mount(createElement(DpsVerificationForm, { record, reviewerId: "reviewer" }));
    expect(container.querySelector("form")).toBeNull();
    const readable = {
      ...record,
      isOwner: false,
      verifications: [
        {
          reviewerId: "reviewer",
          reviewerName: "검토자",
          confirmed: true,
          note: "기존 검토",
          updatedAt: record.updatedAt,
        },
      ],
    };
    await mount(createElement(DpsVerificationForm, { record: readable, reviewerId: "reviewer" }));
    const checkbox = container.querySelector('[name="confirmed"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await act(async () => checkbox.click());
    await text("note", "재현 확인 철회 사유");
    await act(async () => button("재현 검토 저장").click());
    const form = boundary.verify.mock.calls[0][1] as FormData;
    expect(form.get("confirmed")).toBeNull();
    expect(form.get("note")).toBe("재현 확인 철회 사유");
    expect(form.get("expectedUpdatedAt")).toBe(record.updatedAt);
  });
  it("does not expose archive controls to others and uses the parent record stamp for the owner", async () => {
    const record = researchFixture();
    await mount(createElement(DpsArchiveForm, { record: { ...record, isOwner: false } }));
    expect(container.querySelector("form")).toBeNull();
    await mount(createElement(DpsArchiveForm, { record }));
    await act(async () => button("자료 보관").click());
    const form = boundary.archive.mock.calls[0][1] as FormData;
    expect(form.get("id")).toBe(record.id);
    expect(form.get("expectedUpdatedAt")).toBe(record.recordUpdatedAt);
  });
});
