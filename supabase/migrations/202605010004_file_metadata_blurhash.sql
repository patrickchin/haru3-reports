-- Phase 2 image-perf: blurhash placeholders. Stored as TEXT (encoded
-- BlurHash string, typically 20–30 bytes). Generated at capture time
-- via `expo-image`'s `Image.generateBlurhashAsync()` and rendered as
-- `placeholder={{ blurhash }}` so the user sees a ~kilobyte coloured
-- approximation of the photo immediately while the thumbnail/original
-- finish loading.
--
-- NULL is allowed for legacy rows; the `backfill-file-thumbnails` edge
-- function fills these in alongside the JPEG thumbnail.

ALTER TABLE public.file_metadata
  ADD COLUMN IF NOT EXISTS blurhash text;

ALTER TABLE public.file_metadata
  DROP CONSTRAINT IF EXISTS file_metadata_blurhash_length;

ALTER TABLE public.file_metadata
  ADD CONSTRAINT file_metadata_blurhash_length
    CHECK (blurhash IS NULL OR (length(blurhash) BETWEEN 6 AND 200));

COMMENT ON COLUMN public.file_metadata.blurhash IS
  'Encoded BlurHash string used as a placeholder while the full image loads.';
