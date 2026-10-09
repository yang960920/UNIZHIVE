import Link from "next/link";
import { Card, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import { getSeasonAdminData } from "@/lib/server/season-administration";
import { resolveSeasonServerSelection } from "@/lib/season-selection";
import { SeasonSetupForm } from "../forms";
import "../../administration.css";

export default async function NewSeasonPage() {
  const actor = await requireAdmin("seasons");
  if (actor.isMock)
    return (
      <Card>
        <p>실제 Discord 계정으로 로그인해주세요.</p>
      </Card>
    );
  const data = await getSeasonAdminData();
  const selection = resolveSeasonServerSelection(data);
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow="NEW SEASON"
        title="새 시즌 만들기"
        description="시나리오·서버 종류·트랜스 현상을 선택하고, 참가 멤버와 운영 상태를 관리하세요."
        action={
          <Link prefetch={false} href="/admin/seasons" className="button button-quiet">
            시즌 목록
          </Link>
        }
      />
      <Card>
        <SeasonSetupForm key={selection?.serverId ?? "new-season"} initial={selection} />
      </Card>
    </div>
  );
}
