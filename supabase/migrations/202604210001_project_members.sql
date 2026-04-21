-- ============================================================
-- Project members — multi-user access to projects (sites)
-- ============================================================

-- 1) project_members junction table
-- ============================================================

CREATE TABLE public.project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX project_members_project_id_idx ON public.project_members (project_id);
CREATE INDEX project_members_user_id_idx ON public.project_members (user_id);

-- 2) Helper functions for RLS
-- ============================================================

-- Returns TRUE when the user owns the project OR is a member.
CREATE OR REPLACE FUNCTION public.user_has_project_access(
  p_project_id uuid,
  p_user_id    uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND owner_id = p_user_id
      AND deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id = p_user_id
  );
$$;

-- Returns the effective role: 'owner', 'admin', 'editor', 'viewer', or NULL.
CREATE OR REPLACE FUNCTION public.user_project_role(
  p_project_id uuid,
  p_user_id    uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM (
    SELECT 'owner' AS role
    WHERE EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = p_project_id
        AND owner_id = p_user_id
        AND deleted_at IS NULL
    )
    UNION ALL
    SELECT pm.role FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = p_user_id
  ) sub
  LIMIT 1;
$$;

-- 3) RLS policies — project_members
-- ============================================================

CREATE POLICY "Members can view project membership"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (public.user_has_project_access(project_id, (SELECT auth.uid())));

CREATE POLICY "Admins can add members"
  ON public.project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
  );

CREATE POLICY "Admins can update members"
  ON public.project_members FOR UPDATE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
  );

CREATE POLICY "Admins can remove members"
  ON public.project_members FOR DELETE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
  );

-- 4) Update projects SELECT policy — include members
-- ============================================================

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view accessible projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.user_has_project_access(id, (SELECT auth.uid()))
  );

-- 5) Update reports policies — include members
-- ============================================================

DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view accessible reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.user_has_project_access(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert own reports" ON public.reports;
CREATE POLICY "Users can insert accessible reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = owner_id
    AND public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Users can update own reports" ON public.reports;
CREATE POLICY "Users can update accessible reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  )
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  );

-- DELETE remains owner-only (unchanged from original migration)
