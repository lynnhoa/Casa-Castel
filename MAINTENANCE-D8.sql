-- ═══ Maintenance · D8: no double costs in Controlling + NK from Controlling (safe to run twice) ═══
-- Run this BEFORE you upload the D8 files.

-- 1 · A receipt can take over a line you typed by hand in Controlling (link_ot = that line),
--     or keep its own line next to it ("Book separately" is remembered: ctrl_dup_ok)
alter table public.maint_costs add column if not exists link_ot     text;
alter table public.maint_costs add column if not exists ctrl_dup_ok boolean not null default false;

-- 2 · A taken-over line remembers how you typed it → it comes back when the receipt is deleted
--     or not booked any more. NK fields are only made sure to exist (no change if they are there).
alter table public.ctrl_expense_one_time add column if not exists maint_before   jsonb;
alter table public.ctrl_expense_one_time add column if not exists nk_umlage      boolean not null default false;
alter table public.ctrl_expense_one_time add column if not exists nk_category_id bigint;

-- 3 · Remove a receipt's line: a line you typed comes back as it was, a line Maintenance made goes
create or replace function public.maint_unbook(cid uuid) returns void
language plpgsql set search_path = public as $$
begin
  update public.ctrl_expense_one_time o
     set (property_id, invoice_date, item, amount, company, kind, direction, source_ref) =
         (select x.property_id, x.invoice_date, x.item, x.amount, x.company, x.kind, x.direction, x.source_ref
            from jsonb_populate_record(null::public.ctrl_expense_one_time, o.maint_before) x),
         maint_cost_id = null,
         maint_before  = null
   where o.maint_cost_id = cid and o.maint_before is not null;
  delete from public.ctrl_expense_one_time where maint_cost_id = cid;
end $$;

-- 4 · One cost row → its Controlling line (texts in German for the tax export; your NK choice stays)
create or replace function public.maint_book_line(cid uuid) returns void
language plpgsql set search_path = public as $$
declare
  r public.maint_costs%rowtype;
  p public.maint_costs%rowtype;
  c public.maint_cases%rowtype;
  ok boolean;
  firm text;
  txt text;
begin
  select * into r from public.maint_costs where id = cid;
  if not found then return; end if;
  select * into c from public.maint_cases where id = r.case_id;
  if r.return_of is not null then
    select * into p from public.maint_costs where id = r.return_of;
  end if;
  ok := coalesce(c.book_ctrl, true)
        and coalesce(case when r.return_of is null then r.book_ctrl else p.book_ctrl end, true)
        and r.amount > 0
        and exists (select 1 from public.ctrl_properties cp where cp.id = c.property_id);
  if not ok then
    perform public.maint_unbook(r.id);
    return;
  end if;

  -- Link: the line you typed by hand becomes this receipt's line (no second line)
  if r.link_ot is not null and exists (select 1 from public.ctrl_expense_one_time o
                                        where o.id::text = r.link_ot and o.maint_cost_id is null) then
    perform public.maint_unbook(r.id);                       -- a line it had before goes (or comes back, if it was yours)
    update public.ctrl_expense_one_time o
       set maint_before  = jsonb_build_object('property_id', o.property_id, 'invoice_date', o.invoice_date, 'item', o.item,
                                              'amount', o.amount, 'company', o.company, 'kind', o.kind,
                                              'direction', o.direction, 'source_ref', o.source_ref),
           maint_cost_id = r.id
     where o.id::text = r.link_ot and o.maint_cost_id is null;
  end if;

  if r.return_of is null then                                        -- receipt / invoice: expense
    firm := r.brand;
    txt  := concat_ws(' · ', c.title,
              case when nullif(btrim(r.receipt_no), '') is not null
                   then (case when r.kind = 'provider' then 'Rechnung ' else 'Beleg ' end) || btrim(r.receipt_no) end,
              nullif(btrim(r.description), ''));
  else                                                               -- return: income, named after its receipt
    firm := p.brand;
    txt  := concat_ws(' · ', c.title,
              'Rückgabe zu ' || (case when p.kind = 'provider' then 'Rechnung' else 'Beleg' end)
                || coalesce(' ' || nullif(btrim(p.receipt_no), ''), '')
                || coalesce(' (Bon ' || nullif(btrim(r.receipt_no), '') || ')', ''),
              nullif(btrim(r.description), ''));
  end if;

  insert into public.ctrl_expense_one_time as o
    (property_id, invoice_date, item, amount, company, kind, direction, source_ref, nk_umlage, maint_cost_id)
  values
    (c.property_id, r.cost_date, left(txt, 200), r.amount, firm, 'Rechnung',
     case when r.return_of is null then -1 else 1 end, 'maint:' || r.id, false, r.id)
  on conflict (maint_cost_id) do update set
    property_id = excluded.property_id, invoice_date = excluded.invoice_date, item = excluded.item,
    amount = excluded.amount, company = excluded.company, kind = excluded.kind,
    direction = excluded.direction, source_ref = excluded.source_ref,
    -- the NK switch is yours (Controlling): kept, cleared only when the entry moves to another property
    nk_umlage      = case when o.property_id = excluded.property_id then o.nk_umlage else false end,
    nk_category_id = case when o.property_id = excluded.property_id then o.nk_category_id else null end;
end $$;

-- 5 · Deleting a receipt / return / entry: its line goes — a line you typed comes back as it was
create or replace function public.maint_costs_unbook() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.maint_unbook(old.id);
  return old;
end $$;
drop trigger if exists maint_costs_unbook on public.maint_costs;
create trigger maint_costs_unbook before delete on public.maint_costs
  for each row execute function public.maint_costs_unbook();

-- 6 · Book everything again once (German texts on the lines that are already there)
do $$
declare x uuid;
begin
  for x in select id from public.maint_costs order by (return_of is not null), cost_date loop
    perform public.maint_book_line(x);
  end loop;
end $$;

-- Check: receipts that may already be typed by hand in Controlling (same property, same amount, ±7 days).
-- No rows = nothing to link. Rows = open that receipt in Maintenance and tap Save → "Link to it".
select c.title as entry, coalesce(nullif(c.property_name, ''), cp.name) as property,
       r.receipt_no, r.amount, r.cost_date, o.item as controlling_line, o.invoice_date as controlling_date
from public.maint_costs r
join public.maint_cases c on c.id = r.case_id
left join public.ctrl_properties cp on cp.id = c.property_id
join public.ctrl_expense_one_time o
  on o.property_id = c.property_id and o.maint_cost_id is null
 and coalesce(o.source_ref, '') !~ '^(maint|abr):'
 and coalesce(o.kind, 'Rechnung') not in ('Versorger', 'Kaufnebenkosten', 'Hausgeldabrechnung', 'NK-Abrechnung')
 and abs(o.amount - r.amount) < 0.005
 and abs(o.invoice_date - r.cost_date) <= 7
 and (case when r.return_of is null then coalesce(o.direction, -1) <> 1 else o.direction = 1 end)
where r.link_ot is null and not r.ctrl_dup_ok
order by r.cost_date;
