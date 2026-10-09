import Link from "next/link";
import { Card, PageHeader } from "@uniz/ui";
import { PartyForm } from "@/components/party-form";
import { getPartyEditorData, PartyAdministrationError } from "@/lib/server/party-administration";

export default async function EditPartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getPartyEditorData(id);
  } catch (error) {
    return (
      <Card>
        <p>
          {error instanceof PartyAdministrationError
            ? error.message
            : "모집 정보를 불러오지 못했습니다. 다시 시도해주세요."}
        </p>
        <Link href="/ops">모집 달력으로 돌아가기</Link>
      </Card>
    );
  }
  return (
    <div className="operation-directory">
      <PageHeader
        eyebrow="EDIT PARTY"
        title="파티 모집 수정"
        description="일정·정원·안내를 수정하거나 모집을 취소할 수 있습니다."
        action={
          <Link href={`/ops/${id}`} className="button button-quiet">
            모집 상세
          </Link>
        }
      />
      <Card className="directory-briefing">
        <PartyForm key={data.initial?.updatedAt} data={data} />
      </Card>
    </div>
  );
}
