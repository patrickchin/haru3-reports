-- Drop offline-mode v1 RPCs.
--
-- Step 8 of docs/features/local-first-offline/removal-plan.md. The
-- mobile app no longer uses these — push/pull engines and the outbox
-- were deleted in step 5; everything goes through PostgREST directly.
--
-- We drop:
--   - apply_project_mutation(jsonb)
--   - apply_report_mutation(jsonb)
--   - apply_report_note_mutation(jsonb)
--   - apply_file_metadata_mutation(jsonb)
--   - pull_projects_since(timestamptz, integer)
--   - pull_reports_since(timestamptz, integer)
--   - pull_project_members_since(timestamptz, integer)
--   - pull_file_metadata_since(timestamptz, integer)
--   - pull_report_notes_since(timestamptz, integer)
--   - gc_client_ops(interval)              -- only ever called from the cron job below
--   - public.client_ops                    -- idempotency table for the apply_* RPCs
--   - the pg_cron job that schedules gc_client_ops (best-effort; not all
--     instances have pg_cron installed, mirroring the original schedule
--     migration's behaviour).
--
-- Base tables (projects, reports, report_notes, project_members,
-- file_metadata) and their RLS policies are unchanged — REST clients
-- still need them. apply_project_member_mutation was named in the
-- removal plan but never landed in production migrations, so there
-- is nothing to drop for project members.

BEGIN;

-- 1. Unschedule gc_client_ops from pg_cron, if pg_cron is installed.
--    Mirrors the gating in 202604290002_local_first_schedule_gc_client_ops.sql
--    so the migration is safe on instances without pg_cron.
DO $$
DECLARE
  v_have_pg_cron boolean;
  v_jobid integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_have_pg_cron;

  IF v_have_pg_cron THEN
    SELECT jobid INTO v_jobid
    FROM cron.job
    WHERE jobname = 'gc_client_ops_daily';

    IF v_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(v_jobid);
    END IF;
  END IF;
END
$$;

-- 2. Drop the apply_* RPCs. SECURITY DEFINER + jsonb-payload signature.
DROP FUNCTION IF EXISTS public.apply_project_mutation(jsonb);
DROP FUNCTION IF EXISTS public.apply_report_mutation(jsonb);
DROP FUNCTION IF EXISTS public.apply_report_note_mutation(jsonb);
DROP FUNCTION IF EXISTS public.apply_file_metadata_mutation(jsonb);

-- 3. Drop the pull_*_since RPCs. (timestamptz, integer) signature.
DROP FUNCTION IF EXISTS public.pull_projects_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_reports_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_project_members_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_file_metadata_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_report_notes_since(timestamptz, integer);

-- 4. Drop the gc helper that only the apply_* RPCs needed.
DROP FUNCTION IF EXISTS public.gc_client_ops(interval);

-- 5. Drop the idempotency table. CASCADE clears RLS policies + indexes
--    that depend on the table.
DROP TABLE IF EXISTS public.client_ops CASCADE;

COMMIT;
