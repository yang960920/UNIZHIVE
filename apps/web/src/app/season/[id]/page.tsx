import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@uniz/ui";
import {
  getSeasonServerTypeLabel,
  getTrancePhenomenonLabel,
  type MigrationStatus,
} from "@uniz/domain";
import { OperationalAccessNotice } from "@/components/live-operations";
import { PhaseProgress } from "@/components/season/phase-progress";
import { scheduleDate, seasonStatusLabels } from "@/lib/admin-format";
import { getPublicSeasonDetail, SeasonParticipationError } from "@/lib/server/season-participation";
import { getCurrentAuthState } from "@/lib/auth";
import { AdminForm } from "../../admin/admin-form";
import { participateInSeason, updateSeasonMigration } from "../actions";
import "../../admin/administration.css";
import "../seasons-list.css";
import "./season-detail.css";

export const metadata: Metadata = { title: "시즌 상세" };
const migrationLabels: Record<MigrationStatus, string> = {
  UNDECIDED: "미정",
  JOINING: "참가 예정",
  PRE_REGISTERED: "사전 등록",
  READY: "준비 완료",
  MIGRATED: "이동 완료",
};
const migrationChoices = ["JOINING", "PRE_REGISTERED", "READY", "MIGRATED"] as const;

export default async function PublicSeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorization = await getCurrentAuthState();
  if (authorization.status === "UNAVAILABLE")
    return (
      <OperationalAccessNotice
        mode="ERROR"
        season
        retryAfterSeconds={authorization.retryAfterSeconds}
      />
    );
  if (authorization.status === "LEFT" || authorization.status === "REAUTH_REQUIRED")
    return (
      <OperationalAccessNotice
        mode={authorization.status === "LEFT" ? "LEFT" : "REAUTH"}
        season
        retryHref={`/season/${id}`}
      />
    );
  let data;
  try {
    data = await getPublicSeasonDetail(id);
  } catch (error) {
    return (
      <OperationalAccessNotice
        mode={
          error instanceof SeasonParticipationError && error.code === "FORBIDDEN"
            ? "PENDING"
            : "ERROR"
        }
        season
        retryHref={`/season/${id}`}
        retryAfterSeconds={authorization.retryAfterSeconds}
      />
    );
  }
  if (!data) notFound();
  const { season } = data;
  const permanent = season.serverType === "PERMANENT";
  const migrationVisible = permanent ? season.migrationOpen : data.finalPhase;
  const manages = data.role === "ADMIN" || data.role === "OFFICER";
  const joinable = season.status === "PLANNED" || season.status === "ACTIVE";
  return (
    <div className="cms-stack season-selected-detail">
      <PageHeader
        eyebrow="HIVE SEASON"
        title={season.name}
        description={`${season.serverName} · ${season.scenarioName}`}
        action={
          <Link prefetch={false} className="button button-quiet" href="/season">
            시즌 목록
          </Link>
        }
      />
      <Card>
        <div className="cms-topline">
          <h2>시즌 정보</h2>
          <Badge tone={season.status === "ACTIVE" ? "primary" : "default"}>
            {seasonStatusLabels[season.status]}
          </Badge>
        </div>
        <dl className="season-detail-facts">
          <div>
            <dt>시나리오</dt>
            <dd>{season.scenarioName}</dd>
          </div>
          <div>
            <dt>서버 종류</dt>
            <dd>{getSeasonServerTypeLabel(season.serverType)}</dd>
          </div>
          <div>
            <dt>트랜스 현상</dt>
            <dd>{getTrancePhenomenonLabel(season.trancePhenomenon)}</dd>
          </div>
          <div>
            <dt>시즌 주소</dt>
            <dd className="mono">{season.serverName}</dd>
          </div>
          <div>
            <dt>지역</dt>
            <dd>{season.region}</dd>
          </div>
          <div>
            <dt>{permanent ? "운영 시작" : "시작"}</dt>
            <dd>{scheduleDate(season.startsAt)}</dd>
          </div>
          {!permanent && season.settlementAt && (
            <div>
              <dt>정산</dt>
              <dd>{scheduleDate(season.settlementAt)}</dd>
            </div>
          )}
          <div>
            <dt>참가자</dt>
            <dd>{season.participantCount}명</dd>
          </div>
        </dl>
        <div className="season-registration-actions">
          <Link
            prefetch={false}
            className="button button-quiet"
            href={`/ops?seasonId=${season.id}`}
          >
            이 시즌의 파티 모집
          </Link>
          {season.joined ? (
            <Badge tone="primary">참여 중</Badge>
          ) : joinable ? (
            <AdminForm action={participateInSeason} submitLabel="이 시즌에 참여하기">
              <input type="hidden" name="seasonId" value={season.id} />
            </AdminForm>
          ) : (
            <p>참가 모집이 종료되었습니다.</p>
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
      <Card>
        {permanent ? (
          <>
            <h2>영구 운영 · 휴식기</h2>
            <p>정산일과 단계 진행 없이 계속 운영하는 서버입니다.</p>
            <p>
              {season.migrationOpen
                ? "하이브 이동 신청이 열려 있습니다."
                : "하이브 이동 신청은 관리자가 열 때 이용할 수 있습니다."}
            </p>
          </>
        ) : (
          <PhaseProgress
            phases={data.phases}
            currentPhaseOrder={season.currentPhaseOrder}
            seasonId={season.id}
            expectedUpdatedAt={season.updatedAt}
            canControl={data.role === "ADMIN"}
            disabled={season.status === "ARCHIVED"}
          />
        )}
      </Card>
      {migrationVisible && (
        <Card>
          <h2>시즌 이동 신청</h2>
          <p>
            {permanent
              ? "관리자가 하이브 이동 신청을 열었습니다. 참가자는 자신의 이동 상태를 등록할 수 있습니다."
              : "이 시즌의 마지막 단계입니다. 참가자는 자신의 하이브 이동 상태를 등록할 수 있습니다."}
          </p>
          <dl className="season-migration-counts">
            {(["UNDECIDED", ...migrationChoices] as const).map((status) => (
              <div key={status}>
                <dt>{migrationLabels[status]}</dt>
                <dd>{data.migrationCounts[status]}명</dd>
              </div>
            ))}
          </dl>
          {data.ownMigrationStatus && (
            <p>내 이동 상태: {migrationLabels[data.ownMigrationStatus]}</p>
          )}
          {data.mayUpdateMigration ? (
            <AdminForm
              key={data.ownMigrationStatus}
              action={updateSeasonMigration}
              submitLabel="이동 상태 저장"
            >
              <input type="hidden" name="seasonId" value={season.id} />
              <label>
                나의 시즌 이동 상태
                <select
                  name="status"
                  required
                  defaultValue={
                    data.ownMigrationStatus === "UNDECIDED" ? "" : (data.ownMigrationStatus ?? "")
                  }
                >
                  <option value="" disabled>
                    이동 상태 선택
                  </option>
                  {migrationChoices.map((status) => (
                    <option key={status} value={status}>
                      {migrationLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </AdminForm>
          ) : (
            <p>
              {season.status === "ARCHIVED"
                ? "보관된 시즌의 이동 기록입니다."
                : season.joined
                  ? "현재 시즌에서는 이동 상태를 변경할 수 없습니다."
                  : "이 시즌에 참여한 뒤 이동 상태를 등록해주세요."}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
