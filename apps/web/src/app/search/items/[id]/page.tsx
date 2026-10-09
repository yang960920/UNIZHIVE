import Link from "next/link";
import { notFound } from "next/navigation";
import { GEAR_CATALOG } from "@uniz/build-engine";
import { PageHeader } from "@uniz/ui";
import { getFarmingMapLink } from "@/lib/map-farming";
import "@/components/unified-search.css";

export const metadata = { title: "검색한 게임 장비" };
export default async function SearchItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = GEAR_CATALOG.find((entry) => entry.id === id && !entry.legacyOnly);
  if (!item) notFound();
  const farming =
    item.kind === "DEVIANT" ? getFarmingMapLink({ kind: "deviant", id: item.id }) : null;
  return (
    <>
      <PageHeader
        eyebrow="GAME REFERENCE"
        title={item.displayName ?? item.name}
        description="빌드 연구실에서 사용하는 게임 장비 정보입니다."
      />
      <article className="unified-search-item-detail">
        <p>{item.description || "이 장비의 상세 설명은 아직 등록되지 않았습니다."}</p>
        {item.aliases.filter((name) => name !== (item.displayName ?? item.name)).length > 0 && (
          <p>
            다른 이름 ·{" "}
            {item.aliases.filter((name) => name !== (item.displayName ?? item.name)).join(" · ")}
          </p>
        )}
        <p>확인일 · {item.source.verifiedAt}</p>
        <nav>
          {farming && (
            <Link className="button button-secondary" href={farming.href}>
              {farming.label}
            </Link>
          )}
          <Link className="button button-secondary" href="/lab">
            빌드 연구실
          </Link>
          {item.source.url && (
            <a
              className="button button-secondary"
              href={item.source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              자료 출처 ↗
            </a>
          )}
        </nav>
      </article>
    </>
  );
}
