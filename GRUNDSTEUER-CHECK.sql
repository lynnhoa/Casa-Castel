-- GRUNDSTEUER-CHECK.sql · Grundsteuer 2026 · READ ONLY – changes nothing (one SELECT, run it all at once)
-- Checks every Grundsteuer amount and due month in the app against your DKB statements (up to 02.10.2026)
-- and shows what the app expects in November 2026. One row per property, then a total row.
-- The bank figures are in the list "bank" right below (quarterly instalment, February when it differs).
--   ok     ✓ right · ✗ wrong (the text says what is right) · ? please check (a question, or a paid month not booked)
--   app    the plan Controlling uses: amount per due month · due months · where it is set · (months with another amount)
--          (Rentals = Rentals › Apartments › Verwaltung · Setup = Controlling › Setup · Casa = Providers › Utilities)
--   check  what is wrong · 2026 bookings · November Soll
with
bank (k, bname, q, feb, kind, inc, num, exc) as (values      -- DKB 2026 · q = per quarter · feb = February, when known to the cent
  (1,  'Kostheim',           18.98, 18.97,         'q',    'kostheim',                      null::text,                null::text),
  (2,  'Kaiserstr. WHG 507', 26.78, null::numeric, 'q',    '',                              '(^|[^0-9])507([^0-9]|$)', null),
  (3,  'Campo Novo',         40.06, null,          'q',    'campo',                         null,                      null),
  (4,  'Kaiserstr. WHG 516', 67.52, null,          'q',    '',                              '(^|[^0-9])516([^0-9]|$)', null),
  (5,  'Kaiser-W-R 17',      74.13, null,          'q',    'kaiser[^a-z0-9]*w|wilhelm|kwr', '(^|[^0-9])17([^0-9]|$)',  'kaiser[^a-z0-9]*str'),
  (6,  'Wallaustr. 44',      47.47, null,          'q',    'wallau',                        null,                      null),
  (7,  'Casa Castel',        87.98, 87.99,         'q',    'casa[^a-z0-9]*castel',          null,                      null),
  (8,  'Adam-K-S. WHG 08',   null,  null,          'none', 'adam',                          '(^|[^0-9])0?8([^0-9]|$)', null),
  (9,  'Adam-K-S. WHG 10',   null,  null,          'none', 'adam',                          '(^|[^0-9])10([^0-9]|$)',  null),
  (10, 'Studio One',         77.68, null,          'year', 'studio',                        null,                      null)
),
mn (m, t) as (select g, (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[g] from generate_series(1, 12) g),
-- ── the app's properties (Controlling), matched to the bank by name ──
prop as (
  select p.id, coalesce(p.name, '') as name, j.pj,
         coalesce(j.pj ->> 'active', '') not in ('', 'false', '0') as active,
         case when (j.pj ->> 'sort_order') ~ '^-?[0-9]+([.][0-9]+)?$' then (j.pj ->> 'sort_order')::numeric else 999 end as so,
         nullif(j.pj ->> 'rentals_apartment_ref', '') as aref,
         nullif(j.pj ->> 'loan_ref', '') as lref,
         regexp_replace(lower(coalesce(p.name, '')), '[^a-z0-9äöüß]', '', 'g') as nk,
         case when trim(coalesce(j.pj ->> 'def_grundsteuer', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(j.pj ->> 'def_grundsteuer')::numeric end as def_gs,
         case when jsonb_typeof(j.pj -> 'grundsteuer_months') = 'array' and j.pj -> 'grundsteuer_months' <> '[]'::jsonb
              then array(select case when trim(e) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(e)::numeric end
                         from jsonb_array_elements_text(j.pj -> 'grundsteuer_months') e)
              else array[2, 5, 8, 11]::numeric[] end as gm,               -- Setup › Grundsteuer due (default Feb May Aug Nov)
         (select b.k from bank b
           where (p.id = 7 and b.k = 7)
              or (lower(coalesce(p.name, '')) ~ b.inc and (b.num is null or coalesce(p.name, '') ~ b.num)
                  and (b.exc is null or lower(coalesce(p.name, '')) !~ b.exc))
           order by (p.id = 7 and b.k = 7) desc, b.k limit 1) as bk
  from ctrl_properties p cross join lateral (select to_jsonb(p) as pj) j
),
lnk as (                                    -- Rentals apartment (saved link, else the same name · never for Casa) and loan (purchase date)
  select pr.*, a.aid, a.aname, vw.vj, ln.kd,
         (select count(*) from rentals_verwaltung v where a.aid is not null and v.apartment_id::text = a.aid) as nverw
  from prop pr
  left join lateral (select x.id::text as aid, x.name as aname from rentals_apartments x
                     where case when pr.aref is not null then x.id::text = pr.aref
                                when pr.id <> 7 then regexp_replace(lower(coalesce(x.name, '')), '[^a-z0-9äöüß]', '', 'g') = pr.nk
                                else false end
                     order by x.ctid limit 1) a on true
  left join lateral (select to_jsonb(v) as vj from rentals_verwaltung v where v.apartment_id::text = a.aid order by v.ctid limit 1) vw on true
  left join lateral (select trim(coalesce(to_jsonb(l) ->> 'kaufdatum', '')) as kd from properties l
                     where case when pr.lref is not null then l.id::text = pr.lref
                                else regexp_replace(lower(coalesce(to_jsonb(l) ->> 'name', '')), '[^a-z0-9äöüß]', '', 'g') = pr.nk end
                     order by l.ctid limit 1) ln on true
),
-- ── Casa Castel prices and contracts (Providers › Utilities) · read so that a missing table changes nothing ──
hj as (
  select coalesce(replace(replace(replace((xpath('/table/row/j/text()',
           case when to_regclass('public.ctrl_castel_amount_history') is not null then query_to_xml($q$
             select coalesce(jsonb_agg(jsonb_build_object('cat', to_jsonb(h) ->> 'category_id', 'vf', to_jsonb(h) ->> 'valid_from',
                                                          'amt', to_jsonb(h) ->> 'amount') order by h.ctid), '[]')::text as j
             from public.ctrl_castel_amount_history h $q$, false, false, '') end))[1]::text,
           '&lt;', '<'), '&gt;', '>'), '&amp;', '&'), '[]')::jsonb as arr
),
hist as (
  select e ->> 'cat' as cat, trim(coalesce(e ->> 'vf', '')) as vf, o as ord,
         case when trim(coalesce(e ->> 'amt', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(e ->> 'amt')::numeric end as amt
  from hj cross join lateral jsonb_array_elements(hj.arr) with ordinality x(e, o)
),
hcj as (
  select coalesce(replace(replace(replace((xpath('/table/row/j/text()',
           case when to_regclass('public.house_contracts') is not null then query_to_xml($q$
             select coalesce(jsonb_agg(jsonb_build_object('cat', to_jsonb(k) ->> 'category_id', 'start', to_jsonb(k) ->> 'starts_on',
                      'until', to_jsonb(k) ->> 'runs_until', 'ends', to_jsonb(k) ->> 'ends_on', 'cancelled', to_jsonb(k) ->> 'cancelled_on',
                      'rule', to_jsonb(k) ->> 'then_rule', 'minm', to_jsonb(k) ->> 'min_months', 'del', to_jsonb(k) ->> 'deleted_at')), '[]')::text as j
             from public.house_contracts k $q$, false, false, '') end))[1]::text,
           '&lt;', '<'), '&gt;', '>'), '&amp;', '&'), '[]')::jsonb as arr
),
hc as (
  select e ->> 'cat' as cat, trim(coalesce(e ->> 'start', '')) as s_start, trim(coalesce(e ->> 'until', '')) as s_until,
         trim(coalesce(e ->> 'ends', '')) as s_ends, coalesce(e ->> 'cancelled', '') <> '' as cancelled, coalesce(e ->> 'rule', '') as rule,
         case when trim(coalesce(e ->> 'minm', '')) ~ '^[0-9]{1,3}$' then trim(e ->> 'minm')::int end as minm
  from hcj cross join lateral jsonb_array_elements(hcj.arr) e
  where coalesce(e ->> 'del', '') = ''
),
-- ── dates as the app reads them: 2026-02-15 · 15.02.2026 · 15.02.26 · 2026 (→ 01.01.) ──
ds as (
  select distinct s from (select kd as s from lnk union all select vf from hist
                          union all select s_start from hc union all select s_until from hc union all select s_ends from hc) z
  where coalesce(s, '') <> ''
),
dp as (
  select ds.s, case when a.y is null or a.m is null or a.d is null then null
                    when a.y not between 1900 and 2200 or a.m not between 1 and 12 or a.d not between 1 and 31 then null
                    when a.d > extract(day from make_date(a.y, a.m, 1) + interval '1 month' - interval '1 day') then null
                    else make_date(a.y, a.m, a.d) end as d
  from ds cross join lateral (
    select case when ds.s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then left(ds.s, 4)::int
                when ds.s ~ '^[0-9]{1,2}[.][0-9]{1,2}[.][0-9]{4}$' then split_part(ds.s, '.', 3)::int
                when ds.s ~ '^[0-9]{1,2}[.][0-9]{1,2}[.][0-9]{2}$' then 2000 + split_part(ds.s, '.', 3)::int
                when ds.s ~ '^[0-9]{4}$' then ds.s::int end as y,
           case when ds.s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then substr(ds.s, 6, 2)::int
                when ds.s ~ '^[0-9]{1,2}[.][0-9]{1,2}[.]([0-9]{2}|[0-9]{4})$' then split_part(ds.s, '.', 2)::int
                when ds.s ~ '^[0-9]{4}$' then 1 end as m,
           case when ds.s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then substr(ds.s, 9, 2)::int
                when ds.s ~ '^[0-9]{1,2}[.][0-9]{1,2}[.]([0-9]{2}|[0-9]{4})$' then split_part(ds.s, '.', 1)::int
                when ds.s ~ '^[0-9]{4}$' then 1 end as d) a
),
base as (                                   -- per property: purchase date and the apartment plan (ctlCostRows)
  select l.*, sp.d as since,
         case when l.aid is not null
              then case when trim(coalesce(l.vj ->> 'grundsteuer_mtl', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(l.vj ->> 'grundsteuer_mtl')::numeric end
              else l.def_gs end as gs,
         case when l.id = 7 then 'Casa' when l.aid is not null then 'Rentals' else 'Setup' end as src
  from lnk l left join dp sp on sp.s = l.kd
),
-- ── Casa Castel: its Grundsteuer cost type(s) (ctlCasaCostRows · ctlCastelAmountAt · ctlContractCovers) ──
ccat as (
  select c.id::text as cid, coalesce(c.name, '') as cname,
         coalesce(nullif(j.cj ->> 'frequency', ''), 'monatlich') as freq,
         case when jsonb_typeof(j.cj -> 'due_months') = 'array'
              then array(select case when trim(e) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(e)::numeric end
                         from jsonb_array_elements_text(j.cj -> 'due_months') e)
              else '{}'::numeric[] end as dm,
         case when trim(coalesce(j.cj ->> 'default_amount', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(j.cj ->> 'default_amount')::numeric end as defamt,
         coalesce(j.cj ->> 'active', '') = 'false' as switched_off,
         case when lower(coalesce(j.cj ->> 'owner_app', '')) in ('utilities', 'properties', 'providers') then lower(j.cj ->> 'owner_app')
              when upper(coalesce(j.cj ->> 'code', '')) in ('PUTZDIENST', 'WINTERDIENST') then 'providers' else 'utilities' end as owner,
         left(coalesce(nullif(j.cj ->> 'owner_from', ''), case when coalesce(j.cj ->> 'owner_app', '') <> '' then '' else '2026-11-01' end), 7) as ofrom,
         coalesce(j.cj ->> 'nk_key', '') as nkkey
  from ctrl_castel_categories c cross join lateral (select to_jsonb(c) as cj) j
  where upper(coalesce(j.cj ->> 'code', '')) <> 'RATE'
    and (upper(coalesce(j.cj ->> 'code', '')) like '%GRUNDSTEUER%' or lower(coalesce(c.name, '')) like '%grundsteuer%')
),
hcx as (                                    -- contracts of these cost types: start and end (ctlContractEnd)
  select hc.cat, sd.d as sd,
         case when hc.cancelled then ed.d
              when hc.rule = 'ends' then coalesce(ud.d, case when sd.d is not null and hc.minm > 0 then (sd.d + make_interval(months => hc.minm))::date - 1 end) end as ed
  from hc left join dp sd on sd.s = hc.s_start left join dp ud on ud.s = hc.s_until left join dp ed on ed.s = hc.s_ends
  where hc.cat in (select cid from ccat)
),
csoll as (                                  -- per cost type and month 2026: price, due by rhythm, contract, Providers owner
  select c.cid, mo.m, a.amt, c.switched_off, k.cov,
         case when c.freq ~* 'sporad|bedarf' then mo.m = any(c.dm)
              when c.freq <> 'monatlich' then mo.m = any(c.dm)
              else cardinality(c.dm) = 0 or mo.m = any(c.dm) end as due,
         c.owner = 'providers' and (c.ofrom = '' or to_char(make_date(2026, mo.m, 1), 'YYYY-MM') >= c.ofrom) as prov
  from ccat c
  cross join generate_series(1, 12) mo(m)
  cross join lateral (
    select coalesce(
      (select coalesce(h.amt, 0) from hist h left join dp on dp.s = h.vf
        where h.cat = c.cid and coalesce(to_char(dp.d, 'YYYY-MM'), '') <= to_char(make_date(2026, mo.m, 1), 'YYYY-MM')
        order by coalesce(to_char(dp.d, 'YYYY-MM-DD'), '') desc, h.ord desc limit 1),
      (select coalesce(h.amt, 0) from hist h left join dp on dp.s = h.vf
        where h.cat = c.cid order by coalesce(to_char(dp.d, 'YYYY-MM-DD'), ''), h.ord limit 1),
      coalesce(c.defamt, 0)) as amt) a
  cross join lateral (
    select case when count(*) = 0 then 'none'
                when bool_or((x.sd is null or x.sd <= (make_date(2026, mo.m, 1) + interval '1 month' - interval '1 day')::date)
                             and (x.ed is null or x.ed >= make_date(2026, mo.m, 1))) then 'yes' else 'no' end as cov
    from hcx x where x.cat = c.cid) k
),
-- ── bookings (Controlling › Expenses) ──
abk as (
  select e.property_id::text as pid, e.year, e.month,
         coalesce(j.ej ->> 'grundsteuer', '') <> '' as has_gs,
         case when trim(coalesce(j.ej ->> 'grundsteuer', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(j.ej ->> 'grundsteuer')::numeric end as gs,
         case when trim(coalesce(j.ej ->> 'hausgeld', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(j.ej ->> 'hausgeld')::numeric end as hg
  from ctrl_expense_apartments e cross join lateral (select to_jsonb(e) as ej) j
  where e.year in (2025, 2026)
),
cbk as (
  select e.year, e.month, count(*) as n, sum(coalesce(e.amount, 0)) as amt
  from ctrl_expense_castel e join ccat c on c.cid = e.category_id::text
  where e.year in (2025, 2026, 2027)
  group by e.year, e.month
),
ot as (                                     -- one-offs that name the Grundsteuer, or Casa one-offs marked for its NK as Grundsteuer
  select o.property_id::text as pid, left(coalesce(j.oj ->> 'invoice_date', ''), 10) as d,
         case when trim(coalesce(j.oj ->> 'amount', '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(j.oj ->> 'amount')::numeric else 0 end as amt,
         coalesce(j.oj ->> 'direction', '') = '1' as income, coalesce(j.oj ->> 'kind', '') as kind,
         coalesce(nullif(j.oj ->> 'item', ''), j.oj ->> 'company', '') as item, coalesce(j.oj ->> 'nk_umlage', '') = 'true' as nku,
         coalesce(j.oj ->> 'nk_category_id', '') as nkcat
  from ctrl_expense_one_time o cross join lateral (select to_jsonb(o) as oj) j
  where coalesce(j.oj ->> 'kind', '') not in ('NK-Abrechnung', 'Hausgeldabrechnung')
    and left(coalesce(j.oj ->> 'invoice_date', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and (coalesce(j.oj ->> 'item', '') ~* 'grundsteuer' or coalesce(j.oj ->> 'company', '') ~* 'grundsteuer'
         or coalesce(j.oj ->> 'nk_category_id', '') in (select cid from ccat))
),
-- ── per property and month 2026: owned? plan (= Controlling's Soll once owned) · booked ──
pm as (
  select b.id, mo.m, mo.t,
         b.since is null or b.since <= (make_date(2026, mo.m, 1) + interval '1 month' - interval '1 day')::date as owned,
         case when b.id = 7 then coalesce((select bool_or(s.due) from csoll s where s.m = mo.m and not s.switched_off), false) else mo.m = any(b.gm) end as pdue,
         case when b.id = 7 then (select sum(case when not s.switched_off and not s.prov and s.due and s.cov <> 'no' then round(s.amt, 2) end) from csoll s where s.m = mo.m)
              when b.gs is not null and b.gs <> 0 and mo.m = any(b.gm) then round(b.gs, 2) end as plan_m,
         case when b.id = 7 then coalesce(cb.n, 0) > 0 else coalesce(ab.has_gs, false) end as has,
         case when b.id = 7 then cb.amt else ab.gs end as bv,
         ab.hg
  from base b cross join mn mo
  left join abk ab on b.id <> 7 and ab.pid = b.id::text and ab.year = 2026 and ab.month = mo.m
  left join cbk cb on b.id = 7 and cb.year = 2026 and cb.month = mo.m
),
-- ── the checks ──
pr as (
  select b.*, bb.bname, bb.q, bb.feb, case when dd.dup or dd.shadow then null else bb.kind end as kind, dd.dup, dd.shadow, dd.nall,
         (select count(*) from ccat) as ncat, (select count(*) from ccat c where not c.switched_off) as ncat_on,
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_properties'
                 and column_name = 'grundsteuer_months') as gm_col,
         exists (select 1 from ccat c where c.nkkey <> 'none') as casa_in_nk,
         case when b.id = 7 then coalesce((select sum(round(s.amt, 2)) from csoll s where s.m = 11 and not s.switched_off and s.due),  -- types due in Nov,
                                          (select max(round(s.amt, 2)) from csoll s where s.m = 11 and not s.switched_off)) else round(b.gs, 2) end as pamt,   -- else the main price
         array(select x.m from pm x where x.id = b.id and x.pdue order by x.m) as pmon,
         case when (select count(*) from pm x where x.id = b.id and x.pdue) = 12 then 'every month'
              else array_to_string(array(select x.t from pm x where x.id = b.id and x.pdue order by x.m), ' ') end as pmtxt,
         (select x.plan_m from pm x where x.id = b.id and x.m = 11 and x.owned and b.active) as nov,
         (select x.has from pm x where x.id = b.id and x.m = 11) as nov_has,
         (select x.bv from pm x where x.id = b.id and x.m = 11) as nov_bv,
         (select string_agg('One-off ' || substr(o.d, 9, 2) || '.' || substr(o.d, 6, 2) || '. '
                            || translate(to_char(o.amt, 'FM999,999,990.00'), ',.', '.,') || ' € "' || left(o.item, 40) || '"', ' · ' order by o.d)
            from ot o where o.pid = b.id::text and o.d like '2026-%' and (o.item ~* 'grundsteuer')) as otxt
  from base b left join bank bb on bb.k = b.bk
  cross join lateral (                      -- two active properties on one bank row → ask · an inactive one next to an active one → not checked
    select (b.active and c.na > 1) or (not b.active and c.na = 0 and c.nall > 1) as dup, not b.active and c.na >= 1 as shadow, c.nall
    from (select count(*) filter (where x.active) as na, count(*) as nall from prop x where x.bk = b.bk) c) dd
),
msg as (                                    -- x: wrong (✗) · q: please answer (?) · b: paid but not booked (?) · n: note
  select p.id, m.o, m.i, m.t
  from pr p
  cross join lateral (
    select 1 as o, i, t from unnest(array[
      case when p.bk is null and p.active then 'q:No bank figure for this property' end,
      case when p.dup then 'q:' || p.nall || ' properties match bank "' || p.bname || '" – check the names' end,
      case when p.nverw > 1 then 'q:' || p.nverw || ' Verwaltung rows in Rentals – the app reads only one' end,
      case when p.id = 7 and p.ncat = 0 then 'q:No Grundsteuer cost type in Providers › Utilities' end,
      case when p.id = 7 and p.ncat_on > 1 then 'q:' || p.ncat_on || ' Grundsteuer cost types – Controlling plans each' end,
      case when p.id = 7 and p.ncat > 0 and p.ncat_on = 0 then 'x:The cost type is switched off – Controlling plans nothing' end,
      case when p.id = 7 and exists (select 1 from csoll s where s.m = 11 and s.prov) then 'x:A Providers job owns this cost type – no Soll from Utilities' end,
      case when p.id = 7 and exists (select 1 from csoll s where s.m = 11 and s.due and s.cov = 'no') then 'x:No contract in Utilities covers Nov – no Soll' end,
      case when p.id = 7 and p.ncat > 0 and not p.casa_in_nk then 'x:Not in the Casa NK (NK split "none") – the tenants should carry it' end,
      -- plan amount
      case when p.kind = 'q' and (p.id <> 7 or p.ncat_on > 0) and coalesce(p.pamt, 0) = 0
           then 'x:No plan – the bank takes ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' € a quarter'
                || case p.src when 'Rentals' then ' (Rentals › Verwaltung)' when 'Setup' then ' (Setup › Grundsteuer/Q)' else ' (Utilities)' end end,
      case when p.kind = 'q' and coalesce(p.pamt, 0) <> 0 and p.pamt <> p.q
           then 'x:Plan ' || translate(to_char(p.pamt, 'FM999,999,990.00'), ',.', '.,') || ' € – the bank takes ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' €'
                || case p.src when 'Rentals' then ' (Rentals › Verwaltung)' when 'Setup' then ' (Setup › Grundsteuer/Q)' else ' (Utilities › New Bescheid)' end end,
      case when p.id = 7 and p.kind = 'q' and p.pamt = p.q        -- Casa: the price of May and Aug (its date) against the bank
                and exists (select 1 from pm x where x.id = p.id and x.m in (5, 8) and x.owned and x.plan_m <> p.q)
           then 'x:Soll ' || (select string_agg(x.t || ' ' || translate(to_char(x.plan_m, 'FM999,999,990.00'), ',.', '.,') || ' €', ', ' order by x.m)
                              from pm x where x.id = p.id and x.m in (5, 8) and x.owned and x.plan_m <> p.q)
                || ' – the bank ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' € (Utilities › Korrektur › Gilt ab)' end,
      case when p.kind = 'year' and coalesce(p.pamt, 0) = 0
           then 'x:No plan – 2026 was ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' € once, in Jan' end,
      case when p.kind = 'year' and coalesce(p.pamt, 0) <> 0 and p.pamt <> p.q
           then 'x:Plan ' || translate(to_char(p.pamt, 'FM999,999,990.00'), ',.', '.,') || ' € – 2026 was ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' € once, in Jan' end,
      case when p.kind = 'none' and coalesce(p.pamt, 0) <> 0 and cardinality(p.pmon) > 0
           then 'q:Nothing debited in 2026 – Controlling shows ' || translate(to_char(p.pamt, 'FM999,999,990.00'), ',.', '.,') || ' € open in ' || p.pmtxt || '; tax notice?' end,
      -- due months
      case when p.kind = 'q' and (p.id <> 7 or p.ncat_on > 0) and p.pmon <> array[2, 5, 8, 11]
           then 'x:Due ' || coalesce(nullif(p.pmtxt, ''), 'in no month') || ' – the bank: Feb May Aug Nov' || case when p.id = 7 then ' (Utilities)' else ' (Setup › Grundsteuer due)' end end,
      case when p.kind = 'year' and p.pmon <> array[1]
           then 'x:Due ' || coalesce(nullif(p.pmtxt, ''), 'in no month') || ' – 2026 was paid once, in Jan (Setup › Grundsteuer due)' end
    ]) with ordinality u(t, i)
    union all
    select 2, x.m, case                     -- the 2026 bookings against the bank
      when p.kind = 'q' and x.m in (5, 8) and x.has and coalesce(x.bv, 0) <> p.q
        then 'x:' || x.t || ' booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – the bank ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' €'
      when p.kind = 'q' and x.m = 2 and x.has and p.feb is not null and coalesce(x.bv, 0) <> p.feb
        then 'x:Feb booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – the bank ' || translate(to_char(p.feb, 'FM999,999,990.00'), ',.', '.,') || ' €'
      when p.kind = 'q' and x.m = 2 and x.has and p.feb is null and abs(coalesce(x.bv, 0) - p.q) > 0.02
        then 'x:Feb booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – the bank about ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' €'
      when p.kind = 'q' and x.m = 2 and x.has and p.feb is null and coalesce(x.bv, 0) = p.q
        then 'q:Feb booked ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' € like May – the bank''s Feb was 1–2 ct different (statement 2/2026)'
      when p.kind = 'q' and x.m in (2, 5, 8) and not x.has and x.owned then 'b:' || x.t
      when p.kind = 'q' and x.m = 11 and x.has and coalesce(x.bv, 0) <> p.q
        then 'q:Nov booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – expected ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' € (no statement yet)'
      when p.kind = 'q' and x.m not in (2, 5, 8, 11) and x.has and coalesce(x.bv, 0) <> 0
        then 'x:' || x.t || ' booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – no debit that month'
      when p.kind = 'year' and x.m = 1 and x.has and coalesce(x.bv, 0) <> p.q
        then 'x:Jan booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – paid ' || translate(to_char(p.q, 'FM999,999,990.00'), ',.', '.,') || ' €'
      when p.kind = 'year' and x.m = 1 and not x.has and x.owned and p.otxt is null then 'b:Jan'
      when p.kind = 'year' and x.m = 1 and not x.owned then 'n:Jan is before the purchase – not in Controlling'
      when p.kind = 'year' and x.m <> 1 and x.has and coalesce(x.bv, 0) <> 0
        then 'x:' || x.t || ' booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – no debit that month'
      when p.kind = 'none' and x.m = 2 and x.has and coalesce(x.bv, 0) <> 0
        then 'x:Feb still ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – that was Hausgeld'
      when p.kind = 'none' and x.m = 2 and x.owned
        then 'n:Feb Grundsteuer empty' || coalesce(' (Hausgeld ' || translate(to_char(x.hg, 'FM999,999,990.00'), ',.', '.,') || ' €)', '')
      when p.kind = 'none' and x.has and coalesce(x.bv, 0) <> 0
        then 'x:' || x.t || ' booked ' || translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,') || ' € – nothing was debited' end
    from pm x where x.id = p.id
    union all
    select 3, i, t from unnest(array[
      case when p.shadow then 'n:inactive – the bank figure is checked on the active property'
           when not p.active then 'n:inactive – Controlling leaves it out' end,
      case when p.since >= date '2026-01-01' then 'n:bought ' || to_char(p.since, 'DD.MM.YYYY') end,
      case when p.otxt is not null then 'n:' || p.otxt end,
      case when p.id <> 7 and not p.gm_col and ((p.kind = 'q' and p.pmon <> array[2, 5, 8, 11]) or (p.kind = 'year' and p.pmon <> array[1]))
           then 'n:Setup cannot save due months yet – column grundsteuer_months is missing' end]) with ordinality u(t, i)
  ) m
  where m.t is not null
),
chk as (
  select p.*,
         coalesce(array_agg(substr(g.t, 3) order by g.o, g.i) filter (where g.t like 'x:%'), '{}') as xs,
         coalesce(array_agg(substr(g.t, 3) order by g.o, g.i) filter (where g.t like 'q:%'), '{}') as qs,
         coalesce(array_agg(substr(g.t, 3) order by g.o, g.i) filter (where g.t like 'n:%'), '{}') as ns,
         coalesce(array_agg(substr(g.t, 3) order by g.o, g.i) filter (where g.t like 'b:%'), '{}') as nb,
         coalesce(bool_or(g.o = 2 and g.t like 'x:%'), false) as xbk     -- a booking is already named as wrong → no "booked:" list
  from pr p left join msg g on g.id = p.id
  group by p.id, p.name, p.pj, p.active, p.so, p.aref, p.lref, p.nk, p.def_gs, p.gm, p.bk, p.aid, p.aname, p.vj, p.kd, p.nverw,
           p.since, p.gs, p.src, p.bname, p.q, p.feb, p.kind, p.dup, p.shadow, p.nall, p.ncat, p.ncat_on, p.gm_col, p.casa_in_nk, p.pamt, p.pmon, p.pmtxt, p.nov, p.nov_has, p.nov_bv, p.otxt
),
rows as (
  select c.so, c.id,
         c.name || case when c.bname is not null and regexp_replace(lower(c.bname), '[^a-z0-9äöüß]', '', 'g') <> c.nk then ' (bank: ' || c.bname || ')' else '' end as property,
         case when cardinality(c.xs) > 0 then '✗' when cardinality(c.qs) + cardinality(c.nb) > 0 then '?' else '✓' end as ok,
         case when c.id = 7 and c.ncat = 0 then 'no Grundsteuer cost type · Casa'
              else coalesce(translate(to_char(nullif(c.pamt, 0), 'FM999,999,990.00'), ',.', '.,') || ' €', 'no plan') || ' · '
                   || coalesce(nullif(c.pmtxt, ''), 'no due months') || ' · ' || c.src
                   || case when c.aid is not null and regexp_replace(lower(coalesce(c.aname, '')), '[^a-z0-9äöüß]', '', 'g') <> c.nk then ' (' || c.aname || ')' else '' end
                   || case when c.id = 7 then coalesce(' (' || (select string_agg(x.t || ' ' || translate(to_char(x.plan_m, 'FM999,999,990.00'), ',.', '.,'), ', ' order by x.m)
                                                                 from pm x where x.id = c.id and x.plan_m <> c.pamt) || ')', '') else '' end
                   || case when not c.active then ' · inactive' else '' end end as app,
         concat_ws(' · ',
           case when cardinality(c.xs) + cardinality(c.qs) > 0 then array_to_string(c.xs || c.qs, '; ')
                when c.kind = 'q' then 'Right: ' || translate(to_char(c.q, 'FM999,999,990.00'), ',.', '.,') || ' € a quarter, Feb May Aug Nov'
                when c.kind = 'year' then 'Right: ' || translate(to_char(c.q, 'FM999,999,990.00'), ',.', '.,') || ' € once a year, in Jan'
                when c.kind = 'none' then 'Right: nothing debited in 2026, nothing planned' end,
           nullif(array_to_string(c.ns, ' · '), ''),
           case when cardinality(c.nb) > 0 then array_to_string(c.nb, ' ') || ' not booked' end,
           case when not c.xbk then 'booked: ' || coalesce(nullif(array_to_string(array(
               select x.t || ' ' || case when not x.has then '–'
                                         else translate(to_char(coalesce(x.bv, 0), 'FM999,999,990.00'), ',.', '.,')
                                              || case when c.kind = 'q' and x.m = 2 and c.feb is null and coalesce(x.bv, 0) <> c.q and abs(coalesce(x.bv, 0) - c.q) <= 0.02
                                                      then ' (' || case when x.bv > c.q then '+' else '−' end || round(abs(x.bv - c.q) * 100)::int || ' ct)' else '' end end
               from pm x where x.id = c.id
                 and (x.has or x.m = any(case c.kind when 'q' then array[2, 5, 8, 11] when 'year' then array[1] else '{}'::int[] end))
               order by x.m), ' · '), ''), 'nothing') end,
           'Nov Soll ' || case when not c.active then '– (inactive)'
                               else coalesce(translate(to_char(c.nov, 'FM999,999,990.00'), ',.', '.,') || ' €', '–') end) as "check"
  from chk c
),
tot as (                                    -- November 2026: what the app expects against the bank
  select coalesce((select sum(c.nov) from chk c), 0) as app_nov,
         (select sum(q) from bank where kind = 'q') as bank_nov, (select count(*) from bank where kind = 'q') as n_bank,
         coalesce((select sum(c.nov_bv) from chk c where c.nov_has), 0) as booked_nov,
         coalesce((select string_agg(d.label || ' ' || case when d.d > 0 then '+' else '−' end
                                     || translate(to_char(abs(d.d), 'FM999,999,990.00'), ',.', '.,') || d.why, ' · ' order by d.o)
                   from (select b.k as o,
                                case when count(c.id) = 1 then min(c.name) else b.bname end as label,
                                coalesce(sum(c.nov), 0) - case when b.kind = 'q' then b.q else 0 end as d,
                                case when count(c.id) = 0 then ' (not in the app)' else '' end as why
                         from bank b left join chk c on c.bk = b.k group by b.k, b.bname, b.kind, b.q
                         union all
                         select 100 + c.so, c.name, coalesce(c.nov, 0), ' (no bank figure)' from chk c where c.bk is null) d
                   where round(d.d, 2) <> 0), '') as diffs
)
select property, ok, app, "check" from (
  select 0 as grp, r.so, r.id, r.property, r.ok, r.app, r."check" from rows r
  union all
  select 1, 0, 0, 'November 2026',
         case when t.diffs = '' then '✓' else '✗' end,
         'app expects ' || translate(to_char(t.app_nov, 'FM999,999,990.00'), ',.', '.,') || ' €',
         'bank ' || translate(to_char(t.bank_nov, 'FM999,999,990.00'), ',.', '.,') || ' € (' || t.n_bank || ' properties, due 15.11.) · '
         || case when t.diffs = '' then 'same' else 'differs: ' || t.diffs end
         || ' · booked so far ' || translate(to_char(t.booked_nov, 'FM999,999,990.00'), ',.', '.,') || ' €'
  from tot t
) z
order by grp, so, id;
