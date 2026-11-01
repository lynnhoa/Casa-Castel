-- UTILITIES-ORDER.sql · Nov 2026 · one order everywhere + the kind of each Casa Castel cost type
-- By law (Grundsteuer · Wasser · Entsorgung · Schornsteinfeger) → Contracts (Strom · Gas · Internet · Wohngebäudeversicherung · Haftpflicht)
-- → Services & self-bought (Wartung Heizungsanlage · Wartung Enthärtungsanlage · Regeneriersalz · Putzdienst · Gärtner · Winterdienst)
-- Providers › Utilities, Settlements (House costs, NK letter) and Controlling (Casa Castel rows) all follow sort_order.
-- Safe to run twice.
alter table ctrl_castel_categories add column if not exists ut_kind text;

update ctrl_castel_categories c set sort_order = v.ord, ut_kind = v.kind
from (values
  ('grundsteuer%',           10, 'law'),
  ('wasser%',                20, 'law'),
  ('entsorg%',               30, 'law'),
  ('schornstein%',           40, 'law'),
  ('strom%',                 50, 'contract'),
  ('gas%',                   60, 'contract'),
  ('internet%',              70, 'contract'),
  ('%gebäudeversicherung%',  80, 'contract'),
  ('%haftpflicht%',          85, 'contract'),
  ('wartung heiz%',          90, 'service'),
  ('wartung enth%',         100, 'service'),
  ('%salz%',                110, 'service'),
  ('putzdienst%',           120, 'service'),
  ('gärtner%',              130, 'service'),
  ('gaertner%',             130, 'service'),
  ('winterdienst%',         140, 'service')
) as v(pat, ord, kind)
where coalesce(c.code, '') <> 'RATE' and lower(c.name) like v.pat;

update ctrl_castel_categories set sort_order = 999 where code = 'RATE';

-- check: the order as every app will show it
select sort_order, ut_kind, name from ctrl_castel_categories order by sort_order, name;
