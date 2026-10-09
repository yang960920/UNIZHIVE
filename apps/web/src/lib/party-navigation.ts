export function partyCalendarHref({
  seasonId,
  month,
  day,
  page,
}: {
  seasonId?: string | null;
  month: string;
  day?: string | null;
  page?: number;
}): string {
  const query = new URLSearchParams();
  if (seasonId) query.set("seasonId", seasonId);
  query.set("month", month);
  if (day) query.set("day", day);
  if (page && page > 1) query.set("page", String(page));
  return `/ops?${query}`;
}

export function shiftPartyMonth(month: string, step: number): string {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + step);
  return value.toISOString().slice(0, 7);
}

export function partyDayLabel(day: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${day}T12:00:00+09:00`));
}

export function partyCreateHref(seasonId: string, day?: string | null): string {
  const query = new URLSearchParams({ seasonId });
  if (day) query.set("day", day);
  return `/ops/new?${query}`;
}

export function partyDefaultStart(day?: string): string | undefined {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const date = new Date(`${day}T19:00:00+09:00`);
  if (!Number.isFinite(date.getTime())) return undefined;
  const normalized = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return normalized === day ? date.toISOString() : undefined;
}
