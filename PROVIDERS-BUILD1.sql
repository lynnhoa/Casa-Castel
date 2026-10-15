-- ═══ PROVIDERS · BUILD 1 · kitchen check · one rule for every visit · start logic ═══
-- ⚠ 48h auto-approve here is SUPERSEDED by PROVIDERS-NO-AUTO.sql — if you re-run this file, run that one again afterwards.

-- 1 · every visit that gets sent waits 48 h, then counts (with or without a date) — not after Undo / Unflag
create or replace function pv_visit_auto_48h() returns trigger language plpgsql as $$
begin
  if new.status = 'sent' and new.auto_due_at is null and new.sent_at is distinct from old.sent_at then
    new.auto_due_at := now() + interval '48 hours';
  end if;
  return new;
end $$;
drop trigger if exists provider_visits_auto_48h on provider_visits;
create trigger provider_visits_auto_48h before update on provider_visits
  for each row execute function pv_visit_auto_48h();
update provider_visits set auto_due_at = now() + interval '48 hours'
 where status = 'sent' and auto_due_at is null and unplanned;     -- visits without a date waiting now

-- 2 · "Don't count" for every visit (waiting or flagged) · an invoice already sent goes back
create or replace function pv_admin_reject(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status not in ('sent', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  update provider_visits set status = 'rejected', rejected_at = now(), auto_due_at = null, redo_until = null,
    lynn_changed_at = now(), updated_at = now() where id = v.id;
  update provider_invoices set status = 'returned', note = 'Termin nicht gezählt · visit not counted',
    returned_at = now(), checked_at = null
   where visit_id = v.id and status in ('to_check', 'checked');
  perform pv_sys(v.job_id, v.id, 'rejected', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

-- 3 · invoices: every visit the same — no more "without a date: only after approval"
create or replace function pv_invoice_insert(p_job uuid, p_visit uuid, p_month date, p_amount numeric, p_date date,
                                             p_path text, p_person uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; m date; old provider_invoices%rowtype; nid uuid;
begin
  if p_amount is null or p_amount < 0 or p_amount > 100000 then return jsonb_build_object('error', 'amount'); end if;
  if coalesce(p_path, '') = '' or position(p_job::text || '/' in p_path) <> 1 then return jsonb_build_object('error', 'path'); end if;
  if p_visit is not null then
    select * into v from provider_visits where id = p_visit and job_id = p_job;
    if not found or v.status not in ('sent', 'done', 'redo') then
      return jsonb_build_object('error', 'visit');
    end if;
    m := pv_month_of(v.date);
    if pv_mode_for(p_job, m) <> 'per_visit' then return jsonb_build_object('error', 'mode'); end if;
    select * into old from provider_invoices where visit_id = v.id and status <> 'replaced' order by created_at desc limit 1;
  else
    m := pv_month_of(coalesce(p_month, pv_month_of(pv_today()) - 1));
    if pv_mode_for(p_job, m) <> 'monthly' then return jsonb_build_object('error', 'mode'); end if;
    select * into old from provider_invoices where job_id = p_job and month = m and visit_id is null and status <> 'replaced'
      order by created_at desc limit 1;
  end if;
  if exists (select 1 from provider_months where job_id = p_job and month = m and status = 'closed') then
    return jsonb_build_object('error', 'closed');
  end if;
  if old.id is not null and old.status <> 'returned' then return jsonb_build_object('error', 'exists'); end if;
  insert into provider_invoices (job_id, visit_id, month, amount, invoice_date, pdf_path, uploaded_by)
  values (p_job, p_visit, m, round(p_amount, 2), coalesce(p_date, pv_today()), p_path, p_person)
  returning id into nid;
  if old.id is not null then update provider_invoices set status = 'replaced', superseded_by = nid where id = old.id; end if;
  return jsonb_build_object('ok', true, 'id', nid, 'month', m);
end $$;

create or replace function pv_invoice_todo(p_job uuid, p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lm date := pv_month_of(pv_month_of(pv_today()) - 1);
declare la numeric := (select amount from provider_invoices where job_id = p_job and status = 'checked' order by created_at desc limit 1);
begin
  return jsonb_build_object(
    'last_amount', la,
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.date) order by x.date), '[]'::jsonb)
                from provider_visits x
                where x.job_id = p_job and pv_visible(x, p_person) and x.date >= pv_today() - 62
                  and x.status in ('sent', 'done')
                  and pv_mode_for(p_job, x.date) = 'per_visit'
                  and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status <> 'replaced')
                  and not pv_month_closed(p_job, x.date)),
    'returned', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'visit_date', v.date,
                   'month', i.month, 'amount', i.amount, 'note', i.note) order by i.created_at), '[]'::jsonb)
                 from provider_invoices i left join provider_visits v on v.id = i.visit_id
                 where i.job_id = p_job and i.status = 'returned'),
    'prompt', case when pv_mode_for(p_job, lm) = 'monthly'
                  and exists (select 1 from provider_visits x where x.job_id = p_job and pv_month_of(x.date) = lm and x.status in ('done', 'sent', 'redo'))
                  and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = lm and i.visit_id is null and i.status <> 'replaced')
                  and not pv_month_closed(p_job, lm)
                then jsonb_build_object('month', lm, 'visits', (select count(*) from provider_visits x where x.job_id = p_job
                                          and pv_month_of(x.date) = lm and x.status in ('done', 'sent', 'redo'))) end);
