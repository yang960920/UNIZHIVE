import { notFound } from "next/navigation";
import { GameInfoDetail } from "@/components/game-info/views";
import { getGameInfoRecords } from "@/lib/server/game-info";
import { DpsResearchDetailView } from "@/components/game-info/live-views";
import { getDpsDetail, DpsResearchError } from "@/lib/server/dps-research-repository";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { z } from "zod";
import { getCurrentAuthState } from "@/lib/auth";
import type { DpsResearchDetail } from "@/lib/dps-research";

export const metadata = { title: "게임 정보 기록" };

export default async function GameDataPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, slug } = await params;
  const record = getGameInfoRecords().find(
    (item) => item.category === category && item.slug === slug,
  );
  if (record) return <GameInfoDetail record={record} />;
  if (category !== "dps" || !z.uuid().safeParse(slug).success) notFound();
  const search = await searchParams;
  const version =
    typeof search.version === "string" && /^[1-9]\d{0,5}$/.test(search.version)
      ? Number(search.version)
      : undefined;
  let detail: DpsResearchDetail | null = null;
  let unavailable = false;
  try {
    detail = await getDpsDetail(slug, version);
  } catch (error) {
    if (error instanceof DpsResearchError) {
      if (error.code === "NOT_FOUND" || error.code === "FORBIDDEN") notFound();
      unavailable = true;
    } else {
      throw error;
    }
  }
  if (unavailable) return <AuthRetryNotice />;
  if (!detail) notFound();
  const auth = detail.canVerify ? await getCurrentAuthState() : null;
  return (
    <DpsResearchDetailView
      record={detail}
      reviewerId={auth?.status === "AUTHENTICATED" ? auth.user?.id : undefined}
    />
  );
}
