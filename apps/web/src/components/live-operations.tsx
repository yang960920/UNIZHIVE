"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Clock3, ShieldCheck, Users, Vote } from "lucide-react";
import { Badge, Card, PageHeader } from "@uniz/ui";
import {
  canApproveMember,
  canViewAdminMemberDirectory,
  canManageSeason,
  getSeasonServerTypeLabel,
  getTrancePhenomenonLabel,
  MIGRATION_STATUSES,
  RSVP_STATUSES,
  type HiveRole,
  type MigrationStatus,
} from "@uniz/domain";
import type { OperationalData, OperationalSeason } from "@/lib/data/operational-types";
import { mutateOperationalData } from "@/lib/operational-actions";
import type { OperationalMutation } from "@/lib/operational-policy";
import { seasonPhaseLabel } from "@/lib/admin-format";
import { getPartyContent } from "@/lib/party-content";
import { Logo } from "./logo";
import { AuthRetryNotice } from "./auth-retry-notice";
import { SteamOverview } from "./steam-overview";
import { DashboardGuide } from "./dashboard-guide";
import type { SteamOverviewData } from "@/lib/data/steam-overview-types";
import "./dashboard.css";
import "./season/season.css";
import "./live-operations.css";

const migrationLabels: Record<MigrationStatus, string> = {
  UNDECIDED: "미정",
  JOINING: "참가 예정",
  PRE_REGISTERED: "사전 등록",
  READY: "준비 완료",
  MIGRATED: "이동 완료",
};
const rsvpLabels = { GOING: "참가", MAYBE: "미정", UNAVAILABLE: "불참" } as const;

function date(value: string, time = false): string {
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    }).format(new Date(value)) + (time ? " KST" : "")
  );
}

function useOperationalActions() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  function mutate(input: OperationalMutation, success: string) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await mutateOperationalData(input);
        setFailed(!result.ok);
        setMessage(result.ok ? success : result.message);
      } catch {
        setFailed(true);
        setMessage("연결을 확인한 후 다시 시도해주세요.");
      }
    });
  }
  return { pending, mutate, message, failed };
}
type Actions = ReturnType<typeof useOperationalActions>;

function Feedback({ actions }: { actions: Actions }) {
  return (
    <p
      className={`live-feedback ${actions.failed ? "is-error" : ""}`}
      role={actions.failed ? "alert" : "status"}
    >
      {actions.pending ? "저장 중입니다…" : actions.message}
    </p>
  );
}

export function OperationalAccessNotice({
  mode,
  season = false,
  retryHref,
  retryAfterSeconds,
}: {
  mode: "PENDING" | "ERROR" | "REAUTH" | "LEFT";
  season?: boolean;
  retryHref?: string;
  retryAfterSeconds?: number;
}) {
  if (mode === "ERROR") return <AuthRetryNotice retryAfterSeconds={retryAfterSeconds} />;
  const copy = {
    PENDING: {
      title: "하이브 합류를 준비하고 있어요.",
      description: "Discord 연결 후 프로필을 작성하고 운영진의 멤버 승인을 기다려주세요.",
      label: "멤버 승인 대기",
      body: "승인이 완료되면 실제 시즌 일정, 작전 참가와 투표를 사용할 수 있습니다.",
      action: "내 프로필 확인",
      href: "/onboarding",
    },
    REAUTH: {
      title: "Discord 로그인을 다시 확인해주세요.",
      description: "로그인 연결을 갱신하면 실제 하이브 정보를 확인할 수 있습니다.",
      label: "다시 로그인 필요",
      body: "Discord로 다시 로그인하여 UNIZ 서버 가입 상태를 확인해주세요.",
      action: "Discord 로그인",
      href: `/login?callbackUrl=${encodeURIComponent(retryHref ?? (season ? "/season" : "/"))}`,
    },
    LEFT: {
      title: "UNIZ 서버 가입을 확인해주세요.",
      description: "현재 UNIZ Discord 서버 멤버임을 확인할 수 없습니다.",
      label: "서버 가입 확인 필요",
      body: "UNIZ 서버에 다시 가입한 뒤 로그인해주세요. 멤버 권한은 운영진의 승인을 통해 갱신됩니다.",
      action: "가입 후 다시 로그인",
      href: `/login?callbackUrl=${encodeURIComponent(retryHref ?? (season ? "/season" : "/"))}`,
    },
  }[mode];
  return (
    <>
      <PageHeader
        eyebrow={season ? "SEASON HUB" : "UNIZ HIVE"}
        title={copy.title}
        description={copy.description}
      />
      <Card className="live-empty-card">
        <ShieldCheck size={26} aria-hidden="true" />
        <h2>{copy.label}</h2>
        <p>{copy.body}</p>
        <Link prefetch={false} className="button button-primary" href={copy.href}>
          {copy.action}
          <ArrowRight size={14} />
        </Link>
      </Card>
    </>
  );
}

