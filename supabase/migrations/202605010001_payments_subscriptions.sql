-- ============================================================
-- Payment / subscription system
-- See docs/features/01-payment-system-design.md
--
-- Tables:
--   plans                  - tier definitions (seed data, source of truth)
--   subscriptions          - per-user active subscription state
--   subscription_events    - immutable audit log
--   webhook_failures       - dead-letter for failed RevenueCat webhooks
--
-- Helpers:
--   profiles.plan_id       - cache column for fast plan lookup
--   user_entitlements      - convenience view (plan + monthly usage + remaining)
--   process_subscription_event(...)  - transactional webhook handler RPC
--   check_project_quota(uid)         - cheap RLS helper for project insert
-- ============================================================

-- ----------------------------------------------------------------
-- 1. plans
-- ----------------------------------------------------------------

create table public.plans (
  id                     text primary key,
  display_name           text not null,
  monthly_price          integer not null default 0,   -- cents USD
  yearly_price           integer not null default 0,   -- cents USD
  max_projects           integer,                       -- null = unlimited
  max_reports_mo         integer not null,
  max_tokens_mo          bigint not null,
  max_team_members       integer not null default 0,
  allowed_providers      text[] not null default '{}',
  default_provider       text,
  max_images_per_report  integer not null default 3,
  allowed_report_types   text[] not null default '{daily}',
  data_retention_days    integer,                       -- null = unlimited
  created_at             timestamptz not null default timezone('utc'::text, now())
);

alter table public.plans enable row level security;

-- Plans are public reference data
create policy "plans_select_all" on public.plans
  for select to authenticated, anon
  using (true);

-- Seed data
insert into public.plans (
  id, display_name, monthly_price, yearly_price,
  max_projects, max_reports_mo, max_tokens_mo, max_team_members,
  allowed_providers, default_provider,
  max_images_per_report, allowed_report_types, data_retention_days
) values
  (
    'free', 'Free', 0, 0,
    2, 10, 200000, 0,
    array['google'], 'google',
    3, array['daily'], 90
  ),
  (
    'pro', 'Pro', 1499, 14999,
    null, 100, 2000000, 0,
    array['google','openai','anthropic','kimi','deepseek','zai'], 'kimi',
    20, array['daily','safety','incident','inspection','site_visit','progress'], null
  ),
  (
    'team', 'Team', 4999, 49999,
    null, 500, 10000000, 10,
    array['google','openai','anthropic','kimi','deepseek','zai'], 'openai',
    50, array['daily','safety','incident','inspection','site_visit','progress'], null
  );

-- ----------------------------------------------------------------
-- 2. profiles.plan_id (cache column)
-- ----------------------------------------------------------------

alter table public.profiles
  add column if not exists plan_id text not null default 'free' references public.plans(id);

-- ----------------------------------------------------------------
-- 3. subscriptions
-- ----------------------------------------------------------------

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  plan_id                text not null references public.plans(id),
  status                 text not null default 'active'
                          check (status in ('active','grace_period','billing_retry','paused','cancelled','expired')),
  platform               text not null check (platform in ('apple','google','stripe','manual')),
  rc_customer_id         text,
  rc_entitlement_id      text,
  store_product_id       text,
  store_transaction_id   text,
  current_period_start   timestamptz not null default timezone('utc'::text, now()),
  current_period_end     timestamptz,
  cancel_at              timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default timezone('utc'::text, now()),
  updated_at             timestamptz not null default timezone('utc'::text, now())
);

-- Only one active/grace/retry subscription per user; expired rows kept for history.
create unique index subscriptions_active_user_uidx
  on public.subscriptions (user_id)
  where status in ('active','grace_period','billing_retry');

create index subscriptions_user_idx        on public.subscriptions (user_id);
create index subscriptions_rc_customer_idx on public.subscriptions (rc_customer_id);
create index subscriptions_status_idx      on public.subscriptions (status);

alter table public.subscriptions enable row level security;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_current_timestamp_updated_at();

create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "subscriptions_service_insert" on public.subscriptions
  for insert to service_role
  with check (true);

