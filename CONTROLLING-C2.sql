-- ═══ Controlling · package 3: one booking per Abrechnung (run BEFORE you upload the package 3 files · safe to run twice) ═══
-- An NK-Abrechnung or Hausgeldabrechnung result is paid by ONE line in Controlling (kind NK-Abrechnung /
-- Hausgeldabrechnung, linked to its result by source_ref 'abr:<id>', or 'nk:<id>' / 'rnt_nk:<id>' for the old
-- tenant-tab entries). A double tap on its Soll wrote two lines: Income / Expenses showed one, the Dashboard and the
-- year export counted both. This file makes the database refuse a second line for the same result.
-- It only reads and adds a rule: nothing is changed or deleted.
-- The result at the bottom says either
--   OK · ...                     → done
--   NOT YET · booked twice · ... → one row per result that has two lines. Upload the package 3 files, open Controlling ›
--                                  Income or Expenses in the month paid: that row says "booked twice · delete one".
--                                  Delete one there, then run this file again.

-- 1 · The rule (only when nothing is booked twice yet — otherwise the database could not create it)
do $$
begin
  if not exists (
    select 1 from public.ctrl_expense_one_time
     where source_ref is not null and kind in ('NK-Abrechnung', 'Hausgeldabrechnung')
     group by source_ref having count(*) > 1
  ) then
    create unique index if not exists ctrl_ot_abr_once on public.ctrl_expense_one_time (source_ref)
      where source_ref is not null and kind in ('NK-Abrechnung', 'Hausgeldabrechnung');
  end if;
end $$;

-- 2 · Result (read-only)
with twice as (
  select o.source_ref, count(*) as lines,
         string_agg(to_char(o.invoice_date::date, 'DD.MM.YYYY') || ' · ' || translate(to_char(o.amount::numeric, 'FM999,999,990.00'), ',.', '.,') || ' € · '
                    || coalesce(p.name, 'property ' || o.property_id) || ' · ' || coalesce(o.item, '') || ' (id ' || o.id || ')',
                    '  |  ' order by o.id) as booked
    from public.ctrl_expense_one_time o
    left join public.ctrl_properties p on p.id = o.property_id
   where o.source_ref is not null and o.kind in ('NK-Abrechnung', 'Hausgeldabrechnung')
   group by o.source_ref having count(*) > 1
)
select 'NOT YET · booked twice · delete one in Controlling, then run again' as result, t.source_ref, t.lines, t.booked from twice t
union all
select 'OK · each NK / Hausgeld Abrechnung can be booked only once', null, null, null
 where not exists (select 1 from twice)
   and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ctrl_ot_abr_once')
order by 2 nulls first;
