-- ═══ Controlling · C3 (package 4: Dashboard, export and properties) · run BEFORE you upload the package 4 files · safe to run twice ═══
-- Part 0 only reads. Part 1 adds ONE setting per property (first_month, default 'full' = exactly as today).
-- Nothing else is changed or deleted. Without this file Controlling works as before and shows no "First month" switch.

-- 0a · Is the setting there already? (0 rows = not yet)
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ctrl_properties' and column_name = 'first_month';

-- 0b · Properties bought after the 1st of a month (Properties › Purchase date). Only these get the switch
--      "First month: Full month · From handover day" in Setup. 0 rows = no switch anywhere.
select cp.id, cp.name, pr.kaufdatum as purchase_date
  from public.ctrl_properties cp
  join public.properties pr
    on pr.id::text = cp.loan_ref::text
    or (cp.loan_ref is null and regexp_replace(lower(pr.name), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(cp.name), '[^a-z0-9äöüß]', '', 'g'))
 where cp.active and cp.id <> 7
   and coalesce(pr.kaufdatum::text, '') !~ '^\s*(—|-)?\s*$'
   and coalesce(pr.kaufdatum::text, '') !~ '^(0?1\.|\d{4}-\d{2}-01)'
 order by cp.id;

-- 0c · Properties (not Casa Castel) without a living unit → their rent is missing in Controlling.
--      0 rows = nothing to do. Each row: Controlling › Setup › that property › "+ Apartment"
--      (no Rentals apartment chosen there yet: choose it first — its unit is added with it).
select p.id, p.name, p.rentals_apartment_ref, a.name as rentals_apartment, a.wohnungsnummer,
       (select count(*) from public.ctrl_units u where u.property_id = p.id) as units_now
  from public.ctrl_properties p
  left join public.rentals_apartments a on a.id::text = p.rentals_apartment_ref::text
 where p.active and p.id <> 7
   and not exists (select 1 from public.ctrl_units u
                    where u.property_id = p.id
                      and (coalesce(u.unit_type, '') || ' ' || coalesce(u.name, '')) !~* '(garage|stellplatz|\mtg\M)')
 order by p.id;

-- 0d · Switched-off (sold) properties with bookings, per year. After package 4 exactly these come back on the
--      Dashboard and in the year export of these years (only in the months first_month … last_month).
--      0 rows = package 4 changes no past figure.
with off as (
  select id, name from public.ctrl_properties where active is not true
), b as (
  select u.property_id as pid, i.year, i.month, 'rent' as what,
         coalesce(i.kaltmiete, 0) + coalesce(i.nebenkosten, 0) as rent_in, 0 as costs_out, 0 as one_off
    from public.ctrl_income_months i
    join public.ctrl_units u on u.id = i.unit_id
  union all
  select e.property_id, e.year, e.month, 'costs', 0,
         coalesce(e.hausgeld, 0) + coalesce(e.grundsteuer, 0) + coalesce(e.strom, 0) + coalesce(e.rate, 0), 0
    from public.ctrl_expense_apartments e
   where coalesce(e.hausgeld, e.grundsteuer, e.strom, e.rate, e.zinsen, e.tilgung) is not null
  union all
  select o.property_id, extract(year from o.invoice_date)::int, extract(month from o.invoice_date)::int,
         'one-off ' || coalesce(o.kind, '?'), 0, 0,
         case when o.direction = 1 then 1 else -1 end * coalesce(o.amount, 0)
    from public.ctrl_expense_one_time o
   where o.kind is distinct from 'Kaufnebenkosten' and o.invoice_date is not null
)
select off.id as property_id, off.name, b.year,
       min(b.month) as first_month, max(b.month) as last_month,
       string_agg(distinct b.what, ', ') as booked,
       round(sum(b.rent_in)::numeric, 2)   as rent_in,
       round(sum(b.costs_out)::numeric, 2) as costs_out,
       round(sum(b.one_off)::numeric, 2)   as one_offs_and_abrechnungen
  from off
  join b on b.pid = off.id
 group by off.id, off.name, b.year
 order by off.id, b.year;

-- 1 · The setting: full = the whole purchase month (default, as before) · handover = from the purchase day on
alter table public.ctrl_properties add column if not exists first_month text not null default 'full';
alter table public.ctrl_properties drop constraint if exists ctrl_properties_first_month_check;
alter table public.ctrl_properties add constraint ctrl_properties_first_month_check check (first_month in ('full', 'handover'));

-- 2 · Supabase sees the new column right away
notify pgrst, 'reload schema';

-- 3 · Result (one row): col = 1 · full_month = all properties · from_handover = 0 until you switch one in Setup
select (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'ctrl_properties' and column_name = 'first_month') as col,
       (select count(*) from public.ctrl_properties where first_month = 'full')     as full_month,
       (select count(*) from public.ctrl_properties where first_month = 'handover') as from_handover;
