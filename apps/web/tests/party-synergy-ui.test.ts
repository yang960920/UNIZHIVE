import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyPartyContribution, type PartyContribution } from "@uniz/domain";

const boundary = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  mutate: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = boundary.cursor++;
    if (!(index in boundary.states)) boundary.states[index] = initial;
    return [
      boundary.states[index],
      (next: unknown) => {
        boundary.states[index] = next;
      },
    ];
  },
  useTransition: () => [false, (task: () => void) => task()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/ops/actions", () => ({
  savePartyForm: vi.fn(),
  managePartyParticipantForm: vi.fn(),
}));
vi.mock("@/app/admin/calendar-field", () => ({ CalendarField: "CalendarField" }));
vi.mock("@/app/admin/admin-form", () => ({ AdminForm: "AdminForm" }));
vi.mock("@/lib/operational-actions", () => ({ mutateOperationalData: boundary.mutate }));

import {
  PartyContributionEditor,
  PartyRequestedContributions,
  PartySynergyGuide,
  PartySynergySummary,
} from "../src/components/party-synergy";
import { OperationBriefing } from "../src/components/operation-directory";
import type { OperationDirectoryDetail } from "../src/lib/server/operation-directory";

type Element = ReactElement<Record<string, unknown>>;
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Element).props.children);
}
const operation = (myRsvp: "GOING" | "MAYBE" | null): OperationDirectoryDetail => ({
  id: "party-a",
  seasonId: "season-a",
  title: "함께 무깊",
  type: "RAID",
  contentKey: "endless-deep",
  description: "",
  meetingPoint: "",
  seasonName: "UNIZ",
  startsAt: "2026-10-11T10:00:00Z",
  endsAt: null,
  updatedAt: "2026-10-10T10:00:00Z",
  capacity: 4,
  status: "SCHEDULED",
  goingCount: 1,
  maybeCount: 0,
  unavailableCount: 0,
  myRsvp,
  myMembership: true,
  mayRespond: true,
  mayGo: true,
  mayMaybe: true,
  canCancelParticipation: true,
  responseNotice: "",
  timeConflictNotice: null,
  canManage: false,
  asOf: "2026-10-10T10:00:00Z",
  season: null,
  canCreate: false,
  canManageParticipants: false,
  attendees: [],
  requestedContributions: [],
  myContribution: emptyPartyContribution(),
});
beforeEach(() => {
  boundary.states = [];
  boundary.cursor = 0;
  boundary.mutate.mockReset().mockResolvedValue({ ok: true });
});

