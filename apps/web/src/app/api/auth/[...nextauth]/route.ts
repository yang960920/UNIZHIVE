import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAuthEnvironment } from "@/lib/auth-policy";

const handler = NextAuth(authOptions);

async function authHandler(request: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const environment = getAuthEnvironment(process.env);
  if (!environment.mockEnabled && !environment.discordEnabled) {
    return Response.json(
      {
        error:
          "Authentication is not configured. Set Discord credentials, guild ID, database and a production secret.",
      },
      { status: 503 },
    );
  }
  return handler(request, { params: await context.params });
}

export { authHandler as GET, authHandler as POST };
