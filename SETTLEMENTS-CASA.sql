-- ═══ Settlements › Casa Castel · NK-Abrechnung + letter archive (safe to run twice) ═══

-- 1 · One row per year: lock snapshot + letter settings per tenant
create table if not exists public.nk_abrechnung_casa (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null unique,
  period_from date not null,
  period_to   date not null,
  locked_at   timestamptz,
  snapshot    jsonb,
  tenants     jsonb not null default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.nk_abrechnung_casa enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nk_abrechnung_casa' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.nk_abrechnung_casa for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on public.nk_abrechnung_casa to authenticated;

-- 2 · Letter archive (Casa Castel now · Rentals and manual letters later)
create table if not exists public.nk_letters (
  id          uuid primary key default gen_random_uuid(),
  app         text not null check (app in ('casa','rentals','manual')),
  property_id bigint,
  year        int  not null,
  period_from date,
  period_to   date,
  tenant_id   text,
  tenant_name text,
  unit_label  text,
  address     text,
  direction   smallint,
  amount      numeric(12,2),
  file_path   text not null,
  file_name   text,
  source      text default 'app',
  sent_at     timestamptz not null default now(),
  created_at  timestamptz default now()
);
create index if not exists nk_letters_app_year on public.nk_letters (app, year);
alter table public.nk_letters enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nk_letters' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.nk_letters for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on public.nk_letters to authenticated;

-- 3 · Private storage folder for the PDFs (only logged-in users)
insert into storage.buckets (id, name, public)
values ('nk-letters', 'nk-letters', false)
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'nk_letters_read') then
    create policy nk_letters_read on storage.objects for select to authenticated using (bucket_id = 'nk-letters');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'nk_letters_write') then
    create policy nk_letters_write on storage.objects for insert to authenticated with check (bucket_id = 'nk-letters');
  end if;
end $$;

-- Check
select 'nk_abrechnung_casa' as t, count(*) from public.nk_abrechnung_casa
union all select 'nk_letters', count(*) from public.nk_letters
union all select 'bucket nk-letters', count(*) from storage.buckets where id = 'nk-letters';
