import { redirect } from "next/navigation";
import { Card } from "@uniz/ui";
import { requireAdmin } from "@/lib/server/admin";

export default async function NewOperationPage() {
  const actor = await requireAdmin("operations");
  if (actor.isMock)
    return (
      <Card>
        <p>실제 Discord 계정으로 로그인해주세요.</p>
      </Card>
    );
  redirect("/ops/new");
}
