import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, PageHeader } from "@uniz/ui";
import { AnnouncementForm } from "@/components/community/forms";
import {
  CommunityAccessNotice,
  CommunityReadFailure,
  AnnouncementView,
} from "@/components/community/views";
import { getAnnouncement } from "@/lib/server/community-repository";
export default async function EditAnnouncement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await getAnnouncement(id);
  if (result.mode !== "LIVE")
    return (
      <CommunityAccessNotice
        mode={result.mode}
        retryAfterSeconds={result.retryAfterSeconds}
        retryHref={`/admin/community/notices/${id}/edit`}
      />
    );
  if (!result.data) notFound();
  if (!result.data.canManage)
    return <CommunityReadFailure message="공지 관리 권한이 필요합니다." />;
  if (result.data.archivedAt) return <AnnouncementView announcement={result.data} />;
  return (
    <div className="community-page">
      <PageHeader
        eyebrow="하이브 운영"
        title="공지 수정"
        description="공지 내용을 수정하고 상단 고정 여부를 정합니다."
        action={
          <Link href="/admin/community" className="button button-quiet">
            운영진 관리
          </Link>
        }
      />
      <Card className="community-editor">
        <AnnouncementForm initial={result.data} />
      </Card>
    </div>
  );
}
