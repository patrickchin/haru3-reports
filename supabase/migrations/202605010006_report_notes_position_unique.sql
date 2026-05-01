-- ============================================================
-- Add partial unique index on report_notes (report_id, position)
-- for non-deleted rows.
--
-- Without this, two concurrent writes (e.g. a text note + a voice
-- transcription completing at the same moment) can both compute
-- MAX(position)+1 = N and insert with the same position, making
-- ordering non-deterministic.
--
-- The partial index excludes soft-deleted rows (deleted_at IS NOT NULL)
-- so deleting a note never conflicts. On conflict, callers should
-- reassign positions.
--
-- IMPORTANT: hosted DBs already contain duplicate (report_id, position)
-- pairs from before this index existed (the same race we're now
-- preventing). Deduplicate live data first by re-numbering colliding
-- rows so the index can be created. Order is stable (created_at,
-- then id) so the surviving row with the original `position` is
-- deterministic.
-- ============================================================

-- Drop the old non-unique index first.
DROP INDEX IF EXISTS report_notes_report_position_idx;

-- Renumber duplicates: for each (report_id, position) collision, keep
-- the earliest row at its original position and bump the rest to the
-- tail of the report. We bump by adding to MAX(position) so the new
-- numbers don't collide with each other or with existing rows.
WITH duplicates AS (
  SELECT
    id,
    report_id,
    position,
    ROW_NUMBER() OVER (
      PARTITION BY report_id, position
      ORDER BY created_at, id
    ) AS dup_rank
  FROM public.report_notes
  WHERE deleted_at IS NULL
),
report_max AS (
  SELECT report_id, MAX(position) AS max_pos
  FROM public.report_notes
  WHERE deleted_at IS NULL
  GROUP BY report_id
),
renumbered AS (
  SELECT
    d.id,
    rm.max_pos
      + ROW_NUMBER() OVER (PARTITION BY d.report_id ORDER BY d.position, d.id)
      AS new_position
  FROM duplicates d
  JOIN report_max rm ON rm.report_id = d.report_id
  WHERE d.dup_rank > 1
)
UPDATE public.report_notes rn
SET    position = r.new_position,
       updated_at = timezone('utc'::text, now())
FROM   renumbered r
WHERE  rn.id = r.id;

CREATE UNIQUE INDEX report_notes_report_position_uniq
  ON public.report_notes (report_id, position)
  WHERE deleted_at IS NULL;
