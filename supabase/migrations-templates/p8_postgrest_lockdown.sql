-- ============================================================
-- P8: PostgREST lockdown
--
-- ⚠️  DO NOT APPLY UNTIL P7 (REST cutover) IS LIVE FOR ALL CLIENTS.
--
-- This file is intentionally NOT a timestamped migration so it does not
-- run automatically. To activate, copy it into a fresh migration named
-- `YYYYMMDDHHmm_p8_postgrest_lockdown.sql` once Supabase logs confirm
-- zero RPC calls from mobile for at least one week (see
-- docs/features/rest-api-migration.md §P8).
--
-- Effect:
--   1. Revokes EXECUTE on the local-first pull/apply RPCs from the
--      `authenticated` role. The REST API uses postgres credentials
--      via Drizzle, so it is unaffected; only direct PostgREST callers
--      are blocked.
--   2. Optional: also revoke direct table CRUD from `authenticated`
--      so the only path is via the REST API. Keep RLS policies in
--      place as defence-in-depth.
--
-- Rollback:
--   Re-grant EXECUTE on the listed RPCs to `authenticated`. If table
--   CRUD was also revoked, re-grant it. The previous edge functions
--   in `supabase/functions/` continue to work and can be redeployed
--   from git history.
-- ============================================================

BEGIN;

-- 1. Lock down pull RPCs
REVOKE EXECUTE ON FUNCTION public.pull_projects_since(timestamptz, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pull_reports_since(timestamptz, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pull_project_members_since(timestamptz, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pull_file_metadata_since(timestamptz, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pull_report_notes_since(timestamptz, integer) FROM authenticated;

-- 2. Lock down apply RPCs
REVOKE EXECUTE ON FUNCTION public.apply_project_mutation(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_report_mutation(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_file_metadata_mutation(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_report_note_mutation(jsonb) FROM authenticated;

-- 3. (Optional, harden further) — uncomment to disable direct table
--    access from the anon/authenticated roles. The REST API uses the
--    `postgres` superuser via the connection string, so it keeps full
--    access. Re-enable individually if any other consumer needs it.
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.projects FROM authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.reports FROM authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.project_members FROM authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.file_metadata FROM authenticated;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON public.report_notes FROM authenticated;

COMMIT;
