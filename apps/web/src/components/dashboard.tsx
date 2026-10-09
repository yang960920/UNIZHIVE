"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Crosshair,
  FlaskConical,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";
import {
  canRsvpOperation,
  getSeasonServerTypeLabel,
  getTrancePhenomenonLabel,
  type HiveRole,
  type RSVPStatus,
  type MigrationStatus,
} from "@uniz/domain";
import { Avatar, Badge, Card, Modal, PageHeader, StatusChip } from "@uniz/ui";
import { useDashboardData } from "@/lib/data";
import { formatKstDate } from "@/lib/mocks/current-season";
import type { DashboardData } from "@/lib/mocks/dashboard";
import { Logo } from "./logo";
import { SteamOverview } from "./steam-overview";
import { DashboardGuide } from "./dashboard-guide";
import type { SteamOverviewData } from "@/lib/data/steam-overview-types";
import "./dashboard.css";

const migrationLabels: Record<MigrationStatus, string> = {
  UNDECIDED: "미정",
  JOINING: "참가 예정",
  PRE_REGISTERED: "사전 등록",
  READY: "준비 완료",
  MIGRATED: "이동 완료",
};
const migrationColors: Record<MigrationStatus, string> = {
  UNDECIDED: "#668C7B",
  JOINING: "#C9A24A",
  PRE_REGISTERED: "#27BFA3",
  READY: "#42F5C5",
  MIGRATED: "#A5B3AD",
};
const rsvpOptions: { value: RSVPStatus; label: string }[] = [
  { value: "GOING", label: "Going" },
  { value: "MAYBE", label: "Maybe" },
  { value: "UNAVAILABLE", label: "Unavailable" },
];

