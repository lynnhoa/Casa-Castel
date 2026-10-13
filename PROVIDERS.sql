-- ═══════════════════════════════════════════════════════════════
--  PROVIDERS — complete database · Phases 1–6b · 13.10.2026
--  Supabase → SQL Editor → paste all → Run. Safe to run twice.
--
--  Creates only NEW things: 12 provider_* tables, the pv_* functions,
--  2 storage buckets, 2 cron jobs (pv-catch-up, pv-nightly) and the
--  seed (job Hausreinigung + list Normal, no person, no rhythm).
--  Nothing that exists today is changed. It all runs as ONE step:
--  if any line fails, nothing at all is saved.
-- ═══════════════════════════════════════════════════════════════

-- 0 · Read-only check of your existing cron jobs (map §10).
--     Lists them under "Messages"; stops before anything is created
--     if one of the two new job names is already taken by another job.
do $$
declare r record; clash text := '';
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not found - the catch-up on every app open keeps everything correct.';
    return;
  end if;
  for r in execute 'select jobname, schedule, command from cron.job order by jobname' loop
    raise notice 'existing cron job: % | % | %', r.jobname, r.schedule, left(r.command, 70);
    if r.jobname in ('pv-catch-up', 'pv-nightly') and position('pv_' in r.command) = 0 then
      clash := clash || r.jobname || ' ';
    end if;
  end loop;
  if clash <> '' then
    raise exception 'STOP - cron job name already used by another job: %. Nothing was created. Send this message to Claude.', clash;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 1 · TABLES (12)
-- ═══════════════════════════════════════════════════════════════

-- Jobs (one tab in both apps)
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  sort int not null default 0,
  invoice_mode text not null default 'per_visit' check (invoice_mode in ('per_visit','monthly','none')),
  next_mode text check (next_mode in ('per_visit','monthly','none')),
  next_mode_from date,                                   -- 1st of the month the next mode starts
  mode_history jsonb not null default '[]'::jsonb,       -- [{from:'YYYY-MM-01', mode}] → mode of any month
  invoice_sender_name text,
  invoice_sender_address text,
  contract_path text,                                    -- provider-invoices/contracts/…
  tell_tenants boolean not null default false,
  failed_logins int not null default 0,
  locked_until timestamptz,
  generated_on date,                                     -- visit generator ran (Berlin day)
  created_at timestamptz not null default now(),
  deleted_at timestamptz                                 -- soft delete (invoices are kept)
);
create unique index if not exists providers_name_uq on providers (lower(trim(name))) where deleted_at is null;
alter table providers add column if not exists ctrl_category_id text;   -- Phase 6: Controlling cost type of this job

-- People of a job (the password IS the identity)
create table if not exists provider_people (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  phone text,
  pass_hash text not null,                               -- sha256 of the lower-case password
  pass_readable text not null,                           -- only Lynn's login can read it
  login_on boolean not null default true,
  sends_invoices boolean not null default false,
  last_login timestamptz,
  switched_off_at timestamptz,
  created_at timestamptz not null default now(),
  constraint provider_people_pw_uq unique (job_id, pass_hash)
);
create index if not exists provider_people_job_idx on provider_people (job_id);

-- Phone logins (token stored hashed; revoked = that phone is out)
create table if not exists provider_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references provider_people(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists provider_sessions_person_idx on provider_sessions (person_id);

-- "Passwort vergessen?" requests → yellow banner in People
create table if not exists provider_pw_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  name text not null,
  note text,
  person_id uuid references provider_people(id) on delete set null,   -- matched by name
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists provider_pw_requests_open_idx on provider_pw_requests (job_id) where done_at is null;

-- Putzlisten. floors = [{key,label,room_de,room_en,zone,stairs,
--   steps:[{key,de,en,ins_de,ins_en,pic,zone,photo:'off'|'required'|'optional',hint_de,hint_en,bins,
--           points:[{key,de,en,pic?}]}],
--   block:{surfaces,vacuum,mop,photo:null|{key,de,en,pic,zone,mode}}}]
-- Camera order = floors → steps → points → floor-block photo. WC pictures (wc, guestwc) are always in a spot check.
create table if not exists provider_lists (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort int not null default 0,
  floors jsonb not null default '[]'::jsonb,
  spot_check boolean not null default false,
  spot_size int not null default 6 check (spot_size between 1 and 50),
  house_info jsonb not null default '{}'::jsonb,          -- {access:{de,en}, supplies:{de,en}, emergency:{de,en}}
  muell_pdf_path text,                                    -- 'static:pv-muell-plan.pdf' or provider-proofs/lists/…
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists provider_lists_job_idx on provider_lists (job_id);

-- Rhythms (weeks or months, every N)
create table if not exists provider_rhythms (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  unit text not null default 'week' check (unit in ('week','month')),
  every_n int not null default 1 check (every_n between 1 and 52),
  weekday int not null check (weekday between 1 and 7),  -- 1 = Monday … 7 = Sunday
  week_of_month int check (week_of_month between 1 and 5),
  at_time time,
  start_date date not null,
  person_id uuid references provider_people(id) on delete set null,   -- null = anyone
  list_id uuid references provider_lists(id) on delete set null,      -- null = first list
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_rhythms_job_idx on provider_rhythms (job_id);

-- Pauses (win over rhythms)
create table if not exists provider_pauses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  created_at timestamptz not null default now(),
  constraint provider_pauses_range check (to_date >= from_date)
);

-- Visits — status machine (map §9):
-- planned · in_progress · sent · done · redo · missed · cancelled (Lynn / pause, sand)
-- · cancelled_by_provider (red) · rejected (unplanned, not counted)
create table if not exists provider_visits (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  date date not null,
  at_time time,
  person_id uuid references provider_people(id) on delete set null,   -- null = anyone
  list_id uuid references provider_lists(id) on delete set null,
  list_snapshot jsonb,                                   -- copied at the first photo (pv_start)
  spot_pick jsonb,                                       -- point keys of a spot check (server pick)
  extra_task jsonb,                                      -- {key,de,en,photo}
  status text not null default 'planned' check (status in
    ('planned','in_progress','sent','done','redo','missed','cancelled','cancelled_by_provider','rejected')),
  rhythm_id uuid references provider_rhythms(id) on delete set null,       -- null when moved / extra
  slot_rhythm_id uuid references provider_rhythms(id) on delete set null,  -- the slot it came from (never regenerated)
  slot_date date,
  unplanned boolean not null default false,
  cancelled_by text check (cancelled_by in ('lynn','pause','provider')),
  cancel_reason text,
  cancel_note text,
  cancelled_at timestamptz,
  cancelled_person uuid references provider_people(id) on delete set null,
  lynn_changed_at timestamptz,
  moved_from date,
  flagged_steps jsonb,                                   -- point keys Lynn flagged (redo)
  flag_note text,
  started_at timestamptz,
  started_by uuid references provider_people(id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references provider_people(id) on delete set null,
  done_at timestamptz,
  redo_at timestamptz,
  missed_at timestamptz,
  rejected_at timestamptz,
  auto_due_at timestamptz,                               -- sent + 48 h → done (cleared by Undo / Unflag)
  redo_until date,                                       -- next visit day, then Missed
  reopen_until timestamptz,                              -- Reopen: 24 h photo window
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_visits_job_date_idx on provider_visits (job_id, date);
create index if not exists provider_visits_open_idx on provider_visits (status) where status in ('planned','in_progress','sent','redo');
create unique index if not exists provider_visits_slot_uq on provider_visits (slot_rhythm_id, slot_date) where slot_rhythm_id is not null;

-- Proof photos (server time = received_at)
create table if not exists provider_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references provider_visits(id) on delete cascade,
  point_key text not null,
  person_id uuid references provider_people(id) on delete set null,
  path text,                                             -- provider-proofs: visit_id/…jpg (null = nicht möglich)
  received_at timestamptz not null default now(),
  taken_at_client timestamptz,
  np_reason text check (np_reason in ('besetzt','kaputt','anderes')),
  np_note text,
  kind text not null default 'normal' check (kind in ('normal','extra','damage','redo')),
  superseded boolean not null default false,
  file_deleted_at timestamptz                            -- 12-month clean-up removed the file
);
create index if not exists provider_photos_visit_idx on provider_photos (visit_id, point_key);

-- Chat + system lines + supplies / damage reports (person_id null = Casa Castel or system)
create table if not exists provider_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete cascade,
  visit_id uuid references provider_visits(id) on delete set null,
  person_id uuid references provider_people(id) on delete set null,
  kind text not null check (kind in ('text','photo','system','supplies','damage')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted boolean not null default false,
  acked_at timestamptz
);
create index if not exists provider_messages_job_idx on provider_messages (job_id, created_at);

-- Invoices (never auto-deleted · month = month of the visit)
create table if not exists provider_invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete restrict,
  visit_id uuid references provider_visits(id) on delete set null,   -- null = monthly invoice
  month date not null check (extract(day from month) = 1),
  amount numeric(10,2) not null check (amount >= 0),
  invoice_date date not null,
  pdf_path text not null,
  uploaded_by uuid references provider_people(id) on delete set null,  -- null = Lynn
  status text not null default 'to_check' check (status in ('to_check','checked','returned','replaced')),
  note text,
  superseded_by uuid references provider_invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  returned_at timestamptz
);
create index if not exists provider_invoices_job_month_idx on provider_invoices (job_id, month);

-- Months (close → Controlling Soll; paid ✓ comes back from Controlling)
create table if not exists provider_months (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references providers(id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  status text not null default 'open' check (status in ('open','closed','reopened')),
  closed_sum numeric(10,2),
  closed_at timestamptz,
  confirmed_paid_at timestamptz,
  changed_after_confirmation boolean not null default false,
  constraint provider_months_uq unique (job_id, month)
);


-- ═══════════════════════════════════════════════════════════════
-- 2 · ACCESS — your login only (like your other management apps).
--     Providers never read a table: everything goes through pv_* functions.
-- ═══════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['providers','provider_people','provider_sessions','provider_pw_requests','provider_lists',
    'provider_rhythms','provider_pauses','provider_visits','provider_photos','provider_messages','provider_invoices','provider_months'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'pv_owner_all') then
      execute format('create policy pv_owner_all on %I for all to authenticated using (true) with check (true)', t);
    end if;
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pv_point') then
    create type pv_point as (n int, key text, floor_label text, room_de text, room_en text, step_key text,
      step_de text, step_en text, de text, en text, pic text, zone text, mode text,
      hint_de text, hint_en text, is_wc boolean, is_extra boolean);
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 3 · HELPERS (all clocks Europe/Berlin)
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_today() returns date language sql stable
as $$ select (now() at time zone 'Europe/Berlin')::date $$;

create or replace function pv_at(d date) returns timestamptz language sql stable   -- 00:00 Berlin of that day
as $$ select (d::timestamp at time zone 'Europe/Berlin') $$;

create or replace function pv_month_of(d date) returns date language sql immutable
as $$ select date_trunc('month', d)::date $$;

create or replace function pv_hash(t text) returns text language sql immutable
as $$ select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex') $$;

create or replace function pv_norm_pw(t text) returns text language sql immutable
as $$ select lower(trim(coalesce(t, ''))) $$;

-- photo window: day before 00:00 → day after 23:59 · a reopened visit stays open until reopen_until
create or replace function pv_win_from(d date) returns timestamptz language sql stable
as $$ select pv_at(d - 1) $$;
create or replace function pv_win_to(d date, reopen timestamptz) returns timestamptz language sql stable
as $$ select greatest(pv_at(d + 2), coalesce(reopen, '-infinity'::timestamptz)) $$;
create or replace function pv_in_window(v provider_visits) returns boolean language sql stable
as $$ select now() >= pv_win_from(v.date) and now() < pv_win_to(v.date, v.reopen_until) $$;

create or replace function pv_admin_guard() returns void language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'pv_admin_only' using errcode = '42501'; end if;
end $$;

-- The provider's phone: token → person + job (raises pv_auth → the app logs out)
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
    and p.login_on and p.switched_off_at is null and j.deleted_at is null;
  if not found or coalesce(p_token, '') = '' then
    raise exception 'pv_auth' using errcode = 'P0001';
  end if;
  if r.last_seen < now() - interval '5 minutes' then
    update provider_sessions set last_seen = now() where id = r.sid;
  end if;
  return query select r.pid, r.pname, r.jid, r.jname, r.si;
end $$;

-- invoice mode of a month (history-safe)
create or replace function pv_mode_for(p_job uuid, p_month date) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e->>'mode' from providers j, jsonb_array_elements(j.mode_history) e
      where j.id = p_job and (e->>'from')::date <= pv_month_of(p_month)
      order by (e->>'from')::date desc limit 1),
    (select invoice_mode from providers where id = p_job))
$$;

-- All photo points of a list (+ the extra task), numbered in camera order
create or replace function pv_points(p_floors jsonb, p_extra jsonb default null)
returns setof pv_point language sql immutable as $$
  with fl as (
    select f.value as f, f.ordinality as fi
    from jsonb_array_elements(case when jsonb_typeof(p_floors) = 'array' then p_floors else '[]'::jsonb end) with ordinality f
  ), pts as (
    select fl.fi, s.ordinality as si, p.ordinality as pi,
      p.value->>'key' as key, fl.f->>'label' as floor_label, fl.f->>'room_de' as room_de, fl.f->>'room_en' as room_en,
      s.value->>'key' as step_key, s.value->>'de' as step_de, s.value->>'en' as step_en,
      coalesce(nullif(p.value->>'de', ''), s.value->>'de') as de, coalesce(nullif(p.value->>'en', ''), s.value->>'en') as en,
      coalesce(p.value->>'pic', s.value->>'pic') as pic, coalesce(s.value->>'zone', fl.f->>'zone') as zone,
      s.value->>'photo' as mode, s.value->>'hint_de' as hint_de, s.value->>'hint_en' as hint_en,
      coalesce(s.value->>'pic', '') in ('wc', 'guestwc') as is_wc
    from fl
    cross join lateral jsonb_array_elements(case when jsonb_typeof(fl.f->'steps') = 'array' then fl.f->'steps' else '[]'::jsonb end) with ordinality s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value->'points') = 'array' then s.value->'points' else '[]'::jsonb end) with ordinality p
    where coalesce(s.value->>'photo', 'off') in ('required', 'optional')
    union all
    select fl.fi, 1000000, 1, fl.f->'block'->'photo'->>'key', fl.f->>'label', fl.f->>'room_de', fl.f->>'room_en',
      null::text, 'Oberflächen sauber machen', 'Clean surfaces',
      coalesce(fl.f->'block'->'photo'->>'de', fl.f->>'room_de'), coalesce(fl.f->'block'->'photo'->>'en', fl.f->>'room_en'),
      coalesce(fl.f->'block'->'photo'->>'pic', 'surfaces'), coalesce(fl.f->'block'->'photo'->>'zone', 'c'),
      coalesce(fl.f->'block'->'photo'->>'mode', 'required'), null::text, null::text, false
    from fl where jsonb_typeof(fl.f->'block'->'photo') = 'object'
  ), base as (
    select (row_number() over (order by fi, si, pi))::int as n, key, floor_label, room_de, room_en, step_key, step_de, step_en,
      de, en, pic, zone, mode, hint_de, hint_en, is_wc, false as is_extra
    from pts where coalesce(key, '') <> ''
  )
  select (b.*)::pv_point from base b
  union all
  select ((select coalesce(max(n), 0) from base) + 1, coalesce(nullif(p_extra->>'key', ''), 'extra-task'), null, null, null, null,
          'Extra heute', 'Extra today', p_extra->>'de', p_extra->>'en', 'extra', 'x', 'required', null, null, false, true)::pv_point
  where jsonb_typeof(p_extra) = 'object' and coalesce(p_extra->>'photo', 'false') = 'true'
