-- ═══ Maintenance · D3: costs → Controlling One-off (safe to run twice) ═══

-- 1 · Switches: book this entry / this receipt in Controlling (default: yes)
alter table public.maint_cases add column if not exists book_ctrl boolean not null default true;
alter table public.maint_costs add column if not exists book_ctrl boolean not null default true;

-- 2 · The link: its own field in Controlling (Controlling + Settlements never change it).
--     Deleting a receipt / return / entry in Maintenance removes its line by itself.
alter table public.ctrl_expense_one_time
  add column if not exists maint_cost_id uuid references public.maint_costs(id) on delete cascade;
create unique index if not exists ctrl_ot_maint_cost on public.ctrl_expense_one_time (maint_cost_id);

-- 3 · One cost row → its Controlling line (created, updated or removed)
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
  if not found then return; end if;                                  -- gone: the link removes its line
  select * into c from public.maint_cases where id = r.case_id;
  if r.return_of is not null then
    select * into p from public.maint_costs where id = r.return_of;
  end if;
  ok := coalesce(c.book_ctrl, true)
        and coalesce(case when r.return_of is null then r.book_ctrl else p.book_ctrl end, true)
        and r.amount > 0
        and exists (select 1 from public.ctrl_properties cp where cp.id = c.property_id);
  if not ok then
    delete from public.ctrl_expense_one_time where maint_cost_id = r.id;
    return;
  end if;
  if r.return_of is null then                                        -- receipt: expense
    firm := r.brand;
    txt  := concat_ws(' · ', c.title, case when r.kind = 'provider' then 'Invoice ' else 'Receipt ' end || r.receipt_no, r.description);
  else                                                               -- return: income, named after its receipt
    firm := p.brand;
    txt  := concat_ws(' · ', c.title,
              'Return for ' || coalesce(case when p.kind = 'provider' then 'Invoice ' else 'Receipt ' end || p.receipt_no, 'receipt')
              || coalesce(' (Slip ' || r.receipt_no || ')', ''));
  end if;
  insert into public.ctrl_expense_one_time
    (property_id, invoice_date, item, amount, company, kind, direction, source_ref, nk_umlage, maint_cost_id)
  values
    (c.property_id, r.cost_date, left(txt, 200), r.amount, firm, 'Rechnung',
     case when r.return_of is null then -1 else 1 end, 'maint:' || r.id, false, r.id)
  on conflict (maint_cost_id) do update set
    property_id = excluded.property_id, invoice_date = excluded.invoice_date, item = excluded.item,
    amount = excluded.amount, company = excluded.company, kind = excluded.kind,
    direction = excluded.direction, source_ref = excluded.source_ref, nk_umlage = false;
end $$;

-- 4 · Saving a receipt / return books it (a receipt also refreshes its returns)
create or replace function public.maint_costs_book() returns trigger
language plpgsql set search_path = public as $$
declare x uuid;
begin
  perform public.maint_book_line(new.id);
  if new.return_of is null then
    for x in select id from public.maint_costs where return_of = new.id loop
      perform public.maint_book_line(x);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists maint_costs_book on public.maint_costs;
create trigger maint_costs_book after insert or update on public.maint_costs
  for each row execute function public.maint_costs_book();

-- 5 · Changing an entry's property, title or switch updates all its lines
create or replace function public.maint_cases_book() returns trigger
language plpgsql set search_path = public as $$
declare x uuid;
begin
  for x in select id from public.maint_costs where case_id = new.id order by (return_of is not null) loop
    perform public.maint_book_line(x);
  end loop;
  return null;
end $$;
drop trigger if exists maint_cases_book on public.maint_cases;
create trigger maint_cases_book after update of property_id, title, book_ctrl on public.maint_cases
  for each row execute function public.maint_cases_book();

-- 6 · Book what is already in Maintenance (receipts first, then returns)
do $$
declare x uuid;
begin
  for x in select id from public.maint_costs order by (return_of is not null), cost_date loop
    perform public.maint_book_line(x);
  end loop;
end $$;

-- Check: receipts + returns in Maintenance · lines in Controlling from Maintenance
select 'receipts + returns' as t, count(*) from public.maint_costs
union all select 'Controlling lines from Maintenance', count(*) from public.ctrl_expense_one_time where maint_cost_id is not null;
