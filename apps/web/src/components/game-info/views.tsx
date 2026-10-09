import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ClipboardList, FlaskConical, Search } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import {
  GAME_INFO_CATEGORIES,
  gameInfoHref,
  type GameInfoCategory,
  type GameInfoRecord,
} from "@/lib/game-info-examples";
import { searchMatches } from "@/lib/unified-search";
import type { DpsDirectory } from "@/lib/dps-research";
import { DpsEntryLinks, DpsPublicList } from "./live-views";
import styles from "./game-info.module.css";

const number = (value: number) => value.toLocaleString("ko-KR");

function ExampleNotice() {
  return (
    <div className={styles.exampleNotice}>
      <FlaskConical size={20} aria-hidden="true" />
      <div>
        <strong>화면 예시 · 실제 게임 수치 아님</strong>
        <p>
          자료가 올라올 형식을 확인하는 예시입니다. 수치·장비·조건은 가상이며 검증된 기록이
          아닙니다.
        </p>
      </div>
    </div>
  );
}

function MeasurementSummary({ record }: { record: GameInfoRecord }) {
  const measurement = record.measurement;
  if (!measurement) return null;
  return (
    <dl className={styles.measurementSummary} aria-label="가상 측정 요약">
      <div>
        <dt>대표 DPS · 가상 값</dt>
        <dd className="mono">{number(measurement.displayedDps)}</dd>
      </div>
      <div>
        <dt>측정 시간 · 예시</dt>
        <dd>
          {measurement.durationSeconds}
          <small>초</small>
        </dd>
      </div>
      <div>
        <dt>반복 횟수 · 예시</dt>
        <dd>
          {measurement.trials.length}
          <small>회</small>
        </dd>
      </div>
    </dl>
  );
}

