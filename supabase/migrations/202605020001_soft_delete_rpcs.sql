-- ============================================================
-- Soft-delete RPCs (SECURITY DEFINER)
-- ============================================================
-- Why this exists
-- ----------------
-- The SELECT policies on projects/reports/report_notes/file_metadata
-- filter out rows where `deleted_at IS NOT NULL`. PostgreSQL applies
-- the SELECT policy USING expression to the **post-update** row when
-- a table has an UPDATE policy alongside a SELECT policy that filters
-- on the same table — meaning a client-side
--
--     UPDATE <table> SET deleted_at = now() WHERE id = $1
--
-- always fails with `42501 new row violates row-level security policy`,
-- because the just-tombstoned row would no longer be visible to the
-- caller. This was the root cause of the "deleting a site / report
-- doesn't work" bug reported on cloud-fallback (non-local-first)
-- sessions after commit f84205a switched cloud-fallback DELETE → UPDATE.
--
-- The local-first push path already works because it routes through
-- `apply_*_mutation` SECURITY DEFINER RPCs which run as the function
-- owner (bypass RLS) and apply ownership/role checks in SQL.
--
-- These small, single-purpose RPCs give the cloud-fallback path the
-- same semantics without dragging in the full apply_mutations idempotency
-- machinery (client_op_id, base_version, conflict resolution).
--
-- Permissions:
--   soft_delete_project              → owner only (matches DELETE policy)
--   soft_delete_report               → owner only (matches DELETE policy)
--   soft_delete_file_metadata        → uploader OR project owner/admin
--                                       (matches existing DELETE policy)
--   soft_delete_report_notes_for_file → project owner/admin OR file uploader
--                                       (used by cascade in deleteProjectFile)
--
-- All four reject the call with SQLSTATE 42501 ('insufficient_privilege')
-- when the caller does not have permission, so the supabase-js client
-- surfaces them identically to a denied policy.
-- ============================================================

-- ----------------------------------------------------------------
-- soft_delete_project
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.soft_delete_project(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_project(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO v_owner FROM public.projects
   WHERE id = p_id AND deleted_at IS NULL;

  IF v_owner IS NULL THEN
    -- Either does not exist or already soft-deleted: idempotent no-op.
    RETURN;
  END IF;

  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.projects
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- soft_delete_report
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.soft_delete_report(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_report(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id INTO v_owner FROM public.reports
   WHERE id = p_id AND deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.reports
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_report(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- soft_delete_file_metadata
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.soft_delete_file_metadata(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_file_metadata(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_project_id uuid;
  v_uploaded_by uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT project_id, uploaded_by INTO v_project_id, v_uploaded_by
    FROM public.file_metadata
   WHERE id = p_id AND deleted_at IS NULL;

  IF v_project_id IS NULL THEN
    RETURN;
  END IF;

  v_role := public.user_project_role(v_project_id, v_user);

  IF v_uploaded_by <> v_user
     AND COALESCE(v_role, '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.file_metadata
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_file_metadata(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- soft_delete_report_notes_for_file
--
-- Used by the cascade in `deleteProjectFile` so the transcript row(s)
-- linked to a deleted voice-note file are also tombstoned. Mirrors the
-- per-row "Author or admin" UPDATE/DELETE permission check.
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.soft_delete_report_notes_for_file(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_report_notes_for_file(p_file_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_project_id uuid;
  v_uploaded_by uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  -- Resolve the file's project + uploader. Fall through silently if the
  -- file is gone (cascade can no-op).
  SELECT project_id, uploaded_by INTO v_project_id, v_uploaded_by
    FROM public.file_metadata
   WHERE id = p_file_id;

  IF v_project_id IS NULL THEN
    RETURN 0;
  END IF;

  v_role := public.user_project_role(v_project_id, v_user);

  IF v_uploaded_by <> v_user
     AND COALESCE(v_role, '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.report_notes
     SET deleted_at = timezone('utc', now())
   WHERE file_id = p_file_id
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_report_notes_for_file(uuid) TO authenticated;
