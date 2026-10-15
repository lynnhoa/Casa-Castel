-- ═══ PROVIDERS · NO AUTO-APPROVE · 14.10.2026 ═══
-- A sent visit (with or without a date) waits until you decide — nothing
-- approves itself after 48 h anymore. Run AFTER Build 1, Build 2, FIX11.
-- Supabase → SQL Editor → paste all → Run. Safe to run twice.
-- If you ever re-run BUILD1 / BUILD2 / FIX1, run THIS file again afterwards.

-- 1 · the 48 h trigger from Build 1 goes away
drop trigger if exists provider_visits_auto_48h on provider_visits;
drop function if exists pv_visit_auto_48h();

-- 2 · sending never sets a deadline anymore
create or replace function pv_send(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; left_n int;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if v.status = 'redo' and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz)) then
    return jsonb_build_object('error', 'changed');
  end if;
  if not pv_visit_complete(v.id) then
    left_n := (pv_visit_json(v, true)->'counts'->>'left')::int;
    return jsonb_build_object('error', 'incomplete', 'left', left_n);
  end if;
  update provider_visits set status = 'sent', sent_at = now(), sent_by = me.person_id,
    auto_due_at = null, updated_at = now()                   -- no auto-approve: waits for Lynn
  where id = v.id;
  perform pv_sys(v.job_id, v.id, case when v.status = 'redo' then 'resent' else 'sent' end,
                 jsonb_build_object('date', v.date, 'person', me.person_name));
  return jsonb_build_object('ok', true);
end $$;

-- 3 · pv_catch_up (Build 2 version) WITHOUT the "48 h untouched → Done" sweep
create or replace function pv_catch_up(p_job uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  -- window end, never started → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'planned' and (p_job is null or v.job_id = p_job) and not pv_is_guest(v.person_id)
      and now() >= pv_win_to(v.date, v.reopen_until)
      and exists (select 1 from providers j where j.id = v.job_id and j.deleted_at is null)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- window end, started + every point covered → sent (waits for Lynn, no deadline)
  with t as (
    update provider_visits v set status = 'sent', sent_at = now(),
      auto_due_at = null, updated_at = now()
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

  -- redo deadline passed → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'redo' and v.redo_until is not null and not pv_is_guest(v.person_id) and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz))
      and (p_job is null or v.job_id = p_job)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- Build 2 · a guest link nobody used: its visit disappears after the day (no "Missed"), the guest too
  delete from provider_visits v
   where v.status = 'planned' and v.started_at is null and (p_job is null or v.job_id = p_job)
     and now() >= pv_win_to(v.date, v.reopen_until) and pv_is_guest(v.person_id);
  delete from provider_people pp
   where pp.is_guest and pp.guest_until < now() and (p_job is null or pp.job_id = p_job)
     and not exists (select 1 from provider_visits v where v.person_id = pp.id or v.started_by = pp.id or v.sent_by = pp.id)
     and not exists (select 1 from provider_photos x where x.person_id = pp.id)
     and not exists (select 1 from provider_messages m where m.person_id = pp.id)
     and not exists (select 1 from provider_invoices i where i.uploaded_by = pp.id)
     and not exists (select 1 from provider_pw_requests r where r.person_id = pp.id)
     and not exists (select 1 from provider_visits v2 where v2.cancelled_person = pp.id);

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

-- 4 · no visit keeps an old deadline
update provider_visits set auto_due_at = null where auto_due_at is not null;
