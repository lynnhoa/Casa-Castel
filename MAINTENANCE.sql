-- ═══ Maintenance · Renovierungen + Schäden (safe to run twice) ═══

-- 1 · One row per case (a Renovierung or a Schaden)
create table if not exists public.maint_cases (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('renovierung','schaden')),
  property_id   bigint,                         -- properties.id (Properties app)
  property_name text not null default '',       -- kept if the property is removed later
  area          text,
  title         text not null,
  case_date     date,
  status        text not null default 'open' check (status in ('open','in_progress','done')),
  paid_by       text check (paid_by in ('me','versicherung','mieter','weg')),   -- Schäden only
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists maint_cases_kind on public.maint_cases (kind, property_id);

-- 2 · The files of a case (photos, Rechnungen, Angebote, Schadenbericht, other)
create table if not exists public.maint_docs (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.maint_cases(id) on delete cascade,
  doc_type   text not null check (doc_type in ('photo','rechnung','angebot','schadenbericht','other')),
  file_path  text not null,
  file_name  text,
  amount     numeric(12,2),                     -- Betrag (Rechnung only)
  doc_date   date,                              -- Rechnungsdatum / document date
  created_at timestamptz not null default now()
);
create index if not exists maint_docs_case on public.maint_docs (case_id);

-- 3 · updated_at stays correct by itself
create or replace function public.maint_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists maint_cases_touch on public.maint_cases;
create trigger maint_cases_touch before update on public.maint_cases
  for each row execute function public.maint_touch();

-- 4 · Only your login (same as the other management apps)
alter table public.maint_cases enable row level security;
alter table public.maint_docs  enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'maint_cases' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.maint_cases for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'maint_docs' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.maint_docs for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on public.maint_cases, public.maint_docs to authenticated;

-- 5 · Private storage folder for photos and PDFs (one folder per case)
insert into storage.buckets (id, name, public)
values ('maintenance-docs', 'maintenance-docs', false)
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'maint_files_read') then
    create policy maint_files_read on storage.objects for select to authenticated using (bucket_id = 'maintenance-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'maint_files_write') then
    create policy maint_files_write on storage.objects for insert to authenticated with check (bucket_id = 'maintenance-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'maint_files_delete') then
    create policy maint_files_delete on storage.objects for delete to authenticated using (bucket_id = 'maintenance-docs');
  end if;
end $$;

-- Check: 0 · 0 · 1 · your number of properties
select 'maint_cases' as t, count(*) from public.maint_cases
union all select 'maint_docs', count(*) from public.maint_docs
union all select 'bucket maintenance-docs', count(*) from storage.buckets where id = 'maintenance-docs'
union all select 'properties (list in the app)', count(*) from public.properties;
