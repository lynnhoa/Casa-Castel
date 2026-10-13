-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS · Phase 5 (Lists & growth) · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--  Adds one read function for the List modal. Nothing else changes.
-- ═══════════════════════════════════════════════════════════════
-- List modal (Phase 5): every list of a job in full + where it is used (planned visits · rhythms)
create or replace function pv_admin_lists(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare first uuid;
begin
  perform pv_admin_guard();
  select id into first from provider_lists where job_id = p_job and deleted_at is null order by sort, created_at limit 1;
  return jsonb_build_object('ok', true, 'lists', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'name', l.name, 'sort', l.sort, 'floors', l.floors, 'spot_check', l.spot_check, 'spot_size', l.spot_size,
      'house_info', l.house_info, 'muell', l.muell_pdf_path, 'updated_at', l.updated_at,
      'planned', (select count(*) from provider_visits v where v.job_id = p_job and v.status = 'planned' and v.date >= pv_today()
                    and (v.list_id = l.id or (v.list_id is null and l.id = first))),
      'rhythms', (select count(*) from provider_rhythms r where r.job_id = p_job and r.active
                    and (r.list_id = l.id or (r.list_id is null and l.id = first))))
    order by l.sort, l.created_at), '[]'::jsonb)
    from provider_lists l where l.job_id = p_job and l.deleted_at is null));
end $$;

revoke all on function pv_admin_lists(uuid) from public, anon, authenticated;
grant execute on function pv_admin_lists(uuid) to authenticated;
