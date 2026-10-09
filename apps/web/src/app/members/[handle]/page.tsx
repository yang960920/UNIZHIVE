import Link from "next/link";
import { notFound } from "next/navigation";
import { canApproveMember, canViewAdminMemberDirectory } from "@uniz/domain";
import { Avatar, Badge, Card, PageHeader } from "@uniz/ui";
import { MemberAdminAccessRequired } from "../member-admin-access-required";
import { getCurrentAuthState } from "@/lib/auth";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { getMemberPublicProfile } from "@/lib/server/member-management";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";
import "../members.css";

export const metadata = { title: "멤버 프로필 · UNIZ HIVE" };

export default async function MemberPage({ params }: { params: Promise<{ handle: string }> }) {
  const { user: actor, status, retryAfterSeconds } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") return <AuthRetryNotice retryAfterSeconds={retryAfterSeconds} />;
  if (status !== "AUTHENTICATED" || !canViewAdminMemberDirectory(actor))
    return <MemberAdminAccessRequired />;
  const { handle } = await params;
  const member = await getMemberPublicProfile(handle);
  if (!member) notFound();
  return (
    <>
      <PageHeader
        eyebrow="MEMBER PROFILE"
        title={member.displayName}
        description={`@${member.handle} · UNIZ HIVE`}
        action={<Badge tone="primary">{MEMBER_ROLE_LABELS[member.role]}</Badge>}
      />
      <Card className="member-profile-card">
        <div className="member-card-heading">
          <Avatar name={member.displayName} size="lg" imageUrl={member.imageUrl} />
          <div>
            <h2>{member.nickname}</h2>
            <p className="member-note">Once Human 닉네임</p>
          </div>
        </div>
        <p className="member-bio">{member.bio || "함께하는 여정을 준비하고 있습니다."}</p>
        <div className="member-profile-meta">
          <span>
            프로필 등록{" "}
            {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul" }).format(
              new Date(member.joinedAt),
            )}
          </span>
        </div>
        <div className="member-card-links">
          {actor?.id === member.userId && (
            <Link href="/onboarding?edit=1" prefetch={false}>
              내 프로필 수정
            </Link>
          )}
          {actor && !actor.isMock && canApproveMember(actor) && (
            <Link href={`/admin/members/${member.userId}`} prefetch={false}>
              프로필 관리
            </Link>
          )}
        </div>
      </Card>
      <Link className="button member-back" href="/members" prefetch={false}>
        멤버 목록으로
      </Link>
    </>
  );
}
