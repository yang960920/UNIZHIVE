import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import {
  BuildSharingError,
  listBuildShareRequests,
  type BuildShareStatus,
} from "@/lib/server/build-sharing";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { shareStatusLabels } from "@/components/build-planner/sharing-labels";
import { visibilityLabels } from "@/components/build-planner/presentation-labels";
import "../../lab/lab.css";
import "./reviews.css";

export const metadata = { title: "빌드 공유 검토 · UNIZ HIVE" };
export default async function BuildReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireAdmin("builds");
  const params = await searchParams;
  const status: BuildShareStatus =
    typeof params.status === "string" && Object.hasOwn(shareStatusLabels, params.status)
      ? (params.status as BuildShareStatus)
      : "PENDING";
  const page =
    typeof params.page === "string" && /^[1-9]\d{0,5}$/.test(params.page) ? Number(params.page) : 1;
  let data;
  try {
    data = await listBuildShareRequests(page, status);
  } catch (error) {
    return error instanceof BuildSharingError ? (
      <Card>
        <EmptyState title="공유 검토 권한을 확인해 주세요" description={error.message} />
      </Card>
    ) : (
      <AuthRetryNotice />
    );
  }
  return (
    <div className="build-review-page">
      <PageHeader
        eyebrow="BUILD APPROVAL"
        title="빌드 공유 검토"
        description="작성자가 신청한 버전만 확인하고 공유 여부와 추천도를 결정하세요."
      />
      <nav className="planner-version-links" aria-label="공유 신청 상태">
        {Object.entries(shareStatusLabels).map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/builds?status=${value}`}
            prefetch={false}
            aria-current={value === status ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {data.items.length ? (
        data.items.map((item) => (
          <Card key={item.id} className="build-review-card">
            <div>
              <Badge>{shareStatusLabels[item.status]}</Badge>{" "}
              <span>
                v{item.version} · {visibilityLabels[item.visibility]}
              </span>
            </div>
            <h2>{item.title}</h2>
            <p className="planner-description">
              {item.ownerName} · {item.description || "본문 없음"}
            </p>
            {item.recommendationScore != null && <p>관리자 추천도 {item.recommendationScore}/5</p>}
            <Link
              className="button button-primary"
              href={`/admin/builds/${item.id}`}
              prefetch={false}
            >
              신청 버전 검토
            </Link>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState
            title={`${shareStatusLabels[status]} 신청이 없습니다`}
            description="공유 신청을 접수하면 이곳에 표시됩니다."
          />
        </Card>
      )}
      <nav className="planner-library-pager" aria-label="공유 신청 페이지">
        {data.page > 1 && (
          <Link href={`/admin/builds?status=${status}&page=${data.page - 1}`} prefetch={false}>
            ← 이전
          </Link>
        )}
        {data.hasNext && (
          <Link href={`/admin/builds?status=${status}&page=${data.page + 1}`} prefetch={false}>
            다음 →
          </Link>
        )}
      </nav>
    </div>
  );
}
