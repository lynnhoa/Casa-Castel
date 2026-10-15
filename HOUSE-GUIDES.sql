-- ═══ Casa Castel · House guides in Storage (run once · safe to run twice) ═══
-- A public folder for the guide PDFs: everyone can read them (they open in the phone's
-- PDF viewer with a close button), only your login can put files in.
insert into storage.buckets (id, name, public)
values ('house-guides', 'house-guides', true)
on conflict (id) do update set public = true;

drop policy if exists "house-guides read"   on storage.objects;
drop policy if exists "house-guides add"    on storage.objects;
drop policy if exists "house-guides change" on storage.objects;
create policy "house-guides read"   on storage.objects for select using (bucket_id = 'house-guides');
create policy "house-guides add"    on storage.objects for insert to authenticated with check (bucket_id = 'house-guides');
create policy "house-guides change" on storage.objects for update to authenticated
  using (bucket_id = 'house-guides') with check (bucket_id = 'house-guides');

-- Check: the folder exists and is public
select id, public from storage.buckets where id = 'house-guides';
