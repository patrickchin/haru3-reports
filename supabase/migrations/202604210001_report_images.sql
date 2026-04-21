-- ============================================================
-- Report Images
--
-- Stores photos attached to a report. The image bytes live in
-- Supabase Storage (bucket `report-images`); this table holds
-- metadata and the user/AI-chosen placement target.
--
-- Photos are interleaved with voice notes via reports.timeline,
-- so the AI can suggest placement based on surrounding notes.
-- ============================================================

create table public.report_images (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.reports(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  storage_path   text not null,
  thumbnail_path text,
  caption        text,
  latitude       double precision,
  longitude      double precision,
  taken_at       timestamptz,
  mime_type      text not null default 'image/jpeg',
  size_bytes     integer not null default 0,
  width          integer,
  height         integer,
  -- "activity:{index}" | "issue:{index}" | null (top-level)
  linked_to      text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default timezone('utc'::text, now())
);

alter table public.report_images enable row level security;

create index report_images_report_id_idx on public.report_images (report_id, sort_order);
create index report_images_owner_id_idx  on public.report_images (owner_id);

drop policy if exists "Users can insert own report images" on public.report_images;
drop policy if exists "Users can view own report images"   on public.report_images;
drop policy if exists "Users can update own report images" on public.report_images;
drop policy if exists "Users can delete own report images" on public.report_images;

create policy "Users can insert own report images"
  on public.report_images for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Users can view own report images"
  on public.report_images for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Users can update own report images"
  on public.report_images for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Users can delete own report images"
  on public.report_images for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ============================================================
-- Shared note/photo timeline column on reports
--
-- Ordered array of { kind: "note" | "photo", id, createdAt }.
-- - kind=note:  id is the 1-based index into reports.notes[].
-- - kind=photo: id is a report_images.id (string uuid).
-- The AI reads this order to place photos via surrounding notes.
-- ============================================================

alter table public.reports
  add column if not exists timeline jsonb not null default '[]'::jsonb;

-- ============================================================
-- Storage bucket for report images (private; accessed via
-- signed URLs from the client).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', false)
on conflict (id) do nothing;

-- Path convention: {project_id}/{report_id}/{image_id}[_thumb].jpg
-- Ownership is verified by joining to reports via report_id in path.

drop policy if exists "Users can upload to own report folders"   on storage.objects;
drop policy if exists "Users can read from own report folders"   on storage.objects;
drop policy if exists "Users can update in own report folders"   on storage.objects;
drop policy if exists "Users can delete from own report folders" on storage.objects;

create policy "Users can upload to own report folders"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-images'
    and exists (
      select 1 from public.reports r
      where r.id::text = split_part(name, '/', 2)
        and r.owner_id = (select auth.uid())
    )
  );

create policy "Users can read from own report folders"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-images'
    and exists (
      select 1 from public.reports r
      where r.id::text = split_part(name, '/', 2)
        and r.owner_id = (select auth.uid())
    )
  );

create policy "Users can update in own report folders"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-images'
    and exists (
      select 1 from public.reports r
      where r.id::text = split_part(name, '/', 2)
        and r.owner_id = (select auth.uid())
    )
  );

create policy "Users can delete from own report folders"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-images'
    and exists (
      select 1 from public.reports r
      where r.id::text = split_part(name, '/', 2)
        and r.owner_id = (select auth.uid())
    )
  );
