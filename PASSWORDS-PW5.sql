-- ═══ CASA CASTEL · Password pickup waits 5 days instead of 24 h ═══
-- Adds only — nothing existing is rewritten. Room passwords and logins are not touched.

-- 1 · every sent password ("First time here?" + "Forgot password?") waits 5 days for pickup
create or replace function public.cc_pw_pickup_5_days()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and new.decided_at is not null then
    new.expires_at := new.decided_at + interval '5 days';
  end if;
  return new;
end; $$;

drop trigger if exists pw_requests_pickup_5_days on public.pw_requests;
create trigger pw_requests_pickup_5_days
  before insert or update on public.pw_requests
  for each row execute function public.cc_pw_pickup_5_days();

-- 2 · pickups waiting right now also get their 5 days
update public.pw_requests set expires_at = decided_at + interval '5 days'
 where status = 'approved' and decided_at is not null;

-- 3 · the requesting phone may ask until when its pickup is shown (only its own, only the date)
create or replace function public.pw_request_until(p_token text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select q.expires_at from pw_requests q
   where q.token_hash = public.cc_sha256(p_token) and q.status = 'approved' and q.expires_at > now()
   order by q.created_at desc limit 1;
$$;
revoke all on function public.pw_request_until(text) from public, anon, authenticated;
grant execute on function public.pw_request_until(text) to anon, authenticated;
