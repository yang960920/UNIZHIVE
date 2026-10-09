import Link from "next/link";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { ArrowUpRight } from "lucide-react";
import { adminSections, getAdminDenialNotice, requireAdmin } from "@/lib/server/admin";
import { MEMBER_ROLE_LABELS } from "@/lib/member-policy";

export const metadata = { title: "관리 · UNIZ HIVE" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ denied?: string | string[] }>;
} = {}) {
  const user = await requireAdmin();
  const notice = getAdminDenialNotice((await searchParams)?.denied, user);
  return (
    <>
      <PageHeader
        eyebrow="관리 콘솔"
        title="운영의 중심"
        description={`${user.name}님, 사용할 수 있는 운영 도구를 선택하세요.`}
        action={<Badge tone="primary">{MEMBER_ROLE_LABELS[user.role]}</Badge>}
      />
      {notice && (
        <Card>
          <p role="status">{notice}</p>
        </Card>
      )}
      <div className="admin-overview">
        {Object.entries(adminSections)
          .filter(([, section]) => section.permission(user))
          .map(([key, section]) => (
            <Link href={`/admin/${key}`} key={key}>
              <Card className="admin-section-card">
                <Badge>{section.label.toUpperCase()}</Badge>
                <h3>
                  {section.title} <ArrowUpRight size={14} aria-hidden="true" />
                </h3>
                <p>{section.description}</p>
              </Card>
            </Link>
          ))}
      </div>
    </>
  );
}
