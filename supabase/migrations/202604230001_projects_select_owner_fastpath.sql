-- ============================================================
-- Fix: projects SELECT policy fails on INSERT ... RETURNING
-- ============================================================
-- Root cause:
--   Postgres validates the SELECT RLS policy against rows returned
--   by INSERT ... RETURNING. The previous SELECT policy delegated
--   to public.user_has_project_access(), a STABLE SECURITY DEFINER
--   function. STABLE functions reuse the snapshot of the outer
--   statement, so its internal `SELECT 1 FROM projects WHERE id = ?`
--   does NOT see the just-inserted row — the owner fails the check
--   and the client sees
--     "42501: new row violates row-level security policy for table projects"
--   even though WITH CHECK (INSERT) passed.
--
-- Fix: inline an ownership fast-path (`owner_id = auth.uid()`) into
--   the SELECT policy. This compares values directly on NEW, which
--   works inside RETURNING. Membership access is preserved via an
--   EXISTS on project_members.
-- ============================================================

DROP POLICY IF EXISTS "Users can view accessible projects" ON public.projects;

CREATE POLICY "Users can view accessible projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_members.project_id = projects.id
          AND project_members.user_id    = (SELECT auth.uid())
      )
    )
  );
