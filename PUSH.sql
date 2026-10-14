-- ═══ PUSH · you (Casa Castel 11–23 · Providers "photos sent") + providers (on by default, 08–21) ═══
-- Run AFTER Build 1, Build 2 and "no auto-approve". The tenant app, sw.js, "push" and "push-providers" stay untouched.

-- 1 · your phones: which app a subscription belongs to (the ones you have = Casa Castel)
alter table admin_push_subscriptions add column if not exists app text not null default 'casa';

create or replace function pv_admin_push_register(p_endpoint text, p_p256dh text, p_auth text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then return 'invalid'; end if;
  insert into admin_push_subscriptions (endpoint, p256dh, auth, app) values (p_endpoint, p_p256dh, p_auth, 'providers')
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, app = 'providers';
  return 'ok';
end $$;

-- 2 · providers' phones · what waits to be pushed · "already pushed to you" on a visit
create table if not exists provider_push_subscriptions (
  endpoint   text primary key,
  person_id  uuid not null references provider_people(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create table if not exists provider_push_outbox (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references provider_people(id) on delete cascade,
  title      text not null,
  body       text not null,
  tag        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists provider_push_outbox_open on provider_push_outbox (created_at) where sent_at is null;
alter table provider_push_subscriptions enable row level security;
alter table provider_push_outbox enable row level security;
revoke all on provider_push_subscriptions from anon, authenticated;
revoke all on provider_push_outbox from anon, authenticated;

alter table provider_visits add column if not exists admin_notified_at timestamptz;
update provider_visits set admin_notified_at = now()
 where admin_notified_at is null and status <> 'planned';          -- nothing old pops up

-- 3 · a provider turns push on / off (from the provider app, checked by the login)
create or replace function pv_push_register(p_token text, p_endpoint text, p_p256dh text, p_auth text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from pv_me(p_token);
  if pv_is_guest(me.person_id) then return jsonb_build_object('error', 'guest'); end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return jsonb_build_object('error', 'invalid');
  end if;
  insert into provider_push_subscriptions (endpoint, person_id, p256dh, auth) values (p_endpoint, me.person_id, p_p256dh, p_auth)
  on conflict (endpoint) do update set person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_push_unregister(p_token text, p_endpoint text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from pv_me(p_token);
  delete from provider_push_subscriptions where endpoint = p_endpoint and person_id = me.person_id;
  return jsonb_build_object('ok', true);
end $$;

-- 4 · helpers: "Mi 14.10." · who gets it (the visit's person · else who started / sent it · else the whole job, never guests) · wake a push function
create or replace function pv_push_day(d date) returns text language sql immutable as $$
  select (array['So','Mo','Di','Mi','Do','Fr','Sa'])[extract(dow from d)::int + 1] || ' ' || to_char(d, 'DD.MM.')
$$;

create or replace function pv_push_people(p_job uuid, p_visit uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with v as (select coalesce(x.person_id, x.sent_by, x.started_by) as p from provider_visits x where x.id = p_visit)
  select pp.id from provider_people pp
   where pp.job_id = p_job and not pp.is_guest and pp.login_on and pp.switched_off_at is null
     and (pp.id = (select p from v) or (select p from v) is null)
$$;

create or replace function pv_push_poke(p_fn text) returns void
language plpgsql security definer set search_path = public as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cc_push_secret' limit 1;
  perform net.http_post(
    url     := 'https://nqxsonmmcnmdastcpiff.supabase.co/functions/v1/' || p_fn,
    body    := '{"kind":"event"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(v_secret, '')));
exception when others then null;
end $$;

-- 5 · your messages + your decisions on their work → provider push list
create or replace function pv_push_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; code text := new.payload->>'code'; t text; b text; d text; n text;
begin
  if new.kind = 'system' then
    if new.visit_id is null then return new; end if;
    select * into v from provider_visits where id = new.visit_id;
    if not found then return new; end if;
    d := pv_push_day(v.date);
    n := coalesce(new.payload->>'n', '1');
    if code = 'approved' then t := '✓ Bestätigt · Approved'; b := d || ' · Danke! · Thank you!';
    elsif code = 'redo' then t := 'Nochmal · Redo';
      b := n || case when n = '1' then ' Bereich' else ' Bereiche' end || ' neu · bis ' || pv_push_day(coalesce(v.redo_until, v.date)) || ' · ' || n || ' again';
    elsif code = 'rejected' then t := 'Nicht gezählt · Not counted'; b := d;
    elsif code = 'review_again' then t := 'Wird nochmal geprüft · In review again'; b := d;
    elsif code = 'unflagged' then t := 'Passt doch ✓ · All good'; b := d;
    elsif code = 'reopened' then t := 'Wieder offen · Reopened';
      b := d || ' · bis ' || to_char(coalesce(v.reopen_until, now()) at time zone 'Europe/Berlin', 'DD.MM. HH24:MI');
    elsif code = 'missed' then t := 'Nicht gesendet · Not sent'; b := d || ' · Casa Castel meldet sich · will get in touch';
    elsif code = 'moved' and new.payload->>'person' is null then t := 'Termin verschoben · Moved';
      b := pv_push_day((new.payload->>'from')::date) || ' → ' || pv_push_day((new.payload->>'to')::date);
    elsif code = 'replanned' then t := 'Neuer Termin · New date'; b := pv_push_day((new.payload->>'to')::date);
    elsif code = 'cancelled' then t := 'Termin abgesagt · Cancelled'; b := d;
    else return new; end if;
    insert into provider_push_outbox (person_id, title, body, tag)
      select x, t, b, 'visit-' || v.id from pv_push_people(new.job_id, v.id) x;
  elsif new.person_id is null then                                -- Casa Castel writes in the chat
    b := coalesce(nullif(trim(new.payload->>'text'), ''), case when new.payload->>'path' is not null then '📷 Foto · Photo' end, '');
    if b = '' then return new; end if;
    insert into provider_push_outbox (person_id, title, body, tag)
      select pp.id, 'Casa Castel', left(b, 180), 'chat' from provider_people pp
       where pp.job_id = new.job_id and not pp.is_guest and pp.login_on and pp.switched_off_at is null;
  else
    return new;                                                   -- their own messages: no push
  end if;
  perform pv_push_poke('push-pv');
  return new;
exception when others then return new;                            -- a push never blocks the app
end $$;
drop trigger if exists pv_push_message on provider_messages;
create trigger pv_push_message after insert on provider_messages for each row execute function pv_push_on_message();

-- 6 · a new date you add in the Agenda (not the rhythm's own dates, not guest links)
create or replace function pv_push_on_visit_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'planned' and new.lynn_changed_at is not null and new.rhythm_id is null
     and not pv_is_guest(new.person_id) and new.date >= pv_today() then
    insert into provider_push_outbox (person_id, title, body, tag)
      select x, 'Neuer Termin · New date', pv_push_day(new.date) || coalesce(' ab ' || to_char(new.at_time, 'HH24:MI'), ''), 'visit-' || new.id
        from pv_push_people(new.job_id, new.id) x;
    perform pv_push_poke('push-pv');
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists pv_push_visit_new on provider_visits;
create trigger pv_push_visit_new after insert on provider_visits for each row execute function pv_push_on_visit_new();

-- 7 · an invoice you returned → the person who uploaded it
create or replace function pv_push_on_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'returned' and old.status is distinct from 'returned' and new.uploaded_by is not null then
    insert into provider_push_outbox (person_id, title, body, tag)
      select pp.id, 'Rechnung zurück · Invoice returned',
             left(coalesce(nullif(trim(new.note), ''), 'Bitte neu hochladen · Please upload again'), 180), 'inv-' || new.id
        from provider_people pp
       where pp.id = new.uploaded_by and not pp.is_guest and pp.login_on and pp.switched_off_at is null;
    perform pv_push_poke('push-pv');
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists pv_push_invoice on provider_invoices;
create trigger pv_push_invoice after update on provider_invoices for each row execute function pv_push_on_invoice();

-- 8 · photos sent (also after a redo) → push to you
create or replace function pv_push_sent_reset() returns trigger language plpgsql as $$
begin
  if new.status = 'sent' and old.status in ('in_progress', 'redo') then new.admin_notified_at := null; end if;
  return new;
end $$;
create or replace function pv_push_on_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and old.status in ('in_progress', 'redo') then perform pv_push_poke('push-admin'); end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists pv_push_sent_reset on provider_visits;
create trigger pv_push_sent_reset before update on provider_visits for each row execute function pv_push_sent_reset();
drop trigger if exists pv_push_sent on provider_visits;
create trigger pv_push_sent after update on provider_visits for each row execute function pv_push_on_sent();

-- 9 · hourly: what was held outside the hours goes out (push-admin already has its hourly job)
select cron.unschedule(jobid) from cron.job where jobname = 'pv-push-tick';
select cron.schedule('pv-push-tick', '0 * * * *', $job$
  select net.http_post(
    url     := 'https://nqxsonmmcnmdastcpiff.supabase.co/functions/v1/push-pv',
    body    := '{"kind":"tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cc_push_secret')));
$job$);

-- 10 · who may call what
revoke all on function pv_admin_push_register(text, text, text) from public, anon, authenticated;
revoke all on function pv_push_register(text, text, text, text) from public, anon, authenticated;
revoke all on function pv_push_unregister(text, text) from public, anon, authenticated;
revoke all on function pv_push_day(date) from public, anon, authenticated;
revoke all on function pv_push_people(uuid, uuid) from public, anon, authenticated;
revoke all on function pv_push_poke(text) from public, anon, authenticated;
grant execute on function pv_admin_push_register(text, text, text) to authenticated;
grant execute on function pv_push_register(text, text, text, text) to anon, authenticated;
grant execute on function pv_push_unregister(text, text) to anon, authenticated;
