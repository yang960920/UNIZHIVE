"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toKstInput } from "@/lib/admin-format";
import { calendarDate, calendarMonthDays } from "@/lib/calendar";

export function CalendarField({
  name,
  label,
  initial,
  required = false,
}: {
  name: string;
  label: string;
  initial?: string | null;
  required?: boolean;
}) {
  const initialLocal = toKstInput(initial);
  const [date, setDate] = useState(initialLocal.slice(0, 10));
  const [time, setTime] = useState(initialLocal.slice(11) || "00:00");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    (initialLocal || toKstInput(new Date().toISOString())).slice(0, 7),
  );
  const field = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;

  useEffect(() => {
    const form = field.current?.closest("form");
    function reset() {
      setDate(initialLocal.slice(0, 10));
      setTime(initialLocal.slice(11) || "00:00");
      setOpen(false);
    }
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initialLocal]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !field.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function shiftMonth(step: number) {
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + step);
    if (next.getUTCFullYear() >= 1 && next.getUTCFullYear() <= 9999)
      setMonth(next.toISOString().slice(0, 7));
  }
  function selectDate(value: string) {
    setDate(value);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div
      className="cms-calendar-field"
      ref={field}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`} className="cms-field-label">
        {label} (KST){required && <span aria-hidden="true"> *</span>}
      </span>
      <div className="cms-calendar-controls">
        <button
          type="button"
          className="cms-date-trigger"
          ref={trigger}
          aria-label={`${label} 날짜 달력 열기`}
          aria-expanded={open}
          aria-controls={`${id}-calendar`}
          onClick={() => {
            if (date) setMonth(date.slice(0, 7));
            setOpen(!open);
          }}
        >
          <CalendarDays size={17} aria-hidden="true" />
          {date ? date.replaceAll("-", ".") : "날짜 선택"}
        </button>
        <input
          type="time"
          step={60}
          aria-label={`${label} 시간`}
          value={time}
          onInput={(event) => setTime(event.currentTarget.value)}
          onChange={(event) => setTime(event.target.value)}
          required={required || Boolean(date)}
        />
      </div>
      <input type="hidden" name={name} value={date && time ? `${date}T${time}` : ""} />
      {open && (
        <div
          id={`${id}-calendar`}
          role="dialog"
          aria-label={`${label} 날짜 선택`}
          className="cms-calendar-popup"
        >
          <div className="cms-calendar-heading">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">
              <ChevronLeft size={17} />
            </button>
            <strong>
              {year}년 {monthNumber}월
            </strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달">
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              aria-label="달력 닫기"
            >
              <X size={16} />
            </button>
          </div>
          <table className="cms-calendar-days">
            <caption className="sr-only">
              {year}년 {monthNumber}월 날짜 선택
            </caption>
            <thead>
              <tr>
                {["월", "화", "수", "목", "금", "토", "일"].map((day) => (
                  <th key={day} scope="col">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendarMonthDays(year, monthIndex).map((week, index) => (
                <tr key={index}>
                  {week.map((day, column) => (
                    <td key={column}>
                      {day !== null && (
                        <button
                          type="button"
                          aria-label={`${year}년 ${monthNumber}월 ${day}일`}
                          aria-pressed={date === calendarDate(year, monthIndex, day)}
                          onClick={() => selectDate(calendarDate(year, monthIndex, day))}
                        >
                          {day}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cms-calendar-footer">
            <button
              type="button"
              onClick={() => selectDate(toKstInput(new Date().toISOString()).slice(0, 10))}
            >
              오늘
            </button>
            {!required && (
              <button
                type="button"
                onClick={() => {
                  setDate("");
                  setOpen(false);
                }}
              >
                날짜 지우기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