end $$;

create or replace function pv_admin_offen(p_job uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reviews', (select count(*) from provider_visits x where x.job_id = p_job and x.status = 'sent'),
    'invoices', (select count(*) from provider_invoices i where i.job_id = p_job and i.status = 'to_check'),
    'close_month', (select min(pv_month_of(x.date)) from provider_visits x
                    where x.job_id = p_job and pv_month_of(x.date) < pv_month_of(pv_today())
                      and x.status in ('done', 'sent', 'redo')
                      and pv_mode_for(p_job, x.date) <> 'none'
                      and not pv_month_closed(p_job, x.date)
                      and not exists (select 1 from provider_visits y where y.job_id = p_job
                                        and pv_month_of(y.date) = pv_month_of(x.date)
                                        and y.status in ('planned', 'in_progress', 'sent', 'redo'))
                      and not exists (select 1 from provider_invoices i2 where i2.job_id = p_job
                                        and i2.month = pv_month_of(x.date) and i2.status in ('to_check', 'returned'))))
$$;
revoke all on function pv_admin_offen(uuid) from public, anon, authenticated;
grant execute on function pv_admin_offen(uuid) to authenticated;

create or replace function pv_admin_close_month(p_job uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); open_n int; miss_n int; rev_n int; s numeric; cat text; od date; ou timestamptz;
begin
  perform pv_admin_guard();
  if m >= pv_month_of(pv_today()) then return jsonb_build_object('error', 'not_over'); end if;
  if pv_month_closed(p_job, m) then return jsonb_build_object('error', 'changed'); end if;
  select ctrl_category_id into cat from providers where id = p_job;
  if pv_mode_for(p_job, m) <> 'none' and cat is null then return jsonb_build_object('error', 'no_category'); end if;
  perform pv_catch_up(p_job);
  select x.date, pv_win_to(x.date, x.reopen_until) into od, ou from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('planned', 'in_progress')
  order by x.date limit 1;
  if od is not null then return jsonb_build_object('error', 'open', 'date', od, 'until', ou); end if;
  select count(*) into rev_n from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('sent', 'redo');
  if rev_n > 0 then return jsonb_build_object('error', 'review', 'n', rev_n); end if;
  select count(*) into open_n from provider_invoices where job_id = p_job and month = m and status in ('to_check', 'returned');
  if open_n > 0 then return jsonb_build_object('error', 'unchecked', 'n', open_n); end if;
  select count(*) into miss_n from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('sent', 'done', 'redo')
    and pv_mode_for(p_job, m) <> 'none'
    and ((pv_mode_for(p_job, m) = 'per_visit' and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status = 'checked'))
      or (pv_mode_for(p_job, m) = 'monthly' and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = m and i.visit_id is null and i.status = 'checked')));
  if miss_n > 0 and not coalesce(p_force, false) then return jsonb_build_object('confirm', 'missing', 'n', miss_n); end if;
  select coalesce(sum(amount), 0) into s from provider_invoices where job_id = p_job and month = m and status = 'checked';
  insert into provider_months (job_id, month, status, closed_sum, closed_at, ctrl_category_id)
  values (p_job, m, 'closed', s, now(), cat)
  on conflict (job_id, month) do update set status = 'closed', closed_sum = excluded.closed_sum, closed_at = now(),
    ctrl_category_id = coalesce(provider_months.ctrl_category_id, excluded.ctrl_category_id);
  return jsonb_build_object('ok', true, 'sum', s, 'month', m);
