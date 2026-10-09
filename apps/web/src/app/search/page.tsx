import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@uniz/ui";
import { getUnifiedSearch } from "@/lib/server/unified-search";
import { SEARCH_CATEGORIES, searchHref, type SearchCategory } from "@/lib/unified-search";
import "@/components/unified-search.css";

export const metadata = { title: "통합 검색" };
export const dynamic = "force-dynamic";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const data = await getUnifiedSearch(params);
  const groups = data.groups.filter((group) => group.items.length);
  return (
    <>
      <PageHeader
        eyebrow="FIND TOGETHER"
        title="통합 검색"
        description="하이브의 글과 빌드부터 게임 장비·파밍 정보까지 한곳에서 찾아보세요."
      />
      <form action="/search" className="unified-search-page-form">
        <label>
          검색어
          <input
            name="q"
            defaultValue={data.q}
            placeholder="포식자, 닥터 테디, 무한의 꿈…"
            maxLength={80}
          />
        </label>
        {data.category && <input type="hidden" name="category" value={data.category} />}
        <button className="button button-primary" type="submit">
          검색
        </button>
      </form>
      <nav className="unified-search-tabs" aria-label="검색 분류">
        <Link href={searchHref(data.q)} aria-current={!data.category ? "page" : undefined}>
          전체
        </Link>
        {(Object.entries(SEARCH_CATEGORIES) as [SearchCategory, string][])
          .filter(
            ([key]) => key !== "member" || data.groups.some((group) => group.category === "member"),
          )
          .map(([key, label]) => (
            <Link
              key={key}
              href={searchHref(data.q, key)}
              aria-current={data.category === key ? "page" : undefined}
              prefetch={false}
            >
              {label}
            </Link>
          ))}
      </nav>
      {data.notice && <p className="unified-search-notice">{data.notice}</p>}
      <div className="unified-search-page-groups">
        {groups.map((group) => (
          <section className="unified-search-page-group" key={group.category}>
            <header>
              <h2>{SEARCH_CATEGORIES[group.category]}</h2>
              {!data.category && group.hasMore && (
                <Link href={searchHref(data.q, group.category)}>더 보기 →</Link>
              )}
            </header>
            <div className="unified-search-page-results">
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                >
                  <span className="unified-search-item-text">
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                    <span>{item.excerpt}</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      {!groups.length && (
        <p className="muted">
          {data.q
            ? "검색 결과가 없습니다. 다른 이름이나 짧은 검색어로 찾아보세요."
            : "검색어를 입력해 주세요."}
        </p>
      )}
      {data.category && (
        <nav className="unified-search-pagination" aria-label="검색 결과 페이지">
          {data.page > 1 ? (
            <Link href={searchHref(data.q, data.category, data.page - 1)}>← 이전</Link>
          ) : (
            <span />
          )}
          <span>{data.page}페이지</span>
          {data.page < 50 && data.groups.some((group) => group.hasMore) ? (
            <Link href={searchHref(data.q, data.category, data.page + 1)}>다음 →</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