$$;

-- the list a visit uses: its own, else the job's first list
create or replace function pv_list_row(p_job uuid, p_list uuid) returns provider_lists
language sql stable security definer set search_path = public as $$
  select l.* from provider_lists l where l.job_id = p_job and l.deleted_at is null
  order by (l.id = p_list) desc, l.sort, l.created_at limit 1
$$;

-- the points of THIS visit: snapshot after the first photo, else the current list · spot check applied
create or replace function pv_visit_points(v provider_visits) returns setof pv_point
language sql stable security definer set search_path = public as $$
  select pt.* from pv_points(
      coalesce(v.list_snapshot->'floors', (pv_list_row(v.job_id, v.list_id)).floors, '[]'::jsonb),
      v.extra_task) pt
  where v.spot_pick is null or pt.is_extra or pt.mode <> 'required' or (v.spot_pick ? pt.key)
$$;

-- every required point has a photo or "nicht möglich" (a redo needs the flagged ones new)
create or replace function pv_visit_complete(p_visit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from provider_visits v cross join lateral pv_visit_points(v) pt
    where v.id = p_visit and pt.mode = 'required'
      and not exists (
        select 1 from provider_photos x
        where x.visit_id = v.id and x.point_key = pt.key and not x.superseded
          and (x.path is not null or x.np_reason is not null)
          and (v.status <> 'redo' or not (coalesce(v.flagged_steps, '[]'::jsonb) ? pt.key) or x.received_at > v.redo_at))
  )
$$;

-- server-side spot check: all WCs + N random of the other required points
create or replace function pv_spot_pick(p_floors jsonb, p_size int) returns jsonb language sql volatile as $$
  select coalesce(jsonb_agg(key), '[]'::jsonb) from (
    select key from pv_points(p_floors, null) where mode = 'required' and is_wc
    union all
    (select key from pv_points(p_floors, null) where mode = 'required' and not is_wc order by random() limit greatest(p_size, 0))
  ) s
$$;

-- who sees a visit: Lynn (p = null) sees all; a person sees hers + "anyone" + those she worked on
create or replace function pv_visible(v provider_visits, p uuid) returns boolean language sql stable as $$
  select p is null or v.person_id is null or v.person_id = p or v.started_by = p or v.sent_by = p or v.cancelled_person = p
$$;

-- which visit the card shows (1 = in the photo window, 2 = open redo, 3 = window's visit in any state, 4 = next one)
create or replace function pv_focus_rank(v provider_visits) returns int language sql stable as $$
  select case
    when v.status in ('planned', 'in_progress') and pv_in_window(v) then 1
    when v.status = 'redo' then 2
    when v.status in ('sent', 'done', 'missed', 'cancelled_by_provider', 'rejected') and pv_in_window(v) then 3
    when v.date > pv_today() and v.status in ('planned', 'cancelled_by_provider') then 4
    else 9 end
$$;

-- neutral system line in the shared history / chat
create or replace function pv_sys(p_job uuid, p_visit uuid, p_code text, p_extra jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into provider_messages (job_id, visit_id, kind, payload)
  values (p_job, p_visit, 'system', jsonb_build_object('code', p_code) || coalesce(p_extra, '{}'::jsonb))
$$;

-- "next visit day" for a redo (else 7 days)
create or replace function pv_next_visit_day(p_job uuid, p_visit uuid) returns date language sql stable security definer set search_path = public as $$
  select coalesce(
    (select min(date) from provider_visits where job_id = p_job and id <> p_visit and status = 'planned' and date >= pv_today()),
    pv_today() + 7)
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4 · PLANNING ENGINE: generator (12 weeks ahead) + pauses
-- ═══════════════════════════════════════════════════════════════

-- the dates of one rhythm between two days (weeks: every N weeks · months: same weekday + week of month)
create or replace function pv_rhythm_dates(r provider_rhythms, p_from date, p_to date) returns setof date
language plpgsql stable as $$
declare first date; m date; d date; k int := 0; w int;
begin
  first := r.start_date + ((r.weekday - extract(isodow from r.start_date)::int + 7) % 7);
  if r.unit = 'week' then
    return query select g::date from generate_series(first::timestamp, p_to::timestamp, make_interval(days => 7 * r.every_n)) g
                 where g::date >= p_from;
    return;
  end if;
  w := coalesce(r.week_of_month, ((extract(day from first)::int - 1) / 7) + 1);
  loop
    m := (date_trunc('month', first) + make_interval(months => k * r.every_n))::date;
    exit when m > p_to;
    d := m + ((r.weekday - extract(isodow from m)::int + 7) % 7) + (w - 1) * 7;
    if extract(month from d) <> extract(month from m) then d := d - 7; end if;   -- no 5th weekday → the last one
    if d >= p_from and d <= p_to and d >= first then return next d; end if;
    k := k + 1;
    exit when k > 600;
  end loop;
end $$;

create or replace function pv_in_pause(p_job uuid, d date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from provider_pauses where job_id = p_job and d between from_date and to_date)
$$;

-- materialises every active rhythm 12 weeks ahead (a slot that existed once is never made again)
create or replace function pv_generate_visits(p_job uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare r provider_rhythms%rowtype; d date; t date := pv_today(); n int := 0; c int;
begin
  for r in
    select x.* from provider_rhythms x join providers j on j.id = x.job_id
    where x.active and j.deleted_at is null and (p_job is null or x.job_id = p_job)
  loop
    for d in select * from pv_rhythm_dates(r, greatest(t, r.start_date), t + 84) loop
      insert into provider_visits (job_id, date, at_time, person_id, list_id, rhythm_id, slot_rhythm_id, slot_date,
                                   status, cancelled_by, cancel_reason, cancelled_at)
      select r.job_id, d, r.at_time, r.person_id, r.list_id, r.id, r.id, d,
             case when pv_in_pause(r.job_id, d) then 'cancelled' else 'planned' end,
             case when pv_in_pause(r.job_id, d) then 'pause' end,
             case when pv_in_pause(r.job_id, d) then 'pause' end,
             case when pv_in_pause(r.job_id, d) then now() end
      on conflict (slot_rhythm_id, slot_date) where slot_rhythm_id is not null do nothing;
      get diagnostics c = row_count; n := n + c;
    end loop;
  end loop;
  update providers set generated_on = t where deleted_at is null and (p_job is null or id = p_job);
  return n;
end $$;

-- pause wins over rhythms: rhythm visits inside a pause → sand; outside again → planned
create or replace function pv_apply_pauses(p_job uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update provider_visits v set status = 'cancelled', cancelled_by = 'pause', cancel_reason = 'pause', cancelled_at = now(), updated_at = now()
  where v.job_id = p_job and v.status = 'planned' and v.rhythm_id is not null and v.started_at is null
    and v.date >= pv_today() and pv_in_pause(p_job, v.date);
  get diagnostics n = row_count;
  update provider_visits v set status = 'planned', cancelled_by = null, cancel_reason = null, cancelled_at = null, updated_at = now()
  where v.job_id = p_job and v.status = 'cancelled' and v.cancelled_by = 'pause'
    and v.date >= pv_today() and not pv_in_pause(p_job, v.date);
  return n;
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 5 · CATCH-UP — every timed rule; runs from cron AND on every app open
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_catch_up(p_job uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int;
begin
  -- window end, never started → Missed
  with t as (
    update provider_visits v set status = 'missed', missed_at = now(), updated_at = now()
    where v.status = 'planned' and (p_job is null or v.job_id = p_job)
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
    where v.status = 'redo' and v.redo_until is not null and now() >= pv_at(v.redo_until + 1)
      and (p_job is null or v.job_id = p_job)
    returning v.id, v.job_id, v.date)
  insert into provider_messages (job_id, visit_id, kind, payload)
  select job_id, id, 'system', jsonb_build_object('code', 'missed', 'date', date) from t;
  get diagnostics c = row_count; n := n + c;

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

create or replace function pv_catch_up_all() returns int language sql security definer set search_path = public
as $$ select pv_catch_up(null) $$;

create or replace function pv_nightly() returns int language plpgsql security definer set search_path = public as $$
begin
  perform pv_generate_visits(null);
  return pv_catch_up(null);
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 6 · PROVIDER LOGIN (service.html · /providers)
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_jobs() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort, lower(name)), '[]'::jsonb)
  from providers where deleted_at is null
$$;

-- job + password → person + token · 5 wrong per job → 10 min pause
create or replace function pv_login(p_job uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; p provider_people%rowtype; tok text; pw text := pv_norm_pw(p_password);
begin
  select * into j from providers where id = p_job and deleted_at is null for update;
  if not found then return jsonb_build_object('error', 'job'); end if;
  if j.locked_until is not null and j.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'minutes', greatest(1, ceil(extract(epoch from (j.locked_until - now())) / 60)::int));
  end if;
  if pw <> '' then
    select * into p from provider_people where job_id = j.id and pass_hash = pv_hash(pw);
  end if;
  if pw = '' or p.id is null then
    if j.failed_logins + 1 >= 5 then
      update providers set failed_logins = 0, locked_until = now() + interval '10 minutes' where id = j.id;
      return jsonb_build_object('error', 'locked', 'minutes', 10);
    end if;
    update providers set failed_logins = failed_logins + 1 where id = j.id;
    return jsonb_build_object('error', 'wrong', 'left', 5 - (j.failed_logins + 1));
  end if;
  if not p.login_on or p.switched_off_at is not null then
    return jsonb_build_object('error', 'off');
  end if;
  update providers set failed_logins = 0, locked_until = null where id = j.id;
  update provider_people set last_login = now() where id = p.id;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into provider_sessions (person_id, token_hash) values (p.id, pv_hash(tok));
  return jsonb_build_object('ok', true, 'token', tok,
    'person', jsonb_build_object('id', p.id, 'name', p.name),
    'job', jsonb_build_object('id', j.id, 'name', j.name));
end $$;

create or replace function pv_logout(p_token text) returns text
language plpgsql security definer set search_path = public as $$
begin
  update provider_sessions set revoked_at = now() where token_hash = pv_hash(p_token) and revoked_at is null;
  return 'ok';
end $$;

-- light check while the app is open (raises pv_auth when this phone was logged out)
create or replace function pv_ping(p_token text) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform pv_me(p_token);
  return 'ok';
end $$;

-- "Passwort vergessen?" → request (no login needed)
create or replace function pv_request_password(p_job uuid, p_name text, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; n text := trim(coalesce(p_name, '')); nt text := nullif(trim(coalesce(p_note, '')), ''); pid uuid;
begin
  select * into j from providers where id = p_job and deleted_at is null;
  if not found or n = '' or length(n) > 40 or length(coalesce(nt, '')) > 300 then return 'invalid'; end if;
  if exists (select 1 from provider_pw_requests where job_id = j.id and lower(name) = lower(n) and done_at is null) then return 'open'; end if;
  if (select count(*) from provider_pw_requests where job_id = j.id and created_at > now() - interval '24 hours') >= 10 then return 'limit'; end if;
  select id into pid from provider_people where job_id = j.id and lower(trim(name)) = lower(n)
    order by (switched_off_at is null) desc, created_at desc limit 1;
  insert into provider_pw_requests (job_id, name, note, person_id) values (j.id, n, nt, pid);
  return 'ok';
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 7 · ONE COMBINED LOAD per screen (strip · card · list · chat · reports · invoices)
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_visit_json(v provider_visits, p_full boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jsonb; pts jsonb; ex jsonb; c record; lst provider_lists; exp int;
begin
  j := jsonb_build_object(
    'id', v.id, 'date', v.date, 'time', to_char(v.at_time, 'HH24:MI'), 'status', v.status, 'unplanned', v.unplanned,
    'person_id', v.person_id, 'person', (select name from provider_people where id = v.person_id),
    'list_id', v.list_id, 'rhythm_id', v.rhythm_id, 'moved_from', v.moved_from,
    'cancelled_by', v.cancelled_by, 'cancel_reason', v.cancel_reason, 'cancel_note', v.cancel_note,
    'cancelled_person', (select name from provider_people where id = v.cancelled_person),
    'lynn_changed', v.lynn_changed_at is not null and (v.cancelled_at is null or v.lynn_changed_at > v.cancelled_at),
    'started_at', v.started_at, 'sent_at', v.sent_at, 'done_at', v.done_at, 'missed_at', v.missed_at,
    'first_photo_at', (select min(received_at) from provider_photos where visit_id = v.id),
    'last_photo_at', (select max(received_at) from provider_photos where visit_id = v.id));
  if not p_full then return j; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'n', pt.n, 'key', pt.key, 'floor', pt.floor_label, 'room_de', pt.room_de, 'room_en', pt.room_en,
      'step_de', pt.step_de, 'step_en', pt.step_en, 'de', pt.de, 'en', pt.en, 'pic', pt.pic, 'zone', pt.zone,
      'mode', pt.mode, 'hint_de', pt.hint_de, 'hint_en', pt.hint_en, 'wc', pt.is_wc, 'extra', pt.is_extra,
      'path', ph.path, 'np', ph.np_reason, 'np_note', ph.np_note, 'at', ph.received_at,
      'by', (select name from provider_people where id = ph.person_id),
      'flagged', coalesce(v.flagged_steps, '[]'::jsonb) ? pt.key,
      'redone', v.redo_at is not null and ph.received_at > v.redo_at) order by pt.n), '[]'::jsonb)
    into pts
  from pv_visit_points(v) pt
  left join lateral (select x.* from provider_photos x where x.visit_id = v.id and x.point_key = pt.key and not x.superseded
                     order by x.received_at desc limit 1) ph on true;

  select count(*) filter (where p->>'mode' = 'required') as total,
         count(*) filter (where p->>'mode' = 'required' and p->>'path' is not null and (v.status <> 'redo' or not (p->>'flagged')::boolean or (p->>'redone')::boolean)) as done,
         count(*) filter (where p->>'mode' = 'required' and p->>'np' is not null and (v.status <> 'redo' or not (p->>'flagged')::boolean or (p->>'redone')::boolean)) as np
    into c from jsonb_array_elements(pts) p;

  exp := c.total;
  if v.list_snapshot is null then                                     -- planned + spot check: count = N + all WCs
    lst := pv_list_row(v.job_id, v.list_id);
    if lst.spot_check then
      select least(lst.spot_size, count(*) filter (where mode = 'required' and not is_wc and not is_extra))
             + count(*) filter (where mode = 'required' and (is_wc or is_extra))
        into exp from pv_points(lst.floors, v.extra_task);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', x.point_key, 'kind', x.kind, 'path', x.path, 'at', x.received_at,
           'by', (select name from provider_people where id = x.person_id)) order by x.received_at), '[]'::jsonb)
    into ex from provider_photos x where x.visit_id = v.id and x.kind in ('extra', 'damage') and not x.superseded;

  return j || jsonb_build_object(
    'extra_task', v.extra_task, 'flagged', coalesce(v.flagged_steps, '[]'::jsonb), 'flag_note', v.flag_note,
    'redo_until', v.redo_until, 'auto_due_at', v.auto_due_at, 'reopen_until', v.reopen_until,
    'window', jsonb_build_object('from', pv_win_from(v.date), 'to', pv_win_to(v.date, v.reopen_until), 'open', pv_in_window(v)),
    'spot', v.spot_pick is not null or (v.list_snapshot is null and coalesce(lst.spot_check, false)),
    'points', pts, 'extras', ex,
    'counts', jsonb_build_object('total', exp, 'done', c.done, 'np', c.np, 'left', greatest(exp - c.done - c.np, 0)),
    'list_name', coalesce(v.list_snapshot->>'name', (pv_list_row(v.job_id, v.list_id)).name));
