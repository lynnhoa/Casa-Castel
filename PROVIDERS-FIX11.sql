-- ═══ PROVIDERS · FIX11 · "Abbrechen" — stop a started visit and start over ═══
-- planned visit   → back to "Heute · 0/13" (its photos are deleted)
-- unplanned visit → removed completely (nothing reaches Casa Castel)
-- only while in progress, and only if every photo / mark on it is the caller's own
create or replace function pv_abort(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status <> 'in_progress' then return jsonb_build_object('error', 'changed'); end if;
  if exists (select 1 from provider_photos ph where ph.visit_id = v.id and ph.kind in ('normal', 'extra', 'redo')
             and ph.person_id is distinct from me.person_id) then
    return jsonb_build_object('error', 'team');             -- a colleague's photos are in it
  end if;
  if v.unplanned then
    delete from provider_visits where id = v.id;            -- its photos go with it (cascade)
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  delete from provider_photos where visit_id = v.id and kind in ('normal', 'extra', 'redo');
  update provider_visits set status = 'planned', started_at = null, started_by = null,
    list_snapshot = null, spot_pick = null, updated_at = now()
  where id = v.id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function pv_abort(text, uuid) from public, anon, authenticated;
grant execute on function pv_abort(text, uuid) to anon, authenticated;
