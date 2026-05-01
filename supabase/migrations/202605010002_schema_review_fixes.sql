-- ============================================================
-- Schema review fixes — top 3 critical issues
--
-- 1. pull_projects_since / pull_file_metadata_since were owner-only
--    and silently locked project members out of local-first sync.
--    Mirror the owner-OR-member pattern already used by
--    pull_reports_since.
--
-- 2. apply_report_mutation's UPDATE permission check listed
--    ('owner','editor'). 'owner' is never stored in project_members
--    (the role is implicit in projects.owner_id), and 'admin' was
--    omitted entirely — so admins were silently locked out of
--    editing reports. Replace with ('admin','editor'); the
--    owner_id = v_user fast-path is preserved as the OR branch.
--
-- 3. lookup_profile_id_by_phone (SECURITY DEFINER, granted to
--    authenticated) allowed any logged-in user to probe arbitrary
--    phone numbers and discover whether each one had an account.
--    Restrict it to callers who own or admin at least one project,
--    matching the legitimate "invite teammate" use case.
-- ============================================================

-- ----------------------------------------------------------------
-- 1a) pull_projects_since — owner OR member
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_projects_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.projects
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT p.*
  FROM public.projects p
  WHERE (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p.id
          AND pm.user_id = auth.uid()
      )
    )
    AND (p_cursor IS NULL OR p.updated_at > p_cursor)
  ORDER BY p.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

-- ----------------------------------------------------------------
-- 1b) pull_file_metadata_since — owner OR member
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pull_file_metadata_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.file_metadata
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT fm.*
  FROM public.file_metadata fm
  WHERE (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = fm.project_id
          AND p.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = fm.project_id
          AND pm.user_id = auth.uid()
      )
    )
    AND (p_cursor IS NULL OR fm.updated_at > p_cursor)
  ORDER BY fm.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

-- ----------------------------------------------------------------
-- 2) apply_report_mutation — fix UPDATE permission check
--
-- Re-issue the function from 202604300004 with the role list
-- corrected to ('admin','editor'). All other behaviour is unchanged.
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_report_mutation(jsonb);

CREATE OR REPLACE FUNCTION public.apply_report_mutation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_client_op_id uuid := (p_payload->>'client_op_id')::uuid;
  v_op text := p_payload->>'op';
  v_id uuid := (p_payload->>'id')::uuid;
  v_base timestamptz := NULLIF(p_payload->>'base_version','')::timestamptz;
  v_fields jsonb := COALESCE(p_payload->'fields', '{}'::jsonb);
  v_project_id uuid;
  v_existing public.reports;
  v_row public.reports;
  v_can_write boolean;
  v_response jsonb;
  v_cached jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  v_cached := public._cached_client_op(v_client_op_id, v_user);
  IF v_cached IS NOT NULL THEN
    RETURN jsonb_set(v_cached, '{status}', '"duplicate"'::jsonb);
  END IF;

  IF v_op = 'insert' THEN
    v_project_id := (v_fields->>'project_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = v_project_id AND p.owner_id = v_user
    ) THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      INSERT INTO public.reports (
        id, project_id, owner_id, title, report_type, status,
        visit_date, confidence, report_data, last_generation
      ) VALUES (
        v_id, v_project_id, v_user,
        COALESCE(v_fields->>'title', ''),
        COALESCE(v_fields->>'report_type', 'daily'),
        COALESCE(v_fields->>'status', 'draft'),
        NULLIF(v_fields->>'visit_date','')::date,
        NULLIF(v_fields->>'confidence','')::smallint,
        COALESCE(v_fields->'report_data', '{}'::jsonb),
        v_fields->'last_generation'
      )
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status','applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;

  ELSIF v_op = 'update' THEN
    SELECT * INTO v_existing FROM public.reports WHERE id = v_id;
    IF NOT FOUND THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      v_can_write := (v_existing.owner_id = v_user) OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = v_existing.project_id
          AND pm.user_id = v_user
          AND pm.role IN ('admin','editor')
      );
      IF NOT v_can_write THEN
        v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
      ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
        v_response := jsonb_build_object(
          'status','conflict',
          'server_version', v_existing.updated_at,
          'row', to_jsonb(v_existing)
        );
      ELSE
        UPDATE public.reports SET
          title           = COALESCE(v_fields->>'title', title),
          status          = COALESCE(v_fields->>'status', status),
          visit_date      = COALESCE(NULLIF(v_fields->>'visit_date','')::date, visit_date),
          confidence      = COALESCE(NULLIF(v_fields->>'confidence','')::smallint, confidence),
          report_data     = COALESCE(v_fields->'report_data', report_data),
          last_generation = CASE
            WHEN v_fields ? 'last_generation' THEN v_fields->'last_generation'
            ELSE last_generation
          END
        WHERE id = v_id
        RETURNING * INTO v_row;
        v_response := jsonb_build_object(
          'status','applied',
          'server_version', v_row.updated_at,
          'row', to_jsonb(v_row)
        );
      END IF;
    END IF;

  ELSIF v_op = 'delete' THEN
    SELECT * INTO v_existing FROM public.reports WHERE id = v_id;
    IF NOT FOUND OR v_existing.owner_id <> v_user THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
      v_response := jsonb_build_object(
        'status','conflict',
        'server_version', v_existing.updated_at,
        'row', to_jsonb(v_existing)
      );
    ELSE
      UPDATE public.reports SET deleted_at = timezone('utc', now())
      WHERE id = v_id
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status','applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown op %', v_op USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_ops (client_op_id, user_id, entity, entity_id, response_json)
  VALUES (v_client_op_id, v_user, 'report', v_id, v_response)
  ON CONFLICT (client_op_id) DO NOTHING;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_report_mutation(jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- 3) lookup_profile_id_by_phone — require caller to own/admin a project
--
-- The function still runs SECURITY DEFINER and returns only the uuid
-- (no other PII), but now refuses to answer for callers who have no
-- legitimate reason to invite teammates. Returns NULL for both
-- "phone not found" and "caller not authorised", so unauthorised
-- callers cannot distinguish the two cases.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_profile_id_by_phone(p_phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_authorised boolean;
  v_match uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE owner_id = v_caller
      AND deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM public.project_members
    WHERE user_id = v_caller
      AND role = 'admin'
  ) INTO v_authorised;

  IF NOT v_authorised THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_match
  FROM public.profiles
  WHERE phone = p_phone
  LIMIT 1;

  RETURN v_match;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_profile_id_by_phone(text) TO authenticated;
