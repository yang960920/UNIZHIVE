import "server-only";
import { redirect } from "next/navigation";
import {
  canApproveMember,
  canCreateOperation,
  canManageIntegrations,
  canManageSeason,
  canModerateCommunity,
  canOpenAdmin,
  canVerifyGameData,
} from "@uniz/domain";
import { getCurrentAuthState, type CurrentUser } from "../auth";

export const adminSections = {
  members: {
    label: "멤버 관리",
    title: "멤버 관리",
    description: "가입 신청을 검토하고 멤버 권한을 관리하는 공간입니다.",
    permission: canApproveMember,
  },
  seasons: {
    label: "시즌 관리",
    title: "시즌 관리",
    description: "시즌 일정, 가변 Phase, 이동 준비와 투표를 관리하는 공간입니다.",
    permission: canManageSeason,
  },
  operations: {
    label: "작전 관리",
    title: "작전 관리",
    description: "작전 일정과 참석 현황, 역할 배정을 관리하는 공간입니다.",
    permission: canCreateOperation,
  },
  community: {
    label: "커뮤니티 관리",
    title: "커뮤니티 관리",
    description: "공지와 커뮤니티 게시물을 검토하는 공간입니다.",
    permission: canModerateCommunity,
  },
  builds: {
    label: "빌드 공유 검토",
    title: "빌드 공유 검토",
    description: "신청한 버전의 공유를 승인하고 관리자 추천도를 기록하는 공간입니다.",
    permission: canApproveMember,
  },
  database: {
    label: "게임 데이터 검증",
    title: "게임 데이터 검증",
    description: "출처와 검증 상태를 기록한 게임 데이터를 관리하는 공간입니다.",
    permission: canVerifyGameData,
  },
  integrations: {
    label: "외부 연결 관리",
    title: "외부 연결 관리",
    description: "Discord, Steam, TH.GL과 공식 소식 연결 상태를 확인하는 공간입니다.",
    permission: canManageIntegrations,
  },
} as const;

export type AdminSection = keyof typeof adminSections;

export async function requireAdmin(section?: AdminSection): Promise<CurrentUser> {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") {
    // Temporary verification outages must never send a signed-in operator to the login flow.
    throw new Error("Admin authorization is temporarily unavailable.");
  }
  if (status === "LEFT") redirect("/login?error=GuildMembership&callbackUrl=/admin");
  if (status === "REAUTH_REQUIRED") redirect("/login?error=AccessDenied&callbackUrl=/admin");
  if (status !== "AUTHENTICATED" || !user) redirect("/login?callbackUrl=/admin");
  // An authenticated permission denial is not a failed login. Keep the current session
  // and return operators to their permitted tools; ordinary members return to HOME.
  if (!canOpenAdmin(user)) redirect("/");
  if (section && !adminSections[section].permission(user)) redirect(`/admin?denied=${section}`);
  return user;
}

export function getAdminDenialNotice(value: unknown, user: CurrentUser): string | null {
  if (typeof value !== "string" || !Object.hasOwn(adminSections, value)) return null;
  const section = value as AdminSection;
  if (adminSections[section].permission(user)) return null;
  return section === "members"
    ? "멤버 정보와 가입·권한 관리는 관리자 전용입니다. 현재 로그인은 유지되고 있습니다."
    : `${adminSections[section].title}는 관리자 전용입니다. 현재 로그인은 유지되고 있습니다.`;
}

export function getAdminNavigation(user: CurrentUser): { href: string; label: string }[] {
  return [
    { href: "/admin", label: "관리 홈" },
    ...Object.entries(adminSections)
      .filter(([, section]) => section.permission(user))
      .map(([key, section]) => ({ href: `/admin/${key}`, label: section.label })),
  ];
}
