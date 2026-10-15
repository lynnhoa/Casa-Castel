-- ═══ PROVIDERS · BUILD 2 · guest link for one-time cleaners (no account) ═══
-- ⚠ 48h auto-approve here is SUPERSEDED by PROVIDERS-NO-AUTO.sql — if you re-run this file, run that one again afterwards.
-- Run AFTER Build 1. A guest = a hidden person (not in People) with a link code that ends 23:59 the next day.

-- 1 · guest columns
alter table provider_people add column if not exists is_guest boolean not null default false;
alter table provider_people add column if not exists guest_until timestamptz;
alter table provider_people add column if not exists guest_token text;
create unique index if not exists provider_people_guest_token_uq on provider_people (guest_token) where guest_token is not null;

create or replace function pv_is_guest(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select pp.is_guest from provider_people pp where pp.id = p), false)
$$;

-- 2 · who sees what: a guest only the own visit · guest visits stay out of the regulars' app
create or replace function pv_visible(v provider_visits, p uuid) returns boolean language sql stable as $$
  select case
    when p is null then true                                          -- Casa Castel sees everything
    when pv_is_guest(p) then v.person_id = p                          -- a guest: only the own visit
    when v.person_id is not null and pv_is_guest(v.person_id) then false
    else true end                                                     -- Fix 1+10: the job's visits
$$;

-- 3 · the link ends by itself
create or replace function pv_me(p_token text)
returns table(person_id uuid, person_name text, job_id uuid, job_name text, sends_invoices boolean)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select s.id as sid, s.last_seen, p.id as pid, p.name as pname, p.sends_invoices as si, j.id as jid, j.name as jname
    into r
  from provider_sessions s
  join provider_people p on p.id = s.person_id
  join providers j on j.id = p.job_id
  where s.token_hash = pv_hash(p_token) and s.revoked_at is null
    and p.login_on and p.switched_off_at is null and j.deleted_at is null
    and (not p.is_guest or p.guest_until > now());            -- Build 2: a guest link ends by itself
  if not found or coalesce(p_token, '') = '' then
    raise exception 'pv_auth' using errcode = 'P0001';
  end if;
  if r.last_seen < now() - interval '5 minutes' then
    update provider_sessions set last_seen = now() where id = r.sid;
  end if;
  return query select r.pid, r.pname, r.jid, r.jname, r.si;
end $$;

-- 4 · open the link (no password) · first name once
create or replace function pv_guest_open(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_people%rowtype; j providers%rowtype; tok text;
begin
  select * into p from provider_people where is_guest and guest_token = p_token and coalesce(p_token, '') <> '';
  if not found or p.guest_until <= now() or not p.login_on or p.switched_off_at is not null then
    return jsonb_build_object('error', 'expired');
  end if;
  select * into j from providers where id = p.job_id and deleted_at is null;
  if not found then return jsonb_build_object('error', 'expired'); end if;
  update provider_people set last_login = now() where id = p.id;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into provider_sessions (person_id, token_hash) values (p.id, pv_hash(tok));
  return jsonb_build_object('ok', true, 'token', tok, 'until', p.guest_until, 'named', p.name <> 'Gast',
    'person', jsonb_build_object('id', p.id, 'name', p.name),
    'job', jsonb_build_object('id', j.id, 'name', j.name));
end $$;

create or replace function pv_guest_name(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; n text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 30);
begin
  select * into me from pv_me(p_token);
  if not pv_is_guest(me.person_id) then return jsonb_build_object('error', 'not_guest'); end if;
  if n = '' then return jsonb_build_object('ok', true, 'name', me.person_name); end if;
  update provider_people set name = 'Gast · ' || n where id = me.person_id;
  return jsonb_build_object('ok', true, 'name', 'Gast · ' || n);
end $$;

-- 5 · your app: make / reuse the link (same link until someone opens it) · "Add as person"
create or replace function pv_admin_guest_link(p_job uuid, p_date date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_date, pv_today()); p provider_people%rowtype; vid uuid; tok text; l provider_lists;
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  if d < pv_today() then return jsonb_build_object('error', 'past'); end if;
  select pp.* into p from provider_people pp
   where pp.job_id = p_job and pp.is_guest and pp.last_login is null and pp.guest_until > now()
     and exists (select 1 from provider_visits v where v.person_id = pp.id and v.date = d and v.status = 'planned')
   order by pp.created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'token', p.guest_token, 'date', d, 'until', p.guest_until, 'reused', true);
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into provider_people (job_id, name, pass_hash, pass_readable, login_on, sends_invoices, is_guest, guest_until, guest_token)
  values (p_job, 'Gast', pv_hash('guest-' || tok), '', true, false, true, pv_at(d + 2), tok)
  returning * into p;
  l := pv_list_row(p_job, null);
  insert into provider_visits (job_id, date, at_time, person_id, list_id, lynn_changed_at)
  values (p_job, d, null, p.id, l.id, now()) returning id into vid;
  return jsonb_build_object('ok', true, 'token', tok, 'date', d, 'until', p.guest_until, 'visit', vid);
