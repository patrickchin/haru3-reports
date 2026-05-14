-- ============================================================
-- Phase D: Drop legacy columns replaced by report_notes.
--
-- Drops:
--   1. reports.notes (text[])  — replaced by report_notes table
--   2. file_metadata.transcription — transcription lives in report_notes.body
--   3. file_metadata.report_id — relationship goes through report_notes.file_id
--
-- Also rewrites apply_report_mutation and apply_file_metadata_mutation
-- to stop referencing these columns.
--
-- Prerequisites:
--   - 202604300001_report_notes.sql (table + RPCs) deployed
--   - 202604300002_backfill_report_notes.sql ran
--   - All clients updated to read from report_notes
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Drop columns
-- ----------------------------------------------------------------

-- Drop the index that references report_id before dropping the column.
DROP INDEX IF EXISTS file_metadata_report_id_idx;
-- Drop the composite index that references transcription_state (kept)
-- but the index on (report_id, transcription_state) needs dropping.
-- (No — that index is on local SQLite only, not the server.)

ALTER TABLE public.reports DROP COLUMN IF EXISTS notes;
ALTER TABLE public.file_metadata DROP COLUMN IF EXISTS transcription;
ALTER TABLE public.file_metadata DROP COLUMN IF EXISTS report_id;

-- ----------------------------------------------------------------
-- 2) Rewrite apply_report_mutation — remove notes handling
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
        visit_date, confidence, report_data
      ) VALUES (
        v_id, v_project_id, v_user,
        COALESCE(v_fields->>'title', ''),
        COALESCE(v_fields->>'report_type', 'daily'),
        COALESCE(v_fields->>'status', 'draft'),
        NULLIF(v_fields->>'visit_date','')::date,
        NULLIF(v_fields->>'confidence','')::smallint,
        COALESCE(v_fields->'report_data', '{}'::jsonb)
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
          title       = COALESCE(v_fields->>'title', title),
          status      = COALESCE(v_fields->>'status', status),
          visit_date  = COALESCE(NULLIF(v_fields->>'visit_date','')::date, visit_date),
          confidence  = COALESCE(NULLIF(v_fields->>'confidence','')::smallint, confidence),
          report_data = COALESCE(v_fields->'report_data', report_data)
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
-- 3) Rewrite apply_file_metadata_mutation — remove transcription + report_id
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_file_metadata_mutation(jsonb);

CREATE OR REPLACE FUNCTION public.apply_file_metadata_mutation(p_payload jsonb)
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
  v_existing public.file_metadata;
  v_row public.file_metadata;
  v_role text;
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
      INSERT INTO public.file_metadata (
        id, project_id, uploaded_by, bucket, storage_path,
        category, filename, mime_type, size_bytes,
        duration_ms
      ) VALUES (
        v_id,
        v_project_id,
        v_user,
        COALESCE(v_fields->>'bucket', 'project-files'),
        v_fields->>'storage_path',
        COALESCE(v_fields->>'category', 'attachment'),
        COALESCE(v_fields->>'filename', ''),
        COALESCE(v_fields->>'mime_type', ''),
        COALESCE(NULLIF(v_fields->>'size_bytes','')::bigint, 0),
        NULLIF(v_fields->>'duration_ms','')::integer
      )
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status','applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;

  ELSIF v_op = 'update' THEN
    SELECT * INTO v_existing FROM public.file_metadata WHERE id = v_id;
    IF NOT FOUND THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      v_role := public.user_project_role(v_existing.project_id, v_user);
      v_can_write := (v_existing.uploaded_by = v_user)
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
        UPDATE public.file_metadata SET
          filename  = COALESCE(v_fields->>'filename', filename),
          mime_type = COALESCE(v_fields->>'mime_type', mime_type)
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
    SELECT * INTO v_existing FROM public.file_metadata WHERE id = v_id;
    IF NOT FOUND THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      v_role := public.user_project_role(v_existing.project_id, v_user);
      v_can_write := (v_existing.uploaded_by = v_user)
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
        UPDATE public.file_metadata SET deleted_at = timezone('utc', now())
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
  VALUES (v_client_op_id, v_user, 'file_metadata', v_id, v_response)
  ON CONFLICT (client_op_id) DO NOTHING;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_file_metadata_mutation(jsonb) TO authenticated;
