-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS · Phase 6a (Money) · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  Adds: the job's Controlling cost type, the Soll hand-over when you
--  close a month (writes ONLY the chosen Casa Castel cost type for that
--  month in ctrl_expense_castel), invoice to-dos for the provider card,
--  invoice + month lines for your card and History.
-- ═══════════════════════════════════════════════════════════════
alter table providers add column if not exists ctrl_category_id text;

-- ═══════════════════════════════════════════════════════════════
-- MONEY (Phase 6): the job's Controlling cost type · the Soll hand-over · invoice to-dos
-- ═══════════════════════════════════════════════════════════════
-- the sum of every closed month mapped to this cost type → ctrl_expense_castel (the row Controlling shows)
create or replace function pv_ctrl_soll_write(p_category text, p_month date) returns numeric
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); s numeric;
begin
  if p_category is null or to_regclass('public.ctrl_expense_castel') is null then return null; end if;
  select coalesce(sum(pm.closed_sum), 0) into s
  from provider_months pm join providers j on j.id = pm.job_id
  where j.ctrl_category_id = p_category and pm.month = m and pm.status = 'closed';
  execute format('insert into public.ctrl_expense_castel (category_id, year, month, amount) values (%L, %s, %s, %s) '
                 'on conflict (category_id, year, month) do update set amount = excluded.amount',
                 p_category, extract(year from m)::int, extract(month from m)::int, s);
  return s;
end $$;

-- your Casa Castel cost types in Controlling (read-only) — the People modal picks one per job
create or replace function pv_admin_ctrl_categories() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform pv_admin_guard();
  if to_regclass('public.ctrl_castel_categories') is null then return '[]'::jsonb; end if;
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'', c.id::text, ''name'', c.name) order by c.sort_order nulls last, c.name), ''[]''::jsonb) from public.ctrl_castel_categories c' into r;
  return r;
end $$;

create or replace function pv_admin_set_ctrl_category(p_job uuid, p_category text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update providers set ctrl_category_id = nullif(trim(coalesce(p_category, '')), '') where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- what a provider who sends invoices still has to do (visits without invoice · returned · monthly prompt)
create or replace function pv_invoice_todo(p_job uuid, p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lm date := pv_month_of(pv_month_of(pv_today()) - 1);
begin
  return jsonb_build_object(
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.date) order by x.date), '[]'::jsonb)
                from provider_visits x
                where x.job_id = p_job and pv_visible(x, p_person) and x.date >= pv_today() - 62
                  and x.status in ('sent', 'done') and not (x.unplanned and x.status <> 'done')
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

create or replace function pv_admin_close_month(p_job uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); open_n int; miss_n int; s numeric; cat text; soll numeric;
begin
  perform pv_admin_guard();
  if m >= pv_month_of(pv_today()) then return jsonb_build_object('error', 'not_over'); end if;
  if pv_month_closed(p_job, m) then return jsonb_build_object('error', 'changed'); end if;
  select ctrl_category_id into cat from providers where id = p_job;
  if pv_mode_for(p_job, m) <> 'none' and cat is null then return jsonb_build_object('error', 'no_category'); end if;
  select count(*) into open_n from provider_invoices where job_id = p_job and month = m and status in ('to_check', 'returned');
  if open_n > 0 then return jsonb_build_object('error', 'unchecked', 'n', open_n); end if;
  select count(*) into miss_n from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('sent', 'done', 'redo') and not (x.unplanned and x.status <> 'done')
    and pv_mode_for(p_job, m) <> 'none'
    and ((pv_mode_for(p_job, m) = 'per_visit' and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status = 'checked'))
      or (pv_mode_for(p_job, m) = 'monthly' and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = m and i.visit_id is null and i.status = 'checked')));
  if miss_n > 0 and not coalesce(p_force, false) then return jsonb_build_object('confirm', 'missing', 'n', miss_n); end if;
  select coalesce(sum(amount), 0) into s from provider_invoices where job_id = p_job and month = m and status = 'checked';
  insert into provider_months (job_id, month, status, closed_sum, closed_at)
  values (p_job, m, 'closed', s, now())
  on conflict (job_id, month) do update set status = 'closed', closed_sum = excluded.closed_sum, closed_at = now();
  soll := pv_ctrl_soll_write(cat, m);                                  -- the one hand-over into Controlling (Phase 6)
  return jsonb_build_object('ok', true, 'sum', s, 'month', m, 'soll', soll);
end $$;

