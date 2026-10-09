"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Shield, Users, Wrench } from "lucide-react";
import {
  getDiscordLoginAuthorization,
  getLoginCompletionUrl,
  type LoginIntent,
} from "@/lib/login-flow";

const identities = [
  { id: "demo-member", name: "Member", description: "멤버의 오늘 할 일과 시즌 현황", icon: Users },
  { id: "demo-officer", name: "Officer", description: "이동 준비와 운영 권한 확인", icon: Shield },
  { id: "demo-admin", name: "Admin", description: "관리 영역과 전체 권한 확인", icon: Wrench },
];

export function LoginButtons({
  mockEnabled,
  discordEnabled,
  destination = "/",
  rememberedGrant = false,
  hasError = false,
}: {
  mockEnabled: boolean;
  discordEnabled: boolean;
  destination?: string;
  rememberedGrant?: boolean;
  hasError?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function login(provider: string, identityId?: string, intent: LoginIntent = "login") {
    setPending(identityId ?? intent);
    setError("");
    try {
      await signIn(
        provider,
        { identityId, callbackUrl: getLoginCompletionUrl(destination, intent) },
        provider === "discord"
          ? getDiscordLoginAuthorization({ intent, rememberedGrant, hasError })
          : undefined,
      );
    } catch {
      setError("로그인 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(null);
    }
  }
  return (
    <div className="login-actions">
      <button
        className="button button-primary discord-login"
        disabled={!discordEnabled || pending !== null}
        onClick={() => login("discord")}
      >
        <span>로그인</span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {hasError && discordEnabled && (
        <p className="auth-note">
          다시 로그인하면 Discord 인증 화면에서 계정과 접근 권한을 확인할 수 있습니다.
        </p>
      )}
      <div className="auth-join">
        <h3>처음 방문하셨나요?</h3>
        <p className="auth-note">Discord 인증 후 게임 프로필을 등록하고 멤버 승인을 신청하세요.</p>
        <button
          type="button"
          className="button discord-login"
          disabled={!discordEnabled || pending !== null}
          onClick={() => login("discord", undefined, "join")}
        >
          <span>Discord로 가입 신청</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <div className="auth-flow" aria-label="가입 신청 순서">
          <span>Discord 인증</span>
          <ArrowRight size={12} aria-hidden="true" />
          <span>프로필 등록</span>
          <ArrowRight size={12} aria-hidden="true" />
          <span>멤버 승인</span>
        </div>
      </div>
      {!discordEnabled && (
        <p className="auth-note">
          {mockEnabled
            ? "Discord 연결 준비 중입니다. 현재는 아래 개발 계정으로 둘러볼 수 있습니다."
            : "로그인을 준비하고 있습니다. 대시보드에서 UNIZ의 소식을 먼저 확인하세요."}
        </p>
      )}
      {mockEnabled && (
        <div className="dev-identities">
          <p className="mono-label">LOCAL DEVELOPMENT</p>
          {identities.map(({ id, name, description, icon: Icon }) => (
            <button
              key={id}
              className="dev-identity"
              onClick={() => login("development", id)}
              disabled={pending !== null}
            >
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{name}</strong>
                <small>{description}</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}
          <p className="auth-note">개발 환경 전용 · 실제 Discord 계정과 연결되지 않습니다.</p>
        </div>
      )}
      {pending && (
        <p role="status" className="auth-note">
          {pending === "join" ? "가입 신청 연결 중…" : "로그인 연결 중…"}
        </p>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
}
