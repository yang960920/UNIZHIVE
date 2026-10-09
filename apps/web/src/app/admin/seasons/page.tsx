import Link from "next/link";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { getSeasonServerTypeLabel, getTrancePhenomenonLabel } from "@uniz/domain";
import { requireAdmin } from "@/lib/server/admin";
import { getSeasonAdminData } from "@/lib/server/season-administration";
import { scheduleDate, seasonStatusLabels } from "@/lib/admin-format";
import { resolveSeasonServerSelection } from "@/lib/season-selection";
import { SeasonSetupForm } from "./forms";
import "../administration.css";

const approvalLabels = { PENDING: "승인 대기", APPROVED: "등록됨", REJECTED: "반려됨" } as const;

export default async function SeasonsAdminPage() {
  const actor = await requireAdmin("seasons");
  if (actor.isMock)
    return (
      <>
        <PageHeader title="시즌 관리" />
        <Card>
          <p className="cms-readonly">
            실제 Discord 관리자 계정으로 로그인하면 시즌을 등록할 수 있습니다.
          </p>
        </Card>
      </>
    );
  const data = await getSeasonAdminData();
  const selection = resolveSeasonServerSelection(data);
  const pending = data.seasons.filter((season) => season.approvalStatus === "PENDING");
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow="SEASON MANAGEMENT"
        title="시즌 관리"
        description="시즌과 서버를 함께 등록하고, 하이브 이름과 일정·참가자를 관리하세요."
        action={
          <Link prefetch={false} href="/admin/seasons/new" className="button button-primary">
            새 시즌 만들기
          </Link>
        }
      />
      {pending.length > 0 && (
        <Card>
          <h2>시즌 등록 승인 대기 · {pending.length}건</h2>
          <p className="cms-help">
            관리자가 승인하면 시즌 목록에 공개되어 멤버가 참여할 수 있습니다.
          </p>
          <ul className="cms-list">
            {pending.map((season) => (
              <li key={season.id}>
                <Link
                  prefetch={false}
                  className="cms-title-link"
                  href={`/admin/seasons/${season.id}`}
                >
                  {season.serverName} · {season.name}
                </Link>
                <span>신청자 {season.createdByName ?? "기존 멤버"}</span>
                <span>
                  {getSeasonServerTypeLabel(season.serverType)} ·{" "}
                  {getTrancePhenomenonLabel(season.trancePhenomenon)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <h2>하이브 시즌</h2>
        {data.seasons.length ? (
          <div className="cms-table-scroll">
            <table className="cms-table">
              <thead>
                <tr>
                  <th>시즌 · 하이브</th>
                  <th>등록 · 진행 상태</th>
                  <th>시작 · 정산</th>
                  <th>참가 · 단계</th>
                </tr>
              </thead>
              <tbody>
                {data.seasons.map((season) => (
                  <tr key={season.id}>
                    <td>
                      <Link
                        prefetch={false}
                        className="cms-title-link"
                        href={`/admin/seasons/${season.id}`}
                      >
                        {season.serverName}
                      </Link>
                      <small>
                        {season.name} · {season.region}
                      </small>
                      <small>
                        {getSeasonServerTypeLabel(season.serverType)} ·{" "}
                        {getTrancePhenomenonLabel(season.trancePhenomenon)}
                      </small>
                    </td>
                    <td>
                      <Badge tone={season.approvalStatus === "APPROVED" ? "primary" : "default"}>
                        {approvalLabels[season.approvalStatus]}
                      </Badge>
                      <small>{seasonStatusLabels[season.status]}</small>
                    </td>
                    <td>
                      {scheduleDate(season.startsAt)}
                      {season.serverType !== "PERMANENT" && (
                        <small>정산 {scheduleDate(season.settlementAt)}</small>
                      )}
                    </td>
                    <td>
                      {season.memberCount}명 ·{" "}
                      {season.serverType === "PERMANENT"
                        ? "영구 운영 · 휴식기"
                        : `${season.phaseCount}단계`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cms-empty">등록된 시즌이 없습니다. 아래에서 첫 시즌을 만들어주세요.</p>
        )}
      </Card>
      <Card>
        <h2>새 시즌 만들기</h2>
        <p className="cms-help">
          숫자 네 자리가 시즌 번호이자 서버 주소입니다. 정산일은 필요한 경우에만 추가하세요.
        </p>
        <SeasonSetupForm key={selection?.serverId ?? "new-season"} initial={selection} />
      </Card>
    </div>
  );
}
