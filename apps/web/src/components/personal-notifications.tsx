"use client";

import Link from "next/link";
import { ArrowRight, Settings } from "lucide-react";
import { Badge } from "@uniz/ui";
import { mockAnnouncements } from "@/lib/mocks/announcements";
import { formatKstDate } from "@/lib/mocks/current-season";
import type {
  PersonalNotificationKind,
  PersonalNotificationResult,
} from "@/lib/personal-notification-types";
import "./personal-notifications.css";

const labels: Record<PersonalNotificationKind, string> = {
  ANNOUNCEMENT: "공지",
  PARTY_CHANGE: "파티 변경",
  PARTY_REMINDER: "파티 시작",
  VOTE_DEADLINE: "투표 마감",
  COMMENT: "댓글",
};

export function PersonalNotifications({
  result,
  onRetry,
  onNavigate,
}: {
  result: PersonalNotificationResult | null;
  onRetry: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="personal-notifications">
      {!result ? (
        <p role="status">사이트 알림을 불러오는 중입니다…</p>
      ) : result.mode === "LIVE" ? (
        <>
          {result.data.items.length ? (
            <ul className="personal-notification-list">
              {result.data.items.map((item) => (
                <li key={item.id}>
                  <div className="personal-notification-meta">
                    <Badge
                      tone={
                        item.kind === "PARTY_REMINDER" || item.kind === "VOTE_DEADLINE"
                          ? "primary"
                          : "default"
                      }
                    >
                      {labels[item.kind]}
                    </Badge>
                    {item.pinned && <Badge>고정</Badge>}
                    <time dateTime={item.occurredAt}>
                      {formatKstDate(new Date(item.occurredAt))}
                    </time>
                  </div>
                  <Link href={item.href} prefetch={false} onClick={onNavigate}>
                    <strong>{item.title}</strong>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="personal-notification-empty">
              {result.data.enabledKinds.length
                ? "설정한 조건에 맞는 최근 알림이 없습니다."
                : "사이트 알림을 모두 꺼두었습니다. 알림 설정에서 다시 켤 수 있습니다."}
            </p>
          )}
          <small>
            조회 기준 {formatKstDate(new Date(result.data.asOf), true)} · 최근 변경·댓글은 7일
            이내입니다.
          </small>
        </>
      ) : result.mode === "DEMO" ? (
        <>
          <p className="personal-notification-empty">
            <Badge>데모</Badge> 아래는 실제 개인 알림이 아닌 예시 공지입니다.
          </p>
          {result.enabledKinds && !result.enabledKinds.includes("ANNOUNCEMENT") && (
            <p className="personal-notification-empty">예시 공지 알림을 꺼두었습니다.</p>
          )}
          <ul className="personal-notification-list">
            {mockAnnouncements
              .slice(0, 2)
              .filter(() => !result.enabledKinds || result.enabledKinds.includes("ANNOUNCEMENT"))
              .map((item) => (
                <li key={item.id}>
                  <div className="personal-notification-meta">
                    <Badge>예시 공지</Badge>
                    <time dateTime={item.publishedAt.toISOString()}>
                      {formatKstDate(item.publishedAt)}
                    </time>
                  </div>
                  <Link
                    href={item.tag === "SEASON" ? "/season" : "/#next-operation"}
                    prefetch={false}
                    onClick={onNavigate}
                  >
                    <strong>{item.title}</strong>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
          </ul>
        </>
      ) : (
        <div>
          <p role="status">
            {result.mode === "ERROR"
              ? "로그인은 유지됩니다. 사이트 알림을 잠시 불러올 수 없습니다."
              : result.mode === "PENDING"
                ? "멤버 승인 후 개인 사이트 알림을 확인할 수 있습니다."
                : result.mode === "LEFT"
                  ? "UNIZ Discord 서버의 멤버 상태를 확인해 주세요."
                  : "Discord로 다시 로그인해 주세요."}
          </p>
          {result.mode === "ERROR" && (
            <button type="button" className="button button-quiet" onClick={onRetry}>
              다시 확인
            </button>
          )}
        </div>
      )}
      <div className="personal-notification-footer">
        <p>알림 창을 열 때 현재 정보를 확인합니다.</p>
        <Link
          className="button button-quiet"
          href="/settings#notifications"
          prefetch={false}
          onClick={onNavigate}
        >
          <Settings size={14} aria-hidden="true" />
          알림 설정
        </Link>
      </div>
    </div>
  );
}
