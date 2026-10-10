import Link from "next/link";
import { Card, PageHeader } from "@uniz/ui";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { OperationalAccessNotice } from "@/components/live-operations";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { listBuildLoadouts } from "@/lib/server/build-loadouts";
import { normalizeBuildQuery } from "@/lib/server/build-planner-query";
import "../lab.css";
import "./loadouts.css";

export const metadata = { title: "내 로드아웃" };
export default async function LoadoutLibraryPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  if (!access.mayCreate && !access.preview)
    return (
      <OperationalAccessNotice
        mode={access.status === "LEFT" ? "LEFT" : access.user ? "PENDING" : "REAUTH"}
        retryHref="/lab/loadouts"
      />
    );
  const params = searchParams ? await searchParams : {};
  const query = normalizeBuildQuery(typeof params.q === "string" ? params.q : undefined);
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const archived = params.archived === "1";
  let page: Awaited<ReturnType<typeof listBuildLoadouts>> = { items: [], nextCursor: null };
  if (!access.preview) {
    try {
      page = await listBuildLoadouts(access.user, { query, cursor, archived });
    } catch {
      return <AuthRetryNotice />;
    }
  }
  const href = (nextCursor?: string | null, archiveView = archived) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (archiveView) next.set("archived", "1");
    if (nextCursor) next.set("cursor", nextCursor);
    return `/lab/loadouts${next.size ? `?${next}` : ""}`;
  };
  return (
    <div className="planner-library loadout-page">
      <PageHeader
        eyebrow="YOUR LOADOUTS"
        title="내 로드아웃"
        description="빌드를 묶고, 공통 방어구와 제작·도핑 재료를 한눈에 확인하세요."
        action={
          <Link href="/lab/loadouts/new" prefetch={false} className="button button-primary">
            새 로드아웃 만들기
          </Link>
        }
      />
      <nav className="planner-library-pager" aria-label="로드아웃 보기">
        <Link href="/lab" prefetch={false}>
          빌드 목록
        </Link>
        <Link
          href={href(null, false)}
          prefetch={false}
          aria-current={!archived ? "page" : undefined}
        >
          내 로드아웃
        </Link>
        <Link href={href(null, true)} prefetch={false} aria-current={archived ? "page" : undefined}>
          보관함
        </Link>
      </nav>
      <form action="/lab/loadouts" method="get" className="planner-library-search">
        {archived && <input name="archived" type="hidden" value="1" />}
        <label htmlFor="loadout-library-query">로드아웃 이름 검색</label>
        <div>
          <input id="loadout-library-query" name="q" maxLength={80} defaultValue={query} />
          <button className="button button-quiet" type="submit">
            검색
          </button>
          {query && (
            <Link href={archived ? "/lab/loadouts?archived=1" : "/lab/loadouts"} prefetch={false}>
              검색 초기화
            </Link>
          )}
        </div>
      </form>
      {access.preview && (
        <p>개발 계정에서는 화면을 미리 볼 수 있습니다. 실제 저장은 승인된 계정으로 진행해주세요.</p>
      )}
      {page.items.length ? (
        <div className="planner-build-grid">
          {page.items.map((loadout) => (
            <Link href={`/lab/loadouts/${loadout.id}`} key={loadout.id} prefetch={false}>
              <Card className="planner-build-card">
                <h2>{loadout.title}</h2>
                <p>
                  {loadout.entryCount}개 빌드 버전{loadout.archivedAt ? " · 보관됨" : ""}
                </p>
                <p>{loadout.notes || "공통 장비와 재료 준비 목록을 확인하세요."}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="planner-library-empty">
          {archived
            ? "보관한 로드아웃이 없습니다."
            : query
              ? "검색 결과가 없습니다."
              : "저장한 빌드 2개 이상을 새 로드아웃으로 묶어보세요."}
        </p>
      )}
      {(cursor || page.nextCursor) && (
        <nav className="planner-library-pager" aria-label="로드아웃 목록 페이지">
          {cursor && (
            <Link href={href()} prefetch={false}>
              처음 보기
            </Link>
          )}
          {page.nextCursor && (
            <Link href={href(page.nextCursor)} prefetch={false}>
              다음 로드아웃 보기 →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
