import Link from "next/link";
import { PageHeader } from "@uniz/ui";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { OperationalAccessNotice } from "@/components/live-operations";
import { LoadoutEditor } from "@/components/build-loadouts/editor";
import { getPlannerAccess } from "@/lib/server/build-planner-access";
import { listLoadoutBuildChoices } from "@/lib/server/build-loadouts";
import type { LoadoutChoicePage } from "@/lib/data/build-loadout-types";
import "../../lab.css";
import "../loadouts.css";

export const metadata = { title: "새 로드아웃 만들기" };
export default async function NewLoadoutPage() {
  const access = await getPlannerAccess();
  if (access.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={access.retryAfterSeconds} />;
  if (!access.mayCreate && !access.preview)
    return (
      <OperationalAccessNotice
        mode={access.status === "LEFT" ? "LEFT" : access.user ? "PENDING" : "REAUTH"}
        retryHref="/lab/loadouts/new"
      />
    );
  let choices: LoadoutChoicePage = { items: [], nextCursor: null };
  if (!access.preview) {
    try {
      choices = await listLoadoutBuildChoices(access.user);
    } catch {
      return <AuthRetryNotice />;
    }
  }
  return (
    <div className="planner-detail loadout-page">
      <PageHeader
        eyebrow="YOUR LOADOUT"
        title="새 로드아웃 만들기"
        description="같이 준비할 빌드를 선택하세요. 장비와 재료를 자동으로 바꾸지 않고 겹치는 구성만 표시합니다."
        action={
          <Link href="/lab/loadouts" prefetch={false} className="button button-quiet">
            로드아웃 목록
          </Link>
        }
      />
      <LoadoutEditor choices={choices} preview={access.preview} />
    </div>
  );
}
