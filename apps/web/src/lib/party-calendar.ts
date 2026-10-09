import { z } from "zod";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PARTY_CALENDAR_PAGE_SIZE = 4;

export interface PartyCalendarSearchParams {
  seasonId?: unknown;
  month?: unknown;
  day?: unknown;
  page?: unknown;
}

export interface PartyCalendarFilters {
  seasonId: string | null;
  month: string;
  day: string | null;
  page: number;
  invalidFields: string[];
}

export interface PartyCalendarDay {
  date: string;
  inMonth: boolean;
  isToday: boolean;
}

export interface PartyCalendarMonth {
  month: string;
  previousMonth: string;
  nextMonth: string;
  startsAt: Date;
  endsAt: Date;
  days: PartyCalendarDay[];
}

function stringValue(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first.trim() : null;
}

function monthIsValid(value: string): boolean {
  return /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
}

function dateIsValid(value: string): boolean {
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Date grouping is always Korean time, independent of the browser/server timezone. */
export function partyCalendarDateKey(value: Date | string): string {
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(parsed.getTime())) throw new RangeError("Invalid party date");
  return new Date(parsed.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function partyCalendarDayRange(day: string): { startsAt: Date; endsAt: Date } {
  if (!dateIsValid(day)) throw new RangeError("Invalid party calendar day");
  const startsAt = new Date(new Date(`${day}T00:00:00Z`).getTime() - KST_OFFSET_MS);
  return { startsAt, endsAt: new Date(startsAt.getTime() + DAY_MS) };
}

export function getPartyCalendarMonth(month: string, now: Date = new Date()): PartyCalendarMonth {
  if (!monthIsValid(month)) throw new RangeError("Invalid party calendar month");
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  const leadingDays = (first.getUTCDay() + 6) % 7;
  const monthDays = (next.getTime() - first.getTime()) / DAY_MS;
  const totalDays = Math.ceil((leadingDays + monthDays) / 7) * 7;
  const gridFirst = new Date(first.getTime() - leadingDays * DAY_MS);
  const today = partyCalendarDateKey(now);
  return {
    month,
    previousMonth: previous.toISOString().slice(0, 7),
    nextMonth: next.toISOString().slice(0, 7),
    startsAt: new Date(gridFirst.getTime() - KST_OFFSET_MS),
    endsAt: new Date(gridFirst.getTime() + totalDays * DAY_MS - KST_OFFSET_MS),
    days: Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(gridFirst.getTime() + index * DAY_MS).toISOString().slice(0, 10);
      return { date, inMonth: date.startsWith(month), isToday: date === today };
    }),
  };
}

/** Invalid filters fall back safely and are reported without reflecting supplied text into UI. */
export function parsePartyCalendarFilters(
  input: PartyCalendarSearchParams = {},
  now: Date = new Date(),
): PartyCalendarFilters {
  const invalidFields: string[] = [];
  const suppliedMonth = stringValue(input.month);
  const month =
    suppliedMonth && monthIsValid(suppliedMonth)
      ? suppliedMonth
      : partyCalendarDateKey(now).slice(0, 7);
  if (suppliedMonth && !monthIsValid(suppliedMonth)) invalidFields.push("month");
  const suppliedSeason = stringValue(input.seasonId);
  const seasonId =
    suppliedSeason && z.uuid().safeParse(suppliedSeason).success
      ? suppliedSeason.toLowerCase()
      : null;
  if (suppliedSeason && !seasonId) invalidFields.push("seasonId");
  const suppliedDay = stringValue(input.day);
  const day =
    suppliedDay && dateIsValid(suppliedDay) && suppliedDay.startsWith(month) ? suppliedDay : null;
  if (suppliedDay && !day) invalidFields.push("day");
  const suppliedPage = stringValue(input.page);
  const parsedPage = suppliedPage && /^\d{1,6}$/.test(suppliedPage) ? Number(suppliedPage) : 1;
  const page = parsedPage >= 1 && parsedPage <= 100_000 ? parsedPage : 1;
  if (suppliedPage && (!/^\d{1,6}$/.test(suppliedPage) || parsedPage !== page))
    invalidFields.push("page");
  return { seasonId, month, day, page, invalidFields };
}

/** Unknown end times only conflict at the same start; no guessed duration is introduced. */
export function partyTimesOverlap(
  first: { startsAt: Date | string; endsAt: Date | string | null },
  second: { startsAt: Date | string; endsAt: Date | string | null },
): boolean {
  const firstStart = new Date(first.startsAt).getTime();
  const secondStart = new Date(second.startsAt).getTime();
  if (!Number.isFinite(firstStart) || !Number.isFinite(secondStart)) return false;
  if (first.endsAt === null || second.endsAt === null) return firstStart === secondStart;
  const firstEnd = new Date(first.endsAt).getTime();
  const secondEnd = new Date(second.endsAt).getTime();
  return (
    Number.isFinite(firstEnd) &&
    Number.isFinite(secondEnd) &&
    firstStart < secondEnd &&
    secondStart < firstEnd
  );
}
