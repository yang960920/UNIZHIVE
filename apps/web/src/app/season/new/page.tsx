import Link from "next/link";
import type { Metadata } from "next";
import { Card, PageHeader } from "@uniz/ui";
import { OperationalAccessNotice } from "@/components/live-operations";
import { getSeasonMember, SeasonParticipationError } from "@/lib/server/season-participation";
import { getCurrentAuthState } from "@/lib/auth";
import { SeasonSetupForm } from "../../admin/seasons/forms";
import { saveMemberSeason } from "../actions";
import "../../admin/administration.css";

export const metadata: Metadata = { title: "시즌 등록 신청" };

export default async function NewMemberSeasonPage() {
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
        retryHref="/season/new"
      />
    );
  let actor;
  try {
    actor = await getSeasonMember();
  } catch (error) {
    return (
      <OperationalAccessNotice
        mode={
          error instanceof SeasonParticipationError && error.code === "FORBIDDEN"
            ? "PENDING"
            : "ERROR"
        }
        season
        retryHref="/season/new"
        retryAfterSeconds={authorization.retryAfterSeconds}
      />
    );
  }
  const request = actor.role === "MEMBER";
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow="HIVE SEASON"
        title={request ? "시즌 등록 신청" : "새 시즌 만들기"}
        description={
          request
            ? "시즌 정보를 입력하면 관리자 승인 후 멤버들이 참여할 수 있습니다."
            : "시즌을 만들면 멤버들이 바로 참여할 수 있습니다."
        }
        action={
          <Link prefetch={false} className="button button-quiet" href="/season">
            시즌 목록
          </Link>
        }
      />
      <Card>
        <SeasonSetupForm
          action={saveMemberSeason}
          submitLabel={request ? "시즌 등록 신청" : "시즌 만들기"}
          request={request}
        />
      </Card>
    </div>
  );
}
