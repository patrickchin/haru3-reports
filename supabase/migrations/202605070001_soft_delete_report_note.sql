-- ============================================================
-- soft_delete_report_note — SECURITY DEFINER RPC
-- ============================================================
-- Companion to the offline-mode v1 removal. The local-first
-- apply_report_note_mutation RPC is going away; the cloud-fallback
-- `update({ deleted_at })` against `report_notes` runs into the
-- same RLS post-update trap documented in 202605020001:
--
--   42501 new row violates row-level security policy
--
-- because the SELECT policy filters `deleted_at IS NULL`. This RPC
-- gives the REST-only path the same single-row soft-delete primitive
-- the projects/reports tables already have.
--
-- Permission: author OR project owner/admin (mirrors the existing
-- "Author or admin can delete report notes" policy on report_notes).
-- ============================================================

DROP FUNCTION IF EXISTS public.soft_delete_report_note(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_report_note(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_author_id uuid;
  v_project_id uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT author_id, project_id INTO v_author_id, v_project_id
    FROM public.report_notes
   WHERE id = p_id AND deleted_at IS NULL;

  IF v_project_id IS NULL THEN
    -- Already soft-deleted or never existed: idempotent no-op.
    RETURN;
  END IF;

  v_role := public.user_project_role(v_project_id, v_user);

  IF v_author_id <> v_user
     AND COALESCE(v_role, '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.report_notes
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_report_note(uuid) TO authenticated;
