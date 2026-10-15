-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS · Phase 6b (Wiring) · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  · Correction to 6a: closing a month no longer books the cost in
--    Controlling. Controlling shows it as the Soll (read-only, "from
--    Providers"); you confirm it there, and that sends paid ✓ back.
--  · Tenant card + 19:00 reminder (only with "Tell tenants" on),
--    login tile dot.
-- ═══════════════════════════════════════════════════════════════
drop function if exists pv_ctrl_soll_write(text, date);

create or replace function pv_admin_close_month(p_job uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); open_n int; miss_n int; s numeric; cat text;
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
  return jsonb_build_object('ok', true, 'sum', s, 'month', m);        -- Controlling reads it as the Soll (pv_ctrl_year)
end $$;

-- ═══════════════════════════════════════════════════════════════
-- WIRING (Phase 6b): Controlling reads the Soll · tenant notice · 19:00 push · login dot
-- ═══════════════════════════════════════════════════════════════
-- Controlling: every closed (or reopened) Providers month of a year, per cost type — the read-only Soll + drill-down
create or replace function pv_ctrl_year(p_year int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return (select coalesce(jsonb_agg(x.g order by x.cat, x.m), '[]'::jsonb) from (
    select j.ctrl_category_id as cat, pm.month as m, jsonb_build_object(
      'category_id', j.ctrl_category_id, 'month', extract(month from pm.month)::int, 'month_iso', pm.month,
      'sum', sum(pm.closed_sum),
      'status', case when bool_or(pm.status = 'reopened') then 'reopened' else 'closed' end,
      'changed', bool_or(pm.changed_after_confirmation),
      'paid', bool_and(pm.confirmed_paid_at is not null),
      'jobs', jsonb_agg(jsonb_build_object('job_id', j.id, 'name', j.name, 'sum', pm.closed_sum, 'status', pm.status,
                'paid_at', pm.confirmed_paid_at, 'changed', pm.changed_after_confirmation) order by j.sort, j.name),
      'invoices', (select coalesce(jsonb_agg(jsonb_build_object('job', jj.name, 'amount', i.amount, 'invoice_date', i.invoice_date,
                     'visit_date', v.date, 'path', i.pdf_path, 'by', pp.name) order by v.date nulls last, i.invoice_date), '[]'::jsonb)
                   from provider_invoices i join providers jj on jj.id = i.job_id
                   left join provider_visits v on v.id = i.visit_id left join provider_people pp on pp.id = i.uploaded_by
                   where jj.ctrl_category_id = j.ctrl_category_id and i.month = pm.month and i.status = 'checked')) as g
    from provider_months pm join providers j on j.id = pm.job_id
    where j.ctrl_category_id is not null and extract(year from pm.month)::int = p_year and pm.status in ('closed', 'reopened')
    group by j.ctrl_category_id, pm.month) x);
end $$;

-- login tile dot: anything waiting in any job
create or replace function pv_admin_dot_any() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return exists (select 1 from providers j where j.deleted_at is null and pv_job_dot(j.id));
end $$;

-- tenant app: the next visit of a job with "Tell tenants" on (only date, time and areas — nothing else)
create or replace function pv_tenant_areas(p_job uuid, p_list uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fl jsonb; z text[]; de text[] := '{}'; en text[] := '{}';
begin
  select l.floors into fl from provider_lists l
  where l.job_id = p_job and l.deleted_at is null and (l.id = p_list or p_list is null)
  order by (l.id = p_list) desc nulls last, l.sort, l.created_at limit 1;
  select array_agg(distinct f->>'zone') into z from jsonb_array_elements(coalesce(fl, '[]'::jsonb)) f;
  if 'b' = any(z) then de := de || 'Bäder'::text; en := en || 'bathrooms'::text; end if;
  if 'g' = any(z) then de := de || 'Gäste-WC'::text; en := en || 'guest WC'::text; end if;
  if 'k' = any(z) then de := de || 'Küche'::text; en := en || 'kitchen'::text; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(fl, '[]'::jsonb)) f
             where (f->'block'->>'vacuum')::boolean or (f->'block'->>'mop')::boolean) then
    de := de || 'Flure'::text; en := en || 'hallways'::text;
  end if;
  return jsonb_build_object('de', array_to_string(de, ', '), 'en', array_to_string(en, ', '));
end $$;

create or replace function pv_tenant_notice() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v record; t date := pv_today();
begin
  select x.job_id, x.list_id, x.date, x.at_time into v
  from provider_visits x join providers j on j.id = x.job_id
  where j.deleted_at is null and j.tell_tenants and x.status in ('planned', 'in_progress')
    and x.date between t and t + 6
  order by x.date, x.at_time nulls last limit 1;
  if v.date is null then return null; end if;
  return jsonb_build_object('date', v.date, 'time', to_char(v.at_time, 'HH24:MI'), 'areas', pv_tenant_areas(v.job_id, v.list_id));
end $$;

-- 19:00 the evening before: what the push says (once per visit date) · p_test = the next visit now, nothing marked
alter table provider_visits add column if not exists tenant_notified_for date;
create or replace function pv_tenant_push_due(p_test boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record; t date := pv_today(); tm text; d text;
begin
  if not coalesce(p_test, false) and extract(hour from now() at time zone 'Europe/Berlin') <> 19 then return null; end if;
  select x.id, x.date, x.at_time into v
  from provider_visits x join providers j on j.id = x.job_id
  where j.deleted_at is null and j.tell_tenants and x.status = 'planned'
    and (case when coalesce(p_test, false) then x.date >= t else x.date = t + 1 and x.tenant_notified_for is distinct from x.date end)
  order by x.date, x.at_time nulls last limit 1;
  if v.id is null then return null; end if;
  if not coalesce(p_test, false) then update provider_visits set tenant_notified_for = v.date where id = v.id; end if;
  tm := to_char(v.at_time, 'HH24:MI');
  d := case when v.date = t + 1 then 'Morgen' else 'Am ' || to_char(v.date, 'DD.MM.') end;
  return jsonb_build_object('title', 'Casa Castel',
    'body', d || ' kommt die Putzhilfe' || case when tm is not null then ' (ab ' || tm || ')' else '' end
            || '. Bitte Bäder frei und Geschirr weg. · Cleaning '
            || case when v.date = t + 1 then 'tomorrow' else 'on ' || to_char(v.date, 'DD.MM.') end
            || case when tm is not null then ' from ' || tm else '' end || '.');
end $$;

revoke all on function pv_ctrl_year(int) from public, anon, authenticated;
revoke all on function pv_admin_dot_any() from public, anon, authenticated;
revoke all on function pv_tenant_areas(uuid, uuid) from public, anon, authenticated;
revoke all on function pv_tenant_notice() from public, anon, authenticated;
revoke all on function pv_tenant_push_due(boolean) from public, anon, authenticated;
grant execute on function pv_ctrl_year(int) to authenticated;
grant execute on function pv_admin_dot_any() to authenticated;
grant execute on function pv_tenant_notice() to anon, authenticated;
grant execute on function pv_tenant_push_due(boolean) to service_role;

-- hourly at :00 → the small push function; it only sends at 19:00 Berlin
select cron.unschedule(jobid) from cron.job where jobname = 'pv-tenant-push';
select cron.schedule('pv-tenant-push', '0 * * * *', $job$
  select net.http_post(
    url     := 'https://nqxsonmmcnmdastcpiff.supabase.co/functions/v1/push-providers',
    body    := '{"kind":"tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cc_push_secret')));
$job$);
