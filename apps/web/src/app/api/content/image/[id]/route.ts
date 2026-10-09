import { getCurrentAuthState } from "@/lib/auth";
import { readContentImage } from "@/lib/server/content-media";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
  const state = await getCurrentAuthState();
  if (state.status === "UNAVAILABLE") return new Response(null, { status: 503, headers });
  if (state.status === "REAUTH_REQUIRED" || state.status === "LEFT")
    return new Response(null, { status: 401, headers });
  try {
    const image = await readContentImage(state.user, (await params).id);
    return image
      ? new Response(new Uint8Array(image), {
          headers: { ...headers, "Content-Type": "image/webp" },
        })
      : new Response(null, { status: 404, headers });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
