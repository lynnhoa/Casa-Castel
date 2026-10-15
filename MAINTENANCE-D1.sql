-- ═══ Maintenance · D1: Costs table (safe to run twice) ═══

-- 1 · Properties now come from Controlling's list → existing entries follow by name
update public.maint_cases c set property_id = p.id
from public.ctrl_properties p
where lower(trim(p.name)) = lower(trim(c.property_name))
  and c.property_id is distinct from p.id;

-- 2 · One row per receipt / invoice (a return points to its receipt — used from D2)
create table if not exists public.maint_costs (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.maint_cases(id) on delete cascade,
  kind        text not null default 'self' check (kind in ('self','provider')),   -- Self-bought / Provider
  receipt_no  text,
  description text,
  brand       text,                                    -- Brand (self-bought) or Provider
  amount      numeric(12,2) not null default 0 check (amount >= 0),
  cost_date   date not null default current_date,
  return_of   uuid references public.maint_costs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists maint_costs_case on public.maint_costs (case_id);
create index if not exists maint_costs_receipt on public.maint_costs (lower(receipt_no));
drop trigger if exists maint_costs_touch on public.maint_costs;
create trigger maint_costs_touch before update on public.maint_costs
  for each row execute function public.maint_touch();

alter table public.maint_costs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'maint_costs' and policyname = 'logged_in_all') then
    create policy logged_in_all on public.maint_costs for all to authenticated using (true) with check (true);
  end if;
end $$;
grant all on public.maint_costs to authenticated;

-- 3 · Photos / PDFs of a receipt: documents get a link to their cost row
alter table public.maint_docs add column if not exists cost_id uuid references public.maint_costs(id) on delete cascade;
create index if not exists maint_docs_cost on public.maint_docs (cost_id);
alter table public.maint_docs drop constraint if exists maint_docs_doc_type_check;
alter table public.maint_docs add constraint maint_docs_doc_type_check
  check (doc_type in ('photo','rechnung','angebot','schadenbericht','other','receipt'));

-- Check: 0 · your number of properties in Controlling · 0
select 'maint_costs' as t, count(*) from public.maint_costs
union all select 'properties (Controlling list)', count(*) from public.ctrl_properties
union all select 'entries without a Controlling property', count(*) from public.maint_cases c
  where not exists (select 1 from public.ctrl_properties p where p.id = c.property_id);
