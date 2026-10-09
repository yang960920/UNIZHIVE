import Link from "next/link";
import { canViewAdminMemberDirectory } from "@uniz/domain";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { MemberAdminAccessRequired } from "./member-admin-access-required";
import { getCurrentAuthState } from "@/lib/auth";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { getMemberDirectory } from "@/lib/server/member-management";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";
import "./members.css";

export const metadata = { title: "멤버 · UNIZ HIVE" };

export default async function MembersPage() {
  const { user: actor, status, retryAfterSeconds } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") return <AuthRetryNotice retryAfterSeconds={retryAfterSeconds} />;
  if (status !== "AUTHENTICATED" || !canViewAdminMemberDirectory(actor))
    return <MemberAdminAccessRequired />;
  const { mode, members } = await getMemberDirectory();
  return (
    <>
      <PageHeader
        eyebrow="HIVE DIRECTORY"
        title="함께하는 사람들"
        description="관리자 전용 멤버 목록과 프로필을 확인하세요."
        action={
          <Badge tone={mode === "LIVE" ? "primary" : "warning"}>
            {mode === "LIVE" ? `멤버 ${members.length}명` : "개발 미리보기"}
          </Badge>
        }
      />
      {members.length === 0 ? (
        <Card>
          <EmptyState
            title="첫 멤버를 기다리고 있습니다"
            description="게임 프로필 등록과 운영진 승인이 완료된 멤버가 이곳에 표시됩니다."
            action={
              <Link className="button" href="/onboarding?edit=1" prefetch={false}>
                내 프로필 등록하기
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="member-directory">
          {members.map((member) => (
            <Link key={member.id} href={`/members/${member.handle}`} prefetch={false}>
              <Card className="member-directory-card">
                <div className="member-card-heading">
                  <Avatar name={member.displayName} imageUrl={member.imageUrl} />
                  <div>
                    <h2>{member.displayName}</h2>
                    <p className="member-note">@{member.handle}</p>
                  </div>
                  <Badge>{MEMBER_ROLE_LABELS[member.role]}</Badge>
                </div>
                <p className="member-note">Once Human · {member.nickname}</p>
                <p className="member-bio">
                  {member.bio || "다음 시즌의 이야기를 함께 만들어 갑니다."}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
