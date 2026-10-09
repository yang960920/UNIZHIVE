import { MyDpsDirectory, DpsResearchFailure } from "@/components/game-info/research-views";
import { DpsResearchError, getMyDpsRecords } from "@/lib/server/dps-research-repository";

export const metadata = { title: "나의 DPS 기록" };
export default async function MyDpsResearch({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = searchParams ? await searchParams : {};
  const page =
    typeof query.page === "string" && /^\d{1,5}$/.test(query.page)
      ? Math.max(1, Math.min(10000, Number(query.page)))
      : 1;
  let data;
  try {
    data = await getMyDpsRecords({ page });
  } catch (error) {
    return (
      <DpsResearchFailure
        message={
          error instanceof DpsResearchError
            ? error.message
            : "내 기록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
        }
        retryHref={page > 1 ? `/db/mine?page=${page}` : "/db/mine"}
      />
    );
  }
  return <MyDpsDirectory data={data} />;
}
