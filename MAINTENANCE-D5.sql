-- ═══ Maintenance · D5: Schadensbericht (safe to run twice) ═══

-- 1 · Report fields of a Schaden (+ the report number and the last choices in the form)
alter table public.maint_cases
  add column if not exists schadensart       text,
  add column if not exists festgestellt_am   date,
  add column if not exists ursache           text,
  add column if not exists verursacher       text,
  add column if not exists massnahmen        text,
  add column if not exists schadennummer     text,
  add column if not exists mieter_informiert date,
  add column if not exists eigentum          text,
  add column if not exists polizei_az        text,
  add column if not exists report_no         text,
  add column if not exists report_room       text,
  add column if not exists report_mieter     text,
  add column if not exists report_mieter_sig boolean not null default false;

-- 2 · Photos: Beschreibung, when it was taken, in the report yes/no · reports made by the app
alter table public.maint_docs
  add column if not exists caption   text,
  add column if not exists taken_at  timestamptz,
  add column if not exists in_report boolean not null default true,
  add column if not exists generated boolean not null default false;

-- 3 · Versicherung once per property (used by every Schaden of that property)
create table if not exists public.maint_props (
  property_id     bigint primary key,
  versicherer     text,
  versicherungsnr text,
  updated_at      timestamptz not null default now()
);
alter table public.maint_props enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'maint_props' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.maint_props for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Check
select 'Schäden' as t, count(*) from public.maint_cases where kind = 'schaden'
union all select 'photos', count(*) from public.maint_docs where doc_type = 'photo';