end $$;

-- the whole screen for one job (p_person = the provider; null = Lynn / preview of "anyone")
create or replace function pv_state_core(p_job uuid, p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t date := pv_today();
  f provider_visits%rowtype;
  redo_other provider_visits%rowtype;
  strip jsonb; card jsonb; lst provider_lists; list_j jsonb; chat jsonb; photos jsonb; reports jsonb; inv jsonb;
  prev_date date; from_ts timestamptz; last_m date := pv_month_of(pv_month_of(t) - 1);
begin
  select v.* into f from provider_visits v
  where v.job_id = p_job and pv_visible(v, p_person) and pv_focus_rank(v) < 9
  order by pv_focus_rank(v), (v.date = t) desc, v.date, v.at_time nulls last, v.created_at
  limit 1;

  -- strip: 2 before · focus (or today) · 2 after
  with vis as (
    select v as r, v.id, v.date, row_number() over (order by v.date, v.at_time nulls first, v.created_at) as rn
    from provider_visits v where v.job_id = p_job and pv_visible(v, p_person) and v.date between t - 400 and t + 400
  ), c as (
    select coalesce((select rn from vis where id = f.id), (select min(rn) from vis where date >= t), (select max(rn) + 1 from vis), 1) as rn
  )
  select coalesce(jsonb_agg(pv_visit_json(vis.r, false) || jsonb_build_object('focus', coalesce(vis.id = f.id, false))
           order by vis.rn), '[]'::jsonb)
    into strip from vis, c where vis.rn between c.rn - 2 and c.rn + 2;

  if f.id is not null then
    card := pv_visit_json(f, true);
    if f.status <> 'redo' then                                         -- a redo still open on a new visit's day → red strip
      select v.* into redo_other from provider_visits v
      where v.job_id = p_job and v.status = 'redo' and v.id <> f.id and pv_visible(v, p_person) order by v.date limit 1;
      if redo_other.id is not null then card := card || jsonb_build_object('redo_other', pv_visit_json(redo_other, true)); end if;
    end if;
    card := card || jsonb_build_object(
      'can_cancel', f.status = 'planned' and f.started_at is null and f.date >= t and pv_focus_rank(f) in (1, 4),
      'can_undo_cancel', f.status = 'cancelled_by_provider' and f.date >= t
                         and not (f.lynn_changed_at is not null and f.lynn_changed_at > f.cancelled_at),
      'last_visit', (select jsonb_build_object('date', x.date, 'status', x.status) from provider_visits x
                     where x.job_id = p_job and pv_visible(x, p_person) and x.date < f.date
                       and x.status not in ('cancelled', 'planned') order by x.date desc limit 1));
  end if;

  -- the list for "Putzliste ansehen" (running visit = its snapshot; house info + Müll-Plan always current)
  lst := pv_list_row(p_job, f.list_id);
  if lst.id is not null then
    list_j := jsonb_build_object('id', lst.id, 'name', lst.name,
      'floors', coalesce(f.list_snapshot->'floors', lst.floors), 'house_info', lst.house_info,
      'muell', lst.muell_pdf_path, 'spot_check', lst.spot_check, 'spot_size', lst.spot_size);
  end if;

  -- chat: current + previous visit (~4 weeks)
  prev_date := (select max(x.date) from provider_visits x where x.job_id = p_job and x.date < coalesce(f.date, t)
                and x.status not in ('planned', 'cancelled', 'cancelled_by_provider'));
  from_ts := pv_at(coalesce(prev_date, t - 28) - 1);
  select coalesce(jsonb_agg(m.j order by m.created_at), '[]'::jsonb) into chat from (
    select x.created_at, jsonb_build_object('id', x.id, 'kind', x.kind, 'at', x.created_at, 'visit_id', x.visit_id,
             'person_id', x.person_id, 'payload', x.payload, 'acked', x.acked_at is not null,
             'name', case when x.kind = 'system' then null when x.person_id is null then 'Casa Castel' else p.name end) as j
    from provider_messages x left join provider_people p on p.id = x.person_id
    where x.job_id = p_job and not x.deleted and x.created_at >= from_ts
    order by x.created_at desc limit 200) m;

  -- photos of the visits sent inside the chat window (the "Gesendet" blocks)
  select coalesce(jsonb_object_agg(v.id, (select coalesce(jsonb_agg(jsonb_build_object(
             'n', pt->>'n', 'key', pt->>'key', 'de', pt->>'de', 'en', pt->>'en', 'pic', pt->>'pic', 'zone', pt->>'zone',
             'path', pt->>'path', 'np', pt->>'np', 'by', pt->>'by', 'flagged', pt->'flagged') order by (pt->>'n')::int), '[]'::jsonb)
           from jsonb_array_elements(pv_visit_json(v, true)->'points') pt)), '{}'::jsonb)
    into photos
  from provider_visits v
  where v.job_id = p_job and v.sent_at is not null and v.sent_at >= from_ts and pv_visible(v, p_person);

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'at', x.created_at, 'visit_id', x.visit_id,
           'payload', x.payload, 'name', p.name) order by x.created_at), '[]'::jsonb)
    into reports
  from provider_messages x left join provider_people p on p.id = x.person_id
  where x.job_id = p_job and x.kind in ('supplies', 'damage') and x.acked_at is null and not x.deleted;

  -- invoices: returned ones (red card) + the monthly prompt (from the 1st, last month) + visits still without invoice
  inv := jsonb_build_object(
    'mode_now', pv_mode_for(p_job, t),
    'returned', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'month', i.month,
                   'amount', i.amount, 'note', i.note) order by i.created_at), '[]'::jsonb)
                 from provider_invoices i where i.job_id = p_job and i.status = 'returned'),
    'prompt', case when pv_mode_for(p_job, last_m) = 'monthly'
                and exists (select 1 from provider_visits x where x.job_id = p_job and pv_month_of(x.date) = last_m and x.status in ('done', 'sent', 'redo'))
                and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = last_m and i.visit_id is null and i.status <> 'replaced')
                and not exists (select 1 from provider_months m where m.job_id = p_job and m.month = last_m and m.status = 'closed')
              then jsonb_build_object('month', last_m) end,
    'missing', (select coalesce(jsonb_agg(x.id order by x.date), '[]'::jsonb) from provider_visits x
                where x.job_id = p_job and pv_visible(x, p_person) and x.date >= t - 62
                  and x.status in ('sent', 'done') and not (x.unplanned and x.status <> 'done')
                  and pv_mode_for(p_job, x.date) = 'per_visit'
                  and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status <> 'replaced')
                  and not exists (select 1 from provider_months m where m.job_id = p_job and m.month = pv_month_of(x.date) and m.status = 'closed')));

  return jsonb_build_object('ok', true, 'now', now(), 'today', t,
    'strip', strip, 'card', card, 'list', list_j, 'chat', chat, 'photos', photos, 'reports', reports, 'invoices', inv);
end $$;

-- provider phone: one call for the whole screen
create or replace function pv_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; s jsonb;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  s := pv_state_core(me.job_id, me.person_id);
  return s || jsonb_build_object(
    'person', jsonb_build_object('id', me.person_id, 'name', me.person_name, 'sends_invoices', me.sends_invoices),
    'job', jsonb_build_object('id', me.job_id, 'name', me.job_name),
    'invoice_todo', case when me.sends_invoices then pv_invoice_todo(me.job_id, me.person_id) end);
end $$;

-- Lynn: preview of the provider screen (read-only in the app)
create or replace function pv_admin_preview(p_job uuid, p_person uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; p provider_people%rowtype; s jsonb;
begin
  perform pv_admin_guard();
  select * into j from providers where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'job'); end if;
  if p_person is not null then select * into p from provider_people where id = p_person and job_id = p_job; end if;
  perform pv_catch_up(j.id);
  s := pv_state_core(j.id, p.id);
  return s || jsonb_build_object('preview', true,
    'person', case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.name, 'sends_invoices', p.sends_invoices) end,
    'job', jsonb_build_object('id', j.id, 'name', j.name));
end $$;

-- gold review dot of a job (anything that needs Lynn)
create or replace function pv_job_dot(p_job uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from provider_visits v where v.job_id = p_job and (v.status = 'sent'
                   or (v.status = 'cancelled_by_provider' and v.date >= pv_today()
                       and not (v.lynn_changed_at is not null and v.lynn_changed_at > v.cancelled_at))))
      or exists (select 1 from provider_messages m where m.job_id = p_job and m.kind in ('supplies', 'damage') and m.acked_at is null and not m.deleted)
      or exists (select 1 from provider_invoices i where i.job_id = p_job and i.status = 'to_check')
      or exists (select 1 from provider_pw_requests r where r.job_id = p_job and r.done_at is null)
$$;

-- Lynn: one call for her Providers app (tabs + dots, job settings, people, requests, lists, today)
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
                  'last_login', p.last_login, 'switched_off_at', p.switched_off_at, 'created_at', p.created_at,
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
    'state', pv_state_core(j.id, null));
end $$;

-- ═══════════════════════════════════════════════════════════════
-- 8 · PROVIDER ACTIONS (token) — every one state-guarded:
--     a failed guard returns {error:'changed'} → the app refreshes the card
-- ═══════════════════════════════════════════════════════════════

