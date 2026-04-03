-- ============================================================
-- Admin Platform — Phase 1
-- New tables: user_roles, organizations, org_members,
--             admin_audit_log, report_generation_log
-- Alterations: profiles.disabled_at, projects.organization_id
-- ============================================================

-- ============================================================
-- User Roles
-- Populated manually via service_role API (not user-facing)
-- ============================================================
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('user', 'org_admin', 'admin', 'super_admin')),
  created_at timestamptz not null default timezone('utc'::text, now()),

  unique (user_id, role)
);

alter table public.user_roles enable row level security;
-- No end-user policies — accessed via service_role in Edge Functions only.

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

-- ============================================================
-- Organizations
-- ============================================================
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) > 0),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  plan       text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  max_seats  int  not null default 5,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.organizations enable row level security;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row
  execute function public.set_current_timestamp_updated_at();

-- Users can read their own org (via org_members).
-- All mutations are admin-only (Edge Functions use service_role).
drop policy if exists "Members can view their organization" on public.organizations;
create policy "Members can view their organization"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1 from public.org_members
      where org_members.organization_id = organizations.id
        and org_members.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- Organization Members
-- ============================================================
create table if not exists public.org_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member' check (role in ('member', 'admin', 'owner')),
  joined_at       timestamptz not null default timezone('utc'::text, now()),

  unique (organization_id, user_id)
);

alter table public.org_members enable row level security;

create index if not exists org_members_org_idx  on public.org_members (organization_id);
create index if not exists org_members_user_idx on public.org_members (user_id);

drop policy if exists "Members can view own memberships" on public.org_members;
create policy "Members can view own memberships"
  on public.org_members for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- Admin Audit Log (append-only — no RLS deletes/updates)
-- ============================================================
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid   not null references public.profiles(id),
  action      text   not null,       -- e.g. 'user.disable', 'org.create'
  target_type text,                  -- e.g. 'user', 'organization', 'report'
  target_id   text,                  -- UUID of affected row
  metadata    jsonb  not null default '{}'::jsonb,
  created_at  timestamptz not null default timezone('utc'::text, now())
);

alter table public.admin_audit_log enable row level security;
-- No end-user policies — service_role only.

create index if not exists audit_log_admin_idx   on public.admin_audit_log (admin_id);
create index if not exists audit_log_created_idx on public.admin_audit_log (created_at desc);

-- ============================================================
-- Report Generation Log (AI observability)
-- ============================================================
create table if not exists public.report_generation_log (
  id            bigint generated always as identity primary key,
  report_id     uuid     references public.reports(id) on delete set null,
  user_id       uuid   not null references public.profiles(id),
  provider      text   not null,
  model         text   not null,
  input_tokens  int,
  output_tokens int,
  latency_ms    int,
  confidence    smallint check (confidence is null or confidence between 0 and 100),
  error         text,
  created_at    timestamptz not null default timezone('utc'::text, now())
);

alter table public.report_generation_log enable row level security;

create index if not exists gen_log_user_idx    on public.report_generation_log (user_id);
create index if not exists gen_log_created_idx on public.report_generation_log (created_at desc);
create index if not exists gen_log_report_idx  on public.report_generation_log (report_id);

-- Users can view their own generation logs (for a future "usage" page).
drop policy if exists "Users can view own generation logs" on public.report_generation_log;
create policy "Users can view own generation logs"
  on public.report_generation_log for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================
-- Alter: profiles — add disabled_at
-- ============================================================
alter table public.profiles
  add column if not exists disabled_at timestamptz;

-- ============================================================
-- Alter: projects — add optional organization_id
-- ============================================================
alter table public.projects
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists projects_org_idx on public.projects (organization_id);

-- ============================================================
-- Helper function: is_admin()
-- Used by RLS policies that need to check admin role.
-- Returns true if the current user has admin or super_admin role.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;
