-- ============================================================
-- File upload + Supabase Storage
--
-- Adds:
--   • storage buckets: project-files (private), avatars (public)
--   • profiles.avatar_url
--   • public.file_metadata (project-scoped files w/ RLS)
--   • storage.objects RLS for both buckets, gated by existing
--     user_has_project_access() / user_project_role() helpers.
-- ============================================================

-- 1) Buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'project-files',
    'project-files',
    false,
    52428800, -- 50 MB
    NULL      -- mime allow-list enforced in application layer (varies by category)
  ),
  (
    'avatars',
    'avatars',
    true,
    10485760, -- 10 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  )
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) profiles.avatar_url
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 3) file_metadata table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.file_metadata (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket        text NOT NULL DEFAULT 'project-files'
                   CHECK (bucket IN ('project-files', 'avatars')),
  storage_path  text NOT NULL,
  category      text NOT NULL
                   CHECK (category IN ('document', 'image', 'voice-note', 'attachment', 'icon')),
  filename      text NOT NULL CHECK (char_length(trim(filename)) > 0),
  mime_type     text NOT NULL CHECK (char_length(trim(mime_type)) > 0),
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0),

  -- Voice-note-specific (NULL for non-audio)
  duration_ms   integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  transcription text,

  -- Optional link to a report (a file can exist without one, e.g. project-level docs)
  report_id     uuid REFERENCES public.reports(id) ON DELETE SET NULL,

  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),

  UNIQUE (bucket, storage_path)
);

ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS file_metadata_project_id_idx
  ON public.file_metadata (project_id);
CREATE INDEX IF NOT EXISTS file_metadata_report_id_idx
  ON public.file_metadata (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS file_metadata_category_idx
  ON public.file_metadata (project_id, category);
CREATE INDEX IF NOT EXISTS file_metadata_uploaded_by_idx
  ON public.file_metadata (uploaded_by);

DROP TRIGGER IF EXISTS file_metadata_set_updated_at ON public.file_metadata;
CREATE TRIGGER file_metadata_set_updated_at
  BEFORE UPDATE ON public.file_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- 4) RLS policies — file_metadata
-- ============================================================

DROP POLICY IF EXISTS "Members can view project files" ON public.file_metadata;
CREATE POLICY "Members can view project files"
  ON public.file_metadata FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND public.user_has_project_access(project_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Editors can upload files" ON public.file_metadata;
CREATE POLICY "Editors can upload files"
  ON public.file_metadata FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = uploaded_by
    AND public.user_project_role(project_id, (SELECT auth.uid()))
      IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Uploader or admin can update file metadata" ON public.file_metadata;
CREATE POLICY "Uploader or admin can update file metadata"
  ON public.file_metadata FOR UPDATE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR uploaded_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR uploaded_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Uploader or admin can delete files" ON public.file_metadata;
CREATE POLICY "Uploader or admin can delete files"
  ON public.file_metadata FOR DELETE
  TO authenticated
  USING (
    public.user_project_role(project_id, (SELECT auth.uid())) IN ('owner', 'admin')
    OR uploaded_by = (SELECT auth.uid())
  );

-- 5) RLS policies — storage.objects (project-files)
-- ============================================================
-- First path segment is the project_id, e.g.
--   "{project_id}/voice-notes/{uuid}.m4a"

DROP POLICY IF EXISTS "Project members can read project files" ON storage.objects;
CREATE POLICY "Project members can read project files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.user_has_project_access(
      ((storage.foldername(name))[1])::uuid,
      (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Project editors can upload project files" ON storage.objects;
CREATE POLICY "Project editors can upload project files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND public.user_project_role(
      ((storage.foldername(name))[1])::uuid,
      (SELECT auth.uid())
    ) IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Project editors can update project files" ON storage.objects;
CREATE POLICY "Project editors can update project files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.user_project_role(
      ((storage.foldername(name))[1])::uuid,
      (SELECT auth.uid())
    ) IN ('owner', 'admin', 'editor')
  )
  WITH CHECK (
    bucket_id = 'project-files'
    AND public.user_project_role(
      ((storage.foldername(name))[1])::uuid,
      (SELECT auth.uid())
    ) IN ('owner', 'admin', 'editor')
  );

DROP POLICY IF EXISTS "Project admins can delete project files" ON storage.objects;
CREATE POLICY "Project admins can delete project files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.user_project_role(
      ((storage.foldername(name))[1])::uuid,
      (SELECT auth.uid())
    ) IN ('owner', 'admin')
  );

-- 6) RLS policies — storage.objects (avatars)
-- ============================================================
-- First path segment is the user_id, e.g. "{user_id}/{uuid}.jpg"

DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;
CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
