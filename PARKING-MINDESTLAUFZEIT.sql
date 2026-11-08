-- ═══ Rentals · Parking: the "Befristet" date was the Mindestlaufzeit, not a Contract end (Nov 2026 · READ ONLY) ═══
-- The parking contract says: "fest abgeschlossen bis zum … (Mindestlaufzeit) … danach läuft der Vertrag auf
-- unbestimmte Zeit weiter". Approve still saved that date as the Contract end, so Controlling stopped expecting
-- the parking rent there and the card said "Contract ended". From now on Approve saves no Contract end for parking.
-- This list shows the parking tenants that still carry such a date and stayed past it (still renting with no
-- move-out, or a move-out after the date — current and former tenants). It changes nothing.
--   what = 'standard 1 year' → the date is Mietbeginn + 1 year (the contract's normal Mindestlaufzeit) → cleared by the fix
--   what = 'other date'      → longer / shorter, typed by hand (e.g. a Kündigung), or unreadable → only cleared if you say so
--   what = 'another tenant on this spot' → someone else is on the spot after the date (a next tenant, or an earlier one
--                                          never moved out) → clearing could double the rent → kept

with raw as (                                 -- every parking tenancy, read through to_jsonb (date or text columns,
  select t.id::text as tid, t.parking_id::text as pid, p.name as parking, to_jsonb(t) as tj   -- ISO or DD.MM.YYYY)
  from rnt_tenant_records t
  join rentals_parking p on p.id::text = t.parking_id::text
  where t.parking_id is not null
), pk as (
  select r.tid, r.pid, r.parking, r.tj ->> 'status' as status,
         trim(coalesce(r.tj ->> 'first_name', '') || ' ' || coalesce(r.tj ->> 'last_name', '')) as tenant,
         coalesce(dt.vb, dt.mb) as start, dt.ve as contract_end, dt.me as move_out, dt.unreadable,
         nullif(trim(r.tj ->> 'vertragsende'), '') as card_raw
  from raw r
  cross join lateral (
    select max(x.v) filter (where x.k = 'vertragsbeginn') as vb, max(x.v) filter (where x.k = 'mietbeginn') as mb,
           max(x.v) filter (where x.k = 'vertragsende') as ve,   max(x.v) filter (where x.k = 'mietende') as me,
           count(*) filter (where x.s <> '' and x.v is null) as unreadable          -- a date this file can't read → never cleared
    from unnest(array['vertragsbeginn', 'mietbeginn', 'vertragsende', 'mietende']) as c(k)
    cross join lateral (select coalesce(trim(r.tj ->> c.k), '') as s) sv
    cross join lateral (select coalesce(regexp_match(sv.s, '^(\d{4})-(\d{2})-(\d{2})'),
                                        (select array[g[3], g[2], g[1]] from regexp_match(sv.s, '^(\d{1,2})\.(\d{1,2})\.(\d{4})$') g))::int[] as ymd) p
    cross join lateral (select c.k, sv.s, case when p.ymd[1] >= 1 and p.ymd[2] between 1 and 12 and p.ymd[3] between 1 and 31
        then (select z.v from (select make_date(p.ymd[1], p.ymd[2], 1) + (p.ymd[3] - 1) as v) z
              where extract(month from z.v) = p.ymd[2]) end as v) x               -- 30.02. / month 13 → not a date
  ) dt
), nx as (                                    -- another tenancy on the same spot: a later one, or an earlier / same-day
  select a.tid, min(b.start) as next_start      -- one that is still there after this tenant's date
  from pk a join pk b on b.pid = a.pid and b.tid <> a.tid
  where b.start > a.start
     or (b.start <= a.start and ((b.move_out is null and b.status = 'active')
         or b.move_out > coalesce(a.contract_end, (a.start + interval '1 year' - interval '1 day')::date)))
  group by a.tid
), rp as (                                    -- the rent history: its rows and the contract ends in it
  select r.tenant_id::text as tid, max(r.contract_end) as rp_end, count(*) as rp_rows,
         array_agg(r.contract_end) filter (where r.contract_end is not null) as rp_ends
  from rent_periods r
  where r.app = 'rentals'
  group by r.tenant_id
), c as (
  select pk.*, rp.rp_end, rp.rp_rows, rp.rp_ends, nx.next_start,
         (pk.start + interval '1 year' - interval '1 day')::date as std_lo, (pk.start + interval '1 year')::date as std_hi
  from pk left join rp on rp.tid = pk.tid left join nx on nx.tid = pk.tid
  where (pk.contract_end is not null or rp.rp_end is not null)
    and ((pk.move_out is null and pk.status = 'active')                  -- still renting
         or greatest(pk.contract_end, rp.rp_end) < pk.move_out)          -- left after it (left on / before it → it ended there)
), w as (
  select c.*, case
           when c.next_start is not null and c.next_start <= coalesce(c.move_out, date '9999-12-31') then 'another tenant on this spot'
           when c.start is not null and c.unreadable = 0
            and (c.contract_end is null or c.contract_end between c.std_lo and c.std_hi)
            and (c.rp_end is null or c.rp_end between c.std_lo and c.std_hi)
            -- Approve wrote the date on the card AND in the rent history; a card date the rent history doesn't have
            -- was typed by hand (e.g. a Kündigung) → 'other date'
            and (c.contract_end is null or c.rp_rows is null or c.contract_end = any(c.rp_ends)) then 'standard 1 year'
           else 'other date' end as what
  from c
)
select w.tenant, w.parking, w.status,
       to_char(w.start, 'DD.MM.YYYY')        as "Mietbeginn",
       coalesce(to_char(w.contract_end, 'DD.MM.YYYY'), w.card_raw) as "Contract end (card)",
       to_char(w.rp_end, 'DD.MM.YYYY')       as "Contract end (rent history)",
       to_char(w.move_out, 'DD.MM.YYYY')     as "Move-out",
       w.what, w.tid as id
from w
order by w.what desc, w.parking, w.tenant;
