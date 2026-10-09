import { OperationDemoNotice, OperationDirectory } from "@/components/operation-directory";
import { OperationalAccessNotice } from "@/components/live-operations";
import { getOperationDirectory } from "@/lib/server/operation-directory";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const provider = await getOperationDirectory(query);
  if (provider.mode === "LIVE") return <OperationDirectory data={provider.data} />;
  if (provider.mode === "DEMO") return <OperationDemoNotice />;
  return (
    <OperationalAccessNotice
      mode={provider.mode}
      retryHref="/ops"
      retryAfterSeconds={provider.retryAfterSeconds}
    />
  );
}
