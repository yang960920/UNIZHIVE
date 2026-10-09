import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { resolveDatabaseUrl } from "./environment";
import * as schema from "./schema";

let database: PostgresJsDatabase<typeof schema> | undefined;

/** Lazy initialization keeps mock development and static builds independent of PostgreSQL. */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (database) return database;
  const url = resolveDatabaseUrl(process.env);
  if (!url) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required for live database access.");
  }
  database = drizzle(postgres(url, { max: 5, prepare: false }), { schema });
  return database;
}
