-- ============================================================
-- Admin / platform operations support
-- Adds admin roles, organizations, audit log, and AI generation log
-- so the admin web surface can operate on real backend data.
-- ============================================================

-- User roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(trim(name)) > 0),
  slug       text NOT NULL UNIQUE CHECK (char_length(trim(slug)) > 0),
  plan       text NOT NULL DEFAULT 'free'
               CHECK (plan IN ('free', 'pro', 'enterprise')),
  max_seats  integer NOT NULL DEFAULT 5 CHECK (max_seats > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at timestamptz
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Organization members
CREATE TABLE IF NOT EXISTS public.org_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member'
                   CHECK (role IN ('owner', 'admin', 'member')),
  created_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS org_members_organization_id_idx
  ON public.org_members (organization_id);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx
  ON public.org_members (user_id);

CREATE OR REPLACE FUNCTION public.user_has_org_access(
  p_organization_id uuid,
  p_user_id         uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members om
    JOIN public.organizations o
      ON o.id = om.organization_id
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND o.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_role(
  p_organization_id uuid,
  p_user_id         uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role
  FROM public.org_members om
  JOIN public.organizations o
    ON o.id = om.organization_id
  WHERE om.organization_id = p_organization_id
    AND om.user_id = p_user_id
    AND o.deleted_at IS NULL
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Users can view accessible organizations" ON public.organizations;
CREATE POLICY "Users can view accessible organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.user_has_org_access(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Members can view org membership" ON public.org_members;
CREATE POLICY "Members can view org membership"
  ON public.org_members FOR SELECT
  TO authenticated
  USING (public.user_has_org_access(organization_id, (SELECT auth.uid())));

-- Link projects to organizations
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_organization_id_idx
  ON public.projects (organization_id);

-- AI generation log
CREATE TABLE IF NOT EXISTS public.report_generation_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider       text NOT NULL CHECK (char_length(trim(provider)) > 0),
  model          text NOT NULL CHECK (char_length(trim(model)) > 0),
  input_tokens   integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms     integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  confidence     smallint CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
  error          text,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.report_generation_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS report_generation_log_report_id_idx
  ON public.report_generation_log (report_id);
CREATE INDEX IF NOT EXISTS report_generation_log_user_id_idx
  ON public.report_generation_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_generation_log_created_at_idx
  ON public.report_generation_log (created_at DESC);

DROP POLICY IF EXISTS "Users can view own generation log" ON public.report_generation_log;
CREATE POLICY "Users can view own generation log"
  ON public.report_generation_log FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role can insert generation log" ON public.report_generation_log;
CREATE POLICY "Service role can insert generation log"
  ON public.report_generation_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (char_length(trim(action)) > 0),
  target_type text NOT NULL CHECK (char_length(trim(target_type)) > 0),
  target_id   text NOT NULL CHECK (char_length(trim(target_id)) > 0),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx
  ON public.admin_audit_log (admin_id, created_at DESC);

DROP POLICY IF EXISTS "Admins can view own audit events" ON public.admin_audit_log;
CREATE POLICY "Admins can view own audit events"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = admin_id);

DROP POLICY IF EXISTS "Service role can insert admin audit events" ON public.admin_audit_log;
CREATE POLICY "Service role can insert admin audit events"
  ON public.admin_audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);
