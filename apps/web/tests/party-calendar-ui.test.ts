import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import {
  partyCalendarHref,
  partyCreateHref,
  partyDefaultStart,
  shiftPartyMonth,
} from "../src/lib/party-navigation";

const boundary = vi.hoisted(() => ({ push: vi.fn(), states: [] as unknown[], cursor: 0 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
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
vi.mock("@/app/ops/actions", () => ({
  savePartyForm: vi.fn(),
  managePartyParticipantForm: vi.fn(),
}));
vi.mock("@/lib/party-content", () => import("../src/lib/party-content"));
vi.mock("@/lib/party-navigation", () => import("../src/lib/party-navigation"));
vi.mock("@/app/admin/calendar-field", () => ({ CalendarField: "CalendarField" }));
vi.mock("@/app/admin/admin-form", () => ({ AdminForm: "AdminForm" }));
vi.mock("@/lib/operational-actions", () => ({ mutateOperationalData: vi.fn() }));

import {
  PartyCalendarView,
  type PartyCalendarViewData,
} from "../src/components/party-calendar-view";
import { PartyForm, PartyParticipantForm } from "../src/components/party-form";
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
const data = (): PartyCalendarViewData => ({
  seasons: [
    {
      id: "season-a",
      name: "UNIZ",
      serverAddress: "E_Dream-X0070",
      scenarioSlug: "endless-dream",
      myMembership: true,
      canCreate: true,
    },
    {
      id: "season-b",
      name: "UNIZ",
      serverAddress: "Manibus-X0100",
      scenarioSlug: "manibus",
      myMembership: false,
      canCreate: false,
    },
  ],
  selectedSeasonId: "season-a",
  month: "2026-10",
  selectedDay: "2026-10-07",
  canCreate: true,
  canManage: false,
  asOf: "2026-10-07T03:00:00.000Z",
  calendarDays: [
    { date: "2026-10-06", inMonth: true, isToday: false, operationCount: 0 },
    { date: "2026-10-07", inMonth: true, isToday: true, operationCount: 2 },
  ],
  operations: [],
  pagination: { page: 1, pageSize: 4, totalCount: 0, hasNextPage: false },
  overflowNotice: null,
});
beforeEach(() => {
  boundary.push.mockClear();
  boundary.states = [];
  boundary.cursor = 0;
});

describe("party calendar navigation and controls", () => {
  it("preserves season identity, month, day and pagination separately from hive labels", () => {
    expect(
      partyCalendarHref({ seasonId: "season-a", month: "2026-10", day: "2026-10-07", page: 2 }),
    ).toBe("/ops?seasonId=season-a&month=2026-10&day=2026-10-07&page=2");
    expect(partyCreateHref("season-a", "2026-10-07")).toBe(
      "/ops/new?seasonId=season-a&day=2026-10-07",
    );
    const nodes = elements(PartyCalendarView({ data: data() }));
    expect(nodes.filter((node) => node.type === "option").map((node) => node.props.value)).toEqual([
      "season-a",
      "season-b",
    ]);
    const select = nodes.find((node) => node.type === "select")!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: "season-b" } });
    expect(boundary.push).toHaveBeenCalledWith(
      "/ops?seasonId=season-b&month=2026-10&day=2026-10-07",
      { scroll: false },
    );
  });
  it("uses KST dates, counted date links and monthly navigation without per-day prefetching", () => {
    const nodes = elements(PartyCalendarView({ data: data() }));
    const today = nodes.find(
      (node) => node.props["aria-label"] === "10월 7일 (수) 오늘, 모집 2건",
    )!;
    expect(today.props.href).toBe("/ops?seasonId=season-a&month=2026-10&day=2026-10-07");
    expect(today.props.prefetch).toBe(false);
    expect(today.props["aria-current"]).toBe("date");
    expect(nodes.find((node) => node.props["aria-label"] === "이전 달")?.props.href).toBe(
      "/ops?seasonId=season-a&month=2026-09",
    );
    expect(nodes.find((node) => node.props["aria-label"] === "다음 달")?.props.href).toBe(
      "/ops?seasonId=season-a&month=2026-11",
    );
    expect(shiftPartyMonth("2026-01", -1)).toBe("2025-12");
  });
  it("keeps empty states, mobile date links and non-enrolled season guidance available", () => {
    const current = { ...data(), selectedSeasonId: "season-b", canCreate: false };
    const tree = PartyCalendarView({ data: current });
    expect(text(tree)).toContain("날짜 목록으로 보기");
    expect(text(tree)).toContain("이 날짜에 등록된 모집이 없습니다");
    expect(elements(tree).some((node) => node.props.href === "/season/season-b")).toBe(true);
    expect(elements(tree).some((node) => String(node.props.href).includes("/ops/new"))).toBe(false);
  });
  it("shows time conflict warnings and preserves filters on additional listing pages", () => {
    const current = data();
    current.pagination = { ...current.pagination, page: 2, totalCount: 9, hasNextPage: true };
    current.calendarDays = current.calendarDays.map((day) => ({
      ...day,
      operationCount: day.date === current.selectedDay ? 9 : day.operationCount,
    }));
    current.overflowNotice = "추가 목록도 확인해주세요.";
    current.operations = [
      {
        id: "party-a",
        title: "함께 무깊",
        type: "RAID",
        description: "준비물 안내",
        seasonName: "UNIZ",
        seasonId: "season-a",
        startsAt: "2026-10-07T10:00:00Z",
        endsAt: null,
        capacity: 4,
        status: "SCHEDULED",
        goingCount: 4,
        maybeCount: 0,
        unavailableCount: 0,
        myRsvp: "GOING",
        mayRespond: true,
        mayGo: true,
        responseNotice: "",
        canManage: false,
        contentKey: "endless-deep",
        meetingPoint: "음성방",
        timeConflictNotice: "참가한 다른 파티와 시간이 겹칩니다.",
      },
    ];
    const tree = PartyCalendarView({ data: current });
    expect(text(tree)).toContain("정원 마감");
    expect(text(tree)).toContain("무깊");
    expect(text(tree)).toContain("시간이 겹칩니다");
    const nodes = elements(tree);
    const next = nodes.find((node) => text(node) === "다음 목록")!;
    expect(next.props).toMatchObject({
      href: "/ops?seasonId=season-a&month=2026-10&day=2026-10-07&page=3",
      prefetch: false,
      scroll: false,
    });
    const previous = nodes.find((node) => text(node) === "이전 목록")!;
    expect(previous.props).toMatchObject({
      href: "/ops?seasonId=season-a&month=2026-10&day=2026-10-07",
      prefetch: false,
      scroll: false,
    });
    expect(nodes.find((node) => node.props["aria-label"] === "이전 달")?.props.href).toBe(
      "/ops?seasonId=season-a&month=2026-09",
    );
    expect(
      nodes.find((node) => node.props["aria-label"] === "10월 7일 (수) 오늘, 모집 9건")?.props.href,
    ).toBe("/ops?seasonId=season-a&month=2026-10&day=2026-10-07");
  });
});

