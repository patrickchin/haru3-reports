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
-- ============================================================

-- Drop the old non-unique index first, then create the unique partial one.
DROP INDEX IF EXISTS report_notes_report_position_idx;

CREATE UNIQUE INDEX report_notes_report_position_uniq
  ON public.report_notes (report_id, position)
  WHERE deleted_at IS NULL;
