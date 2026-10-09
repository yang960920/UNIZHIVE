import { Card, PageHeader } from "@uniz/ui";
import { CommunityPostForm } from "@/components/community/forms";
import { CommunityEditorFailure } from "@/components/community/editor-failure";
import {
  communityHref,
  communityPostHref,
  communityReturnFilters,
} from "@/components/community/presentation";
import { getCommunityEditorData } from "@/lib/server/community-repository";

export default async function NewCommunityPost({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const filters = communityReturnFilters(query);
  const showcase = filters.section === "SHOWCASE";
  let data;
  try {
    data = await getCommunityEditorData();
  } catch (error) {
    return (
      <CommunityEditorFailure
        error={error}
        retryHref={communityPostHref("new", filters)}
        returnHref={communityHref(filters)}
      />
    );
  }
  return (
    <div className="community-page">
      <PageHeader
        eyebrow="하이브 커뮤니티"
        title={showcase ? "자랑하기" : "새 글 쓰기"}
        description={
          showcase
            ? "사진과 짧은 이야기로 나만의 순간을 공유하세요."
            : "공략·팁·질문과 사용한 빌드를 하이브 멤버에게 공유하세요."
        }
      />
      <Card className="community-editor">
        <CommunityPostForm data={data} filters={filters} />
      </Card>
    </div>
  );
}
