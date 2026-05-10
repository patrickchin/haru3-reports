-- Add per-user AI provider/model preference columns to profiles.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model    text;

COMMENT ON COLUMN profiles.ai_provider IS 'Preferred AI provider key (kimi, openai, anthropic, google, zai, deepseek). NULL = use server default.';
COMMENT ON COLUMN profiles.ai_model    IS 'Preferred model ID for the chosen provider. NULL = use provider default.';
