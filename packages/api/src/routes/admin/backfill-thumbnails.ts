/**
 * POST /v1/admin/backfill-thumbnails
 *
 * Service-role-gated admin endpoint. Authentication is via
 * `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (constant-time
 * compared) — *not* the user JWT middleware.
 *
 * The actual thumbnail-backfill work is delegated to a service callback
 * to keep this route thin and testable. Default implementation lives in
 * the supabase edge function until P9; for the REST API we simply gate
 * and forward.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { timingSafeEqual } from "node:crypto";

export interface BackfillResult {
  readonly processed: number;
  readonly errors: number;
  readonly details?: unknown;
}

export interface BackfillThumbnailsRouteDeps {
  /** Implementation injected for tests; production wires to a real worker. */
  readonly backfill?: () => Promise<BackfillResult>;
  /** Override service-role key lookup (defaults to env at request time). */
  readonly serviceRoleKey?: () => string | undefined;
}

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function authoriseServiceRole(
  authHeader: string,
  expected: string | undefined,
): void {
  if (!expected) {
    throw new HTTPException(503, {
      message: "Server not configured — SUPABASE_SERVICE_ROLE_KEY missing",
    });
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new HTTPException(403, { message: "Service role required" });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!constantTimeEq(token, expected)) {
    throw new HTTPException(403, { message: "Service role required" });
  }
}

export function createAdminRoutes(
  deps: BackfillThumbnailsRouteDeps = {},
): Hono {
  const app = new Hono();

  app.post("/backfill-thumbnails", async (c) => {
    const expected = (deps.serviceRoleKey ??
      (() =>
        process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
        process.env["SERVICE_ROLE_KEY"]))();
    authoriseServiceRole(c.req.header("authorization") ?? "", expected);

    if (!deps.backfill) {
      throw new HTTPException(501, {
        message: "Backfill not yet wired (port pending — see P9)",
      });
    }
    const result = await deps.backfill();
    return c.json(result);
  });

  return app;
}
