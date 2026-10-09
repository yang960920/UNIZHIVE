"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Check } from "lucide-react";
import { Badge, Card, PageHeader } from "@uniz/ui";
import {
  RSVP_STATUSES,
  type OperationType,
  type PartyContribution,
  type RSVPStatus,
} from "@uniz/domain";
import type { OperationDirectoryDetail } from "@/lib/server/operation-directory";
import { mutateOperationalData } from "@/lib/operational-actions";
import "./operation-directory.css";
import { PartyCalendarView } from "./party-calendar-view";
import { PartyParticipantForm } from "./party-form";
import { getPartyContent } from "@/lib/party-content";
import { partyCalendarHref } from "@/lib/party-navigation";
import type { OperationDirectoryData } from "@/lib/server/operation-directory";
import {
  PartyAttendeeContribution,
  PartyContributionEditor,
  PartyContributionTags,
  PartySynergyGuide,
  PartySynergySummary,
} from "./party-synergy";

const typeLabels: Record<OperationType, string> = {
  PRIME_WAR: "프라임 워",
  RAID: "레이드",
  FARM: "파밍",
  EXPLORATION: "탐험",
  OTHER: "기타",
};
const statusLabels = { SCHEDULED: "예정", COMPLETED: "완료", CANCELLED: "취소" } as const;
const rsvpLabels: Record<RSVPStatus, string> = {
  GOING: "참가",
  MAYBE: "미정",
  UNAVAILABLE: "참가 취소",
};

function date(value: string): string {
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value)) + " KST"
  );
}

export function OperationDirectory({ data }: { data: OperationDirectoryData }) {
  return <PartyCalendarView data={data} />;
}

