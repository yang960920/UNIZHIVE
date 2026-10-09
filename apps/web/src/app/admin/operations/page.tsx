import Link from "next/link";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import { getOperationAdminData } from "@/lib/server/operation-administration";
import { operationStatusLabels, operationTypeLabels, scheduleDate } from "@/lib/admin-format";
import { getPartyContent } from "@/lib/party-content";
import "../administration.css";

export default async function OperationsAdminPage() {
  const actor = await requireAdmin("operations");
  if (actor.isMock)
    return (
      <>
        <PageHeader title="작전 관리" />
        <Card>
          <p className="cms-readonly">
            실제 Discord 관리자 계정으로 로그인하면 작전을 등록할 수 있습니다.
          </p>
        </Card>
      </>
    );
  const data = await getOperationAdminData();
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow="OPERATION MANAGEMENT"
        title="파티 모집 관리"
        description="일정과 정원을 등록하고 참가 응답을 확인하세요."
        action={
          <Link href="/ops/new" className="button button-primary">
            파티 모집하기
          </Link>
        }
      />
      <Card>
        <h2>하이브 작전 · {data.operations.length}건</h2>
        {data.operations.length ? (
          <div className="cms-table-scroll">
            <table className="cms-table">
              <thead>
                <tr>
                  <th>작전</th>
                  <th>일시</th>
                  <th>참가</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.operations.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link
                        className="cms-title-link"
                        href={o.contentKey ? `/ops/${o.id}` : `/admin/operations/${o.id}`}
                      >
                        {o.title}
                      </Link>
                      <small>
                        {getPartyContent(o.contentKey)?.label ?? operationTypeLabels[o.type]} ·{" "}
                        {o.seasonName ?? "하이브 공통"}
                      </small>
                    </td>
                    <td>{scheduleDate(o.startsAt)}</td>
                    <td>
                      {o.goingCount} / {o.capacity}
                      <small>미정 {o.maybeCount}명</small>
                    </td>
                    <td>
                      <Badge tone={o.status === "SCHEDULED" ? "primary" : "default"}>
                        {operationStatusLabels[o.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cms-empty">
            등록된 작전이 없습니다. 첫 작전을 등록하면 HOME에 다음 일정이 표시됩니다.
          </p>
        )}
      </Card>
    </div>
  );
}
