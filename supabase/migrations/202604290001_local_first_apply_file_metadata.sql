-- ============================================================
-- Local-first: apply_file_metadata_mutation RPC
--
-- Voice notes and other project files (recorded offline) are pushed
-- through the same outbox / RPC contract as projects and reports. Until
-- this migration the mobile push engine threw "no apply RPC for entity
-- file_metadata", parking every voice-note write in retry forever.
--
-- Permission model mirrors the existing RLS on file_metadata:
--   • INSERT: caller must be owner/admin/editor on the project AND
--             uploaded_by must equal auth.uid().
--   • UPDATE: caller is the original uploader, OR owner/admin on the
--             project.
--   • DELETE: caller is the original uploader, OR owner/admin on the
--             project. Soft-delete only (sets deleted_at).
--
-- Optimistic concurrency uses `updated_at` as `base_version` exactly
-- like apply_report_mutation. Idempotent replay is handled by the
-- shared `client_ops` table from 202604280002.
-- ============================================================

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
        duration_ms, transcription, report_id
      ) VALUES (
        v_id,
        v_project_id,
        v_user,                              -- forced to caller
        COALESCE(v_fields->>'bucket', 'project-files'),
        v_fields->>'storage_path',
        COALESCE(v_fields->>'category', 'attachment'),
        COALESCE(v_fields->>'filename', ''),
        COALESCE(v_fields->>'mime_type', ''),
        COALESCE(NULLIF(v_fields->>'size_bytes','')::bigint, 0),
        NULLIF(v_fields->>'duration_ms','')::integer,
        v_fields->>'transcription',
        NULLIF(v_fields->>'report_id','')::uuid
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
          storage_path  = COALESCE(v_fields->>'storage_path', storage_path),
          filename      = COALESCE(v_fields->>'filename', filename),
          mime_type     = COALESCE(v_fields->>'mime_type', mime_type),
          size_bytes    = COALESCE(NULLIF(v_fields->>'size_bytes','')::bigint, size_bytes),
          duration_ms   = COALESCE(NULLIF(v_fields->>'duration_ms','')::integer, duration_ms),
          transcription = COALESCE(v_fields->>'transcription', transcription),
          report_id     = COALESCE(NULLIF(v_fields->>'report_id','')::uuid, report_id),
          category      = COALESCE(v_fields->>'category', category)
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
