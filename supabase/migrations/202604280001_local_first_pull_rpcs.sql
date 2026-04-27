-- ============================================================
-- Local-first: pull_<table>_since RPCs
--
-- Returns rows changed since `cursor` (or all rows if cursor is null),
-- INCLUDING soft-deleted ones, ordered by updated_at ASC.
--
-- Why an RPC instead of plain SELECT? The current SELECT policies on
-- projects/reports filter `deleted_at IS NULL` (see
-- 202604180001_soft_delete.sql). Pull needs tombstones so the client
-- can reflect remote deletes. These RPCs run as the calling user
-- (security invoker) — RLS on the BASE table still applies via the
-- explicit owner_id / project_members joins.
-- ============================================================

-- Drop in case of re-run during development.
DROP FUNCTION IF EXISTS public.pull_projects_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_reports_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_project_members_since(timestamptz, integer);
DROP FUNCTION IF EXISTS public.pull_file_metadata_since(timestamptz, integer);

-- ----------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_projects_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.projects
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT *
  FROM public.projects
  WHERE owner_id = auth.uid()
    AND (p_cursor IS NULL OR updated_at > p_cursor)
  ORDER BY updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.pull_projects_since(timestamptz, integer) TO authenticated;

-- ----------------------------------------------------------------
-- reports — visible if owner OR a member of the project
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_reports_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.reports
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT r.*
  FROM public.reports r
  WHERE (
      r.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = r.project_id
          AND pm.user_id = auth.uid()
      )
    )
    AND (p_cursor IS NULL OR r.updated_at > p_cursor)
  ORDER BY r.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.pull_reports_since(timestamptz, integer) TO authenticated;

-- ----------------------------------------------------------------
-- project_members — visible if user is in the project
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_project_members_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.project_members
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT pm.*
  FROM public.project_members pm
  WHERE EXISTS (
      SELECT 1 FROM public.project_members me
      WHERE me.project_id = pm.project_id
        AND me.user_id = auth.uid()
    )
    AND (p_cursor IS NULL OR pm.updated_at > p_cursor)
  ORDER BY pm.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.pull_project_members_since(timestamptz, integer) TO authenticated;

-- ----------------------------------------------------------------
-- file_metadata — visible if owner of the project
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_file_metadata_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.file_metadata
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT fm.*
  FROM public.file_metadata fm
  JOIN public.projects p ON p.id = fm.project_id
  WHERE p.owner_id = auth.uid()
    AND (p_cursor IS NULL OR fm.updated_at > p_cursor)
  ORDER BY fm.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.pull_file_metadata_since(timestamptz, integer) TO authenticated;
