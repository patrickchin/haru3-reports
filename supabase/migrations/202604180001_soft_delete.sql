-- ============================================================
-- Soft-delete support for projects and reports
-- Adds deleted_at column; updates SELECT policies to hide
-- soft-deleted rows from end users.
-- ============================================================

-- Projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id AND deleted_at IS NULL);

-- Reports
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_id AND deleted_at IS NULL);
