/**
 * Environment configuration for the API server.
 *
 * Validates required env vars at startup; fails fast if anything is
 * missing. Production runs must set all of these via Doppler.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Database — required in production, optional locally so `pnpm dev`
  // can boot without a DB for the health endpoint.
  DATABASE_URL: z.string().url().optional(),

  // Supabase — used for JWT verification (JWKS) and storage admin.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // CORS — comma-separated list of allowed origins for the playground.
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Test-only HS256 secret. Required when NODE_ENV === "test"; rejected
  // in production by the auth middleware.
  TEST_JWT_SECRET: z.string().optional(),

  // Optional observability.
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  // Hard requirements only enforced in production.
  if (parsed.data.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!parsed.data.DATABASE_URL) missing.push("DATABASE_URL");
    if (!parsed.data.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (missing.length > 0) {
      throw new Error(
        `Missing required production env vars: ${missing.join(", ")}`,
      );
    }
  }

  return parsed.data;
}

export function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

/** Test-only: reset the cached env (e.g. between test suites). */
export function resetEnvForTesting(): void {
  cached = null;
}
