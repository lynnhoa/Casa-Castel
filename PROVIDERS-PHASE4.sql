-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS · Phase 4 (Review & control) · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  Adds 4 read functions (History for you + the provider, the photo
--  viewer). Nothing else changes.
-- ═══════════════════════════════════════════════════════════════
-- History (Phase 4): month groups, every visit line forever · Lynn sees all, a provider only her own (read-only)
create or replace function pv_history_rows(p_job uuid, p_person uuid, p_before date, p_months int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t date := pv_today(); top date; lo date; rows jsonb; older boolean;
begin
  top := pv_month_of(least(coalesce(p_before, t), t));
  lo  := (top - make_interval(months => greatest(coalesce(p_months, 3), 1) - 1))::date;
  select coalesce(jsonb_agg(x.j order by x.date desc, x.at_time desc nulls last, x.created_at desc), '[]'::jsonb) into rows from (
    select v.date, v.at_time, v.created_at,
      (f.j - 'points' - 'extras') || jsonb_build_object(
        'month', pv_month_of(v.date),
        'thumbs', (select coalesce(jsonb_agg(jsonb_build_object('key', p->>'key', 'de', p->>'de', 'path', p->>'path', 'np', p->>'np')
                     order by (p->>'n')::int), '[]'::jsonb)
                   from jsonb_array_elements(f.j->'points') p where p->>'path' is not null or p->>'np' is not null),
        'flagged_names', (select coalesce(jsonb_agg(p->>'de' order by (p->>'n')::int), '[]'::jsonb)
                          from jsonb_array_elements(f.j->'points') p where (p->>'flagged')::boolean),
        'people', (select coalesce(jsonb_agg(distinct pp.name), '[]'::jsonb)
                   from provider_photos ph join provider_people pp on pp.id = ph.person_id where ph.visit_id = v.id),
        'redo_at', v.redo_at) as j
    from provider_visits v cross join lateral (select pv_visit_json(v, true) as j) f
    where v.job_id = p_job and pv_visible(v, p_person) and v.status <> 'planned' and v.date between lo and t
  ) x;
  older := exists (select 1 from provider_visits v where v.job_id = p_job and pv_visible(v, p_person)
                   and v.status <> 'planned' and v.date < lo);
  return jsonb_build_object('ok', true, 'today', t, 'from', lo, 'visits', rows,
                            'next_before', case when older then (lo - 1) end);
end $$;

create or replace function pv_admin_history(p_job uuid, p_before date default null, p_months int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  perform pv_catch_up(p_job);
  return pv_history_rows(p_job, null, p_before, p_months);
end $$;

create or replace function pv_history(p_token text, p_before date default null, p_months int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  return pv_history_rows(me.job_id, me.person_id, p_before, p_months);
end $$;

-- Viewer (Phase 4): one visit in full — every area with photo, time, person, np note, flag
create or replace function pv_admin_visit_detail(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  perform pv_admin_guard();
  select * into v from provider_visits where id = p_visit;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return pv_visit_json(v, true) || jsonb_build_object('job_id', v.job_id);
end $$;

revoke all on function pv_history_rows(uuid, uuid, date, int) from public, anon, authenticated;
revoke all on function pv_admin_history(uuid, date, int) from public, anon, authenticated;
revoke all on function pv_admin_visit_detail(uuid) from public, anon, authenticated;
revoke all on function pv_history(text, date, int) from public, anon, authenticated;
grant execute on function pv_admin_history(uuid, date, int) to authenticated;
grant execute on function pv_admin_visit_detail(uuid) to authenticated;
grant execute on function pv_history(text, date, int) to anon, authenticated;
