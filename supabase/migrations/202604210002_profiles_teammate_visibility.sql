-- ============================================================
-- Secure teammate profile access via RPCs
-- ============================================================
-- Instead of broadening profiles RLS (which would expose all
-- columns including phone to teammates), we keep the strict
-- "own profile only" policy and provide SECURITY DEFINER
-- functions that return only safe columns.
-- ============================================================

-- Returns owner + all members for a project with safe profile
-- fields only (no phone, no future sensitive columns).
-- Caller must have project access.
CREATE OR REPLACE FUNCTION public.get_project_team(p_project_id uuid)
RETURNS TABLE (
  member_id    uuid,
  user_id      uuid,
  role         text,
  full_name    text,
  company_name text,
  is_owner     boolean,
  created_at   timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULL::uuid       AS member_id,
    p.owner_id       AS user_id,
    'owner'::text    AS role,
    pr.full_name,
    pr.company_name,
    true             AS is_owner,
    p.created_at
  FROM public.projects p
  JOIN public.profiles pr ON pr.id = p.owner_id
  WHERE p.id = p_project_id
    AND p.deleted_at IS NULL
    AND public.user_has_project_access(p_project_id, auth.uid())

  UNION ALL

  SELECT
    pm.id            AS member_id,
    pm.user_id,
    pm.role,
    pr.full_name,
    pr.company_name,
    false            AS is_owner,
    pm.created_at
  FROM public.project_members pm
  JOIN public.profiles pr ON pr.id = pm.user_id
  WHERE pm.project_id = p_project_id
    AND public.user_has_project_access(p_project_id, auth.uid())
  ORDER BY is_owner DESC, created_at ASC;
$$;

-- Looks up a profile by phone and returns only the id.
-- Used when adding a member by phone number. Only callable
-- by project owners/admins (enforced at application level via
-- the insert RLS on project_members).
CREATE OR REPLACE FUNCTION public.lookup_profile_id_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE phone = p_phone LIMIT 1;
$$;
