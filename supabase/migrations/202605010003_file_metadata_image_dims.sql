-- Phase 1 image-performance: capture-time preprocessing produces a
-- thumbnail and records the source image's intrinsic dimensions. List
-- views render the thumbnail inline (no full-res download), and the
-- known w/h prevents content shift while pixels load.
--
-- Columns are nullable for backwards compatibility — pre-existing image
-- rows are backfilled by the `backfill-file-thumbnails` Edge Function.

ALTER TABLE public.file_metadata
  ADD COLUMN IF NOT EXISTS width int,
  ADD COLUMN IF NOT EXISTS height int,
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

ALTER TABLE public.file_metadata
  DROP CONSTRAINT IF EXISTS file_metadata_width_positive,
  DROP CONSTRAINT IF EXISTS file_metadata_height_positive;

ALTER TABLE public.file_metadata
  ADD CONSTRAINT file_metadata_width_positive  CHECK (width  IS NULL OR width  > 0),
  ADD CONSTRAINT file_metadata_height_positive CHECK (height IS NULL OR height > 0);

COMMENT ON COLUMN public.file_metadata.width IS
  'Intrinsic pixel width of the uploaded image (NULL for non-images / legacy rows).';
COMMENT ON COLUMN public.file_metadata.height IS
  'Intrinsic pixel height of the uploaded image (NULL for non-images / legacy rows).';
COMMENT ON COLUMN public.file_metadata.thumbnail_path IS
  'Storage path of the small JPEG preview rendered in list views.';
