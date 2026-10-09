export function calendarMonthDays(year: number, month: number): (number | null)[][] {
  const first = new Date(
    `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-01T00:00:00Z`,
  );
  const offset = (first.getUTCDay() + 6) % 7;
  const end = new Date(first);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  const total = Math.ceil((offset + end.getUTCDate()) / 7) * 7;
  const cells = Array.from({ length: total }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= end.getUTCDate() ? day : null;
  });
  return Array.from({ length: total / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function calendarDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
