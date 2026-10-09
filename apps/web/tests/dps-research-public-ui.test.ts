import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/components/game-info/research-forms", () => ({
  DpsArchiveForm: () => createElement("button", null, "보관"),
  DpsVerificationForm: () => createElement("button", null, "재현 검토 등록"),
}));
import { DpsPublishedCard, DpsResearchDetailView } from "../src/components/game-info/live-views";
import { GameInfoDirectory, GameInfoDetail } from "../src/components/game-info/views";
import { gameInfoExamples } from "../src/lib/game-info-examples";
import type { DpsResearchDetail } from "../src/lib/dps-research";

const record: DpsResearchDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  versionId: "22222222-2222-4222-8222-222222222222",
  version: 1,
  ownerId: "owner",
  author: "Fixture member",
  status: "APPROVED",
  updatedAt: "2026-10-09T00:00:00Z",
  recordUpdatedAt: "2026-10-09T00:00:00Z",
  createdAt: "2026-10-09T00:00:00Z",
  submittedAt: "2026-10-09T00:00:00Z",
  reviewedAt: "2026-10-09T00:00:00Z",
  reviewNote: "Checked evidence",
  publishedVersion: 1,
  verified: false,
  verificationCount: 0,
  archivedAt: null,
  hiddenAt: null,
  isOwner: false,
  canEdit: false,
  canReview: false,
  canVerify: false,
  versions: [],
  verifications: [],
  buildLink: null,
  payload: {
    title: "Actual measurement",
    summary: "Observed record",
    buildVersionId: null,
    composition: "Recorded equipment",
    gamePatch: "Recorded patch",
    scenario: "Recorded scenario",
    trance: "",
    platform: "PC",
    target: "Measured target",
    durationSeconds: 30,
    distanceMeters: 10,
    reloadPolicy: "Reload included",
    hitPolicy: "Body hits",
    buffPolicy: "No buffs",
    procedure: "First hit to 30 seconds",
    measuredAt: "2026-10-09",
    trials: [
      { dps: 100, note: "Observed" },
      { dps: 200, note: "Observed" },
      { dps: 300, note: "Observed" },
    ],
    evidenceDocument: null,
    evidenceText: "Original screenshot notes",
    youtubeUrl: null,
  },
};
const html = (component: Parameters<typeof createElement>[0], props: object) =>
  renderToStaticMarkup(createElement(component, props));
describe("public measurement presentation and illustrative fixtures", () => {
  it("does not promote an administrator-approved measurement to reproduced evidence", () => {
    const rendered = html(DpsPublishedCard, { record });
    expect(rendered).toContain("재현 검증 전");
    expect(rendered).toContain("평균 DPS · 회원 실측");
    expect(rendered).toContain("200");
    expect(rendered).not.toContain("커뮤니티 검증 완료");
    expect(rendered).not.toContain("가상 값");
    expect(rendered).toContain(`/db/dps/${record.id}?version=1`);
  });
  it("shows independent verification only when the authorized DTO qualifies it", () => {
    const rendered = html(DpsPublishedCard, {
      record: { ...record, verified: true, verificationCount: 2 },
    });
    expect(rendered).toContain("커뮤니티 검증 완료");
    expect(rendered).not.toContain("재현 검증 전");
  });
  it("keeps a private revision distinct from the version still published", () => {
    const rendered = html(DpsResearchDetailView, {
      record: {
        ...record,
        status: "PENDING",
        version: 2,
        isOwner: true,
        canEdit: true,
        publishedVersion: 1,
      },
    });
    expect(rendered).toContain("기존 승인본 v1");
    expect(rendered).toContain("검토 대기");
    expect(rendered).not.toContain("재현 검토 등록");
    expect(rendered).toContain("수정본 작성");
  });
  it("does not offer the author a reproduction confirmation or a guest management controls", () => {
    const own = html(DpsResearchDetailView, {
      record: { ...record, isOwner: true, canVerify: true },
    });
    expect(own).not.toContain("재현 검토 등록");
    const guest = html(DpsResearchDetailView, { record });
    expect(guest).not.toContain("수정본 작성");
    expect(guest).not.toContain("관리자 검토");
  });
  it("separates real measurements from the single virtual example and keeps examples off later pages", () => {
    const first = html(GameInfoDirectory, {
      records: gameInfoExamples("single"),
      research: { items: [record], page: 1, hasNext: true },
    });
    expect(first).toContain("공개된 측정 기록");
    expect(first).toContain("작성 형식 예시");
    expect(first).toContain("실제 게임 수치 아님");
    const next = html(GameInfoDirectory, {
      records: gameInfoExamples("single"),
      research: { items: [record], page: 2, hasNext: false },
    });
    expect(next).not.toContain("작성 형식 예시");
    expect(next).toContain("이전");
    expect(html(GameInfoDetail, { record: gameInfoExamples("single")[0] })).toContain(
      "모든 DPS는 화면 확인을 위한 가상 값입니다",
    );
  });
});