end $$;

create or replace function pv_admin_guest_promote(p_person uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_people set is_guest = false, guest_until = null, guest_token = null,
    name = coalesce(nullif(regexp_replace(name, '^Gast( · )?', ''), ''), 'Neue Person')
  where id = p_person and is_guest;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  update provider_sessions set revoked_at = now() where person_id = p_person and revoked_at is null;   -- logs in again with the new password
  return jsonb_build_object('ok', true);
end $$;

-- 6 · the guest's app: own visit + today's messages only
create or replace function pv_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; s jsonb; c jsonb; ph jsonb; mine_assigned boolean; other boolean; gs timestamptz; gc jsonb;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  s := pv_state_core(me.job_id, me.person_id);

  c := s->'card';
  if jsonb_typeof(c) = 'object' then
    other := coalesce(c->>'person_id' is not null and c->>'person_id' <> me.person_id::text, false);
    mine_assigned := not other;                                 -- own visit or "anyone"
    c := c || jsonb_build_object(
      'can_cancel', coalesce((c->>'can_cancel')::boolean, false) and mine_assigned,
      'other_person', other,
      'can_take_over', other and c->>'status' = 'planned' and c->>'started_at' is null
                       and (c->>'date')::date >= pv_today());
    c := pv_strip_other(c, me.person_id);
    if jsonb_typeof(c->'redo_other') = 'object' then
      c := jsonb_set(c, '{redo_other}', pv_strip_other(c->'redo_other', me.person_id));
    end if;
    s := jsonb_set(s, '{card}', c);
  end if;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into ph       -- "Gesendet" photo blocks: own visits only
  from jsonb_each(coalesce(s->'photos', '{}'::jsonb)) e(k, v) where pv_mine(k::uuid, me.person_id);
  s := jsonb_set(s, '{photos}', ph);

  if pv_is_guest(me.person_id) then                           -- Build 2 · a guest: own visit + today's messages only
    select created_at into gs from provider_people where id = me.person_id;
    select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into gc
      from jsonb_array_elements(coalesce(s->'chat', '[]'::jsonb)) with ordinality e(x, o)
     where x->>'person_id' = me.person_id::text
        or exists (select 1 from provider_visits v where v.id::text = x->>'visit_id' and v.person_id = me.person_id)
        or (x->>'person_id' is null and coalesce(x->>'kind', '') <> 'system' and (x->>'at')::timestamptz >= gs);
    s := jsonb_set(s, '{chat}', gc) || jsonb_build_object('reports', '[]'::jsonb);
  end if;

  return s || jsonb_build_object(
    'person', jsonb_build_object('id', me.person_id, 'name', me.person_name, 'sends_invoices', me.sends_invoices),
    'job', jsonb_build_object('id', me.job_id, 'name', me.job_name),
    'invoice_todo', case when me.sends_invoices then pv_invoice_todo(me.job_id, me.person_id) end);
end $$;

-- 7 · nightly: unused guest links disappear · a flagged guest visit waits for your decision
create or replace function pv_catch_up(p_job uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  -- window end, never started → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'planned' and (p_job is null or v.job_id = p_job) and not pv_is_guest(v.person_id)
      and now() >= pv_win_to(v.date, v.reopen_until)
      and exists (select 1 from providers j where j.id = v.job_id and j.deleted_at is null)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- window end, started + every point covered → sent (unplanned visits wait for Lynn, no 48 h)
  with t as (
    update provider_visits v set status = 'sent', sent_at = now(),
      auto_due_at = case when v.unplanned then null else now() + interval '48 hours' end, updated_at = now()
    where v.status = 'in_progress' and (p_job is null or v.job_id = p_job)
      and now() >= pv_win_to(v.date, v.reopen_until) and pv_visit_complete(v.id)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'sent', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- window end, started but incomplete → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'in_progress' and (p_job is null or v.job_id = p_job)
      and now() >= pv_win_to(v.date, v.reopen_until)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- 48 h untouched → Done (labelled like a manual Done)
  with t as (
    update provider_visits v set status = 'done', done_at = now(), auto_due_at = null, updated_at = now()
    where v.status = 'sent' and v.auto_due_at is not null and v.auto_due_at <= now()
      and (p_job is null or v.job_id = p_job)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'approved', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- redo deadline passed → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'redo' and v.redo_until is not null and not pv_is_guest(v.person_id) and now() >= greatest(pv_at(v.redo_until + 1), coalesce(v.reopen_until, '-infinity'::timestamptz))
      and (p_job is null or v.job_id = p_job)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

  -- Build 2 · a guest link nobody used: its visit disappears after the day (no "Missed"), the guest too
  delete from provider_visits v
   where v.status = 'planned' and v.started_at is null and (p_job is null or v.job_id = p_job)
     and now() >= pv_win_to(v.date, v.reopen_until) and pv_is_guest(v.person_id);
  delete from provider_people pp
   where pp.is_guest and pp.guest_until < now() and (p_job is null or pp.job_id = p_job)
     and not exists (select 1 from provider_visits v where v.person_id = pp.id or v.started_by = pp.id or v.sent_by = pp.id)
     and not exists (select 1 from provider_photos x where x.person_id = pp.id)
     and not exists (select 1 from provider_messages m where m.person_id = pp.id)
     and not exists (select 1 from provider_invoices i where i.uploaded_by = pp.id)
     and not exists (select 1 from provider_pw_requests r where r.person_id = pp.id)
     and not exists (select 1 from provider_visits v2 where v2.cancelled_person = pp.id);

  -- invoice mode switch reached its month
  update providers set invoice_mode = next_mode, next_mode = null, next_mode_from = null
  where next_mode is not null and next_mode_from <= pv_month_of(pv_today()) and (p_job is null or id = p_job);

  -- generator once per Berlin day per job
  if exists (select 1 from providers where deleted_at is null and (p_job is null or id = p_job)
             and generated_on is distinct from pv_today()) then
    perform pv_generate_visits(j.id) from providers j
      where j.deleted_at is null and (p_job is null or j.id = p_job) and j.generated_on is distinct from pv_today();
  end if;
  return n;
end $$;

-- 8 · Flag on a guest visit: redo possible while the link is valid
create or replace function pv_admin_flag(p_visit uuid, p_points jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; ok_keys jsonb;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'sent' then return jsonb_build_object('error', 'changed'); end if;
  if exists (select 1 from provider_months m where m.job_id = v.job_id and m.month = pv_month_of(v.date) and m.status = 'closed') then
    return jsonb_build_object('error', 'closed');           -- Fix 3: no Flag once the month is closed (like Undo)
  end if;
  select coalesce(jsonb_agg(pt.key), '[]'::jsonb) into ok_keys
  from pv_visit_points(v) pt where coalesce(p_points, '[]'::jsonb) ? pt.key;
  if jsonb_array_length(ok_keys) = 0 then return jsonb_build_object('error', 'points'); end if;
  update provider_visits set status = 'redo', flagged_steps = ok_keys, flag_note = left(nullif(trim(p_note), ''), 500),
    redo_at = now(), redo_until = case when pv_is_guest(v.person_id)          -- Build 2: a guest can redo while the link is valid
      then greatest((select (pp.guest_until at time zone 'Europe/Berlin')::date - 1 from provider_people pp where pp.id = v.person_id), pv_today())
      else pv_next_visit_day(v.job_id, v.id) end, auto_due_at = null, lynn_changed_at = now(), updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'redo', jsonb_build_object('date', v.date, 'n', jsonb_array_length(ok_keys)));
  return jsonb_build_object('ok', true);
end $$;

-- 9 · guests cannot start extra visits
create or replace function pv_start_unplanned(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; l provider_lists; vid uuid;
begin
  select * into me from pv_me(p_token);
  if pv_is_guest(me.person_id) then return jsonb_build_object('error', 'guest'); end if;   -- Build 2
  perform pv_catch_up(me.job_id);
  if exists (select 1 from provider_visits v where v.job_id = me.job_id and pv_visible(v, me.person_id)
             and v.status in ('planned', 'in_progress', 'redo') and pv_in_window(v)) then
    return jsonb_build_object('error', 'changed');
  end if;
  l := pv_list_row(me.job_id, null);
  insert into provider_visits (job_id, date, at_time, person_id, list_id, unplanned, status, started_at, started_by,
                               list_snapshot, spot_pick)
  values (me.job_id, pv_today(), date_trunc('minute', (now() at time zone 'Europe/Berlin'))::time, me.person_id, l.id, true,
          'in_progress', now(), me.person_id,
          jsonb_build_object('id', l.id, 'name', l.name, 'floors', coalesce(l.floors, '[]'::jsonb),
                             'spot_check', coalesce(l.spot_check, false), 'spot_size', l.spot_size),
          case when coalesce(l.spot_check, false) then pv_spot_pick(l.floors, l.spot_size) end)
  returning id into vid;
  return jsonb_build_object('ok', true, 'visit', vid);
end $$;

-- 10 · your People list knows who is a guest
create or replace function pv_admin_load(p_job uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; t date := pv_today(); res jsonb;
begin
  perform pv_admin_guard();
  perform pv_catch_up(null);
  select * into j from providers where deleted_at is null and (p_job is null or id = p_job) order by (id = p_job) desc, sort, lower(name) limit 1;
  if p_job is not null and j.id is distinct from p_job then
    select * into j from providers where deleted_at is null order by sort, lower(name) limit 1;
  end if;
  res := jsonb_build_object('ok', true, 'now', now(), 'today', t,
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'dot', pv_job_dot(x.id)) order by x.sort, lower(x.name)), '[]'::jsonb)
             from providers x where x.deleted_at is null));
  if j.id is null then return res || jsonb_build_object('job', null); end if;
  return res || jsonb_build_object(
    'job', jsonb_build_object('id', j.id, 'name', j.name, 'sort', j.sort,
      'invoice_mode', j.invoice_mode, 'mode_now', pv_mode_for(j.id, t), 'next_mode', j.next_mode, 'next_mode_from', j.next_mode_from,
      'sender_name', j.invoice_sender_name, 'sender_address', j.invoice_sender_address,
      'contract_path', j.contract_path, 'tell_tenants', j.tell_tenants,
      'locked_until', case when j.locked_until > now() then j.locked_until end,
      'ctrl_category_id', j.ctrl_category_id),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'phone', p.phone,
                  'password', p.pass_readable, 'login_on', p.login_on, 'sends_invoices', p.sends_invoices,
                  'last_login', p.last_login, 'switched_off_at', p.switched_off_at, 'created_at', p.created_at, 'is_guest', p.is_guest,
                  'has_history', exists (select 1 from provider_visits v where v.person_id = p.id or v.started_by = p.id or v.sent_by = p.id or v.cancelled_person = p.id)
                                 or exists (select 1 from provider_photos x where x.person_id = p.id)
                                 or exists (select 1 from provider_messages m where m.person_id = p.id)
                                 or exists (select 1 from provider_invoices i where i.uploaded_by = p.id))
                order by (p.switched_off_at is not null), p.created_at), '[]'::jsonb)
               from provider_people p where p.job_id = j.id),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'note', r.note,
                    'person_id', r.person_id, 'at', r.created_at) order by r.created_at), '[]'::jsonb)
                 from provider_pw_requests r where r.job_id = j.id and r.done_at is null),
    'lists', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.sort, l.created_at), '[]'::jsonb)
              from provider_lists l where l.job_id = j.id and l.deleted_at is null),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'visit_date', v.date,
                    'month', i.month, 'amount', i.amount, 'invoice_date', i.invoice_date, 'path', i.pdf_path, 'status', i.status,
                    'note', i.note, 'by', pp.name, 'at', i.created_at,
                    'month_visits', (select count(*) from provider_visits x where x.job_id = i.job_id and pv_month_of(x.date) = i.month
                                       and x.status in ('done', 'sent', 'redo'))) order by i.created_at), '[]'::jsonb)
                 from provider_invoices i left join provider_visits v on v.id = i.visit_id
                 left join provider_people pp on pp.id = i.uploaded_by
                 where i.job_id = j.id and i.status in ('to_check', 'returned')),
    'offen', pv_admin_offen(j.id),
    'state', pv_state_core(j.id, null));
end $$;

-- 11 · who may call what
revoke all on function pv_is_guest(uuid) from public, anon, authenticated;
revoke all on function pv_guest_open(text) from public, anon, authenticated;
revoke all on function pv_guest_name(text, text) from public, anon, authenticated;
revoke all on function pv_admin_guest_link(uuid, date) from public, anon, authenticated;
revoke all on function pv_admin_guest_promote(uuid) from public, anon, authenticated;
grant execute on function pv_guest_open(text) to anon, authenticated;
grant execute on function pv_guest_name(text, text) to anon, authenticated;
grant execute on function pv_admin_guest_link(uuid, date) to authenticated;
grant execute on function pv_admin_guest_promote(uuid) to authenticated;
