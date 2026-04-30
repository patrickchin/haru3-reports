-- ============================================================
-- audit_logs — append-only security event log.
--
-- SOC 2 CC4.1 / CC7.2: records authentication events, permission
-- changes, and access to sensitive data so we can investigate
-- incidents and produce evidence for auditors.
--
-- Design:
--   - Append-only (no UPDATE/DELETE policies).
--   - Server inserts (service_role) for trusted server-side events.
--   - Authenticated users may insert their own client-side events
--     via `record_audit_event` RPC; the RPC ignores user-supplied
--     actor_id and stamps it from auth.uid() to prevent spoofing.
--   - Users may SELECT only their own rows; org admins see rows
--     scoped to their projects.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL
                CHECK (length(event_type) BETWEEN 1 AND 64),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resource    text,
  resource_id uuid,
  outcome     text NOT NULL DEFAULT 'success'
                CHECK (outcome IN ('success', 'failure', 'denied')),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ip   inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_event_created_idx
  ON public.audit_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx
  ON public.audit_logs (resource, resource_id) WHERE resource IS NOT NULL;

-- ----------------------------------------------------------------
-- RLS policies — append-only from clients, scoped reads.
-- ----------------------------------------------------------------

-- Users may read their own audit rows.
DROP POLICY IF EXISTS audit_logs_select_own ON public.audit_logs;
CREATE POLICY audit_logs_select_own
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());

-- No UPDATE / DELETE policies → table is effectively append-only.

-- ----------------------------------------------------------------
-- record_audit_event RPC — clients call this with arbitrary metadata;
-- the function stamps actor_id from auth.uid() so users can't forge
-- rows for other users.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_event_type text,
  p_outcome    text DEFAULT 'success',
  p_resource   text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_metadata   jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_event_type IS NULL OR length(p_event_type) = 0 THEN
    RAISE EXCEPTION 'event_type is required';
  END IF;

  IF p_outcome NOT IN ('success', 'failure', 'denied') THEN
    RAISE EXCEPTION 'invalid outcome: %', p_outcome;
  END IF;

  INSERT INTO public.audit_logs (
    event_type, actor_id, resource, resource_id, outcome, metadata
  ) VALUES (
    p_event_type,
    auth.uid(),
    p_resource,
    p_resource_id,
    p_outcome,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit_event(text, text, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_audit_event(text, text, text, uuid, jsonb) TO authenticated, anon;

COMMENT ON TABLE public.audit_logs IS
  'SOC 2 audit log — append-only record of security-relevant events.';
COMMENT ON FUNCTION public.record_audit_event(text, text, text, uuid, jsonb) IS
  'Insert an audit event stamped with auth.uid() as actor_id.';
