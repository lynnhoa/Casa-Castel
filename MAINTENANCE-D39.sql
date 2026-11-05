-- ═══ Maintenance · D39: "Who pays?" per receipt · NK, Kleinreparatur, Schaden (run BEFORE you upload the D39 files · safe to run twice) ═══
-- Casa Castel: Maintenance now decides which receipts go into the NK-Abrechnung (Controlling shows it read-only).
-- A tenant who pays a receipt to you directly gets its own income line in Controlling ("Erstattung Mieter").
-- Other properties: nothing changes, except that your NK switch from Controlling now survives "not booked".
-- Do not run MAINTENANCE-D3.sql or MAINTENANCE-D8.sql again after this file (they bring back the old booking).
-- If you did, simply run this file again.

-- 1 · Who pays a receipt (Casa Castel receipts only · empty = you pay). Returns follow their receipt.
--     pay_type     nk = in the NK-Abrechnung (Teil A) · klein = Kleinreparatur · schaden = Schaden (both Teil B)
--     pay_cat      NK only: the NK cost type (empty = Allgemeine Hauskosten)
--     pay_where    Kleinreparatur / Schaden: gemein = Gemeinschaftsfläche · zimmer = one Zimmer
--     pay_rooms    Kleinreparatur / Schaden: the Zimmer (room names) that pay
--     pay_via      Kleinreparatur / Schaden: nk = with the NK-Abrechnung (empty means the same) · direct = paid to you
--     pay_paid_on  direct: the day the tenant paid you (empty = still open)
alter table public.maint_costs add column if not exists pay_type    text;
alter table public.maint_costs add column if not exists pay_cat     bigint;
alter table public.maint_costs add column if not exists pay_where   text;
alter table public.maint_costs add column if not exists pay_rooms   text[];
alter table public.maint_costs add column if not exists pay_via     text;
alter table public.maint_costs add column if not exists pay_paid_on date;
alter table public.maint_costs drop constraint if exists maint_costs_pay_type_check;
alter table public.maint_costs add constraint maint_costs_pay_type_check check (pay_type in ('nk','klein','schaden'));
alter table public.maint_costs drop constraint if exists maint_costs_pay_where_check;
alter table public.maint_costs add constraint maint_costs_pay_where_check check (pay_where in ('gemein','zimmer'));
alter table public.maint_costs drop constraint if exists maint_costs_pay_via_check;
alter table public.maint_costs add constraint maint_costs_pay_via_check check (pay_via in ('nk','direct'));
--     nk_keep: other properties only · your NK switch from Controlling, kept while the receipt is not booked
--     (book switch off, amount 0 …) so it comes back with the line. Used only by the booking below.
alter table public.maint_costs add column if not exists nk_keep jsonb;

-- 2 · Controlling: the "tenant paid me" income line of a receipt (one per receipt, goes when the receipt goes),
--     and a short "who pays" note on the lines Maintenance makes (shown in Controlling and Settlements).
alter table public.ctrl_expense_one_time
  add column if not exists maint_refund_of uuid references public.maint_costs(id) on delete cascade;
create unique index if not exists ctrl_ot_maint_refund on public.ctrl_expense_one_time (maint_refund_of);
alter table public.ctrl_expense_one_time add column if not exists maint_pay jsonb;
--     The fields from D8 are only made sure to exist (no change if they are there).
alter table public.ctrl_expense_one_time add column if not exists maint_before   jsonb;
alter table public.ctrl_expense_one_time add column if not exists nk_umlage      boolean not null default false;
alter table public.ctrl_expense_one_time add column if not exists nk_category_id bigint;
alter table public.maint_costs           add column if not exists link_ot        text;
alter table public.maint_costs           add column if not exists ctrl_dup_ok    boolean not null default false;

-- 3 · Before Maintenance takes over: the NK switches you set in Controlling on Casa Castel receipts
--     become "Who pays › NK" with the same cost type (their returns follow them from now on).
--     A line you typed by hand and linked to a receipt also remembers its NK switch, so it comes back
--     exactly as you typed it when the receipt is deleted or not booked any more.
update public.maint_costs m
   set pay_type = 'nk', pay_cat = o.nk_category_id
  from public.ctrl_expense_one_time o, public.maint_cases c
 where o.maint_cost_id = m.id and c.id = m.case_id
   and c.property_id = 7 and o.property_id = 7
   and m.return_of is null and m.pay_type is null and o.nk_umlage;
