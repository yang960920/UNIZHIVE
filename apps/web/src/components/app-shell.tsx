"use client";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Bell, ChevronDown, Ellipsis, LogOut, Search, Settings, ShieldCheck } from "lucide-react";
import type { HiveRole } from "@uniz/domain";
import { canOpenAdmin } from "@uniz/domain";
import { Avatar, Badge, Drawer, Modal } from "@uniz/ui";
import { Logo } from "./logo";
import { CommandPalette } from "./command-palette";
import { SessionKeeper, stopSessionRenewal } from "./session-keeper";
import { LoginReturnLink } from "./login-return-link";
import { isActivePath, navigation, visibleNavigation } from "@/lib/navigation";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";
import { loadPersonalNotifications } from "@/lib/personal-notification-actions";
import type { PersonalNotificationResult } from "@/lib/personal-notification-types";
import { PersonalNotifications } from "./personal-notifications";
import type { AuthStatus } from "@/lib/auth-policy";
import { PageBackdrop } from "./page-backdrop";

export type ShellUser = {
  id: string;
  name: string;
  role: HiveRole;
  isMock: boolean;
  imageUrl?: string | null;
} | null;
export function Navbar({
  user,
  sessionStatus = "GUEST",
  onSearch,
  onNotifications,
}: {
  user: ShellUser;
  sessionStatus?: AuthStatus;
  onSearch: () => void;
  onNotifications: () => void;
}) {
  const pathname = usePathname();
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" prefetch={false} aria-label="UNIZ HIVE 홈" className="brand-link">
          <Logo variant="horizontal" size="sm" />
          <Logo variant="compact" size="sm" className="mobile-brand" />
        </Link>
        <nav className="desktop-nav" aria-label="주 메뉴">
          {visibleNavigation(user).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={isActivePath(pathname, href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="navbar-actions">
          <button className="search-trigger" onClick={onSearch} aria-label="하이브 검색">
            <Search size={16} />
            <span>검색</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="icon-button notification-button"
            onClick={onNotifications}
            aria-label="알림 확인"
          >
            <Bell size={18} />
          </button>
          {user ? (
            <details className="account-menu">
              <summary>
                <Avatar name={user.name} size="sm" imageUrl={user.imageUrl} />
                <span className="account-name">{user.name}</span>
                <ChevronDown size={12} />
              </summary>
              <div className="account-popover">
                <p>
                  {user.name}
                  <Badge>{MEMBER_ROLE_LABELS[user.role]}</Badge>
                </p>
                {user.isMock && <small>개발용 계정</small>}
                <Link href="/settings" prefetch={false}>
                  <Settings size={15} />
                  계정 설정
                </Link>
                {canOpenAdmin(user.role) && (
                  <Link href="/admin" prefetch={false}>
                    <ShieldCheck size={15} />
                    관리 콘솔
                  </Link>
                )}
                {user.isMock && (
                  <Link href="/login" prefetch={false}>
                    개발 계정 변경
                  </Link>
                )}
                <button
                  onClick={() => {
                    stopSessionRenewal();
                    void signOut({ callbackUrl: "/" });
                  }}
                >
                  <LogOut size={15} />
                  로그아웃
                </button>
              </div>
            </details>
          ) : sessionStatus === "UNAVAILABLE" ? (
            <button type="button" className="button login-button" disabled aria-live="polite">
              연결 확인 중
            </button>
          ) : (
            <LoginReturnLink pathname={pathname}>
              {sessionStatus === "REAUTH_REQUIRED" ? "다시 로그인" : "로그인"}
            </LoginReturnLink>
          )}
        </div>
      </div>
    </header>
  );
}
export function MobileNav({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const primary = [
    navigation[0],
    navigation[1],
    { ...navigation[3], label: "파티" },
    { ...navigation[5], label: "빌드" },
  ];
  return (
    <>
      <nav className="mobile-nav" aria-label="모바일 주 메뉴">
        {primary.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={isActivePath(pathname, href) ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={1.6} />
            <span>{label}</span>
          </Link>
        ))}
        <button onClick={() => setMore(true)} aria-expanded={more}>
          <Ellipsis size={22} />
          <span>더 보기</span>
        </button>
      </nav>
      <Drawer open={more} onOpenChange={setMore} title="더 보기">
        <nav className="more-links" aria-label="추가 메뉴">
          {visibleNavigation(user)
            .filter((item) => ["/members", "/map", "/community", "/db"].includes(item.href))
            .map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} prefetch={false} onClick={() => setMore(false)}>
                <Icon size={20} />
                {label}
              </Link>
            ))}
          {user && canOpenAdmin(user.role) && (
            <Link href="/admin" prefetch={false} onClick={() => setMore(false)}>
              <ShieldCheck size={20} />
              관리 콘솔
            </Link>
          )}
          <Link href="/about" prefetch={false} onClick={() => setMore(false)}>
            UNIZ HIVE 소개
          </Link>
          <Link href="/settings" prefetch={false} onClick={() => setMore(false)}>
            계정 설정
          </Link>
        </nav>
      </Drawer>
    </>
  );
}
export function AppShell({
  user,
  sessionStatus = "GUEST",
  children,
}: {
  user: ShellUser;
  sessionStatus?: AuthStatus;
  children: ReactNode;
}) {
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [noticeData, setNoticeData] = useState<PersonalNotificationResult | null>(null);
  const [noticeOwner, setNoticeOwner] = useState<string | null>(null);
  const noticeContext = `${user?.id ?? "guest"}:${user?.role ?? "GUEST"}:${sessionStatus}`;
  const noticeRequest = useRef(0);
  function openNotifications() {
    setNotifications(true);
    setNoticeOwner(noticeContext);
    const request = ++noticeRequest.current;
    setNoticeData(null);
    void loadPersonalNotifications().then(
      (result) => {
        if (noticeRequest.current === request) setNoticeData(result);
      },
      () => {
        if (noticeRequest.current === request) setNoticeData({ mode: "ERROR" });
      },
    );
  }
  return (
    <PageBackdrop>
      <SessionKeeper enabled={Boolean(user && !user.isMock)} />
      <a href="#main-content" className="skip-link">
        본문으로 이동
      </a>
      <Navbar
        user={user}
        sessionStatus={sessionStatus}
        onSearch={() => setSearch(true)}
        onNotifications={openNotifications}
      />
      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div>
          <Logo variant="mono" size="sm" />
          <span>시즌이 바뀌어도, 하이브는 남는다.</span>
        </div>
        <div>
          <span className="mono">UNIZ HIVE · 기본 버전 0.1</span>
          <Link href="/about" prefetch={false}>
            소개
          </Link>
        </div>
      </footer>
      <MobileNav user={user} />
      <CommandPalette key={noticeContext} open={search} onOpenChange={setSearch} user={user} />
      <Modal
        open={notifications && noticeOwner === noticeContext}
        onOpenChange={setNotifications}
        title="사이트 알림"
        description="내 파티·시즌·게시글과 하이브 공지의 현재 알림입니다."
      >
        <PersonalNotifications
          result={noticeOwner === noticeContext ? noticeData : null}
          onRetry={openNotifications}
          onNavigate={() => setNotifications(false)}
        />
      </Modal>
    </PageBackdrop>
  );
}
