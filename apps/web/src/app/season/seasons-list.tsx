import Link from "next/link";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { getSeasonServerTypeLabel, getTrancePhenomenonLabel } from "@uniz/domain";
import { scheduleDate, seasonStatusLabels, seasonPhaseLabel } from "@/lib/admin-format";
import type { SeasonParticipationData } from "@/lib/server/season-participation";
import { AdminForm } from "../admin/admin-form";
import { participateInSeason } from "./actions";
import "./seasons-list.css";

export function RegisteredSeasons({ data }: { data: SeasonParticipationData }) {
  const manages = data.role === "ADMIN" || data.role === "OFFICER";
  return (
    <section className="season-registration-list cms-stack" aria-label="등록된 시즌">
      <PageHeader
        eyebrow="HIVE SEASONS"
        title="시즌 목록"
        description="시즌을 선택해 진행 단계와 하이브 이동 준비를 확인하고 참여하세요."
        action={
          <Link
            prefetch={false}
            className="button button-primary"
            href={manages ? "/admin/seasons/new" : "/season/new"}
          >
            {manages ? "새 시즌 만들기" : "시즌 등록 신청"}
          </Link>
        }
      />
      {!data.seasons.length && (
        <Card>
          <h2>아직 등록된 시즌이 없습니다.</h2>
          <p>시즌을 등록하면 멤버들이 이곳에서 참여할 수 있습니다.</p>
        </Card>
      )}
      {data.seasons.map((season) => {
        const open = season.status === "PLANNED" || season.status === "ACTIVE";
        return (
          <Card key={season.id}>
            <div className="cms-topline">
              <div>
                <h2>
                  <Link
                    prefetch={false}
                    className="season-detail-title"
                    href={`/season/${season.id}`}
                  >
                    {season.name}
                  </Link>
                </h2>
                <p className="mono">{season.serverName}</p>
              </div>
              <Badge tone={season.status === "ACTIVE" ? "primary" : "default"}>
                {seasonStatusLabels[season.status]}
              </Badge>
            </div>
            <p>
              {season.scenarioName} · {season.region}
            </p>
            <p>
              {getSeasonServerTypeLabel(season.serverType)} · 트랜스 현상:{" "}
              {getTrancePhenomenonLabel(season.trancePhenomenon)}
            </p>
            <div className="season-registration-dates">
              <span>
                {season.serverType === "PERMANENT" ? "운영 시작" : "시작"}{" "}
                {scheduleDate(season.startsAt)}
              </span>
              {season.serverType !== "PERMANENT" && season.settlementAt && (
                <span>정산 {scheduleDate(season.settlementAt)}</span>
              )}
              <span>참가자 {season.participantCount}명</span>
              {season.serverType === "PERMANENT" ? (
                <span>영구 운영 · 휴식기</span>
              ) : (
                season.currentPhaseName && (
                  <span>
                    현재 {seasonPhaseLabel(season.currentPhaseOrder, season.currentPhaseName)}
                  </span>
                )
              )}
            </div>
            <div className="season-registration-actions">
              <Link prefetch={false} className="button button-quiet" href={`/season/${season.id}`}>
                시즌 상세 보기
              </Link>
              {season.joined ? (
                <Badge tone="primary">참여 중</Badge>
              ) : open ? (
                <AdminForm action={participateInSeason} submitLabel="참여하기">
                  <input type="hidden" name="seasonId" value={season.id} />
                </AdminForm>
              ) : (
                <span className="season-registration-closed">참가 모집이 종료되었습니다.</span>
              )}
              {manages && (
                <Link
                  prefetch={false}
                  className="button button-quiet"
                  href={`/admin/seasons/${season.id}`}
                >
                  시즌·참가자 관리
                </Link>
              )}
            </div>
          </Card>
        );
      })}
      {data.requests.length > 0 && (
        <Card>
          <h2>내 시즌 등록 신청</h2>
          <p>승인 대기 중인 신청을 수정할 수 있습니다. 반려된 신청은 수정 후 다시 제출하세요.</p>
          <div className="season-own-requests">
            {data.requests.map((request) => (
              <div key={request.id} className="cms-topline">
                <div>
                  <strong>{request.name}</strong>
                  <p>
                    {request.serverName} · {request.scenarioName}
                  </p>
                  <p>
                    {getSeasonServerTypeLabel(request.serverType)} · 트랜스 현상:{" "}
                    {getTrancePhenomenonLabel(request.trancePhenomenon)}
                  </p>
                </div>
                <div className="season-registration-actions">
                  <Badge tone={request.approvalStatus === "PENDING" ? "warning" : "danger"}>
                    {request.approvalStatus === "PENDING" ? "승인 대기" : "반려"}
                  </Badge>
                  <Link
                    prefetch={false}
                    className="button button-quiet"
                    href={`/season/requests/${request.id}`}
                  >
                    신청 수정
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
