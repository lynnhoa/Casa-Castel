-- B · READ ONLY · Casa Castel: full check — setup, Jahresabrechnungen, and the NK of every finished year as the app calculates it
--     Kostenquote · Jahresabrechnungen by their Abrechnungszeitraum · purchase date · lock status · "CHECK" = needs a look
with
sup(k, label, ord) as (values ('strom', 'Strom', 1), ('gas', 'Gas', 2), ('wasser', 'Wasser', 3), ('entsorg', 'Entsorgung', 4)),
cat as (
  select s.k, s.label, s.ord, c.id as cat_id, coalesce(to_jsonb(c) -> 'abr_hist', '[]'::jsonb) as hist
  from sup s
  join lateral (select * from ctrl_castel_categories c where coalesce(c.code, '') <> 'RATE' and lower(c.name) like s.k || '%'
                order by c.sort_order nulls last, c.id limit 1) c on true
),
hist as (
  select k, (h ->> 'from')::date as h_from,
         case when (h ->> 'bill') ~ '^\d+$' and (h ->> 'bill')::int between 1 and 12 then (h ->> 'bill')::int end as bill
  from cat, jsonb_array_elements(case when jsonb_typeof(hist) = 'array' then hist else '[]'::jsonb end) h
  where (h ->> 'from') ~ '^\d{4}-\d{2}-\d{2}$'
),
hist2 as (select hist.*, lead(h_from) over (partition by k order by h_from) as h_next, min(h_from) over (partition by k) as h_first from hist),
bper as (                                   -- every Abrechnungsjahr of the history in Providers › Utilities
  select k, bill, x.s as b_from,
         least((h_from + make_interval(years => n + 1))::date - 1, coalesce(h_next - 1, 'infinity'::date)) as b_to
  from hist2, generate_series(-10, 50) n, lateral (select (h_from + make_interval(years => n))::date as s) x
  where x.s <= coalesce(h_next - 1, 'infinity'::date) and (n >= 0 or h_from = h_first)
),
prop as (
  select case when (to_jsonb(p) ->> 'nk_period_start') ~ '^\d{2}-\d{2}$' then to_jsonb(p) ->> 'nk_period_start' else '01-01' end as st
  from ctrl_properties p where p.id = 7
),
per as (                                    -- the NK period that ends in year y
  select y, f as p_from, ((extract(year from f)::int + 1) || '-' || st)::date - 1 as p_to
  from prop, generate_series(2022, extract(year from current_date)::int + 2) y,
       lateral (select ((case when st = '01-01' then y else y - 1 end) || '-' || st)::date as f) z
),
buy as (                                   -- the purchase date (Properties › Purchase date, free text: 07.06.2024 · 2024-06-07 · 2024 → 01.01.2024, like the apps)
  select coalesce((
    select case when s ~ '^\d{4}-\d{2}-\d{2}' then left(s, 10)::date
                when s ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_date(s, 'DD.MM.YYYY')
                when s ~ '^\d{1,2}\.\d{1,2}\.\d{2}$' then to_date(s, 'DD.MM.YY')
                when s ~ '^\d{4}$' then make_date(s::int, 1, 1) end
    from properties l cross join lateral (select trim(coalesce(to_jsonb(l) ->> 'kaufdatum', '')) as s) k
    where case when coalesce(to_jsonb(p) ->> 'loan_ref', '') <> '' then l.id::text = to_jsonb(p) ->> 'loan_ref'
               else regexp_replace(lower(coalesce(to_jsonb(l) ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(coalesce(p.name, '')), '[^a-z0-9äöüß]', '', 'g') end
    limit 1), '1900-01-01'::date) as d
  from ctrl_properties p where p.id = 7
),
rec as (select year, coalesce(tenants, '{}'::jsonb) as t from nk_abrechnung_casa),
ja as (                                     -- typed in Settlements › Jahresabrechnungen
  select r.year as own_y, e.key as k, b
  from rec r
  cross join lateral jsonb_each(case when jsonb_typeof(r.t -> '__ja') = 'object' then r.t -> '__ja' else '{}'::jsonb end) e
  cross join lateral jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) b
),
bk as (                                     -- booked in Controlling (Casa · Versorger)
  select o.id, o.invoice_date::date as day, o.company, o.amount, o.direction, o.item, o.nk_umlage, o.nk_category_id,
         nullif(to_jsonb(o) ->> 'nk_from', '')::date as nk_from, nullif(to_jsonb(o) ->> 'nk_to', '')::date as nk_to
  from ctrl_expense_one_time o
  where o.property_id = 7 and (o.kind = 'Versorger' or o.item ilike '%jahresabrechnung%')
    and coalesce(o.kind, '') not in ('NK-Abrechnung', 'Hausgeldabrechnung')
),
owned as (select b ->> 'ot' as ot from ja where coalesce(b ->> 'ot', '') <> ''),
bills as (
  select ja.k, case when coalesce(ja.b ->> 'ot', '') <> '' then 'ot:' || (ja.b ->> 'ot') else 'ja:' || (ja.b ->> 'id') end as line_id,
         case ja.b ->> 'dir' when '1' then 1 when '-1' then -1 else 0 end as dir,
         coalesce(nullif(nullif(ja.b ->> 'amt', ''), '0')::numeric, bk.amount, 0) as amt,
         coalesce(nullif(ja.b ->> 'co', ''), bk.company) as co,
         coalesce(nullif(ja.b ->> 'recv', '')::date, bk.day, nullif(ja.b ->> 'pd', '')::date) as day,
         coalesce(nullif(ja.b ->> 'recv', '')::date, nullif(ja.b ->> 'pd', '')::date, bk.day) as sday,
         case when coalesce(ja.b ->> 'from', '') <> '' and coalesce(ja.b ->> 'to', '') <> '' then (ja.b ->> 'from')::date
              when bk.nk_from is not null and bk.nk_to is not null then bk.nk_from end as zf,
         case when coalesce(ja.b ->> 'from', '') <> '' and coalesce(ja.b ->> 'to', '') <> '' then (ja.b ->> 'to')::date
              when bk.nk_from is not null and bk.nk_to is not null then bk.nk_to end as zt,
         (ja.b ->> 'dir') = '0' and coalesce(ja.b ->> 'ot', '') = '' as zero        -- balanced (0,00 €): covers its Zeitraum, nothing to split
  from ja left join bk on bk.id::text = ja.b ->> 'ot'
  where coalesce(ja.b ->> 'recv', '') <> '' or coalesce(ja.b ->> 'ot', '') <> ''
  union all
  select coalesce(m1.k, m2.k), 'ot:' || bk.id, case when bk.direction = 1 then 1 else -1 end, bk.amount, bk.company, bk.day, bk.day,
         case when bk.nk_from is not null and bk.nk_to is not null then bk.nk_from end,
         case when bk.nk_from is not null and bk.nk_to is not null then bk.nk_to end, false
  from bk
  left join lateral (select c.k from cat c where c.cat_id = bk.nk_category_id order by c.ord limit 1) m1 on true
  left join lateral (select s.k from sup s where lower(trim(coalesce(bk.item, ''))) like s.k || '%' order by s.ord limit 1) m2 on true
  where bk.nk_umlage and bk.id::text not in (select ot from owned)
),
z as (
  select b.*, case when b.zero then 0 when b.dir = 1 then -b.amt else b.amt end as cost,
         coalesce(b.zf, sg.b_from, (date_trunc('month', b.sday)::date - 1 - interval '1 year')::date + 1) as z_from,
         coalesce(b.zt, sg.b_to, date_trunc('month', b.sday)::date - 1) as z_to,
         case when b.zf is not null then 'from the bill' when sg.b_from is not null then 'suggested (Providers)' else 'guessed: 12 months before' end as src
  from bills b
  left join lateral (select p.b_from, p.b_to from bper p where p.k = b.k and p.b_from <= b.sday and p.b_to < b.sday
                     order by p.b_from desc limit 1) sg on b.zf is null
  where b.k is not null and (b.zero or (b.dir <> 0 and b.amt > 0))
),
seg as (                                   -- the bill's days, split at the NK periods and at the purchase date
  select z.line_id, null::int as y, z.z_from as s_from, least(z.z_to, b.d - 1) as s_to, z.z_from, z.z_to, z.cost
  from z cross join buy b where z.z_from < b.d
  union all
  select z.line_id, per.y, greatest(z.z_from, per.p_from, b.d), least(z.z_to, per.p_to), z.z_from, z.z_to, z.cost
  from z cross join buy b join per on per.p_from <= z.z_to and per.p_to >= z.z_from
  where greatest(z.z_from, per.p_from, b.d) <= least(z.z_to, per.p_to)
),
sh as (                                     -- amount × days ÷ all days, the cents rounded along the timeline (parts add up exactly)
  select line_id, y, s_to - s_from + 1 as d,
         round(cost * (s_to - z_from + 1) / (z_to - z_from + 1), 2) - round(cost * (s_from - z_from) / (z_to - z_from + 1), 2) as share
  from seg
),
yrs as (select y, p_from, p_to from per where y >= 2024 and p_to < current_date),
-- ── house costs
run as (
  select yr.y, coalesce(sum(e.amount), 0) as v
  from yrs yr
  left join (ctrl_expense_castel e join ctrl_castel_categories c on c.id = e.category_id and coalesce(c.code, '') <> 'RATE' and coalesce(c.nk_key, '') <> 'none')
    on make_date(e.year, e.month, 1) between date_trunc('month', yr.p_from)::date and yr.p_to
  group by yr.y
),
one as (
  select yr.y, coalesce(sum(case when o.direction = 1 then -o.amount else o.amount end), 0) as v
  from yrs yr
  left join ctrl_expense_one_time o on o.property_id = 7 and o.nk_umlage and coalesce(o.kind, '') not in ('NK-Abrechnung', 'Hausgeldabrechnung')
    and not (coalesce(o.kind, '') = 'Versorger' or coalesce(o.item, '') ilike '%jahresabrechnung%') and o.invoice_date::date between yr.p_from and yr.p_to
  group by yr.y
),
typ as (
  select yr.y, coalesce(sum(nullif(p ->> 'amount', '')::numeric), 0) as v
  from yrs yr
  left join rec r on r.year = yr.y
  left join lateral jsonb_array_elements(case when jsonb_typeof(r.t -> '__pos') = 'array' then r.t -> '__pos' else '[]'::jsonb end) p on true
  group by yr.y
),
jas as (
  select yr.y, coalesce(sum(sh.share) filter (where not exists (select 1 from rec r where r.year = yr.y and (r.t -> '__hgOff') ? sh.line_id)), 0) as v
  from yrs yr left join sh on sh.y = yr.y
  group by yr.y
),
cost as (
  select yr.y, run.v as running, one.v as oneoff, typ.v as typed, jas.v as ja, run.v + one.v + typ.v + jas.v as total
  from yrs yr join run using (y) join one using (y) join typ using (y) join jas using (y)
),
-- ── tenancies (the same rules as the app: rooms → units, move dates, rent history decides Pauschal / Kalt + NK)
units as (
  select u.id as unit_id, r.id as room_id, r.name as room_name, coalesce((to_jsonb(r) ->> 'sort_order')::int, 0) as rord, to_jsonb(r) as rj
  from ctrl_units u
  join lateral (
    select r.* from rooms r
    where case when coalesce(to_jsonb(u) ->> 'source_type', '') <> '' and coalesce(to_jsonb(u) ->> 'source_ref', '') <> ''
               then to_jsonb(u) ->> 'source_type' = 'casa_room'
                    and (r.id::text = to_jsonb(u) ->> 'source_ref' or regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(coalesce(to_jsonb(u) ->> 'source_ref', '')), '[^a-z0-9äöüß]', '', 'g'))
               else regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(coalesce(u.name, '')), '[^a-z0-9äöüß]', '', 'g') end
    order by (r.id::text = coalesce(to_jsonb(u) ->> 'source_ref', '')) desc limit 1) r on true
  where u.property_id = 7 and (coalesce(to_jsonb(u) ->> 'unit_type', '') || ' ' || coalesce(u.name, '')) !~* '(garage|stellplatz|\mtg\M)'
),
units2 as (
  select * from units
  union all                                  -- a room without its own unit row counts too (NK paid then from the contract)
  select null, r.id, r.name, coalesce((to_jsonb(r) ->> 'sort_order')::int, 0), to_jsonb(r)
  from rooms r
  where coalesce((to_jsonb(r) ->> 'active')::boolean, true) and not exists (select 1 from units x where x.room_id = r.id)
),
ten as (
  select un.*, t.id::text as tid, to_jsonb(t) as tj,
         trim(coalesce(to_jsonb(t) ->> 'first_name', '') || ' ' || coalesce(to_jsonb(t) ->> 'last_name', '')) as name,
         nullif(to_jsonb(t) ->> 'mietbeginn', '')::date as t_from, nullif(to_jsonb(t) ->> 'mietende', '')::date as t_end, to_jsonb(t) ->> 'status' as status
  from units2 un
  join tenant_records t on regexp_replace(lower(coalesce(to_jsonb(t) ->> 'room', '')), '[^a-z0-9äöüß]', '', 'g') = regexp_replace(lower(coalesce(un.room_name, '')), '[^a-z0-9äöüß]', '', 'g')
),
ten2 as (
  select ten.*, coalesce(t_end, case when status = 'active' then '9999-12-31'::date
           else coalesce((select min(x.t_from) from ten x where x.room_id = ten.room_id and x.t_from > ten.t_from) - 1, current_date) end) as t_to
  from ten where t_from is not null
),
tday as (
  select t.*, yr.y, yr.p_from, yr.p_to, d::date as day, extract(day from date_trunc('month', d) + interval '1 month - 1 day')::int as dim
  from ten2 t join yrs yr on t.t_from <= yr.p_to and t.t_to >= yr.p_from
  cross join lateral generate_series(greatest(t.t_from, yr.p_from), least(t.t_to, yr.p_to), interval '1 day') d
),
tmode as (
  select tday.*, coalesce(rp.m, lg.m) as mode
  from tday
  left join lateral (select case when rp.mode = 'pauschal' then 'pauschal' else 'kalt_nk' end as m
                     from rent_periods rp where rp.app = 'casa' and rp.tenant_id::text = tday.tid and rp.valid_from is not null and rp.valid_from::date <= tday.day
                     order by rp.valid_from desc, rp.ctid desc limit 1) rp on true
  cross join lateral (                       -- no rent history: the room's old pricing decides (as in the app)
    select case when ct = 'kurzzeit' then case when coalesce(nullif(tday.rj ->> 'kurzzeit_pricing', ''), 'pauschal') <> 'kalt_nk' then 'pauschal' else 'kalt_nk' end
                when ct = 'jahres' and coalesce(tday.rj ->> 'jahres_kaltmiete', '') <> '' then case when tday.rj ->> 'jahres_pricing' = 'pauschal' then 'pauschal' else 'kalt_nk' end
                else case when coalesce(tday.rj ->> 'mietvertrag_pricing', '') <> 'kalt_nk' then 'pauschal' else 'kalt_nk' end end as m
    from (select coalesce(nullif(tday.tj ->> 'contract_type', ''),
                   case when tday.rj ->> 'active_price_type' = 'kurzzeit' and coalesce(tday.rj ->> 'kurzzeit_kaltmiete', '') not in ('', '0') then 'kurzzeit'
                        when coalesce(tday.rj ->> 'kaltmiete', '') not in ('', '0') or coalesce(tday.rj ->> 'mietvertrag_miete', '') not in ('', '0') then 'mietvertrag'
                        when coalesce(tday.rj ->> 'kurzzeit_kaltmiete', '') not in ('', '0') then 'kurzzeit' else 'mietvertrag' end) as ct) c
  ) lg
),
tspan as (                                  -- one line per tenant and type (Pauschal ↔ Kalt + NK)
  select y, p_from, p_to, unit_id, room_id, room_name, rord, tid, name, mode, min(day) as s_from, max(day) as s_to, round(sum(1.0 / dim), 2) as months
  from (select tmode.*, day - (row_number() over (partition by y, tid, mode order by day))::int as grp from tmode) q
  group by y, p_from, p_to, unit_id, room_id, room_name, rord, tid, name, mode, grp
),
-- ── NK paid: the room's booked NK per month, split by days among its Kalt + NK tenants, without a Pauschal stay's "davon NK"
tsm as (
  select s.y, s.tid, s.s_from, s.mode, s.unit_id, date_trunc('month', m.day)::date as ym, count(*) as days, min(m.day) as a, max(m.dim) as dim
  from tspan s join tmode m on m.y = s.y and m.tid = s.tid and m.day between s.s_from and s.s_to
  group by s.y, s.tid, s.s_from, s.mode, s.unit_id, date_trunc('month', m.day)
),
pnk as (
  select s.y, s.tid, s.s_from, coalesce(rp.v, 0) as pnk
  from tspan s
  left join lateral (select case when rp.mode = 'pauschal' then coalesce(rp.nebenkosten, 0) else 0 end as v
                     from rent_periods rp where rp.app = 'casa' and rp.tenant_id::text = s.tid and rp.valid_from::date <= s.p_to
                     order by rp.valid_from desc, rp.ctid desc limit 1) rp on true
  where s.mode = 'pauschal'
),
-- ── Kostenquote (Nov 2026): short-term (Pauschal) stays carry only the NK inside their Pauschale ("Anteil Kurzzeitvermietung");
--    the rest is shared by the Kalt + NK tenants by their months; cents by largest remainder → you at 0
quota as (
  select c.y, c.total,
         coalesce(sum(s.months) filter (where s.mode = 'kalt_nk'), 0) as m_all,
         coalesce((select sum(round(p.pnk * s2.months, 2)) from tspan s2 join pnk p on p.y = s2.y and p.tid = s2.tid and p.s_from = s2.s_from where s2.y = c.y), 0) as kurz
  from cost c left join tspan s on s.y = c.y group by c.y, c.total
),
qv as (
  select q.*, case when q.m_all > 0 then greatest(0, q.total - q.kurz) else 0 end as pool,
         round(case when q.m_all > 0 then greatest(0, q.total - q.kurz) else 0 end / nullif(q.m_all, 0), 2) as rate
  from quota q
),
shr as (
  select s.y, s.tid, s.s_from, floor(q.pool * s.months / q.m_all * 100) / 100 as fl,
         q.pool * s.months / q.m_all * 100 - floor(q.pool * s.months / q.m_all * 100) as rem
  from tspan s join qv q on q.y = s.y where s.mode = 'kalt_nk' and q.m_all > 0
),
shr2 as (
  select x.*, row_number() over (partition by x.y order by x.rem desc, x.s_from, x.tid) as rk,
         round((q.pool - sum(x.fl) over (partition by x.y)) * 100) as left_c
  from shr x join qv q on q.y = x.y
),
um as (
  select x.y, x.unit_id, x.ym,
         sum(x.days) filter (where x.mode = 'kalt_nk') as nk_days,
         coalesce(sum(p.pnk * x.days / x.dim) filter (where x.mode = 'pauschal'), 0) as p_nk
  from tsm x left join pnk p on p.y = x.y and p.tid = x.tid and p.s_from = x.s_from
  where x.unit_id is not null
  group by x.y, x.unit_id, x.ym
),
nkm as (
  select x.*, inc.n as rows_n,
         case when inc.n > 0 then greatest(0, coalesce(inc.nk, 0) - coalesce(u.p_nk, 0)) * x.days / u.nk_days
              else coalesce(cn.v, 0) * x.days / x.dim end as amt
  from tsm x
  left join um u on u.y = x.y and u.unit_id = x.unit_id and u.ym = x.ym
  left join lateral (select count(*) as n, (array_agg(i.nebenkosten order by i.ctid))[1] as nk from ctrl_income_months i
                     where x.unit_id is not null and i.unit_id = x.unit_id and i.year = extract(year from x.ym) and i.month = extract(month from x.ym)) inc on true
  left join lateral (select coalesce((select case when rp.mode = 'pauschal' then 0 else coalesce(rp.nebenkosten, 0) end
                                      from rent_periods rp where rp.app = 'casa' and rp.tenant_id::text = x.tid and rp.valid_from::date <= x.a
                                      order by rp.valid_from desc, rp.ctid desc limit 1),
                              (select nullif(to_jsonb(t) ->> 'nebenkosten', '')::numeric from tenant_records t where t.id::text = x.tid)) as v) cn on true
  where x.mode = 'kalt_nk'
),
vz as (
  select n.y, n.tid, n.s_from, s.t as ov,
         round(sum(n.amt), 2) as auto,
         round(sum(coalesce(nullif(s.t -> 'vzMonths' ->> to_char(n.ym, 'YYYY-MM'), '')::numeric, round(n.amt, 2))), 2) as by_month,
         bool_or(n.rows_n = 0) as from_contract
  from nkm n
  left join rec r on r.year = n.y
  left join lateral (select r.t -> (n.tid || '|' || to_char(n.s_from, 'YYYY-MM-DD')) as t) s on true
  group by n.y, n.tid, n.s_from, s.t
),
res as (
  select s.*, q.rate, case when s.mode = 'pauschal' then round(coalesce(pp.pnk, 0) * s.months, 2)
                           else coalesce(h.fl + case when h.rk <= h.left_c then 0.01 else 0 end, 0) end as share,
         case when s.mode = 'pauschal' then null
              when jsonb_typeof(v.ov -> 'vzMonths') = 'object' and v.ov -> 'vzMonths' <> '{}'::jsonb then v.by_month
              when coalesce(v.ov ->> 'vz', '') <> '' then (v.ov ->> 'vz')::numeric
              else v.auto end as nk_paid,
         v.from_contract,
         (jsonb_typeof(v.ov -> 'vzMonths') = 'object' and v.ov -> 'vzMonths' <> '{}'::jsonb) or coalesce(v.ov ->> 'vz', '') <> '' as typed_vz
  from tspan s join qv q on q.y = s.y
  left join shr2 h on h.y = s.y and h.tid = s.tid and h.s_from = s.s_from
  left join pnk pp on pp.y = s.y and pp.tid = s.tid and pp.s_from = s.s_from
  left join vz v on v.y = s.y and v.tid = s.tid and v.s_from = s.s_from
),
-- ── missing Jahresabrechnungen (days of the year no bill covers, unless marked "no bill")
cov as (
  select c.k, c.label, c.ord, yr.y, greatest(yr.p_from, h0.first_from, bu.d) as r_from, yr.p_to as r_to
  from cat c join (select k, min(h_from) as first_from from hist group by k) h0 on h0.k = c.k
  cross join yrs yr cross join buy bu where greatest(yr.p_from, h0.first_from, bu.d) <= yr.p_to
),
unc as (
  select cov.k, cov.label, cov.ord, cov.y, d::date as day
  from cov cross join lateral generate_series(cov.r_from, cov.r_to, interval '1 day') d
  where not exists (select 1 from z where z.k = cov.k and d::date between z.z_from and z.z_to)
    and not exists (select 1 from rec r cross join lateral jsonb_array_elements(case when jsonb_typeof(r.t -> '__noBill' -> cov.k) = 'array' then r.t -> '__noBill' -> cov.k else '[]'::jsonb end) nb
                    where r.year = cov.y and d::date between (nb ->> 'from')::date and (nb ->> 'to')::date)
),
gaps as (
  select k, label, ord, y, min(day) as g_from, max(day) as g_to
  from (select unc.*, day - (row_number() over (partition by k, y order by day))::int as grp from unc) q
  group by k, label, ord, y, grp
),
gexp as (
  select g.*, (select make_date(case when p.bill >= extract(month from p.b_to)::int then extract(year from p.b_to)::int else extract(year from p.b_to)::int + 1 end, p.bill, 1)
               from bper p where p.k = g.k and p.b_from <= g.g_to and p.bill is not null
               order by (p.b_to >= g.g_to) desc, p.b_from desc limit 1) as exp
  from gaps g
),
chk as (                                   -- Jahresabrechnungen: every part adds up? how many Zeiträume from the bill?
  select count(*) as n, count(*) filter (where z.src = 'from the bill') as n_bill, count(*) filter (where z.src like 'suggested%') as n_sug,
         count(*) filter (where z.src like 'guessed%') as n_guess,
         count(*) filter (where coalesce((select sum(share) from sh where sh.line_id = z.line_id), 0) <> z.cost) as n_bad
  from z
),
rcv as (                                   -- Hausgeld: the bills that came in each year (their money, by date)
  select yr.y, count(z.line_id) as n, coalesce(sum(z.cost), 0) as net
  from yrs yr left join z on z.day between yr.p_from and yr.p_to
  group by yr.y
),
lk as (select year as y, (to_jsonb(r) ->> 'locked_at') as locked_at, nullif(r.snapshot ->> 'total', '')::numeric as locked_total,
              jsonb_array_length(case when jsonb_typeof(r.tenants -> '__extra') = 'array' then r.tenants -> '__extra' else '[]'::jsonb end) as n_extra
       from nk_abrechnung_casa r)