describe("optional party setup controls", () => {
  it("offers multiple effects without quotas or required selections", () => {
    const tree = PartyRequestedContributions({ initial: ["fortress", "healing"] });
    const checkboxes = elements(tree).filter((node) => node.props.type === "checkbox");
    expect(checkboxes).toHaveLength(10);
    expect(
      checkboxes.every(
        (node) => node.props.name === "requestedContributions" && !node.props.required,
      ),
    ).toBe(true);
    expect(
      checkboxes.filter((node) => node.props.defaultChecked).map((node) => node.props.value),
    ).toEqual(["fortress", "healing"]);
    expect(text(tree)).toContain("자유 모집");
    expect(text(tree)).not.toMatch(/Tank|DPS|Support|탱커|서포터/);
  });
  it("saves zero separately from unknown percentages and permits multiple effects", () => {
    const onSave = vi.fn();
    const initial = { ...emptyPartyContribution(), keys: ["fortress" as const] };
    const render = () => {
      boundary.cursor = 0;
      return PartyContributionEditor({ initial, disabled: false, pending: false, onSave });
    };
    let tree = render();
    const healing = elements(tree).find(
      (node) => node.props.type === "checkbox" && node.props.value === "healing",
    )!;
    (healing.props.onChange as (event: unknown) => void)({ target: { checked: true } });
    const percentages = elements(tree).filter((node) => node.props.type === "number");
    expect(percentages.every((node) => node.props.min === 0 && node.props.max === 100)).toBe(true);
    (percentages[0]!.props.onChange as (event: unknown) => void)({ target: { value: "0" } });
    tree = render();
    const form = elements(tree).find((node) => node.type === "form")!;
    (form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(onSave).toHaveBeenCalledWith({
      keys: ["fortress", "healing"],
      loadoutNote: "",
      vulnerability: { weapon: 0, status: null, melee: null },
    });
  });
  it("prevents an unconfirmed attendee from saving a setup", () => {
    const onSave = vi.fn();
    const tree = PartyContributionEditor({ disabled: true, pending: false, onSave });
    expect(elements(tree).find((node) => node.type === "fieldset")?.props.disabled).toBe(true);
    const form = elements(tree).find((node) => node.type === "form")!;
    (form.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(onSave).not.toHaveBeenCalled();
    expect(text(tree)).toContain("참가 또는 미정으로 응답한 뒤");
  });
});

describe("declared cooperation summary", () => {
  it("displays the 100% cap using only confirmed attendees and keeps unknown distinct from zero", () => {
    const setup = (weapon: number | null, melee: number | null = null): PartyContribution => ({
      ...emptyPartyContribution(),
      keys: ["weapon-vulnerability"],
      vulnerability: { weapon, status: null, melee },
    });
    const markup = renderToStaticMarkup(
      PartySynergySummary({
        requestedContributions: [],
        attendees: [
          { status: "GOING", contribution: setup(60, 0) },
          { status: "GOING", contribution: setup(70) },
          { status: "MAYBE", contribution: setup(100, 100) },
          { status: "UNAVAILABLE", contribution: setup(100, 100) },
        ],
      }),
    );
    expect(markup).toContain("입력 합계 130%");
    expect(markup).toContain("100%");
    expect(markup).not.toContain("입력 합계 330%");
    expect(markup).toContain("현재 명단의 참가 확정 멤버 2명 기준");
    expect(markup).toContain("미입력");
    expect(markup).toContain("0%");
    expect(markup).toContain("실제 전투 수치를 계산하지 않습니다");
  });
  it("keeps the interaction guide collapsed and distinguishes sources from community cap policy", () => {
    const tree = PartySynergyGuide();
    expect(tree.type).toBe("details");
    expect(tree.props.open).toBeUndefined();
    expect(text(tree)).toContain("커뮤니티 운용 기준");
    expect(text(tree)).toContain("적용");
    expect(text(tree)).toContain("확인");
    const links = elements(tree).filter((node) => node.type === "a");
    expect(links.length).toBeGreaterThan(10);
    expect(links.every((node) => node.props.rel === "noopener noreferrer")).toBe(true);
  });
});

describe("detail setup saves preserve participation and edit versions", () => {
  it.each(["GOING", "MAYBE"] as const)(
    "keeps the existing %s response when saving a setup",
    async (status) => {
      const current = operation(status);
      const tree = OperationBriefing({ operation: current });
      const editor = elements(tree).find((node) => node.type === PartyContributionEditor)!;
      const contribution = { ...emptyPartyContribution(), keys: ["healing" as const] };
      (editor.props.onSave as (input: PartyContribution) => void)(contribution);
      await vi.waitFor(() =>
        expect(boundary.mutate).toHaveBeenCalledWith({
          action: "RSVP",
          operationId: current.id,
          status,
          expectedUpdatedAt: current.updatedAt,
          contribution,
        }),
      );
    },
  );
  it("does not join a party as a side effect of selecting a setup", () => {
    const tree = OperationBriefing({ operation: operation(null) });
    const editor = elements(tree).find((node) => node.type === PartyContributionEditor)!;
    expect(editor.props.disabled).toBe(true);
    (editor.props.onSave as (input: PartyContribution) => void)(emptyPartyContribution());
    expect(boundary.mutate).not.toHaveBeenCalled();
  });
});
