import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@uniz/ui";
import { adminSections, requireAdmin, type AdminSection } from "@/lib/server/admin";

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(adminSections, section)) notFound();
  const definition = adminSections[section as AdminSection];
  const user = await requireAdmin(section as AdminSection);
  return (
    <>
      <PageHeader
        eyebrow="HIVE ADMIN"
        title={definition.title}
        description={definition.description}
        action={<Badge tone="primary">{user.role}</Badge>}
      />
      <Card>
        <EmptyState
          title="운영 도구를 준비하고 있습니다"
          description="현재 단계에서는 접근 권한과 화면 구조까지 준비했습니다. 실제 변경 작업과 승인 기록은 이후 단계에서 연결됩니다."
        />
      </Card>
    </>
  );
}
