-- ═══════════════════════════════════════════════════════════════
-- ⚠ 48h auto-approve here is SUPERSEDED by PROVIDERS-NO-AUTO.sql — if you re-run this file, run that one again afterwards.
--  PROVIDERS · FIX 1 (bugs 1–15 from the Bug Map) · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  Only pv_* functions change, plus ONE new column on provider_months.
--  Fix numbers refer to "Providers · Bug Map (15 bugs · fix spec)".
-- ═══════════════════════════════════════════════════════════════

-- ── Fix 2 · the Controlling cost type is frozen per closed month ──
alter table provider_months add column if not exists ctrl_category_id text;
update provider_months m set ctrl_category_id = j.ctrl_category_id
from providers j where j.id = m.job_id and m.ctrl_category_id is null;

create or replace function pv_visible(v provider_visits, p uuid) returns boolean language sql stable as $$
  select true                                              -- Fix 1+10: every person of the job sees the job's visits
$$;

create or replace function pv_login(p_job uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; p provider_people%rowtype; tok text; pw text := pv_norm_pw(p_password);
begin
  select * into j from providers where id = p_job and deleted_at is null for update;
  if not found then return jsonb_build_object('error', 'job'); end if;
  if pw <> '' then
    select * into p from provider_people where job_id = j.id and pass_hash = pv_hash(pw);
  end if;
  if pw = '' or p.id is null then                           -- Fix 8: only WRONG tries hit the lock
    if j.locked_until is not null and j.locked_until > now() then
      return jsonb_build_object('error', 'locked', 'minutes', greatest(1, ceil(extract(epoch from (j.locked_until - now())) / 60)::int));
    end if;
    if j.failed_logins + 1 >= 5 then
      update providers set failed_logins = 0, locked_until = now() + interval '10 minutes' where id = j.id;
      return jsonb_build_object('error', 'locked', 'minutes', 10);
    end if;
    update providers set failed_logins = failed_logins + 1 where id = j.id;
    return jsonb_build_object('error', 'wrong', 'left', 5 - (j.failed_logins + 1));
  end if;
  if not p.login_on or p.switched_off_at is not null then
    return jsonb_build_object('error', 'off');
  end if;
  update providers set failed_logins = 0, locked_until = null where id = j.id;
  update provider_people set last_login = now() where id = p.id;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into provider_sessions (person_id, token_hash) values (p.id, pv_hash(tok));
  return jsonb_build_object('ok', true, 'token', tok,
    'person', jsonb_build_object('id', p.id, 'name', p.name),
    'job', jsonb_build_object('id', j.id, 'name', j.name));
end $$;

create or replace function pv_mark_np(p_token text, p_visit uuid, p_point text, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if (v.status = 'in_progress' and not pv_in_window(v)) or (v.status = 'redo' and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz))) then
    return jsonb_build_object('error', 'changed');
  end if;
  if p_reason not in ('besetzt', 'kaputt', 'anderes') then return jsonb_build_object('error', 'reason'); end if;
  if p_reason = 'anderes' and coalesce(trim(p_note), '') = '' then return jsonb_build_object('error', 'note'); end if;
  if not exists (select 1 from pv_visit_points(v) pt where pt.key = p_point) then return jsonb_build_object('error', 'point'); end if;
  if v.status = 'redo' and not (coalesce(v.flagged_steps, '[]'::jsonb) ? p_point) then return jsonb_build_object('error', 'point'); end if;
  update provider_photos set superseded = true where visit_id = v.id and point_key = p_point and not superseded;
  insert into provider_photos (visit_id, point_key, person_id, np_reason, np_note, kind)
  values (v.id, p_point, me.person_id, p_reason, left(nullif(trim(p_note), ''), 200), case when v.status = 'redo' then 'redo' else 'normal' end);
  update provider_visits set updated_at = now() where id = v.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_take_photo(p_token text, p_visit uuid, p_point text, p_path text,
                                         p_taken_at timestamptz default null, p_kind text default 'normal') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; k text := coalesce(p_kind, 'normal'); n int;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if (v.status = 'in_progress' and not pv_in_window(v)) or (v.status = 'redo' and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz))) then
    return jsonb_build_object('error', 'changed');
  end if;
  if coalesce(p_path, '') = '' or position(v.id::text || '/' in p_path) <> 1 then return jsonb_build_object('error', 'path'); end if;
  if k = 'extra' then
    if p_point !~ '^extra-[1-4]$' then return jsonb_build_object('error', 'point'); end if;
  elsif k in ('normal', 'redo') then
    if not exists (select 1 from pv_visit_points(v) pt where pt.key = p_point) then return jsonb_build_object('error', 'point'); end if;
    if v.status = 'redo' then
      if not (coalesce(v.flagged_steps, '[]'::jsonb) ? p_point) then return jsonb_build_object('error', 'point'); end if;
      k := 'redo';
    end if;
  else
    return jsonb_build_object('error', 'kind');
  end if;
  update provider_photos set superseded = true where visit_id = v.id and point_key = p_point and not superseded;
  insert into provider_photos (visit_id, point_key, person_id, path, taken_at_client, kind)
  values (v.id, p_point, me.person_id, p_path, p_taken_at, k);
  update provider_visits set updated_at = now() where id = v.id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'received_at', now());
