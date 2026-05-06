/**
 * Returns the raw `postgres` Sql client (separate from the Drizzle
 * client used by ORM code). Sync pull queries use raw tagged-template
 * SQL to mirror the legacy RPCs byte-for-byte.
 */
import postgres from "postgres";
import { getEnv } from "../env.js";

export type Sql = postgres.Sql;

let cached: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (cached) return cached;
  const env = getEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set; cannot create SQL client");
  }
  cached = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  });
  return cached;
}

export async function closeSql(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = null;
  }
}

export function resetSqlForTesting(): void {
  cached = null;
}
