import { CommunityAccessNotice, CommunityDirectory } from "@/components/community/views";
import { communityHref, communityReturnFilters } from "@/components/community/presentation";
import { getCommunityDirectory } from "@/lib/server/community-repository";

export default async function CommunityShowcasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const result = await getCommunityDirectory({
    q: query.q,
    page: query.page,
    section: "SHOWCASE",
  });
  if (result.mode !== "LIVE")
    return (
      <CommunityAccessNotice
        mode={result.mode}
        retryAfterSeconds={result.retryAfterSeconds}
        retryHref={communityHref({ ...communityReturnFilters(query), section: "SHOWCASE" })}
      />
    );
  return <CommunityDirectory data={result.data} />;
}