-- Fotos starten: snapshot of the list + spot pick happen HERE (first photo)
create or replace function pv_start(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; l provider_lists;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or not pv_visible(v, me.person_id) then return jsonb_build_object('error', 'changed'); end if;
  if v.status in ('in_progress', 'redo') then return jsonb_build_object('ok', true, 'visit', v.id); end if;   -- 2nd phone / resume
  if v.status <> 'planned' then return jsonb_build_object('error', 'changed'); end if;
  if not pv_in_window(v) then return jsonb_build_object('error', 'window'); end if;
  l := pv_list_row(v.job_id, v.list_id);
  update provider_visits set status = 'in_progress', started_at = now(), started_by = me.person_id,
    list_id = coalesce(v.list_id, l.id),
    list_snapshot = jsonb_build_object('id', l.id, 'name', l.name, 'floors', coalesce(l.floors, '[]'::jsonb),
                                       'spot_check', coalesce(l.spot_check, false), 'spot_size', l.spot_size),
    spot_pick = case when coalesce(l.spot_check, false) then pv_spot_pick(l.floors, l.spot_size) end,
    updated_at = now()
  where id = v.id;
  return jsonb_build_object('ok', true, 'visit', v.id);
end $$;

-- photo saved in the bucket → this call makes it count (server time) · a retake replaces the old photo
create or replace function pv_take_photo(p_token text, p_visit uuid, p_point text, p_path text,
                                         p_taken_at timestamptz default null, p_kind text default 'normal') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; k text := coalesce(p_kind, 'normal'); n int;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if (v.status = 'in_progress' and not pv_in_window(v)) or (v.status = 'redo' and now() >= pv_at(v.redo_until + 1)) then
    return jsonb_build_object('error', 'changed');
  end if;
  if coalesce(p_path, '') = '' or position(v.id::text || '/' in p_path) <> 1 then return jsonb_build_object('error', 'path'); end if;
  if k = 'extra' then
    if p_point !~ '^extra-[1-4]$' then return jsonb_build_object('error', 'point'); end if;
  elsif k in ('normal', 'redo') then
    if not exists (select 1 from pv_visit_points(v) pt where pt.key = p_point) then return jsonb_build_object('error', 'point'); end if;
    if v.status = 'redo' then
      if not (coalesce(v.flagged_steps, '[]'::jsonb) ? p_point) then return jsonb_build_object('error', 'point'); end if;
      k := 'redo';
    end if;
  else
    return jsonb_build_object('error', 'kind');
  end if;
  update provider_photos set superseded = true where visit_id = v.id and point_key = p_point and not superseded;
  insert into provider_photos (visit_id, point_key, person_id, path, taken_at_client, kind)
  values (v.id, p_point, me.person_id, p_path, p_taken_at, k);
  update provider_visits set updated_at = now() where id = v.id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'received_at', now());
end $$;

