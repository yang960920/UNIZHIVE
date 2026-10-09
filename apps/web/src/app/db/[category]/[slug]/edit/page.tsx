import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@uniz/ui";
import { DpsResearchForm } from "@/components/game-info/research-forms";
import { DpsResearchFailure } from "@/components/game-info/research-views";
import { DpsResearchError, getDpsEditorData } from "@/lib/server/dps-research-repository";

export const metadata = { title: "DPS 자료 새 버전 작성" };
export default async function EditDpsResearch({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  if (category !== "dps" || !z.uuid().safeParse(slug).success) notFound();
  let data;
  try {
    data = await getDpsEditorData(slug);
  } catch (error) {
    if (error instanceof DpsResearchError && error.code === "NOT_FOUND") notFound();
    return (
      <DpsResearchFailure
        message={
          error instanceof DpsResearchError
            ? error.message
            : "자료를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
        }
        retryHref={`/db/dps/${slug}/edit`}
        returnHref="/db/mine"
      />
    );
  }
  if (!data.initial || !data.initial.isOwner || !data.initial.canEdit) notFound();
  return (
    <>
      <PageHeader
        eyebrow="RESEARCH VERSION"
        title="DPS 자료 새 버전 작성"
        description="기존 제출 원본을 보존하고 변경한 조건과 근거를 새 버전으로 기록합니다."
      />
      <DpsResearchForm key={`${data.initial.id}:${data.initial.version}`} data={data} />
    </>
  );
}
