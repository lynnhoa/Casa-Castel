-- ═══ PROVIDERS · Controlling helper for Fix 6 · claimed cost types ═══
-- Which Controlling cost types a Providers job owns, and since which month.
-- Supabase → SQL Editor → paste all → Run. Safe to run twice.
create or replace function pv_ctrl_claimed() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'category_id', j.ctrl_category_id,
    'from', least(
      (select min(pv_month_of(v.date)) from provider_visits v where v.job_id = j.id),
      (select min(pm.month) from provider_months pm where pm.job_id = j.id))
  )), '[]'::jsonb)
  from providers j
  where j.deleted_at is null and j.ctrl_category_id is not null
$$;
revoke all on function pv_ctrl_claimed() from public, anon, authenticated;
grant execute on function pv_ctrl_claimed() to authenticated;