update public.ctrl_expense_one_time
   set maint_before = maint_before || jsonb_build_object('nk_umlage', nk_umlage, 'nk_category_id', nk_category_id)
 where maint_before is not null and (maint_before -> 'nk_umlage') is null;

-- 4 · Remove a receipt's line: a line you typed comes back as it was, a line Maintenance made goes,
--     and so does its "Erstattung Mieter" line. Runs on delete too, so it never changes the receipt itself.
create or replace function public.maint_unbook(cid uuid) returns void
language plpgsql set search_path = public as $$
begin
  update public.ctrl_expense_one_time o
     set (property_id, invoice_date, item, amount, company, kind, direction, source_ref) =
         (select x.property_id, x.invoice_date, x.item, x.amount, x.company, x.kind, x.direction, x.source_ref
            from jsonb_populate_record(null::public.ctrl_expense_one_time, o.maint_before) x),
         -- the NK switch you typed comes back too where Maintenance had set it (Casa Castel = property 7);
         -- on other properties the switch stayed yours all along, so it is left as it is
         nk_umlage      = case when (o.maint_before -> 'nk_umlage') is not null
                                and (o.property_id = 7 or (o.maint_before->>'property_id')::bigint = 7)
                               then coalesce((o.maint_before->>'nk_umlage')::boolean, false)
                               else o.nk_umlage end,
         nk_category_id = case when (o.maint_before -> 'nk_umlage') is not null
                                and (o.property_id = 7 or (o.maint_before->>'property_id')::bigint = 7)
                               then (o.maint_before->>'nk_category_id')::bigint
                               else o.nk_category_id end,
         maint_pay     = null,
         maint_cost_id = null,
         maint_before  = null
   where o.maint_cost_id = cid and o.maint_before is not null;
  delete from public.ctrl_expense_one_time where maint_cost_id = cid;
  delete from public.ctrl_expense_one_time where maint_refund_of = cid;
end $$;

-- 5 · One cost row → its Controlling line (German texts for the tax export).
--     Casa Castel: the NK switch follows "Who pays" (receipt and its returns), the receipt line gets the
--     who-pays note, and a receipt the tenant paid you directly gets its "Erstattung Mieter" income line
--     (amount = receipt minus its returns). Other properties: your NK switch from Controlling stays.
create or replace function public.maint_book_line(cid uuid) returns void
language plpgsql set search_path = public as $$
declare
  r public.maint_costs%rowtype;            -- this receipt / return
  p public.maint_costs%rowtype;            -- a return's receipt
  h public.maint_costs%rowtype;            -- the receipt that says who pays (r itself, or p)
  c public.maint_cases%rowtype;
  ok boolean;
  casa boolean;
  firm text;
  txt text;
  net numeric(12,2);                       -- receipt minus its returns, never below 0
  via text;
  pay jsonb;                               -- the who-pays note (maint_pay)
  nk_u boolean;
  nk_c bigint;
  who text;                                -- the paying Zimmer, as text
