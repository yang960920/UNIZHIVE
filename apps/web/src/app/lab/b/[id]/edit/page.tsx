import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@uniz/ui";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { getBuildDetailData } from "@/lib/server/build-planner";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { OperationalAccessNotice } from "@/components/live-operations";
import { PlannerEditor } from "@/components/build-planner/editor";
import "../../../lab.css";

export const metadata = { title: "빌드 수정" };
export default async function EditBuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  const { id } = await params;
  if (access.status === "LEFT" || access.status === "REAUTH_REQUIRED")
    return (
      <OperationalAccessNotice
        mode={access.status === "LEFT" ? "LEFT" : "REAUTH"}
        retryHref={`/lab/b/${id}/edit`}
      />
    );
  if (!access.mayCreate)
    return (
      <OperationalAccessNotice
        mode={access.user ? "PENDING" : "REAUTH"}
        retryHref={`/lab/b/${id}/edit`}
      />
    );
  if (!z.uuid().safeParse(id).success) notFound();
  const { from } = await searchParams;
  if (
    from !== undefined &&
    (typeof from !== "string" || !/^[1-9]\d{0,9}$/.test(from) || Number(from) > 2_147_483_647)
  )
    notFound();
  let build;
  try {
    build = await getBuildDetailData(access.user, id, from ? Number(from) : undefined);
  } catch {
    return <AuthRetryNotice />;
  }
  if (!build || !build.mayEdit || !build.selectedVersion.loadout) notFound();
  return (
    <div className="planner-detail">
      <PageHeader
        eyebrow={`BASED ON v${build.selectedVersion.version}`}
        title="빌드 수정"
        description="저장하면 새 버전이 추가됩니다. 기존 버전은 그대로 남습니다."
        action={
          <Link
            href={`/lab/b/${id}?version=${build.selectedVersion.version}`}
            prefetch={false}
            className="button button-quiet"
          >
            빌드로 돌아가기
          </Link>
        }
      />
      <PlannerEditor initial={build} />
    </div>
  );
}
