-- Add `voice_title` + `voice_summary` to file_metadata for voice-note
-- summarization. Only meaningful for category='voice-note' rows whose
-- transcription is long enough to be worth summarizing; NULL for everything
-- else.
--
-- Stored on file_metadata (rather than report_notes) because a voice note is
-- one audio recording -- its summary is intrinsic to the audio content, not
-- to which report it is attached. This means the same voice note shows the
-- same title/summary everywhere it is referenced.
--
-- Writes happen from the `summarize-voice-note` edge function via the
-- service-role key, so no new RLS policy is needed (service-role bypasses
-- RLS). Existing SELECT policy "Members can view project files" already
-- covers reads of these columns.

ALTER TABLE public.file_metadata
  ADD COLUMN IF NOT EXISTS voice_title text;

ALTER TABLE public.file_metadata
  ADD COLUMN IF NOT EXISTS voice_summary text;

-- Length caps mirror the contract enforced by the edge function. Allow NULL
-- so existing rows and non-voice files are unaffected.
ALTER TABLE public.file_metadata
  ADD CONSTRAINT file_metadata_voice_title_length
    CHECK (voice_title IS NULL OR char_length(voice_title) <= 60);

ALTER TABLE public.file_metadata
  ADD CONSTRAINT file_metadata_voice_summary_length
    CHECK (voice_summary IS NULL OR char_length(voice_summary) <= 400);
