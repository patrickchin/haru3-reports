-- ============================================================
-- report_notes — first-class input items for report generation.
--
-- Replaces the flat `reports.notes text[]` column with a table that
-- supports multi-modal inputs (text, voice, image, video, document).
-- Voice notes link to file_metadata via file_id; text notes are
-- self-contained in the `body` column.
--
-- Phase A: Create table + RLS + pull RPC + apply mutation RPC.
-- Phase B (next migration): Backfill existing reports.notes[] rows.
-- Phase D (future): Drop reports.notes, file_metadata.transcription,
--                   file_metadata.report_id once all clients are updated.
-- ============================================================

-- ----------------------------------------------------------------
-- 1) Table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position        integer NOT NULL,
  kind            text NOT NULL
                    CHECK (kind IN ('text', 'voice', 'image', 'video', 'document')),
  body            text,
  file_id         uuid REFERENCES public.file_metadata(id) ON DELETE SET NULL,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.report_notes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 2) Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS report_notes_report_position_idx
  ON public.report_notes (report_id, position);
CREATE INDEX IF NOT EXISTS report_notes_project_id_idx
  ON public.report_notes (project_id);
CREATE INDEX IF NOT EXISTS report_notes_file_id_idx
  ON public.report_notes (file_id) WHERE file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS report_notes_author_id_idx
  ON public.report_notes (author_id);

-- ----------------------------------------------------------------
-- 3) updated_at trigger
-- ----------------------------------------------------------------
DROP TRIGGER IF EXISTS report_notes_set_updated_at ON public.report_notes;
CREATE TRIGGER report_notes_set_updated_at
  BEFORE UPDATE ON public.report_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ----------------------------------------------------------------
-- 4) RLS policies
--
-- Mirror the reports/file_metadata pattern:
--   SELECT: project member, not soft-deleted
--   INSERT: owner/admin/editor, author_id = auth.uid()
--   UPDATE: author OR project owner/admin
--   DELETE: author OR project owner/admin
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view report notes" ON public.report_notes;
CREATE POLICY "Members can view report notes"
  ON public.report_notes FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.user_has_project_access(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Editors can insert report notes" ON public.report_notes;
CREATE POLICY "Editors can insert report notes"
  ON public.report_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Author or admin can update report notes" ON public.report_notes;
CREATE POLICY "Author or admin can update report notes"
  ON public.report_notes FOR UPDATE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR author_id = (SELECT auth.uid())
  )
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR author_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Author or admin can delete report notes" ON public.report_notes;
CREATE POLICY "Author or admin can delete report notes"
  ON public.report_notes FOR DELETE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR author_id = (SELECT auth.uid())
  );

-- ----------------------------------------------------------------
-- 5) Pull RPC — same pattern as pull_reports_since
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pull_report_notes_since(timestamptz, integer);

CREATE OR REPLACE FUNCTION public.pull_report_notes_since(
  p_cursor timestamptz,
  p_limit  integer DEFAULT 500
)
RETURNS SETOF public.report_notes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT rn.*
  FROM public.report_notes rn
  WHERE (
      rn.author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = rn.project_id
          AND pm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = rn.project_id
          AND p.owner_id = auth.uid()
      )
    )
    AND (p_cursor IS NULL OR rn.updated_at > p_cursor)
  ORDER BY rn.updated_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;

GRANT EXECUTE ON FUNCTION public.pull_report_notes_since(timestamptz, integer) TO authenticated;

-- ----------------------------------------------------------------
-- 6) Apply mutation RPC
--
-- Permission: editor+ can insert/update; author or owner/admin can
-- update/delete. Soft-delete only.
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_report_note_mutation(jsonb);

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
          position = COALESCE(NULLIF(v_fields->>'position','')::integer, position),
          kind     = COALESCE(v_fields->>'kind', kind),
          body     = COALESCE(v_fields->>'body', body),
          file_id  = COALESCE(NULLIF(v_fields->>'file_id','')::uuid, file_id)
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

GRANT EXECUTE ON FUNCTION public.apply_report_note_mutation(jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- 7) Add last_processed_note_id to reports for incremental generation.
--
-- Replaces the array-index-based last_processed_note_count.
-- NULL = "never generated" (full generation). Non-null = skip notes
-- whose position <= the position of this note on next incremental gen.
-- ----------------------------------------------------------------
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS last_processed_note_id uuid REFERENCES public.report_notes(id) ON DELETE SET NULL;