function PanelHeading({
  title,
  href,
  label = "모두 보기",
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="panel-heading">
      <h2 className="panel-title">{title}</h2>
      {href && (
        <Link href={href}>
          {label}
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

function SeasonStrip({ season }: { season: DashboardData["currentSeason"] }) {
  const currentIndex = season.phases.findIndex((phase) => phase.id === season.currentPhase.id);
  const permanent = season.serverType === "PERMANENT";
  return (
    <section className="season-strip" aria-label="현재 시즌 요약">
      <Logo variant="compact" size="md" />
      <div className="scenario-name">
        <span className="eyebrow">CURRENT SCENARIO · S{season.seasonNumber}</span>
        <strong>{season.scenario.name.toUpperCase()}</strong>
        <small>
          {getSeasonServerTypeLabel(season.serverType)} ·{" "}
          {getTrancePhenomenonLabel(season.trancePhenomenon)}
        </small>
      </div>
      <div className="strip-data">
        <span className="eyebrow">SERVER</span>
        <strong className="mono">{season.server.name}</strong>
      </div>
      {permanent ? (
        <div className="strip-phase">
          <strong>영구 운영 · 휴식기</strong>
        </div>
      ) : (
        <div className="strip-phase">
          <div className="eyebrow">
            PHASE {currentIndex + 1} <span>/ {season.phases.length}</span>
          </div>
          <div
            className="phase-bars"
            aria-label={`현재 ${season.phases.length}개 단계 중 ${currentIndex + 1}번째 단계`}
          >
            {season.phases.map((phase, i) => (
              <span
                key={phase.id}
                className={i === currentIndex ? "current" : i < currentIndex ? "complete" : ""}
              />
            ))}
          </div>
          <small>{season.currentPhase.name}</small>
        </div>
      )}
      {!permanent && (
        <div className="settlement-chip">
          <span>정산까지</span>
          <strong className="mono">D-{season.settlementDaysRemaining}</strong>
        </div>
      )}
      <StatusChip status="HIVE ACTIVE" tone="primary" />
    </section>
  );
}

export function Dashboard({
  userId,
  role = "GUEST",
  name,
  steamOverview,
}: {
  userId?: string;
  role?: HiveRole;
  name?: string;
  steamOverview?: SteamOverviewData;
}) {
  const { data, setRsvp, hydrated, storageAvailable, canInteract } = useDashboardData(userId, role);
  const [announcementId, setAnnouncementId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const op = data.nextOperation;
  const announcement = data.announcements.find((item) => item.id === announcementId);
  const author = (id: string) =>
    data.members.find((member) => member.userId === id)?.displayName ?? "UNIZ";
  const mayRsvp = hydrated && canInteract && canRsvpOperation(role);
  const migrationCard = (
    <Card className="migration-card">
      <PanelHeading title="MIGRATION READINESS" href="/season" label="이동 보드" />
      <div className="migration-overview">
        <div className="readiness-ring">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={`이동 준비율 ${Math.round(data.migration.percent)}퍼센트`}
          >
            <circle cx="60" cy="60" r="50" className="ring-track" />
            <circle
              cx="60"
              cy="60"
              r="50"
              className="ring-value"
              strokeDasharray={`${data.migration.percent * Math.PI} 314.159`}
            />
          </svg>
          <div>
            <strong className="mono">
              {data.migration.readyCount}
              <span>/{data.migration.total}</span>
            </strong>
            <span>MEMBERS READY</span>
          </div>
        </div>
        <div className="migration-legend">
          {(
            ["READY", "PRE_REGISTERED", "JOINING", "UNDECIDED", "MIGRATED"] as MigrationStatus[]
          ).map((status) => (
            <div key={status}>
              <span className="legend-square" style={{ background: migrationColors[status] }} />
              <span>{migrationLabels[status]}</span>
              <strong className="mono">{data.migration.counts[status]}</strong>
            </div>
          ))}
        </div>
      </div>
      <p className="migration-footnote">같은 동료와, 다음 서버에서도.</p>
      <Link href="/season" className="migration-action">
        내 이동 준비 상태 확인 <ArrowRight size={14} />
      </Link>
    </Card>
  );
  const memberCard =
    role === "ADMIN" ? (
      <Card className="members-overview">
        <PanelHeading title="HIVE MEMBERS" href="/members" label="멤버" />
        <div className="member-summary-grid">
          <div className="member-count">
            <span>함께하는 멤버</span>
            <strong className="mono">
              {data.members.length}
              <small>명</small>
            </strong>
          </div>
          <Link href="/admin/members" className="member-review">
            <span>
              승인 대기
              <ArrowRight size={13} />
            </span>
            <strong className="mono">
              {data.pendingCount}
              <small>명</small>
            </strong>
          </Link>
        </div>
        <p className="online-count">
          <span className="status-dot" />
          {data.onlineCount}명 온라인 <span className="mock-inline">MOCK</span>
        </p>
        <div className="avatar-stack">
          {data.members.slice(0, 6).map((member) => (
            <Avatar key={member.id} name={member.displayName} size="sm" />
          ))}
        </div>
      </Card>
    ) : null;

  return (
    <>
      <PageHeader
        eyebrow="YOUR HIVE, AT A GLANCE · DEMO"
        title={name ? `${name}님, 오늘도 함께해요.` : "오늘의 하이브"}
        description="오늘의 작전을 확인하고, 우리의 다음 시즌을 준비하세요."
        action={
          <>
            <span className="mono dashboard-date">TUE, OCT 06</span>
            <Link href="/season" className="button button-quiet">
              <CalendarDays size={15} />
              시즌 허브
              <ArrowUpRight size={14} />
            </Link>
          </>
        }
      />
      <SeasonStrip season={data.currentSeason} />
      <div className="dashboard-action-grid">
        <Card tone="highlight" className="operation-card" id="next-operation">
          <div className="panel-heading">
            <h2 className="panel-title">NEXT OPERATION</h2>
            <Badge tone="primary">TODAY</Badge>
          </div>
          <div className="operation-time">
            <Clock3 size={15} />
            <span>
              오늘 <strong className="mono">21:00</strong>
            </span>
            <span className="operation-hours">데모 기준 3시간 후</span>
          </div>
          <div className="operation-title">
            <div className="operation-icon">
              <Crosshair size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h2>{op.title}</h2>
              <p>{op.description}</p>
            </div>
          </div>
          <div className="operation-roster">
            <div className="avatar-stack">
              {op.participantMembers.slice(0, 5).map((member) => (
                <Avatar key={member.id} name={member.displayName} size="sm" />
              ))}
              <span className="extra-avatar">+{Math.max(0, op.goingCount - 5)}</span>
            </div>
            <span>
              <strong className="mono">{op.goingCount}</strong> / {op.capacity} Going
            </span>
            <span className="support-warning">
              <Users size={13} />
              자유 참가 · 세팅은 함께 조율
            </span>
          </div>
          <div
            className="operation-capacity"
            role="progressbar"
            aria-label="작전 참가 인원"
            aria-valuenow={op.goingCount}
            aria-valuemin={0}
            aria-valuemax={op.capacity}
          >
            <span style={{ width: `${Math.min(100, (op.goingCount / op.capacity) * 100)}%` }} />
          </div>
          <div className="rsvp-buttons" aria-label="작전 참가 응답">
            {rsvpOptions.map((option) => (
              <button
                key={option.value}
                disabled={!mayRsvp}
                aria-pressed={op.myRsvp === option.value}
                onClick={() => {
                  if (setRsvp(option.value))
                    setFeedback(`참가 응답을 ${option.label}(으)로 변경했습니다.`);
                }}
                className={op.myRsvp === option.value ? "selected" : ""}
              >
                {op.myRsvp === option.value && <Check size={14} />}
                {option.label}
              </button>
            ))}
          </div>
          <div className="operation-note">
            {mayRsvp ? (
              <span>내 응답은 이 브라우저의 데모에 저장됩니다.</span>
            ) : (
              <Link href="/login">
                개발 계정으로 로그인하고 참가 응답 남기기 <ArrowRight size={12} />
              </Link>
            )}
            <span className="sr-only" role="status">
              {feedback}
            </span>
          </div>
        </Card>
        {role === "ADMIN" ? memberCard : migrationCard}
        <Card className="vote-preview">
          <PanelHeading title="NEXT SEASON VOTE" />
          <div className="vote-head">
            <Vote size={16} />
            <h3>S{data.vote.nextSeasonNumber} 시나리오 투표</h3>
          </div>
          <div className="vote-preview-options">
            {data.vote.candidates.slice(0, 2).map((candidate) => (
              <div key={candidate.id}>
                <div>
                  <span>{candidate.scenario.name}</span>
                  <strong className="mono">
                    {candidate.votes}
                    <small>표</small>
                  </strong>
                </div>
                <div className="vote-mini-track">
                  <span style={{ width: `${candidate.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="vote-deadline">
            <Clock3 size={12} />
            10.12 23:59 KST 마감
          </p>
          <Link href="/season#scenario-vote" className="button button-primary">
            {data.vote.selectedCandidateId ? "내 투표 확인" : "다음 여정 선택하기"}
            <ArrowRight size={14} />
          </Link>
          <small className="vote-participation">
            {data.vote.totalVotes} / {data.vote.totalEligible} 멤버 참여
          </small>
        </Card>
      </div>
      <div className={`dashboard-status-grid${role === "ADMIN" ? " has-board" : ""}`}>
        {role === "ADMIN" && migrationCard}
        <Card className="announcements-card">
          <PanelHeading title="RECENT ANNOUNCEMENTS" />
          <div className="announcement-list">
            {data.announcements.slice(0, 1).map((item) => (
              <button key={item.id} onClick={() => setAnnouncementId(item.id)}>
                <Badge
                  tone={
                    item.tag === "SEASON" ? "warning" : item.tag === "OPS" ? "primary" : "default"
                  }
                >
                  {item.tag}
                </Badge>
                <span>{item.title}</span>
                <time className="mono" dateTime={item.publishedAt.toISOString()}>
                  {formatKstDate(item.publishedAt).slice(5)}
                </time>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <div className="announcement-footer">
            <ShieldCheck size={14} />
            <span>하이브 운영진의 최신 안내를 확인하세요.</span>
          </div>
        </Card>
        <SteamOverview data={steamOverview} />
      </div>
      <div className={`dashboard-guide-row${role === "ADMIN" ? " has-board" : ""}`}>
        <DashboardGuide />
      </div>
      <div className="section-divider">
        <span>FROM THE HIVE</span>
        <span className="mono">OUR BUILDS. OUR STORIES.</span>
      </div>
      <div className="dashboard-content-grid dashboard-demo-content">
        <Card>
          <PanelHeading title="RECENT BUILDS" href="/lab" label="Build Lab" />
          <div className="build-list">
            {data.recentBuilds.slice(0, 1).map((build) => (
              <Link key={build.id} href="/lab" prefetch={false}>
                <div className="content-icon">
                  <FlaskConical size={18} strokeWidth={1.5} />
                </div>
                <div>
                  <h3>{build.title}</h3>
                  <p>
                    {author(build.ownerId)}
                    <span>·</span>
                    {build.tags.join(" / ")}
                  </p>
                </div>
                <Badge>v{build.version}</Badge>
                <ArrowUpRight size={13} className="content-arrow" />
                <span className="sr-only">빌드 요약 예시 · 실제 빌드 목록으로 이동</span>
              </Link>
            ))}
          </div>
          <p className="content-note">빌드 요약 예시 · 클릭하면 실제 빌드 목록으로 이동합니다.</p>
        </Card>
        <Card>
          <PanelHeading title="RECENT GUIDES" href="/community" label="가이드" />
          <div className="guide-list">
            {data.recentGuides.slice(0, 1).map((guide) => (
              <Link key={guide.id} href="/community" prefetch={false}>
                <BookOpen size={17} strokeWidth={1.5} />
                <div>
                  <h3>{guide.title}</h3>
                  <p>
                    {author(guide.authorId)}
                    <span>·</span>
                    {formatKstDate(guide.publishedAt).slice(5)}
                  </p>
                </div>
                <ArrowUpRight size={13} />
                <span className="sr-only">가이드 요약 예시 · 실제 커뮤니티 목록으로 이동</span>
              </Link>
            ))}
          </div>
          <p className="content-note">
            가이드 요약 예시 · 클릭하면 실제 커뮤니티 목록으로 이동합니다.
          </p>
        </Card>
      </div>
      <div className="demo-disclosure">
        <span>
          <Badge>DEMO DATA</Badge>하이브 운영 정보는 2026.10.06 18:00 KST 기준 예시입니다. Steam
          소식·접속자 수는 별도로 조회합니다.
        </span>
        {!storageAvailable && (
          <span role="status">
            브라우저 저장소를 사용할 수 없어 변경 사항은 현재 화면에서만 유지됩니다.
          </span>
        )}
      </div>
      <Modal
        open={!!announcement}
        onOpenChange={(open) => {
          if (!open) setAnnouncementId(null);
        }}
        title={announcement?.title ?? "하이브 공지"}
        description={
          announcement
            ? `${formatKstDate(announcement.publishedAt)} · ${author(announcement.authorId)} · 데모 공지`
            : undefined
        }
      >
        <p className="announcement-body">{announcement?.content}</p>
        {announcement?.tag === "SEASON" && (
          <Link
            className="button button-primary"
            href="/season"
            onClick={() => setAnnouncementId(null)}
          >
            시즌 허브에서 확인
            <ArrowRight size={14} />
          </Link>
        )}
      </Modal>
    </>
  );
}
