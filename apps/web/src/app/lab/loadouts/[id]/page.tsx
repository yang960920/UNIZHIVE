import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@uniz/ui";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { LoadoutArchiveControl } from "@/components/build-loadouts/controls";
import { LoadoutPreparation } from "@/components/build-loadouts/preparation";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { getBuildLoadout } from "@/lib/server/build-loadouts";
import "../../lab.css";
import "../loadouts.css";

export const metadata = { title: "로드아웃 준비 목록" };
export default async function LoadoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  if (!access.mayCreate || access.preview) notFound();
  let loadout;
  try {
    loadout = await getBuildLoadout(access.user, id);
  } catch {
    return <AuthRetryNotice />;
  }
  if (!loadout) notFound();
  return (
    <div className="planner-detail loadout-page">
      <PageHeader
        eyebrow={loadout.archivedAt ? "ARCHIVED LOADOUT" : "YOUR LOADOUT"}
        title={loadout.title}
        description={loadout.notes || "내 빌드의 장비와 도핑 준비 목록입니다."}
        action={
          <Link href="/lab/loadouts" prefetch={false} className="button button-quiet">
            로드아웃 목록
          </Link>
        }
      />
      <div className="loadout-heading">
        {loadout.mayEdit && (
          <Link
            href={`/lab/loadouts/${id}/edit`}
            prefetch={false}
            className="button button-primary"
          >
            구성 편집
          </Link>
        )}
        {(loadout.mayEdit || loadout.mayRestore) && (
          <LoadoutArchiveControl
            key={loadout.updatedAt}
            id={id}
            updatedAt={loadout.updatedAt}
            archived={Boolean(loadout.archivedAt)}
          />
        )}
      </div>
      {loadout.archivedAt && (
        <p>보관한 로드아웃입니다. 구성과 준비 목록은 유지되며 복원 후 편집할 수 있습니다.</p>
      )}
      <section>
        <h2>묶은 빌드 · 고정 버전</h2>
        <ol>
          {loadout.entries.map((entry) => (
            <li key={entry.buildVersionId}>
              <Link href={`/lab/b/${entry.buildId}?version=${entry.version}`} prefetch={false}>
                {entry.title} · v{entry.version}
                {entry.archived ? " · 보관된 빌드" : ""}
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <LoadoutPreparation value={loadout.preparation} text={loadout.preparationText} />
    </div>
  );
}
