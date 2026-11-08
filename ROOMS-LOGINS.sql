-- ═══ Rooms · the tenant-app login status follows a renamed / deleted room (Nov 2026 · safe to run twice) ═══
-- Tenants › App shows "Logged in since … · last seen …" from room_logins, stored under the lower-case room name.
-- Renaming a room in Rooms moved everything else, but not this — the card then said "No login yet" and the first
-- login date was lost. Run this once in Supabase › SQL Editor; from then on Rename moves it and Delete room clears it.
-- Until it has run, the app behaves exactly as before (no message).

create or replace function public.room_logins_rename(p_old text, p_new text)
returns void language plpgsql security definer set search_path = public as $$
declare o text := lower(trim(coalesce(p_old, ''))); n text := lower(trim(coalesce(p_new, '')));
begin
  if auth.uid() is null then raise exception 'landlord only' using errcode = '42501'; end if;   -- the landlord app only
  if to_regclass('public.room_logins') is null then return; end if;                           -- no login table yet
  if o = '' or n = o then return; end if;
  if n = '' then delete from room_logins where room_key = o; return; end if;                    -- room deleted
  if exists (select 1 from room_logins where room_key = o) then
    delete from room_logins where room_key = n;                                                 -- a stale row of a deleted room
    update room_logins set room_key = n where room_key = o;
  end if;
end $$;
revoke all on function public.room_logins_rename(text, text) from public, anon;
grant execute on function public.room_logins_rename(text, text) to authenticated;

notify pgrst, 'reload schema';
