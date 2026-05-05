/**
 * GET /v1/health — liveness/readiness probe.
 *
 * Checked by Fly.io's [[services.http_checks]] every 10s. Returns 503
 * when the database is configured but unreachable so Fly will restart
 * the machine.
 */
import { Hono } from "hono";
import { getEnv } from "../env.js";

export type HealthStatus = {
  status: "ok" | "degraded";
  service: string;
  version: string;
  uptimeSeconds: number;
  db: "configured" | "not_configured" | "error";
  env: string;
};

const startedAt = Date.now();

// Lazy import keeps the health route dependency-free in unit tests
// where postgres isn't installed yet.
async function pingDb(): Promise<"configured" | "not_configured" | "error"> {
  const env = getEnv();
  if (!env.DATABASE_URL) return "not_configured";
  try {
    const { default: postgres } = await import("postgres");
    const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 2 });
    try {
      await sql`select 1`;
      return "configured";
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch {
    return "error";
  }
}

export const healthRoutes = new Hono().get("/", async (c) => {
  const env = getEnv();
  const db = await pingDb();
  const status: HealthStatus["status"] = db === "error" ? "degraded" : "ok";
  const body: HealthStatus = {
    status,
    service: "harpa-api",
    version: process.env.npm_package_version ?? "0.0.1",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    db,
    env: env.NODE_ENV,
  };
  return c.json(body, status === "ok" ? 200 : 503);
});
