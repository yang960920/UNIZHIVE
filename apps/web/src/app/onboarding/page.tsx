import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { getCurrentAuthState } from "@/lib/auth";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { getEditableMemberProfile } from "@/lib/server/member-management";
import { ProfileForm } from "./profile-form";
import { isApprovedLoginRole } from "@/lib/login-flow";
import "../login/auth.css";

export const metadata = { title: "프로필 등록 · UNIZ HIVE" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<{ edit?: string }>;
} = {}) {
  const { user, status, retryAfterSeconds } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") return <AuthRetryNotice retryAfterSeconds={retryAfterSeconds} />;
  if (status === "LEFT") redirect("/login?error=GuildMembership&callbackUrl=/onboarding");
  if (status === "REAUTH_REQUIRED") redirect("/login?error=AccessDenied&callbackUrl=/onboarding");
  if (status !== "AUTHENTICATED" || !user) redirect("/login");
  const editing = (await searchParams)?.edit === "1";
  const approved = isApprovedLoginRole(user.role);
  if (approved && !editing) redirect("/");
  if (user.role === "GUEST")
    return (
      <Card>
        <EmptyState
          title="운영진에게 가입 상태를 문의해 주세요"
          description="가입 신청이 보류되었습니다. 운영진이 신청을 다시 검토하면 프로필을 수정할 수 있습니다."
        />
      </Card>
    );
  const initial = user.isMock ? null : await getEditableMemberProfile();
  return (
    <>
      <PageHeader
        eyebrow="YOUR HIVE PROFILE"
        title={approved || initial ? "내 하이브 프로필" : "UNIZ의 다음 여정에 함께하세요"}
        description={
          approved
            ? "공개 프로필과 게임 정보를 수정하세요. 기존 멤버 승인은 유지됩니다."
            : initial
              ? "가입 신청 정보를 수정할 수 있습니다. 운영진의 멤버 승인을 기다려 주세요."
              : "Discord 인증이 완료되었습니다. 게임 프로필을 등록하면 운영진이 멤버 가입을 확인합니다."
        }
      />
      <Card className="onboarding-card">
        <Badge tone={user.isMock ? "warning" : "primary"}>
          {user.isMock
            ? "개발 계정 · 입력 확인 미리보기"
            : approved
              ? "승인된 멤버"
              : initial
                ? "멤버 승인 대기"
                : "Discord 인증 완료"}
        </Badge>
        <p className="auth-intro">
          안녕하세요, {user.name}님. 공개 프로필과 멤버 확인에 필요한 정보를 입력해 주세요.
        </p>
        <ProfileForm initial={initial} />
      </Card>
    </>
  );
}