-- Nicht möglich: Besetzt / Kaputt / Anderes (+ text)
create or replace function pv_mark_np(p_token text, p_visit uuid, p_point text, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if (v.status = 'in_progress' and not pv_in_window(v)) or (v.status = 'redo' and now() >= pv_at(v.redo_until + 1)) then
    return jsonb_build_object('error', 'changed');
  end if;
  if p_reason not in ('besetzt', 'kaputt', 'anderes') then return jsonb_build_object('error', 'reason'); end if;
  if p_reason = 'anderes' and coalesce(trim(p_note), '') = '' then return jsonb_build_object('error', 'note'); end if;
  if not exists (select 1 from pv_visit_points(v) pt where pt.key = p_point and not pt.is_extra) then return jsonb_build_object('error', 'point'); end if;
  if v.status = 'redo' and not (coalesce(v.flagged_steps, '[]'::jsonb) ? p_point) then return jsonb_build_object('error', 'point'); end if;
  update provider_photos set superseded = true where visit_id = v.id and point_key = p_point and not superseded;
  insert into provider_photos (visit_id, point_key, person_id, np_reason, np_note, kind)
  values (v.id, p_point, me.person_id, p_reason, left(nullif(trim(p_note), ''), 200), case when v.status = 'redo' then 'redo' else 'normal' end);
  update provider_visits set updated_at = now() where id = v.id;
  return jsonb_build_object('ok', true);
end $$;

-- Senden: every point ✓ or nicht möglich → sent (+48 h; unplanned waits for Lynn)
create or replace function pv_send(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; left_n int;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status not in ('in_progress', 'redo') then return jsonb_build_object('error', 'changed'); end if;
  if not pv_visit_complete(v.id) then
    left_n := (pv_visit_json(v, true)->'counts'->>'left')::int;
    return jsonb_build_object('error', 'incomplete', 'left', left_n);
  end if;
  update provider_visits set status = 'sent', sent_at = now(), sent_by = me.person_id,
    auto_due_at = case when v.unplanned then null else now() + interval '48 hours' end, updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, case when v.status = 'redo' then 'resent' else 'sent' end,
                 jsonb_build_object('date', v.date, 'person', me.person_name));
  return jsonb_build_object('ok', true);
end $$;

-- Kann nicht kommen (only before the first photo, today or later)
create or replace function pv_cancel_visit(p_token text, p_visit uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or not pv_visible(v, me.person_id) or v.status <> 'planned' or v.started_at is not null or v.date < pv_today() then
    return jsonb_build_object('error', 'changed');
  end if;
  if p_reason not in ('krank', 'termin', 'anderes') then return jsonb_build_object('error', 'reason'); end if;
  update provider_visits set status = 'cancelled_by_provider', cancelled_by = 'provider', cancel_reason = p_reason,
    cancel_note = left(nullif(trim(p_note), ''), 200), cancelled_at = now(), cancelled_person = me.person_id, updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'cancelled_provider',
    jsonb_build_object('date', v.date, 'person', me.person_name, 'reason', p_reason, 'note', left(nullif(trim(p_note), ''), 200)));
  return jsonb_build_object('ok', true);
end $$;

-- her Undo: until the visit day, as long as Lynn changed nothing
create or replace function pv_undo_cancel(p_token text, p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype;
begin
  select * into me from pv_me(p_token);
  select * into v from provider_visits where id = p_visit and job_id = me.job_id for update;
  if not found or v.status <> 'cancelled_by_provider' or v.date < pv_today()
     or (v.lynn_changed_at is not null and v.lynn_changed_at > v.cancelled_at) then
    return jsonb_build_object('error', 'changed');
  end if;
  update provider_visits set status = 'planned', cancelled_by = null, cancel_reason = null, cancel_note = null,
    cancelled_at = null, cancelled_person = null, updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'cancel_undone', jsonb_build_object('date', v.date, 'person', me.person_name));
  return jsonb_build_object('ok', true);
end $$;

-- Trotzdem starten: no visit in the window → unplanned visit (current first list) → camera
create or replace function pv_start_unplanned(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; l provider_lists; vid uuid;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  if exists (select 1 from provider_visits v where v.job_id = me.job_id and pv_visible(v, me.person_id)
             and v.status in ('planned', 'in_progress', 'redo', 'sent') and pv_in_window(v)) then
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

-- Fehlt etwas? (supplies) / Schaden melden (damage: live photo + text)
create or replace function pv_report(p_token text, p_kind text, p_payload jsonb, p_visit uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; v provider_visits%rowtype; pl jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  select * into me from pv_me(p_token);
  if p_kind not in ('supplies', 'damage') or length(pl::text) > 2000 then return jsonb_build_object('error', 'invalid'); end if;
  if p_visit is not null then
    select * into v from provider_visits where id = p_visit and job_id = me.job_id;
    if not found then return jsonb_build_object('error', 'changed'); end if;
  end if;
  if p_kind = 'damage' then
    if v.id is null or coalesce(pl->>'path', '') = '' or position(v.id::text || '/' in pl->>'path') <> 1 then
      return jsonb_build_object('error', 'path');
    end if;
    insert into provider_photos (visit_id, point_key, person_id, path, kind)
    values (v.id, 'damage-' || replace(gen_random_uuid()::text, '-', ''), me.person_id, pl->>'path', 'damage');
  end if;
  insert into provider_messages (job_id, visit_id, person_id, kind, payload) values (me.job_id, v.id, me.person_id, p_kind, pl);
  return jsonb_build_object('ok', true);
end $$;

-- chat: text and/or a live-camera photo (stored as <visit_id>/chat-….jpg)
create or replace function pv_message(p_token text, p_text text, p_path text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record; vid uuid;
begin
  select * into me from pv_me(p_token);
  if coalesce(trim(p_text), '') = '' and coalesce(p_path, '') = '' then return jsonb_build_object('error', 'empty'); end if;
  if length(coalesce(p_text, '')) > 1000 then return jsonb_build_object('error', 'long'); end if;
  if coalesce(p_path, '') <> '' then
    vid := nullif(split_part(p_path, '/', 1), '')::uuid;
    if not exists (select 1 from provider_visits where id = vid and job_id = me.job_id) or split_part(p_path, '/', 2) not like 'chat-%' then
      return jsonb_build_object('error', 'path');
    end if;
  end if;
  insert into provider_messages (job_id, visit_id, person_id, kind, payload)
  values (me.job_id, vid, me.person_id, case when coalesce(p_path, '') <> '' then 'photo' else 'text' end,
          jsonb_strip_nulls(jsonb_build_object('text', nullif(trim(p_text), ''), 'path', nullif(p_path, ''))));
  return jsonb_build_object('ok', true);
exception when invalid_text_representation then
  return jsonb_build_object('error', 'path');
end $$;

-- invoice upload by a person with "Sends invoices" (month = month of the visit · a returned one gets replaced)
create or replace function pv_invoice_insert(p_job uuid, p_visit uuid, p_month date, p_amount numeric, p_date date,
                                             p_path text, p_person uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; m date; old provider_invoices%rowtype; nid uuid;
begin
  if p_amount is null or p_amount < 0 or p_amount > 100000 then return jsonb_build_object('error', 'amount'); end if;
  if coalesce(p_path, '') = '' or position(p_job::text || '/' in p_path) <> 1 then return jsonb_build_object('error', 'path'); end if;
  if p_visit is not null then
    select * into v from provider_visits where id = p_visit and job_id = p_job;
    if not found or v.status not in ('sent', 'done', 'redo') or (v.unplanned and v.status <> 'done') then
      return jsonb_build_object('error', 'visit');
    end if;
    m := pv_month_of(v.date);
    if pv_mode_for(p_job, m) <> 'per_visit' then return jsonb_build_object('error', 'mode'); end if;
    select * into old from provider_invoices where visit_id = v.id and status <> 'replaced' order by created_at desc limit 1;
  else
    m := pv_month_of(coalesce(p_month, pv_month_of(pv_today()) - 1));
    if pv_mode_for(p_job, m) <> 'monthly' then return jsonb_build_object('error', 'mode'); end if;
    select * into old from provider_invoices where job_id = p_job and month = m and visit_id is null and status <> 'replaced'
      order by created_at desc limit 1;
  end if;
  if exists (select 1 from provider_months where job_id = p_job and month = m and status = 'closed') then
    return jsonb_build_object('error', 'closed');
  end if;
  if old.id is not null and old.status <> 'returned' then return jsonb_build_object('error', 'exists'); end if;
  insert into provider_invoices (job_id, visit_id, month, amount, invoice_date, pdf_path, uploaded_by)
  values (p_job, p_visit, m, round(p_amount, 2), coalesce(p_date, pv_today()), p_path, p_person)
  returning id into nid;
  if old.id is not null then update provider_invoices set status = 'replaced', superseded_by = nid where id = old.id; end if;
  return jsonb_build_object('ok', true, 'id', nid, 'month', m);
end $$;

create or replace function pv_upload_invoice(p_token text, p_visit uuid, p_month date, p_amount numeric, p_date date, p_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from pv_me(p_token);
  if not me.sends_invoices then return jsonb_build_object('error', 'not_allowed'); end if;
  return pv_invoice_insert(me.job_id, p_visit, p_month, p_amount, p_date, p_path, me.person_id);
end $$;

-- ═══════════════════════════════════════════════════════════════
-- 9 · LYNN — review & control (map §6)
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_admin_visit(p_visit uuid) returns provider_visits
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  perform pv_admin_guard();
  perform pv_catch_up((select job_id from provider_visits where id = p_visit));
  select * into v from provider_visits where id = p_visit for update;
  return v;
end $$;

-- Approve (also an unplanned visit) → done
create or replace function pv_admin_approve(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'sent' then return jsonb_build_object('error', 'changed'); end if;
  update provider_visits set status = 'done', done_at = now(), auto_due_at = null, lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'approved', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

-- Reject an unplanned visit → "Nicht gezählt" (no invoice possible)
create or replace function pv_admin_reject(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'sent' or not v.unplanned then return jsonb_build_object('error', 'changed'); end if;
  update provider_visits set status = 'rejected', rejected_at = now(), auto_due_at = null, lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'rejected', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

-- Flag areas + note → redo until the next visit day (camera reopens only for these)
create or replace function pv_admin_flag(p_visit uuid, p_points jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; ok_keys jsonb;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'sent' then return jsonb_build_object('error', 'changed'); end if;
  select coalesce(jsonb_agg(pt.key), '[]'::jsonb) into ok_keys
  from pv_visit_points(v) pt where coalesce(p_points, '[]'::jsonb) ? pt.key;
  if jsonb_array_length(ok_keys) = 0 then return jsonb_build_object('error', 'points'); end if;
  update provider_visits set status = 'redo', flagged_steps = ok_keys, flag_note = left(nullif(trim(p_note), ''), 500),
    redo_at = now(), redo_until = pv_next_visit_day(v.job_id, v.id), auto_due_at = null, lynn_changed_at = now(), updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'redo', jsonb_build_object('date', v.date, 'n', jsonb_array_length(ok_keys)));
  return jsonb_build_object('ok', true);
end $$;

-- Undo (done → sent) · Unflag (redo → sent): back to waiting for Lynn, no new 48 h
create or replace function pv_admin_undo(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'done' then return jsonb_build_object('error', 'changed'); end if;
  if exists (select 1 from provider_months m where m.job_id = v.job_id and m.month = pv_month_of(v.date) and m.status = 'closed') then
    return jsonb_build_object('error', 'closed');
  end if;
  update provider_visits set status = 'sent', done_at = null, auto_due_at = null, lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'review_again', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_unflag(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'redo' then return jsonb_build_object('error', 'changed'); end if;
  update provider_visits set status = 'sent', redo_until = null, auto_due_at = null, lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'unflagged', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

-- Missed button: today, not started
create or replace function pv_admin_missed(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'planned' or v.started_at is not null or v.date <> pv_today() then
    return jsonb_build_object('error', 'changed');
  end if;
  update provider_visits set status = 'missed', missed_at = now(), lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'missed', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

-- Reopen a missed visit: 24 h photo window (a started one continues where it was)
create or replace function pv_admin_reopen(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'missed' then return jsonb_build_object('error', 'changed'); end if;
  update provider_visits set status = case when v.started_at is not null then 'in_progress' else 'planned' end,
    missed_at = null, redo_until = null, reopen_until = now() + interval '24 hours', lynn_changed_at = now(), updated_at = now()
  where id = v.id;
  perform pv_sys(v.job_id, v.id, 'reopened', jsonb_build_object('date', v.date, 'until', now() + interval '24 hours'));
  return jsonb_build_object('ok', true);
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 10 · LYNN — planning (map §4)
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_admin_check_refs(p_job uuid, p_person uuid, p_list uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_person is null or exists (select 1 from provider_people where id = p_person and job_id = p_job and switched_off_at is null))
     and (p_list is null or exists (select 1 from provider_lists where id = p_list and job_id = p_job and deleted_at is null))
$$;

-- Extra date
create or replace function pv_admin_add_visit(p_job uuid, p_date date, p_time time, p_person uuid default null, p_list uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  if p_date is null or p_date < pv_today() then return jsonb_build_object('error', 'past'); end if;
  if not pv_admin_check_refs(p_job, p_person, p_list) then return jsonb_build_object('error', 'refs'); end if;
  insert into provider_visits (job_id, date, at_time, person_id, list_id, lynn_changed_at)
  values (p_job, p_date, p_time, p_person, p_list, now()) returning id into vid;
  return jsonb_build_object('ok', true, 'id', vid);
end $$;

-- Move / replan (detaches from its rhythm, clears a provider cancel; the old slot is not made again)
create or replace function pv_admin_move_visit(p_visit uuid, p_date date, p_time time, p_person uuid default null, p_list uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status not in ('planned', 'cancelled', 'cancelled_by_provider') or v.started_at is not null then
    return jsonb_build_object('error', 'changed');
  end if;
  if p_date is null or p_date < pv_today() then return jsonb_build_object('error', 'past'); end if;
  if not pv_admin_check_refs(v.job_id, p_person, p_list) then return jsonb_build_object('error', 'refs'); end if;
  update provider_visits set status = 'planned', date = p_date, at_time = p_time, person_id = p_person, list_id = p_list,
    rhythm_id = case when p_date <> v.date or p_time is distinct from v.at_time then null else v.rhythm_id end,
    moved_from = case when p_date <> v.date then v.date else v.moved_from end,
    cancelled_by = null, cancel_reason = null, cancel_note = null, cancelled_at = null,
    cancelled_person = case when v.status = 'cancelled_by_provider' then v.cancelled_person end,
    lynn_changed_at = now(), updated_at = now()
  where id = v.id;
  if v.status = 'cancelled_by_provider' then
    perform pv_sys(v.job_id, v.id, 'replanned', jsonb_build_object('from', v.date, 'to', p_date,
      'person', (select name from provider_people where id = v.cancelled_person)));
  elsif p_date <> v.date then
    perform pv_sys(v.job_id, v.id, 'moved', jsonb_build_object('from', v.date, 'to', p_date));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Cancel (sand) · Restore (only until the visit date passes)
create or replace function pv_admin_cancel_visit(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'planned' or v.started_at is not null or v.date < pv_today() then return jsonb_build_object('error', 'changed'); end if;
  update provider_visits set status = 'cancelled', cancelled_by = 'lynn', cancel_reason = null, cancelled_at = now(),
    lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'cancelled', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_restore_visit(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status <> 'cancelled' or v.date < pv_today() then return jsonb_build_object('error', 'changed'); end if;
  if v.cancelled_by = 'pause' and pv_in_pause(v.job_id, v.date) then return jsonb_build_object('error', 'pause'); end if;
  update provider_visits set status = 'planned', cancelled_by = null, cancel_reason = null, cancelled_at = null,
    lynn_changed_at = now(), updated_at = now() where id = v.id;
  perform pv_sys(v.job_id, v.id, 'restored', jsonb_build_object('date', v.date));
  return jsonb_build_object('ok', true);
end $$;

-- Extra task for one visit (never changes the list) · null = remove
create or replace function pv_admin_set_extra_task(p_visit uuid, p_task jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype; t jsonb;
begin
  v := pv_admin_visit(p_visit);
  if v.id is null or v.status not in ('planned', 'in_progress') then return jsonb_build_object('error', 'changed'); end if;
  if p_task is not null and jsonb_typeof(p_task) = 'object' and coalesce(trim(p_task->>'de'), '') <> '' then
    t := jsonb_build_object('key', coalesce(v.extra_task->>'key', 'extra-task-' || left(replace(gen_random_uuid()::text, '-', ''), 12)),
      'de', left(trim(p_task->>'de'), 120), 'en', left(trim(coalesce(p_task->>'en', '')), 120),
      'photo', coalesce((p_task->>'photo')::boolean, false));
  end if;
  update provider_visits set extra_task = t, lynn_changed_at = now(), updated_at = now() where id = v.id;
  return jsonb_build_object('ok', true);
end $$;

-- Rhythm: create / edit (replaces only its future untouched planned visits) / stop
create or replace function pv_admin_save_rhythm(p_id uuid, p_job uuid, p_unit text, p_every int, p_weekday int, p_time time,
                                                p_start date, p_person uuid default null, p_list uuid default null, p_active boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid := p_id; first date; n int;
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  if p_unit not in ('week', 'month') or p_every is null or p_every < 1 or p_every > 52 or p_weekday not between 1 and 7 or p_start is null then
    return jsonb_build_object('error', 'invalid');
  end if;
  if not pv_admin_check_refs(p_job, p_person, p_list) then return jsonb_build_object('error', 'refs'); end if;
  first := p_start + ((p_weekday - extract(isodow from p_start)::int + 7) % 7);
  if rid is null then
    insert into provider_rhythms (job_id, unit, every_n, weekday, week_of_month, at_time, start_date, person_id, list_id, active)
    values (p_job, p_unit, p_every, p_weekday, ((extract(day from first)::int - 1) / 7) + 1, p_time, p_start, p_person, p_list, coalesce(p_active, true))
    returning id into rid;
  else
    update provider_rhythms set unit = p_unit, every_n = p_every, weekday = p_weekday,
      week_of_month = ((extract(day from first)::int - 1) / 7) + 1, at_time = p_time, start_date = p_start,
      person_id = p_person, list_id = p_list, active = coalesce(p_active, true), updated_at = now()
    where id = rid and job_id = p_job;
    if not found then return jsonb_build_object('error', 'changed'); end if;
    delete from provider_visits v
    where v.rhythm_id = rid and v.date >= pv_today() and v.started_at is null and v.lynn_changed_at is null and v.extra_task is null
      and (v.status = 'planned' or (v.status = 'cancelled' and v.cancelled_by = 'pause'))
      and not exists (select 1 from provider_messages m where m.visit_id = v.id)
      and not exists (select 1 from provider_photos x where x.visit_id = v.id);
  end if;
  n := pv_generate_visits(p_job);
  return jsonb_build_object('ok', true, 'id', rid, 'created', n);
end $$;

create or replace function pv_admin_delete_rhythm(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r provider_rhythms%rowtype;
begin
  perform pv_admin_guard();
  select * into r from provider_rhythms where id = p_id;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  delete from provider_visits v
  where v.rhythm_id = r.id and v.date >= pv_today() and v.started_at is null and v.lynn_changed_at is null and v.extra_task is null
    and (v.status = 'planned' or (v.status = 'cancelled' and v.cancelled_by = 'pause'))
    and not exists (select 1 from provider_messages m where m.visit_id = v.id)
    and not exists (select 1 from provider_photos x where x.visit_id = v.id);
  delete from provider_rhythms where id = r.id;           -- past + changed visits stay (detached)
  return jsonb_build_object('ok', true);
end $$;

-- Pause from–to (wins over rhythms) · returns how many visits it cancels
create or replace function pv_admin_save_pause(p_id uuid, p_job uuid, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid := p_id; n int;
begin
  perform pv_admin_guard();
  if p_from is null or p_to is null or p_to < p_from then return jsonb_build_object('error', 'invalid'); end if;
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  if pid is null then
    insert into provider_pauses (job_id, from_date, to_date) values (p_job, p_from, p_to) returning id into pid;
  else
    update provider_pauses set from_date = p_from, to_date = p_to where id = pid and job_id = p_job;
    if not found then return jsonb_build_object('error', 'changed'); end if;
  end if;
  perform pv_apply_pauses(p_job);
  select count(*) into n from provider_visits v where v.job_id = p_job and v.status = 'cancelled' and v.cancelled_by = 'pause'
    and v.date between p_from and p_to;
  return jsonb_build_object('ok', true, 'id', pid, 'cancelled', n);
end $$;

-- End a pause: a running one ends yesterday, a future one disappears → its visits come back
create or replace function pv_admin_end_pause(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_pauses%rowtype;
begin
  perform pv_admin_guard();
  select * into p from provider_pauses where id = p_id;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  if p.from_date < pv_today() then update provider_pauses set to_date = greatest(from_date, pv_today() - 1) where id = p.id;
  else delete from provider_pauses where id = p.id; end if;
  perform pv_apply_pauses(p.job_id);
  return jsonb_build_object('ok', true);
end $$;


-- Agenda modal: rhythms + pauses + coming visits in ONE load (Phase 2)
create or replace function pv_admin_agenda(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t date := pv_today();
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  perform pv_catch_up(p_job);
  return jsonb_build_object('ok', true, 'today', t,
    'rhythms', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'unit', r.unit, 'every', r.every_n, 'weekday', r.weekday,
                   'week_of_month', r.week_of_month, 'time', to_char(r.at_time, 'HH24:MI'), 'start', r.start_date,
                   'person_id', r.person_id, 'list_id', r.list_id, 'active', r.active) order by r.created_at), '[]'::jsonb)
                from provider_rhythms r where r.job_id = p_job),
    'pauses', (select coalesce(jsonb_agg(jsonb_build_object('id', pa.id, 'from', pa.from_date, 'to', pa.to_date,
                   'n', (select count(*) from provider_visits v where v.job_id = p_job and v.status = 'cancelled'
                           and v.cancelled_by = 'pause' and v.date between pa.from_date and pa.to_date))
                 order by pa.from_date), '[]'::jsonb)
               from provider_pauses pa where pa.job_id = p_job and pa.to_date >= t),
    'visits', (select coalesce(jsonb_agg(pv_visit_json(v, false) || jsonb_build_object('extra_task', v.extra_task)
                 order by v.date, v.at_time nulls first, v.created_at), '[]'::jsonb)
               from provider_visits v where v.job_id = p_job and v.date between t and t + 120 and v.status <> 'rejected'));
end $$;

-- History (Phase 4): month groups, every visit line forever · Lynn sees all, a provider only her own (read-only)
create or replace function pv_history_rows(p_job uuid, p_person uuid, p_before date, p_months int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t date := pv_today(); top date; lo date; rows jsonb; older boolean;
begin
  top := pv_month_of(least(coalesce(p_before, t), t));
  lo  := (top - make_interval(months => greatest(coalesce(p_months, 3), 1) - 1))::date;
  select coalesce(jsonb_agg(x.j order by x.date desc, x.at_time desc nulls last, x.created_at desc), '[]'::jsonb) into rows from (
    select v.date, v.at_time, v.created_at,
      (f.j - 'points' - 'extras') || jsonb_build_object(
        'month', pv_month_of(v.date),
        'thumbs', (select coalesce(jsonb_agg(jsonb_build_object('key', p->>'key', 'de', p->>'de', 'path', p->>'path', 'np', p->>'np')
                     order by (p->>'n')::int), '[]'::jsonb)
                   from jsonb_array_elements(f.j->'points') p where p->>'path' is not null or p->>'np' is not null),
        'flagged_names', (select coalesce(jsonb_agg(p->>'de' order by (p->>'n')::int), '[]'::jsonb)
                          from jsonb_array_elements(f.j->'points') p where (p->>'flagged')::boolean),
        'people', (select coalesce(jsonb_agg(distinct pp.name), '[]'::jsonb)
                   from provider_photos ph join provider_people pp on pp.id = ph.person_id where ph.visit_id = v.id),
        'redo_at', v.redo_at) as j
    from provider_visits v cross join lateral (select pv_visit_json(v, true) as j) f
    where v.job_id = p_job and pv_visible(v, p_person) and v.status <> 'planned' and v.date between lo and t
  ) x;
  older := exists (select 1 from provider_visits v where v.job_id = p_job and pv_visible(v, p_person)
                   and v.status <> 'planned' and v.date < lo);
  return jsonb_build_object('ok', true, 'today', t, 'from', lo, 'visits', rows,
                            'next_before', case when older then (lo - 1) end);
end $$;

create or replace function pv_admin_history(p_job uuid, p_before date default null, p_months int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; lo date;
begin
  perform pv_admin_guard();
  perform pv_catch_up(p_job);
  r := pv_history_rows(p_job, null, p_before, p_months);
  lo := (r->>'from')::date;
  return r || jsonb_build_object(                                      -- Phase 6: invoices + month lines
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'month', i.month, 'amount', i.amount,
                    'status', i.status, 'note', i.note, 'path', i.pdf_path, 'invoice_date', i.invoice_date, 'by', pp.name)
                    order by i.created_at), '[]'::jsonb)
                 from provider_invoices i left join provider_people pp on pp.id = i.uploaded_by
                 where i.job_id = p_job and i.status <> 'replaced' and i.month >= lo),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', mo.m, 'mode', pv_mode_for(p_job, mo.m),
                  'status', coalesce(pm.status, 'open'), 'closed_sum', pm.closed_sum, 'closed_at', pm.closed_at,
                  'paid_at', pm.confirmed_paid_at, 'changed', coalesce(pm.changed_after_confirmation, false)) order by mo.m desc), '[]'::jsonb)
               from (select g::date as m from generate_series(lo, pv_month_of(pv_today()), interval '1 month') g) mo
               left join provider_months pm on pm.job_id = p_job and pm.month = mo.m),
    'ctrl_category_id', (select ctrl_category_id from providers where id = p_job));
end $$;

create or replace function pv_history(p_token text, p_before date default null, p_months int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select * into me from pv_me(p_token);
  perform pv_catch_up(me.job_id);
  return pv_history_rows(me.job_id, me.person_id, p_before, p_months);
end $$;

-- Viewer (Phase 4): one visit in full — every area with photo, time, person, np note, flag
create or replace function pv_admin_visit_detail(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v provider_visits%rowtype;
begin
  perform pv_admin_guard();
  select * into v from provider_visits where id = p_visit;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return pv_visit_json(v, true) || jsonb_build_object('job_id', v.job_id);
end $$;

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

-- ═══════════════════════════════════════════════════════════════
-- MONEY (Phase 6): the job's Controlling cost type · the Soll hand-over · invoice to-dos
-- ═══════════════════════════════════════════════════════════════
-- your Casa Castel cost types in Controlling (read-only) — the People modal picks one per job
create or replace function pv_admin_ctrl_categories() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform pv_admin_guard();
  if to_regclass('public.ctrl_castel_categories') is null then return '[]'::jsonb; end if;
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'', c.id::text, ''name'', c.name) order by c.sort_order nulls last, c.name), ''[]''::jsonb) from public.ctrl_castel_categories c' into r;
  return r;
end $$;

create or replace function pv_admin_set_ctrl_category(p_job uuid, p_category text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update providers set ctrl_category_id = nullif(trim(coalesce(p_category, '')), '') where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- what a provider who sends invoices still has to do (visits without invoice · returned · monthly prompt)
create or replace function pv_invoice_todo(p_job uuid, p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lm date := pv_month_of(pv_month_of(pv_today()) - 1);
begin
  return jsonb_build_object(
    'missing', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.date) order by x.date), '[]'::jsonb)
                from provider_visits x
                where x.job_id = p_job and pv_visible(x, p_person) and x.date >= pv_today() - 62
                  and x.status in ('sent', 'done') and not (x.unplanned and x.status <> 'done')
                  and pv_mode_for(p_job, x.date) = 'per_visit'
                  and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status <> 'replaced')
                  and not pv_month_closed(p_job, x.date)),
    'returned', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'visit_id', i.visit_id, 'visit_date', v.date,
                   'month', i.month, 'amount', i.amount, 'note', i.note) order by i.created_at), '[]'::jsonb)
                 from provider_invoices i left join provider_visits v on v.id = i.visit_id
                 where i.job_id = p_job and i.status = 'returned'),
    'prompt', case when pv_mode_for(p_job, lm) = 'monthly'
                  and exists (select 1 from provider_visits x where x.job_id = p_job and pv_month_of(x.date) = lm and x.status in ('done', 'sent', 'redo'))
                  and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = lm and i.visit_id is null and i.status <> 'replaced')
                  and not pv_month_closed(p_job, lm)
                then jsonb_build_object('month', lm, 'visits', (select count(*) from provider_visits x where x.job_id = p_job
                                          and pv_month_of(x.date) = lm and x.status in ('done', 'sent', 'redo'))) end);
end $$;

-- ═══════════════════════════════════════════════════════════════
-- WIRING (Phase 6b): Controlling reads the Soll · tenant notice · 19:00 push · login dot
-- ═══════════════════════════════════════════════════════════════
-- Controlling: every closed (or reopened) Providers month of a year, per cost type — the read-only Soll + drill-down
create or replace function pv_ctrl_year(p_year int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return (select coalesce(jsonb_agg(x.g order by x.cat, x.m), '[]'::jsonb) from (
    select j.ctrl_category_id as cat, pm.month as m, jsonb_build_object(
      'category_id', j.ctrl_category_id, 'month', extract(month from pm.month)::int, 'month_iso', pm.month,
      'sum', sum(pm.closed_sum),
      'status', case when bool_or(pm.status = 'reopened') then 'reopened' else 'closed' end,
      'changed', bool_or(pm.changed_after_confirmation),
      'paid', bool_and(pm.confirmed_paid_at is not null),
      'jobs', jsonb_agg(jsonb_build_object('job_id', j.id, 'name', j.name, 'sum', pm.closed_sum, 'status', pm.status,
                'paid_at', pm.confirmed_paid_at, 'changed', pm.changed_after_confirmation) order by j.sort, j.name),
      'invoices', (select coalesce(jsonb_agg(jsonb_build_object('job', jj.name, 'amount', i.amount, 'invoice_date', i.invoice_date,
                     'visit_date', v.date, 'path', i.pdf_path, 'by', pp.name) order by v.date nulls last, i.invoice_date), '[]'::jsonb)
                   from provider_invoices i join providers jj on jj.id = i.job_id
                   left join provider_visits v on v.id = i.visit_id left join provider_people pp on pp.id = i.uploaded_by
                   where jj.ctrl_category_id = j.ctrl_category_id and i.month = pm.month and i.status = 'checked')) as g
    from provider_months pm join providers j on j.id = pm.job_id
    where j.ctrl_category_id is not null and extract(year from pm.month)::int = p_year and pm.status in ('closed', 'reopened')
    group by j.ctrl_category_id, pm.month) x);
end $$;

-- login tile dot: anything waiting in any job
create or replace function pv_admin_dot_any() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return exists (select 1 from providers j where j.deleted_at is null and pv_job_dot(j.id));
end $$;

-- tenant app: the next visit of a job with "Tell tenants" on (only date, time and areas — nothing else)
create or replace function pv_tenant_areas(p_job uuid, p_list uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fl jsonb; z text[]; de text[] := '{}'; en text[] := '{}';
begin
  select l.floors into fl from provider_lists l
  where l.job_id = p_job and l.deleted_at is null and (l.id = p_list or p_list is null)
  order by (l.id = p_list) desc nulls last, l.sort, l.created_at limit 1;
  select array_agg(distinct f->>'zone') into z from jsonb_array_elements(coalesce(fl, '[]'::jsonb)) f;
  if 'b' = any(z) then de := de || 'Bäder'::text; en := en || 'bathrooms'::text; end if;
  if 'g' = any(z) then de := de || 'Gäste-WC'::text; en := en || 'guest WC'::text; end if;
  if 'k' = any(z) then de := de || 'Küche'::text; en := en || 'kitchen'::text; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(fl, '[]'::jsonb)) f
             where (f->'block'->>'vacuum')::boolean or (f->'block'->>'mop')::boolean) then
    de := de || 'Flure'::text; en := en || 'hallways'::text;
  end if;
  return jsonb_build_object('de', array_to_string(de, ', '), 'en', array_to_string(en, ', '));
end $$;

create or replace function pv_tenant_notice() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v record; t date := pv_today();
begin
  select x.job_id, x.list_id, x.date, x.at_time into v
  from provider_visits x join providers j on j.id = x.job_id
  where j.deleted_at is null and j.tell_tenants and x.status in ('planned', 'in_progress')
    and x.date between t and t + 6
  order by x.date, x.at_time nulls last limit 1;
  if v.date is null then return null; end if;
  return jsonb_build_object('date', v.date, 'time', to_char(v.at_time, 'HH24:MI'), 'areas', pv_tenant_areas(v.job_id, v.list_id));
end $$;

-- 19:00 the evening before: what the push says (once per visit date) · p_test = the next visit now, nothing marked
alter table provider_visits add column if not exists tenant_notified_for date;
create or replace function pv_tenant_push_due(p_test boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v record; t date := pv_today(); tm text; d text;
begin
  if not coalesce(p_test, false) and extract(hour from now() at time zone 'Europe/Berlin') <> 19 then return null; end if;
  select x.id, x.date, x.at_time into v
  from provider_visits x join providers j on j.id = x.job_id
  where j.deleted_at is null and j.tell_tenants and x.status = 'planned'
    and (case when coalesce(p_test, false) then x.date >= t else x.date = t + 1 and x.tenant_notified_for is distinct from x.date end)
  order by x.date, x.at_time nulls last limit 1;
  if v.id is null then return null; end if;
  if not coalesce(p_test, false) then update provider_visits set tenant_notified_for = v.date where id = v.id; end if;
  tm := to_char(v.at_time, 'HH24:MI');
  d := case when v.date = t + 1 then 'Morgen' else 'Am ' || to_char(v.date, 'DD.MM.') end;
  return jsonb_build_object('title', 'Casa Castel',
    'body', d || ' kommt die Putzhilfe' || case when tm is not null then ' (ab ' || tm || ')' else '' end
            || '. Bitte Bäder frei und Geschirr weg. · Cleaning '
            || case when v.date = t + 1 then 'tomorrow' else 'on ' || to_char(v.date, 'DD.MM.') end
            || case when tm is not null then ' from ' || tm else '' end || '.');
end $$;

-- ═══════════════════════════════════════════════════════════════
-- 11 · LYNN — chat & reports
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_admin_message(p_job uuid, p_text text, p_path text default null, p_visit uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  if coalesce(trim(p_text), '') = '' and coalesce(p_path, '') = '' then return jsonb_build_object('error', 'empty'); end if;
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'job'); end if;
  insert into provider_messages (job_id, visit_id, kind, payload)
  values (p_job, p_visit, case when coalesce(p_path, '') <> '' then 'photo' else 'text' end,
          jsonb_strip_nulls(jsonb_build_object('text', nullif(trim(p_text), ''), 'path', nullif(p_path, ''))));
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_delete_message(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_messages set deleted = true where id = p_id and kind in ('text', 'photo', 'supplies', 'damage');
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- "Got it" on supplies / damage
create or replace function pv_admin_ack(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_messages set acked_at = now() where id = p_id and kind in ('supplies', 'damage') and acked_at is null;
  return jsonb_build_object('ok', true);
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 12 · LYNN — invoices & months (map §7 · paid only in Controlling)
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_month_closed(p_job uuid, p_month date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from provider_months where job_id = p_job and month = pv_month_of(p_month) and status = 'closed')
$$;

create or replace function pv_admin_upload_invoice(p_job uuid, p_visit uuid, p_month date, p_amount numeric, p_date date, p_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return pv_invoice_insert(p_job, p_visit, p_month, p_amount, p_date, p_path, null);
end $$;

create or replace function pv_admin_check_invoice(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i provider_invoices%rowtype;
begin
  perform pv_admin_guard();
  select * into i from provider_invoices where id = p_id for update;
  if not found or i.status <> 'to_check' then return jsonb_build_object('error', 'changed'); end if;
  if pv_month_closed(i.job_id, i.month) then return jsonb_build_object('error', 'closed'); end if;
  update provider_invoices set status = 'checked', checked_at = now() where id = i.id;
  return jsonb_build_object('ok', true);
end $$;

-- Fix + note → back to the provider (red card), a new upload replaces it
create or replace function pv_admin_return_invoice(p_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i provider_invoices%rowtype;
begin
  perform pv_admin_guard();
  select * into i from provider_invoices where id = p_id for update;
  if not found or i.status not in ('to_check', 'checked') then return jsonb_build_object('error', 'changed'); end if;
  if pv_month_closed(i.job_id, i.month) then return jsonb_build_object('error', 'closed'); end if;
  if coalesce(trim(p_note), '') = '' then return jsonb_build_object('error', 'note'); end if;
  update provider_invoices set status = 'returned', note = left(trim(p_note), 300), returned_at = now(), checked_at = null where id = i.id;
  return jsonb_build_object('ok', true);
end $$;

-- Close month: every invoice checked; visits without invoice need p_force (confirm) · sum → Controlling (app)
create or replace function pv_admin_close_month(p_job uuid, p_month date, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m date := pv_month_of(p_month); open_n int; miss_n int; s numeric; cat text;
begin
  perform pv_admin_guard();
  if m >= pv_month_of(pv_today()) then return jsonb_build_object('error', 'not_over'); end if;
  if pv_month_closed(p_job, m) then return jsonb_build_object('error', 'changed'); end if;
  select ctrl_category_id into cat from providers where id = p_job;
  if pv_mode_for(p_job, m) <> 'none' and cat is null then return jsonb_build_object('error', 'no_category'); end if;
  select count(*) into open_n from provider_invoices where job_id = p_job and month = m and status in ('to_check', 'returned');
  if open_n > 0 then return jsonb_build_object('error', 'unchecked', 'n', open_n); end if;
  select count(*) into miss_n from provider_visits x
  where x.job_id = p_job and pv_month_of(x.date) = m and x.status in ('sent', 'done', 'redo') and not (x.unplanned and x.status <> 'done')
    and pv_mode_for(p_job, m) <> 'none'
    and ((pv_mode_for(p_job, m) = 'per_visit' and not exists (select 1 from provider_invoices i where i.visit_id = x.id and i.status = 'checked'))
      or (pv_mode_for(p_job, m) = 'monthly' and not exists (select 1 from provider_invoices i where i.job_id = p_job and i.month = m and i.visit_id is null and i.status = 'checked')));
  if miss_n > 0 and not coalesce(p_force, false) then return jsonb_build_object('confirm', 'missing', 'n', miss_n); end if;
  select coalesce(sum(amount), 0) into s from provider_invoices where job_id = p_job and month = m and status = 'checked';
  insert into provider_months (job_id, month, status, closed_sum, closed_at)
  values (p_job, m, 'closed', s, now())
  on conflict (job_id, month) do update set status = 'closed', closed_sum = excluded.closed_sum, closed_at = now();
  return jsonb_build_object('ok', true, 'sum', s, 'month', m);        -- Controlling reads it as the Soll (pv_ctrl_year)
end $$;

create or replace function pv_admin_reopen_month(p_job uuid, p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mo provider_months%rowtype;
begin
  perform pv_admin_guard();
  select * into mo from provider_months where job_id = p_job and month = pv_month_of(p_month) for update;
  if not found or mo.status <> 'closed' then return jsonb_build_object('error', 'changed'); end if;
  update provider_months set status = 'reopened',
    changed_after_confirmation = mo.confirmed_paid_at is not null or mo.changed_after_confirmation
  where id = mo.id;
  return jsonb_build_object('ok', true);
end $$;

-- Hook for Controlling: confirm (or undo) paid for a closed month
create or replace function pv_confirm_paid(p_job uuid, p_month date, p_paid boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_months set confirmed_paid_at = case when p_paid then now() end,
    changed_after_confirmation = false
  where job_id = p_job and month = pv_month_of(p_month) and status = 'closed';
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 13 · LYNN — jobs & people (map §8.1–8.4) · passwords unique per job
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_pw_ok(p_job uuid, p_pw text, p_except uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case
    when length(pv_norm_pw(p_pw)) < 6 or length(pv_norm_pw(p_pw)) > 40 then 'pw_invalid'
    when exists (select 1 from provider_people where job_id = p_job and pass_hash = pv_hash(pv_norm_pw(p_pw))
                 and id is distinct from p_except) then 'pw_taken'
    else null end
$$;

create or replace function pv_revoke_person(p_person uuid) returns void language sql security definer set search_path = public as $$
  update provider_sessions set revoked_at = now() where person_id = p_person and revoked_at is null
$$;

-- New job via "+": name, first person (+ password), invoice mode, list empty or a copy
create or replace function pv_admin_create_job(p_name text, p_person text, p_password text, p_mode text, p_copy_list uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, '')); jid uuid; pid uuid; src provider_lists%rowtype; e text;
begin
  perform pv_admin_guard();
  if n = '' or length(n) > 40 then return jsonb_build_object('error', 'name'); end if;
  if exists (select 1 from providers where deleted_at is null and lower(trim(name)) = lower(n)) then return jsonb_build_object('error', 'name_taken'); end if;
  if coalesce(p_mode, '') not in ('per_visit', 'monthly', 'none') then return jsonb_build_object('error', 'mode'); end if;
  if coalesce(trim(p_person), '') <> '' then
    e := pv_pw_ok(null, p_password);
    if e is not null then return jsonb_build_object('error', e); end if;
  end if;
  insert into providers (name, sort, invoice_mode, mode_history)
  values (n, coalesce((select max(sort) + 1 from providers where deleted_at is null), 0), p_mode,
          jsonb_build_array(jsonb_build_object('from', '2000-01-01', 'mode', p_mode)))
  returning id into jid;
  if p_copy_list is not null then
    select * into src from provider_lists where id = p_copy_list and deleted_at is null;
  end if;
  insert into provider_lists (job_id, name, sort, floors, spot_check, spot_size, house_info, muell_pdf_path)
  values (jid, coalesce(src.name, 'Normal'), 0, coalesce(src.floors, '[]'::jsonb), coalesce(src.spot_check, false),
          coalesce(src.spot_size, 6), coalesce(src.house_info, '{}'::jsonb), src.muell_pdf_path);
  if coalesce(trim(p_person), '') <> '' then
    insert into provider_people (job_id, name, pass_hash, pass_readable, sends_invoices)
    values (jid, left(trim(p_person), 40), pv_hash(pv_norm_pw(p_password)), pv_norm_pw(p_password), p_mode <> 'none')
    returning id into pid;
  end if;
  return jsonb_build_object('ok', true, 'job_id', jid, 'person_id', pid);
end $$;

-- name (tab), invoice sender + address, "Tell tenants"
create or replace function pv_admin_save_job(p_job uuid, p_name text, p_sender_name text, p_sender_address text, p_tell_tenants boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
begin
  perform pv_admin_guard();
  if n = '' or length(n) > 40 then return jsonb_build_object('error', 'name'); end if;
  if exists (select 1 from providers where deleted_at is null and id <> p_job and lower(trim(name)) = lower(n)) then
    return jsonb_build_object('error', 'name_taken');
  end if;
  update providers set name = n, invoice_sender_name = nullif(trim(p_sender_name), ''),
    invoice_sender_address = nullif(trim(p_sender_address), ''), tell_tenants = coalesce(p_tell_tenants, false)
  where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- invoice mode switch → from the NEXT month (an open month never changes rules)
create or replace function pv_admin_set_mode(p_job uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j providers%rowtype; nm date := (pv_month_of(pv_today()) + interval '1 month')::date; h jsonb;
begin
  perform pv_admin_guard();
  if coalesce(p_mode, '') not in ('per_visit', 'monthly', 'none') then return jsonb_build_object('error', 'mode'); end if;
  select * into j from providers where id = p_job and deleted_at is null for update;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  select coalesce(jsonb_agg(e order by (e->>'from')::date), '[]'::jsonb) into h
  from jsonb_array_elements(j.mode_history) e where (e->>'from')::date < nm;          -- drop a pending switch
  if p_mode = j.invoice_mode then
    update providers set next_mode = null, next_mode_from = null, mode_history = h where id = j.id;
    return jsonb_build_object('ok', true, 'from', null);
  end if;
  update providers set next_mode = p_mode, next_mode_from = nm,
    mode_history = h || jsonb_build_array(jsonb_build_object('from', nm, 'mode', p_mode))
  where id = j.id;
  return jsonb_build_object('ok', true, 'from', nm);
end $$;

create or replace function pv_admin_set_contract(p_job uuid, p_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update providers set contract_path = nullif(p_path, '') where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Delete job = soft delete (tab + login disappear, invoices + history kept)
create or replace function pv_admin_delete_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update providers set deleted_at = now() where id = p_job and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  update provider_sessions s set revoked_at = now() from provider_people p
  where p.id = s.person_id and p.job_id = p_job and s.revoked_at is null;
  update provider_rhythms set active = false where job_id = p_job;
  update provider_pw_requests set done_at = now() where job_id = p_job and done_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- + Person (password made in the app, unique in the job)
create or replace function pv_admin_add_person(p_job uuid, p_name text, p_phone text, p_password text, p_sends_invoices boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, '')); e text; pid uuid;
begin
  perform pv_admin_guard();
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'changed'); end if;
  if n = '' or length(n) > 40 then return jsonb_build_object('error', 'name'); end if;
  if exists (select 1 from provider_people where job_id = p_job and switched_off_at is null and lower(trim(name)) = lower(n)) then
    return jsonb_build_object('error', 'name_taken');
  end if;
  e := pv_pw_ok(p_job, p_password);
  if e is not null then return jsonb_build_object('error', e); end if;
  insert into provider_people (job_id, name, phone, pass_hash, pass_readable, sends_invoices)
  values (p_job, left(n, 40), nullif(trim(p_phone), ''), pv_hash(pv_norm_pw(p_password)), pv_norm_pw(p_password),
          coalesce(p_sends_invoices, pv_mode_for(p_job, pv_today()) <> 'none'))
  returning id into pid;
  update provider_pw_requests set person_id = pid
  where job_id = p_job and done_at is null and person_id is null and lower(name) = lower(n);
  return jsonb_build_object('ok', true, 'id', pid);
end $$;

create or replace function pv_admin_save_person(p_person uuid, p_name text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_people%rowtype; n text := trim(coalesce(p_name, ''));
begin
  perform pv_admin_guard();
  select * into p from provider_people where id = p_person;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  if n = '' or length(n) > 40 then return jsonb_build_object('error', 'name'); end if;
  if exists (select 1 from provider_people where job_id = p.job_id and id <> p.id and switched_off_at is null and lower(trim(name)) = lower(n)) then
    return jsonb_build_object('error', 'name_taken');
  end if;
  update provider_people set name = left(n, 40), phone = nullif(trim(p_phone), '') where id = p.id;
  return jsonb_build_object('ok', true);
end $$;

-- toggles: Login on (off = that phone is logged out at once) · Sends invoices
create or replace function pv_admin_set_person_flags(p_person uuid, p_login_on boolean, p_sends_invoices boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_people%rowtype;
begin
  perform pv_admin_guard();
  select * into p from provider_people where id = p_person for update;
  if not found or p.switched_off_at is not null then return jsonb_build_object('error', 'changed'); end if;
  update provider_people set login_on = coalesce(p_login_on, p.login_on), sends_invoices = coalesce(p_sends_invoices, p.sends_invoices)
  where id = p.id;
  if p.login_on and not coalesce(p_login_on, p.login_on) then perform pv_revoke_person(p.id); end if;
  return jsonb_build_object('ok', true);
end $$;

-- New password (unique in the job) → old phones are logged out · open requests of this person are done
create or replace function pv_admin_new_password(p_person uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_people%rowtype; e text;
begin
  perform pv_admin_guard();
  select * into p from provider_people where id = p_person for update;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  e := pv_pw_ok(p.job_id, p_password, p.id);
  if e is not null then return jsonb_build_object('error', e); end if;
  update provider_people set pass_hash = pv_hash(pv_norm_pw(p_password)), pass_readable = pv_norm_pw(p_password) where id = p.id;
  perform pv_revoke_person(p.id);
  update provider_pw_requests set done_at = now()
  where job_id = p.job_id and done_at is null and (person_id = p.id or lower(name) = lower(trim(p.name)));
  return jsonb_build_object('ok', true, 'password', pv_norm_pw(p_password));
end $$;

-- Delete only without history; otherwise the app offers "switch off"
create or replace function pv_admin_delete_person(p_person uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_people%rowtype;
begin
  perform pv_admin_guard();
  select * into p from provider_people where id = p_person;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  if exists (select 1 from provider_visits v where v.person_id = p.id or v.started_by = p.id or v.sent_by = p.id or v.cancelled_person = p.id)
     or exists (select 1 from provider_photos x where x.person_id = p.id)
     or exists (select 1 from provider_messages m where m.person_id = p.id)
     or exists (select 1 from provider_invoices i where i.uploaded_by = p.id)
     or exists (select 1 from provider_rhythms r where r.person_id = p.id) then
    return jsonb_build_object('error', 'has_history');
  end if;
  delete from provider_people where id = p.id;
  update provider_pw_requests set done_at = coalesce(done_at, now()) where job_id = p.job_id and done_at is null and lower(name) = lower(trim(p.name));
  return jsonb_build_object('ok', true);
end $$;

-- Switch off (person changed): login stops, history keeps the name · switch on again
create or replace function pv_admin_switch_person(p_person uuid, p_off boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p provider_people%rowtype;
begin
  perform pv_admin_guard();
  select * into p from provider_people where id = p_person for update;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  if p_off then
    update provider_people set switched_off_at = coalesce(switched_off_at, now()), login_on = false where id = p.id;
    perform pv_revoke_person(p.id);
    update provider_rhythms set person_id = null where person_id = p.id;                -- her rhythms become "anyone"
  else
    if exists (select 1 from provider_people where job_id = p.job_id and id <> p.id and switched_off_at is null and lower(trim(name)) = lower(trim(p.name))) then
      return jsonb_build_object('error', 'name_taken');
    end if;
    update provider_people set switched_off_at = null, login_on = true where id = p.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_dismiss_request(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_pw_requests set done_at = now() where id = p_id and done_at is null;
  return jsonb_build_object('ok', true);
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 14 · LYNN — lists (map §8.5) · planned visits follow the list, running ones never change
-- ═══════════════════════════════════════════════════════════════
create or replace function pv_admin_save_list(p_list uuid, p_name text, p_floors jsonb, p_spot_check boolean, p_spot_size int, p_house_info jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n text := trim(coalesce(p_name, ''));
begin
  perform pv_admin_guard();
  if n = '' or length(n) > 40 then return jsonb_build_object('error', 'name'); end if;
  if p_floors is null or jsonb_typeof(p_floors) <> 'array' then return jsonb_build_object('error', 'floors'); end if;
  update provider_lists set name = n, floors = p_floors, spot_check = coalesce(p_spot_check, false),
    spot_size = least(greatest(coalesce(p_spot_size, 6), 1), 50),
    house_info = case when jsonb_typeof(p_house_info) = 'object' then p_house_info else '{}'::jsonb end, updated_at = now()
  where id = p_list and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_set_muell(p_list uuid, p_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  update provider_lists set muell_pdf_path = nullif(p_path, ''), updated_at = now() where id = p_list and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function pv_admin_create_list(p_job uuid, p_name text, p_copy_from uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare src provider_lists%rowtype; lid uuid; n text := trim(coalesce(p_name, ''));
begin
  perform pv_admin_guard();
  if n = '' or length(n) > 40 then return jsonb_build_object('error', 'name'); end if;
  if not exists (select 1 from providers where id = p_job and deleted_at is null) then return jsonb_build_object('error', 'changed'); end if;
  if p_copy_from is not null then select * into src from provider_lists where id = p_copy_from and deleted_at is null; end if;
  insert into provider_lists (job_id, name, sort, floors, spot_check, spot_size, house_info, muell_pdf_path)
  values (p_job, n, coalesce((select max(sort) + 1 from provider_lists where job_id = p_job and deleted_at is null), 0),
          coalesce(src.floors, '[]'::jsonb), coalesce(src.spot_check, false), coalesce(src.spot_size, 6),
          coalesce(src.house_info, '{}'::jsonb), src.muell_pdf_path)
  returning id into lid;
  return jsonb_build_object('ok', true, 'id', lid);
end $$;

create or replace function pv_admin_delete_list(p_list uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l provider_lists%rowtype;
begin
  perform pv_admin_guard();
  select * into l from provider_lists where id = p_list and deleted_at is null;
  if not found then return jsonb_build_object('error', 'changed'); end if;
  if (select count(*) from provider_lists where job_id = l.job_id and deleted_at is null) <= 1 then return jsonb_build_object('error', 'last'); end if;
  if exists (select 1 from provider_rhythms where list_id = l.id and active) then return jsonb_build_object('error', 'in_use'); end if;
  update provider_visits set list_id = null where list_id = l.id and status = 'planned';
  update provider_lists set deleted_at = now() where id = l.id;
  return jsonb_build_object('ok', true);
end $$;

-- 12-month photo clean-up: the app removes the files (Storage API), then marks them here
create or replace function pv_admin_cleanup_due(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform pv_admin_guard();
  return (select coalesce(jsonb_agg(x.path), '[]'::jsonb) from (
    select ph.path from provider_photos ph
    where ph.path is not null and ph.file_deleted_at is null and ph.received_at < now() - interval '12 months'
    order by ph.received_at limit greatest(coalesce(p_limit, 200), 1)) x);
end $$;

create or replace function pv_admin_cleanup_done(p_paths jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pv_admin_guard();
  update provider_photos set file_deleted_at = now()
  where file_deleted_at is null and path in (select jsonb_array_elements_text(coalesce(p_paths, '[]'::jsonb)));
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'n', n);
end $$;

-- ═══════════════════════════════════════════════════════════════
-- 15 · STORAGE — provider-proofs (public read, unguessable paths)
--                provider-invoices (private drop-box, you read via links)
-- ═══════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('provider-proofs', 'provider-proofs', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('provider-invoices', 'provider-invoices', false) on conflict (id) do nothing;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'] where id = 'provider-proofs';
    update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/pdf'] where id = 'provider-invoices';
  end if;
end $$;

-- providers may upload only: proof photos into an OPEN visit (visit_id/…), chat photos (visit_id/chat-…)
create or replace function pv_storage_proof_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(coalesce(p_name, ''), '/'); vid uuid;
begin
  if auth.uid() is not null then return true; end if;                                   -- your login
  if array_length(parts, 1) <> 2 or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  vid := parts[1]::uuid;
  if parts[2] like 'chat-%' then
    return exists (select 1 from provider_visits v join providers j on j.id = v.job_id
                   where v.id = vid and j.deleted_at is null and v.date between pv_today() - 45 and pv_today() + 120);
  end if;
  return exists (select 1 from provider_visits v join providers j on j.id = v.job_id
                 where v.id = vid and j.deleted_at is null and v.status in ('in_progress', 'redo'));
end $$;

-- invoices: job_id/yyyy-mm/….pdf by a job with someone who sends invoices · contracts/ only you
create or replace function pv_storage_invoice_ok(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(coalesce(p_name, ''), '/');
begin
  if auth.uid() is not null then return true; end if;
  if array_length(parts, 1) <> 3 or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[2] !~ '^[0-9]{4}-[0-9]{2}$' or parts[3] !~ '\.pdf$' then return false; end if;
  return exists (select 1 from providers j join provider_people p on p.job_id = j.id
                 where j.id = parts[1]::uuid and j.deleted_at is null and p.sends_invoices and p.login_on and p.switched_off_at is null);
end $$;

drop policy if exists "pv proofs insert"   on storage.objects;
drop policy if exists "pv proofs read"     on storage.objects;
drop policy if exists "pv proofs update"   on storage.objects;
drop policy if exists "pv proofs delete"   on storage.objects;
drop policy if exists "pv invoices insert" on storage.objects;
drop policy if exists "pv invoices read"   on storage.objects;
drop policy if exists "pv invoices update" on storage.objects;
drop policy if exists "pv invoices delete" on storage.objects;
create policy "pv proofs insert"   on storage.objects for insert to anon, authenticated with check (bucket_id = 'provider-proofs' and public.pv_storage_proof_ok(name));
create policy "pv proofs read"     on storage.objects for select to authenticated using (bucket_id = 'provider-proofs');
create policy "pv proofs update"   on storage.objects for update to authenticated using (bucket_id = 'provider-proofs') with check (bucket_id = 'provider-proofs');
create policy "pv proofs delete"   on storage.objects for delete to authenticated using (bucket_id = 'provider-proofs');
create policy "pv invoices insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'provider-invoices' and public.pv_storage_invoice_ok(name));
create policy "pv invoices read"   on storage.objects for select to authenticated using (bucket_id = 'provider-invoices');
create policy "pv invoices update" on storage.objects for update to authenticated using (bucket_id = 'provider-invoices') with check (bucket_id = 'provider-invoices');
create policy "pv invoices delete" on storage.objects for delete to authenticated using (bucket_id = 'provider-invoices');


-- ═══════════════════════════════════════════════════════════════
-- 16 · WHO MAY CALL WHAT
--      provider functions: the provider app (they check the token themselves)
--      pv_admin_* + pv_confirm_paid: only your login · helpers: nobody from outside
-- ═══════════════════════════════════════════════════════════════
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pv\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('pv_jobs', 'pv_login', 'pv_logout', 'pv_ping', 'pv_request_password', 'pv_state', 'pv_catch_up',
                     'pv_start', 'pv_take_photo', 'pv_mark_np', 'pv_send', 'pv_cancel_visit', 'pv_undo_cancel',
                     'pv_start_unplanned', 'pv_report', 'pv_message', 'pv_upload_invoice', 'pv_history', 'pv_tenant_notice',
                     'pv_storage_proof_ok', 'pv_storage_invoice_ok') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.proname like 'pv\_admin\_%' and f.proname not in ('pv_admin_guard', 'pv_admin_visit', 'pv_admin_check_refs') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname in ('pv_confirm_paid', 'pv_ctrl_year') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;


do $$ begin                                             -- the push function reads the 19:00 text with the service key
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function pv_tenant_push_due(boolean) to service_role';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 17 · CRON (UTC): every 15 min all timed rules · nightly 01:00 UTC
--      (= 02:00 Berlin in winter, 03:00 in summer) the 12-week generator.
--      Even without cron the catch-up on every app open keeps it right.
-- ═══════════════════════════════════════════════════════════════
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('pv-catch-up', '*/15 * * * *', 'select public.pv_catch_up_all()');
    perform cron.schedule('pv-nightly', '0 1 * * *', 'select public.pv_nightly()');
    -- hourly: the small function "push-providers" sends the tenant reminder at 19:00 Berlin (only with "Tell tenants" on)
    perform cron.schedule('pv-tenant-push', '0 * * * *', $job$
      select net.http_post(
        url     := 'https://nqxsonmmcnmdastcpiff.supabase.co/functions/v1/push-providers',
        body    := '{"kind":"tick"}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cc_push_secret')));
    $job$);
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════
-- 18 · SEED — job Hausreinigung + list "Normal" (13 photos, from the mockup)
--      No person and no rhythm: you add people in People and the schedule in Agenda.
--      Müll-Plan PDF = pv-muell-plan.pdf in the repo (replace it later in List).
-- ═══════════════════════════════════════════════════════════════
do $$
declare jid uuid;
begin
  select id into jid from providers where lower(trim(name)) = 'hausreinigung' and deleted_at is null;
  if jid is null then
    insert into providers (name, sort, invoice_mode, mode_history)
    values ('Hausreinigung', 0, 'per_visit', '[{"from":"2000-01-01","mode":"per_visit"}]'::jsonb)
    returning id into jid;
  end if;
  if not exists (select 1 from provider_lists where job_id = jid and deleted_at is null) then
    insert into provider_lists (job_id, name, sort, floors, spot_check, spot_size, house_info, muell_pdf_path)
    values (jid, 'Normal', 0, '[{"key":"25169b64-58d4-4687-9602-b5dd046fab2c","label":"2. OG","room_de":"Bad 2","room_en":"Bathroom 2","zone":"b","steps":[{"key":"8802f756-f07e-4677-b09f-3f23119386e6","de":"Duschglas","en":"Shower glass","ins_de":"Reinigen: streifenfrei, kein Kalk.","ins_en":"Clean: streak-free, no limescale.","pic":"shower","zone":"b","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"caaeb975-ae6d-447b-8ac4-25e799a206b2","de":"Duschglas","en":"Shower glass"}]},{"key":"810c48e9-9fc8-4e83-8afc-f48ca53409e4","de":"Waschbecken","en":"Sink","ins_de":"Reinigen: Becken, Armatur, Spiegel.","ins_en":"Clean: basin, tap, mirror.","pic":"sink","zone":"b","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"f6c1aa6e-4393-46b4-b486-13c3d99dbc42","de":"Waschbecken","en":"Sink"}]},{"key":"5e2299fc-c557-4942-845e-ab356307cb8c","de":"WC","en":"Toilet","ins_de":"Reinigen: innen + außen, Brille, Rand.","ins_en":"Clean: inside and out, seat, rim.","pic":"wc","zone":"b","photo":"required","hint_de":"Deckel + Brille hoch","hint_en":"lid + seat up","points":[{"key":"f32a8280-61e4-4182-9129-0b1e7c2db703","de":"WC","en":"Toilet"}]}],"block":{"surfaces":true,"vacuum":true,"mop":true,"photo":null},"stairs":true},{"key":"81374368-1fef-4976-a4f8-cc3e176c800f","label":"1. OG","room_de":"Bad 1","room_en":"Bathroom 1","zone":"b","steps":[{"key":"1250fa61-1af8-4284-b99d-d717fb3cee3c","de":"Duschglas","en":"Shower glass","ins_de":"Reinigen: streifenfrei, kein Kalk.","ins_en":"Clean: streak-free, no limescale.","pic":"shower","zone":"b","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"f9bf2ef1-42fa-4645-9b82-a7b86113377c","de":"Duschglas","en":"Shower glass"}]},{"key":"a5d1ac54-993f-4a7a-bd23-8d9e1d22e41f","de":"Waschbecken","en":"Sink","ins_de":"Reinigen: Becken, Armatur, Spiegel.","ins_en":"Clean: basin, tap, mirror.","pic":"sink","zone":"b","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"379dcca2-e096-4340-85e8-498ab677d535","de":"Waschbecken","en":"Sink"}]},{"key":"551493f6-5ab0-4766-a8be-fa0254edad77","de":"WC","en":"Toilet","ins_de":"Reinigen: innen + außen, Brille, Rand.","ins_en":"Clean: inside and out, seat, rim.","pic":"wc","zone":"b","photo":"required","hint_de":"Deckel + Brille hoch","hint_en":"lid + seat up","points":[{"key":"73b3a6bf-6e54-46e1-8e2b-2893d0ddc564","de":"WC","en":"Toilet"}]}],"block":{"surfaces":true,"vacuum":true,"mop":true,"photo":null},"stairs":true},{"key":"4c9d567e-1f1f-4f72-8284-f7e4ef2b67c0","label":"EG","room_de":"Gäste-WC","room_en":"Guest toilet","zone":"g","steps":[{"key":"4a124313-2104-4655-aa94-c5a3a8331721","de":"Gäste-WC","en":"Guest toilet","ins_de":"Reinigen: WC + Waschbecken.","ins_en":"Clean: toilet + basin.","pic":"guestwc","zone":"g","photo":"required","hint_de":"Deckel + Brille hoch","hint_en":"lid + seat up","points":[{"key":"5e6512a0-0cea-4be9-b243-f3986dc2cb8f","de":"Gäste-WC","en":"Guest toilet"}]}],"block":{"surfaces":true,"vacuum":true,"mop":true,"photo":null},"stairs":true},{"key":"178ddd9f-049d-4eda-b3ee-0e8c574ee247","label":"UG","room_de":"Küche","room_en":"Kitchen","zone":"k","steps":[{"key":"d82846f4-e78d-4c8f-beb1-9944f1fcf813","de":"Geschirr","en":"Dishes","ins_de":"Wenn noch Geschirr da ist: spülen und wegräumen.","ins_en":"Dishes left? Wash and put away.","pic":"dishes","zone":"k","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"cf456942-f823-4e0f-9dc4-449a3f1be2c0","de":"Geschirr","en":"Dishes"}]},{"key":"2db7e114-d8f5-40fe-bcad-8a908ebc5093","de":"Geräte","en":"Appliances","ins_de":"Mikrowelle, Airfryer und alle Geräte sauber machen.","ins_en":"Clean the microwave, air fryer and all appliances.","pic":"appliances","zone":"k","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"84a01010-3543-42c2-9b6b-492a1e68a50e","de":"Mikrowelle","en":"Microwave","pic":"microwave"},{"key":"324c7f03-9e4e-4118-bda1-e20fee210ba6","de":"Airfryer","en":"Air fryer","pic":"airfryer"}]},{"key":"97557c38-73e0-4dda-9df8-d5e6591d5949","de":"Kühlschrank","en":"Fridge","ins_de":"Schimmel entfernen, Fächer und Tür innen sauber machen.","ins_en":"Remove mould, clean shelves and inside of the door.","pic":"fridge","zone":"k","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"fa53ebd5-44bf-4b0d-9bb5-9936924977a7","de":"Kühlschrank","en":"Fridge"}]},{"key":"aea9b299-6272-4d2c-8f3a-2324de185c29","de":"Müll raus","en":"Trash out","ins_de":"Alle Eimer leeren, in die richtigen Tonnen. Neue Tüten rein.","ins_en":"Empty all bins into the right outdoor bins. New bags.","pic":"trash","zone":"k","photo":"required","hint_de":null,"hint_en":null,"points":[{"key":"3aeed72b-989c-48fc-9857-e1ffc6b36a2d","de":"Müll raus","en":"Trash out"}],"bins":true}],"block":{"surfaces":true,"vacuum":true,"mop":true,"photo":{"key":"4df66314-35a8-4bd0-a835-d484b19484f0","de":"Küche","en":"Kitchen","pic":"kitchen","zone":"k","mode":"required"}},"stairs":false}]'::jsonb, false, 6, '{}'::jsonb, 'static:pv-muell-plan.pdf');
  end if;
end $$;

-- Done. Check: select name from providers;  →  Hausreinigung
