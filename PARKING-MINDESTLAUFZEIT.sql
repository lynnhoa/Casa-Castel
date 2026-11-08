-- ═══ Rentals · Parking: the "Befristet" date was the Mindestlaufzeit, not a Contract end (Nov 2026 · READ ONLY) ═══
-- The parking contract says: "fest abgeschlossen bis zum … (Mindestlaufzeit) … danach läuft der Vertrag auf
-- unbestimmte Zeit weiter". Approve still saved that date as the Contract end, so Controlling stopped expecting
-- the parking rent there and the card said "Contract ended". From now on Approve saves no Contract end for parking.
-- This list shows the parking tenants that still carry such a date and stayed past it (still renting with no
-- move-out, or a move-out after the date — current and former tenants). It changes nothing.
--   what = 'standard 1 year' → the date is Mietbeginn + 1 year (the contract's normal Mindestlaufzeit) → cleared by the fix
--   what = 'other date'      → longer / shorter, or typed by hand (e.g. after a Kündigung) → only cleared if you say so
--   what = 'next tenant on this spot' → someone else rents the spot since then, so the date may be the real end → kept

with pk as (
  select t.id::text as tid,
         trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')) as tenant,
         p.name as parking,
         t.status,
         nullif(coalesce(t.vertragsbeginn, t.mietbeginn)::text, '')::date as start,
         nullif(t.vertragsende::text, '')::date as contract_end,
         nullif(t.mietende::text, '')::date as move_out,
         t.parking_id::text as pid
  from rnt_tenant_records t
  join rentals_parking p on p.id::text = t.parking_id::text
  where t.parking_id is not null
), nx as (                                    -- the next tenancy on the same spot
  select a.tid, min(b.start) as next_start
  from pk a join pk b on b.pid = a.pid and b.tid <> a.tid and b.start > a.start
  group by a.tid
), rp as (
  select r.tenant_id::text as tid, max(r.contract_end) as rp_end
  from rent_periods r
  where r.app = 'rentals' and r.contract_end is not null
  group by r.tenant_id
)
select pk.tenant, pk.parking, pk.status,
       to_char(pk.start, 'DD.MM.YYYY')        as "Mietbeginn",
       to_char(pk.contract_end, 'DD.MM.YYYY') as "Contract end (card)",
       to_char(rp.rp_end, 'DD.MM.YYYY')       as "Contract end (rent history)",
       to_char(pk.move_out, 'DD.MM.YYYY')     as "Move-out",
       case when nx.next_start is not null and nx.next_start <= coalesce(pk.move_out, date '9999-12-31') then 'next tenant on this spot'
            when (pk.contract_end is null or pk.contract_end between (pk.start + interval '1 year' - interval '1 day')::date
                                                                and (pk.start + interval '1 year')::date)
             and (rp.rp_end is null or rp.rp_end between (pk.start + interval '1 year' - interval '1 day')::date
                                                    and (pk.start + interval '1 year')::date)
            then 'standard 1 year' else 'other date' end as what,
       pk.tid as id
from pk
left join rp on rp.tid = pk.tid
left join nx on nx.tid = pk.tid
where (pk.contract_end is not null or rp.rp_end is not null)
  and ((pk.move_out is null and pk.status = 'active')                  -- still renting
       or greatest(pk.contract_end, rp.rp_end) < pk.move_out)          -- left after it (left on / before it → it ended there)
order by what desc, pk.parking, pk.tenant;
