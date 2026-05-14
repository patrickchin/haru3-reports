-- ============================================================
-- Backfill: migrate existing reports.notes[] into report_notes rows.
--
-- For each report that has a non-empty notes array, create one
-- report_notes row per array element with:
--   kind     = 'text'
--   body     = the text content
--   author_id = report.owner_id (only author we can attribute)
--   position = array index (1-based)
--   file_id  = NULL (no lineage available for historical text notes)
--
-- This is a data-only migration. Schema was created in the prior
-- migration (202604300001_report_notes.sql).
-- ============================================================

INSERT INTO public.report_notes (
  id, report_id, project_id, author_id, position, kind, body, file_id
)
SELECT
  gen_random_uuid(),
  r.id,
  r.project_id,
  r.owner_id,
  ordinality,
  'text',
  note_text,
  NULL
FROM public.reports r,
     LATERAL unnest(r.notes) WITH ORDINALITY AS t(note_text, ordinality)
WHERE array_length(r.notes, 1) > 0
ON CONFLICT DO NOTHING;
