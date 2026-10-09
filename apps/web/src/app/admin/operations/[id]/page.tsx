import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";
import {
  getOperationAdminData,
  getOperationAdminDetail,
} from "@/lib/server/operation-administration";
import { operationStatusLabels } from "@/lib/admin-format";
import { OperationForm } from "../forms";
import "../../administration.css";

export default async function OperationEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin("operations");
  if (actor.isMock)
    return (
      <Card>
        <p>실제 Discord 계정으로 로그인해주세요.</p>
      </Card>
    );
  const { id } = await params;
  const [data, detail] = await Promise.all([getOperationAdminData(), getOperationAdminDetail(id)]);
  if (!detail) notFound();
  if (detail.contentKey)
    redirect(`/ops/${detail.id}${detail.status === "SCHEDULED" ? "/edit" : ""}`);
  const labels = { GOING: "참가", MAYBE: "미정", UNAVAILABLE: "불참" } as const;
  return (
    <div className="cms-stack">
      <PageHeader
        eyebrow="OPERATION EDITOR"
        title={detail.title}
        description="일정과 참가 기록을 확인하고 관리하세요."
        action={
          <Link href="/admin/operations" className="button button-quiet">
            작전 목록
          </Link>
        }
      />
      <Card>
        <div className="cms-topline">
          <h2>작전 정보</h2>
          <Badge>{operationStatusLabels[detail.status]}</Badge>
        </div>
        <OperationForm key={detail.updatedAt} seasons={data.seasons} initial={detail} />
      </Card>
      <Card>
        <h2>
          참가 응답 · {detail.goingCount} / {detail.capacity}
        </h2>
        {detail.attendees.length ? (
          <div className="cms-table-scroll">
            <table className="cms-table">
              <thead>
                <tr>
                  <th>멤버</th>
                  <th>응답</th>
                  <th>배정 역할</th>
                </tr>
              </thead>
              <tbody>
                {detail.attendees.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {actor.role === "ADMIN" && a.handle ? (
                        <Link href={`/members/${a.handle}`}>{a.displayName}</Link>
                      ) : (
                        a.displayName
                      )}
                    </td>
                    <td>{labels[a.status]}</td>
                    <td>{a.roleName ?? "미배정"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cms-empty">아직 참가 응답이 없습니다.</p>
        )}
        {detail.roles.length > 0 && (
          <ul className="cms-list">
            {detail.roles.map((r) => (
              <li key={r.id}>
                <span>{r.name}</span>
                <span>{r.capacity}자리</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