create policy "subscriptions_service_update" on public.subscriptions
  for update to service_role
  using (true) with check (true);

-- ----------------------------------------------------------------
-- 4. subscription_events (immutable audit log)
-- ----------------------------------------------------------------

create table public.subscription_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  event_type      text not null,
  old_plan_id     text references public.plans(id),
  new_plan_id     text references public.plans(id),
  platform        text,
  rc_event_id     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc'::text, now())
);

create index subscription_events_user_idx on public.subscription_events (user_id);
create index subscription_events_sub_idx  on public.subscription_events (subscription_id);
create unique index subscription_events_rc_uidx
  on public.subscription_events (rc_event_id)
  where rc_event_id is not null;

alter table public.subscription_events enable row level security;

create policy "subscription_events_select_own" on public.subscription_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "subscription_events_service_insert" on public.subscription_events
  for insert to service_role
  with check (true);

-- ----------------------------------------------------------------
-- 5. webhook_failures (dead letter)
-- ----------------------------------------------------------------

create table public.webhook_failures (
  id          uuid primary key default gen_random_uuid(),
  event_id    text,
  payload     jsonb not null,
  error       text not null,
  retries     integer not null default 0,
  resolved_at timestamptz,
  created_at  timestamptz not null default timezone('utc'::text, now())
);

alter table public.webhook_failures enable row level security;

create policy "webhook_failures_service_only" on public.webhook_failures
  for all to service_role
  using (true) with check (true);

-- ----------------------------------------------------------------
-- 6. user_entitlements view (plan + monthly usage)
-- security_invoker so RLS on underlying tables applies to caller.
-- ----------------------------------------------------------------

create or replace view public.user_entitlements
with (security_invoker = true) as
select
  p.id                                             as user_id,
  coalesce(s.plan_id, p.plan_id, 'free')           as plan_id,
  pl.display_name                                  as plan_name,
  coalesce(s.status, 'active')                     as subscription_status,
  pl.max_projects,
  pl.max_reports_mo,
  pl.max_tokens_mo,
  pl.max_team_members,
  pl.allowed_providers,
  pl.default_provider,
  pl.max_images_per_report,
  pl.allowed_report_types,
  pl.data_retention_days,
  s.current_period_end,
  coalesce(r.report_count, 0)                      as reports_used_mo,
  coalesce(t.tokens_used, 0)                       as tokens_used_mo,
  greatest(pl.max_reports_mo - coalesce(r.report_count, 0), 0)::integer as reports_remaining_mo,
  greatest(pl.max_tokens_mo - coalesce(t.tokens_used, 0), 0)::bigint    as tokens_remaining_mo
from public.profiles p
left join public.subscriptions s
  on s.user_id = p.id
 and s.status in ('active','grace_period')
left join public.plans pl
  on pl.id = coalesce(s.plan_id, p.plan_id, 'free')
left join lateral (
  select count(*)::integer as report_count
  from public.reports
  where owner_id = p.id
    and created_at >= date_trunc('month', timezone('utc'::text, now()))
    and deleted_at is null
) r on true
left join lateral (
  -- Only count input + output; cached_tokens are excluded from budget
  -- since providers like Anthropic don't charge for cache reads.
  select coalesce(sum(input_tokens + output_tokens), 0)::bigint as tokens_used
  from public.token_usage
  where user_id = p.id
    and created_at >= date_trunc('month', timezone('utc'::text, now()))
) t on true;

-- ----------------------------------------------------------------
-- 7. Performance indexes for entitlement view
-- ----------------------------------------------------------------

create index if not exists reports_owner_created_idx
  on public.reports (owner_id, created_at)
  where deleted_at is null;

-- token_usage already has token_usage_created_at_idx (user_id, created_at desc),
-- which serves the entitlement view's monthly sum.

-- ----------------------------------------------------------------
-- 8. Project quota helper (cheap, used in projects RLS)
-- ----------------------------------------------------------------

