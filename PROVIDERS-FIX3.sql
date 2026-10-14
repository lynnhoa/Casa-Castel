-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS · FIX 3 (Lean Pass) · 14.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  Offen chip data · "Alle ✓" per month · invoice amount pre-fill.
-- ═══════════════════════════════════════════════════════════════

-- ── the Offen chip: what needs Lynn, computed with the tab load ──
create or replace function pv_admin_offen(p_job uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reviews', (select count(*) from provider_visits x where x.job_id = p_job and x.status = 'sent'),
    'invoices', (select count(*) from provider_invoices i where i.job_id = p_job and i.status = 'to_check'),
    'close_month', (select min(pv_month_of(x.date)) from provider_visits x
                    where x.job_id = p_job and pv_month_of(x.date) < pv_month_of(pv_today())
                      and x.status in ('done', 'sent', 'redo') and not (x.unplanned and x.status <> 'done')
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
    'offen', pv_admin_offen(j.id),
    'state', pv_state_core(j.id, null));
end $$;

-- ── "Alle ✓" — every to-check invoice of the month in one tap (Fix stays per invoice) ──
create or replace function pv_admin_check_month(p_job uuid, p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); n int; s numeric;
begin
  perform pv_admin_guard();
  if pv_month_closed(p_job, m) then return jsonb_build_object('error', 'closed'); end if;
  update provider_invoices set status = 'checked', checked_at = now()
  where job_id = p_job and month = m and status = 'to_check';
  get diagnostics n = row_count;
  select coalesce(sum(amount), 0) into s from provider_invoices where job_id = p_job and month = m and status = 'checked';
  return jsonb_build_object('ok', true, 'n', n, 'sum', s);
end $$;
revoke all on function pv_admin_check_month(uuid, date) from public, anon, authenticated;
grant execute on function pv_admin_check_month(uuid, date) to authenticated;

-- ── invoice pre-fill: her last checked amount rides along ──
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
