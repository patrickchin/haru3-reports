-- ============================================================
-- Drop admin / platform schema
-- Reverses 202604240001_admin_platform.sql now that the admin
-- web surface and edge functions have been removed.
-- ============================================================

-- Drop dependent log tables first
DROP TABLE IF EXISTS public.admin_audit_log;
DROP TABLE IF EXISTS public.report_generation_log;

-- Drop org membership before organizations
DROP TABLE IF EXISTS public.org_members;

-- Drop helper functions used by org policies
DROP FUNCTION IF EXISTS public.user_has_org_access(uuid, uuid);
DROP FUNCTION IF EXISTS public.user_org_role(uuid, uuid);

-- Drop the projects.organization_id FK column
ALTER TABLE public.projects
  DROP COLUMN IF EXISTS organization_id;

-- Drop organizations
DROP TABLE IF EXISTS public.organizations;

-- Drop user roles
DROP TABLE IF EXISTS public.user_roles;