describe("party form season-specific input", () => {
  const seasons = [
    {
      id: "season-a",
      name: "UNIZ",
      serverAddress: "E_Dream-X0070",
      scenarioSlug: "endless-dream",
      gravityContentEnabled: false,
      startsAt: "2026-10-01T00:00:00Z",
      settlementAt: null,
      status: "ACTIVE" as const,
    },
    {
      id: "season-b",
      name: "UNIZ",
      serverAddress: "Manibus-X0100",
      scenarioSlug: "manibus",
      gravityContentEnabled: true,
      startsAt: "2026-10-01T00:00:00Z",
      settlementAt: null,
      status: "ACTIVE" as const,
    },
  ];
  it("offers Endless Dream content only for that scenario and condenser only when enabled", () => {
    let tree = PartyForm({ data: { seasons } });
    const contentSelect = elements(tree).find((node) => node.props.name === "contentKey")!;
    expect(text(contentSelect)).toContain("무깊무킨무얕");
    expect(text(contentSelect)).not.toContain("응축기");
    const select = elements(tree).find((node) => node.props.name === "seasonId")!;
    (select.props.onChange as (event: unknown) => void)({ target: { value: "season-b" } });
    boundary.cursor = 0;
    tree = PartyForm({ data: { seasons } });
    const changed = elements(tree).find((node) => node.props.name === "contentKey")!;
    expect(text(changed)).not.toContain("무깊");
    expect(text(changed)).toContain("응축기");
  });
  it("carries real selected dates safely and keeps original edit versions", () => {
    expect(partyDefaultStart("2026-10-07")).toBe("2026-10-07T10:00:00.000Z");
    expect(partyDefaultStart("2026-02-31")).toBeUndefined();
    expect(partyDefaultStart("nonsense")).toBeUndefined();
    const initial = {
      id: "party-a",
      seasonId: "season-a",
      title: "모집",
      contentKey: "endless-deep" as const,
      meetingPoint: "",
      description: "",
      startsAt: "2026-10-07T10:00:01Z",
      endsAt: null,
      capacity: 4,
      status: "SCHEDULED" as const,
      updatedAt: "2026-10-06T10:00:00Z",
      createdById: "owner",
    };
    const tree = PartyForm({ data: { seasons, initial } });
    expect(
      elements(tree).find((node) => node.props.name === "expectedUpdatedAt")?.props.value,
    ).toBe(initial.updatedAt);
    expect(elements(tree).find((node) => node.props.name === "originalStartsAt")?.props.value).toBe(
      initial.startsAt,
    );
    expect(text(tree)).toContain("모집 취소");
  });
  it("preserves an existing disabled condenser key so its owner can cancel it", () => {
    const initial = {
      id: "party-a",
      seasonId: "season-a",
      title: "응축기 모집",
      contentKey: "gravity-condenser" as const,
      meetingPoint: "",
      description: "",
      startsAt: "2026-10-07T10:00:00Z",
      endsAt: null,
      capacity: 4,
      status: "SCHEDULED" as const,
      updatedAt: "2026-10-06T10:00:00Z",
      createdById: "owner",
    };
    const tree = PartyForm({ data: { seasons, initial } });
    const select = elements(tree).find((node) => node.props.name === "contentKey")!;
    expect(select.props.value).toBe("gravity-condenser");
    expect(text(select)).toContain("응축기 · 현재 비활성");
    expect(text(tree)).toContain("모집 취소");
  });
  it("offers no form when no eligible season exists and participant removal only targets one party", () => {
    expect(text(PartyForm({ data: { seasons: [] } }))).toContain("모집할 수 있는 시즌이 없습니다");
    boundary.cursor = 0;
    const tree = PartyParticipantForm({
      operationId: "party-a",
      userId: "member-a",
      status: "GOING",
      updatedAt: "version",
    });
    expect(elements(tree).find((node) => node.props.name === "operationId")?.props.value).toBe(
      "party-a",
    );
    expect(elements(tree).find((node) => node.props.name === "userId")?.props.value).toBe(
      "member-a",
    );
  });
});

