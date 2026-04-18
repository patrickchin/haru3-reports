-- ============================================================
-- Drop Admin Platform
-- Reverses 202604020001_admin_platform.sql
-- ============================================================

-- Drop the is_admin() helper function
drop function if exists public.is_admin();

-- Drop column: projects.organization_id (and its index)
drop index if exists public.projects_org_idx;
alter table public.projects drop column if exists organization_id;

-- Drop column: profiles.disabled_at
alter table public.profiles drop column if exists disabled_at;

-- Drop table: report_generation_log
drop table if exists public.report_generation_log;

-- Drop table: admin_audit_log
drop table if exists public.admin_audit_log;

-- Drop RLS policies that create cross-table dependencies
drop policy if exists "Members can view their organization" on public.organizations;
drop policy if exists "Members can view own memberships" on public.org_members;

-- Drop table: org_members (before organizations, due to FK)
drop table if exists public.org_members;

-- Drop table: organizations
drop table if exists public.organizations;

-- Drop table: user_roles
drop table if exists public.user_roles;
