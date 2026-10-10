import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@uniz/ui";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { LoadoutEditor } from "@/components/build-loadouts/editor";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { getBuildLoadout, listLoadoutBuildChoices } from "@/lib/server/build-loadouts";
import "../../../lab.css";
import "../../loadouts.css";

export const metadata = { title: "로드아웃 편집" };
export default async function EditLoadoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  if (!access.mayCreate || access.preview) notFound();
  let result;
  try {
    result = await Promise.all([
      getBuildLoadout(access.user, id),
      listLoadoutBuildChoices(access.user),
    ]);
  } catch {
    return <AuthRetryNotice />;
  }
  const [loadout, choices] = result;
  if (!loadout?.mayEdit) notFound();
  return (
    <div className="planner-detail loadout-page">
      <PageHeader
        eyebrow="EDIT LOADOUT"
        title="로드아웃 편집"
        description="빌드를 추가·제외하거나 준비 순서를 바꿀 수 있습니다."
        action={
          <Link href={`/lab/loadouts/${id}`} prefetch={false} className="button button-quiet">
            준비 목록
          </Link>
        }
      />
      <LoadoutEditor initial={loadout} choices={choices} />
    </div>
  );
}
