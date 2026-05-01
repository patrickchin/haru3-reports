-- ============================================================
-- Fix apply_report_note_mutation: allow setting body / file_id to NULL.
--
-- The original update branch used COALESCE which made it impossible to
-- clear a field:
--   body = COALESCE(v_fields->>'body', body)
-- Sending {"body": null} was indistinguishable from omitting the field —
-- both kept the old value.
--
-- Fix: check whether the key exists in v_fields via `v_fields ? 'key'`.
-- When the key is present, use whatever value it holds (including NULL).
-- When absent, keep the current column value.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_report_note_mutation(p_payload jsonb)
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
  v_role text;
  v_existing public.report_notes;
  v_row public.report_notes;
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
    v_role := public.user_project_role(v_project_id, v_user);
    IF v_role IS NULL OR v_role NOT IN ('owner','admin','editor') THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      INSERT INTO public.report_notes (
        id, report_id, project_id, author_id, position,
        kind, body, file_id
      ) VALUES (
        v_id,
        (v_fields->>'report_id')::uuid,
        v_project_id,
        v_user,
        COALESCE(NULLIF(v_fields->>'position','')::integer, 0),
        COALESCE(v_fields->>'kind', 'text'),
        v_fields->>'body',
        NULLIF(v_fields->>'file_id','')::uuid
      )
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status','applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;

  ELSIF v_op = 'update' THEN
    SELECT * INTO v_existing FROM public.report_notes WHERE id = v_id;
    IF NOT FOUND THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      v_role := public.user_project_role(v_existing.project_id, v_user);
      v_can_write := (v_existing.author_id = v_user)
                  OR (v_role IN ('owner','admin'));
      IF NOT v_can_write THEN
        v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
      ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
        v_response := jsonb_build_object(
          'status','conflict',
          'server_version', v_existing.updated_at,
          'row', to_jsonb(v_existing)
        );
      ELSE
        UPDATE public.report_notes SET
          position = CASE WHEN v_fields ? 'position'
                       THEN COALESCE(NULLIF(v_fields->>'position','')::integer, position)
                       ELSE position END,
          kind     = CASE WHEN v_fields ? 'kind'
                       THEN COALESCE(v_fields->>'kind', kind)
                       ELSE kind END,
          body     = CASE WHEN v_fields ? 'body'
                       THEN (v_fields->>'body')
                       ELSE body END,
          file_id  = CASE WHEN v_fields ? 'file_id'
                       THEN NULLIF(v_fields->>'file_id','')::uuid
                       ELSE file_id END
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
    SELECT * INTO v_existing FROM public.report_notes WHERE id = v_id;
    IF NOT FOUND THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      v_role := public.user_project_role(v_existing.project_id, v_user);
      v_can_write := (v_existing.author_id = v_user)
                  OR (v_role IN ('owner','admin'));
      IF NOT v_can_write THEN
        v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
      ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
        v_response := jsonb_build_object(
          'status','conflict',
          'server_version', v_existing.updated_at,
          'row', to_jsonb(v_existing)
        );
      ELSE
        UPDATE public.report_notes SET deleted_at = timezone('utc', now())
        WHERE id = v_id
        RETURNING * INTO v_row;
        v_response := jsonb_build_object(
          'status','applied',
          'server_version', v_row.updated_at,
          'row', to_jsonb(v_row)
        );
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown op %', v_op USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_ops (client_op_id, user_id, entity, entity_id, response_json)
  VALUES (v_client_op_id, v_user, 'report_note', v_id, v_response)
  ON CONFLICT (client_op_id) DO NOTHING;

  RETURN v_response;
END;
$$;
