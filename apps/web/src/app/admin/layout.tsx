import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { getAdminNavigation, requireAdmin } from "@/lib/server/admin";
import { getCurrentAuthState } from "@/lib/auth";
import { AuthRetryNotice } from "@/components/auth-retry-notice";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";
import "../login/auth.css";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const authorization = await getCurrentAuthState();
  if (authorization.status === "UNAVAILABLE")
    return <AuthRetryNotice retryAfterSeconds={authorization.retryAfterSeconds} />;
  const user = await requireAdmin();
  return (
    <div>
      <div className="admin-mode-bar">
        <ShieldCheck size={16} aria-hidden="true" />
        <strong>운영 관리</strong>
        <span>하이브 운영 공간 · {MEMBER_ROLE_LABELS[user.role]}</span>
      </div>
      <div className="admin-layout">
        <Sidebar title="관리 콘솔" items={getAdminNavigation(user)} />
        <div>{children}</div>
      </div>
    </div>
  );
}
