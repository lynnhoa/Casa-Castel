-- ═══ Rooms · Preisliste (Stand 07.11.2026) as the default prices · safe to run twice ═══
-- Sets the three baselines of every room in Rooms (Kurzzeit · Jahresvertrag · Mietvertrag) to the Preisliste:
--   Jahresvertrag + Mietvertrag  Kalt + NK, NK 100 €                    e.g. Paris 550 + 100 = 650 €
--   Kurzzeit (Summer Pauschale)  Pauschal = the list Kalt, davon 50 € NK e.g. Paris 550 € (500 + 50)
-- They are the defaults for NEW contracts only. Every tenant keeps their own (IST) price, also when they renew.
-- Only the table rooms changes, and only these price fields. No tenant, no rent history, no Kaution, no m² is touched.
--
-- Run STEP A first (it only reads). Then STEP B. Step B refuses to run while step A shows a line "STOP".
-- Step B saying a column "jahres_…" does not exist = the Jahresvertrag baseline columns are missing (nothing was changed).

-- ── STEP A · check (read only) ───────────────────────────────────────────────────────────────────────
with
list(room, kalt, m2, ord) as (values ('Paris', 550, 28, 1), ('Copenhagen', 400, 12, 2), ('Stockholm', 450, 16, 3), ('Oslo', 400, 13, 4),
                                     ('London', 450, 16, 5), ('New York', 375, 16, 6), ('Los Angeles', 450, 15, 7), ('Berlin', 400, 12, 8)),
