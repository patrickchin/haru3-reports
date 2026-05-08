-- Harden report_notes INSERT so client-supplied report_id/project_id cannot
-- describe different projects.

DO $$
DECLARE
  v_report_mismatches integer;
  v_file_mismatches integer;
  v_deleted_file_links integer;
BEGIN
  SELECT count(*) INTO v_report_mismatches
  FROM public.report_notes rn
  JOIN public.reports r ON r.id = rn.report_id
  WHERE r.project_id <> rn.project_id;

  IF v_report_mismatches > 0 THEN
    RAISE EXCEPTION
      'report_notes contains % rows whose report_id project does not match project_id',
      v_report_mismatches
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_file_mismatches
  FROM public.report_notes rn
  JOIN public.file_metadata f ON f.id = rn.file_id
  WHERE rn.file_id IS NOT NULL
    AND f.project_id <> rn.project_id;

  IF v_file_mismatches > 0 THEN
    RAISE EXCEPTION
      'report_notes contains % rows whose file_id project does not match project_id',
      v_file_mismatches
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_deleted_file_links
  FROM public.report_notes rn
  JOIN public.file_metadata f ON f.id = rn.file_id
  WHERE rn.deleted_at IS NULL
    AND rn.file_id IS NOT NULL
    AND f.deleted_at IS NOT NULL;

  IF v_deleted_file_links > 0 THEN
    RAISE EXCEPTION
      'report_notes contains % active rows linked to soft-deleted files',
      v_deleted_file_links
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS report_notes_report_project_fk_idx
  ON public.report_notes (report_id, project_id);

CREATE INDEX IF NOT EXISTS report_notes_file_project_fk_idx
  ON public.report_notes (file_id, project_id);

