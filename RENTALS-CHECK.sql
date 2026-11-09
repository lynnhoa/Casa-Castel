-- ═══ Rentals · data check (09.11.2026 · READ ONLY · nothing is changed · one list) ═══
-- Lists the records that old Rentals bugs wrote wrong, before the fixes ship. Send me the result;
-- the records it lists are corrected by hand (or by a one-off SQL written from this list) afterwards.
--   1 · a flat or parking spot with more than one price / costs / keys row (Add bug: the app reads the empty one)
--   2 · a Gewerbe tenant with Kaution Soll 0 (Gewerbe Approve wrote 0)
--   3 · a parking Mieterhöhung saved under apartment_id (never shown, not counted by Controlling)
--   4 · a Mieterhöhung / NK-Vorauszahlung saved on a tenant before that tenant moved in
--   5 · the document types the Documents table accepts (needed for Kündigung and NK letters)
--   6 · which Controlling property each flat's NK years come from
--   7 · NK entries from the old tracking (they will read "sent · no copy kept" in Documents)
--   8 · how the Inventar table (Anlage A) is set up: its id type and who may change rows (Inventar Save
--       now changes the rows in place instead of writing a new list next to the old one)

with
dup as (
  select 'rentals_pricing' as tbl, x.apartment_id::text as uid from rentals_pricing x group by 2 having count(*) > 1
  union all select 'rentals_verwaltung', x.apartment_id::text from rentals_verwaltung x group by 2 having count(*) > 1
  union all select 'rentals_schlussel', x.apartment_id::text from rentals_schlussel x group by 2 having count(*) > 1
  union all select 'rentals_parking_pricing', x.parking_id::text from rentals_parking_pricing x group by 2 having count(*) > 1
  union all select 'rentals_parking_schlussel', x.parking_id::text from rentals_parking_schlussel x group by 2 having count(*) > 1
),
dup_rows as (
  select 'rentals_pricing' as tbl, x.apartment_id::text as uid, row_to_json(x)::text as r from rentals_pricing x
  union all select 'rentals_verwaltung', x.apartment_id::text, row_to_json(x)::text from rentals_verwaltung x
  union all select 'rentals_schlussel', x.apartment_id::text, row_to_json(x)::text from rentals_schlussel x
  union all select 'rentals_parking_pricing', x.parking_id::text, row_to_json(x)::text from rentals_parking_pricing x
  union all select 'rentals_parking_schlussel', x.parking_id::text, row_to_json(x)::text from rentals_parking_schlussel x
),
unit as (
  select a.id::text as uid, a.name, coalesce(a.zimmer_type, '') as typ from rentals_apartments a
  union all select p.id::text, p.name, 'Parking' from rentals_parking p
),
ten as (
  select t.id::text as tid, trim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')) as who, t.status::text as status,
         t.apartment_id::text as aid, t.parking_id::text as pid, t.kaution_soll::text as ks,
         case when t.mietbeginn::text ~ '^\d{4}-\d{2}-\d{2}' then left(t.mietbeginn::text, 10)
              when t.mietbeginn::text ~ '^\d{1,2}\.\d{1,2}\.\d{4}$' then to_char(to_date(t.mietbeginn::text, 'DD.MM.YYYY'), 'YYYY-MM-DD') end as moves_in
  from rnt_tenant_records t
),
rows as (
  -- 1
  select 1 as nr, 'duplicate rows' as "check", coalesce(u.name, d.uid) as unit, d.tbl as tenant, dr.r as detail
  from dup d join dup_rows dr on dr.tbl = d.tbl and dr.uid = d.uid left join unit u on u.uid = d.uid
  -- 2
  union all
  select 2, 'Gewerbe Kaution Soll 0', a.name, t.who || ' (' || t.status || ')', 'Kaution Soll ' || coalesce(t.ks, 'empty')
  from ten t join rentals_apartments a on a.id::text = t.aid
  where a.zimmer_type = 'Gewerbefläche' and coalesce(nullif(t.ks, '')::numeric, 0) = 0
  -- 3
  union all
  select 3, 'parking Mieterhöhung under apartment_id', p.name, coalesce(t.who, '—'),
         'from ' || left(h.effective_date::text, 10) || ' · ' || h.amount::text || ' € · row ' || h.id::text
  from rnt_staffelmiete_history h join rentals_parking p on p.id::text = h.apartment_id::text
  left join ten t on t.tid = h.tenant_id::text
  -- 4
  union all
  select 4, 'Mieterhöhung before move-in', coalesce(u.name, '—'), t.who,
         'moves in ' || t.moves_in || ' · step from ' || left(h.effective_date::text, 10) || ' · ' || h.amount::text || ' € · row ' || h.id::text
  from rnt_staffelmiete_history h join ten t on t.tid = h.tenant_id::text
  left join unit u on u.uid = coalesce(t.aid, t.pid)
  where t.moves_in is not null and left(h.effective_date::text, 10) < t.moves_in
  union all
  select 4, 'NK-Vorauszahlung before move-in', coalesce(u.name, '—'), t.who,
         'moves in ' || t.moves_in || ' · NKV from ' || left(h.effective_date::text, 10) || ' · ' || h.amount::text || ' € · row ' || h.id::text
  from rnt_nk_vorauszahlung_history h join ten t on t.tid = h.tenant_id::text
  left join unit u on u.uid = coalesce(t.aid, t.pid)
  where t.moves_in is not null and left(h.effective_date::text, 10) < t.moves_in
  -- 5
  union all
  select 5, 'Documents table rule', 'rnt_tenant_documents', c.conname::text, pg_get_constraintdef(c.oid)
  from pg_constraint c where c.conrelid = 'public.rnt_tenant_documents'::regclass
  -- 6
  union all
  select 6, 'NK years come from', a.name, coalesce(a.zimmer_type, ''),
         'by link: ' || coalesce((select p.name from ctrl_properties p where p.rentals_apartment_ref::text = a.id::text limit 1), '—') ||
         ' · by unit: ' || coalesce((select p.name from ctrl_units u join ctrl_properties p on p.id = u.property_id
                                      where u.source_type = 'rentals_apartment' and u.source_ref = a.id::text limit 1), '—')
  from rentals_apartments a
  -- 7
  union all
  select 7, 'old NK tracking', coalesce(u.name, '—'), t.who || ' (' || t.status || ')',
         'NK ' || e.period::text || ' · sent ' || coalesce(e.sent::text, '—') || ' · paid ' || coalesce(e.paid::text, '—')
  from rnt_nk_entries e join ten t on t.tid = e.tenant_id::text
  left join unit u on u.uid = coalesce(t.aid, t.pid)
  -- 8
  union all
  select 8, 'Inventar table', 'rentals_inventar', 'id column',
         format_type(a.atttypid, a.atttypmod) || coalesce(' · default ' || pg_get_expr(d.adbin, d.adrelid), '')
  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.rentals_inventar'::regclass and a.attname = 'id'
  union all
  select 8, 'Inventar table', 'rentals_inventar', 'row level security',
         case when c.relrowsecurity then 'on' else 'off' end ||
         ' · update allowed: anon ' || case when has_table_privilege('anon', c.oid, 'UPDATE') then 'yes' else 'no' end ||
         ', authenticated ' || case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'yes' else 'no' end
  from pg_class c where c.oid = 'public.rentals_inventar'::regclass
  union all
  select 8, 'Inventar table', 'rentals_inventar', 'policy ' || p.policyname::text,
         p.cmd::text || ' · for ' || array_to_string(p.roles, ', ')
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'rentals_inventar'
)
select nr, "check", unit, tenant, detail from rows order by nr, unit, tenant, detail;
