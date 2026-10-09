import Link from "next/link";
import { Card, PageHeader } from "@uniz/ui";
import { PartyForm } from "@/components/party-form";
import { getPartyEditorData, PartyAdministrationError } from "@/lib/server/party-administration";
import { partyCalendarHref, partyDefaultStart } from "@/lib/party-navigation";
import { toKstInput } from "@/lib/admin-format";

export default async function NewPartyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? query[key] : undefined);
  let data;
  try {
    data = await getPartyEditorData();
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
  const selectedDay = partyDefaultStart(value("day")) ? value("day") : undefined;
  const calendarHref = partyCalendarHref({
    seasonId: value("seasonId"),
    month: (selectedDay ?? toKstInput(new Date().toISOString())).slice(0, 7),
    day: selectedDay,
  });
  return (
    <div className="operation-directory">
      <PageHeader
        eyebrow="NEW PARTY"
        title="파티 모집하기"
        description="함께 플레이할 시즌과 콘텐츠, 실제 일정을 등록하세요."
        action={
          <Link href={calendarHref} className="button button-quiet">
            모집 달력
          </Link>
        }
      />
      <Card className="directory-briefing">
        <PartyForm data={data} defaultSeasonId={value("seasonId")} defaultDay={value("day")} />
      </Card>
    </div>
  );
}
