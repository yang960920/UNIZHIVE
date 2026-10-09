import { GameInfoDirectory } from "@/components/game-info/views";
import { gameInfoCategory } from "@/lib/game-info-examples";
import { getGameInfoRecords } from "@/lib/server/game-info";
import { normalizeSearchQuery } from "@/lib/unified-search";
import { getCurrentAuthState } from "@/lib/auth";
import { isDpsMember, isDpsStaff } from "@/lib/dps-research";
import { getDpsDirectory } from "@/lib/server/dps-research-repository";

export const metadata = { title: "게임 정보" };

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = normalizeSearchQuery(params.q);
  const category = gameInfoCategory(params.category);
  const page =
    typeof params.page === "string" && /^[1-9]\d{0,3}$/.test(params.page) ? Number(params.page) : 1;
  const auth = await getCurrentAuthState();
  let research;
  let notice;
  try {
    research = !category || category === "dps" ? await getDpsDirectory({ q, page }) : undefined;
  } catch {
    notice = "실측 자료에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.";
  }
  return (
    <GameInfoDirectory
      records={getGameInfoRecords()}
      q={q}
      category={category}
      research={research}
      canCreate={auth.status === "AUTHENTICATED" && isDpsMember(auth.user)}
      canReview={auth.status === "AUTHENTICATED" && isDpsStaff(auth.user)}
      notice={notice}
    />
  );
}
