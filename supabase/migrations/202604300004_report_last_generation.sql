-- Add last_generation column to reports for debug-payload persistence.
--
-- Stores the full request/response/usage/prompt context from the most
-- recent attempt to regenerate the report (success OR failure). The
-- mobile Debug tab hydrates from this column so the user can audit
-- what the LLM saw and returned even after closing and re-opening
-- the draft.
--
-- Single-attempt-only by design: we deliberately overwrite on every
-- regenerate(); we do not maintain a history table.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS last_generation jsonb;

COMMENT ON COLUMN public.reports.last_generation IS
  'Captured request/response/prompts/usage/error from the most recent generate-report invocation. Overwritten on every regenerate.';

-- Update apply_report_mutation to round-trip last_generation through
-- insert/update operations (whole-replace, like report_data).
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
          AND pm.role IN ('owner','editor')
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
