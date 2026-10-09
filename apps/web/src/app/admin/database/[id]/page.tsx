import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminDpsDetail, DpsResearchFailure } from "@/components/game-info/research-views";
import { requireAdmin } from "@/lib/server/admin";
import { DpsResearchError, getDpsDetail } from "@/lib/server/dps-research-repository";

export const metadata = { title: "DPS 원본 검토" };
export default async function DpsReviewDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdmin("database");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = searchParams ? await searchParams : {};
  const version =
    query.version === undefined
      ? undefined
      : typeof query.version === "string" && /^[1-9]\d{0,8}$/.test(query.version)
        ? Number(query.version)
        : null;
  if (version === null) notFound();
  let record;
  try {
    record = await getDpsDetail(id, version);
  } catch (error) {
    return (
      <DpsResearchFailure
        message={
          error instanceof DpsResearchError
            ? error.message
            : "원본 자료를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
        }
        retryHref={`/admin/database/${id}${version ? `?version=${version}` : ""}`}
        returnHref="/admin/database"
      />
    );
  }
  if (!record) notFound();
  return (
    <AdminDpsDetail record={record} administrator={actor.role === "ADMIN"} reviewerId={actor.id} />
  );
}
