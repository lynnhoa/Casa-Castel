-- READ ONLY · Casa Castel: data check (Nov 2026) — records that old bugs may have saved wrong
--     The app fixes of 08.11.2026 stop NEW damage. This file looks for OLD damage that would still make
--     NK letters, Controlling or the Tenants cards wrong. Nothing is changed: every section is one SELECT.
--
--     A  Pauschal rent entries that lost their NK part ("davon NK")
--     B  Renewals of a Pauschal tenant that took the room's NK part instead of the tenant's own
--     C  Add former tenant: a typed Pauschale saved with the room's NK added on top (600 → 700)
--        C2 = the same rows, compared with what Controlling has booked
--     D  Kurzzeit stays over 3 months with a Kaution Soll of 1× the rent (rule: 3×)
--     E  Tenants still "active" while a later tenant of the room has moved in
--     F  Contract end on the tenant card ≠ contract end in the rent history
--     G  Korrektur damage: an old rent amount equal to a LATER Mieterhöhung (G) / NK-Anpassung (G2)
--     H  Room names that match no room any more (renamed before the fix) — H1 … H7, one per table
--
-- HOW TO RUN (Supabase › SQL Editor): select ONE section — from its "-- ── X ·" line (H: "-- H1 ·" …) down to its ";" —
--     and press Run.
--     The editor shows only the LAST result and stops at the first error, so run the sections one by one.
--     (psql -f DATA-CHECK.sql runs them all in order; a missing table only stops its own section.)
--     No rows = nothing found. Each row = one thing to look at in the app; tick it when checked.
--     A missing column added by a later SQL file never breaks a section (it is read as empty); a missing TABLE stops
--     only the sections that read it — each header says which file creates it. Dates DD.MM.YYYY, amounts 1.234,50.
--     "strength" (where shown): 1 = almost surely wrong · 2 = likely · 3 = worth a look.


