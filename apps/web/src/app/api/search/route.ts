import { getUnifiedSearch } from "@/lib/server/unified-search";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const data = await getUnifiedSearch({
    q: params.get("q"),
    category: params.get("category"),
    page: params.get("page"),
  });
  return Response.json(data, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
