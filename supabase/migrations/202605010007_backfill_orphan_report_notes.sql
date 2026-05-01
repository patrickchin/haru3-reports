-- ============================================================
-- Backfill: create `report_notes` rows for orphan `file_metadata`
-- rows that belong to a report but were never linked.
--
-- Bug context
-- -----------
-- The mobile client used to insert `file_metadata` rows for image,
-- document, and voice-note uploads, but only the voice path created
-- a matching `report_notes` row — and even that path skipped rows
-- with empty transcriptions. Result: `file_metadata` could contain
-- rows that participated in a draft yet had no `report_notes` row
-- pointing at them. Reports rendered the orphan files anyway because
-- the UI listed all project files, not just files linked through
-- `report_notes`. The fix forbids that path going forward; this
-- migration repairs existing data.
--
-- Scope
-- -----
-- Only file_metadata rows that:
--   • are not soft-deleted
--   • carry a non-null `report_id` (the report they were captured for)
--   • have category in (voice-note, image, document, attachment)
--   • have NO existing report_notes row referencing them via file_id
--
-- A `report_notes` row is inserted with:
--   kind     = derived from category
--   body     = file_metadata.transcription for voice notes, otherwise NULL
--   author_id = file_metadata.uploaded_by
--   position = MAX(position) + 1 for the report
--   file_id  = file_metadata.id
--
-- Files with report_id IS NULL are left untouched — they are project
-- assets, not part of any specific report.
--
-- IMPORTANT: This migration is **only runnable** when `file_metadata`
-- still has the legacy `report_id` and `transcription` columns. On a
-- fresh database (or any DB created after 202604300003 dropped those
-- columns) there is nothing to backfill — the orphan-creation code
-- path it repaired never ran on this DB. Gate the whole INSERT on
-- column presence so `supabase db reset` and CI bootstraps don't
-- explode with `column fm.report_id does not exist`.
-- ============================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'file_metadata'
      AND column_name  = 'report_id'
  ) THEN
    RAISE NOTICE 'Skipping orphan report_notes backfill: '
                 'file_metadata.report_id has already been dropped.';
    RETURN;
  END IF;

  EXECUTE $sql$
WITH candidates AS (
  SELECT
    fm.id            AS file_id,
    fm.project_id    AS project_id,
    fm.report_id     AS report_id,
    fm.uploaded_by   AS author_id,
    fm.category      AS category,
    fm.transcription AS transcription,
    fm.created_at    AS created_at
  FROM public.file_metadata fm
  WHERE fm.deleted_at IS NULL
    AND fm.report_id IS NOT NULL
    AND fm.category IN ('voice-note', 'image', 'document', 'attachment')
    AND NOT EXISTS (
      SELECT 1
      FROM public.report_notes rn
      WHERE rn.file_id = fm.id
        AND rn.deleted_at IS NULL
    )
),
positioned AS (
  SELECT
    c.*,
    COALESCE(
      (SELECT MAX(rn.position)
         FROM public.report_notes rn
         WHERE rn.report_id = c.report_id
           AND rn.deleted_at IS NULL),
      0
    )
    + ROW_NUMBER() OVER (PARTITION BY c.report_id ORDER BY c.created_at)
    AS new_position
  FROM candidates c
)
INSERT INTO public.report_notes (
  id, report_id, project_id, author_id, position, kind, body, file_id, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  p.report_id,
  p.project_id,
  p.author_id,
  p.new_position,
  CASE
    WHEN p.category = 'voice-note' THEN 'voice'
    WHEN p.category = 'image'      THEN 'image'
    ELSE 'document'  -- document, attachment
  END,
  CASE WHEN p.category = 'voice-note' THEN p.transcription ELSE NULL END,
  p.file_id,
  p.created_at,
  timezone('utc'::text, now())
FROM positioned p
ON CONFLICT DO NOTHING;
  $sql$;
END
$do$;
