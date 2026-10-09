import { notFound } from "next/navigation";
import { z } from "zod";
import { CommunityAccessNotice, CommunityPostDetail } from "@/components/community/views";
import { communityPostHref, communityReturnFilters } from "@/components/community/presentation";
import { getCommunityPost } from "@/lib/server/community-repository";
export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await getCommunityPost(id, {
    commentPage: query.commentPage,
    replyRoot: query.replyRoot,
    replyPage: query.replyPage,
    replyTarget: query.replyTarget,
  });
  if (result.mode !== "LIVE")
    return (
      <CommunityAccessNotice
        mode={result.mode}
        retryAfterSeconds={result.retryAfterSeconds}
        retryHref={communityPostHref(id, communityReturnFilters(query))}
      />
    );
  if (!result.data) notFound();
  return <CommunityPostDetail data={result.data} filters={communityReturnFilters(query)} />;
}
