/**
 * Sync pull service.
 *
 * Mirrors the production `pull_<table>_since(p_cursor, p_limit)` RPCs
 * defined in `supabase/migrations/202604280001_local_first_pull_rpcs.sql`
 * and `supabase/migrations/202604300001_report_notes.sql` so that the
 * REST API can replace those RPCs without changing client behaviour.
 *
 * **Parity rules (must match the RPCs byte-for-byte):**
 *   - WHERE includes soft-deleted rows (no `deleted_at IS NULL` filter)
 *   - ORDER BY `updated_at` ASC
 *   - `LIMIT GREATEST(1, LEAST(p_limit, 1000))`
 *   - `cursor` is `timestamptz`; rows with `updated_at > cursor` are returned
 *   - All authz is enforced explicitly here (the RPCs are SECURITY DEFINER
 *     and bypass RLS — we have no RLS in the API path either, so authz is
 *     equivalent and explicit)
 *
 * Uses tagged-template SQL via `postgres` for parameterised, injection-safe
 * queries. The `Sql` type is a narrow interface so tests can inject a fake.
 */

import type postgres from "postgres";

/** The set of tables the mobile sync engine pulls from. */
export const PULLABLE_TABLES = [
  "projects",
  "reports",
  "project_members",
  "file_metadata",
  "report_notes",
] as const;

export type PullableTable = (typeof PULLABLE_TABLES)[number];

export const MIN_LIMIT = 1;
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 1000;

/**
 * Subset of the `postgres` Sql client we depend on. Tests pass a fake
 * implementing the same tagged-template signature.
 */
export type Sql = postgres.Sql;

export interface PullArgs {
  readonly sql: Sql;
  readonly userId: string;
  readonly cursor: Date | null;
  readonly limit: number;
}

/** Server-shaped row coming out of the DB. Untyped on purpose: the
 *  client side already validates the row shape; we don't want to
 *  re-derive 5 entity types here. */
export type PullRow = Record<string, unknown>;

export function clampLimit(input: number | undefined): number {
  if (input === undefined || !Number.isFinite(input)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.trunc(input)));
}

/**
 * Pulls all rows of `table` that the user can see, ordered by
 * `updated_at` ASC, optionally after `cursor`.
 */
export async function pull(
  table: PullableTable,
  { sql, userId, cursor, limit }: PullArgs,
): Promise<PullRow[]> {
  const safeLimit = clampLimit(limit);

  switch (table) {
    case "projects":
      return sql<PullRow[]>`
        SELECT * FROM public.projects
        WHERE (
          owner_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = projects.id AND pm.user_id = ${userId}
          )
        )
        AND (${cursor}::timestamptz IS NULL OR updated_at > ${cursor}::timestamptz)
        ORDER BY updated_at ASC
        LIMIT ${safeLimit}
      `;

    case "reports":
      return sql<PullRow[]>`
        SELECT r.* FROM public.reports r
        WHERE (
          r.owner_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = r.project_id AND pm.user_id = ${userId}
          )
        )
        AND (${cursor}::timestamptz IS NULL OR r.updated_at > ${cursor}::timestamptz)
        ORDER BY r.updated_at ASC
        LIMIT ${safeLimit}
      `;

    case "project_members":
      return sql<PullRow[]>`
        SELECT pm.* FROM public.project_members pm
        WHERE EXISTS (
          SELECT 1 FROM public.project_members me
          WHERE me.project_id = pm.project_id AND me.user_id = ${userId}
        )
        AND (${cursor}::timestamptz IS NULL OR pm.updated_at > ${cursor}::timestamptz)
        ORDER BY pm.updated_at ASC
        LIMIT ${safeLimit}
      `;

    case "file_metadata":
      return sql<PullRow[]>`
        SELECT fm.* FROM public.file_metadata fm
        JOIN public.projects p ON p.id = fm.project_id
        WHERE (
          p.owner_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = fm.project_id AND pm.user_id = ${userId}
          )
        )
        AND (${cursor}::timestamptz IS NULL OR fm.updated_at > ${cursor}::timestamptz)
        ORDER BY fm.updated_at ASC
        LIMIT ${safeLimit}
      `;

    case "report_notes":
      return sql<PullRow[]>`
        SELECT rn.* FROM public.report_notes rn
        WHERE (
          rn.author_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = rn.project_id AND pm.user_id = ${userId}
          )
        )
        AND (${cursor}::timestamptz IS NULL OR rn.updated_at > ${cursor}::timestamptz)
        ORDER BY rn.updated_at ASC
        LIMIT ${safeLimit}
      `;
  }
}

export function isPullableTable(value: string): value is PullableTable {
  return (PULLABLE_TABLES as readonly string[]).includes(value);
}
