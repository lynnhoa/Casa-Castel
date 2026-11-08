-- ═══ Rentals · Parking: clear the standard 1-year Mindestlaufzeit saved as Contract end (Nov 2026 · safe to run twice) ═══
-- Run PARKING-MINDESTLAUFZEIT.sql first. This clears ONLY the rows it marks 'standard 1 year'
-- (parking tenants who stayed past the date — still renting with no move-out, or a move-out after it — date =
-- Mietbeginn + 1 year, nobody else on the spot since), on the tenant card and in the rent history.
-- 'other date' and 'next tenant on this spot' rows stay as they are.
-- Afterwards Controlling expects the parking rent until the real move-out.

with pk as (
  select t.id::text as tid,
         nullif(coalesce(t.vertragsbeginn, t.mietbeginn)::text, '')::date as start,
         nullif(t.vertragsende::text, '')::date as contract_end,
         nullif(t.mietende::text, '')::date as move_out,
         t.status, t.parking_id::text as pid
  from rnt_tenant_records t
  join rentals_parking p on p.id::text = t.parking_id::text          -- the same tenants as the list
  where t.parking_id is not null
), nx as (                                    -- the next tenancy on the same spot
  select a.tid, min(b.start) as next_start
  from pk a join pk b on b.pid = a.pid and b.tid <> a.tid and b.start > a.start
  group by a.tid
), std as (
  select x.tid, x.start from (
    select pk.*, (select max(r.contract_end) from rent_periods r
                  where r.app = 'rentals' and r.tenant_id::text = pk.tid and r.contract_end is not null) as rp_end,
           nx.next_start
    from pk left join nx on nx.tid = pk.tid) x
  where x.start is not null and (x.contract_end is not null or x.rp_end is not null)
    and ((x.move_out is null and x.status = 'active') or greatest(x.contract_end, x.rp_end) < x.move_out)
    and not (x.next_start is not null and x.next_start <= coalesce(x.move_out, date '9999-12-31'))
    and (x.contract_end is null
         or x.contract_end between (x.start + interval '1 year' - interval '1 day')::date and (x.start + interval '1 year')::date)
    and (x.rp_end is null
         or x.rp_end between (x.start + interval '1 year' - interval '1 day')::date and (x.start + interval '1 year')::date)
), a as (
  update rent_periods r set contract_end = null
  from std
  where r.app = 'rentals' and r.tenant_id::text = std.tid and r.contract_end is not null
    and r.contract_end between (std.start + interval '1 year' - interval '1 day')::date and (std.start + interval '1 year')::date
  returning r.tenant_id::text as tid
), b as (
  update rnt_tenant_records t set vertragsende = null
  from std
  where t.id::text = std.tid and t.vertragsende is not null
  returning t.id::text as tid
)
select (select count(*) from b) as "tenant cards cleared",
       (select count(*) from a) as "rent history entries cleared";