create or replace function public.check_project_quota(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_count integer;
begin
  select pl.max_projects into v_max
  from public.profiles p
  join public.plans pl on pl.id = p.plan_id
  where p.id = uid;

  if v_max is null then
    return true; -- unlimited
  end if;

  select count(*) into v_count
  from public.projects
  where owner_id = uid and deleted_at is null;

  return v_count < v_max;
end;
$$;

grant execute on function public.check_project_quota(uuid) to authenticated;

-- Add a project-quota policy alongside existing project policies.
-- RESTRICTIVE means it ANDs with existing PERMISSIVE policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_insert_within_plan_quota'
  ) then
    execute 'create policy "projects_insert_within_plan_quota" on public.projects ' ||
            'as restrictive for insert to authenticated ' ||
            'with check (public.check_project_quota((select auth.uid())))';
  end if;
end $$;

-- ----------------------------------------------------------------
-- 9. Transactional webhook RPC
-- All subscription state changes happen here so profiles.plan_id never
-- goes stale due to a partial webhook failure.
-- ----------------------------------------------------------------

create or replace function public.process_subscription_event(
  p_user_id           uuid,
  p_plan_id           text,
  p_status            text,
  p_platform          text,
  p_rc_customer_id    text,
  p_store_product_id  text,
  p_store_txn_id      text,
  p_period_start      timestamptz,
  p_period_end        timestamptz,
  p_event_type        text,
  p_old_plan_id       text,
  p_rc_event_id       text,
  p_metadata          jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
begin
  -- Idempotency: if we've already processed this exact RevenueCat event,
  -- return the existing subscription id and do nothing else.
  if p_rc_event_id is not null then
    select subscription_id into v_sub_id
    from public.subscription_events
    where rc_event_id = p_rc_event_id
    limit 1;
    if v_sub_id is not null then
      return v_sub_id;
    end if;
  end if;

  -- Upsert active subscription. The partial unique index on
  -- (user_id) where status in ('active','grace_period','billing_retry')
  -- gives us the right conflict target.
  insert into public.subscriptions (
    user_id, plan_id, status, platform, rc_customer_id,
    store_product_id, store_transaction_id,
    current_period_start, current_period_end
  ) values (
    p_user_id, p_plan_id, p_status, p_platform, p_rc_customer_id,
    p_store_product_id, p_store_txn_id,
    coalesce(p_period_start, timezone('utc'::text, now())),
    p_period_end
  )
  on conflict (user_id)
  where status in ('active','grace_period','billing_retry')
  do update set
    plan_id              = excluded.plan_id,
    status               = excluded.status,
    platform             = excluded.platform,
    rc_customer_id       = coalesce(excluded.rc_customer_id, public.subscriptions.rc_customer_id),
    store_product_id     = coalesce(excluded.store_product_id, public.subscriptions.store_product_id),
    store_transaction_id = coalesce(excluded.store_transaction_id, public.subscriptions.store_transaction_id),
    current_period_start = excluded.current_period_start,
    current_period_end   = excluded.current_period_end,
    updated_at           = timezone('utc'::text, now())
  returning id into v_sub_id;

  if v_sub_id is null then
    -- Conflict target didn't match (e.g. user moved straight to expired);
    -- find the row we just touched.
    select id into v_sub_id
    from public.subscriptions
    where user_id = p_user_id
    order by updated_at desc
    limit 1;
  end if;

  -- Append immutable audit log entry. Unique index on rc_event_id
  -- prevents duplicate logging on retries.
  insert into public.subscription_events (
    user_id, subscription_id, event_type,
    old_plan_id, new_plan_id, platform, rc_event_id, metadata
  ) values (
    p_user_id, v_sub_id, p_event_type,
    p_old_plan_id, p_plan_id, p_platform, p_rc_event_id, p_metadata
  );

  -- Update fast-path cache on profile.
  update public.profiles
     set plan_id = p_plan_id
   where id = p_user_id;

  return v_sub_id;
end;
$$;

revoke all on function public.process_subscription_event(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, jsonb
) from public;

grant execute on function public.process_subscription_event(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text, text, text, jsonb
) to service_role;
