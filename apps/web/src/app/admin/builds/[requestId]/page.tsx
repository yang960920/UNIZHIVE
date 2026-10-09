import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import { getBuildShareReview, BuildSharingError } from "@/lib/server/build-sharing";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { LoadoutView } from "@/components/build-planner/presentation";
import { visibilityLabels } from "@/components/build-planner/presentation-labels";
import { shareStatusLabels } from "@/components/build-planner/sharing-labels";
import { ContentBody, VideoReference } from "@/components/content/presentation";
import { BuildReviewForm } from "../review-form";
import "../../../lab/lab.css";
import "../reviews.css";

export const metadata = { title: "빌드 신청 버전 검토 · UNIZ HIVE" };
export default async function BuildReviewPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  await requireAdmin("builds");
  const { requestId } = await params;
  let data;
  try {
    data = await getBuildShareReview(requestId);
  } catch (error) {
    return error instanceof BuildSharingError ? (
      <Card>
        <EmptyState title="공유 검토 권한을 확인해 주세요" description={error.message} />
      </Card>
    ) : (
      <AuthRetryNotice />
    );
  }
  if (!data) notFound();
  return (
    <div className="build-review-page">
      <PageHeader
        eyebrow={`SUBMITTED VERSION · v${data.share.version}`}
        title={data.share.title}
        description={`${data.ownerName} · ${visibilityLabels[data.share.visibility]}`}
        action={
          <Link className="button button-quiet" href="/admin/builds" prefetch={false}>
            신청 목록
          </Link>
        }
      />
      <Badge>{shareStatusLabels[data.share.status]}</Badge>
      <ContentBody document={data.bodyDocument} text={data.share.description} />
      <VideoReference url={data.youtubeUrl} />
      {data.loadout ? (
        <LoadoutView loadout={data.loadout} />
      ) : (
        <Card>
          <EmptyState
            title="읽을 수 없는 이전 형식입니다"
            description="작성자에게 새 버전 저장을 요청해 주세요. 이 구성은 승인할 수 없습니다."
          />
        </Card>
      )}
      {data.notes && <p className="planner-description">버전 메모 · {data.notes}</p>}
      <Card>
        <BuildReviewForm key={data.share.updatedAt} share={data.share} />
        {!["PENDING", "APPROVED"].includes(data.share.status) && (
          <p className="planner-description">
            {data.share.reviewNote || "검토가 끝난 신청입니다."}
          </p>
        )}
      </Card>
    </div>
  );
}
