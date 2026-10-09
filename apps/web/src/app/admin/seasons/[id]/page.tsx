import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { getSeasonServerTypeLabel, getTrancePhenomenonLabel } from "@uniz/domain";
import { requireAdmin } from "@/lib/server/admin";
import { getSeasonAdminData, getSeasonAdminDetail } from "@/lib/server/season-administration";
import { resolveSeasonServerSelection, labelScenario } from "@/lib/season-selection";
import { PhaseProgress } from "@/components/season/phase-progress";
import { scheduleDate } from "@/lib/admin-format";
import { CandidateForm, EnrolmentForm, SeasonSetupForm } from "../forms";
import { MembershipForm, SeasonReviewForm } from "../membership-form";
import "../../administration.css";

const approvalLabels = { PENDING: "승인 대기", APPROVED: "등록됨", REJECTED: "반려됨" } as const;

export default async function SeasonEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin("seasons");
  if (actor.isMock)
    return (
      <Card>
        <p>실제 Discord 계정으로 로그인해주세요.</p>
      </Card>
    );
  const { id } = await params;
  const [data, detail] = await Promise.all([getSeasonAdminData(), getSeasonAdminDetail(id)]);
  if (!detail) notFound();
  const { season, phases, candidates, memberships, enrolledMemberIds, environmentHistory } = detail;
  const selection = resolveSeasonServerSelection(data, season.serverId);
  const registered = season.approvalStatus === "APPROVED";
  const phaseReadonly = season.status === "ARCHIVED" || !registered;
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow={data.servers.find((server) => server.id === season.serverId)?.name ?? "SEASON"}
        title={season.name}
        description="시즌 정보와 하이브 이름을 수정하고 참가자를 관리하세요."
        action={
          <div className="cms-actions">
            {registered && (
              <Link prefetch={false} href={`/season/${id}`} className="button button-primary">
                시즌 상세 보기
              </Link>
            )}
            <Link prefetch={false} href="/admin/seasons" className="button button-quiet">
              시즌 목록
            </Link>
          </div>
        }
      />
      <p>
        {getSeasonServerTypeLabel(season.serverType)} · 트랜스 현상:{" "}
        {getTrancePhenomenonLabel(season.trancePhenomenon)}
      </p>
      {!registered && (
        <Card>
          <h2>시즌 등록 검토</h2>
          <p className="cms-help">
            승인된 시즌에 멤버가 직접 참여할 수 있습니다. 반려된 신청은 신청자가 수정하여 다시
            제출할 수 있습니다.
          </p>
          <Badge>{approvalLabels[season.approvalStatus]}</Badge>
          {actor.role === "ADMIN" && season.approvalStatus === "PENDING" && (
            <SeasonReviewForm key={season.updatedAt} seasonId={id} updatedAt={season.updatedAt} />
          )}
        </Card>
      )}
      {registered && (
        <Card>
          {season.serverType === "PERMANENT" ? (
            <>
              <h2>영구 운영 · 휴식기</h2>
              <p>정산일과 단계 진행 없이 계속 운영하는 서버입니다.</p>
            </>
          ) : (
            <PhaseProgress
              key={season.updatedAt}
              phases={phases}
              currentPhaseOrder={season.currentPhaseOrder}
              seasonId={id}
              expectedUpdatedAt={season.updatedAt}
              canControl={actor.role === "ADMIN" && season.status !== "ARCHIVED"}
            />
          )}
        </Card>
      )}
      <Card>
        <div className="cms-topline">
          <h2>시즌 정보</h2>
          <Badge>{approvalLabels[season.approvalStatus]}</Badge>
        </div>
        <SeasonSetupForm
          key={season.updatedAt}
          initial={selection}
          season={season}
          canManageMigration={actor.role === "ADMIN"}
        />
        <details className="cms-phase">
          <summary>서버·트랜스 변경 이력</summary>
          {environmentHistory.length ? (
            <ul className="cms-list">
              {environmentHistory.map((entry) => (
                <li key={entry.id}>
                  <span>{scheduleDate(entry.changedAt)}</span>
                  <span>
                    {entry.previousServerType === null && entry.previousTrancePhenomenon === null
                      ? "등록"
                      : `${getSeasonServerTypeLabel(entry.previousServerType)} · ${getTrancePhenomenonLabel(entry.previousTrancePhenomenon)}`}{" "}
                    → {getSeasonServerTypeLabel(entry.serverType)} ·{" "}
                    {getTrancePhenomenonLabel(entry.trancePhenomenon)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cms-help">아직 서버·트랜스 변경 이력이 없습니다.</p>
          )}
        </details>
      </Card>
      {registered && (
        <>
          <Card>
            <h2>시즌 참가 멤버 · {memberships.length}명</h2>
            <p className="cms-help">
              멤버는 시즌 허브에서 직접 참여할 수 있습니다. 관리자는 참가 정보를 수정하거나 명단에서
              삭제할 수 있습니다.
            </p>
            {memberships.map((member) =>
              actor.role === "ADMIN" ? (
                <MembershipForm
                  key={`${member.id}-${member.updatedAt}`}
                  seasonId={id}
                  member={member}
                />
              ) : (
                <p key={member.id}>{member.name}</p>
              ),
            )}
            {!memberships.length && <p className="cms-empty">아직 참여한 멤버가 없습니다.</p>}
            {actor.role === "ADMIN" && (
              <details className="cms-phase">
                <summary>관리자가 참가자 추가</summary>
                <EnrolmentForm
                  key={season.updatedAt}
                  seasonId={id}
                  members={data.approvedMembers}
                  enrolled={enrolledMemberIds}
                  disabled={false}
                />
              </details>
            )}
          </Card>
          <Card>
            <h2>다음 시나리오 투표</h2>
            <p className="cms-help">
              후보를 두 개 이상 등록한 뒤 시즌 정보에서 마감 시간을 설정해주세요.
            </p>
            <ul className="cms-list">
              {candidates.map((candidate) => {
                const scenario = data.scenarios.find((item) => item.id === candidate.scenarioId);
                return (
                  <li key={candidate.id}>
                    <strong>{candidate.label}</strong>
                    <span>{scenario ? labelScenario(scenario) : "시나리오"}</span>
                  </li>
                );
              })}
            </ul>
            <CandidateForm
              key={season.updatedAt}
              seasonId={id}
              scenarios={data.scenarios}
              existing={candidates.map((candidate) => candidate.scenarioId)}
              disabled={phaseReadonly || Boolean(season.voteClosesAt)}
            />
          </Card>
        </>
      )}
    </div>
  );
}
