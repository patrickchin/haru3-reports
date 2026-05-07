-- ============================================================
-- file_metadata.upload_status — async upload state machine
--
-- Adds:
--   • upload_status text NOT NULL DEFAULT 'completed'
--       (existing rows are all completed; new optimistic rows
--        from the upload queue start at 'pending')
--   • local_uri text NULL
--       (client-only file:// URI for the queued asset; cleared
--        once the row transitions to 'completed' or 'failed')
--   • CHECK constraint enumerating allowed states
--   • One-way state-machine trigger
--   • Split UPDATE policies so role-based authorization is
--     explicit and self-referential WITH CHECK quirks are avoided.
--
-- See docs/10-media-pipeline.md §G (PR-2).
-- ============================================================

-- 1) Columns
-- ============================================================

ALTER TABLE public.file_metadata
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS local_uri     text;

-- Enumerate allowed states. The DB tracks only what's needed for
-- correctness: 'pending' = placeholder row inserted optimistically,
-- bytes not yet in Storage; 'completed' = bytes uploaded and metadata
-- canonical; 'failed' = terminal upload error. The richer in-memory
-- queue state machine (preprocessing, uploading, etc.) is client-only
-- and does not project to this column.
ALTER TABLE public.file_metadata
  DROP CONSTRAINT IF EXISTS file_metadata_upload_status_check;
ALTER TABLE public.file_metadata
  ADD CONSTRAINT file_metadata_upload_status_check
  CHECK (upload_status IN ('pending', 'completed', 'failed'));

-- Index in-flight rows so the queue UI ("show me my pending uploads
-- in this project") doesn't scan the whole table.
CREATE INDEX IF NOT EXISTS file_metadata_pending_uploads_idx
  ON public.file_metadata (project_id, uploaded_by)
  WHERE upload_status = 'pending';

-- 2) State-machine trigger
-- ============================================================
-- Allowed transitions:
--   pending    -> completed | failed
--   failed     -> pending          (retry)
--   completed  -> completed        (no-op; allows generic UPDATEs of
--                                   filename, transcription, etc.)
--   failed     -> failed           (no-op)
--   pending    -> pending          (no-op)
-- Anything else raises 22023 (invalid_parameter_value). Notably,
-- completed -> anything is rejected (one-way state machine — once a
-- row is marked completed it cannot be regressed).
--
-- Also pins immutable identity columns: project_id, uploaded_by,
-- bucket, id cannot change via UPDATE. This is what makes it safe
-- to drop the self-referential WITH CHECK on the UPDATE policy.

CREATE OR REPLACE FUNCTION public.file_metadata_enforce_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Immutable columns
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.bucket IS DISTINCT FROM OLD.bucket THEN
    RAISE EXCEPTION
      'file_metadata: id, project_id, uploaded_by, bucket are immutable'
      USING ERRCODE = '22023';
  END IF;

  -- State machine
  IF NEW.upload_status IS DISTINCT FROM OLD.upload_status THEN
    IF NOT (
         (OLD.upload_status = 'pending' AND NEW.upload_status IN ('completed', 'failed'))
      OR (OLD.upload_status = 'failed'  AND NEW.upload_status =  'pending')
    ) THEN
      RAISE EXCEPTION
        'file_metadata: invalid upload_status transition % -> %',
        OLD.upload_status, NEW.upload_status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger name starts with "file_metadata_a_" so it fires before the
-- existing "file_metadata_set_updated_at" trigger (Postgres orders
-- BEFORE triggers alphabetically). Validation runs before the timestamp
-- bump, so a rejected transition won't churn updated_at.
DROP TRIGGER IF EXISTS file_metadata_a_state_machine ON public.file_metadata;
CREATE TRIGGER file_metadata_a_state_machine
  BEFORE UPDATE ON public.file_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.file_metadata_enforce_state_machine();

-- 3) Replace permissive UPDATE policy with role-segmented policies
-- ============================================================
-- The trigger above pins identity columns, so WITH CHECK no longer
-- needs the self-subquery hack. Split into two policies for clarity:
--   1. Uploader can update their own row.
--   2. Project admins/owners can update any row in the project.
-- Both run for every UPDATE; PostgREST OR's them.

DROP POLICY IF EXISTS "Uploader or admin can update file metadata" ON public.file_metadata;

DROP POLICY IF EXISTS "Uploader can update own file metadata" ON public.file_metadata;
CREATE POLICY "Uploader can update own file metadata"
  ON public.file_metadata FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = (SELECT auth.uid())
    AND public.user_has_project_access(project_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND public.user_has_project_access(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can update project file metadata" ON public.file_metadata;
CREATE POLICY "Admins can update project file metadata"
  ON public.file_metadata FOR UPDATE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
  );
