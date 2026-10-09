import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import { getEditableMemberProfile, getManagedMemberIdentity } from "@/lib/server/member-management";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";
import { MemberProfileEditor } from "../member-profile-form";
import "../../../members/members.css";

export const metadata = { title: "멤버 프로필 관리 · UNIZ HIVE" };

export default async function MemberProfileManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdmin("members");
  const { id } = await params;
  if (actor.isMock || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const member = await getManagedMemberIdentity(id);
  if (!member) notFound();
  const profile = await getEditableMemberProfile(id);
  return (
    <>
      <PageHeader
        eyebrow="PRIVATE MEMBER REVIEW"
        title={`${profile?.displayName ?? member.name} 프로필 관리`}
        description="공개 이름과 게임 정보를 확인하고 수정합니다."
        action={<Badge>{MEMBER_ROLE_LABELS[member.role]}</Badge>}
      />
      <Card>
        <MemberProfileEditor
          initial={
            profile ?? {
              targetId: id,
              handle: "",
              displayName: member.name,
              nickname: "",
              uid: "",
              bio: "",
            }
          }
        />
      </Card>
      <Link className="button member-back" href="/admin/members">
        멤버 관리로 돌아가기
      </Link>
    </>
  );
}
