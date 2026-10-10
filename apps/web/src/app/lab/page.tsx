import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { getBuildLibraryData } from "@/lib/server/build-planner";
import type { PlannerBuildLibrary, PlannerBuildSummary } from "@/lib/data/build-planner-types";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { OperationalAccessNotice } from "@/components/live-operations";
import { visibilityLabels } from "@/components/build-planner/presentation";
import { normalizeBuildQuery } from "@/lib/server/build-planner-query";
import "./lab.css";

export const metadata = { title: "빌드 플래너" };

function BuildList({
  title,
  items,
  empty,
  nextHref,
  firstHref,
}: {
  title: string;
  items: PlannerBuildSummary[];
  empty: string;
  nextHref?: string;
  firstHref?: string;
}) {
  return (
    <section>
      <div className="planner-library-heading">
        <h2>
          {title}
          <span className="planner-library-count">{items.length}</span>
        </h2>
      </div>
      {items.length ? (
        <div className="planner-build-grid">
          {items.map((build) => (
            <Link
              key={build.id}
              href={`/lab/b/${build.id}${build.publishedVersion ? `?version=${build.publishedVersion}` : ""}`}
              prefetch={false}
            >
              <Card className="planner-build-card">
                <div className="planner-build-top">
                  <Badge>
                    {build.archivedAt
                      ? "보관됨"
                      : !build.publishedVersion && build.isOwner
                        ? build.sharing?.latestRequest?.status === "PENDING"
                          ? "공유 승인 대기"
                          : build.sharing?.published
                            ? `공유 중 · v${build.sharing.published.version}`
                            : "나만 보기"
                        : visibilityLabels[build.visibility]}
                  </Badge>
                  <span className="mono">v{build.latestVersion}</span>
                </div>
                <h3>{build.title}</h3>
                <p>{build.description || "장비 구성을 열어 확인하세요."}</p>
                {build.recommendationScore != null && (
                  <p className="planner-recommendation">
                    관리자 추천도 {build.recommendationScore}/5
                  </p>
                )}
                <div className="planner-build-bottom">
                  <span>{build.owner.name}</span>
                  <span>
                    {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(
                      new Date(build.updatedAt),
                    )}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="planner-library-empty">
          <p>{empty}</p>
        </div>
      )}
      {(nextHref || firstHref) && (
        <nav className="planner-library-pager" aria-label={`${title} 페이지`}>
          {firstHref && (
            <Link href={firstHref} prefetch={false}>
              처음 보기
            </Link>
          )}
          {nextHref && (
            <Link href={nextHref} prefetch={false}>
              다음 빌드 보기 →
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

export default async function BuildLabPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  if (access.status === "LEFT" || access.status === "REAUTH_REQUIRED")
    return (
      <OperationalAccessNotice
        mode={access.status === "LEFT" ? "LEFT" : "REAUTH"}
        retryHref="/lab"
      />
    );
  let library: PlannerBuildLibrary = { owned: [], hive: [], public: [] };
  const params = searchParams ? await searchParams : {};
  const scalar = (name: string) =>
    typeof params[name] === "string" ? (params[name] as string) : undefined;
  const query = normalizeBuildQuery(scalar("q"));
  const archived = params.archived === "1";
  const cursors = {
    owned: scalar("ownedCursor"),
    hive: scalar("hiveCursor"),
    public: scalar("publicCursor"),
  };
  const href = (group: keyof typeof cursors, cursor?: string | null, archiveView = archived) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (archiveView) next.set("archived", "1");
    for (const key of ["owned", "hive", "public"] as const) {
      const token = key === group ? cursor : cursors[key];
      if (token) next.set(`${key}Cursor`, token);
    }
    return `/lab${next.size ? `?${next}` : ""}`;
  };
  if (!access.preview) {
    try {
      library = await getBuildLibraryData(access.user, {
        query,
        archived,
        ownedCursor: cursors.owned,
        hiveCursor: cursors.hive,
        publicCursor: cursors.public,
      });
    } catch {
      return <AuthRetryNotice />;
    }
  }
  return (
    <div className="planner-library">
      <PageHeader
        eyebrow="UNIZ BUILD LAB"
        title="빌드 플래너"
        description="장비 구성을 기록하고, 버전마다 달라진 선택을 남겨보세요."
        action={
          access.mayCreate || access.preview ? (
            <Link className="button button-primary" href="/lab/new" prefetch={false}>
              <Plus size={16} />새 빌드 만들기
            </Link>
          ) : (
            <Link
              className="button button-quiet"
              href={access.user ? "/onboarding" : "/login?callbackUrl=/lab/new"}
              prefetch={false}
            >
              {access.user ? "프로필·가입 상태 확인" : "로그인하고 빌드 만들기"}
            </Link>
          )
        }
      />
      <form action="/lab" method="get" className="planner-library-search">
        {archived && <input type="hidden" name="archived" value="1" />}
        <label htmlFor="build-search">빌드 이름·추천 콘텐츠·태그 검색</label>
        <div>
          <input
            id="build-search"
            name="q"
            defaultValue={query}
            maxLength={80}
            placeholder="예: 보스, 초보 추천, #지원"
          />
          <button className="button button-primary" type="submit">
            검색
          </button>
          {query && (
            <Link
              href={archived ? "/lab?archived=1" : "/lab"}
              className="button button-quiet"
              prefetch={false}
            >
              검색 초기화
            </Link>
          )}
        </div>
      </form>
      {access.preview && (
        <p className="planner-preview-note">
          개발 계정에서는 입력 화면을 미리 볼 수 있습니다. 실제 빌드 저장은 승인된 Discord 계정으로
          진행해주세요.
        </p>
      )}
      {access.user && !access.preview && !access.mayCreate && (
        <p className="planner-preview-note">
          프로필 등록과 운영진 승인이 완료되면 내 빌드를 저장할 수 있습니다.
        </p>
      )}
      {(access.mayCreate || access.preview) && (
        <div className="planner-library">
          <nav className="planner-library-pager" aria-label="내 빌드 보기">
            <Link href="/lab/loadouts" className="button button-quiet" prefetch={false}>
              내 로드아웃 · 공통 장비와 재료
            </Link>
            <Link
              href={href("owned", undefined, false)}
              className="button button-quiet"
              aria-current={!archived ? "page" : undefined}
              prefetch={false}
            >
              내 빌드
            </Link>
            <Link
              href={href("owned", undefined, true)}
              className="button button-quiet"
              aria-current={archived ? "page" : undefined}
              prefetch={false}
            >
              보관함
            </Link>
          </nav>
          {archived && (
            <p className="planner-preview-note">
              보관한 빌드의 기록을 확인하고, 상세 화면에서 보관을 해제할 수 있습니다.
            </p>
          )}
          <BuildList
            title={archived ? "보관한 빌드" : "내 빌드"}
            items={library.owned}
            empty={
              archived
                ? query
                  ? "검색한 보관 빌드가 없습니다."
                  : "보관한 빌드가 없습니다."
                : "아직 저장한 빌드가 없습니다. 새 빌드에서 현재 장비를 기록해보세요."
            }
            nextHref={
              library.nextCursors?.owned ? href("owned", library.nextCursors.owned) : undefined
            }
            firstHref={cursors.owned ? href("owned") : undefined}
          />
        </div>
      )}
      {access.mayCreate && (
        <BuildList
          title="하이브 공유"
          items={library.hive}
          empty="하이브에 공유된 빌드가 없습니다."
          nextHref={library.nextCursors?.hive ? href("hive", library.nextCursors.hive) : undefined}
          firstHref={cursors.hive ? href("hive") : undefined}
        />
      )}
      <BuildList
        title="공개 빌드"
        items={library.public}
        empty={query ? "검색한 공개 빌드가 없습니다." : "아직 공개된 빌드가 없습니다."}
        nextHref={
          library.nextCursors?.public ? href("public", library.nextCursors.public) : undefined
        }
        firstHref={cursors.public ? href("public") : undefined}
      />
    </div>
  );
}
