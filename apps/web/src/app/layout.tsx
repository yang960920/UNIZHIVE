import type { Metadata } from "next";
import "pretendard/dist/web/static/pretendard.css";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getCurrentSessionState } from "@/lib/auth";
import { getUserPreferences } from "@/lib/server/user-preferences";
import { DEFAULT_USER_PREFERENCES } from "@/lib/user-preferences";
import { UserPreferencesProvider } from "@/components/user-preferences-provider";

export const metadata: Metadata = {
  title: { default: "UNIZ HIVE — 시즌이 바뀌어도 하이브는 남는다", template: "%s · UNIZ HIVE" },
  description: "Once Human 한국 하이브 UNIZ의 시즌, 작전, 커뮤니티 플랫폼.",
  icons: { icon: "/brand/emblem-compact.png", apple: "/brand/emblem-compact.png" },
};
// Session and permission checks must run for every request, including credential-free builds.
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The shell displays signed identity only; protected pages and actions verify guild access.
  const { user, status } = await getCurrentSessionState();
  const preferences = await getUserPreferences(user).catch(() => DEFAULT_USER_PREFERENCES);
  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      data-text-size={preferences.textSize}
      data-reduce-motion={preferences.reduceMotion ? "true" : "false"}
    >
      <body>
        <UserPreferencesProvider initial={preferences} userKey={user?.id ?? "visitor"}>
          <AppShell user={user} sessionStatus={status}>
            {children}
          </AppShell>
        </UserPreferencesProvider>
      </body>
    </html>
  );
}