end $$;

create or replace function pv_send(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; left_n int;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if v.status = 'redo' and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz)) then       -- Fix 15: same deadline as photo/np
    return jsonb_build_object('error', 'changed');
  end if;
  if not pv_visit_complete(v.id) then
    left_n := (pv_visit_json(v, true)->'counts'->>'left')::int;
    return jsonb_build_object('error', 'incomplete', 'left', left_n);
  end if;
  update provider_visits set status = 'sent', sent_at = now(), sent_by = me.person_id,
    auto_due_at = case when v.unplanned then null else now() + interval '48 hours' end, updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, case when v.status = 'redo' then 'resent' else 'sent' end,
                 jsonb_build_object('date', v.date, 'person', me.person_name));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_undo_cancel(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status <> 'cancelled_by_provider' or v.date < pv_today()
     or v.cancelled_person is distinct from me.person_id      -- Fix 11: only the canceller can undo
     or (v.lynn_changed_at is not null and v.lynn_changed_at > v.cancelled_at) then
    return jsonb_build_object('error', 'changed');
  end if;
  update provider_visits set status = 'planned', cancelled_by = null, cancel_reason = null, cancel_note = null,
    cancelled_at = null, cancelled_person = null, updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'cancel_undone', jsonb_build_object('date', v.date, 'person', me.person_name));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_reopen(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'missed' then return jsonb_build_object('error', 'changed'); end if;
  if v.flagged_steps is not null and jsonb_array_length(v.flagged_steps) > 0 then
    update provider_visits set status = 'redo', missed_at = null,          -- Fix 5: a Redo-Missed reopens as REDO
      reopen_until = now() + interval '24 hours', lynn_changed_at = now(), updated_at = now()
    where id = v.id;                                        -- redo_at + flagged areas stay: only fresh photos count
  else
    update provider_visits set status = case when v.started_at is not null then 'in_progress' else 'planned' end,
      missed_at = null, redo_until = null, reopen_until = now() + interval '24 hours', lynn_changed_at = now(), updated_at = now()
    where id = v.id;
  end if;
  perform pv_sys(v.job_id, v.id, 'reopened', jsonb_build_object('date', v.date, 'until', now() + interval '24 hours'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_flag(p_visit uuid, p_points jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; ok_keys jsonb;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'sent' then return jsonb_build_object('error', 'changed'); end if;
  if exists (select 1 from provider_months m where m.job_id = v.job_id and m.month = pv_month_of(v.date) and m.status = 'closed') then
    return jsonb_build_object('error', 'closed');           -- Fix 3: no Flag once the month is closed (like Undo)
  end if;
  select coalesce(jsonb_agg(pt.key), '[]'::jsonb) into ok_keys
  from pv_visit_points(v) pt where coalesce(p_points, '[]'::jsonb) ? pt.key;
  if jsonb_array_length(ok_keys) = 0 then return jsonb_build_object('error', 'points'); end if;
  update provider_visits set status = 'redo', flagged_steps = ok_keys, flag_note = left(nullif(trim(p_note), ''), 500),
    redo_at = now(), redo_until = pv_next_visit_day(v.job_id, v.id), auto_due_at = null, lynn_changed_at = now(), updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'redo', jsonb_build_object('date', v.date, 'n', jsonb_array_length(ok_keys)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_close_month(p_job uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); open_n int; miss_n int; rev_n int; s numeric; cat text;
begin
  perform pv_admin_guard();
  if m >= pv_month_of(pv_today()) then return jsonb_build_object('error', 'not_over'); end if;
  if pv_month_closed(p_job, m) then return jsonb_build_object('error', 'changed'); end if;
  select ctrl_category_id into cat from providers where id = p_job;
  if pv_mode_for(p_job, m) <> 'none' and cat is null then return jsonb_build_object('error', 'no_category'); end if;
  perform pv_catch_up(p_job);                             -- Fix 3: everything must be reviewed first
  select count(*) into rev_n from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('sent', 'redo', 'in_progress');
  if rev_n > 0 then return jsonb_build_object('error', 'review', 'n', rev_n); end if;
  select count(*) into open_n from provider_invoices where job_id = p_job and month = m and status in ('to_check', 'returned');
  if open_n > 0 then return jsonb_build_object('error', 'unchecked', 'n', open_n); end if;
  select count(*) into miss_n from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('sent', 'done', 'redo') and not (x.unplanned and x.status <> 'done')
    and pv_mode_for(p_job, m) <> 'none'
    and ((pv_mode_for(p_job, m) = 'per_visit' and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status = 'checked'))
      or (pv_mode_for(p_job, m) = 'monthly' and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = m and i.visit_id is null and i.status = 'checked')));
  if miss_n > 0 and not coalesce(p_force, false) then return jsonb_build_object('confirm', 'missing', 'n', miss_n); end if;
  select coalesce(sum(amount), 0) into s from provider_invoices where job_id = p_job and month = m and status = 'checked';
  insert into provider_months (job_id, month, status, closed_sum, closed_at, ctrl_category_id)
  values (p_job, m, 'closed', s, now(), cat)                 -- Fix 2: the cost type is frozen on the month
  on conflict (job_id, month) do update set status = 'closed', closed_sum = excluded.closed_sum, closed_at = now(),
    ctrl_category_id = coalesce(provider_months.ctrl_category_id, excluded.ctrl_category_id);
  return jsonb_build_object('ok', true, 'sum', s, 'month', m);        -- Controlling reads it as the Soll (pv_ctrl_year)
end $$;

create or replace function pv_admin_set_ctrl_category(p_job uuid, p_category text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cat text := nullif(trim(coalesce(p_category, '')), ''); other text;
begin
  perform pv_admin_guard();
  if cat is not null then                                   -- Fix 7: one Controlling cost type = one job
    select name into other from providers where deleted_at is null and id <> p_job and ctrl_category_id = cat limit 1;
    if other is not null then return jsonb_build_object('error', 'taken', 'name', other); end if;
  end if;
  update providers set ctrl_category_id = cat where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_ctrl_year(p_year int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return (select coalesce(jsonb_agg(x.g order by x.cat, x.m), '[]'::jsonb) from (
    select coalesce(pm.ctrl_category_id, j.ctrl_category_id) as cat, pm.month as m, jsonb_build_object(
      'category_id', coalesce(pm.ctrl_category_id, j.ctrl_category_id), 'month', extract(month from pm.month)::int, 'month_iso', pm.month,
      'sum', sum(pm.closed_sum),
      'status', case when bool_or(pm.status = 'reopened') then 'reopened' else 'closed' end,
      'changed', bool_or(pm.changed_after_confirmation),
      'paid', bool_and(pm.confirmed_paid_at is not null),
      'jobs', jsonb_agg(jsonb_build_object('job_id', j.id, 'name', j.name, 'sum', pm.closed_sum, 'status', pm.status,
                'paid_at', pm.confirmed_paid_at, 'changed', pm.changed_after_confirmation) order by j.sort, j.name),
      'invoices', (select coalesce(jsonb_agg(jsonb_build_object('job', jj.name, 'amount', i.amount, 'invoice_date', i.invoice_date,
                     'visit_date', v.date, 'path', i.pdf_path, 'by', pp.name) order by v.date nulls last, i.invoice_date), '[]'::jsonb)
                   from provider_invoices i
                   join provider_months pm2 on pm2.job_id = i.job_id and pm2.month = i.month and pm2.status in ('closed', 'reopened')
                   join providers jj on jj.id = i.job_id    -- Fix 7: only invoices of CLOSED months of this type
                   left join provider_visits v on v.id = i.visit_id left join provider_people pp on pp.id = i.uploaded_by
                   where coalesce(pm2.ctrl_category_id, jj.ctrl_category_id) = coalesce(pm.ctrl_category_id, j.ctrl_category_id)
                     and i.month = pm.month and i.status = 'checked')) as g
    from provider_months pm join providers j on j.id = pm.job_id
    where coalesce(pm.ctrl_category_id, j.ctrl_category_id) is not null and extract(year from pm.month)::int = p_year and pm.status in ('closed', 'reopened')
    group by coalesce(pm.ctrl_category_id, j.ctrl_category_id), pm.month) x);
end $$;

create or replace function pv_catch_up(p_job uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  -- window end, never started → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'planned' and (p_job is null or v.job_id = p_job)
      and now() >= pv_win_to(v.date, v.reopen_until)
      and exists (select 1 from providers j where j.id = v.job_id and j.deleted_at is null)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- window end, started + every point covered → sent (unplanned visits wait for Lynn, no 48 h)
  with t as (
    update provider_visits v set status = 'sent', sent_at = now(),
      auto_due_at = case when v.unplanned then null else now() + interval '48 hours' end, updated_at = now()
    where v.status = 'in_progress' and (p_job is null or v.job_id = p_job)
      and now() >= pv_win_to(v.date, v.reopen_until) and pv_visit_complete(v.id)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'sent', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- window end, started but incomplete → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'in_progress' and (p_job is null or v.job_id = p_job)
      and now() >= pv_win_to(v.date, v.reopen_until)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- 48 h untouched → Done (labelled like a manual Done)
  with t as (
    update provider_visits v set status = 'done', done_at = now(), auto_due_at = null, updated_at = now()
    where v.status = 'sent' and v.auto_due_at is not null and v.auto_due_at <= now()
      and (p_job is null or v.job_id = p_job)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'approved', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- redo deadline passed → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'redo' and v.redo_until is not null and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz))
      and (p_job is null or v.job_id = p_job)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- invoice mode switch reached its month
  update providers set invoice_mode = next_mode, next_mode = null, next_mode_from = null
  where next_mode is not null and next_mode_from <= pv_month_of(pv_today()) and (p_job is null or id = p_job);

  -- generator once per Berlin day per job
  if exists (select 1 from providers where deleted_at is null and (p_job is null or id = p_job)
             and generated_on is distinct from pv_today()) then
    perform pv_generate_visits(j.id) from providers j
      where j.deleted_at is null and (p_job is null or j.id = p_job) and j.generated_on is distinct from pv_today();
  end if;
  return n;
end $$;

create or replace function pv_admin_add_visit(p_job uuid, p_date date, p_time time, p_person uuid default null, p_list uuid default null, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  if p_date is null or p_date < pv_today() then return jsonb_build_object('error', 'past'); end if;
  if not pv_admin_check_refs(p_job, p_person, p_list) then return jsonb_build_object('error', 'refs'); end if;
  if not coalesce(p_force, false) and exists (select 1 from provider_visits x where x.job_id = p_job and x.date = p_date
      and x.status in ('planned', 'in_progress', 'sent', 'done', 'redo')) then
    return jsonb_build_object('confirm', 'day_taken');      -- Fix 9: ask once before a double day
  end if;
  insert into provider_visits (job_id, date, at_time, person_id, list_id, lynn_changed_at)
  values (p_job, p_date, p_time, p_person, p_list, now()) returning id into vid;
  return jsonb_build_object('ok', true, 'id', vid);
end $$;

create or replace function pv_admin_move_visit(p_visit uuid, p_date date, p_time time, p_person uuid default null, p_list uuid default null, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status not in ('planned', 'cancelled', 'cancelled_by_provider') or v.started_at is not null then
    return jsonb_build_object('error', 'changed');
  end if;
  if p_date is null or p_date < pv_today() then return jsonb_build_object('error', 'past'); end if;
  if not pv_admin_check_refs(v.job_id, p_person, p_list) then return jsonb_build_object('error', 'refs'); end if;
  if not coalesce(p_force, false) and p_date <> v.date and exists (select 1 from provider_visits x
      where x.job_id = v.job_id and x.date = p_date and x.id <> v.id
        and x.status in ('planned', 'in_progress', 'sent', 'done', 'redo')) then
    return jsonb_build_object('confirm', 'day_taken');      -- Fix 9: ask once before a double day
  end if;
  update provider_visits set status = 'planned', date = p_date, at_time = p_time, person_id = p_person, list_id = p_list,
    rhythm_id = case when p_date <> v.date or p_time is distinct from v.at_time then null else v.rhythm_id end,
    moved_from = case when p_date <> v.date then v.date else v.moved_from end,
    cancelled_by = null, cancel_reason = null, cancel_note = null, cancelled_at = null,
    cancelled_person = case when v.status = 'cancelled_by_provider' then v.cancelled_person end,
    lynn_changed_at = now(), updated_at = now()
  where id = v.id;
  if v.status = 'cancelled_by_provider' then
    perform pv_sys(v.job_id, v.id, 'replanned', jsonb_build_object('from', v.date, 'to', p_date,
      'person', (select name from provider_people where id = v.cancelled_person)));
  elsif p_date <> v.date then
    perform pv_sys(v.job_id, v.id, 'moved', jsonb_build_object('from', v.date, 'to', p_date));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_tenant_notice() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v record; t date := pv_today();
begin
  select x.job_id, x.list_id, x.date, x.at_time, j.name as jname into v
  from provider_visits x join providers j on j.id = x.job_id
  where j.deleted_at is null and j.tell_tenants and x.status in ('planned', 'in_progress')
    and x.date between t and t + 6
  order by x.date, x.at_time nulls last limit 1;
  if v.date is null then return null; end if;
  return jsonb_build_object('date', v.date, 'time', to_char(v.at_time, 'HH24:MI'), 'job', v.jname,    -- Fix 6
                            'areas', pv_tenant_areas(v.job_id, v.list_id));
end $$;

create or replace function pv_tenant_push_due(p_test boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t date := pv_today(); r jsonb;
begin
  if not coalesce(p_test, false) and extract(hour from now() at time zone 'Europe/Berlin') <> 19 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('visit', x.id, 'title', 'Casa Castel', 'body',
           (case when x.date = t + 1 then 'Morgen' else 'Am ' || to_char(x.date, 'DD.MM.') end)
           || ' kommt ' || j.name                            -- Fix 6: the JOB's name, not "die Putzhilfe"
           || case when x.at_time is not null then ' (ab ' || to_char(x.at_time, 'HH24:MI') || ')' else '' end || '.'
           || case when coalesce(a.de, '') ~ '(Bäder|Küche)' then ' Bitte Bäder frei und Geschirr weg.' else '' end
           || ' · ' || case when x.date = t + 1 then 'Tomorrow' else 'On ' || to_char(x.date, 'DD.MM.') end
           || ': ' || j.name
           || case when x.at_time is not null then ' from ' || to_char(x.at_time, 'HH24:MI') else '' end || '.')
         order by x.date, x.at_time nulls last), '[]'::jsonb)
    into r
  from provider_visits x
  join providers j on j.id = x.job_id
  cross join lateral (select pv_tenant_areas(x.job_id, x.list_id)->>'de' as de) a
  where j.deleted_at is null and j.tell_tenants and x.status = 'planned'
    and (case when coalesce(p_test, false) then x.date between t and t + 7
              else x.date = t + 1 and x.tenant_notified_for is distinct from x.date end);
  return r;                                                  -- Fix 6: ALL due jobs · Fix 12: nothing is marked here
end $$;

-- the two recreated agenda functions lost the old 5-arg form + their grants
drop function if exists pv_admin_add_visit(uuid, date, time, uuid, uuid);
drop function if exists pv_admin_move_visit(uuid, date, time, uuid, uuid);
revoke all on function pv_admin_add_visit(uuid, date, time, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function pv_admin_move_visit(uuid, date, time, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function pv_admin_add_visit(uuid, date, time, uuid, uuid, boolean) to authenticated;
grant execute on function pv_admin_move_visit(uuid, date, time, uuid, uuid, boolean) to authenticated;

-- ── Fix 12 · the push function confirms delivery per visit (service key only) ──
create or replace function pv_tenant_push_mark(p_visit uuid) returns void
language sql security definer set search_path = public as $$
  update provider_visits set tenant_notified_for = date where id = p_visit
$$;
revoke all on function pv_tenant_push_mark(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function pv_tenant_push_mark(uuid) to service_role';
  end if;
end $$;