export function GameInfoDirectory({
  records,
  q = "",
  category = null,
  research,
  canCreate = false,
  canReview = false,
  notice,
}: {
  records: readonly GameInfoRecord[];
  q?: string;
  category?: GameInfoCategory | null;
  research?: DpsDirectory;
  canCreate?: boolean;
  canReview?: boolean;
  notice?: string;
}) {
  const filtered = records.filter(
    (record) =>
      (!category || record.category === category) &&
      (!q ||
        searchMatches(
          q,
          record.title,
          record.summary,
          ...record.tags,
          ...record.conditions.flatMap((condition) => [condition.label, condition.value]),
          ...record.findings,
          ...record.procedure,
          ...record.evidence.flatMap((evidence) => [evidence.label, evidence.description]),
        )),
  );
  function filterHref(selected: GameInfoCategory | null) {
    const params = new URLSearchParams();
    if (selected) params.set("category", selected);
    if (q) params.set("q", q);
    return `/db${params.size ? `?${params}` : ""}`;
  }
  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="GAME RESEARCH"
        title="게임 정보"
        description="DPS와 효과를 기록하고, 조건과 근거를 함께 확인하는 공간입니다."
      />
      <DpsEntryLinks canCreate={canCreate} canReview={canReview} />
      {notice && (
        <p className={styles.stateNotice} role="status">
          {notice}
        </p>
      )}
      <nav className={styles.categories} aria-label="게임 정보 분류">
        <Link href={filterHref(null)} aria-current={!category ? "page" : undefined}>
          전체
        </Link>
        {Object.entries(GAME_INFO_CATEGORIES).map(([key, label]) => (
          <Link
            key={key}
            href={filterHref(key as GameInfoCategory)}
            aria-current={category === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action="/db" method="get" className={styles.search}>
        {category && <input type="hidden" name="category" value={category} />}
        <label className="sr-only" htmlFor="game-info-query">
          게임 정보 검색
        </label>
        <Search size={17} aria-hidden="true" />
        <input
          id="game-info-query"
          name="q"
          defaultValue={q}
          maxLength={80}
          placeholder="제목, 측정 조건, 태그 검색"
        />
        <button className="button button-secondary" type="submit">
          검색
        </button>
        {q && (
          <Link
            className="button button-quiet"
            href={category ? `/db?category=${category}` : "/db"}
          >
            초기화
          </Link>
        )}
      </form>
      <div className={styles.directoryLayout}>
        <div className={styles.records}>
          {research && (!category || category === "dps") && (
            <DpsPublicList data={research} q={q} category={category} />
          )}
          {filtered.length > 0 && (!research || research.page === 1) && (
            <section className={styles.records} aria-label="작성 형식 예시">
              <h2 className={styles.listTitle}>작성 형식 예시 · {filtered.length}개</h2>
              <ExampleNotice />
              {filtered.map((record) => (
                <Card key={record.slug} className={styles.recordCard}>
                  <div className={styles.badges}>
                    <Badge>{GAME_INFO_CATEGORIES[record.category]}</Badge>
                    <Badge tone="warning">화면 예시</Badge>
                  </div>
                  <h2>
                    <Link href={gameInfoHref(record)}>{record.title}</Link>
                  </h2>
                  <p>{record.summary}</p>
                  <MeasurementSummary record={record} />
                  <div className={styles.tags}>
                    {record.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <footer>
                    <span>예시 작성자 · 검증 전</span>
                    <Link className="button button-secondary" href={gameInfoHref(record)}>
                      기록 자세히 보기 <ArrowUpRight size={15} />
                    </Link>
                  </footer>
                </Card>
              ))}
            </section>
          )}
          {!filtered.length && (!research || (category && category !== "dps")) && (
            <Card>
              <EmptyState
                title={q ? "검색 결과가 없습니다" : "등록된 자료가 없습니다"}
                description={
                  q
                    ? "다른 검색어로 찾거나 검색을 초기화해 주세요."
                    : "측정 조건과 근거를 갖춘 자료가 등록되면 여기에 표시됩니다."
                }
              />
            </Card>
          )}
        </div>
        <aside className={styles.readingGuide}>
          <ClipboardList size={21} aria-hidden="true" />
          <h2>숫자와 함께 볼 것</h2>
          <ol>
            <li>
              <strong>같은 측정 조건인가요?</strong>
              <p>패치, 빌드 버전, 대상, 시간과 버프를 확인합니다.</p>
            </li>
            <li>
              <strong>반복 결과와 근거가 있나요?</strong>
              <p>개별 결과와 원본 영상·스크린샷을 함께 봅니다.</p>
            </li>
            <li>
              <strong>어디까지 검토됐나요?</strong>
              <p>검토 전 자료와 확인된 자료를 구분합니다.</p>
            </li>
          </ol>
          <Link className="button button-quiet" href="/lab">
            빌드 연구실 <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
    </div>
  );
}

export function GameInfoDetail({ record }: { record: GameInfoRecord }) {
  return (
    <div className={`${styles.root} ${styles.detail}`}>
      <Link href={`/db?category=${record.category}`} className={styles.back}>
        <ArrowLeft size={15} />
        게임 정보 목록
      </Link>
      <PageHeader
        eyebrow={GAME_INFO_CATEGORIES[record.category]}
        title={record.title}
        description={record.summary}
      />
      <ExampleNotice />
      <article className={styles.article}>
        <div className={styles.recordMeta}>
          <span>
            {record.author} · {record.revision}
          </span>
          <Badge tone="warning">검증 전 · 예시</Badge>
        </div>
        <MeasurementSummary record={record} />
        <section className={styles.section}>
          <h2>측정 조건</h2>
          <dl className={styles.conditions}>
            {record.conditions.map((condition) => (
              <div key={condition.label}>
                <dt>{condition.label}</dt>
                <dd>{condition.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {record.measurement && (
          <section className={styles.section}>
            <h2>반복 측정 결과</h2>
            <div className={styles.tableScroll}>
              <table>
                <caption>모든 DPS는 화면 확인을 위한 가상 값입니다.</caption>
                <thead>
                  <tr>
                    <th scope="col">측정</th>
                    <th scope="col">DPS · 가상 값</th>
                    <th scope="col">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {record.measurement.trials.map((trial) => (
                    <tr key={trial.label}>
                      <th scope="row">{trial.label}</th>
                      <td className="mono">{number(trial.dps)}</td>
                      <td>{trial.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className={styles.section}>
          <h2>기록 해석</h2>
          <ul>
            {record.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </section>
        <section className={styles.section}>
          <h2>재현 절차</h2>
          <ol>
            {record.procedure.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <section className={styles.section}>
          <h2>원본 근거</h2>
          <div className={styles.evidence}>
            {record.evidence.map((evidence) => (
              <div key={evidence.label}>
                <h3>{evidence.label}</h3>
                <p>{evidence.description}</p>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.section}>
          <h2>검토 상태</h2>
          <p>{record.review}</p>
          <p className={styles.note}>
            실제 자료에는 검토자, 확인일과 수정 이력을 함께 남기는 형식입니다.
          </p>
        </section>
      </article>
    </div>
  );
}

export function GameInfoAdminPreview({ records }: { records: readonly GameInfoRecord[] }) {
  return (
    <div className={styles.root}>
      <PageHeader
        eyebrow="GAME DATA REVIEW"
        title="게임 데이터 검증"
        description="연구 자료의 조건·근거·검토 상태가 어떻게 보일지 확인하는 미리보기입니다."
      />
      {records.length > 0 && <ExampleNotice />}
      <Card className={styles.adminIntro}>
        <h2>등록과 검토의 흐름</h2>
        <ol>
          <li>측정 조건과 빌드 버전 기록</li>
          <li>반복 결과와 원본 근거 첨부</li>
          <li>관리자 검토와 변경 이력 기록</li>
        </ol>
        <p>
          현재는 예시 조회까지 제공하며, 실제 자료 등록·검증 승인·게시 기능은 운영 기준을 정한 후
          연결합니다.
        </p>
      </Card>
      <section className={styles.records} aria-label="검토 자료 미리보기">
        {records.map((record) => (
          <Card className={styles.adminRecord} key={record.slug}>
            <div>
              <Badge tone="warning">예시 · 검증 전</Badge>
              <h2>{record.title}</h2>
              <p>원본 근거 미등록 · 독립 검토 미진행</p>
            </div>
            <Link className="button button-secondary" href={gameInfoHref(record)}>
              자료 형식 확인 <ArrowUpRight size={15} />
            </Link>
          </Card>
        ))}
        {!records.length && (
          <Card>
            <EmptyState
              title="표시할 자료가 없습니다"
              description="현재 예시가 숨겨져 있습니다. 실제 자료 등록 기능은 준비 중입니다."
            />
          </Card>
        )}
      </section>
      <Link href="/db" className="button button-secondary">
        게임 정보 보기 <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}
