import { describe, expect, it } from "vitest";
import {
  getPartyCalendarMonth,
  parsePartyCalendarFilters,
  partyCalendarDateKey,
  partyCalendarDayRange,
  partyTimesOverlap,
} from "../src/lib/party-calendar";

describe("Korean-time party calendar", () => {
  it("groups both sides of Korean midnight independently of machine timezone", () => {
    expect(partyCalendarDateKey("2026-10-07T14:59:59Z")).toBe("2026-10-07");
    expect(partyCalendarDateKey("2026-10-07T15:00:00Z")).toBe("2026-10-08");
    expect(partyCalendarDayRange("2026-10-08")).toEqual({
      startsAt: new Date("2026-10-07T15:00:00Z"),
      endsAt: new Date("2026-10-08T15:00:00Z"),
    });
  });
  it("creates a complete Monday grid and handles leap-year/year boundaries", () => {
    const october = getPartyCalendarMonth("2026-10", new Date("2026-09-30T15:00:00Z"));
    expect(october.days[0].date).toBe("2026-09-28");
    expect(october.days.at(-1)?.date).toBe("2026-11-01");
    expect(october.days).toHaveLength(35);
    expect(october.days.filter((day) => day.inMonth)).toHaveLength(31);
    expect(october.days.find((day) => day.isToday)?.date).toBe("2026-10-01");
    expect(october.startsAt.toISOString()).toBe("2026-09-27T15:00:00.000Z");
    expect(october.endsAt.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(getPartyCalendarMonth("2028-02").days.filter((day) => day.inMonth)).toHaveLength(29);
    expect(getPartyCalendarMonth("2026-01").previousMonth).toBe("2025-12");
    expect(getPartyCalendarMonth("2026-12").nextMonth).toBe("2027-01");
  });
  it("normalizes untrusted query values without echoing them or accepting impossible dates", () => {
    const now = new Date("2026-09-30T15:30:00Z");
    expect(parsePartyCalendarFilters({}, now).month).toBe("2026-10");
    const parsed = parsePartyCalendarFilters(
      { seasonId: "bad", month: "2026-13", day: "2026-02-30", page: "-3" },
      now,
    );
    expect(parsed).toMatchObject({ seasonId: null, month: "2026-10", day: null, page: 1 });
    expect(parsed.invalidFields).toEqual(["month", "seasonId", "day", "page"]);
    const valid = parsePartyCalendarFilters(
      {
        month: ["2028-02"],
        day: "2028-02-29",
        page: "2",
        seasonId: "360fd9fd-7447-4ba9-9d5b-cba957fd3307",
      },
      now,
    );
    expect(valid).toMatchObject({
      month: "2028-02",
      day: "2028-02-29",
      page: 2,
      invalidFields: [],
    });
    expect(parsePartyCalendarFilters({ month: "2026-10", day: "2026-11-01" }, now).day).toBeNull();
  });
  it("uses half-open known intervals and never invents a missing end time", () => {
    const first = { startsAt: "2026-10-08T01:00:00Z", endsAt: "2026-10-08T02:00:00Z" };
    expect(
      partyTimesOverlap(first, {
        startsAt: "2026-10-08T01:30:00Z",
        endsAt: "2026-10-08T03:00:00Z",
      }),
    ).toBe(true);
    expect(
      partyTimesOverlap(first, {
        startsAt: "2026-10-08T02:00:00Z",
        endsAt: "2026-10-08T03:00:00Z",
      }),
    ).toBe(false);
    expect(partyTimesOverlap(first, { startsAt: "2026-10-08T01:00:00Z", endsAt: null })).toBe(true);
    expect(partyTimesOverlap(first, { startsAt: "2026-10-08T01:30:00Z", endsAt: null })).toBe(
      false,
    );
  });
});