begin
  select * into r from public.maint_costs where id = cid;
  if not found then return; end if;                          -- gone (deleted with its receipt or entry): nothing to do
  select * into c from public.maint_cases where id = r.case_id;
  if r.return_of is not null then
    select * into p from public.maint_costs where id = r.return_of;
    if not found then perform public.maint_unbook(r.id); return; end if;
    h := p;
  else
    h := r;
  end if;
  casa := coalesce(c.property_id = 7, false);
  ok := coalesce(c.book_ctrl, true)
        and coalesce(case when r.return_of is null then r.book_ctrl else p.book_ctrl end, true)
        and r.amount > 0
        and exists (select 1 from public.ctrl_properties cp where cp.id = c.property_id);
  if not ok then
    -- other properties: your NK switch is remembered while the line is gone, and comes back with it.
    -- Only here, never on delete (a row that is being deleted must not be changed); the "is distinct from"
    -- makes the second run of this (through the save trigger) change nothing.
    update public.maint_costs m
       set nk_keep = jsonb_build_object('p', o.property_id, 'u', o.nk_umlage, 'c', o.nk_category_id)
      from public.ctrl_expense_one_time o
     where m.id = r.id and o.maint_cost_id = r.id and o.maint_before is null
       and o.property_id is distinct from 7 and (o.nk_umlage or o.nk_category_id is not null)
       and m.nk_keep is distinct from jsonb_build_object('p', o.property_id, 'u', o.nk_umlage, 'c', o.nk_category_id);
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
                                              'direction', o.direction, 'source_ref', o.source_ref,
                                              'nk_umlage', o.nk_umlage, 'nk_category_id', o.nk_category_id),
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

  -- Casa Castel receipt: its net amount and the who-pays note
  --   {"t": type, "c": NK cost type, "w": gemein|zimmer, "r": [Zimmer], "v": nk|direct, "p": paid on, "n": net}
  if casa and r.return_of is null then
    select greatest(r.amount - coalesce(sum(x.amount), 0), 0) into net
      from public.maint_costs x where x.return_of = r.id;
    if r.pay_type is not null then
      via := case when r.pay_type = 'nk' then 'nk' else coalesce(r.pay_via, 'nk') end;
      pay := jsonb_build_object(
               't', r.pay_type,
               'c', case when r.pay_type = 'nk' then r.pay_cat end,
               'w', case when r.pay_type <> 'nk' then r.pay_where end,
               'r', to_jsonb(case when r.pay_type <> 'nk' then coalesce(r.pay_rooms, '{}'::text[]) else '{}'::text[] end),
               'v', via,
               'p', case when via = 'direct' then to_char(r.pay_paid_on, 'YYYY-MM-DD') end,
               'n', net);
    end if;
  end if;

  -- The NK switch: Casa Castel follows "Who pays" (Kleinreparatur / Schaden never go into Teil A);
  -- other properties: a new line gets the switch it had before it was unbooked (same property only)
  if casa then
    nk_u := coalesce(h.pay_type = 'nk', false);
    nk_c := case when h.pay_type = 'nk' then h.pay_cat end;
  elsif (r.nk_keep->>'p')::bigint = c.property_id then
    nk_u := coalesce((r.nk_keep->>'u')::boolean, false);
    nk_c := (r.nk_keep->>'c')::bigint;
  else
    nk_u := false;
    nk_c := null;
  end if;

  insert into public.ctrl_expense_one_time as o
    (property_id, invoice_date, item, amount, company, kind, direction, source_ref, nk_umlage, nk_category_id, maint_pay, maint_cost_id)
  values
    (c.property_id, r.cost_date, left(txt, 200), r.amount, firm, 'Rechnung',
     case when r.return_of is null then -1 else 1 end, 'maint:' || r.id, nk_u, nk_c, pay, r.id)
  on conflict (maint_cost_id) do update set
    property_id = excluded.property_id, invoice_date = excluded.invoice_date, item = excluded.item,
    amount = excluded.amount, company = excluded.company, kind = excluded.kind,
    direction = excluded.direction, source_ref = excluded.source_ref, maint_pay = excluded.maint_pay,
    -- Casa Castel (7): always from "Who pays". Other properties: the NK switch is yours (Controlling),
    -- kept, cleared only when the entry moves to another property
    nk_umlage      = case when excluded.property_id = 7 then excluded.nk_umlage
                          when o.property_id = excluded.property_id then o.nk_umlage else false end,
    nk_category_id = case when excluded.property_id = 7 then excluded.nk_category_id
                          when o.property_id = excluded.property_id then o.nk_category_id end;

  -- Casa Castel receipt a tenant paid you directly (Kleinreparatur / Schaden · Direct · paid on):
  -- one income line on the day it was paid, amount = net. Anything else: that line goes.
  if r.return_of is null then
    if casa and r.pay_type in ('klein', 'schaden') and via = 'direct' and r.pay_paid_on is not null and net > 0 then
      who := nullif(array_to_string(r.pay_rooms, ', '), '');
      insert into public.ctrl_expense_one_time as o
        (property_id, invoice_date, item, amount, company, kind, direction, source_ref, nk_umlage, nk_category_id, maint_pay, maint_refund_of)
      values
        (c.property_id, r.pay_paid_on, left(concat_ws(' · ', c.title, 'Erstattung Mieter', who), 200), net, who,
         'Sonstiges', 1, 'maint:erst:' || r.id, false, null, pay, r.id)
      on conflict (maint_refund_of) do update set
        property_id = excluded.property_id, invoice_date = excluded.invoice_date, item = excluded.item,
        amount = excluded.amount, company = excluded.company, kind = excluded.kind,
        direction = excluded.direction, source_ref = excluded.source_ref,
        nk_umlage = false, nk_category_id = null, maint_pay = excluded.maint_pay;
    else
      delete from public.ctrl_expense_one_time where maint_refund_of = r.id;
    end if;
  end if;

  -- Booked again: a kept NK switch is used up (the line holds it now)
  if r.nk_keep is not null then
    update public.maint_costs set nk_keep = null where id = r.id and nk_keep is not null;
  end if;
