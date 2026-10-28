-- ═══ Properties · Kaufnebenkosten (run BEFORE you upload the files · safe to run twice) ═══
-- One row per cost of a purchase: Grunderwerbsteuer · Notar · Grundbuch · Makler · Sonstiges.
-- "Paid" books it into Controlling › One-off (ot_id = that booking); files go into the existing
-- private storage folder (maintenance-docs/kaufnebenkosten/…), so no new storage setup.
create table if not exists public.prop_knk (
  id          uuid primary key default gen_random_uuid(),
  property_id bigint not null,                    -- properties.id (Properties app)
  art         text not null default 'Sonstiges'
              check (art in ('Grunderwerbsteuer','Notar','Grundbuch','Makler','Sonstiges')),
  part        text check (part in ('Kauf','Grundschuld')),   -- Notar / Grundbuch only
  company     text,
  note        text,
  pct         numeric,                            -- % of the price (Grunderwerbsteuer, Makler)
  expected    numeric,
  inv_date    date,
  inv_amount  numeric,
  paid_on     date,
  paid_amount numeric,
  not_needed  boolean not null default false,
  ot_id       text,                               -- the booking in Controlling › One-off
  file_path   text,
  file_name   text,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists prop_knk_property on public.prop_knk (property_id);

-- Only your login (same as the other management apps)
alter table public.prop_knk enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'prop_knk' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.prop_knk for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on public.prop_knk to authenticated;

notify pgrst, 'reload schema';

-- Check: 0 rows here · your Kaufnebenkosten in Controlling (they show up in Properties by themselves)
select (select count(*) from public.prop_knk) as rows_here,
       (select count(*) from public.ctrl_expense_one_time where kind = 'Kaufnebenkosten') as in_controlling;
