import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { OperationalAccessNotice } from "@/components/live-operations";
import { getOwnSeasonRequest, SeasonParticipationError } from "@/lib/server/season-participation";
import { getCurrentAuthState } from "@/lib/auth";
import { SeasonSetupForm } from "../../../admin/seasons/forms";
import { saveMemberSeason } from "../../actions";
import "../../../admin/administration.css";

export const metadata: Metadata = { title: "시즌 신청 수정" };

export default async function SeasonRequestPage({ params }: { params: Promise<{ id: string }> }) {
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
        retryHref={`/season/requests/${id}`}
      />
    );
  let request;
  try {
    request = await getOwnSeasonRequest(id);
  } catch (error) {
    return (
      <OperationalAccessNotice
        mode={
          error instanceof SeasonParticipationError && error.code === "FORBIDDEN"
            ? "PENDING"
            : "ERROR"
        }
        season
        retryHref={`/season/requests/${id}`}
        retryAfterSeconds={authorization.retryAfterSeconds}
      />
    );
  }
  if (!request) notFound();
  const rejected = request.season.approvalStatus === "REJECTED";
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow="MY SEASON REQUEST"
        title="시즌 신청 수정"
        description={
          rejected
            ? "반려된 신청을 수정해 다시 제출할 수 있습니다."
            : "승인 대기 중인 시즌 정보를 수정할 수 있습니다."
        }
        action={
          <Link prefetch={false} className="button button-quiet" href="/season">
            시즌 목록
          </Link>
        }
      />
      <Badge tone={rejected ? "danger" : "warning"}>{rejected ? "반려" : "승인 대기"}</Badge>
      <Card>
        <SeasonSetupForm
          key={request.season.updatedAt}
          action={saveMemberSeason}
          submitLabel={rejected ? "수정 후 다시 신청" : "신청 수정"}
          initial={request.selection}
          season={request.season}
          request
        />
      </Card>
    </div>
  );
}
