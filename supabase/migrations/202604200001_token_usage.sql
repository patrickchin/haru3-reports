-- ============================================================
-- Token usage tracking for per-account billing & analytics
-- ============================================================

CREATE TABLE public.token_usage (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  report_id      uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  cached_tokens  integer NOT NULL DEFAULT 0,
  model          text NOT NULL,
  provider       text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX token_usage_user_id_idx ON public.token_usage (user_id);
CREATE INDEX token_usage_project_id_idx ON public.token_usage (project_id);
CREATE INDEX token_usage_created_at_idx ON public.token_usage (user_id, created_at DESC);

-- Users can only read their own usage
CREATE POLICY "Users can view own token usage"
  ON public.token_usage FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Only service role (edge functions) inserts usage rows
CREATE POLICY "Service role can insert token usage"
  ON public.token_usage FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================
-- Monthly aggregation view
-- security_invoker ensures RLS on token_usage is enforced
-- for the calling user, not the view owner.
-- ============================================================

CREATE VIEW public.token_usage_monthly
WITH (security_invoker = true) AS
SELECT
  user_id,
  date_trunc('month', created_at) AS month,
  SUM(input_tokens)::integer  AS input_tokens,
  SUM(output_tokens)::integer AS output_tokens,
  SUM(cached_tokens)::integer AS cached_tokens,
  COUNT(*)::integer            AS generation_count
FROM public.token_usage
GROUP BY user_id, date_trunc('month', created_at);
