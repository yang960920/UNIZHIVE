import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Badge, Card } from "@uniz/ui";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { getAuthEnvironment } from "@/lib/auth-policy";
import { getCurrentAuthState } from "@/lib/auth";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import {
  DISCORD_GRANT_HINT_COOKIE,
  getDiscordGrantHint,
  isApprovedLoginRole,
  readLoginDestination,
} from "@/lib/login-flow";
import { LoginButtons } from "./login-buttons";
import "./auth.css";

export const metadata = { title: "로그인" };

const errors: Record<string, string> = {
  GuildMembership: "UNIZ Discord 서버의 멤버 계정으로 로그인해 주세요.",
  DiscordUnavailable:
    "Discord 또는 데이터베이스 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  OAuthSignin: "Discord 로그인 연결을 시작하지 못했습니다.",
  OAuthCallback: "Discord 인증을 완료하지 못했습니다.",
  CredentialsSignin: "개발 계정을 확인하지 못했습니다.",
  AccessDenied: "로그인 권한을 확인하지 못했습니다.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const config = getAuthEnvironment(process.env);
  const params = await searchParams;
  const cookieStore = await cookies();
  const storedCallback =
    cookieStore.get("__Secure-next-auth.callback-url")?.value ??
    cookieStore.get("next-auth.callback-url")?.value;
  const destination = readLoginDestination(
    params.callbackUrl ?? (params.error ? storedCallback : undefined),
    process.env.NEXTAUTH_URL,
  );
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={state.retryAfterSeconds} />;
  if (state.status === "AUTHENTICATED" && state.user && !state.user.isMock) {
    redirect(isApprovedLoginRole(state.user.role) ? destination : "/onboarding");
  }
  const grantHint = getDiscordGrantHint(process.env.DISCORD_CLIENT_ID);
  const rememberedGrant =
    grantHint !== null && cookieStore.get(DISCORD_GRANT_HINT_COOKIE)?.value === grantHint;
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Badge tone="primary">ONE HIVE. EVERY SEASON.</Badge>
        <Logo variant="detail" size="lg" className="auth-emblem" />
        <h1>
          시즌은 바뀌어도,
          <br />
          <span>우리는 함께.</span>
        </h1>
        <p>
          오늘의 작전부터 다음 서버까지.
          <br />
          UNIZ의 다음 여정을 함께 준비하세요.
        </p>
        <div className="auth-brand-detail">
          <span>
            <Check size={14} /> 하나의 커뮤니티
          </span>
          <span>
            <Check size={14} /> 계속되는 여정
          </span>
        </div>
      </div>
      <Card className="auth-card">
        <p className="mono-label">WELCOME TO UNIZ HIVE</p>
        <h2>로그인</h2>
        <p className="auth-intro">
          이미 승인된 멤버는 기존 Discord 계정으로 로그인하세요. 가입 신청과 멤버 승인을 다시 진행할
          필요가 없습니다.
        </p>
        {params.error && (
          <p className="auth-error" role="alert">
            {errors[params.error] ?? "로그인을 완료하지 못했습니다. 다시 시도해 주세요."}
          </p>
        )}
        <LoginButtons
          mockEnabled={config.mockEnabled}
          discordEnabled={config.discordEnabled}
          destination={destination}
          rememberedGrant={rememberedGrant}
          hasError={Boolean(params.error)}
        />
        <p className="auth-privacy">
          <ShieldCheck size={16} aria-hidden="true" /> Once Human UID는 기본적으로 공개되지
          않습니다.
        </p>
        <Link href="/" className="auth-back">
          <ArrowLeft size={14} aria-hidden="true" /> 대시보드 둘러보기
        </Link>
      </Card>
    </div>
  );
}