select nk_year, line, months, share, nk_paid, result, note
from (
  select null::int as nk_year, 0 as o1, 0 as o2, null::date as o3, 'Purchase date (Properties)' as line, null as months, null as share, null as nk_paid, null as result,
         case when (select d from buy) = '1900-01-01' then 'CHECK: not found – set it in Properties'
              else to_char((select d from buy), 'DD.MM.YYYY') || ' · days before it count in no NK' end as note
  union all
  select null, 0, c.ord, null, 'Abrechnungsjahr ' || c.label, null, null, null, null,
         coalesce((select 'from ' || to_char(h.h_from, 'DD.MM.') || ' · bill around ' || coalesce(to_char(make_date(2000, h.bill, 1), 'FMMonth'), '?') ||
                          ' · since ' || to_char(h.h_from, 'DD.MM.YYYY')
                   from hist h where h.k = c.k order by h.h_from desc limit 1), 'CHECK: not set in Providers › Utilities')
  from cat c
  union all
  select null, 0, 9, null, 'Jahresabrechnungen', null, null, null, null,
         n || ' bills · ' || case when n_bad = 0 then 'all parts add up' else 'CHECK: ' || n_bad || ' do not add up' end ||
         ' · Zeitraum from the bill: ' || n_bill || ' · suggested: ' || n_sug || case when n_guess > 0 then ' · CHECK guessed: ' || n_guess else '' end
  from chk
  union all
  select r.y, 1, 5, null, 'Jahresabrechnungen that came in', null, translate(to_char(abs(r.net), 'FM999G999G990D00'), ',.', '.,'), null, null,
         r.n || ' bills · ' || case when r.net < 0 then 'Guthaben' when r.net > 0 then 'Nachzahlung' else 'balanced' end || ' (the money of the year)'
  from rcv r
  union all
  select c.y as nk_year, 1 as o1, 0 as o2, null::date as o3, 'House costs' as line, null as months,
         translate(to_char(c.total, 'FM999G999G990D00'), ',.', '.,') as share, null as nk_paid, null as result,
         'running ' || translate(to_char(c.running, 'FM999G999G990D00'), ',.', '.,') ||
         case when c.oneoff <> 0 then ' · one-offs ' || translate(to_char(c.oneoff, 'FM999G999G990D00'), ',.', '.,') else '' end ||
         case when c.typed <> 0 then ' · typed ' || translate(to_char(c.typed, 'FM999G999G990D00'), ',.', '.,') else '' end ||
         ' · Jahresabrechnungen ' || translate(to_char(c.ja, 'FM999G999G990D00'), ',.', '.,') ||
         case when lk.locked_at is not null then ' · LOCKED ' || to_char(lk.locked_at::timestamptz, 'DD.MM.YYYY') ||
                case when lk.locked_total is not null then ' with ' || translate(to_char(lk.locked_total, 'FM999G999G990D00'), ',.', '.,') ||
                       ' (' || case when c.total - lk.locked_total >= 0 then '+' else '' end || translate(to_char(c.total - lk.locked_total, 'FM999G999G990D00'), ',.', '.,') || ')' else '' end ||
                ' → unlock to update' else ' · not locked' end ||
         case when coalesce(lk.n_extra, 0) > 0 then ' · ' || lk.n_extra || ' typed tenant(s) not in this check' else '' end as note
  from cost c left join lk on lk.y = c.y
  union all
  select q.y, 2, 0, null, 'Price per month', translate(to_char(q.m_all, 'FM999G990D00'), ',.', '.,'),
         translate(to_char(q.rate, 'FM999G999G990D00'), ',.', '.,'), null, null,
         case when q.kurz > 0 then '(house costs − Anteil Kurzzeitvermietung ' || translate(to_char(q.kurz, 'FM999G999G990D00'), ',.', '.,') || ' €) ÷ months of the Kalt + NK tenants'
              else 'house costs ÷ months of the Kalt + NK tenants' end
  from qv q
  union all
  select g.y, 3, g.ord, g.g_from, 'Jahresabrechnung missing', null, null, null, null,
         g.label || ' ' || to_char(g.g_from, 'DD.MM.YYYY') || '–' || to_char(g.g_to, 'DD.MM.YYYY') ||
         case when g.exp is not null then ' · expected around ' || to_char(g.exp, 'FMMonth YYYY') ||
                case when (date_trunc('month', g.exp) + interval '1 month - 1 day')::date + 15 < current_date then ' · overdue' else '' end else '' end ||
         ' · add it or mark "no bill" before locking'
  from gexp g
  union all
  select r.y, 4, r.rord, r.s_from, r.name || ' · ' || r.room_name,
         translate(to_char(r.months, 'FM990D00'), ',.', '.,'),
         translate(to_char(r.share, 'FM999G999G990D00'), ',.', '.,'),
         case when r.mode = 'pauschal' then null else translate(to_char(r.nk_paid, 'FM999G999G990D00'), ',.', '.,') end,
         case when r.mode = 'pauschal' then null else translate(to_char(r.share - r.nk_paid, 'FM999G999G990D00'), ',.', '.,') end,
         to_char(r.s_from, 'DD.MM.YYYY') || '–' || to_char(r.s_to, 'DD.MM.YYYY') || ' · ' ||
         case when r.mode = 'pauschal' then 'Pauschal – no letter · Anteil Kurzzeitvermietung (NK in the Pauschale)'
              when r.share - r.nk_paid > 0.004 then 'pays you'
              when r.share - r.nk_paid < -0.004 then 'gets back'
              else 'all even' end ||
         case when r.typed_vz then ' · NK paid typed in Settlements' else '' end ||
         case when r.from_contract then ' · some months not booked – NK from the contract' else '' end
  from res r
) x
order by nk_year nulls first, o1, o2, o3;
