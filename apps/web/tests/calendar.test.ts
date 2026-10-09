import { describe, expect, it } from "vitest";
import { calendarDate, calendarMonthDays } from "../src/lib/calendar";

describe("season calendar dates", () => {
  it("lays out Monday-first weeks and month boundaries without overflow days", () => {
    const weeks = calendarMonthDays(2026, 9);
    expect(weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks.flat().filter((day) => day !== null)).toHaveLength(31);
    expect(weeks.at(-1)).toEqual([26, 27, 28, 29, 30, 31, null]);
  });
  it("includes leap February 29 only in leap years", () => {
    expect(
      calendarMonthDays(2028, 1)
        .flat()
        .filter((day) => day !== null),
    ).toHaveLength(29);
    expect(
      calendarMonthDays(2027, 1)
        .flat()
        .filter((day) => day !== null),
    ).toHaveLength(28);
  });
  it("formats selected month and day with preserved leading zeroes", () => {
    expect(calendarDate(2026, 0, 3)).toBe("2026-01-03");
    expect(calendarDate(2026, 11, 31)).toBe("2026-12-31");
  });
});
