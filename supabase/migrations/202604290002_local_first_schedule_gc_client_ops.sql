-- =================================================================
-- Local-first: schedule the existing gc_client_ops() function
--
-- The `client_ops` table is the server-side idempotency log used by
-- apply_*_mutation. Without GC it grows unbounded. The
-- `public.gc_client_ops(p_older_than)` function (added in
-- 202604280002) deletes rows older than the given interval.
--
-- This migration wires it to pg_cron so it actually runs. We schedule
-- a daily job at 03:10 UTC that prunes entries older than 7 days.
--
-- M4 from the local-first review.
--
-- Idempotency:
--   - `CREATE EXTENSION IF NOT EXISTS` is safe to re-run.
--   - The job is identified by `jobname` and is re-created on each
--     migration run so the schedule / SQL stay in sync with this file.
--
-- Platform fallback:
--   - If pg_cron is not available on the target Postgres instance,
--     this migration emits a NOTICE and exits cleanly. Operators can
--     run `select public.gc_client_ops();` manually until pg_cron is
--     enabled (Supabase: Database → Extensions → pg_cron).
-- =================================================================

DO $migration$
DECLARE
  v_have_pg_cron boolean;
  v_jobid        bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO v_have_pg_cron;

  IF NOT v_have_pg_cron THEN
    RAISE NOTICE
      'pg_cron is not available on this instance; skipping gc_client_ops schedule.'
      ' Run select public.gc_client_ops(); manually or enable pg_cron and re-run.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Re-create the job so this migration is the source of truth for
  -- both the schedule and the SQL.
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'gc_client_ops_daily';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'gc_client_ops_daily',
    '10 3 * * *',                     -- daily at 03:10 UTC
    $job$SELECT public.gc_client_ops('7 days'::interval);$job$
  );
END
$migration$;
