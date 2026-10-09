/** Resolve runtime database configuration, including Vercel's Supabase integration. */
export function resolveDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim() || undefined;
}
