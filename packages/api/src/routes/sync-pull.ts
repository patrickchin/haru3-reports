/**
 * Sync pull endpoint.
 *
 *   GET /v1/sync/:table?cursor=2024-01-01T00:00:00Z&limit=500
 *
 * Returns rows the authenticated user can see, ordered by `updated_at`
 * ASC, including soft-deleted (tombstone) rows. Replaces the
 * `pull_<table>_since` RPCs.
 *
 * Response shape:
 *   {
 *     rows: PullRow[],
 *     nextCursor: string | null  // ISO-8601 timestamp; null when fewer
 *                                // than `limit` rows came back (caller
 *                                // is fully synced for now)
 *   }
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
  PULLABLE_TABLES,
  isPullableTable,
  pull,
  type PullableTable,
  type Sql,
} from "../services/sync-pull.js";

const querySchema = z.object({
  cursor: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  limit: z
    .string()
    .regex(/^\d+$/, "limit must be a positive integer")
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().min(MIN_LIMIT).max(MAX_LIMIT))
    .optional(),
});

export interface SyncPullDeps {
  /** Lazy supplier so tests can inject a fake without touching DB env. */
  readonly getSql: () => Sql;
}

export function createSyncPullRoutes(
  deps: SyncPullDeps,
): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware());

  app.get("/:table", async (c) => {
    const tableParam = c.req.param("table");
    if (!isPullableTable(tableParam)) {
      throw new HTTPException(404, {
        message: `Unknown sync table: ${tableParam}`,
      });
    }
    const table: PullableTable = tableParam;

    const parsed = querySchema.safeParse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit"),
    });
    if (!parsed.success) {
      throw new HTTPException(422, {
        message: "Invalid query parameters",
        cause: parsed.error,
      });
    }

    const cursor = parsed.data.cursor ? new Date(parsed.data.cursor) : null;
    const limit = parsed.data.limit ?? DEFAULT_LIMIT;

    const rows = await pull(table, {
      sql: deps.getSql(),
      userId: c.get("userId"),
      cursor,
      limit,
    });

    const last = rows.at(-1);
    const lastUpdatedAt =
      last && typeof last["updated_at"] !== "undefined"
        ? coerceIso(last["updated_at"])
        : null;
    const nextCursor = rows.length === limit ? lastUpdatedAt : null;

    return c.json({ rows, nextCursor });
  });

  return app;
}

function coerceIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export { PULLABLE_TABLES };