export function OperationBriefing({ operation }: { operation: OperationDirectoryDetail }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const day = new Date(new Date(operation.startsAt).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  function respond(status: RSVPStatus, contribution?: PartyContribution) {
    setFeedback("");
    startTransition(async () => {
      try {
        const result = await mutateOperationalData({
          action: "RSVP",
          operationId: operation.id,
          status,
          expectedUpdatedAt: operation.updatedAt,
          ...(contribution ? { contribution } : {}),
        });
        setFailed(!result.ok);
        setFeedback(
          result.ok
            ? contribution
              ? "내 세팅과 협동 효과를 저장했습니다."
              : `참가 응답을 '${rsvpLabels[status]}' 상태로 저장했습니다.`
            : result.message,
        );
      } catch {
        setFailed(true);
        setFeedback("연결을 확인한 후 다시 시도해 주세요.");
      }
    });
  }
  return (
    <div className="operation-directory">
      <Link
        href={partyCalendarHref({ seasonId: operation.seasonId, month: day.slice(0, 7), day })}
        className="directory-back"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        모집 달력 보기
      </Link>
      <PageHeader
        eyebrow="PARTY DETAILS"
        title={operation.title}
        description={operation.seasonName ?? "시즌 공통 일정"}
        action={
          operation.canManage ? (
            <Link
              className="button button-quiet"
              href={
                operation.seasonId
                  ? `/ops/${operation.id}/edit`
                  : `/admin/operations/${operation.id}`
              }
            >
              모집 수정·취소
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <div className="directory-detail-grid">
        <Card className="directory-briefing">
          <div className="directory-operation-top">
            <Badge tone={operation.status === "SCHEDULED" ? "primary" : "default"}>
              {operation.status === "SCHEDULED" &&
              new Date(operation.startsAt) <= new Date(operation.asOf)
                ? "신청 마감"
                : statusLabels[operation.status]}
            </Badge>
            <span>
              {getPartyContent(operation.contentKey)?.label ?? typeLabels[operation.type]}
            </span>
          </div>
          <dl className="directory-operation-facts">
            <div>
              <dt>시작</dt>
              <dd>
                <time dateTime={operation.startsAt}>{date(operation.startsAt)}</time>
              </dd>
            </div>
            <div>
              <dt>종료</dt>
              <dd>
                {operation.endsAt ? (
                  <time dateTime={operation.endsAt}>{date(operation.endsAt)}</time>
                ) : (
                  "미정"
                )}
              </dd>
            </div>
            <div>
              <dt>참가 확정</dt>
              <dd>
                {operation.goingCount} / {operation.capacity}명
              </dd>
            </div>
            {operation.meetingPoint && (
              <div>
                <dt>집결 장소</dt>
                <dd>{operation.meetingPoint}</dd>
              </div>
            )}
          </dl>
          <h2>준비물·진행 안내</h2>
          <p className="directory-full-description">
            {operation.description || "상세 안내가 아직 등록되지 않았습니다."}
          </p>
          <div className="directory-requested-contributions">
            <span>함께 준비할 효과</span>
            <PartyContributionTags
              keys={operation.requestedContributions ?? []}
              emptyLabel="자유 모집 · 별도 협동 효과 요청 없음"
            />
          </div>
        </Card>
        <Card className="directory-rsvp">
          <h2>내 참가 응답</h2>
          <p>
            {operation.myRsvp
              ? `현재 응답: ${rsvpLabels[operation.myRsvp]}`
              : "아직 참가 응답을 보내지 않았습니다."}
          </p>
          {operation.timeConflictNotice && (
            <p className="party-conflict-notice">{operation.timeConflictNotice}</p>
          )}
          {!operation.myMembership && operation.seasonId && (
            <p>
              <Link href={`/season/${operation.seasonId}`} className="directory-back">
                이 시즌 참여하기 <ArrowRight size={14} />
              </Link>
            </p>
          )}
          <div className="directory-rsvp-buttons" aria-label="파티 참가 응답">
            {RSVP_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={operation.myRsvp === status}
                className={operation.myRsvp === status ? "selected" : ""}
                disabled={
                  pending ||
                  !operation.mayRespond ||
                  (status === "GOING" && !operation.mayGo) ||
                  (status === "MAYBE" && !operation.mayMaybe) ||
                  (status === "UNAVAILABLE" && !operation.canCancelParticipation)
                }
                onClick={() => respond(status)}
              >
                {operation.myRsvp === status && <Check size={14} aria-hidden="true" />}
                {rsvpLabels[status]}
              </button>
            ))}
          </div>
          <p className="directory-response-note">{operation.responseNotice}</p>
          <p
            className={`directory-feedback ${failed ? "is-error" : ""}`}
            role={failed ? "alert" : "status"}
          >
            {pending ? "저장 중입니다…" : feedback}
          </p>
          <PartyContributionEditor
            key={operation.updatedAt}
            initial={operation.myContribution}
            pending={pending}
            disabled={
              !operation.mayRespond ||
              !(
                (operation.myRsvp === "GOING" && operation.mayGo) ||
                (operation.myRsvp === "MAYBE" && operation.mayMaybe)
              )
            }
            onSave={(contribution) => {
              if (operation.myRsvp === "GOING" || operation.myRsvp === "MAYBE") {
                respond(operation.myRsvp, contribution);
              }
            }}
          />
        </Card>
      </div>
      <div className="directory-detail-grid">
        <Card className="directory-roster">
          <div className="directory-section-heading">
            <h2>참가 응답</h2>
            <span>
              참가 {operation.goingCount} · 미정 {operation.maybeCount} · 불참{" "}
              {operation.unavailableCount}
            </span>
          </div>
          {operation.attendees.length > 0 ? (
            <ul>
              {operation.attendees.map((attendee) => (
                <li key={attendee.id} className="directory-attendee">
                  <div>
                    {attendee.handle ? (
                      <Link href={`/members/${attendee.handle}`}>{attendee.displayName}</Link>
                    ) : (
                      <span>{attendee.displayName}</span>
                    )}
                    {attendee.contribution && (
                      <PartyAttendeeContribution contribution={attendee.contribution} />
                    )}
                  </div>
                  <Badge tone={attendee.status === "GOING" ? "primary" : "default"}>
                    {rsvpLabels[attendee.status]}
                  </Badge>
                  {operation.canManageParticipants &&
                    operation.status === "SCHEDULED" &&
                    new Date(operation.startsAt) > new Date(operation.asOf) && (
                      <details className="party-participant-editor">
                        <summary>{attendee.displayName} 응답 관리</summary>
                        <PartyParticipantForm
                          operationId={operation.id}
                          userId={attendee.userId}
                          status={attendee.status}
                          updatedAt={operation.updatedAt}
                        />
                      </details>
                    )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="directory-empty-note">공개할 승인 멤버의 참가 응답이 없습니다.</p>
          )}
          <p className="directory-response-note">
            참가 인원에는 보존된 이전 응답도 포함됩니다. 명단에는 현재 승인된 멤버만 표시됩니다.
          </p>
        </Card>
        <Card className="directory-synergy">
          <PartySynergySummary
            attendees={operation.attendees}
            requestedContributions={operation.requestedContributions ?? []}
          />
        </Card>
      </div>
      <PartySynergyGuide />
    </div>
  );
}

export function OperationDemoNotice() {
  return (
    <>
      <PageHeader
        eyebrow="HIVE PARTY CALENDAR"
        title="파티 모집"
        description="모집 달력과 참가 명단은 승인된 하이브 멤버에게 공개됩니다."
        action={<Badge>공개 미리보기</Badge>}
      />
      <Card className="directory-empty">
        <CalendarDays size={26} aria-hidden="true" />
        <h2>하이브 멤버로 함께해 주세요.</h2>
        <p>
          Discord로 로그인하고 멤버 승인을 받으면 파티 모집 상세와 참가 응답을 사용할 수 있습니다.
        </p>
        <Link className="button button-primary" href="/login?callbackUrl=/ops">
          Discord 로그인
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </Card>
    </>
  );
}
