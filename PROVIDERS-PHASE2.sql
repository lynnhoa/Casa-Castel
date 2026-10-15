-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS · Phase 2 (Planning) · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  Adds one read function for the Agenda modal. Nothing else changes.
-- ═══════════════════════════════════════════════════════════════
-- Agenda modal: rhythms + pauses + coming visits in ONE load (Phase 2)
create or replace function pv_admin_agenda(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t date := pv_today();
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  perform pv_catch_up(p_job);
  return jsonb_build_object('ok', true, 'today', t,
    'rhythms', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'unit', r.unit, 'every', r.every_n, 'weekday', r.weekday,
                   'week_of_month', r.week_of_month, 'time', to_char(r.at_time, 'HH24:MI'), 'start', r.start_date,
                   'person_id', r.person_id, 'list_id', r.list_id, 'active', r.active) order by r.created_at), '[]'::jsonb)
                from provider_rhythms r where r.job_id = p_job),
    'pauses', (select coalesce(jsonb_agg(jsonb_build_object('id', pa.id, 'from', pa.from_date, 'to', pa.to_date,
                   'n', (select count(*) from provider_visits v where v.job_id = p_job and v.status = 'cancelled'
                           and v.cancelled_by = 'pause' and v.date between pa.from_date and pa.to_date))
                 order by pa.from_date), '[]'::jsonb)
               from provider_pauses pa where pa.job_id = p_job and pa.to_date >= t),
    'visits', (select coalesce(jsonb_agg(pv_visit_json(v, false) || jsonb_build_object('extra_task', v.extra_task)
                 order by v.date, v.at_time nulls first, v.created_at), '[]'::jsonb)
               from provider_visits v where v.job_id = p_job and v.date between t and t + 120 and v.status <> 'rejected'));
end $$;

revoke all on function pv_admin_agenda(uuid) from public, anon, authenticated;
grant execute on function pv_admin_agenda(uuid) to authenticated;