CREATE OR REPLACE FUNCTION public.user_has_project_access(
  p_project_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id
      AND owner_id = p_user_id
      AND deleted_at IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.project_id = p_project_id
      AND pm.user_id = p_user_id
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.user_project_role(
  p_project_id uuid,
  p_user_id uuid
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM (
    SELECT 'owner' AS role
    WHERE EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = p_project_id
        AND owner_id = p_user_id
        AND deleted_at IS NULL
    )
    UNION ALL
    SELECT pm.role
    FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    WHERE pm.project_id = p_project_id
      AND pm.user_id = p_user_id
      AND p.deleted_at IS NULL
  ) sub
  LIMIT 1;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_id_project_id_key'
      AND conrelid = 'public.reports'::regclass
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_id_project_id_key
      UNIQUE (id, project_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_metadata_id_project_id_key'
      AND conrelid = 'public.file_metadata'::regclass
  ) THEN
    ALTER TABLE public.file_metadata
      ADD CONSTRAINT file_metadata_id_project_id_key
      UNIQUE (id, project_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'report_notes_report_project_fk'
      AND conrelid = 'public.report_notes'::regclass
  ) THEN
    ALTER TABLE public.report_notes
      ADD CONSTRAINT report_notes_report_project_fk
      FOREIGN KEY (report_id, project_id)
      REFERENCES public.reports(id, project_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.report_notes
  VALIDATE CONSTRAINT report_notes_report_project_fk;

ALTER TABLE public.report_notes
  DROP CONSTRAINT IF EXISTS report_notes_file_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'report_notes_file_project_fk'
      AND conrelid = 'public.report_notes'::regclass
  ) THEN
    ALTER TABLE public.report_notes
      ADD CONSTRAINT report_notes_file_project_fk
      FOREIGN KEY (file_id, project_id)
      REFERENCES public.file_metadata(id, project_id)
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.report_notes
  VALIDATE CONSTRAINT report_notes_file_project_fk;

CREATE OR REPLACE FUNCTION public.report_notes_reject_identity_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.report_id IS DISTINCT FROM OLD.report_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR (
       NEW.file_id IS DISTINCT FROM OLD.file_id
       AND NOT (
         OLD.deleted_at IS NOT NULL
         AND NEW.deleted_at IS NOT NULL
         AND OLD.file_id IS NOT NULL
         AND NEW.file_id IS NULL
       )
     ) THEN
    RAISE EXCEPTION
      'report_notes identity/linkage columns are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_notes_a_reject_identity_updates
  ON public.report_notes;

CREATE TRIGGER report_notes_a_reject_identity_updates
  BEFORE UPDATE ON public.report_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.report_notes_reject_identity_updates();

CREATE OR REPLACE FUNCTION public.report_notes_validate_active_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_file_project_id uuid;
  v_file_deleted_at timestamptz;
BEGIN
  IF NEW.file_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id, deleted_at
    INTO v_file_project_id, v_file_deleted_at
    FROM public.file_metadata
   WHERE id = NEW.file_id
   FOR KEY SHARE;

  IF v_file_project_id IS NULL THEN
    RAISE EXCEPTION 'report_notes file_id does not reference an existing file'
      USING ERRCODE = '23503';
  END IF;

  IF v_file_project_id <> NEW.project_id OR v_file_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'report_notes file_id must reference an active file in the same project'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_notes_a_validate_active_file
  ON public.report_notes;

CREATE TRIGGER report_notes_a_validate_active_file
  BEFORE INSERT OR UPDATE OF file_id, project_id ON public.report_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.report_notes_validate_active_file();

CREATE OR REPLACE FUNCTION public.reports_validate_active_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_deleted_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_project_deleted_at
    FROM public.projects
   WHERE id = NEW.project_id
   FOR KEY SHARE;

  IF v_project_deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'reports project_id must reference an active project'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS reports_a_validate_active_project ON public.reports;

CREATE TRIGGER reports_a_validate_active_project
  BEFORE INSERT OR UPDATE OF project_id ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.reports_validate_active_project();

CREATE OR REPLACE FUNCTION public.file_metadata_validate_active_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_deleted_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_project_deleted_at
    FROM public.projects
   WHERE id = NEW.project_id
   FOR KEY SHARE;

  IF v_project_deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'file_metadata project_id must reference an active project'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS file_metadata_a_validate_active_project ON public.file_metadata;

CREATE TRIGGER file_metadata_a_validate_active_project
  BEFORE INSERT OR UPDATE OF project_id ON public.file_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.file_metadata_validate_active_project();

CREATE OR REPLACE FUNCTION public.report_notes_validate_active_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report_project_id uuid;
  v_report_deleted_at timestamptz;
BEGIN
  SELECT project_id, deleted_at
    INTO v_report_project_id, v_report_deleted_at
    FROM public.reports
   WHERE id = NEW.report_id
   FOR KEY SHARE;

  IF v_report_project_id IS NULL THEN
    RAISE EXCEPTION 'report_notes report_id does not reference an existing report'
      USING ERRCODE = '23503';
  END IF;

  IF v_report_project_id <> NEW.project_id OR v_report_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'report_notes report_id must reference an active report in the same project'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_notes_a_validate_active_report
  ON public.report_notes;

CREATE TRIGGER report_notes_a_validate_active_report
  BEFORE INSERT OR UPDATE OF report_id, project_id ON public.report_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.report_notes_validate_active_report();

CREATE OR REPLACE FUNCTION public.report_notes_reject_direct_deleted_at_updates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND COALESCE(
       current_setting('app.allow_report_note_tombstone', true),
       ''
     ) <> 'on' THEN
    RAISE EXCEPTION 'report_notes deleted_at changes must use the soft-delete RPC'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS report_notes_a_reject_direct_deleted_at_updates
  ON public.report_notes;

CREATE TRIGGER report_notes_a_reject_direct_deleted_at_updates
  BEFORE UPDATE OF deleted_at ON public.report_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.report_notes_reject_direct_deleted_at_updates();

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
    RETURN;
  END IF;

  v_role := public.user_project_role(v_project_id, v_user);

  IF COALESCE(v_role, '') NOT IN ('owner', 'admin')
     AND NOT (
       v_author_id = v_user
       AND COALESCE(v_role, '') IN ('owner', 'admin', 'editor')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_report_note_tombstone', 'on', true);

  UPDATE public.report_notes
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_report_note(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_report(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_project_id uuid;
  v_role text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id, project_id INTO v_owner, v_project_id FROM public.reports
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  v_role := public.user_project_role(v_project_id, v_user);

  IF COALESCE(v_role, '') NOT IN ('owner', 'admin')
     AND NOT (
       v_owner = v_user
       AND COALESCE(v_role, '') = 'editor'
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_report_note_tombstone', 'on', true);

  UPDATE public.report_notes
     SET deleted_at = timezone('utc', now())
   WHERE report_id = p_id
     AND deleted_at IS NULL;

  UPDATE public.reports
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_report(uuid) TO authenticated;

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
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_report_note_tombstone', 'on', true);

  PERFORM 1 FROM public.reports WHERE project_id = p_id FOR UPDATE;
  PERFORM 1 FROM public.file_metadata WHERE project_id = p_id FOR UPDATE;

  UPDATE public.report_notes
     SET deleted_at = timezone('utc', now())
   WHERE project_id = p_id
     AND deleted_at IS NULL;

  UPDATE public.file_metadata
     SET deleted_at = COALESCE(deleted_at, timezone('utc', now()))
   WHERE project_id = p_id;

  UPDATE public.reports
     SET deleted_at = timezone('utc', now())
   WHERE project_id = p_id
     AND deleted_at IS NULL;

  UPDATE public.projects
     SET deleted_at = timezone('utc', now())
   WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_project(uuid) TO authenticated;

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

  SELECT project_id, uploaded_by INTO v_project_id, v_uploaded_by
    FROM public.file_metadata
   WHERE id = p_file_id
   FOR UPDATE;

  IF v_project_id IS NULL THEN
    RETURN 0;
  END IF;

  v_role := public.user_project_role(v_project_id, v_user);

  IF COALESCE(v_role, '') NOT IN ('owner', 'admin')
     AND NOT (
       v_uploaded_by = v_user
       AND COALESCE(v_role, '') IN ('owner', 'admin', 'editor')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.allow_report_note_tombstone', 'on', true);

  UPDATE public.report_notes
     SET deleted_at = timezone('utc', now())
   WHERE file_id = p_file_id
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.report_notes
     SET file_id = NULL
   WHERE file_id = p_file_id
     AND deleted_at IS NOT NULL;

  UPDATE public.file_metadata
     SET deleted_at = COALESCE(deleted_at, timezone('utc', now()))
   WHERE id = p_file_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_report_notes_for_file(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_file_metadata(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.soft_delete_report_notes_for_file(p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_file_metadata(uuid) TO authenticated;

DROP POLICY IF EXISTS "Uploader can update own file metadata" ON public.file_metadata;

CREATE POLICY "Uploader can update own file metadata"
  ON public.file_metadata FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = (SELECT auth.uid())
    AND public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  )
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Uploader or admin can delete files" ON public.file_metadata;

CREATE POLICY "Uploader or admin can delete files"
  ON public.file_metadata FOR DELETE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR (
      uploaded_by = (SELECT auth.uid())
      AND public.user_project_role(project_id, (SELECT auth.uid()))
        IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Editors can insert report notes" ON public.report_notes;

DROP POLICY IF EXISTS "Members can view report notes" ON public.report_notes;

CREATE POLICY "Members can view report notes"
  ON public.report_notes FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = report_notes.report_id
        AND r.project_id = report_notes.project_id
        AND r.deleted_at IS NULL
    )
    AND public.user_has_project_access(project_id, (SELECT auth.uid()))
  );

CREATE POLICY "Editors can insert report notes"
  ON public.report_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = report_notes.report_id
        AND r.project_id = report_notes.project_id
        AND r.deleted_at IS NULL
        AND public.user_project_role(r.project_id, (SELECT auth.uid()))
          IN ('owner', 'admin', 'editor')
    )
    AND (
      file_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.file_metadata f
        WHERE f.id = report_notes.file_id
          AND f.project_id = report_notes.project_id
          AND f.deleted_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Author or admin can update report notes" ON public.report_notes;

CREATE POLICY "Author or admin can update report notes"
  ON public.report_notes FOR UPDATE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR (
      author_id = (SELECT auth.uid())
      AND public.user_project_role(project_id, (SELECT auth.uid()))
        IN ('owner', 'admin', 'editor')
    )
  )
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR (
      author_id = (SELECT auth.uid())
      AND public.user_project_role(project_id, (SELECT auth.uid()))
        IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author or admin can delete report notes" ON public.report_notes;

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own reports" ON public.reports;
