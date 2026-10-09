"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Users } from "lucide-react";
import { Badge, Card, PageHeader } from "@uniz/ui";
import type { OperationDirectoryData } from "@/lib/server/operation-directory";
import { getPartyContent } from "@/lib/party-content";
import {
  partyCalendarHref,
  partyCreateHref,
  partyDayLabel,
  shiftPartyMonth,
} from "@/lib/party-navigation";
import "./operation-directory.css";

export type PartyCalendarViewData = OperationDirectoryData;

function time(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function PartyCalendarView({ data }: { data: PartyCalendarViewData }) {
  const router = useRouter();
  const today = new Date(new Date(data.asOf).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const season = data.seasons.find((item) => item.id === data.selectedSeasonId);
  const [year, month] = data.month.split("-");
  const href = (monthValue: string, day?: string | null, page?: number) =>
    partyCalendarHref({ seasonId: data.selectedSeasonId, month: monthValue, day, page });
  return (
    <div className="operation-directory">
      <PageHeader
        eyebrow="HIVE PARTY CALENDAR"
        title="파티 모집"
        description="날짜를 골라 함께할 파티를 확인하고 참가하세요. 모든 일정은 한국 시간(KST)입니다."
        action={
          data.canCreate && data.selectedSeasonId ? (
            <Link
              className="button button-primary"
              href={partyCreateHref(data.selectedSeasonId, data.selectedDay)}
            >
              파티 모집하기
            </Link>
          ) : undefined
        }
      />
      {data.filterNotice && (
        <p className="party-list-notice" role="status">
          {data.filterNotice}
        </p>
      )}
      <Card className="party-calendar">
        <div className="party-calendar-season">
          <label>
            하이브·서버 시즌
            <select
              value={data.selectedSeasonId ?? ""}
              onChange={(event) =>
                router.push(
                  partyCalendarHref({
                    seasonId: event.target.value,
                    month: data.month,
                    day: data.selectedDay,
                  }),
                  { scroll: false },
                )
              }
              disabled={!data.seasons.length}
            >
              {!data.seasons.length && <option value="">등록된 시즌 없음</option>}
              {data.seasons.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.serverAddress}
                </option>
              ))}
            </select>
          </label>
          {season && (
            <p>
              {season.myMembership ? (
                "참여 중인 시즌입니다."
              ) : (
                <>
                  이 시즌 참가 명단에 등록하면 파티에 참여할 수 있습니다.{" "}
                  <Link href={`/season/${season.id}`}>시즌 참여하기</Link>
                </>
              )}
            </p>
          )}
          <small>같은 하이브 이름도 서버·시즌별로 따로 표시됩니다.</small>
        </div>
        <div className="party-calendar-toolbar">
          <div>
            <Link
              href={href(shiftPartyMonth(data.month, -1))}
              prefetch={false}
              scroll={false}
              aria-label="이전 달"
            >
              <ChevronLeft size={19} />
            </Link>
            <h2>
              {year}년 {Number(month)}월
            </h2>
            <Link
              href={href(shiftPartyMonth(data.month, 1))}
              prefetch={false}
              scroll={false}
              aria-label="다음 달"
            >
              <ChevronRight size={19} />
            </Link>
          </div>
          <Link
            href={href(today.slice(0, 7), today)}
            prefetch={false}
            scroll={false}
            className="button button-quiet"
          >
            오늘
          </Link>
        </div>
        <div
          className="party-calendar-grid"
          role="group"
          aria-label={`${year}년 ${Number(month)}월 모집 달력`}
        >
          {["월", "화", "수", "목", "금", "토", "일"].map((label, index) => (
            <span className={`party-weekday ${index >= 5 ? "is-weekend" : ""}`} key={label}>
              {label}
            </span>
          ))}
          {data.calendarDays.map((day, index) => (
            <Link
              key={day.date}
              href={href(day.date.slice(0, 7), day.date)}
              prefetch={false}
              scroll={false}
              className={`party-calendar-day ${!day.inMonth ? "is-other-month" : ""} ${index % 7 >= 5 ? "is-weekend" : ""} ${day.isToday ? "is-today" : ""} ${day.date === data.selectedDay ? "is-selected" : ""}`}
              aria-current={day.date === data.selectedDay ? "date" : undefined}
              aria-label={`${partyDayLabel(day.date)}${day.isToday ? " 오늘" : ""}, 모집 ${day.operationCount}건`}
            >
              <span>
                {Number(day.date.slice(-2))}
                {day.isToday && <small>오늘</small>}
              </span>
              {day.operationCount > 0 && (
                <strong>
                  <span className="party-day-count">{day.operationCount}</span>
                  <span className="party-day-word">개 모집</span>
                </strong>
              )}
            </Link>
          ))}
        </div>
        <details className="party-mobile-dates">
          <summary>날짜 목록으로 보기</summary>
          <div>
            {data.calendarDays
              .filter((day) => day.inMonth)
              .map((day) => (
                <Link
                  key={day.date}
                  href={href(data.month, day.date)}
                  scroll={false}
                  prefetch={false}
                  aria-current={day.date === data.selectedDay ? "date" : undefined}
                >
                  <span>
                    {partyDayLabel(day.date)}
                    {day.isToday && " · 오늘"}
                  </span>
                  <strong>{day.operationCount}개</strong>
                </Link>
              ))}
          </div>
        </details>
        {data.selectedDay && (
          <Link href={href(data.month)} prefetch={false} scroll={false} className="party-month-all">
            이번 달 전체 모집 보기
          </Link>
        )}
      </Card>
      <section aria-labelledby="party-list-title">
        <div className="directory-section-heading">
          <h2 id="party-list-title">
            {data.selectedDay ? `${partyDayLabel(data.selectedDay)} 모집` : "이번 달 모집"}
          </h2>
          <span>{data.pagination.totalCount}개</span>
        </div>
        {data.overflowNotice && <p className="party-list-notice">{data.overflowNotice}</p>}
        {data.operations.length ? (
          <div className="directory-operation-grid">
            {data.operations.map((party) => (
              <Card key={party.id} className="directory-operation-card">
                <div className="directory-operation-top">
                  <Badge tone={party.status === "SCHEDULED" ? "primary" : "default"}>
                    {party.status === "SCHEDULED"
                      ? new Date(party.startsAt) <= new Date(data.asOf)
                        ? "신청 마감"
                        : party.goingCount >= party.capacity
                          ? "정원 마감"
                          : "모집 중"
                      : party.status === "COMPLETED"
                        ? "완료"
                        : "취소"}
                  </Badge>
                  <span>
                    {getPartyContent(party.contentKey)?.label ??
                      getPartyContent(party.type.toLowerCase().replaceAll("_", "-"))?.label ??
                      "기존 일정"}
                  </span>
                  {party.myRsvp === "GOING" && <Badge>내가 참가</Badge>}
                </div>
                <h3>
                  <Link href={`/ops/${party.id}`}>{party.title}</Link>
                </h3>
                <p className="directory-operation-season">
                  {party.seasonName ?? "기존 하이브 공통 일정"}
                </p>
                <div className="directory-operation-time">
                  <Clock3 size={15} aria-hidden="true" />
                  <time dateTime={party.startsAt}>{time(party.startsAt)} KST</time>
                </div>
                {party.meetingPoint && (
                  <p className="party-meeting-point">집결: {party.meetingPoint}</p>
                )}
                <p className="directory-operation-description">
                  {party.description || "추가 안내가 없습니다."}
                </p>
                {party.timeConflictNotice && (
                  <p className="party-conflict-notice">{party.timeConflictNotice}</p>
                )}
                <div className="directory-operation-bottom">
                  <span>
                    <Users size={15} aria-hidden="true" />
                    <strong>{party.goingCount}</strong> / {party.capacity}명 · 미정{" "}
                    {party.maybeCount}명
                  </span>
                  <Link href={`/ops/${party.id}`}>
                    모집 상세 <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="directory-empty">
            <CalendarDays size={27} aria-hidden="true" />
            <h3>
              {data.selectedDay
                ? "이 날짜에 등록된 모집이 없습니다."
                : "이 달에 등록된 모집이 없습니다."}
            </h3>
            <p>다른 날짜를 선택하거나 함께할 파티를 모집해보세요.</p>
            {data.canCreate && data.selectedSeasonId && (
              <Link
                href={partyCreateHref(data.selectedSeasonId, data.selectedDay)}
                className="button button-primary"
              >
                파티 모집하기
              </Link>
            )}
            {!data.seasons.length && (
              <Link href="/season" className="button button-quiet">
                시즌 확인하기
              </Link>
            )}
          </Card>
        )}
        {(data.pagination.page > 1 || data.pagination.hasNextPage) && (
          <nav className="party-pagination" aria-label="모집 목록 페이지">
            {data.pagination.page > 1 && (
              <Link
                href={href(data.month, data.selectedDay, data.pagination.page - 1)}
                prefetch={false}
                scroll={false}
              >
                이전 목록
              </Link>
            )}
            <span>{data.pagination.page}페이지</span>
            {data.pagination.hasNextPage && (
              <Link
                href={href(data.month, data.selectedDay, data.pagination.page + 1)}
                prefetch={false}
                scroll={false}
              >
                다음 목록
              </Link>
            )}
          </nav>
        )}
      </section>
      {data.canManage && (
        <Link href="/admin/operations" className="directory-back">
          운영진 모집 관리 <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}
