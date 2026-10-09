import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { ContentBody, VideoReference } from "@/components/content/presentation";
import {
  dpsRepresentativeValue,
  dpsResearchHref,
  DPS_RESEARCH_STATUSES,
  type DpsDirectory,
  type DpsResearchDetail,
  type DpsResearchSummary,
  type DpsResearchStatus,
} from "@/lib/dps-research";
import { DpsArchiveForm, DpsReviewForm, DpsVerificationForm } from "./research-forms";
import styles from "./research.module.css";

const number = (value: number) => value.toLocaleString("ko-KR");
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
function Pagination({ data, base, status }: { data: DpsDirectory; base: string; status?: string }) {
  const href = (page: number) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (page > 1) query.set("page", String(page));
    return `${base}${query.size ? `?${query}` : ""}`;
  };
  return (
    <nav className={styles.pagination} aria-label="자료 페이지">
      {data.page > 1 ? (
        <Link className="button button-quiet" href={href(data.page - 1)}>
          이전
        </Link>
      ) : (
        <span />
      )}
      <span>{data.page}페이지</span>
      {data.hasNext ? (
        <Link className="button button-quiet" href={href(data.page + 1)}>
          다음
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
function RecordCard({ record, review = false }: { record: DpsResearchSummary; review?: boolean }) {
  const average = dpsRepresentativeValue(record.payload);
  const measuredCount = record.payload.trials.filter((trial) => trial.dps !== null).length;
  return (
    <Card className={styles.recordCard}>
      <div className={styles.badges}>
        <Badge>{DPS_RESEARCH_STATUSES[record.status]}</Badge>
        <Badge>실측 기록</Badge>
        {record.verified && <Badge tone="primary">재현 확인</Badge>}
        {record.archivedAt && <Badge>보관됨</Badge>}
      </div>
      <h2>
        <Link
          href={
            review
              ? `/admin/database/${record.id}?version=${record.version}`
              : dpsResearchHref(record)
          }
        >
          {record.payload.title}
        </Link>
      </h2>
      <p>{record.payload.summary || "자료 요약이 없습니다."}</p>
      <div className={styles.cardMeta}>
        <span>
          {record.author} · v{record.version}
        </span>
        <span>
          {average === null
            ? "측정 결과 미입력"
            : `대표 DPS ${number(average)} · ${measuredCount}회`}
        </span>
        <time dateTime={record.updatedAt}>{date(record.updatedAt)}</time>
      </div>
      {record.publishedVersion !== null && record.publishedVersion !== record.version && (
        <p className={styles.note}>현재 공개 중인 원본은 v{record.publishedVersion}입니다.</p>
      )}
      {record.reviewNote && <p className={styles.reviewNote}>검토 의견: {record.reviewNote}</p>}
      <div className={styles.buttons}>
        <Link
          className="button button-quiet"
          href={
            review
              ? `/admin/database/${record.id}?version=${record.version}`
              : dpsResearchHref(record)
          }
        >
          {review ? "원본·검토 보기" : "자료 보기"}
        </Link>
        {!review && !record.archivedAt && !record.hiddenAt && (
          <Link className="button button-quiet" href={`/db/dps/${record.id}/edit`}>
            새 버전 작성
          </Link>
        )}
      </div>
    </Card>
  );
}
export function MyDpsDirectory({ data }: { data: DpsDirectory }) {
  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="MY RESEARCH"
        title="나의 DPS 기록"
        description="초안·제출·공개 상태와 원본 버전을 확인하세요."
        action={
          <Link className="button button-primary" href="/db/new">
            실측 자료 작성
          </Link>
        }
      />
      <div className={styles.buttons}>
        <Link className="button button-quiet" href="/db">
          게임 정보로
        </Link>
      </div>
      {data.items.length ? (
        <div className={styles.records}>
          {data.items.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="아직 기록한 자료가 없습니다"
          description="실제 측정 결과와 원본 근거를 기록하고 초안으로 저장해 보세요."
        />
      )}
      <Pagination data={data} base="/db/mine" />
    </div>
  );
}
export function AdminDpsDirectory({
  data,
  status,
}: {
  data: DpsDirectory;
  status: DpsResearchStatus;
}) {
  const statuses: DpsResearchStatus[] = [
    "PENDING",
    "CHANGES_REQUESTED",
    "REJECTED",
    "APPROVED",
    "CANCELLED",
    "REVOKED",
  ];
  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="RESEARCH REVIEW"
        title="게임 정보 검토"
        description="제출된 원본 버전의 측정 조건·근거를 확인합니다. 게시 결정은 ADMIN 권한으로 처리합니다."
      />
      <form action="/admin/database" method="get" className={styles.filters}>
        <label>
          검토 상태
          <select name="status" defaultValue={status}>
            {statuses.map((key) => (
              <option key={key} value={key}>
                {DPS_RESEARCH_STATUSES[key]}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary">조회</button>
      </form>
      {data.items.length ? (
        <div className={styles.records}>
          {data.items.map((record) => (
            <RecordCard key={record.versionId} record={record} review />
          ))}
        </div>
      ) : (
        <EmptyState
          title="이 상태의 자료가 없습니다"
          description="작성자가 게시 검토를 요청하면 제출된 원본을 여기에서 확인할 수 있습니다."
        />
      )}
      <Pagination data={data} base="/admin/database" status={status} />
    </div>
  );
}
export function DpsResearchEvidence({ record }: { record: DpsResearchDetail }) {
  const payload = record.payload;
  const average = dpsRepresentativeValue(payload);
  const measuredCount = payload.trials.filter((trial) => trial.dps !== null).length;
  const conditions = [
    ["게임 패치", payload.gamePatch],
    ["측정일", payload.measuredAt],
    ["시나리오", payload.scenario],
    ["트랜스", payload.trance],
    ["플랫폼", payload.platform],
    ["대상·난이도", payload.target],
    ["측정 시간", payload.durationSeconds === null ? "" : `${payload.durationSeconds}초`],
    ["사격 거리", payload.distanceMeters === null ? "" : `${payload.distanceMeters}m`],
    ["재장전", payload.reloadPolicy],
    ["명중 조건", payload.hitPolicy],
    ["버프·발동 조건", payload.buffPolicy],
  ];
  return (
    <div className={styles.evidence}>
      <Card className={styles.section}>
        <h2>원본 버전 · v{record.version}</h2>
        <div className={styles.badges}>
          <Badge>{DPS_RESEARCH_STATUSES[record.status]}</Badge>
          <Badge>작성자 실측 기록</Badge>
          {record.verified && <Badge tone="primary">재현 확인</Badge>}
        </div>
        <p className={styles.note}>
          대표 값은 수치가 있는 {measuredCount}회 측정의 평균입니다. 관리자 게시 승인과 재현 확인은
          별도입니다.
        </p>
        <strong className={styles.average}>
          {average === null ? "측정 결과 미입력" : `${number(average)} DPS`}
        </strong>
        <p>{payload.summary}</p>
      </Card>
      <Card className={styles.section}>
        <h2>장비 구성과 측정 조건</h2>
        {record.buildLink && (
          <Link className="button button-quiet" href={record.buildLink.href}>
            {record.buildLink.title} · 연결된 빌드 버전
          </Link>
        )}
        <p className={styles.pre}>{payload.composition || "직접 작성한 구성 설명이 없습니다."}</p>
        <dl className={styles.conditions}>
          {conditions.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "미입력"}</dd>
            </div>
          ))}
        </dl>
        <h3>재현 절차</h3>
        <p className={styles.pre}>{payload.procedure || "미입력"}</p>
      </Card>
      <Card className={styles.section}>
        <h2>반복 측정 원본</h2>
        {payload.trials.length ? (
          <ol className={styles.trialResults}>
            {payload.trials.map((trial, index) => (
              <li key={index}>
                <strong>
                  {index + 1}회 · {trial.dps === null ? "미측정" : `${number(trial.dps)} DPS`}
                </strong>
                {trial.note && <p>{trial.note}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p>입력한 측정 결과가 없습니다.</p>
        )}
      </Card>
      <Card className={styles.section}>
        <h2>근거 이미지·원본 영상</h2>
        <ContentBody document={payload.evidenceDocument} text={payload.evidenceText} />
        <VideoReference url={payload.youtubeUrl} />
      </Card>
      {record.verifications.length > 0 && (
        <Card className={styles.section}>
          <h2>재현 검토 기록</h2>
          <ul className={styles.verifications}>
            {record.verifications.map((verification) => (
              <li key={verification.reviewerId}>
                <strong>
                  {verification.reviewerName} · {verification.confirmed ? "재현 확인" : "확인 철회"}
                </strong>
                <p>{verification.note}</p>
                <time dateTime={verification.updatedAt}>{date(verification.updatedAt)}</time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
export function AdminDpsDetail({
  record,
  administrator,
  reviewerId,
}: {
  record: DpsResearchDetail;
  administrator: boolean;
  reviewerId: string;
}) {
  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="RESEARCH REVIEW"
        title={record.payload.title}
        description={`${record.author} · 제출 원본 v${record.version}`}
        action={
          <Link className="button button-quiet" href="/admin/database">
            검토 목록
          </Link>
        }
      />
      <DpsResearchEvidence record={record} />
      {record.reviewNote && (
        <Card className={styles.section}>
          <h2>현재 검토 의견</h2>
          <p className={styles.pre}>{record.reviewNote}</p>
        </Card>
      )}
      <DpsReviewForm record={record} administrator={administrator} />
      <DpsVerificationForm record={record} reviewerId={reviewerId} />
      {!administrator && (
        <p className={styles.note}>
          OFFICER는 원본과 재현 조건을 검토할 수 있습니다. 게시 승인·보완 요청·반려·게시 중단은
          ADMIN이 처리합니다.
        </p>
      )}
      {record.versions.length > 0 && (
        <Card className={styles.section}>
          <h2>버전 이력</h2>
          <div className={styles.versionLinks}>
            {record.versions.map((version) => (
              <Link
                key={version.version}
                href={`/admin/database/${record.id}?version=${version.version}`}
              >
                v{version.version} · {DPS_RESEARCH_STATUSES[version.status]}
                {version.isPublished ? " · 공개 중" : ""}
              </Link>
            ))}
          </div>
        </Card>
      )}
      <DpsArchiveForm record={record} />
    </div>
  );
}
export function DpsResearchFailure({
  message,
  retryHref,
  returnHref = "/db",
}: {
  message: string;
  retryHref: string;
  returnHref?: string;
}) {
  return (
    <div className={styles.root}>
      <PageHeader eyebrow="GAME RESEARCH" title="자료를 불러올 수 없습니다" description={message} />
      <Card className={styles.section}>
        <div className={styles.buttons}>
          <Link className="button button-secondary" href={retryHref}>
            다시 확인
          </Link>
          <Link className="button button-quiet" href={returnHref}>
            돌아가기
          </Link>
          <Link
            className="button button-quiet"
            href={`/login?callbackUrl=${encodeURIComponent(retryHref)}`}
          >
            Discord 로그인
          </Link>
        </div>
      </Card>
    </div>
  );
}