function CurrentSeason({ season, role }: { season: OperationalSeason | null; role: HiveRole }) {
  if (!season)
    return (
      <Card className="live-empty-card">
        <CalendarDays size={25} aria-hidden="true" />
        <h2>아직 진행 중인 시즌이 없습니다.</h2>
        <p>준비 중인 시즌은 시즌 허브에서 확인하고 참여할 수 있습니다.</p>
        {canManageSeason(role) && (
          <>
            <Link prefetch={false} className="button button-quiet" href="/admin/seasons">
              시즌 등록하기
              <ArrowRight size={14} />
            </Link>
          </>
        )}
      </Card>
    );
  const currentPhase = season.phases.find((phase) => phase.id === season.currentPhaseId);
  const permanent = season.serverType === "PERMANENT";
  return (
    <section className="season-hero" aria-labelledby="live-season-title">
      <div className="season-hero-main">
        <div className="season-hero-kicker">
          <span className="eyebrow">SEASON {season.seasonNumber}</span>
          <Badge tone="primary">{season.status === "SETTLEMENT" ? "정산 중" : "진행 중"}</Badge>
        </div>
        <h2 id="live-season-title">
          <Link prefetch={false} href={`/season/${season.id}`}>
            {season.scenario}
          </Link>
        </h2>
        <p>{season.name}</p>
        <p>
          {getSeasonServerTypeLabel(season.serverType)} · 트랜스 현상:{" "}
          {getTrancePhenomenonLabel(season.trancePhenomenon)}
        </p>
        <dl className="season-facts">
          <div>
            <dt>SERVER</dt>
            <dd className="mono">{season.server}</dd>
          </div>
          <div>
            <dt>{permanent ? "운영 시작" : "SEASON START"}</dt>
            <dd>{date(season.startsAt)}</dd>
          </div>
          {!permanent && (
            <div>
              <dt>SETTLEMENT</dt>
              <dd>
                {season.settlementAt
                  ? `${date(season.settlementAt)} · D-${season.daysRemaining}`
                  : "미정"}
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div className="season-hero-brand">
        <Logo variant="detail" size="lg" />
        <span className="eyebrow">GROW TOGETHER. GO TOGETHER.</span>
      </div>
      <div className="season-phase-strip">
        <div className="season-phase-label">
          <CalendarDays size={15} />
          <span>
            {permanent
              ? "영구 운영 · 휴식기"
              : currentPhase
                ? seasonPhaseLabel(currentPhase.order, currentPhase.name)
                : "현재 진행 중인 단계가 없습니다."}
          </span>
        </div>
        {permanent ? null : season.phases.length > 0 ? (
          <ol className="season-phases" aria-label="등록된 시즌 단계">
            {season.phases.map((phase) => (
              <li
                key={phase.id}
                className={phase.id === season.currentPhaseId ? "is-current" : ""}
                aria-current={phase.id === season.currentPhaseId ? "step" : undefined}
              >
                <span className="season-phase-bar" />
                <span>
                  <b className="mono">{phase.order.toString().padStart(2, "0")}</b> {phase.name}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="season-card-note">시즌 상세에서 진행 단계를 확인해주세요.</p>
        )}
      </div>
    </section>
  );
}

function NextOperation({
  operation,
  actions,
}: {
  operation: OperationalData["nextOperation"];
  actions: Actions;
}) {
  return (
    <Card tone="highlight" className="operation-card" id="next-operation">
      <div className="panel-heading">
        <h2 className="panel-title">다음 파티</h2>
        {operation && (
          <Badge tone="primary">{getPartyContent(operation.contentKey)?.label ?? "모집"}</Badge>
        )}
      </div>
      {operation ? (
        <>
          <div className="operation-time">
            <Clock3 size={15} />
            <time dateTime={operation.startsAt}>{date(operation.startsAt, true)}</time>
          </div>
          <div className="operation-title">
            <div>
              <h2>{operation.title}</h2>
              <p>{operation.description}</p>
              {operation.seasonName && <p>{operation.seasonName}</p>}
              {operation.meetingPoint && <p>모이는 곳 · {operation.meetingPoint}</p>}
            </div>
          </div>
          <div className="operation-roster">
            <Users size={15} />
            <span>
              <strong className="mono">{operation.goingCount}</strong> / {operation.capacity}명 ·
              미정 {operation.maybeCount}명
            </span>
          </div>
          <div
            className="operation-capacity"
            role="progressbar"
            aria-label="파티 참가 인원"
            aria-valuenow={operation.goingCount}
            aria-valuemin={0}
            aria-valuemax={operation.capacity}
          >
            <span
              style={{
                width: `${Math.min(100, (operation.goingCount / operation.capacity) * 100)}%`,
              }}
            />
          </div>
          <div className="rsvp-buttons" aria-label="파티 참가 응답">
            {RSVP_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                disabled={
                  actions.pending ||
                  !operation.mayRespond ||
                  (status === "GOING" && operation.mayGo === false) ||
                  (status === "MAYBE" && operation.mayMaybe === false)
                }
                aria-pressed={operation.myRsvp === status}
                className={operation.myRsvp === status ? "selected" : ""}
                onClick={() =>
                  actions.mutate(
                    { action: "RSVP", operationId: operation.id, status },
                    `참가 응답을 ${rsvpLabels[status]}(으)로 저장했습니다.`,
                  )
                }
              >
                {operation.myRsvp === status && <Check size={14} />}
                {rsvpLabels[status]}
              </button>
            ))}
          </div>
          <p className="season-card-note">
            {operation.responseNotice ??
              (operation.mayRespond
                ? "참가 응답은 하이브에 저장됩니다."
                : "이 파티의 시즌 참가 명단과 모집 일정을 확인해주세요.")}
          </p>
          <Link className="button button-quiet" href={`/ops/${operation.id}`} prefetch={false}>
            파티 상세 보기
            <ArrowRight size={14} />
          </Link>
        </>
      ) : (
        <p className="live-empty-copy">
          참여 중인 시즌의 예정된 파티가 없습니다. 달력에서 모집 일정을 확인해 보세요.
        </p>
      )}
      <Link className="button button-quiet" href="/ops" prefetch={false}>
        파티 모집 달력
        <CalendarDays size={14} />
      </Link>
    </Card>
  );
}

function Migration({ data, actions }: { data: OperationalData; actions: Actions }) {
  const { migration, currentSeason } = data;
  return (
    <Card className="migration-board" id="migration">
      <div className="season-section-header">
        <div>
          <span className="eyebrow">GO TOGETHER</span>
          <h2>시즌 이동 보드</h2>
        </div>
        <Badge tone="primary">{migration.percent}% 준비</Badge>
      </div>
      <div className="migration-readiness">
        <div>
          <strong className="mono">
            {migration.ready}
            <span> / {migration.total}</span>
          </strong>
          <p>Members Ready</p>
        </div>
      </div>
      <div className="live-status-list">
        {MIGRATION_STATUSES.map((status) => (
          <span key={status}>
            {migrationLabels[status]}
            <b className="mono">{migration.counts[status]}</b>
          </span>
        ))}
      </div>
      {migration.members.length > 0 ? (
        <div className="live-migration-roster">
          {migration.members.map((member) => (
            <div key={member.id}>
              {member.handle ? (
                <Link href={`/members/${member.handle}`}>{member.name}</Link>
              ) : (
                <span>{member.name}</span>
              )}
              <Badge>{migrationLabels[member.status]}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="live-empty-copy">
          {migration.total > 0 && !currentSeason?.myMembership
            ? "이 시즌에 참여하면 참가 명단을 확인할 수 있습니다."
            : "아직 이 시즌의 참가자가 등록되지 않았습니다."}
        </p>
      )}
      {currentSeason && migration.mayChange && migration.myStatus ? (
        <div className="my-migration-state">
          <label htmlFor="live-migration-status">내 이동 상태</label>
          <select
            id="live-migration-status"
            value={migration.myStatus}
            disabled={actions.pending}
            onChange={(event) =>
              actions.mutate(
                {
                  action: "MIGRATION",
                  seasonId: currentSeason.id,
                  status: event.target.value as MigrationStatus,
                },
                "내 이동 준비 상태를 저장했습니다.",
              )
            }
          >
            {MIGRATION_STATUSES.map((status) => (
              <option value={status} key={status}>
                {migrationLabels[status]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        currentSeason && (
          <p className="season-card-note">
            {currentSeason.myMembership
              ? currentSeason.serverType === "PERMANENT"
                ? "운영진이 하이브 이동 신청을 열면 등록할 수 있습니다."
                : "현재 시즌 단계에서는 이동 상태를 변경할 수 없습니다."
              : "시즌 참가 등록은 운영진에게 문의해주세요."}
          </p>
        )
      )}
      <p className="season-card-note">준비 완료와 이동 완료를 합산합니다.</p>
    </Card>
  );
}

function ScenarioVote({ data, actions }: { data: OperationalData; actions: Actions }) {
  const { vote, currentSeason } = data;
  const closed = vote && new Date(data.asOf) >= new Date(vote.closesAt);
  return (
    <Card className="scenario-vote" id="scenario-vote">
      <div className="season-section-header">
        <div>
          <span className="eyebrow">THE NEXT CHAPTER</span>
          <h2>다음 시나리오 투표</h2>
        </div>
        {vote && (
          <Badge tone={closed ? "default" : "primary"}>{closed ? "마감" : "투표 일정"}</Badge>
        )}
      </div>
      {vote ? (
        <>
          <p className="vote-deadline">
            <Clock3 size={14} />
            <time dateTime={vote.closesAt}>{date(vote.closesAt, true)} 마감</time>
          </p>
          <div className="vote-candidates">
            {vote.candidates.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                className={`scenario-vote-card ${candidate.selected ? "is-selected" : ""}`}
                aria-pressed={candidate.selected}
                disabled={actions.pending || !vote.mayVote || !currentSeason}
                onClick={() =>
                  currentSeason &&
                  actions.mutate(
                    { action: "VOTE", seasonId: currentSeason.id, candidateId: candidate.id },
                    `${candidate.label}에 투표했습니다. 마감 전까지 변경할 수 있습니다.`,
                  )
                }
              >
                <span className="vote-card-top">
                  <span className="vote-card-number mono">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <strong>{candidate.label}</strong>
                  <b className="mono">
                    {candidate.count}
                    <small>표</small>
                  </b>
                </span>
                <span className="vote-card-description">{candidate.description}</span>
                <span className="vote-card-meter" aria-hidden="true">
                  <span style={{ width: `${candidate.percent}%` }} />
                </span>
                <span className="vote-card-bottom">
                  <span>
                    {candidate.selected ? "내 선택" : vote.mayVote ? "선택하기" : "투표할 수 없음"}
                  </span>
                  <span className="mono">{candidate.percent}%</span>
                </span>
              </button>
            ))}
          </div>
          <div className="vote-summary">
            <span>
              <Vote size={14} />
              {vote.totalVotes} / {vote.totalEligible}명 참여
            </span>
            <span>1인 1표 · 마감 전 변경 가능</span>
          </div>
          {!vote.mayVote && (
            <p className="season-card-note">
              {closed
                ? "투표가 마감되었습니다."
                : "시즌 참가 등록과 현재 진행 단계를 확인해주세요."}
            </p>
          )}
        </>
      ) : (
        <p className="live-empty-copy">
          등록된 투표가 없습니다. 후보와 마감 일정이 정해지면 여기에 표시됩니다.
        </p>
      )}
    </Card>
  );
}

function LiveHistory({ history }: { history: OperationalData["history"] }) {
  return (
    <section className="season-history" aria-labelledby="live-history-title">
      <div className="season-section-header">
        <h2 id="live-history-title">하이브 시즌 기록</h2>
      </div>
      {history.length > 0 ? (
        <div className="season-history-grid">
          {history.map((season) => (
            <Card key={season.id}>
              <div className="panel-heading">
                <span className="mono">S{season.seasonNumber}</span>
                <Badge>{season.status}</Badge>
              </div>
              <h3>{season.name}</h3>
              <p>
                {season.scenario} · {season.server}
              </p>
              <p>
                {getSeasonServerTypeLabel(season.serverType)} · 트랜스 현상:{" "}
                {getTrancePhenomenonLabel(season.trancePhenomenon)}
              </p>
              <p className="season-card-note">
                등록 참가자 {season.members}명 · 완료 작전 {season.completedOperations}개
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <p className="live-empty-copy">시즌 기록이 쌓이면 여기에 보관됩니다.</p>
      )}
    </section>
  );
}

export function LiveDashboard({
  data,
  role,
  name,
  steamOverview,
}: {
  data: OperationalData;
  role: HiveRole;
  name?: string;
  steamOverview?: SteamOverviewData;
}) {
  const actions = useOperationalActions();
  const memberOverview = canViewAdminMemberDirectory(role) && (
    <Card className="members-overview">
      <div className="panel-heading">
        <h2 className="panel-title">하이브 멤버</h2>
        <Link href="/members">
          멤버
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="member-summary-grid">
        <div className="member-count">
          <span>승인된 멤버</span>
          <strong className="mono">
            {data.memberCount}
            <small>명</small>
          </strong>
        </div>
        {canApproveMember(role) && (
          <Link className="member-review" href="/admin/members">
            <span>
              승인 대기
              <ArrowRight size={14} />
            </span>
            <strong className="mono">
              {data.pendingCount ?? 0}
              <small>명</small>
            </strong>
          </Link>
        )}
      </div>
      <p className="season-card-note">Discord 온라인 현황은 연결 준비 중입니다.</p>
    </Card>
  );
  return (
    <>
      <PageHeader
        eyebrow="하이브 현황"
        title={name ? `${name}님, 오늘도 함께해요.` : "오늘의 하이브"}
        description="하이브에 등록된 실제 일정과 멤버 현황입니다."
        action={
          <Link prefetch={false} className="button button-quiet" href="/season">
            <CalendarDays size={15} />
            시즌 허브
            <ArrowRight size={14} />
          </Link>
        }
      />
      <CurrentSeason season={data.currentSeason} role={role} />
      <Feedback actions={actions} />
      <div className="dashboard-action-grid live-action-grid">
        <NextOperation operation={data.nextOperation} actions={actions} />
        {memberOverview || <Migration data={data} actions={actions} />}
        <ScenarioVote data={data} actions={actions} />
      </div>
      <div className={`dashboard-status-grid${memberOverview ? " has-board" : ""}`}>
        {memberOverview && <Migration data={data} actions={actions} />}
        <Card className="announcements-card">
          <div className="panel-heading">
            <h2 className="panel-title">최근 공지</h2>
            {canManageSeason(role) && (
              <Link href="/admin/community">
                공지 관리 <ArrowRight size={14} />
              </Link>
            )}
          </div>
          {data.announcements.length > 0 ? (
            data.announcements.map((announcement) => (
              <details className="live-announcement" key={announcement.id}>
                <summary>
                  {announcement.pinned && <Badge>고정</Badge>}
                  {announcement.title}
                </summary>
                <p>{announcement.content}</p>
                <small>
                  {announcement.author} · {date(announcement.publishedAt)}
                </small>
                <Link href={`/announcements/${announcement.id}`} prefetch={false}>
                  공지 전체 보기 <ArrowRight size={14} />
                </Link>
              </details>
            ))
          ) : (
            <p className="live-empty-copy">등록된 공지가 없습니다.</p>
          )}
        </Card>
        <SteamOverview data={steamOverview} />
      </div>
      <div className="dashboard-content-grid has-guide">
        <DashboardGuide />
        <div className="dashboard-recent-content">
          <Card>
            <div className="panel-heading">
              <h2 className="panel-title">최근 빌드</h2>
            </div>
            {data.recentBuilds.length > 0 ? (
              <div className="live-build-list">
                {data.recentBuilds.map((build) => (
                  <div key={build.id}>
                    <strong>{build.title}</strong>
                    <span>
                      {build.author} · v{build.version}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="live-empty-copy">등록된 빌드 버전이 없습니다.</p>
            )}
          </Card>
          <Card>
            <div className="panel-heading">
              <h2 className="panel-title">최근 커뮤니티 글</h2>
              <Link href="/community">
                전체 보기 <ArrowRight size={14} />
              </Link>
            </div>
            {data.recentCommunityPosts?.length ? (
              <div className="live-community-list">
                {data.recentCommunityPosts.map((post) => (
                  <Link key={post.id} href={`/community/${post.id}`} prefetch={false}>
                    <strong>{post.title}</strong>
                    <small>
                      {post.pinned ? "고정 · " : ""}
                      {post.author} · {date(post.createdAt)}
                    </small>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="live-empty-copy">
                아직 게시글이 없습니다. 공략이나 질문을 함께 나눠보세요.
              </p>
            )}
            <Link className="button button-quiet" href="/community/new">
              글 쓰기 <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      </div>
      <p className="season-card-note">운영 기록 기준 {date(data.asOf, true)}</p>
    </>
  );
}

export function LiveSeasonHub({
  data,
  role,
  showHeader = true,
}: {
  data: OperationalData;
  role: HiveRole;
  showHeader?: boolean;
}) {
  const actions = useOperationalActions();
  return (
    <div className="season-hub">
      {showHeader && (
        <PageHeader
          eyebrow="SEASON HUB"
          title="서버가 바뀌어도, 우리는 함께."
          description="하이브에 등록된 시즌과 다음 여정을 확인하세요."
          action={
            <Link className="button button-quiet" href="/#next-operation">
              다음 작전
              <ArrowRight size={14} />
            </Link>
          }
        />
      )}
      <CurrentSeason season={data.currentSeason} role={role} />
      <Feedback actions={actions} />
      <div className="season-action-grid">
        <Migration data={data} actions={actions} />
        <ScenarioVote data={data} actions={actions} />
      </div>
      <LiveHistory history={data.history} />
      <p className="season-card-note">운영 기록 기준 {date(data.asOf, true)}</p>
    </div>
  );
}
