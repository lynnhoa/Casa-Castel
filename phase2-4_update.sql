-- Same SQL as in the chat (26.09.2026) — skip if already run. Safe to run twice.
create table if not exists rent_periods (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('casa','rentals')),
  tenant_id text not null, valid_from date not null,
  kind text not null default 'manual',
  mode text not null default 'kalt_nk' check (mode in ('pauschal','kalt_nk')),
  pauschale numeric, kaltmiete numeric, nebenkosten numeric,
  first_month text check (first_month in ('anteilig','voll')),
  last_month text check (last_month in ('anteilig','voll')),
  contract_type text, contract_end date, source text, note text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists rent_periods_tenant_idx on rent_periods (app, tenant_id, valid_from);
alter table rent_periods enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'rent_periods' and policyname = 'anon_all') then
    create policy anon_all on rent_periods for all using (true) with check (true);
  end if;
end $$;
grant all on rent_periods to anon, authenticated;
alter table rnt_staffelmiete_history     add column if not exists tenant_id text;
alter table rnt_nk_vorauszahlung_history add column if not exists tenant_id text;
alter table nk_vorauszahlung_history     add column if not exists tenant_id text;
alter table ctrl_income_months           add column if not exists split jsonb;
