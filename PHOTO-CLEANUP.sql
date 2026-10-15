-- ═══ Photo clean-up · Kitchen 30 days · Providers 4 months (safe to run twice) ═══
-- Only PHOTOS in the two proof folders. PDFs, Lounge photos, invoices, Putzliste files and
-- everything in your other apps are never touched — only you delete those, as before.
-- The apps delete the files (normal file delete); these functions only list what is due.

-- 1 · Providers: chat photos remember when their file was deleted
alter table public.provider_messages add column if not exists file_deleted_at timestamptz;

-- 2 · Providers: every visit photo older than 4 months — proof, supplies/damage, chat (yours and
--     the cleaner's) and leftovers no longer linked to a visit. Never lists/ (Putzliste), never a PDF.
create or replace function pv_admin_cleanup_due(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return (select coalesce(jsonb_agg(x.name), '[]'::jsonb) from (
    select o.name from storage.objects o
    where o.bucket_id = 'provider-proofs'
      and o.name not like 'lists/%'
      and o.name ~* '\.(jpe?g|png|webp|heic|heif)$'
      and o.created_at < now() - interval '4 months'
    order by o.created_at
    limit greatest(coalesce(p_limit, 200), 1)) x);
end $$;

-- 3 · Providers: mark what was deleted → the apps show "Foto gelöscht · deleted after 4 months"
--     (visits, statuses, History and chat texts stay)
create or replace function pv_admin_cleanup_done(p_paths jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  perform pv_admin_guard();
  update provider_photos ph
     set file_deleted_at = coalesce(ph.file_deleted_at, now()), path = 'deleted:' || ph.path
   where ph.path in (select jsonb_array_elements_text(coalesce(p_paths, '[]'::jsonb)));
  get diagnostics n = row_count;
  update provider_messages pm
     set file_deleted_at = coalesce(pm.file_deleted_at, now()),
         payload = jsonb_set(pm.payload, '{path}', to_jsonb('deleted:' || (pm.payload->>'path')))
   where pm.payload->>'path' in (select jsonb_array_elements_text(coalesce(p_paths, '[]'::jsonb)));
  get diagnostics m = row_count;
  return jsonb_build_object('ok', true, 'photos', n, 'chat', m);
end $$;

-- 4 · Kitchen: every kitchen photo older than 30 days (proof + kitchen chat, also leftovers) and every
--     photo of the test weeks before 05.10.2026 (week 39). Never the Lounge folder, never a PDF.
create or replace function public.cc_kitchen_cleanup_due(p_limit int default 500) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'admin_only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(x.name), '[]'::jsonb) from (
    select o.name from storage.objects o
    where o.bucket_id = 'kitchen-proofs'
      and o.name not like 'lounge/%'
      and o.name ~* '\.(jpe?g|png|webp|heic|heif)$'
      and (o.created_at < now() - interval '30 days'
           or coalesce(substring(o.name from '^week-([0-9]+)-'), '999')::int < 39)
    order by o.created_at
    limit greatest(coalesce(p_limit, 500), 1)) x);
end $$;

-- 5 · Only your login may call them
revoke all on function pv_admin_cleanup_due(int)            from public, anon;
revoke all on function pv_admin_cleanup_done(jsonb)         from public, anon;
revoke all on function public.cc_kitchen_cleanup_due(int)   from public, anon;
grant execute on function pv_admin_cleanup_due(int)          to authenticated;
grant execute on function pv_admin_cleanup_done(jsonb)       to authenticated;
grant execute on function public.cc_kitchen_cleanup_due(int) to authenticated;

-- Check (read only): what the apps will delete next time you open Kitchen / Providers
select 'Kitchen photos due' as what, count(*) as files,
       round(coalesce(sum((metadata->>'size')::bigint), 0) / 1048576.0, 1) as mb
from storage.objects
where bucket_id = 'kitchen-proofs' and name not like 'lounge/%' and name ~* '\.(jpe?g|png|webp|heic|heif)$'
  and (created_at < now() - interval '30 days' or coalesce(substring(name from '^week-([0-9]+)-'), '999')::int < 39)
union all
select 'Provider photos due', count(*), round(coalesce(sum((metadata->>'size')::bigint), 0) / 1048576.0, 1)
from storage.objects
where bucket_id = 'provider-proofs' and name not like 'lists/%' and name ~* '\.(jpe?g|png|webp|heic|heif)$'
  and created_at < now() - interval '4 months';
