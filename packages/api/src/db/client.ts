/**
 * Lazy Drizzle client. Only constructs a connection when first used so
 * unit tests (which don't need DB) don't import `postgres` and fail on
 * missing `DATABASE_URL`.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../env.js";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let cached: DbClient | null = null;
let pool: ReturnType<typeof postgres> | null = null;

export function getDb(): DbClient {
  if (cached) return cached;
  const env = getEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set; cannot create DB client");
  }
  pool = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // required when using PgBouncer in transaction mode
  });
  cached = drizzle(pool, { schema });
  return cached;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end({ timeout: 5 });
    pool = null;
    cached = null;
  }
}

export { schema };
