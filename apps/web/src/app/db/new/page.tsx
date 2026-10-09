import { PageHeader } from "@uniz/ui";
import { DpsResearchForm } from "@/components/game-info/research-forms";
import { DpsResearchFailure } from "@/components/game-info/research-views";
import { DpsResearchError, getDpsEditorData } from "@/lib/server/dps-research-repository";

export const metadata = { title: "실측 DPS 자료 작성" };
export default async function NewDpsResearch() {
  let data;
  try {
    data = await getDpsEditorData();
  } catch (error) {
    return (
      <DpsResearchFailure
        message={
          error instanceof DpsResearchError
            ? error.message
            : "자료 작성에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요."
        }
        retryHref="/db/new"
      />
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="MEASURE AND SHARE"
        title="실측 DPS 자료 작성"
        description="측정한 결과와 원본 근거를 기록하고 게시 검토를 요청하세요."
      />
      <DpsResearchForm data={data} />
    </>
  );
}
