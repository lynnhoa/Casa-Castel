-- ═══ PROVIDERS · delete any chat line (incl. system lines & Submitted blocks) ═══
-- Only your login. The visit and its photos stay — History is untouched.
-- Supabase → SQL Editor → paste all → Run. Safe to run twice.
create or replace function pv_admin_delete_message(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_messages set deleted = true
  where id = p_id and kind in ('text', 'photo', 'supplies', 'damage', 'system');
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;
