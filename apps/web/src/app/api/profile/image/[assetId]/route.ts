import { getCurrentAuthState } from "@/lib/auth";
import { readProfileImage } from "@/lib/server/profile-images";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { user, status } = await getCurrentAuthState();
  if (status === "UNAVAILABLE") return new Response(null, { status: 503, headers: privateHeaders });
  if (status !== "AUTHENTICATED" || !user || user.isMock)
    return new Response(null, { status: 404, headers: privateHeaders });
  try {
    const { assetId } = await context.params;
    const image = await readProfileImage(user, assetId, new URL(request.url).searchParams.get("v"));
    if (!image) return new Response(null, { status: 404, headers: privateHeaders });
    return new Response(new Uint8Array(image), {
      headers: {
        ...privateHeaders,
        "Content-Type": "image/webp",
        "Content-Length": String(image.length),
      },
    });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
