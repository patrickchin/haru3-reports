-- ============================================================
-- Projects
-- ============================================================

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(trim(name)) > 0),
  address     text,
  client_name text,
  status      text not null default 'active'
                check (status in ('active', 'delayed', 'completed', 'archived')),
  created_at  timestamptz not null default timezone('utc'::text, now()),
  updated_at  timestamptz not null default timezone('utc'::text, now())
);

alter table public.projects enable row level security;

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_current_timestamp_updated_at();

create index projects_owner_id_idx on public.projects (owner_id);

drop policy if exists "Users can insert own projects" on public.projects;
drop policy if exists "Users can view own projects" on public.projects;
drop policy if exists "Users can update own projects" on public.projects;
drop policy if exists "Users can delete own projects" on public.projects;

create policy "Users can insert own projects"
  on public.projects for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can view own projects"
  on public.projects for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can update own projects"
  on public.projects for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete own projects"
  on public.projects for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ============================================================
-- Reports
-- ============================================================

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  title         text not null default '',
  report_type   text not null default 'daily'
                  check (report_type in (
                    'daily', 'safety', 'incident',
                    'inspection', 'site_visit', 'progress'
                  )),
  status        text not null default 'draft'
                  check (status in ('draft', 'final')),
  visit_date    date,
  confidence    smallint check (confidence is null or confidence between 0 and 100),
  notes         text[] not null default '{}',
  report_data   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default timezone('utc'::text, now()),
  updated_at    timestamptz not null default timezone('utc'::text, now())
);

alter table public.reports enable row level security;

create trigger reports_set_updated_at
  before update on public.reports
  for each row
  execute function public.set_current_timestamp_updated_at();

create index reports_project_id_idx on public.reports (project_id);
create index reports_owner_id_idx on public.reports (owner_id);
create index reports_visit_date_idx on public.reports (project_id, visit_date desc);

drop policy if exists "Users can insert own reports" on public.reports;
drop policy if exists "Users can view own reports" on public.reports;
drop policy if exists "Users can update own reports" on public.reports;
drop policy if exists "Users can delete own reports" on public.reports;

create policy "Users can insert own reports"
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can view own reports"
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can update own reports"
  on public.reports for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete own reports"
  on public.reports for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
