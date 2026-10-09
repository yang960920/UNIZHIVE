import Link from "next/link";
import { Card, PageHeader } from "@uniz/ui";
import { AnnouncementForm } from "@/components/community/forms";
import { CommunityEditorFailure } from "@/components/community/editor-failure";
import { getAnnouncementAdminData } from "@/lib/server/community-repository";
export default async function NewAnnouncement() {
  try {
    await getAnnouncementAdminData();
  } catch (error) {
    return <CommunityEditorFailure error={error} retryHref="/admin/community/notices/new" />;
  }
  return (
    <div className="community-page">
      <PageHeader
        eyebrow="하이브 운영"
        title="새 공지 작성"
        description="하이브 홈과 커뮤니티에 전달할 공지를 작성하세요."
        action={
          <Link href="/admin/community" className="button button-quiet">
            운영진 관리
          </Link>
        }
      />
      <Card className="community-editor">
        <AnnouncementForm />
      </Card>
    </div>
  );
}