rm as (select r.id, r.name, to_jsonb(r) as rj, regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9äöüß]', '', 'g') as k from rooms r),
lk as (select l.*, regexp_replace(lower(l.room), '[^a-z0-9äöüß]', '', 'g') as k from list l),
num as (                                                         -- the price fields as numbers (empty = null)
  select rm.k, rm.name, rm.rj,
         (nullif(rj ->> 'kurzzeit_kaltmiete', ''))::numeric as kz_k, (nullif(rj ->> 'kurzzeit_nk', ''))::numeric as kz_n,
         (nullif(rj ->> 'jahres_kaltmiete', ''))::numeric as jv_k, (nullif(rj ->> 'jahres_nk', ''))::numeric as jv_n,
         (nullif(rj ->> 'kaltmiete', ''))::numeric as mv_k, (nullif(rj ->> 'nk_pauschale', ''))::numeric as mv_n
  from rm
),
cur as (                                                         -- today's three baselines as Rooms shows them
  select k, name, rj,
    case when coalesce(kz_k, 0) + coalesce(kz_n, 0) = 0 then 'not set'
         when coalesce(rj ->> 'kurzzeit_pricing', 'pauschal') = 'kalt_nk' then coalesce(kz_k, 0) || ' + ' || coalesce(kz_n, 0) || ' Kalt+NK'
         else (coalesce(kz_k, 0) + coalesce(kz_n, 0)) || ' pauschal (NK ' || coalesce(kz_n, 0) || ')' end as kz,
    case when jv_k is null then 'as Mietvertrag'
         when rj ->> 'jahres_pricing' = 'pauschal' then (jv_k + coalesce(jv_n, 0)) || ' pauschal (NK ' || coalesce(jv_n, 0) || ')'
         else jv_k || ' + ' || coalesce(jv_n, 0) || ' Kalt+NK' end as jv,
    case when coalesce(mv_k, 0) = 0 then 'not set'
         when rj ->> 'mietvertrag_pricing' = 'kalt_nk' then mv_k || ' + ' || coalesce(mv_n, 0) || ' Kalt+NK'
         else (mv_k + coalesce(mv_n, 0)) || ' pauschal (NK ' || coalesce(mv_n, 0) || ')' end as mv
  from num
),
ten as (                                                         -- current and next tenants of these rooms
  select t.id::text as tid, trim(coalesce(to_jsonb(t) ->> 'first_name', '') || ' ' || coalesce(to_jsonb(t) ->> 'last_name', '')) as who,
         to_jsonb(t) ->> 'room' as room, to_jsonb(t) as tj,
         case when (to_jsonb(t) ->> 'mietende') ~ '^\d{4}-\d{2}-\d{2}' then left(to_jsonb(t) ->> 'mietende', 10)::date
              when (to_jsonb(t) ->> 'mietende') ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(to_jsonb(t) ->> 'mietende', 'DD.MM.YYYY') end as t_end
  from tenant_records t
  where regexp_replace(lower(coalesce(to_jsonb(t) ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') in (select k from lk)
),
dep as (                                                         -- no rent history of their own → they would follow the room's new price
  select ten.* from ten
  where coalesce(t_end, '9999-12-31'::date) >= current_date and coalesce(tj ->> 'status', '') <> 'archived'
    and not exists (select 1 from rent_periods rp where rp.app = 'casa' and rp.tenant_id::text = ten.tid)
)
select topic, room, now, new from (
select '1 · price' as topic, lk.room, case when c.k is null then 'STOP · room not found in Rooms' else 'Kurzzeit ' || c.kz || ' · Jahres ' || c.jv || ' · Miet ' || c.mv end as now,
       'Kurzzeit ' || lk.kalt || ' pauschal (NK 50) · Jahres ' || lk.kalt || ' + 100 Kalt+NK · Miet ' || lk.kalt || ' + 100 Kalt+NK' as new, lk.ord as o
from lk left join cur c on c.k = lk.k
union all
select '1 · price', lk.room, 'STOP · ' || count(*) || ' rooms with this name', 'rename one of them in Rooms first', lk.ord
from lk join rm on rm.k = lk.k group by lk.room, lk.ord having count(*) > 1
union all
select '2 · m² (info, not changed)', lk.room, coalesce(rm.rj ->> 'flaeche_m2', '—') || ' m² in Rooms', lk.m2 || ' m² in the Preisliste', 10 + lk.ord
from lk join rm on rm.k = lk.k
where coalesce((nullif(rm.rj ->> 'flaeche_m2', ''))::numeric, -1) <> lk.m2
union all
select '3 · Kaution (info, not changed)', lk.room,
       concat_ws(' · ', case when (rm.rj ->> 'kaution_override') = 'true' and coalesce((nullif(rm.rj ->> 'kaution_default', ''))::numeric, 0) > 0 then 'Mietvertrag: individual ' || (rm.rj ->> 'kaution_default') end,
                        case when coalesce((nullif(rm.rj ->> 'jahres_kaution', ''))::numeric, 0) > 0 then 'Jahresvertrag: individual ' || (rm.rj ->> 'jahres_kaution') end),
       'stays · otherwise 3× Kalt = ' || (3 * lk.kalt), 20 + lk.ord
from lk join rm on rm.k = lk.k
where ((rm.rj ->> 'kaution_override') = 'true' and coalesce((nullif(rm.rj ->> 'kaution_default', ''))::numeric, 0) > 0)
   or coalesce((nullif(rm.rj ->> 'jahres_kaution', ''))::numeric, 0) > 0
union all
select '4 · tenant', dep.room,
       'STOP · ' || coalesce(nullif(dep.who, ''), 'tenant ' || dep.tid) || ' has no rent history of their own',
       case when coalesce(dep.tj ->> 'kaltmiete', '') = '' and coalesce(dep.tj ->> 'nebenkosten', '') = ''
            then 'enter their rent in Tenants, then run step A again'
            else 'open the Tenants tab once (it saves their rent and type), then run step A again' end, 30
from dep
union all
select '0 · result', '', case when exists (select 1 from dep) or exists (select 1 from lk where not exists (select 1 from rm where rm.k = lk.k))
                                   or exists (select 1 from lk join rm on rm.k = lk.k group by lk.k having count(*) > 1)
                              then 'STOP – fix the STOP lines first' else 'OK – step B can run' end, '', 0
) checks
order by o, topic;


-- ── STEP B · set the prices (only rooms; refuses while step A has a STOP) ────────────────────────────
do $$
declare
  n int; miss text;
begin
  create temp table _pl(room text, kalt numeric) on commit drop;
  insert into _pl values ('Paris', 550), ('Copenhagen', 400), ('Stockholm', 450), ('Oslo', 400),
                         ('London', 450), ('New York', 375), ('Los Angeles', 450), ('Berlin', 400);
  select string_agg(p.room, ', ') into miss from _pl p
  where (select count(*) from rooms r where regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(p.room), '[^a-z0-9äöüß]', '', 'g')) <> 1;
  if miss is not null then raise exception 'Not changed: room missing or twice in Rooms – %', miss; end if;

  select count(*) into n
  from tenant_records t
  where regexp_replace(lower(coalesce(to_jsonb(t) ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') in (select regexp_replace(lower(room), '[^a-z0-9äöüß]', '', 'g') from _pl)
    and coalesce(case when (to_jsonb(t) ->> 'mietende') ~ '^\d{4}-\d{2}-\d{2}' then left(to_jsonb(t) ->> 'mietende', 10)::date
                      when (to_jsonb(t) ->> 'mietende') ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(to_jsonb(t) ->> 'mietende', 'DD.MM.YYYY') end, '9999-12-31'::date) >= current_date
    and coalesce(to_jsonb(t) ->> 'status', '') <> 'archived'
    and not exists (select 1 from rent_periods rp where rp.app = 'casa' and rp.tenant_id::text = t.id::text);
  if n > 0 then raise exception 'Not changed: % tenant(s) have no rent history of their own and would follow the room price – see step A', n; end if;

  update rooms r set
    kurzzeit_pricing = 'pauschal', kurzzeit_kaltmiete = p.kalt - 50, kurzzeit_nk = 50,       -- Summer Pauschale = list Kalt, davon 50 € NK
    jahres_pricing = 'kalt_nk',    jahres_kaltmiete = p.kalt,        jahres_nk = 100,         -- Jahresvertrag
    mietvertrag_pricing = 'kalt_nk', kaltmiete = p.kalt,             nk_pauschale = 100       -- Mietvertrag
  from _pl p
  where regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(p.room), '[^a-z0-9äöüß]', '', 'g');
  get diagnostics n = row_count;
  raise notice 'Preisliste set for % rooms', n;
end $$;
