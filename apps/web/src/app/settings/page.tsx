import { redirect } from "next/navigation";
import { canEditMemberProfile } from "@uniz/domain";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { getCurrentAuthState } from "@/lib/auth";
import { MEMBER_ROLE_LABELS, isApprovedRole } from "@/lib/member-policy";
import { getEditableMemberProfile } from "@/lib/server/member-management";
import { getUserPreferences } from "@/lib/server/user-preferences";
import { getOwnProfileImage } from "@/lib/server/profile-images";
import { AccountLogout, PreferencesForm } from "./preferences-form";
import { SettingsProfileForm } from "./profile-form";
import "../login/auth.css";
import "./settings.css";

export const metadata = { title: "계정 설정 · UNIZ HIVE" };

export default async function SettingsPage() {
  const { user, status, retryAfterSeconds } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") return <AuthRetryNotice retryAfterSeconds={retryAfterSeconds} />;
  if (status === "LEFT") redirect("/login?error=GuildMembership&callbackUrl=/settings");
  if (status === "REAUTH_REQUIRED") redirect("/login?error=AccessDenied&callbackUrl=/settings");
  if (status !== "AUTHENTICATED" || !user) redirect("/login?callbackUrl=/settings");

  const canEditProfile = canEditMemberProfile(user, user.id);
  const [profileResult, preferencesResult, imageResult] = await Promise.allSettled([
    canEditProfile && !user.isMock ? getEditableMemberProfile() : Promise.resolve(null),
    getUserPreferences(user),
    canEditProfile ? getOwnProfileImage(user) : Promise.resolve(null),
  ]);
  const initial = profileResult.status === "fulfilled" ? profileResult.value : null;
  const approved = isApprovedRole(user.role);

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="ACCOUNT SETTINGS"
        title="계정 설정"
        description="내 프로필과 하이브를 이용하는 방식을 관리하세요."
      />
      <nav className="settings-nav" aria-label="설정 항목">
        <a href="#settings-profile">내 프로필</a>
        <a href="#settings-account">계정 상태</a>
        <a href="#notifications">알림</a>
        <a href="#settings-display">화면</a>
        <a href="#settings-game">게임 이용</a>
        <a href="#settings-privacy">공개 범위</a>
      </nav>
      <div className="settings-account-grid">
        <Card id="settings-profile" className="settings-profile-card settings-section">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">YOUR PROFILE</p>
              <h2>내 프로필</h2>
            </div>
            <Badge tone={approved ? "primary" : "warning"}>{MEMBER_ROLE_LABELS[user.role]}</Badge>
          </div>
          <p className="settings-description">
            프로필 이미지, 표시 이름, 게임 닉네임과 소개를 수정하세요. UID는 본인 확인을 위한 비공개
            정보입니다.
          </p>
          {profileResult.status === "rejected" ? (
            <div className="settings-load-error" role="alert">
              <p>프로필을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 불러와 주세요.</p>
              <a className="button" href="/settings">
                다시 불러오기
              </a>
            </div>
          ) : canEditProfile ? (
            <>
              {user.isMock && (
                <p className="settings-note">
                  개발 계정에서는 입력을 확인하며 실제 프로필은 저장하지 않습니다.
                </p>
              )}
              <SettingsProfileForm
                key={user.id}
                name={user.name}
                initial={initial}
                image={imageResult.status === "fulfilled" ? imageResult.value : null}
                isMock={user.isMock}
              />
            </>
          ) : (
            <EmptyState
              title="가입 상태를 운영진에게 문의해 주세요"
              description="가입 신청이 보류되었습니다. 운영진이 신청을 다시 검토하면 프로필을 수정할 수 있습니다."
            />
          )}
        </Card>
        <Card id="settings-account" className="settings-section settings-account-card">
          <div className="settings-section-header">
            <div>
              <p className="eyebrow">YOUR ACCOUNT</p>
              <h2>계정 상태</h2>
            </div>
          </div>
          <dl className="settings-account-details">
            <div>
              <dt>로그인 계정</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Discord 연결</dt>
              <dd>{user.isMock ? "개발 계정 · 연결 미사용" : "연결됨"}</dd>
            </div>
            <div>
              <dt>가입 상태</dt>
              <dd>
                {approved
                  ? "승인 완료"
                  : user.role === "APPLICANT"
                    ? "운영진 승인 대기"
                    : "가입 보류"}
              </dd>
            </div>
            <div>
              <dt>현재 역할</dt>
              <dd>{MEMBER_ROLE_LABELS[user.role]}</dd>
            </div>
          </dl>
          {!approved && (
            <p className="settings-note">멤버 권한은 운영진의 승인 후 사용할 수 있습니다.</p>
          )}
          <p className="settings-note">
            공식 소식과 Steam 접속자 조회에는 개인 Steam 계정 연결이 필요하지 않습니다.
          </p>
          <AccountLogout />
        </Card>
      </div>
      {preferencesResult.status === "fulfilled" ? (
        <PreferencesForm initial={preferencesResult.value} isMock={user.isMock} />
      ) : (
        <Card className="settings-load-error" role="alert">
          <h2>설정을 불러오지 못했습니다</h2>
          <p>저장된 값을 확인할 수 없어 변경을 잠시 멈췄습니다. 다시 불러온 뒤 수정해 주세요.</p>
          <a className="button" href="/settings">
            다시 불러오기
          </a>
        </Card>
      )}
    </div>
  );
}
