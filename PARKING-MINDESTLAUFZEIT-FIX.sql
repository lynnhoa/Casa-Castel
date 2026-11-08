-- ═══ Rentals · Parking: clear the standard 1-year Mindestlaufzeit saved as Contract end (Nov 2026 · safe to run twice) ═══
-- Run PARKING-MINDESTLAUFZEIT.sql first. This clears ONLY the rows it marks 'standard 1 year'
-- (parking tenants who stayed past the date — still renting with no move-out, or a move-out after it — date =
-- Mietbeginn + 1 year, nobody else on the spot since), on the tenant card and in the rent history.
-- 'other date' and 'next tenant on this spot' rows stay as they are.
-- Afterwards Controlling expects the parking rent until the real move-out.
-- The candidates are worked out exactly as in the list (same text), so the two never disagree.

with raw as (                                 -- every parking tenancy, read through to_jsonb (date or text columns,
  select t.id::text as tid, t.parking_id::text as pid, p.name as parking, to_jsonb(t) as tj   -- ISO or DD.MM.YYYY)
  from rnt_tenant_records t
  join rentals_parking p on p.id::text = t.parking_id::text
  where t.parking_id is not null
), pk as (
  select r.tid, r.pid, r.parking, r.tj ->> 'status' as status,
         trim(coalesce(r.tj ->> 'first_name', '') || ' ' || coalesce(r.tj ->> 'last_name', '')) as tenant,
         coalesce(dt.vb, dt.mb) as start, dt.ve as contract_end, dt.me as move_out
  from raw r
  cross join lateral (
    select max(x.v) filter (where x.k = 'vertragsbeginn') as vb, max(x.v) filter (where x.k = 'mietbeginn') as mb,
           max(x.v) filter (where x.k = 'vertragsende') as ve,   max(x.v) filter (where x.k = 'mietende') as me
    from unnest(array['vertragsbeginn', 'mietbeginn', 'vertragsende', 'mietende']) as c(k)
    cross join lateral (select c.k, case
        when trim(r.tj ->> c.k) ~ '^\d{4}-\d{2}-\d{2}' then left(trim(r.tj ->> c.k), 10)::date
        when trim(r.tj ->> c.k) ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(trim(r.tj ->> c.k), 'DD.MM.YYYY') end as v) x
  ) dt
), nx as (                                    -- the next tenancy on the same spot
  select a.tid, min(b.start) as next_start
  from pk a join pk b on b.pid = a.pid and b.tid <> a.tid and b.start > a.start
  group by a.tid
), rp as (                                    -- the latest contract end in the rent history
  select r.tenant_id::text as tid, max(r.contract_end) as rp_end
  from rent_periods r
  where r.app = 'rentals' and r.contract_end is not null
  group by r.tenant_id
), c as (
  select pk.*, rp.rp_end, nx.next_start,
         (pk.start + interval '1 year' - interval '1 day')::date as std_lo, (pk.start + interval '1 year')::date as std_hi
  from pk left join rp on rp.tid = pk.tid left join nx on nx.tid = pk.tid
  where (pk.contract_end is not null or rp.rp_end is not null)
    and ((pk.move_out is null and pk.status = 'active')                  -- still renting
         or greatest(pk.contract_end, rp.rp_end) < pk.move_out)          -- left after it (left on / before it → it ended there)
), w as (
  select c.*, case
           when c.next_start is not null and c.next_start <= coalesce(c.move_out, date '9999-12-31') then 'next tenant on this spot'
           when c.start is not null
            and (c.contract_end is null or c.contract_end between c.std_lo and c.std_hi)
            and (c.rp_end is null or c.rp_end between c.std_lo and c.std_hi) then 'standard 1 year'
           else 'other date' end as what
  from c
), std as (
  select w.tid, w.std_lo, w.std_hi from w where w.what = 'standard 1 year'
), a as (
  update rent_periods r set contract_end = null
  from std
  where r.app = 'rentals' and r.tenant_id::text = std.tid and r.contract_end between std.std_lo and std.std_hi
  returning r.id
), b as (
  update rnt_tenant_records t set vertragsende = null
  from std
  where t.id::text = std.tid and t.vertragsende is not null
  returning t.id
)
select (select count(*) from b) as "tenant cards cleared",
       (select count(*) from a) as "rent history entries cleared";
