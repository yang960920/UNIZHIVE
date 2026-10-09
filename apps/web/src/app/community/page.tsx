import { CommunityAccessNotice, CommunityDirectory } from "@/components/community/views";
import { getCommunityDirectory } from "@/lib/server/community-repository";
import { redirect } from "next/navigation";
import { communityHref, communityReturnFilters } from "@/components/community/presentation";
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const filters = communityReturnFilters(query);
  if (filters.section === "SHOWCASE") redirect(communityHref(filters));
  const result = await getCommunityDirectory({
    q: query.q,
    category: query.category,
    page: query.page,
    section: "BOARD",
  });
  if (result.mode !== "LIVE")
    return (
      <CommunityAccessNotice mode={result.mode} retryAfterSeconds={result.retryAfterSeconds} />
    );
  return <CommunityDirectory data={result.data} />;
}