describe("disabled seasonal content response controls", () => {
  it("keeps an existing participation cancellation available while disabling positive responses", () => {
    const operation: OperationDirectoryDetail = {
      id: "party-a",
      seasonId: "season-a",
      title: "응축기",
      type: "RAID",
      contentKey: "gravity-condenser",
      description: "",
      meetingPoint: "",
      seasonName: "UNIZ",
      startsAt: "2026-10-09T10:00:00Z",
      endsAt: null,
      updatedAt: "2026-10-07T10:00:00Z",
      capacity: 4,
      status: "SCHEDULED",
      goingCount: 1,
      maybeCount: 0,
      unavailableCount: 0,
      myRsvp: "GOING",
      myMembership: true,
      mayRespond: true,
      mayGo: false,
      mayMaybe: false,
      canCancelParticipation: true,
      responseNotice: "콘텐츠가 비활성화되었습니다. 기존 참가 응답을 취소할 수 있습니다.",
      timeConflictNotice: null,
      canManage: false,
      asOf: "2026-10-07T10:00:00Z",
      season: null,
      canCreate: false,
      canManageParticipants: false,
      attendees: [],
      roles: [],
    };
    const nodes = elements(OperationBriefing({ operation }));
    const button = (label: string) =>
      nodes.find((node) => node.type === "button" && text(node) === label)!;
    expect(button("참가").props.disabled).toBe(true);
    expect(button("미정").props.disabled).toBe(true);
    expect(button("참가 취소").props.disabled).toBe(false);
  });
});

describe("participant management after a successful version change", () => {
  it("remounts only versioned inputs and synchronizes the new saved status, action and submit label", () => {
    const render = (updatedAt: string, status: "GOING" | "MAYBE") => {
      boundary.cursor = 0;
      return PartyParticipantForm({
        operationId: "party-a",
        userId: "member-a",
        status,
        updatedAt,
      });
    };
    let tree = render("version-1", "GOING");
    const priorInputs = elements(tree).find((node) => node.key === "version-1");
    expect(priorInputs).toBeDefined();
    const action = elements(tree).find((node) => node.props.name === "action")!;
    (action.props.onChange as (event: unknown) => void)({ target: { value: "REMOVE" } });
    tree = render("version-1", "GOING");
    expect(tree.props.submitLabel).toBe("명단에서 삭제");
    expect(elements(tree).find((node) => node.props.name === "action")?.props.value).toBe("REMOVE");
    expect(elements(tree).find((node) => node.props.name === "status")).toBeUndefined();
    tree = render("version-2", "MAYBE");
    expect(tree.props.submitLabel).toBe("응답 변경 저장");
    expect(elements(tree).find((node) => node.props.name === "action")?.props.value).toBe(
      "SET_STATUS",
    );
    expect(elements(tree).find((node) => node.props.name === "status")?.props.defaultValue).toBe(
      "MAYBE",
    );
    expect(elements(tree).some((node) => node.key === "version-2")).toBe(true);
    expect(tree.key).toBeNull();
  });
});
