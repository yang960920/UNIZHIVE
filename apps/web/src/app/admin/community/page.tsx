import Link from "next/link";
import { CommunityAccessNotice, CommunityDirectory } from "@/components/community/views";
import { CommunityEditorFailure } from "@/components/community/editor-failure";
import { communityHref } from "@/components/community/presentation";
import { getCommunityDirectory, getAnnouncementAdminData } from "@/lib/server/community-repository";
export default async function CommunityAdmin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let notices;
  try {
    notices = await getAnnouncementAdminData({ page: query.noticePage });
  } catch (error) {
    return <CommunityEditorFailure error={error} retryHref="/admin/community" />;
  }
  const result = await getCommunityDirectory({
    q: query.q,
    category: query.category,
    page: query.page,
    includeModerated: true,
  });
  if (result.mode !== "LIVE")
    return (
      <CommunityAccessNotice
        mode={result.mode}
        retryAfterSeconds={result.retryAfterSeconds}
        retryHref="/admin/community"
      />
    );
  const base = communityHref({
    q: result.data.q,
    category: result.data.category,
    page: result.data.pagination.page,
    admin: true,
  });
  const noticeHref = (page: number) => `${base}${base.includes("?") ? "&" : "?"}noticePage=${page}`;
  return (
    <div className="community-page">
      <CommunityDirectory admin data={{ ...result.data, announcements: notices.announcements }} />
      {(notices.pagination.page > 1 || notices.pagination.hasNextPage) && (
        <nav aria-label="공지 목록 페이지" className="community-pagination">
          {notices.pagination.page > 1 && (
            <Link href={noticeHref(notices.pagination.page - 1)}>이전 공지</Link>
          )}
          <span>공지 {notices.pagination.page}페이지</span>
          {notices.pagination.hasNextPage && (
            <Link href={noticeHref(notices.pagination.page + 1)}>다음 공지</Link>
          )}
        </nav>
      )}
    </div>
  );
}
