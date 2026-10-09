import { AdminDpsDirectory, DpsResearchFailure } from "@/components/game-info/research-views";
import { DPS_RESEARCH_STATUSES, type DpsResearchStatus } from "@/lib/dps-research";
import { requireAdmin } from "@/lib/server/admin";
import { DpsResearchError, getDpsReviewDirectory } from "@/lib/server/dps-research-repository";

export const metadata = { title: "게임 정보 검토" };
export default async function DpsReviewDirectory({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("database");
  const query = searchParams ? await searchParams : {};
  const status =
    typeof query.status === "string" &&
    query.status !== "DRAFT" &&
    Object.hasOwn(DPS_RESEARCH_STATUSES, query.status)
      ? (query.status as DpsResearchStatus)
      : "PENDING";
  const page =
    typeof query.page === "string" && /^\d{1,5}$/.test(query.page)
      ? Math.max(1, Math.min(10000, Number(query.page)))
      : 1;
  let data;
  try {
    data = await getDpsReviewDirectory({ status, page });
  } catch (error) {
    return (
      <DpsResearchFailure
        message={
          error instanceof DpsResearchError
            ? error.message
            : "검토 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
        }
        retryHref={`/admin/database?status=${status}&page=${page}`}
        returnHref="/admin"
      />
    );
  }
  return <AdminDpsDirectory data={data} status={status} />;
}
