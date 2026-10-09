import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { getBuildDetailData } from "@/lib/server/build-planner";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { OperationalAccessNotice } from "@/components/live-operations";
import { LoadoutView, visibilityLabels } from "@/components/build-planner/presentation";
import {
  BuildOwnerControls,
  CopyBuildVersionLink,
} from "@/components/build-planner/owner-controls";
import "../../lab.css";
import { ContentBody, VideoReference } from "@/components/content/presentation";
import { LikeButton } from "@/components/like-button";

export const metadata = { title: "빌드 버전 기록" };
export default async function BuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string | string[]; before?: string | string[] }>;
}) {
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  const { id } = await params;
  if (access.status === "LEFT" || access.status === "REAUTH_REQUIRED")
    return (
      <OperationalAccessNotice
        mode={access.status === "LEFT" ? "LEFT" : "REAUTH"}
        retryHref={`/lab/b/${id}`}
      />
    );
  if (!z.uuid().safeParse(id).success) notFound();
  const { version, before } = await searchParams;
  if (
    version !== undefined &&
    (typeof version !== "string" ||
      !/^[1-9]\d{0,9}$/.test(version) ||
      Number(version) > 2_147_483_647)
  )
    notFound();
  if (
    before !== undefined &&
    (typeof before !== "string" || !/^[1-9]\d{0,9}$/.test(before) || Number(before) > 2_147_483_647)
  )
    notFound();
  let build;
  try {
    build = before
      ? await getBuildDetailData(
          access.user,
          id,
          version ? Number(version) : undefined,
          Number(before),
        )
      : await getBuildDetailData(access.user, id, version ? Number(version) : undefined);
  } catch {
    return <AuthRetryNotice />;
  }
  if (!build) notFound();
  const selected = build.selectedVersion;
  return (
    <div className="planner-detail">
      <PageHeader
        eyebrow={`BUILD VERSION · v${selected.version}`}
        title={build.title}
        description={`${build.owner.name} · ${selected.approvedVisibility ? visibilityLabels[selected.approvedVisibility] : "나만 보기 · 미승인 버전"}${build.archivedAt ? " · 보관됨" : ""}`}
        action={
          <Link href="/lab" className="button button-quiet" prefetch={false}>
            빌드 목록
          </Link>
        }
      />
      <ContentBody document={selected.bodyDocument ?? null} text={build.description} />
      <VideoReference url={selected.youtubeUrl ?? null} />
      {build.recommendationScore != null && (
        <Card>
          <h2>관리자 추천도 · {build.recommendationScore}/5</h2>
          {build.recommendationNote && (
            <p className="planner-description">{build.recommendationNote}</p>
          )}
          <p className="planner-description">현재 보고 있는 승인 버전에 대한 관리자 평가입니다.</p>
        </Card>
      )}
      <div className="planner-detail-actions">
        <Badge tone="primary">v{selected.version}</Badge>
        {build.mayEdit && selected.loadout && (
          <Link
            href={`/lab/b/${id}/edit?from=${selected.version}`}
            prefetch={false}
            className="button button-primary"
          >
            이 버전을 바탕으로 수정
          </Link>
        )}
        <CopyBuildVersionLink buildId={id} version={selected.version} />
        <LikeButton
          kind="BUILD"
          targetId={id}
          initialCount={build.likeCount ?? 0}
          initialLiked={build.likedByMe ?? false}
          canLike={build.canLike ?? false}
        />
      </div>
      {selected.loadout ? (
        <LoadoutView loadout={selected.loadout} />
      ) : (
        <Card>
          <EmptyState
            title="이전 형식의 빌드 기록입니다"
            description="원본 버전은 보존되어 있습니다. 현재 편집 화면으로 읽을 수 없는 구성이므로 새 빌드에서 기록해주세요."
          />
        </Card>
      )}
      <Card>
        <div className="planner-detail-heading">
          <h2>버전 기록</h2>
          <span className="mono">LATEST v{build.latestVersion}</span>
        </div>
        <p className="planner-description">
          이전 버전의 장비 구성은 바뀌지 않습니다. 원하는 버전을 열어 확인하세요.
        </p>
        <nav className="planner-version-links" aria-label="빌드 버전 선택">
          {build.versions.map((item) => (
            <Link
              key={item.id}
              href={`/lab/b/${id}?version=${item.version}`}
              prefetch={false}
              aria-current={selected.version === item.version ? "page" : undefined}
            >
              v{item.version}
            </Link>
          ))}
        </nav>
        <nav className="planner-library-pager" aria-label="버전 목록 페이지">
          {before && (
            <Link href={`/lab/b/${id}?version=${selected.version}`} prefetch={false}>
              최신 버전 목록
            </Link>
          )}
          {build.versionsNext && (
            <Link
              href={`/lab/b/${id}?version=${selected.version}&before=${build.versionsNext}`}
              prefetch={false}
            >
              이전 버전 더 보기 →
            </Link>
          )}
        </nav>
        {selected.notes && <p className="planner-description">{selected.notes}</p>}
        <p className="planner-description">
          저장일{" "}
          {new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(selected.createdAt))}{" "}
          KST
        </p>
      </Card>
      {build.isOwner && access.mayCreate && (
        <BuildOwnerControls
          key={build.updatedAt}
          build={{
            id: build.id,
            updatedAt: build.updatedAt,
            visibility: build.visibility,
            archivedAt: build.archivedAt,
            sharing: build.sharing,
          }}
        />
      )}
    </div>
  );
}
