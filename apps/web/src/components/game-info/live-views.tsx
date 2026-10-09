import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { ContentBody, VideoReference } from "@/components/content/presentation";
import { DpsArchiveForm, DpsVerificationForm } from "./research-forms";
import {
  DPS_RESEARCH_STATUSES,
  dpsRepresentativeValue,
  dpsResearchHref,
  type DpsDirectory,
  type DpsResearchDetail,
  type DpsResearchSummary,
} from "@/lib/dps-research";
import styles from "./game-info.module.css";

const number = (value: number | null) =>
  value === null ? "미기록" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export function DpsEntryLinks({
  canCreate = false,
  canReview = false,
}: {
  canCreate?: boolean;
  canReview?: boolean;
}) {
  return (
    <div className={styles.entryLinks}>
      {canCreate ? (
        <>
          <Link href="/db/new" className="button button-primary">
            <Plus size={15} />
            측정 기록 등록
          </Link>
          <Link href="/db/mine" className="button button-secondary">
            내 측정 기록
          </Link>
        </>
      ) : (
        <Link href="/login?callbackUrl=/db/new" className="button button-secondary">
          로그인하고 측정 기록 등록
        </Link>
      )}
      {canReview && (
        <Link href="/admin/database" className="button button-quiet">
          자료 검토 <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}

export function DpsMeasurement({ record }: { record: DpsResearchSummary }) {
  return (
    <dl className={styles.measurementSummary} aria-label="실측 기록 요약">
      <div>
        <dt>평균 DPS · 회원 실측</dt>
        <dd className="mono">{number(dpsRepresentativeValue(record.payload))}</dd>
      </div>
      <div>
        <dt>측정 시간</dt>
        <dd>
          {number(record.payload.durationSeconds)}
          {record.payload.durationSeconds !== null && <small>초</small>}
        </dd>
      </div>
      <div>
        <dt>반복 횟수</dt>
        <dd>
          {record.payload.trials.filter((trial) => trial.dps !== null).length}
          <small>회</small>
        </dd>
      </div>
    </dl>
  );
}

export function DpsPublishedCard({ record }: { record: DpsResearchSummary }) {
  return (
    <Card className={styles.recordCard}>
      <div className={styles.badges}>
        <Badge>DPS 측정 기록</Badge>
        <Badge tone={record.verified ? "primary" : "default"}>
          {record.verified ? "커뮤니티 검증 완료" : "재현 검증 전"}
        </Badge>
      </div>
      <h2>
        <Link href={dpsResearchHref(record)}>{record.payload.title}</Link>
      </h2>
      {record.payload.summary && <p>{record.payload.summary}</p>}
      <DpsMeasurement record={record} />
      <p className={styles.note}>
        {record.payload.gamePatch} · {record.payload.scenario} · {record.payload.target}
      </p>
      <footer>
        <span>
          {record.author} · v{record.version} · 게시 승인
        </span>
        <Link href={dpsResearchHref(record)} className="button button-secondary">
          조건과 근거 확인 <ArrowUpRight size={15} />
        </Link>
      </footer>
    </Card>
  );
}

export function DpsPublicList({
  data,
  q,
  category,
}: {
  data: DpsDirectory;
  q: string;
  category: string | null;
}) {
  function href(page: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (page > 1) params.set("page", String(page));
    return `/db${params.size ? `?${params}` : ""}`;
  }
  return (
    <section className={styles.records} aria-label="공개 실측 자료">
      <h2 className={styles.listTitle}>공개된 측정 기록</h2>
      {data.items.length ? (
        data.items.map((record) => <DpsPublishedCard key={record.id} record={record} />)
      ) : (
        <Card>
          <EmptyState
            title={q ? "일치하는 실측 자료가 없습니다" : "아직 공개된 실측 자료가 없습니다"}
            description="회원이 제출한 측정 기록은 관리자 게시 승인 후 여기에 표시됩니다."
          />
        </Card>
      )}
      {(data.page > 1 || data.hasNext) && (
        <nav className={styles.pager} aria-label="실측 자료 페이지">
          {data.page > 1 && <Link href={href(data.page - 1)}>이전</Link>}
          <span>{data.page}페이지</span>
          {data.hasNext && <Link href={href(data.page + 1)}>다음</Link>}
        </nav>
      )}
    </section>
  );
}

export function DpsResearchDetailView({
  record,
  reviewerId,
}: {
  record: DpsResearchDetail;
  reviewerId?: string;
}) {
  const payload = record.payload;
  const conditions = [
    ["게임 패치", payload.gamePatch],
    ["시나리오 / 트랜스", [payload.scenario, payload.trance].filter(Boolean).join(" · ")],
    ["플랫폼 / 측정일", [payload.platform, payload.measuredAt].filter(Boolean).join(" · ")],
    [
      "대상 / 거리",
      `${payload.target || "미기록"} · ${number(payload.distanceMeters)}${payload.distanceMeters !== null ? "m" : ""}`,
    ],
    ["재장전 / 측정 구간", payload.reloadPolicy],
    ["치명타 / 약점 / 조준", payload.hitPolicy],
    ["버프 / 감염물 / 팀", payload.buffPolicy],
  ];
  return (
    <div className={`${styles.root} ${styles.detail}`}>
      <Link href={record.isOwner ? "/db/mine" : "/db?category=dps"} className={styles.back}>
        <ArrowLeft size={15} />
        {record.isOwner ? "내 측정 기록" : "게임 정보 목록"}
      </Link>
      <PageHeader
        eyebrow="DPS MEASUREMENT"
        title={payload.title}
        description={payload.summary || "측정 조건과 원본 근거를 함께 확인하세요."}
      />
      <div className={styles.entryLinks}>
        {record.canEdit && (
          <Link href={`/db/dps/${record.id}/edit`} className="button button-secondary">
            수정본 작성
          </Link>
        )}
        {record.canReview && (
          <Link
            href={`/admin/database/${record.id}?version=${record.version}`}
            className="button button-secondary"
          >
            관리자 검토
          </Link>
        )}
        {record.isOwner && !record.archivedAt && <DpsArchiveForm record={record} />}
      </div>
      {record.archivedAt && (
        <p className={styles.stateNotice}>
          보관된 기록입니다. 게임 정보와 검색에 공개되지 않습니다.
        </p>
      )}
      {record.status !== "APPROVED" && (
        <p className={styles.stateNotice}>
          현재 버전은 {DPS_RESEARCH_STATUSES[record.status]} 상태입니다.
          {record.publishedVersion
            ? ` 공개 목록에는 기존 승인본 v${record.publishedVersion}이 표시됩니다.`
            : " 게시 승인 전에는 공개 목록에 표시되지 않습니다."}
        </p>
      )}
      {record.status === "APPROVED" && !record.verified && (
        <p className={styles.stateNotice}>
          관리자가 게시를 승인한 회원 실측 기록입니다. 같은 조건의 독립 재현 검토는 아직 완료되지
          않았습니다.
        </p>
      )}
      <article className={styles.article}>
        <div className={styles.recordMeta}>
          <span>
            {record.author} · v{record.version}
          </span>
          <div className={styles.badges}>
            <Badge>{DPS_RESEARCH_STATUSES[record.status]}</Badge>
            {record.status === "APPROVED" && (
              <Badge tone={record.verified ? "primary" : "default"}>
                {record.verified ? "커뮤니티 검증 완료" : "재현 검증 전"}
              </Badge>
            )}
          </div>
        </div>
        <DpsMeasurement record={record} />
        <section className={styles.section}>
          <h2>측정 조건</h2>
          <dl className={styles.conditions}>
            {conditions.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "미기록"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={styles.section}>
          <h2>사용한 빌드와 장비</h2>
          {record.buildLink && (
            <Link className="button button-secondary" href={record.buildLink.href}>
              {record.buildLink.title} <ArrowUpRight size={15} />
            </Link>
          )}
          {payload.composition && <p className={styles.multiline}>{payload.composition}</p>}
          {!record.buildLink && !payload.composition && <p>장비 구성 미기록</p>}
        </section>
        <section className={styles.section}>
          <h2>반복 측정 결과</h2>
          {payload.trials.length ? (
            <div className={styles.tableScroll}>
              <table>
                <caption>등록자가 관찰한 DPS 값 · 평균은 입력한 결과의 산술 평균입니다.</caption>
                <thead>
                  <tr>
                    <th scope="col">측정</th>
                    <th scope="col">실측 DPS</th>
                    <th scope="col">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.trials.map((trial, index) => (
                    <tr key={index}>
                      <th scope="row">{index + 1}회</th>
                      <td className="mono">{number(trial.dps)}</td>
                      <td>{trial.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>측정 결과 미기록</p>
          )}
        </section>
        <section className={styles.section}>
          <h2>재현 절차</h2>
          <p className={styles.multiline}>{payload.procedure || "미기록"}</p>
        </section>
        <section className={styles.section}>
          <h2>원본 근거</h2>
          <ContentBody document={payload.evidenceDocument} text={payload.evidenceText} />
          <VideoReference url={payload.youtubeUrl} />
          {!payload.youtubeUrl && !payload.evidenceDocument && !payload.evidenceText && (
            <p>아직 첨부하지 않았습니다.</p>
          )}
        </section>
        {(record.reviewNote || record.reviewedAt) && (
          <section className={styles.section}>
            <h2>게시 검토</h2>
            <p className={styles.multiline}>{record.reviewNote || "게시를 승인했습니다."}</p>
            {record.reviewedAt && (
              <p className={styles.note}>
                {new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Seoul",
                }).format(new Date(record.reviewedAt))}{" "}
                KST
              </p>
            )}
          </section>
        )}
        {record.status === "APPROVED" && (
          <section className={styles.section}>
            <h2>재현 검토</h2>
            <p>
              같은 조건의 측정 3회 이상과 작성자를 제외한 서로 다른 운영진 2명의 확인이 모이면 검증
              완료로 표시됩니다.
            </p>
            <p className={styles.note}>
              현재 독립 확인 {record.verificationCount}명 ·{" "}
              {record.verified ? "검증 완료" : "재현 검증 전"}
            </p>
            {record.verifications
              .filter((review) => review.confirmed)
              .map((review) => (
                <div key={review.reviewerId} className={styles.verificationNote}>
                  <strong>{review.reviewerName}</strong>
                  <p>{review.note}</p>
                </div>
              ))}
            {record.canVerify && !record.isOwner && !record.archivedAt && (
              <DpsVerificationForm record={record} reviewerId={reviewerId} />
            )}
          </section>
        )}
        {record.versions.length > 1 && (
          <section className={styles.section}>
            <h2>버전 기록</h2>
            <nav className={styles.versions} aria-label="측정 기록 버전">
              {record.versions.map((version) => (
                <Link
                  key={version.version}
                  href={dpsResearchHref({ id: record.id, version: version.version })}
                  aria-current={version.version === record.version ? "page" : undefined}
                >
                  v{version.version} · {DPS_RESEARCH_STATUSES[version.status]}
                  {version.isPublished ? " · 공개 중" : ""}
                </Link>
              ))}
            </nav>
          </section>
        )}
      </article>
    </div>
  );
}
