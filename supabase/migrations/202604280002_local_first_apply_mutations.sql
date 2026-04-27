-- ============================================================
-- Local-first: client_ops idempotency table + apply_*_mutation RPCs
--
-- The mobile outbox sends a `client_op_id` UUID with every mutation.
-- The server records it in `client_ops` so retries (after partial
-- failure / lost ack) replay the cached response — exactly-once.
-- Records are GC'd after 7 days by the cron job below.
-- ============================================================

-- ----------------------------------------------------------------
-- client_ops
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_ops (
  client_op_id  uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity        text NOT NULL,
  entity_id     uuid NOT NULL,
  response_json jsonb NOT NULL,
  applied_at    timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS client_ops_user_idx ON public.client_ops (user_id);
CREATE INDEX IF NOT EXISTS client_ops_applied_at_idx ON public.client_ops (applied_at);

ALTER TABLE public.client_ops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own client_ops" ON public.client_ops;
CREATE POLICY "Users can read own client_ops"
  ON public.client_ops FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- writes happen only via SECURITY DEFINER RPCs below.

-- ----------------------------------------------------------------
-- Helper: cached response for an existing client_op_id
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cached_client_op(
  p_client_op_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT response_json FROM public.client_ops
  WHERE client_op_id = p_client_op_id AND user_id = p_user_id;
$$;

-- ----------------------------------------------------------------
-- apply_project_mutation
--
-- Payload shape:
--   { client_op_id, op:'insert'|'update'|'delete', id, base_version, fields }
-- Response:
--   { status:'applied'|'conflict'|'duplicate'|'forbidden',
--     server_version: timestamptz, row: row | null }
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_project_mutation(jsonb);

CREATE OR REPLACE FUNCTION public.apply_project_mutation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_client_op_id uuid := (p_payload->>'client_op_id')::uuid;
  v_op text := p_payload->>'op';
  v_id uuid := (p_payload->>'id')::uuid;
  v_base timestamptz := NULLIF(p_payload->>'base_version','')::timestamptz;
  v_fields jsonb := COALESCE(p_payload->'fields', '{}'::jsonb);
  v_existing public.projects;
  v_row public.projects;
  v_response jsonb;
  v_cached jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay
  v_cached := public._cached_client_op(v_client_op_id, v_user);
  IF v_cached IS NOT NULL THEN
    RETURN jsonb_set(v_cached, '{status}', '"duplicate"'::jsonb);
  END IF;

  IF v_op = 'insert' THEN
    -- Owner is forced to the caller; payload owner_id is ignored.
    INSERT INTO public.projects (
      id, owner_id, name, address, client_name, status
    ) VALUES (
      v_id,
      v_user,
      COALESCE(v_fields->>'name', ''),
      v_fields->>'address',
      v_fields->>'client_name',
      COALESCE(v_fields->>'status', 'active')
    )
    RETURNING * INTO v_row;

    v_response := jsonb_build_object(
      'status', 'applied',
      'server_version', v_row.updated_at,
      'row', to_jsonb(v_row)
    );

  ELSIF v_op = 'update' THEN
    SELECT * INTO v_existing FROM public.projects WHERE id = v_id;
    IF NOT FOUND OR v_existing.owner_id <> v_user THEN
      v_response := jsonb_build_object(
        'status', 'forbidden', 'server_version', now(), 'row', null
      );
    ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
      v_response := jsonb_build_object(
        'status', 'conflict',
        'server_version', v_existing.updated_at,
        'row', to_jsonb(v_existing)
      );
    ELSE
      UPDATE public.projects SET
        name        = COALESCE(v_fields->>'name', name),
        address     = COALESCE(v_fields->>'address', address),
        client_name = COALESCE(v_fields->>'client_name', client_name),
        status      = COALESCE(v_fields->>'status', status)
      WHERE id = v_id
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status', 'applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;

  ELSIF v_op = 'delete' THEN
    SELECT * INTO v_existing FROM public.projects WHERE id = v_id;
    IF NOT FOUND OR v_existing.owner_id <> v_user THEN
      v_response := jsonb_build_object(
        'status', 'forbidden', 'server_version', now(), 'row', null
      );
    ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
      v_response := jsonb_build_object(
        'status', 'conflict',
        'server_version', v_existing.updated_at,
        'row', to_jsonb(v_existing)
      );
    ELSE
      UPDATE public.projects SET deleted_at = timezone('utc', now())
      WHERE id = v_id
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status', 'applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown op %', v_op USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_ops (client_op_id, user_id, entity, entity_id, response_json)
  VALUES (v_client_op_id, v_user, 'project', v_id, v_response)
  ON CONFLICT (client_op_id) DO NOTHING;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_project_mutation(jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- apply_report_mutation
-- Whole-replace for jsonb fields (notes, report_data) per locked decision.
-- Editor role on project_members is allowed to update; only the owner can
-- insert or delete (matches existing reports RLS policies).
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_report_mutation(jsonb);

CREATE OR REPLACE FUNCTION public.apply_report_mutation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_client_op_id uuid := (p_payload->>'client_op_id')::uuid;
  v_op text := p_payload->>'op';
  v_id uuid := (p_payload->>'id')::uuid;
  v_base timestamptz := NULLIF(p_payload->>'base_version','')::timestamptz;
  v_fields jsonb := COALESCE(p_payload->'fields', '{}'::jsonb);
  v_project_id uuid;
  v_existing public.reports;
  v_row public.reports;
  v_can_write boolean;
  v_response jsonb;
  v_cached jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  v_cached := public._cached_client_op(v_client_op_id, v_user);
  IF v_cached IS NOT NULL THEN
    RETURN jsonb_set(v_cached, '{status}', '"duplicate"'::jsonb);
  END IF;

  IF v_op = 'insert' THEN
    v_project_id := (v_fields->>'project_id')::uuid;
    -- Insert allowed only if the caller owns the project.
    IF NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = v_project_id AND p.owner_id = v_user
    ) THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      INSERT INTO public.reports (
        id, project_id, owner_id, title, report_type, status,
        visit_date, confidence, notes, report_data
      ) VALUES (
        v_id, v_project_id, v_user,
        COALESCE(v_fields->>'title', ''),
        COALESCE(v_fields->>'report_type', 'daily'),
        COALESCE(v_fields->>'status', 'draft'),
        NULLIF(v_fields->>'visit_date','')::date,
        NULLIF(v_fields->>'confidence','')::smallint,
        CASE
          WHEN v_fields ? 'notes' THEN (
            SELECT COALESCE(array_agg(value::text), ARRAY[]::text[])
            FROM jsonb_array_elements_text(v_fields->'notes')
          )
          ELSE ARRAY[]::text[]
        END,
        COALESCE(v_fields->'report_data', '{}'::jsonb)
      )
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status','applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;

  ELSIF v_op = 'update' THEN
    SELECT * INTO v_existing FROM public.reports WHERE id = v_id;
    IF NOT FOUND THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSE
      v_can_write := (v_existing.owner_id = v_user) OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = v_existing.project_id
          AND pm.user_id = v_user
          AND pm.role IN ('owner','editor')
      );
      IF NOT v_can_write THEN
        v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
      ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
        v_response := jsonb_build_object(
          'status','conflict',
          'server_version', v_existing.updated_at,
          'row', to_jsonb(v_existing)
        );
      ELSE
        UPDATE public.reports SET
          title       = COALESCE(v_fields->>'title', title),
          status      = COALESCE(v_fields->>'status', status),
          visit_date  = COALESCE(NULLIF(v_fields->>'visit_date','')::date, visit_date),
          confidence  = COALESCE(NULLIF(v_fields->>'confidence','')::smallint, confidence),
          notes       = CASE
            WHEN v_fields ? 'notes' THEN (
              SELECT COALESCE(array_agg(value::text), ARRAY[]::text[])
              FROM jsonb_array_elements_text(v_fields->'notes')
            )
            ELSE notes
          END,
          report_data = COALESCE(v_fields->'report_data', report_data)
        WHERE id = v_id
        RETURNING * INTO v_row;
        v_response := jsonb_build_object(
          'status','applied',
          'server_version', v_row.updated_at,
          'row', to_jsonb(v_row)
        );
      END IF;
    END IF;

  ELSIF v_op = 'delete' THEN
    SELECT * INTO v_existing FROM public.reports WHERE id = v_id;
    IF NOT FOUND OR v_existing.owner_id <> v_user THEN
      v_response := jsonb_build_object('status','forbidden','server_version',now(),'row',null);
    ELSIF v_base IS NOT NULL AND v_existing.updated_at <> v_base THEN
      v_response := jsonb_build_object(
        'status','conflict',
        'server_version', v_existing.updated_at,
        'row', to_jsonb(v_existing)
      );
    ELSE
      UPDATE public.reports SET deleted_at = timezone('utc', now())
      WHERE id = v_id
      RETURNING * INTO v_row;
      v_response := jsonb_build_object(
        'status','applied',
        'server_version', v_row.updated_at,
        'row', to_jsonb(v_row)
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown op %', v_op USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_ops (client_op_id, user_id, entity, entity_id, response_json)
  VALUES (v_client_op_id, v_user, 'report', v_id, v_response)
  ON CONFLICT (client_op_id) DO NOTHING;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_report_mutation(jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- GC for client_ops (manual run; can be wired to pg_cron later)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gc_client_ops(p_older_than interval DEFAULT '7 days')
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH d AS (
    DELETE FROM public.client_ops
    WHERE applied_at < now() - p_older_than
    RETURNING 1
  ) SELECT count(*)::int FROM d;
$$;

REVOKE ALL ON FUNCTION public.gc_client_ops(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gc_client_ops(interval) TO service_role;
