import {
  BookOpen,
  CalendarDays,
  Database,
  FlaskConical,
  House,
  Map,
  Shield,
  Users,
  MessagesSquare,
} from "lucide-react";
import { canViewAdminMemberDirectory, type PermissionPrincipal } from "@uniz/domain";
export const navigation = [
  { href: "/", label: "홈", name: "홈 대시보드", icon: House },
  { href: "/season", label: "시즌", name: "시즌 허브", icon: Shield },
  { href: "/members", label: "멤버", name: "하이브 멤버", icon: Users },
  { href: "/ops", label: "파티 모집", name: "파티 모집 달력", icon: CalendarDays },
  { href: "/map", label: "지도", name: "인터랙티브 지도", icon: Map },
  { href: "/lab", label: "빌드 연구실", name: "빌드 연구실", icon: FlaskConical },
  { href: "/community", label: "커뮤니티", name: "가이드와 커뮤니티", icon: MessagesSquare },
  { href: "/db", label: "게임 정보", name: "게임 데이터베이스", icon: Database },
];
export const systemNavigation = [
  { href: "/about", name: "UNIZ HIVE 소개", icon: BookOpen },
  { href: "/settings", name: "계정 설정", icon: Users },
];
export function visibleNavigation(principal: PermissionPrincipal) {
  return navigation.filter(
    (item) => item.href !== "/members" || canViewAdminMemberDirectory(principal),
  );
}
export function isActivePath(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}
