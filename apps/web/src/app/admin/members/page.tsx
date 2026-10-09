import Link from "next/link";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import { listMemberManagement } from "@/lib/server/member-management";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";
import { MemberDecisionForm } from "./member-decision-form";
import "../../members/members.css";

export const metadata = { title: "멤버 승인 · UNIZ HIVE" };

export default async function MemberManagementPage() {
  const actor = await requireAdmin("members");
  const data = await listMemberManagement();
  const pending = data.items.filter((item) => item.role === "APPLICANT");
  const ordered = [
    ...pending.filter((item) => item.profileComplete),
    ...pending.filter((item) => !item.profileComplete),
    ...data.items.filter((item) => item.role !== "APPLICANT"),
  ];
  return (
    <>
      <PageHeader
        eyebrow="MEMBER APPROVAL"
        title="멤버 가입과 권한 관리"
        description="게임 프로필과 Discord 서버 가입 상태를 확인한 뒤 멤버로 승인하세요."
        action={<Badge tone="warning">승인 대기 {pending.length}명</Badge>}
      />
      {data.mode === "PREVIEW" ? (
        <Card>
          <EmptyState
            title="실제 운영 계정으로 로그인해 주세요"
            description="개발 계정은 화면 미리보기용입니다. 실제 멤버 정보를 변경하려면 Discord로 로그인한 운영 계정이 필요합니다."
            action={
              <Link className="button button-primary" href="/login">
                Discord 로그인
              </Link>
            }
          />
        </Card>
      ) : ordered.length === 0 ? (
        <Card>
          <EmptyState
            title="아직 가입 신청이 없습니다"
            description="멤버가 Discord로 로그인하고 게임 프로필을 등록하면 이곳에서 신청을 검토할 수 있습니다."
            action={
              <Link className="button" href="/members">
                멤버 목록 보기
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="member-management-list">
          {ordered.map((member) => (
            <Card className="member-management-card" key={member.id}>
              <div className="member-card-heading">
                <Avatar name={member.displayName ?? member.name} imageUrl={member.imageUrl} />
                <div>
                  <h2>{member.displayName ?? member.name}</h2>
                  <p className="member-note">
                    {member.nickname ? `Once Human · ${member.nickname}` : "게임 프로필 등록 전"}
                  </p>
                </div>
                <Badge tone={member.role === "APPLICANT" ? "warning" : "primary"}>
                  {MEMBER_ROLE_LABELS[member.role]}
                </Badge>
              </div>
              <p className="member-note">
                {member.profileComplete
                  ? "가입 확인 정보 등록 완료"
                  : "프로필 등록이 완료되지 않아 승인할 수 없습니다."}
              </p>
              <MemberDecisionForm
                member={member}
                isAdmin={actor.role === "ADMIN"}
                isSelf={actor.id === member.id}
              />
              <div className="member-card-links">
                <Link href={`/admin/members/${member.id}`}>프로필 확인·수정</Link>
                {member.handle &&
                  (member.role === "MEMBER" ||
                    member.role === "OFFICER" ||
                    member.role === "ADMIN") && (
                    <Link href={`/members/${member.handle}`}>공개 프로필 보기</Link>
                  )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
