"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, CheckCheck, Check, ChevronDown, Users } from "lucide-react";
import { Avatar, Badge } from "@uniz/ui";
import { MIGRATION_STATUSES, type MigrationStatus } from "@uniz/domain";
import type { DashboardData } from "@/lib/mocks/dashboard";

export const migrationLabels: Record<MigrationStatus, string> = {
  UNDECIDED: "미정",
  JOINING: "참가 예정",
  PRE_REGISTERED: "사전 등록",
  READY: "준비 완료",
  MIGRATED: "이동 완료",
};
const statusColors: Record<MigrationStatus, string> = {
  UNDECIDED: "#4b6459",
  JOINING: "var(--warning)",
  PRE_REGISTERED: "var(--secondary)",
  READY: "var(--primary)",
  MIGRATED: "var(--ivory)",
};

export function MigrationBoard({
  migration,
  canEdit,
  onStatusChange,
  storageAvailable,
}: {
  migration: DashboardData["migration"];
  canEdit: boolean;
  onStatusChange: (status: MigrationStatus) => boolean;
  storageAvailable: boolean;
}) {
  const [filter, setFilter] = useState<MigrationStatus | "ALL">("ALL");
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const visibleMembers = migration.members.filter(
    (entry) => filter === "ALL" || entry.status === filter,
  );
  function handleStatus(value: MigrationStatus) {
    if (onStatusChange(value))
      setMessage(`내 이동 상태를 ${migrationLabels[value]}로 변경했습니다.`);
  }
  return (
    <section className="panel migration-board" aria-labelledby="migration-title" id="migration">
      <div className="season-section-header">
        <div>
          <span className="eyebrow">GO TOGETHER</span>
          <h2 id="migration-title">시즌 이동 보드</h2>
        </div>
        <Badge>MOCK</Badge>
      </div>
      <div className="migration-readiness">
        <div>
          <strong className="mono">
            {migration.readyCount}
            <span> / {migration.total}</span>
          </strong>
          <p>Members Ready</p>
        </div>
        <span className="migration-percent mono">
          {migration.percent}%<CheckCheck size={19} aria-hidden="true" />
        </span>
      </div>
      <div
        className="migration-stacked-bar"
        role="img"
        aria-label={`준비율 ${migration.percent}%. ${MIGRATION_STATUSES.map((status) => `${migrationLabels[status]} ${migration.counts[status]}명`).join(", ")}`}
      >
        {MIGRATION_STATUSES.map(
          (status) =>
            migration.counts[status] > 0 && (
              <span
                key={status}
                style={{ flex: migration.counts[status], background: statusColors[status] }}
              />
            ),
        )}
      </div>
      <div className="migration-buckets" aria-label="이동 상태별 멤버 필터">
        {MIGRATION_STATUSES.map((status) => {
          const members = migration.members.filter((entry) => entry.status === status);
          return (
            <button
              key={status}
              type="button"
              className={filter === status ? "is-selected" : ""}
              aria-pressed={filter === status}
              onClick={() => {
                setFilter(filter === status ? "ALL" : status);
                setExpanded(false);
              }}
              style={{ "--status-color": statusColors[status] } as CSSProperties}
            >
              <span className="migration-bucket-count mono">
                <i aria-hidden="true" />
                {migration.counts[status]}
              </span>
              <span>{migrationLabels[status]}</span>
              <span className="migration-bucket-avatars" aria-hidden="true">
                {members.slice(0, 3).map(({ member }) => (
                  <Avatar key={member.id} name={member.displayName} size="sm" />
                ))}
                {members.length > 3 && <b className="mono">+{members.length - 3}</b>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="migration-member-roster">
        <div className="migration-roster-heading">
          <span>
            <Users size={13} aria-hidden="true" />
            {filter === "ALL" ? "전체 멤버" : migrationLabels[filter]} · {visibleMembers.length}명
          </span>
          {filter !== "ALL" && (
            <button type="button" onClick={() => setFilter("ALL")}>
              전체 보기
            </button>
          )}
        </div>
        <div className="migration-member-list">
          {visibleMembers.slice(0, expanded ? undefined : 8).map(({ member, status }) => (
            <span key={member.id} title={`${member.displayName} · ${migrationLabels[status]}`}>
              <i aria-hidden="true" style={{ background: statusColors[status] }} />
              {member.displayName}
            </span>
          ))}
        </div>
        {visibleMembers.length > 8 && (
          <button
            type="button"
            className="migration-expand"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "접기" : `나머지 ${visibleMembers.length - 8}명 보기`}
            <ChevronDown size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="my-migration-state">
        {canEdit && migration.myStatus ? (
          <>
            <label htmlFor="my-migration-status">
              <Check size={15} aria-hidden="true" />내 이동 상태
            </label>
            <select
              id="my-migration-status"
              value={migration.myStatus}
              onChange={(event) => handleStatus(event.target.value as MigrationStatus)}
            >
              {MIGRATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {migrationLabels[status]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p>함께 이동할 준비가 되셨나요?</p>
            <Link href="/login">
              멤버 로그인
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
      <p className="season-card-note">
        준비 완료와 이동 완료를 합산합니다. 상태 변경은 이 브라우저의 데모에 저장됩니다.
        {!storageAvailable && " 현재 브라우저 저장이 제한되어 새로고침 시 초기화될 수 있습니다."}
      </p>
      <p className="season-live-message" role="status">
        {message}
      </p>
    </section>
  );
}