end $$;

-- 4 · a second cleaning on the same day: starting is allowed once today's visit is sent
create or replace function pv_start_unplanned(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; l provider_lists; vid uuid;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  if exists (select 1 from provider_visits v where v.job_id = me.job_id and pv_visible(v, me.person_id)
             and v.status in ('planned', 'in_progress', 'redo') and pv_in_window(v)) then
    return jsonb_build_object('error', 'changed');
  end if;
  l := pv_list_row(me.job_id, null);
  insert into provider_visits (job_id, date, at_time, person_id, list_id, unplanned, status, started_at, started_by,
                               list_snapshot, spot_pick)
  values (me.job_id, pv_today(), date_trunc('minute', (now() at time zone 'Europe/Berlin'))::time, me.person_id, l.id, true,
          'in_progress', now(), me.person_id,
          jsonb_build_object('id', l.id, 'name', l.name, 'floors', coalesce(l.floors, '[]'::jsonb),
                             'spot_check', coalesce(l.spot_check, false), 'spot_size', l.spot_size),
          case when coalesce(l.spot_check, false) then pv_spot_pick(l.floors, l.spot_size) end)
  returning id into vid;
  return jsonb_build_object('ok', true, 'visit', vid);
end $$;

-- 5 · "Heute statt Fr 16.10.?" — her next planned visit (within 7 days) moves to today and starts
create or replace function pv_start_instead(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; l provider_lists; t date;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  t := pv_today();
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status <> 'planned' or v.started_at is not null or v.date <= t or v.date > t + 7
     or (v.person_id is not null and v.person_id <> me.person_id) then
    return jsonb_build_object('error', 'changed');
  end if;
  if exists (select 1 from provider_visits x where x.job_id = me.job_id and x.id <> v.id
             and x.status in ('in_progress', 'redo') and pv_in_window(x)) then
    return jsonb_build_object('error', 'changed');
  end if;
  l := pv_list_row(v.job_id, v.list_id);
  update provider_visits set date = t, at_time = date_trunc('minute', (now() at time zone 'Europe/Berlin'))::time,
    moved_from = v.date, rhythm_id = null, person_id = coalesce(v.person_id, me.person_id),
    status = 'in_progress', started_at = now(), started_by = me.person_id,
    list_id = coalesce(v.list_id, l.id),
    list_snapshot = jsonb_build_object('id', l.id, 'name', l.name, 'floors', coalesce(l.floors, '[]'::jsonb),
                                       'spot_check', coalesce(l.spot_check, false), 'spot_size', l.spot_size),
    spot_pick = case when coalesce(l.spot_check, false) then pv_spot_pick(l.floors, l.spot_size) end,
    updated_at = now()
  where id = v.id;                                           -- the rhythm slot stays taken: no double visit later
  perform pv_sys(v.job_id, v.id, 'moved', jsonb_build_object('from', v.date, 'to', t, 'person', me.person_name));
  return jsonb_build_object('ok', true, 'visit', v.id);
end $$;
revoke all on function pv_start_instead(text, uuid) from public, anon, authenticated;
grant execute on function pv_start_instead(text, uuid) to anon, authenticated;