-- ── A · Pauschal rent entries without their NK part ("davon NK" empty or 0) ─────────────────────────────────
-- What: a Casa Castel rent entry (Tenants › rent history) saved as Pauschal with no NK part inside it, while this
--       tenancy's other entries, the tenant card or the room show one.
-- Why it matters: Controlling then counts the whole Pauschale as Kaltmiete, and the NK-Abrechnung gives this stay
--       no "Anteil Kurzzeitvermietung" — its share of the house costs lands on the Kalt + NK tenants.
-- Old bugs: Create contract (Approve) saved the first entry without it · Controlling "Confirm" / "Add rent from a
--       date" dropped it · a renewal could lose it.
-- strength 1 = another Pauschal entry of this tenancy has an NK part · 2 = the tenant card still has Nebenkosten
--          (Pauschale kept as Kalt + NK) · 3 = only the room has an NK for this contract type (check the contract)
-- Needs: rent_periods (UPDATE.sql § 1) · tenant_records, rooms (the app's own tables)
with
ten as (                                    -- every Casa Castel tenancy, dates read like the app (2026-09-01 or 01.09.2026)
  select t.id::text as tid, j.tj,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status
  from tenant_records t cross join lateral (select to_jsonb(t) as tj) j
),
rm as (                                     -- the rooms with their three baselines (Kurzzeit · Jahresvertrag · Mietvertrag)
  select j.rj, regexp_replace(lower(coalesce(j.rj ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         n.kz_k, n.kz_n, n.jv_k, n.jv_n, n.mv_k, n.mv_n, n.mv_old, coalesce(j.rj ->> 'jahres_kaltmiete', '') <> '' as jv_own,
         case when j.rj ->> 'active_price_type' = 'mietvertrag' and (coalesce(n.mv_k, 0) <> 0 or coalesce(n.mv_old, 0) <> 0) then 'mietvertrag'
              when j.rj ->> 'active_price_type' = 'kurzzeit' and coalesce(n.kz_k, 0) <> 0 then 'kurzzeit'
              when coalesce(n.mv_k, 0) <> 0 or coalesce(n.mv_old, 0) <> 0 then 'mietvertrag'
              when coalesce(n.kz_k, 0) <> 0 then 'kurzzeit' end as room_ct
  from rooms r
  cross join lateral (select to_jsonb(r) as rj) j
  cross join lateral (
    select max(v) filter (where k = 'kurzzeit_kaltmiete') as kz_k, max(v) filter (where k = 'kurzzeit_nk') as kz_n,
           max(v) filter (where k = 'jahres_kaltmiete') as jv_k,   max(v) filter (where k = 'jahres_nk') as jv_n,
           max(v) filter (where k = 'kaltmiete') as mv_k,          max(v) filter (where k = 'nk_pauschale') as mv_n,
           max(v) filter (where k = 'mietvertrag_miete') as mv_old
    from unnest(array['kurzzeit_kaltmiete', 'kurzzeit_nk', 'jahres_kaltmiete', 'jahres_nk', 'kaltmiete', 'nk_pauschale', 'mietvertrag_miete']) k
    cross join lateral (select case when trim(j.rj ->> k) ~ '^-?\d+(\.\d+)?$' then trim(j.rj ->> k)::numeric end as v) x
  ) n
),
a as (
  select p.id, p.tenant_id, p.valid_from, p.kind, p.source, p.note,
         coalesce(p.pauschale, coalesce(p.kaltmiete, 0) + coalesce(p.nebenkosten, 0)) as amt,
         t.name, t.room, t.status, t.tj,
         coalesce(nullif(p.contract_type, ''), nullif(t.tj ->> 'contract_type', ''), rm.room_ct) as ct,
         rm.kz_k, rm.kz_n, rm.jv_n, rm.mv_k, rm.mv_n, rm.mv_old, rm.jv_own
  from rent_periods p
  left join ten t on t.tid = p.tenant_id
  left join rm on rm.rk = t.rk and t.rk <> ''
  where p.app = 'casa' and p.mode = 'pauschal' and coalesce(p.nebenkosten, 0) = 0
),
ev as (
  select a.*, o.nk as other_nk, o.valid_from as other_from,
         case when not exists (select 1 from rent_periods k where k.app = 'casa' and k.tenant_id = a.tenant_id and k.mode = 'kalt_nk')
                   and trim(a.tj ->> 'nebenkosten') ~ '^\d+(\.\d+)?$' then nullif(trim(a.tj ->> 'nebenkosten')::numeric, 0) end as ten_nk,
         case when a.ct = 'kurzzeit' then case when coalesce(a.kz_k, 0) <> 0 then nullif(a.kz_n, 0) end
              when a.ct = 'jahres' and a.jv_own then nullif(a.jv_n, 0)
              when a.ct in ('mietvertrag', 'jahres') and (coalesce(a.mv_k, 0) <> 0 or coalesce(a.mv_old, 0) <> 0) then nullif(a.mv_n, 0) end as room_nk
  from a
  left join lateral (select o.nebenkosten as nk, o.valid_from from rent_periods o
                     where o.app = 'casa' and o.tenant_id = a.tenant_id and o.id <> a.id and o.mode = 'pauschal' and coalesce(o.nebenkosten, 0) > 0
                     order by abs(o.valid_from - a.valid_from), o.valid_from limit 1) o on true
)
select 'A' as chk,
       case when other_nk is not null then 1 when ten_nk is not null then 2 else 3 end as strength,
       coalesce(room, '?') as room, coalesce(name, 'tenant ' || tenant_id || ' (not found)') as tenant, status,
       to_char(valid_from, 'DD.MM.YYYY') as entry_from,
       translate(to_char(amt, 'FM999G999G990D00'), ',.', '.,') as pauschale,
       translate(to_char(coalesce(other_nk, ten_nk, room_nk), 'FM999G999G990D00'), ',.', '.,') as nk_part_found,
       case when other_nk is not null then 'the entry from ' || to_char(other_from, 'DD.MM.YYYY') || ' of this tenancy has davon NK ' ||
                                           translate(to_char(other_nk, 'FM999G999G990D00'), ',.', '.,') || ' — this one has none'
            when ten_nk is not null then 'the tenant card still has Nebenkosten ' || translate(to_char(ten_nk, 'FM999G999G990D00'), ',.', '.,') ||
                                         ' (the Pauschale was kept as Kalt + NK) — the entry has no NK part'
            else 'the room has NK ' || translate(to_char(room_nk, 'FM999G999G990D00'), ',.', '.,') || ' for a ' ||
                 case ct when 'kurzzeit' then 'Kurzzeit' when 'jahres' then 'Jahresvertrag' else 'Mietvertrag' end ||
                 ' — the entry has none, check the contract' end ||
       case when source = 'generator' then ' · saved by Create contract (Approve)'
            when note in ('confirmed in tenant history', 'Miete vom Mieter übernommen') then ' · saved by Controlling (CONTROLLING-PAUSCHAL-NK.sql repairs these)'
            when kind = 'renewal' then ' · saved by a renewal'
            else ' · ' || kind || coalesce(' / ' || source, '') end as why
from ev
where amt > 0 and (other_nk is not null or ten_nk is not null or room_nk is not null)
order by strength, room, tenant, valid_from;


-- ── B · Renewals that took the ROOM's NK part instead of the tenant's own ──────────────────────────────────
-- What: a renewal (Verlängerung) of a Pauschal tenancy whose "davon NK" differs from the tenancy's entry before it.
--       Before the fix, Renew prefilled the NK part from the room (Rooms › Mietvertrag / Kurzzeit NK), not from the tenant.
-- strength 1 = the renewal's NK part is exactly one of the room's NK amounts today ·
--          2 = it differs from the entry before and was saved before the fix (09.11.2026) — the room's NK may have
--              changed since (Preisliste 07.11.2026), so it no longer matches
-- Needs: rent_periods (UPDATE.sql § 1) · tenant_records, rooms
with
ten as (
  select t.id::text as tid, j.tj,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status
  from tenant_records t cross join lateral (select to_jsonb(t) as tj) j
),
rm as (
  select regexp_replace(lower(coalesce(j.rj ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         n.kz_n, n.jv_n, n.mv_n, coalesce(j.rj ->> 'jahres_kaltmiete', '') <> '' as jv_own
  from rooms r
  cross join lateral (select to_jsonb(r) as rj) j
  cross join lateral (
    select max(v) filter (where k = 'kurzzeit_nk') as kz_n, max(v) filter (where k = 'jahres_nk') as jv_n, max(v) filter (where k = 'nk_pauschale') as mv_n
    from unnest(array['kurzzeit_nk', 'jahres_nk', 'nk_pauschale']) k
    cross join lateral (select case when trim(j.rj ->> k) ~ '^-?\d+(\.\d+)?$' then trim(j.rj ->> k)::numeric end as v) x
  ) n
),
ren as (
  select p.id, p.tenant_id, p.valid_from, p.created_at, p.nebenkosten as nk,
         coalesce(p.pauschale, coalesce(p.kaltmiete, 0) + coalesce(p.nebenkosten, 0)) as amt,
         pv.valid_from as prev_from, pv.nebenkosten as prev_nk
  from rent_periods p
  join lateral (select o.* from rent_periods o
                where o.app = 'casa' and o.tenant_id = p.tenant_id and o.valid_from < p.valid_from
                order by o.valid_from desc, o.created_at desc limit 1) pv on true
  where p.app = 'casa' and p.kind = 'renewal' and p.mode = 'pauschal' and pv.mode = 'pauschal'
    and coalesce(p.nebenkosten, 0) <> coalesce(pv.nebenkosten, 0)
),
m as (
  select ren.*, t.name, t.room, t.status,
         case when rm.rk is null then null
              when coalesce(ren.nk, 0) = coalesce(rm.mv_n, 0) then 'the room''s Mietvertrag NK'
              when coalesce(ren.nk, 0) = coalesce(rm.kz_n, 0) then 'the room''s Kurzzeit NK'
              when rm.jv_own and coalesce(ren.nk, 0) = coalesce(rm.jv_n, 0) then 'the room''s Jahresvertrag NK' end as room_match
  from ren
  left join ten t on t.tid = ren.tenant_id
  left join rm on rm.rk = t.rk and t.rk <> ''
)
select 'B' as chk, case when room_match is not null then 1 else 2 end as strength,
       coalesce(room, '?') as room, coalesce(name, 'tenant ' || tenant_id || ' (not found)') as tenant, status,
       to_char(valid_from, 'DD.MM.YYYY') as renewal_from,
       translate(to_char(amt, 'FM999G999G990D00'), ',.', '.,') as pauschale,
       translate(to_char(coalesce(nk, 0), 'FM999G999G990D00'), ',.', '.,') as renewal_nk_part,
       translate(to_char(coalesce(prev_nk, 0), 'FM999G999G990D00'), ',.', '.,') as own_nk_part_before,
       case when room_match is not null
            then 'the renewal''s NK part is ' || room_match || ', the tenant had ' ||
                 translate(to_char(coalesce(prev_nk, 0), 'FM999G999G990D00'), ',.', '.,') || ' (entry from ' || to_char(prev_from, 'DD.MM.YYYY') || ')'
            else 'differs from the tenant''s own NK part before (entry from ' || to_char(prev_from, 'DD.MM.YYYY') ||
                 ') — saved before the fix, maybe the room''s NK of that time' end as why
from m
where room_match is not null or created_at is null or created_at < timestamptz '2026-11-09 00:00:00+01'
order by strength, room, tenant, valid_from;


-- ── C · Add former tenant: Pauschale saved with the room's NK on top (typed 600 → saved 700) ────────────────
-- What: before the fix, "Add former tenant" with Rent = Pauschal added the room's NK (for the contract type) to the
--       amount typed. Both the rent entry and the tenant card then show the higher Pauschale; nothing in the data
--       tells the typed amount apart from a right one. So this lists every Pauschale saved that way that is NOT the
--       room's own list Pauschale (rent left empty = room Kalt + room NK = right) — "typed_probably" = saved − room NK.
-- Limits: · the room prices of today are used (Preisliste 07.11.2026 changed them) — a former tenant whose rent was
--           left empty under the OLD prices also shows here; a Pauschale typed equal to the room's Kalt does not.
--         · "Add next tenant" rows that later became former look the same — they are left out when the tenant was
--           entered before the move-in (Add former tenant is for stays already lived).
--         · only rows saved before 09.11.2026. C2 compares them with Controlling's bookings — run it next.
-- Needs: rent_periods (UPDATE.sql § 1) · tenant_records, rooms
with
ten as (
  select t.id::text as tid, j.tj,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status, d.mb, d.me,
         case when (j.tj ->> 'created_at') ~ '^\d{4}-\d{2}-\d{2}' then left(j.tj ->> 'created_at', 10)::date end as entered
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'mietende') as me
    from unnest(array['mietbeginn', 'mietende']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
),
rm as (
  select regexp_replace(lower(coalesce(j.rj ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         n.kz_k, n.kz_n, n.jv_k, n.jv_n, n.mv_k, n.mv_n, n.mv_old, coalesce(j.rj ->> 'jahres_kaltmiete', '') <> '' as jv_own,
         case when j.rj ->> 'active_price_type' = 'mietvertrag' and (coalesce(n.mv_k, 0) <> 0 or coalesce(n.mv_old, 0) <> 0) then 'mietvertrag'
              when j.rj ->> 'active_price_type' = 'kurzzeit' and coalesce(n.kz_k, 0) <> 0 then 'kurzzeit'
              when coalesce(n.mv_k, 0) <> 0 or coalesce(n.mv_old, 0) <> 0 then 'mietvertrag'
              when coalesce(n.kz_k, 0) <> 0 then 'kurzzeit' end as room_ct
  from rooms r
  cross join lateral (select to_jsonb(r) as rj) j
  cross join lateral (
    select max(v) filter (where k = 'kurzzeit_kaltmiete') as kz_k, max(v) filter (where k = 'kurzzeit_nk') as kz_n,
           max(v) filter (where k = 'jahres_kaltmiete') as jv_k,   max(v) filter (where k = 'jahres_nk') as jv_n,
           max(v) filter (where k = 'kaltmiete') as mv_k,          max(v) filter (where k = 'nk_pauschale') as mv_n,
           max(v) filter (where k = 'mietvertrag_miete') as mv_old
    from unnest(array['kurzzeit_kaltmiete', 'kurzzeit_nk', 'jahres_kaltmiete', 'jahres_nk', 'kaltmiete', 'nk_pauschale', 'mietvertrag_miete']) k
    cross join lateral (select case when trim(j.rj ->> k) ~ '^-?\d+(\.\d+)?$' then trim(j.rj ->> k)::numeric end as v) x
  ) n
),
c as (
  select p.id, p.valid_from, p.nebenkosten as nk_in, coalesce(p.pauschale, coalesce(p.kaltmiete, 0) + coalesce(p.nebenkosten, 0)) as amt,
         t.tid, t.name, t.room, t.status, t.mb, t.me, t.tj,
         coalesce(nullif(t.tj ->> 'contract_type', ''), nullif(p.contract_type, ''), rm.room_ct) as ct,
         rm.kz_k, rm.kz_n, rm.jv_k, rm.jv_n, rm.mv_k, rm.mv_n, rm.mv_old, rm.jv_own
  from rent_periods p
  join ten t on t.tid = p.tenant_id
  join rm on rm.rk = t.rk and t.rk <> ''
  where p.app = 'casa' and p.mode = 'pauschal' and p.kind = 'migrated' and p.source = 'tenant_form' and p.note is null
    and t.status in ('former', 'archived') and p.valid_from = t.mb
    and (t.entered is null or t.entered > t.mb)                                  -- entered after the move-in (a stay already lived)
    and (p.created_at is null or p.created_at < timestamptz '2026-11-09 00:00:00+01')
),
c2 as (                                     -- the room's NK and Kalt for this contract type, as the form read them
  select c.*,
         case when ct = 'kurzzeit' then case when coalesce(kz_k, 0) <> 0 then nullif(kz_n, 0) end
              when ct = 'jahres' and jv_own then nullif(jv_n, 0)
              when ct in ('mietvertrag', 'jahres') and (coalesce(mv_k, 0) <> 0 or coalesce(mv_old, 0) <> 0) then nullif(mv_n, 0) end as room_nk,
         case when ct = 'kurzzeit' then nullif(kz_k, 0)
              when ct = 'jahres' and jv_own then nullif(jv_k, 0)
              when ct in ('mietvertrag', 'jahres') then coalesce(nullif(mv_k, 0), nullif(mv_old - coalesce(mv_n, 0), 0)) end as room_kalt
  from c
)
select 'C' as chk,
       case when trim(tj ->> 'nebenkosten') ~ '^\d+(\.\d+)?$' and trim(tj ->> 'nebenkosten')::numeric = room_nk then 1 else 2 end as strength,
       room, name as tenant, status, to_char(mb, 'DD.MM.YYYY') || ' – ' || coalesce(to_char(me, 'DD.MM.YYYY'), '?') as stay,
       case ct when 'kurzzeit' then 'Kurzzeit' when 'jahres' then 'Jahresvertrag' when 'mietvertrag' then 'Mietvertrag' else ct end as contract,
       translate(to_char(amt, 'FM999G999G990D00'), ',.', '.,') as pauschale_saved,
       translate(to_char(room_nk, 'FM999G999G990D00'), ',.', '.,') as room_nk,
       translate(to_char(amt - room_nk, 'FM999G999G990D00'), ',.', '.,') as typed_probably,
       case when trim(tj ->> 'nebenkosten') ~ '^\d+(\.\d+)?$' and trim(tj ->> 'nebenkosten')::numeric = room_nk
            then 'the tenant card still shows the room NK ' || translate(to_char(room_nk, 'FM999G999G990D00'), ',.', '.,') || ' next to the typed rent'
            else 'saved Pauschale is not the room''s list Pauschale (' || translate(to_char(coalesce(room_kalt, 0) + room_nk, 'FM999G999G990D00'), ',.', '.,') ||
                 ') — if you typed ' || translate(to_char(amt - room_nk, 'FM999G999G990D00'), ',.', '.,') || ', the room NK was added on top' end as why
from c2
where room_nk > 0 and amt > room_nk and round(amt, 2) <> round(coalesce(room_kalt, 0) + room_nk, 2)
order by strength, room, mb;


-- ── C2 · the rows of C, compared with Controlling's bookings (what the tenant actually paid) ────────────────
-- For every month fully inside the stay, the rent booked in Controlling for the room (Kalt + NK of the month,
-- months split between two tenants left out). The most frequent amount decides:
--   = typed_probably → the Pauschale is too high by the room NK (fix it) · = saved → probably right.
-- Limit: if a month was booked by copying the Soll, it repeats the (wrong) saved amount.
-- Needs: as C, plus ctrl_units and ctrl_income_months (Controlling's own tables)
with
ten as (
  select t.id::text as tid, j.tj,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status, d.mb, d.me,
         case when (j.tj ->> 'created_at') ~ '^\d{4}-\d{2}-\d{2}' then left(j.tj ->> 'created_at', 10)::date end as entered
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'mietende') as me
    from unnest(array['mietbeginn', 'mietende']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
),
rm as (
  select j.rj ->> 'id' as room_id, regexp_replace(lower(coalesce(j.rj ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         n.kz_k, n.kz_n, n.jv_k, n.jv_n, n.mv_k, n.mv_n, n.mv_old, coalesce(j.rj ->> 'jahres_kaltmiete', '') <> '' as jv_own,
         case when j.rj ->> 'active_price_type' = 'mietvertrag' and (coalesce(n.mv_k, 0) <> 0 or coalesce(n.mv_old, 0) <> 0) then 'mietvertrag'
              when j.rj ->> 'active_price_type' = 'kurzzeit' and coalesce(n.kz_k, 0) <> 0 then 'kurzzeit'
              when coalesce(n.mv_k, 0) <> 0 or coalesce(n.mv_old, 0) <> 0 then 'mietvertrag'
              when coalesce(n.kz_k, 0) <> 0 then 'kurzzeit' end as room_ct
  from rooms r
  cross join lateral (select to_jsonb(r) as rj) j
  cross join lateral (
    select max(v) filter (where k = 'kurzzeit_kaltmiete') as kz_k, max(v) filter (where k = 'kurzzeit_nk') as kz_n,
           max(v) filter (where k = 'jahres_kaltmiete') as jv_k,   max(v) filter (where k = 'jahres_nk') as jv_n,
           max(v) filter (where k = 'kaltmiete') as mv_k,          max(v) filter (where k = 'nk_pauschale') as mv_n,
           max(v) filter (where k = 'mietvertrag_miete') as mv_old
    from unnest(array['kurzzeit_kaltmiete', 'kurzzeit_nk', 'jahres_kaltmiete', 'jahres_nk', 'kaltmiete', 'nk_pauschale', 'mietvertrag_miete']) k
    cross join lateral (select case when trim(j.rj ->> k) ~ '^-?\d+(\.\d+)?$' then trim(j.rj ->> k)::numeric end as v) x
  ) n
),
c as (
  select p.id, coalesce(p.pauschale, coalesce(p.kaltmiete, 0) + coalesce(p.nebenkosten, 0)) as amt,
         t.tid, t.name, t.room, t.mb, t.me, rm.room_id, rm.rk,
         coalesce(nullif(t.tj ->> 'contract_type', ''), nullif(p.contract_type, ''), rm.room_ct) as ct,
         rm.kz_k, rm.kz_n, rm.jv_k, rm.jv_n, rm.mv_k, rm.mv_n, rm.mv_old, rm.jv_own
  from rent_periods p
  join ten t on t.tid = p.tenant_id
  join rm on rm.rk = t.rk and t.rk <> ''
  where p.app = 'casa' and p.mode = 'pauschal' and p.kind = 'migrated' and p.source = 'tenant_form' and p.note is null
    and t.status in ('former', 'archived') and p.valid_from = t.mb
    and (t.entered is null or t.entered > t.mb)
    and (p.created_at is null or p.created_at < timestamptz '2026-11-09 00:00:00+01')
),
c2 as (
  select c.*,
         case when ct = 'kurzzeit' then case when coalesce(kz_k, 0) <> 0 then nullif(kz_n, 0) end
              when ct = 'jahres' and jv_own then nullif(jv_n, 0)
              when ct in ('mietvertrag', 'jahres') and (coalesce(mv_k, 0) <> 0 or coalesce(mv_old, 0) <> 0) then nullif(mv_n, 0) end as room_nk,
         case when ct = 'kurzzeit' then nullif(kz_k, 0)
              when ct = 'jahres' and jv_own then nullif(jv_k, 0)
              when ct in ('mietvertrag', 'jahres') then coalesce(nullif(mv_k, 0), nullif(mv_old - coalesce(mv_n, 0), 0)) end as room_kalt
  from c
),
flag as (select * from c2 where room_nk > 0 and amt > room_nk and round(amt, 2) <> round(coalesce(room_kalt, 0) + room_nk, 2)),
unit as (                                   -- the Controlling unit of the room (linked by room ID / name, else the unit name)
  select u.id as unit_id, r.rk
  from ctrl_units u
  cross join lateral (select to_jsonb(u) as uj) j
  join rm r on case when coalesce(j.uj ->> 'source_type', '') = 'casa_room' and coalesce(j.uj ->> 'source_ref', '') <> ''
                    then r.room_id = j.uj ->> 'source_ref' or r.rk = regexp_replace(lower(j.uj ->> 'source_ref'), '[^a-z0-9äöüß]', '', 'g')
                    else coalesce(j.uj ->> 'source_type', '') = '' and r.rk = regexp_replace(lower(coalesce(u.name, '')), '[^a-z0-9äöüß]', '', 'g') end
  where u.property_id = 7
),
bk as (
  select f.id, mode() within group (order by i.tot) as typical, count(*) as months
  from flag f
  join unit un on un.rk = f.rk
  join lateral (select coalesce(i.kaltmiete, 0) + coalesce(i.nebenkosten, 0) as tot, i.year, i.month, to_jsonb(i) -> 'split' as sp
                from ctrl_income_months i where i.unit_id = un.unit_id) i on true
  where f.me is not null
    and make_date(i.year, i.month, 1) >= f.mb and (make_date(i.year, i.month, 1) + interval '1 month - 1 day')::date <= f.me
    and (i.sp is null or jsonb_typeof(i.sp) <> 'object' or i.sp = '{}'::jsonb) and i.tot > 0
  group by f.id
)
select 'C2' as chk, f.room, f.name as tenant, to_char(f.mb, 'DD.MM.YYYY') || ' – ' || coalesce(to_char(f.me, 'DD.MM.YYYY'), '?') as stay,
       translate(to_char(f.amt, 'FM999G999G990D00'), ',.', '.,') as pauschale_saved,
       translate(to_char(f.amt - f.room_nk, 'FM999G999G990D00'), ',.', '.,') as typed_probably,
       translate(to_char(b.typical, 'FM999G999G990D00'), ',.', '.,') as booked_mostly, coalesce(b.months, 0) as months_booked,
       case when b.id is null then 'no rent booked in Controlling for these months — check the contract'
            when round(b.typical, 2) = round(f.amt - f.room_nk, 2) then 'WRONG: the tenant paid the typed amount — the Pauschale is ' ||
                 translate(to_char(f.room_nk, 'FM999G999G990D00'), ',.', '.,') || ' too high'
            when round(b.typical, 2) = round(f.amt, 2) then 'bookings match the saved Pauschale — probably right'
            else 'bookings match neither — check the contract' end as verdict
from flag f left join bk b on b.id = f.id
order by case when b.id is null then 2 when round(b.typical, 2) = round(f.amt - f.room_nk, 2) then 0
              when round(b.typical, 2) = round(f.amt, 2) then 3 else 1 end, f.room, f.mb;


-- ── D · Kurzzeit stays over 3 months with a Kaution Soll of 1× the rent ─────────────────────────────────────
-- Rule (kaution.js): Kurzzeit ≤ 3 Monate → 1× · > 3 Monate → 3× (Pauschal: the Pauschale · Kalt + NK: the Kaltmiete).
-- Before the fix, "Add next tenant", the new-tenant form and the automatic Soll freeze took 1× while the stay's end
-- was still unknown.
-- Stay end = move-out, else Contract end (tenant card), else the day before the first renewal, else the contract end
-- of the first rent entry. Flagged when the Kaution Soll is about 1× (0,5×–1,5×) the tenant's own rent at move-in,
-- or exactly 1× the room's Kurzzeit price of today. Archived tenancies (Kaution settled) are left out.
-- Needs: rent_periods (UPDATE.sql § 1) · tenant_records, rooms
with
ten as (
  select t.id::text as tid, j.tj,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status, d.mb, d.me, d.ve, d.vb,
         case when trim(j.tj ->> 'kaution_soll') ~ '^-?\d+(\.\d+)?$' then trim(j.tj ->> 'kaution_soll')::numeric end as ks,
         case when trim(j.tj ->> 'kaltmiete') ~ '^-?\d+(\.\d+)?$' then trim(j.tj ->> 'kaltmiete')::numeric end as t_k,
         case when trim(j.tj ->> 'nebenkosten') ~ '^-?\d+(\.\d+)?$' then trim(j.tj ->> 'nebenkosten')::numeric end as t_n
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'mietende') as me,
           max(v) filter (where k = 'vertragsende') as ve, max(v) filter (where k = 'vertragsbeginn') as vb
    from unnest(array['mietbeginn', 'mietende', 'vertragsende', 'vertragsbeginn']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
),
rm as (
  select regexp_replace(lower(coalesce(j.rj ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') as rk, j.rj ->> 'kurzzeit_pricing' as kz_pricing, n.kz_k, n.kz_n
  from rooms r
  cross join lateral (select to_jsonb(r) as rj) j
  cross join lateral (
    select max(v) filter (where k = 'kurzzeit_kaltmiete') as kz_k, max(v) filter (where k = 'kurzzeit_nk') as kz_n
    from unnest(array['kurzzeit_kaltmiete', 'kurzzeit_nk']) k
    cross join lateral (select case when trim(j.rj ->> k) ~ '^-?\d+(\.\d+)?$' then trim(j.rj ->> k)::numeric end as v) x
  ) n
),
d as (
  select t.*,
         coalesce((select o.contract_type from rent_periods o where o.app = 'casa' and o.tenant_id = t.tid and o.kind <> 'renewal'
                   and coalesce(o.contract_type, '') <> '' order by o.valid_from limit 1), nullif(t.tj ->> 'contract_type', '')) as ct,
         (select min(o.valid_from) from rent_periods o where o.app = 'casa' and o.tenant_id = t.tid and o.kind = 'renewal'
                 and o.valid_from > coalesce(t.vb, t.mb)) as first_ren,
         e0.mode as e_mode, e0.contract_end as e_end,
         case when e0.mode = 'pauschal' then coalesce(e0.pauschale, coalesce(e0.kaltmiete, 0) + coalesce(e0.nebenkosten, 0)) else e0.kaltmiete end as e_base
  from ten t
  left join lateral (select o.* from rent_periods o where o.app = 'casa' and o.tenant_id = t.tid    -- the entry in force at move-in (else the first)
                     order by (o.valid_from <= t.mb) desc, case when o.valid_from <= t.mb then o.valid_from end desc, o.valid_from
                     limit 1) e0 on true
  where t.status <> 'archived' and t.mb is not null
),
k as (
  select d.*, coalesce(d.me, d.ve, d.first_ren - 1, d.e_end) as stay_end,
         coalesce(d.e_base, case when coalesce(rm.kz_pricing, 'pauschal') <> 'kalt_nk' then d.t_k + coalesce(d.t_n, 0) else d.t_k end) as base,
         case when rm.kz_pricing = 'kalt_nk' then rm.kz_k else rm.kz_k + coalesce(rm.kz_n, 0) end as room_1x
  from d left join rm on rm.rk = d.rk and d.rk <> ''
  where d.ct = 'kurzzeit'
)
select 'D' as chk, room, name as tenant, status,
       to_char(mb, 'DD.MM.YYYY') || ' – ' || to_char(stay_end, 'DD.MM.YYYY') as stay,
       translate(to_char(ks, 'FM999G999G990D00'), ',.', '.,') as kaution_soll,
       translate(to_char(base, 'FM999G999G990D00'), ',.', '.,') as rent_at_move_in,
       translate(to_char(ks / nullif(base, 0), 'FM990D0'), ',.', '.,') || '×' as times_rent,
       translate(to_char(3 * base, 'FM999G999G990D00'), ',.', '.,') as rule_3x,
       'stay ' || (stay_end - mb + 1) || ' days (over 3 months) — Kaution Soll ' ||
       case when base > 0 and ks between 0.5 * base and 1.5 * base then 'is about 1× the rent' else 'is 1× the room''s Kurzzeit price' end ||
       ', the rule says 3×' as why
from k
where ks > 0 and stay_end is not null and stay_end >= (mb + interval '3 months')::date
  and ((base > 0 and ks between 0.5 * base and 1.5 * base) or (room_1x > 0 and round(ks, 2) = round(room_1x, 2)))
order by room, mb;


-- ── E · Tenants still "active" while a later tenant of the room has already moved in ───────────────────────
-- Before the fix, "Add next tenant" did not set the current tenant's move-out. Controlling then counts two rents
-- for the room, and the NK-Abrechnung counts the old tenant's months on (overlap).
-- Fix in Tenants: set the move-out (usually the day before the next move-in) and mark the tenant as former.
-- Needs: tenant_records
with
ten as (
  select t.id::text as tid,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status, d.mb, d.me
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'mietende') as me
    from unnest(array['mietbeginn', 'mietende']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
)
select 'E' as chk, a.room, a.name as tenant_still_active, to_char(a.mb, 'DD.MM.YYYY') as moved_in,
       coalesce(to_char(a.me, 'DD.MM.YYYY'), '—') as move_out, b.name as next_tenant, b.status as next_status,
       to_char(b.mb, 'DD.MM.YYYY') as next_moved_in,
       case when a.me is null then 'no move-out — should end ' || to_char(b.mb - 1, 'DD.MM.YYYY') || ' (the day before the next move-in)'
            else 'move-out is on or after the next move-in — should end ' || to_char(b.mb - 1, 'DD.MM.YYYY') end as why
from ten a
join lateral (select b.* from ten b where b.rk = a.rk and b.tid <> a.tid and b.mb > a.mb and b.mb <= current_date
              order by b.mb limit 1) b on true
where a.status = 'active' and a.rk <> '' and a.mb is not null and (a.me is null or a.me >= b.mb)
order by a.room, a.mb;


-- ── F · Contract end: tenant card ≠ rent history ────────────────────────────────────────────────────────────
-- The tenant card's "Contract end" (vertragsende) compared with the contract end saved in the rent history: the
-- latest renewal (Verlängerung), else the latest entry that has an end. Before the fix, changing a renewal's end in
-- Tenants updated only the card; Controlling's checks and the history screen read the entry.
-- Archived tenancies are left out. Fix: open the contract in Tenants and save the right end again (both get it).
-- Needs: rent_periods (UPDATE.sql § 1) · tenant_records
with
ten as (
  select t.id::text as tid,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, coalesce(j.tj ->> 'status', '') as status, d.mb, d.ve, d.vb
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'vertragsende') as ve, max(v) filter (where k = 'vertragsbeginn') as vb
    from unnest(array['mietbeginn', 'vertragsende', 'vertragsbeginn']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
)
select 'F' as chk, t.room, t.name as tenant, t.status,
       case when r.kind = 'renewal' then 'Verlängerung from ' else 'entry from ' end || to_char(r.valid_from, 'DD.MM.YYYY') as rent_entry,
       coalesce(to_char(r.contract_end, 'DD.MM.YYYY'), '— (none)') as end_in_rent_history,
       coalesce(to_char(t.ve, 'DD.MM.YYYY'), '— (none)') as end_on_tenant_card,
       case when t.ve is null then 'the tenant card has no Contract end'
            when r.contract_end is null then 'the renewal has no end, the tenant card has ' || to_char(t.ve, 'DD.MM.YYYY')
            else 'the two ends differ by ' || abs(t.ve - r.contract_end) || ' days' end as why
from ten t
join lateral (select o.* from rent_periods o
              where o.app = 'casa' and o.tenant_id = t.tid
                and ((o.kind = 'renewal' and o.valid_from > coalesce(t.vb, t.mb, '-infinity'::date)) or o.contract_end is not null)
              order by o.valid_from desc, o.created_at desc limit 1) r on true
where t.status <> 'archived' and r.contract_end is distinct from t.ve
order by t.room, t.name;


-- ── G · Korrektur damage: an old rent amount equal to a LATER Mieterhöhung ──────────────────────────────────
-- Before the fix, "Change rent › Korrektur" wrote today's rent — with the running Mieterhöhung in it — into the
-- rent entry, so the months BEFORE the Mieterhöhung got the increased amount too. What is left in the data:
-- a Mieterhöhung (started, not skipped) that raises nothing, because
--   1 · the rent entry in force before it already carries its amount (Pauschale, or Kaltmiete for Kalt + NK), or
--   2 · the Mieterhöhung before it (same rent entry) has the same amount.
-- Limits: the old amount itself is gone — take it from the contract or Controlling's bookings. A Mieterhöhung typed
-- on purpose with the amount already paid also shows. Steps without a tenant link are matched by room + dates.
-- Fix: Tenants › Change rent › Korrektur › "Correct the rent before …" and type the old amount.
-- Needs: casa_mieterhoehung_history (Mieterhöhungen, Oct 2026) · rent_periods (UPDATE.sql § 1) · tenant_records
with
ten as (
  select t.id::text as tid,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status, d.mb, d.me
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'mietende') as me
    from unnest(array['mietbeginn', 'mietende']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
),
mh as (
  select j.mj ->> 'id' as mid, j.mj ->> 'tenant_id' as m_tid, left(j.mj ->> 'effective_date', 10)::date as m_from,
         (j.mj ->> 'amount')::numeric as m_amt, coalesce(j.mj ->> 'kind', 'mieterhoehung') as m_kind,
         regexp_replace(lower(coalesce(j.mj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as m_rk
  from casa_mieterhoehung_history m cross join lateral (select to_jsonb(m) as mj) j
  where coalesce(j.mj ->> 'ignored', 'false') <> 'true' and coalesce(j.mj ->> 'kind', '') <> 'start'
    and (j.mj ->> 'effective_date') ~ '^\d{4}-\d{2}-\d{2}' and (j.mj ->> 'amount') ~ '^-?\d+(\.\d+)?$'
),
own as (                                    -- each Mieterhöhung → its tenancy (tenant link, else room + dates)
  select mh.*, t.tid, t.name, t.room, t.status
  from mh join ten t on case when coalesce(mh.m_tid, '') <> '' then t.tid = mh.m_tid
                             else t.rk = mh.m_rk and t.rk <> '' and t.mb is not null and mh.m_from >= t.mb and mh.m_from <= coalesce(t.me, 'infinity'::date) end
),
g as (
  select o.*, p.valid_from as p_from, p.mode as p_mode,
         case when p.mode = 'pauschal' then coalesce(p.pauschale, coalesce(p.kaltmiete, 0) + coalesce(p.nebenkosten, 0)) else p.kaltmiete end as p_amt,
         pm.m_from as pm_from, pm.m_amt as pm_amt
  from own o
  left join lateral (select p.* from rent_periods p where p.app = 'casa' and p.tenant_id = o.tid and p.valid_from < o.m_from
                     order by p.valid_from desc, p.created_at desc limit 1) p on true
  left join lateral (select o2.m_from, o2.m_amt from own o2 where o2.tid = o.tid and o2.m_from < o.m_from
                       and (p.valid_from is null or o2.m_from >= p.valid_from)
                     order by o2.m_from desc limit 1) pm on true
  where o.m_from <= current_date
)
select 'G' as chk, room, name as tenant, status,
       to_char(m_from, 'DD.MM.YYYY') as mieterhoehung_from, translate(to_char(m_amt, 'FM999G999G990D00'), ',.', '.,') as mieterhoehung,
       case when round(p_amt, 2) = round(m_amt, 2) then 'rent entry from ' || to_char(p_from, 'DD.MM.YYYY')
            else 'Mieterhöhung from ' || to_char(pm_from, 'DD.MM.YYYY') end as older_row,
       translate(to_char(case when round(p_amt, 2) = round(m_amt, 2) then p_amt else pm_amt end, 'FM999G999G990D00'), ',.', '.,') as older_amount,
       case when round(p_amt, 2) = round(m_amt, 2)
            then 'the rent entry already has the increased ' || case when p_mode = 'pauschal' then 'Pauschale' else 'Kaltmiete' end ||
                 ' — ' || to_char(p_from, 'DD.MM.YYYY') || ' to ' || to_char(m_from - 1, 'DD.MM.YYYY') || ' should show the old rent'
            else 'the Mieterhöhung before it has the same amount — one of them was overwritten' end as why
from g
where (p_from is not null and round(p_amt, 2) = round(m_amt, 2)) or (pm_from is not null and round(pm_amt, 2) = round(m_amt, 2))
order by room, tenant, m_from;


-- ── G2 · Korrektur damage on the NK: an old Nebenkosten amount equal to a LATER NK-Anpassung ────────────────
-- The same for Kalt + NK tenants: the rent entry's Nebenkosten (or the NK-Anpassung before) already carries the amount
-- of a later NK-Anpassung (started, not skipped) → the NK-Vorauszahlung before it is too high in the NK letter.
-- Fix: Tenants › Change rent › Korrektur › "Correct the rent before …" → Nebenkosten.
-- Needs: nk_vorauszahlung_history (the app's table; tenant link from UPDATE.sql § 2) · rent_periods · tenant_records
with
ten as (
  select t.id::text as tid,
         coalesce(nullif(trim(coalesce(j.tj ->> 'first_name', '') || ' ' || coalesce(j.tj ->> 'last_name', '')), ''), 'tenant ' || t.id) as name,
         j.tj ->> 'room' as room, regexp_replace(lower(coalesce(j.tj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as rk,
         coalesce(j.tj ->> 'status', '') as status, d.mb, d.me
  from tenant_records t
  cross join lateral (select to_jsonb(t) as tj) j
  cross join lateral (
    select max(v) filter (where k = 'mietbeginn') as mb, max(v) filter (where k = 'mietende') as me
    from unnest(array['mietbeginn', 'mietende']) k
    cross join lateral (select trim(j.tj ->> k) as s) s
    cross join lateral (select case when s.s ~ '^\d{4}-\d{2}-\d{2}' then left(s.s, 10)::date
                                    when s.s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s.s, 'DD.MM.YYYY') end as v) x
  ) d
),
nk as (
  select j.nj ->> 'tenant_id' as n_tid, left(j.nj ->> 'effective_date', 10)::date as n_from, (j.nj ->> 'amount')::numeric as n_amt,
         regexp_replace(lower(coalesce(j.nj ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') as n_rk
  from nk_vorauszahlung_history n cross join lateral (select to_jsonb(n) as nj) j
  where coalesce(j.nj ->> 'ignored', 'false') <> 'true'
    and (j.nj ->> 'effective_date') ~ '^\d{4}-\d{2}-\d{2}' and (j.nj ->> 'amount') ~ '^-?\d+(\.\d+)?$'
),
own as (
  select nk.*, t.tid, t.name, t.room, t.status
  from nk join ten t on case when coalesce(nk.n_tid, '') <> '' then t.tid = nk.n_tid
                             else t.rk = nk.n_rk and t.rk <> '' and t.mb is not null and nk.n_from >= t.mb and nk.n_from <= coalesce(t.me, 'infinity'::date) end
),
g as (
  select o.*, p.valid_from as p_from, p.mode as p_mode, p.nebenkosten as p_nk, pn.n_from as pn_from, pn.n_amt as pn_amt
  from own o
  left join lateral (select p.* from rent_periods p where p.app = 'casa' and p.tenant_id = o.tid and p.valid_from < o.n_from
                     order by p.valid_from desc, p.created_at desc limit 1) p on true
  left join lateral (select o2.n_from, o2.n_amt from own o2 where o2.tid = o.tid and o2.n_from < o.n_from
                       and (p.valid_from is null or o2.n_from >= p.valid_from)
                     order by o2.n_from desc limit 1) pn on true
  where o.n_from <= current_date
)
select 'G2' as chk, room, name as tenant, status,
       to_char(n_from, 'DD.MM.YYYY') as nk_anpassung_from, translate(to_char(n_amt, 'FM999G999G990D00'), ',.', '.,') as nk_anpassung,
       case when p_mode = 'kalt_nk' and round(p_nk, 2) = round(n_amt, 2) then 'rent entry from ' || to_char(p_from, 'DD.MM.YYYY')
            else 'NK-Anpassung from ' || to_char(pn_from, 'DD.MM.YYYY') end as older_row,
       translate(to_char(case when p_mode = 'kalt_nk' and round(p_nk, 2) = round(n_amt, 2) then p_nk else pn_amt end, 'FM999G999G990D00'), ',.', '.,') as older_amount,
       case when p_mode = 'kalt_nk' and round(p_nk, 2) = round(n_amt, 2)
            then 'the rent entry already has the new Nebenkosten — ' || to_char(p_from, 'DD.MM.YYYY') || ' to ' || to_char(n_from - 1, 'DD.MM.YYYY') ||
                 ' should show the old NK-Vorauszahlung'
            else 'the NK-Anpassung before it has the same amount — one of them was overwritten' end as why
from g
where (p_mode = 'kalt_nk' and round(p_nk, 2) = round(n_amt, 2)) or (pn_from is not null and round(pn_amt, 2) = round(n_amt, 2))
order by room, tenant, n_from;


-- ── H · Room names that match no room any more ──────────────────────────────────────────────────────────────
-- Before the fix, renaming a room in Rooms did not move Maintenance (Zimmer, Who pays), Controlling's who-pays note
-- or Settlements' typed tenants. Their old names now point nowhere: a receipt is billed to nobody, a typed tenant
-- gets no m². H1–H3 are moved by the rename too, but the Tenants tab loads them by the EXACT room name, so a row
-- that differs only in capitals or spaces is hidden there — those are listed as well.
-- Fix: type the room's current name (Maintenance › the receipt › Who pays · Details › Zimmer; Settlements › tenants
-- not in the app), or ask Claude for a one-line UPDATE per old name.

-- H1 · tenant_records.room (the app's table)
select 'H1' as chk, t.room as stored_name, trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')) as tenant, t.status,
       coalesce((select 'only capitals / spaces differ from "' || r.name || '" — hidden in Tenants' from rooms r
                 where lower(btrim(r.name)) = lower(btrim(t.room)) limit 1), 'no room with this name (renamed or deleted)') as why
from tenant_records t
where coalesce(btrim(t.room), '') <> '' and not exists (select 1 from rooms r where r.name = t.room)
order by t.room, tenant;

-- H2 · nk_vorauszahlung_history.room (NK-Anpassungen · the app's table)
select 'H2' as chk, n.room as stored_name, to_char(n.effective_date::date, 'DD.MM.YYYY') as nk_from,
       translate(to_char(n.amount, 'FM999G999G990D00'), ',.', '.,') as amount,
       coalesce((select 'only capitals / spaces differ from "' || r.name || '" — hidden in Tenants' from rooms r
                 where lower(btrim(r.name)) = lower(btrim(n.room)) limit 1), 'no room with this name (renamed or deleted)') as why
from nk_vorauszahlung_history n
where coalesce(btrim(n.room), '') <> '' and not exists (select 1 from rooms r where r.name = n.room)
order by n.room, n.effective_date;

-- H3 · casa_mieterhoehung_history.room (Mieterhöhungen, Oct 2026)
select 'H3' as chk, m.room as stored_name, to_char(m.effective_date::date, 'DD.MM.YYYY') as mieterhoehung_from,
       translate(to_char(m.amount, 'FM999G999G990D00'), ',.', '.,') as amount,
       coalesce((select 'only capitals / spaces differ from "' || r.name || '" — hidden in Tenants' from rooms r
                 where lower(btrim(r.name)) = lower(btrim(m.room)) limit 1), 'no room with this name (renamed or deleted)') as why
from casa_mieterhoehung_history m
where coalesce(btrim(m.room), '') <> '' and not exists (select 1 from rooms r where r.name = m.room)
order by m.room, m.effective_date;

-- H4 · maint_cases.report_room (Maintenance › Details › Zimmer · MAINTENANCE.sql + MAINTENANCE-D5.sql), Casa Castel only
select 'H4' as chk, x.room as stored_name, c.title as maintenance_case, c.kind, to_char(c.case_date, 'DD.MM.YYYY') as case_date,
       'no room with this name (renamed before the fix?)' as why
from maint_cases c
cross join lateral (select btrim(to_jsonb(c) ->> 'report_room') as room) x
where c.property_id = 7 and coalesce(x.room, '') not in ('', '__gemeinschaft__')
  and not exists (select 1 from rooms r where lower(btrim(r.name)) = lower(x.room))
order by x.room, c.case_date;

-- H5 · maint_costs.pay_rooms (Maintenance › receipt › Who pays · MAINTENANCE-D1.sql + MAINTENANCE-D39.sql)
select 'H5' as chk, x.room as stored_name, c.title as maintenance_case, m.receipt_no, to_char(m.cost_date, 'DD.MM.YYYY') as receipt_date,
       translate(to_char(m.amount, 'FM999G999G990D00'), ',.', '.,') as amount, to_jsonb(m) ->> 'pay_type' as who_pays,
       'no room with this name (renamed before the fix?)' as why
from maint_costs m
join maint_cases c on c.id = m.case_id
cross join lateral jsonb_array_elements_text(case when jsonb_typeof(to_jsonb(m) -> 'pay_rooms') = 'array' then to_jsonb(m) -> 'pay_rooms' else '[]'::jsonb end) pr(v)
cross join lateral (select btrim(pr.v) as room) x
where x.room <> '' and not exists (select 1 from rooms r where lower(btrim(r.name)) = lower(x.room))
order by x.room, m.cost_date;

-- H6 · ctrl_expense_one_time.maint_pay → "r" (Controlling's copy of Who pays · MAINTENANCE-D39.sql)
select 'H6' as chk, x.room as stored_name, to_char(o.invoice_date::date, 'DD.MM.YYYY') as invoice_date, o.item,
       translate(to_char(o.amount, 'FM999G999G990D00'), ',.', '.,') as amount,
       'no room with this name — Controlling / Settlements show the old name' as why
from ctrl_expense_one_time o
cross join lateral (select to_jsonb(o) -> 'maint_pay' as mp) a
cross join lateral (select case when jsonb_typeof(a.mp) = 'object' then a.mp
                                when jsonb_typeof(a.mp) = 'string' and (a.mp #>> '{}') ~ '^\s*\{' then (a.mp #>> '{}')::jsonb end as mp) b
cross join lateral jsonb_array_elements_text(case when jsonb_typeof(b.mp -> 'r') = 'array' then b.mp -> 'r' else '[]'::jsonb end) pr(v)
cross join lateral (select btrim(pr.v) as room) x
where x.room <> '' and not exists (select 1 from rooms r where lower(btrim(r.name)) = lower(x.room))
order by x.room, o.invoice_date;

-- H7 · nk_abrechnung_casa.tenants → "__extra" (Settlements › tenants not in the app · SETTLEMENTS-CASA.sql)
select 'H7' as chk, x.room as stored_name, n.year as nk_year, e.v ->> 'name' as typed_tenant,
       concat_ws(' – ', case when (e.v ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$' then to_char((e.v ->> 'from')::date, 'DD.MM.YYYY') else e.v ->> 'from' end,
                        coalesce(case when (e.v ->> 'to') ~ '^\d{4}-\d{2}-\d{2}$' then to_char((e.v ->> 'to')::date, 'DD.MM.YYYY') else e.v ->> 'to' end, '…')) as stay,
       'no room with this name — this tenant gets no m² and no unit in the NK-Abrechnung' as why
from nk_abrechnung_casa n
cross join lateral (select to_jsonb(n) -> 'tenants' as ts) a
cross join lateral (select case when jsonb_typeof(a.ts) = 'object' then a.ts
                                when jsonb_typeof(a.ts) = 'string' and (a.ts #>> '{}') ~ '^\s*\{' then (a.ts #>> '{}')::jsonb end as ts) b
cross join lateral jsonb_array_elements(case when jsonb_typeof(b.ts -> '__extra') = 'array' then b.ts -> '__extra' else '[]'::jsonb end) e(v)
cross join lateral (select btrim(coalesce(e.v ->> 'room', '')) as room) x
where x.room <> '' and not exists (select 1 from rooms r where lower(btrim(r.name)) = lower(x.room))
order by n.year, x.room;
