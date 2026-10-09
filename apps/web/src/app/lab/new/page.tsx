import Link from "next/link";
import { PageHeader } from "@uniz/ui";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { OperationalAccessNotice } from "@/components/live-operations";
import { PlannerEditor } from "@/components/build-planner/editor";
import "../lab.css";

export const metadata = { title: "새 빌드 만들기" };
export default async function NewBuildPage() {
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  if (access.status === "LEFT" || access.status === "REAUTH_REQUIRED")
    return (
      <OperationalAccessNotice
        mode={access.status === "LEFT" ? "LEFT" : "REAUTH"}
        retryHref="/lab/new"
      />
    );
  if (!access.mayCreate && !access.preview)
    return (
      <OperationalAccessNotice mode={access.user ? "PENDING" : "REAUTH"} retryHref="/lab/new" />
    );
  return (
    <div className="planner-detail">
      <PageHeader
        eyebrow="YOUR LOADOUT"
        title="새 빌드 만들기"
        description="직접 확인한 장비를 기록하세요. 모르는 수치는 비워둘 수 있습니다."
        action={
          <Link href="/lab" prefetch={false} className="button button-quiet">
            빌드 목록
          </Link>
        }
      />
      <PlannerEditor preview={access.preview} />
    </div>
  );
}
