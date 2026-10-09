"use client";

import { useState, useTransition, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { Bell, Eye, Gamepad2, LogOut, Monitor } from "lucide-react";
import { Card } from "@uniz/ui";
import { stopSessionRenewal } from "@/components/session-keeper";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/lib/user-preferences";
import { saveUserPreferences } from "@/lib/user-preferences-actions";
import { SCENARIO_PRESETS } from "@/lib/scenario-presets";

type BooleanPreference = {
  [Key in keyof UserPreferences]: UserPreferences[Key] extends boolean ? Key : never;
}[keyof UserPreferences];

function SettingsSection({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="settings-section">
      <div className="settings-section-header">
        <h2>
          {icon}
          {title}
        </h2>
      </div>
      <p className="settings-description">{description}</p>
      <div className="settings-controls">{children}</div>
    </Card>
  );
}

export function PreferencesForm({
  initial,
  isMock = false,
}: {
  initial: UserPreferences;
  isMock?: boolean;
}) {
  const { updatePreferences } = useUserPreferences();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof UserPreferences] !== saved[key as keyof UserPreferences],
  );

  function change<Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  }

  function toggle(key: BooleanPreference, label: string, description: string) {
    return (
      <label className="settings-toggle" htmlFor={`preference-${key}`}>
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <input
          id={`preference-${key}`}
          name={key}
          type="checkbox"
          checked={draft[key]}
          onChange={(event) => change(key, event.target.checked)}
        />
      </label>
    );
  }

  return (
    <form
      className="preferences-form"
      aria-label="이용 환경 설정"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || pending) return;
        setFeedback(null);
        startTransition(async () => {
          try {
            const result = await saveUserPreferences(draft);
            setFeedback(result);
            if (result.ok && result.preferences) {
              setSaved(result.preferences);
              setDraft(result.preferences);
              updatePreferences(result.preferences);
            }
          } catch {
            setFeedback({
              ok: false,
              message: "설정을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
            });
          }
        });
      }}
    >
      <fieldset className="preferences-fields" disabled={pending}>
        <legend className="sr-only">내 이용 환경</legend>
        <div className="settings-preference-grid">
          <SettingsSection
            id="notifications"
            title="사이트 알림"
            icon={<Bell size={19} />}
            description="필요한 소식을 골라 하이브 알림에서 확인하세요."
          >
            {toggle("notifyAnnouncements", "새 공지", "하이브에 새로 등록된 공지")}
            {toggle("notifyPartyChanges", "파티 일정 변경", "내가 참가한 파티의 일정 변경과 취소")}
            {toggle("notifyPartyReminders", "파티 시작 안내", "참가한 파티가 시작되기 전 안내")}
            <label className="settings-select" htmlFor="preference-reminderMinutes">
              <span>파티 시작 전 안내 시점</span>
              <select
                id="preference-reminderMinutes"
                name="reminderMinutes"
                value={draft.reminderMinutes}
                disabled={!draft.notifyPartyReminders}
                onChange={(event) =>
                  change("reminderMinutes", Number(event.target.value) as 15 | 30 | 60)
                }
              >
                <option value={15}>15분 전</option>
                <option value={30}>30분 전</option>
                <option value={60}>1시간 전</option>
              </select>
            </label>
            {toggle(
              "notifyVoteDeadlines",
              "투표 마감 안내",
              "참여 가능한 다음 시나리오 투표의 마감 안내",
            )}
            {toggle("notifyComments", "댓글과 답글", "내 글의 댓글과 내 댓글에 등록된 답글")}
            <p className="settings-note">
              사이트 안에서 확인하는 알림입니다. Discord DM이나 이메일은 발송하지 않습니다.
            </p>
          </SettingsSection>
          <SettingsSection
            id="settings-display"
            title="화면 설정"
            icon={<Monitor size={19} />}
            description="자주 쓰는 첫 화면과 읽기 편한 표시 방식을 설정하세요."
          >
            <label className="settings-select" htmlFor="preference-startPage">
              <span>로그인 후 첫 화면</span>
              <select
                id="preference-startPage"
                name="startPage"
                value={draft.startPage}
                onChange={(event) =>
                  change("startPage", event.target.value as UserPreferences["startPage"])
                }
              >
                <option value="/">홈</option>
                <option value="/season">시즌 허브</option>
                <option value="/ops">파티 모집</option>
                <option value="/map">지도</option>
                <option value="/lab">빌드 연구실</option>
                <option value="/community">커뮤니티</option>
              </select>
              <small>직접 방문한 페이지가 있으면 해당 페이지로 돌아갑니다.</small>
            </label>
            <label className="settings-select" htmlFor="preference-textSize">
              <span>글자 크기</span>
              <select
                id="preference-textSize"
                name="textSize"
                value={draft.textSize}
                onChange={(event) =>
                  change("textSize", event.target.value as UserPreferences["textSize"])
                }
              >
                <option value="DEFAULT">기본</option>
                <option value="LARGE">크게</option>
              </select>
            </label>
            {toggle("reduceMotion", "애니메이션 줄이기", "이동 효과와 장식 애니메이션을 줄입니다.")}
            {toggle(
              "showGuide",
              "홈 안내원 표시",
              "원스휴먼 공식 소식 아래에 안내 캐릭터를 표시합니다.",
            )}
          </SettingsSection>
          <SettingsSection
            id="settings-game"
            title="게임 이용 편의"
            icon={<Gamepad2 size={19} />}
            description="지도에서 자주 찾는 시나리오와 파밍 대상을 기억하세요."
          >
            <label className="settings-select" htmlFor="preference-mapScenario">
              <span>기본 지도 시나리오</span>
              <select
                id="preference-mapScenario"
                name="mapScenario"
                value={draft.mapScenario}
                onChange={(event) =>
                  change("mapScenario", event.target.value as UserPreferences["mapScenario"])
                }
              >
                <option value="CURRENT">현재 하이브 시즌</option>
                {SCENARIO_PRESETS.map((scenario) => (
                  <option key={scenario.key} value={scenario.key}>
                    {scenario.label}
                  </option>
                ))}
              </select>
              <small>검색이나 링크에서 지정한 시나리오가 있으면 해당 지도를 먼저 엽니다.</small>
            </label>
            {toggle(
              "rememberMapFilters",
              "최근 파밍 필터 기억",
              "이 기기에서 마지막으로 선택한 파밍 필터를 다시 적용합니다.",
            )}
          </SettingsSection>
          <SettingsSection
            id="settings-privacy"
            title="공개 범위"
            icon={<Eye size={19} />}
            description="새 빌드를 만들 때 사용할 기본 공개 범위를 정하세요."
          >
            <label className="settings-select" htmlFor="preference-defaultBuildVisibility">
              <span>새 빌드의 기본 공개 범위</span>
              <select
                id="preference-defaultBuildVisibility"
                name="defaultBuildVisibility"
                value={draft.defaultBuildVisibility}
                onChange={(event) =>
                  change(
                    "defaultBuildVisibility",
                    event.target.value as UserPreferences["defaultBuildVisibility"],
                  )
                }
              >
                <option value="PRIVATE">비공개 · 나만 보기</option>
                <option value="HIVE">하이브 · 승인된 멤버</option>
                <option value="PUBLIC">공개 · 모든 방문자</option>
              </select>
              <small>
                기존 빌드의 공개 범위는 유지됩니다. 각 빌드를 저장할 때 변경할 수 있습니다.
              </small>
            </label>
            <p className="settings-note">
              표시 이름, 게임 닉네임과 소개는 공개 프로필에 사용됩니다. 게임 UID는 공개 프로필과
              검색 결과에 표시되지 않습니다.
            </p>
          </SettingsSection>
        </div>
      </fieldset>
      <div className="settings-save-bar">
        <div className="settings-save-copy">
          {feedback ? (
            <p
              role={feedback.ok ? "status" : "alert"}
              className={feedback.ok ? "settings-success" : "settings-error"}
            >
              {feedback.message}
            </p>
          ) : (
            <p aria-live="polite">
              {pending
                ? "설정을 저장하고 있습니다…"
                : dirty
                  ? "저장하지 않은 변경 사항이 있습니다."
                  : "현재 저장된 설정입니다."}
            </p>
          )}
          {isMock && <small>개발 계정의 이용 설정은 이 브라우저에 저장됩니다.</small>}
        </div>
        <div className="settings-save-actions">
          <button
            type="button"
            className="button button-quiet"
            disabled={pending}
            onClick={() => {
              setDraft({ ...DEFAULT_USER_PREFERENCES });
              setFeedback(null);
            }}
          >
            기본값
          </button>
          <button
            type="button"
            className="button"
            disabled={!dirty || pending}
            onClick={() => {
              setDraft(saved);
              setFeedback(null);
            }}
          >
            변경 취소
          </button>
          <button type="submit" className="button button-primary" disabled={!dirty || pending}>
            {pending ? "저장 중…" : "설정 저장"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function AccountLogout() {
  const [pending, setPending] = useState(false);
  return (
    <button
      className="button settings-logout"
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        stopSessionRenewal();
        void signOut({ callbackUrl: "/" }).catch(() => setPending(false));
      }}
    >
      <LogOut size={16} />
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
