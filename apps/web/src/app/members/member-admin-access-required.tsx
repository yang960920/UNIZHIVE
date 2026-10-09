import Link from "next/link";
import { Card, EmptyState } from "@uniz/ui";

export function MemberAdminAccessRequired() {
  return (
    <Card>
      <EmptyState
        title="멤버 정보는 관리자만 확인할 수 있습니다"
        description="본인의 프로필과 게임 정보는 내 프로필에서 수정할 수 있습니다."
        action={
          <Link className="button" href="/onboarding?edit=1">
            내 프로필 수정
          </Link>
        }
      />
    </Card>
  );
}
