import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, PageHeader } from "@uniz/ui";
import { CommunityPostForm } from "@/components/community/forms";
import { CommunityEditorFailure } from "@/components/community/editor-failure";
import {
  communityHref,
  communityPostHref,
  communityReturnFilters,
} from "@/components/community/presentation";
import { getCommunityEditorData } from "@/lib/server/community-repository";
export default async function EditCommunityPost({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const filters = communityReturnFilters(query);
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try {
    data = await getCommunityEditorData(id);
  } catch (error) {
    return (
      <CommunityEditorFailure
        error={error}
        retryHref={communityPostHref(id, filters).replace(
          `/community/${id}`,
          `/community/${id}/edit`,
        )}
        returnHref={communityHref(filters)}
      />
    );
  }
  return (
    <div className="community-page">
      <PageHeader
        eyebrow="하이브 커뮤니티"
        title={data.initial?.category === "SHOWCASE" ? "내 자랑 글 수정" : "내 글 수정"}
        description="내용을 수정해도 처음 연결한 빌드 버전은 선택한 상태로 유지됩니다."
      />
      <Card className="community-editor">
        <CommunityPostForm data={data} filters={filters} />
      </Card>
    </div>
  );
}