end $$;

-- 6 · Saving a receipt / return books it. A receipt also refreshes its returns; a return also refreshes
--     its receipt (the receipt's net amount changed). Deleting a return refreshes its receipt as well
--     (when the whole receipt or entry is deleted, there is nothing left to refresh).
create or replace function public.maint_costs_book() returns trigger
language plpgsql set search_path = public as $$
declare x uuid;
begin
  perform public.maint_book_line(new.id);
  if new.return_of is null then
    for x in select id from public.maint_costs where return_of = new.id loop
      perform public.maint_book_line(x);
    end loop;
  else
    perform public.maint_book_line(new.return_of);
  end if;
  if tg_op = 'UPDATE' and old.return_of is not null and old.return_of is distinct from new.return_of then
    perform public.maint_book_line(old.return_of);           -- a return moved to another receipt
  end if;
  return null;
end $$;
drop trigger if exists maint_costs_book on public.maint_costs;
create trigger maint_costs_book after insert or update on public.maint_costs
  for each row execute function public.maint_costs_book();

create or replace function public.maint_costs_unbook() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.maint_unbook(old.id);
  return old;
end $$;
drop trigger if exists maint_costs_unbook on public.maint_costs;
create trigger maint_costs_unbook before delete on public.maint_costs
  for each row execute function public.maint_costs_unbook();

create or replace function public.maint_costs_rebook() returns trigger
language plpgsql set search_path = public as $$
begin
  perform public.maint_book_line(old.return_of);
  return null;
end $$;
drop trigger if exists maint_costs_rebook on public.maint_costs;
create trigger maint_costs_rebook after delete on public.maint_costs
  for each row when (old.return_of is not null) execute function public.maint_costs_rebook();

-- 7 · Book everything again once (receipts first, then returns)
do $$
declare x uuid;
begin
  for x in select id from public.maint_costs order by (return_of is not null), cost_date loop
    perform public.maint_book_line(x);
  end loop;
end $$;

-- 8 · Supabase sees the new columns right away
notify pgrst, 'reload schema';

-- Check (one row):
--   nk_receipts      = your Casa Castel receipts that go into the NK (the NK switches you had in Controlling)
--   nk_wrong         = 0  (Casa Castel lines in Controlling whose NK switch does not follow "Who pays")
--   tenant_refunds   = receipts a tenant paid you directly (0 right after the first run)
--   refunds_wrong    = 0  (an "Erstattung Mieter" line whose amount or date does not match its receipt)
--   refunds_missing  = 0  (a booked receipt paid directly that has no "Erstattung Mieter" line)
select
  (select count(*) from public.maint_costs m join public.maint_cases c on c.id = m.case_id
    where c.property_id = 7 and m.return_of is null and m.pay_type = 'nk') as nk_receipts,
  (select count(*) from public.ctrl_expense_one_time o
     join public.maint_costs m on m.id = o.maint_cost_id
     join public.maint_cases c on c.id = m.case_id
     join public.maint_costs h on h.id = coalesce(m.return_of, m.id)
    where c.property_id = 7
      and (o.nk_umlage is distinct from coalesce(h.pay_type = 'nk', false)
           or o.nk_category_id is distinct from (case when h.pay_type = 'nk' then h.pay_cat end))) as nk_wrong,
  (select count(*) from public.ctrl_expense_one_time where maint_refund_of is not null) as tenant_refunds,
  (select count(*) from public.ctrl_expense_one_time o join public.maint_costs m on m.id = o.maint_refund_of
    where coalesce(m.pay_type, '') not in ('klein', 'schaden') or coalesce(m.pay_via, 'nk') <> 'direct'
       or o.invoice_date is distinct from m.pay_paid_on
       or o.amount is distinct from greatest(m.amount - coalesce((select sum(x.amount) from public.maint_costs x
                                                                   where x.return_of = m.id), 0), 0)) as refunds_wrong,
  (select count(*) from public.maint_costs m join public.maint_cases c on c.id = m.case_id
    where c.property_id = 7 and m.return_of is null and m.pay_type in ('klein', 'schaden')
      and coalesce(m.pay_via, 'nk') = 'direct' and m.pay_paid_on is not null
      and m.amount > coalesce((select sum(x.amount) from public.maint_costs x where x.return_of = m.id), 0)
      and exists (select 1 from public.ctrl_expense_one_time o where o.maint_cost_id = m.id)
      and not exists (select 1 from public.ctrl_expense_one_time o where o.maint_refund_of = m.id)) as refunds_missing;
