-- ═══ Phase 6 · manual NK-Abrechnung (drafts) + Phase 7 · security (safe to run twice) ═══

-- Phase 6 · drafts of manual NK-Abrechnungen (Settlements › Dashboard › NK-Abrechnung erstellen)
create table if not exists public.nk_abrechnung_manual (
  id          uuid primary key default gen_random_uuid(),
  property_id bigint,
  unit_label  text,
  title_name  text,
  tenant_ref  text,
  tenant_name text,
  address     text,
  iban        text,
  former      boolean not null default false,
  period_from date,
  period_to   date,
  use_from    date,
  use_to      date,
  lines       jsonb not null default '[]'::jsonb,
  vz          jsonb not null default '[]'::jsonb,
  settle_via  text  not null default 'zahlung',
  due_days    int   not null default 30,
  letter_date date,
  book        boolean not null default false,
  status      text  not null default 'draft' check (status in ('draft','sent')),
  sent_at     timestamptz,
  letter_id   uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.nk_abrechnung_manual enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nk_abrechnung_manual' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.nk_abrechnung_manual for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on public.nk_abrechnung_manual to authenticated;

-- Phase 7 · Rentals NK table: only logged-in users (was open to everyone with the app key)
alter table public.nk_abrechnung_rentals enable row level security;
drop policy if exists anon_all on public.nk_abrechnung_rentals;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nk_abrechnung_rentals' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.nk_abrechnung_rentals for all to authenticated using (true) with check (true);
  end if;
end $$;
revoke all on public.nk_abrechnung_rentals from anon;
grant all on public.nk_abrechnung_rentals to authenticated;

-- Check: every NK table, who may use it
select tablename, policyname, roles
from pg_policies
where tablename in ('nk_abrechnung_rentals', 'nk_abrechnung_casa', 'nk_abrechnung_manual', 'nk_letters')
order by tablename;
