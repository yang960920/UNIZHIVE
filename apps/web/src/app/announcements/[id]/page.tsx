import { notFound } from "next/navigation";
import { z } from "zod";
import { CommunityAccessNotice, AnnouncementView } from "@/components/community/views";
import { getAnnouncement } from "@/lib/server/community-repository";
export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const result = await getAnnouncement(id);
  if (result.mode !== "LIVE")
    return (
      <CommunityAccessNotice
        mode={result.mode}
        retryAfterSeconds={result.retryAfterSeconds}
        retryHref={`/announcements/${id}`}
      />
    );
  if (!result.data) notFound();
  return <AnnouncementView announcement={result.data} />;
}
