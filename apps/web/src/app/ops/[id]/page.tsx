import { notFound } from "next/navigation";
import { z } from "zod";
import { OperationBriefing, OperationDemoNotice } from "@/components/operation-directory";
import { OperationalAccessNotice } from "@/components/live-operations";
import { getOperationDirectoryDetail } from "@/lib/server/operation-directory";

export default async function OperationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const provider = await getOperationDirectoryDetail(id);
  if (provider.mode === "DEMO") return <OperationDemoNotice />;
  if (provider.mode !== "LIVE")
    return (
      <OperationalAccessNotice
        mode={provider.mode}
        retryHref={`/ops/${id}`}
        retryAfterSeconds={provider.retryAfterSeconds}
      />
    );
  if (!provider.data) notFound();
  return <OperationBriefing operation={provider.data} />;
}