create or replace function pv_admin_load(p_job uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; t date := pv_today(); res jsonb;
begin
  perform pv_admin_guard();
  perform pv_catch_up(null);
  select * into j from providers where deleted_at is null and (p_job is null or id = p_job) order by (id = p_job) desc, sort, lower(name) limit 1;
  if p_job is not null and j.id is distinct from p_job then
    select * into j from providers where deleted_at is null order by sort, lower(name) limit 1;
  end if;
  res := jsonb_build_object('ok', true, 'now', now(), 'today', t,
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'dot', pv_job_dot(x.id)) order by x.sort, lower(x.name)), '[]'::jsonb)
             from providers x where x.deleted_at is null));
  if j.id is null then return res || jsonb_build_object('job', null); end if;
  return res || jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'name', j.name, 'sort', j.sort,
      'invoice_mode', j.invoice_mode, 'mode_now', pv_mode_for(j.id, t), 'next_mode', j.next_mode, 'next_mode_from', j.next_mode_from,
      'sender_name', j.invoice_sender_name, 'sender_address', j.invoice_sender_address,
      'contract_path', j.contract_path, 'tell_tenants', j.tell_tenants,
      'locked_until', case when j.locked_until > now() then j.locked_until end,
      'ctrl_category_id', j.ctrl_category_id),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone,
                  'password', p.pass_readable, 'login_on', p.login_on, 'sends_invoices', p.sends_invoices,
                  'last_login', p.last_login, 'switched_off_at', p.switched_off_at, 'created_at', p.created_at,
                  'has_history', exists (select 1 from provider_visits v where v.person_id = p.id or v.started_by = p.id or v.sent_by = p.id or v.cancelled_person = p.id)
                                 or exists (select 1 from provider_photos x where x.person_id = p.id)
                                 or exists (select 1 from provider_messages m where m.person_id = p.id)
                                 or exists (select 1 from provider_invoices i where i.uploaded_by = p.id))
                order by (p.switched_off_at is not null), p.created_at), '[]'::jsonb)
               from provider_people p where p.job_id = j.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'note', r.note,
                    'person_id', r.person_id, 'at', r.created_at) order by r.created_at), '[]'::jsonb)
                 from provider_pw_requests r where r.job_id = j.id and r.done_at is null),
    'lists', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.sort, l.created_at), '[]'::jsonb)
              from provider_lists l where l.job_id = j.id and l.deleted_at is null),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'visit_date', v.date,
                    'month', i.month, 'amount', i.amount, 'invoice_date', i.invoice_date, 'path', i.pdf_path, 'status', i.status,
                    'note', i.note, 'by', pp.name, 'at', i.created_at,
                    'month_visits', (select count(*) from provider_visits x where x.job_id = i.job_id and pv_month_of(x.date) = i.month
                                       and x.status in ('done', 'sent', 'redo'))) order by i.created_at), '[]'::jsonb)
                 from provider_invoices i left join provider_visits v on v.id = i.visit_id
                 left join provider_people pp on pp.id = i.uploaded_by
                 where i.job_id = j.id and i.status in ('to_check', 'returned')),
    'state', pv_state_core(j.id, null));
end $$;

create or replace function pv_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; s jsonb;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  s := pv_state_core(me.job_id, me.person_id);
  return s || jsonb_build_object(
    'person', jsonb_build_object('id', me.person_id, 'name', me.person_name, 'sends_invoices', me.sends_invoices),
    'job', jsonb_build_object('id', me.job_id, 'name', me.job_name),
    'invoice_todo', case when me.sends_invoices then pv_invoice_todo(me.job_id, me.person_id) end);
end $$;

create or replace function pv_admin_history(p_job uuid, p_before date default null, p_months int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; lo date;
begin
  perform pv_admin_guard();
  perform pv_catch_up(p_job);
  r := pv_history_rows(p_job, null, p_before, p_months);
  lo := (r->>'from')::date;
  return r || jsonb_build_object(                                      -- Phase 6: invoices + month lines
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'month', i.month, 'amount', i.amount,
                    'status', i.status, 'note', i.note, 'path', i.pdf_path, 'invoice_date', i.invoice_date, 'by', pp.name)
                    order by i.created_at), '[]'::jsonb)
                 from provider_invoices i left join provider_people pp on pp.id = i.uploaded_by
                 where i.job_id = p_job and i.status <> 'replaced' and i.month >= lo),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', mo.m, 'mode', pv_mode_for(p_job, mo.m),
                  'status', coalesce(pm.status, 'open'), 'closed_sum', pm.closed_sum, 'closed_at', pm.closed_at,
                  'paid_at', pm.confirmed_paid_at, 'changed', coalesce(pm.changed_after_confirmation, false)) order by mo.m desc), '[]'::jsonb)
               from (select g::date as m from generate_series(lo, pv_month_of(pv_today()), interval '1 month') g) mo
               left join provider_months pm on pm.job_id = p_job and pm.month = mo.m),
    'ctrl_category_id', (select ctrl_category_id from providers where id = p_job));
end $$;

revoke all on function pv_ctrl_soll_write(text, date) from public, anon, authenticated;
revoke all on function pv_invoice_todo(uuid, uuid) from public, anon, authenticated;
revoke all on function pv_admin_ctrl_categories() from public, anon, authenticated;
revoke all on function pv_admin_set_ctrl_category(uuid, text) from public, anon, authenticated;
grant execute on function pv_admin_ctrl_categories() to authenticated;
grant execute on function pv_admin_set_ctrl_category(uuid, text) to authenticated;
