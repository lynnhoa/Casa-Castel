-- ═══ Settlements › Rentals · fields + master data (safe to run twice) ═══
-- Already run from the chat? Then nothing to do — this file is the same SQL.

create table if not exists nk_abrechnung_rentals (
  id uuid primary key default gen_random_uuid(),
  property_id bigint not null, apartment_id text,
  period_from date not null, period_to date not null,
  hv_date date, key_mode text not null default 'flaeche' check (key_mode in ('flaeche','weg')),
  keys jsonb not null default '{}'::jsonb, positions jsonb not null default '[]'::jsonb,
  tenants jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists nk_abrechnung_rentals_uq on nk_abrechnung_rentals (property_id, period_from);
alter table nk_abrechnung_rentals
  add column if not exists received_on  date,
  add column if not exists asked_on     jsonb not null default '[]'::jsonb,
  add column if not exists beschluss_on date,
  add column if not exists weg_direction smallint check (weg_direction in (-1,0,1)),
  add column if not exists weg_amount   numeric(12,2),
  add column if not exists weg_due      date,
  add column if not exists weg_via      text check (weg_via in ('zahlung','lastschrift','hausgeld'));
alter table ctrl_properties
  add column if not exists hv_expected_month smallint check (hv_expected_month between 1 and 12),
  add column if not exists in_portfolio_since date;
alter table rnt_kaution add column if not exists nk_einbehalt numeric(12,2);
alter table nk_abrechnung_rentals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nk_abrechnung_rentals' and policyname = 'anon_all') then
    create policy anon_all on nk_abrechnung_rentals for all using (true) with check (true);
  end if;
end $$;
grant all on nk_abrechnung_rentals to anon, authenticated;

with m (pat, per_start, exp_month, since) as (values
  ('%kostheim%','07-01',10,null::date), ('%507%','01-01',3,null::date), ('%516%','01-01',3,null::date),
  ('%campo%','01-01',7,null::date), ('%kaiser-w%17%','01-01',10,null::date), ('%wallau%','01-01',6,null::date),
  ('%studio one%','01-01',8,date '2026-02-15'), ('%adam%08%',null,null,date '2026-02-01'), ('%adam%10%',null,null,date '2026-02-01'))
update ctrl_properties p set
  nk_period_start = coalesce(m.per_start, p.nk_period_start),
  hv_expected_month = coalesce(p.hv_expected_month, m.exp_month),
  in_portfolio_since = coalesce(p.in_portfolio_since, m.since)
from m where p.name ilike m.pat;

with m (pat, hv, mail, tel, gst) as (values
  ('%kostheim%','Immoservice Krone GmbH','gueney@immoservice-krone.de','+491785766671',18.97),
  ('%507%','Immerheiser','wohlfahrter@hv-i.de','+496119717957',26.78),
  ('%516%','Immerheiser','wohlfahrter@hv-i.de','+496119717957',67.54),
  ('%campo%','Reanovo','soeren.paulus@reanovo.de','+49693400110',40.09),
  ('%kaiser-w%17%','Immobilien Lichtenberg e.K.','immobilien@lichtenberg-mainz.de','+496131613093',74.15),
  ('%wallau%','Mauer Hausverwaltung','mail@hi-hvw.de','+4961357168980',47.48),
  ('%studio one%','MZGV','kschlarp@mzgv.de','+496131286920',null::numeric),
  ('%adam%08%','Immobilien Reichenbach GmbH','immobilien-reichenbach@hv-ir.de','+49611403036',null::numeric),
  ('%adam%10%','Immobilien Reichenbach GmbH','immobilien-reichenbach@hv-ir.de','+49611403036',null::numeric))
update rentals_verwaltung v set
  hausverwaltung = coalesce(nullif(v.hausverwaltung,''), m.hv),
  hv_email = coalesce(nullif(v.hv_email,''), m.mail),
  hv_telefon = coalesce(nullif(v.hv_telefon,''), m.tel),
  grundsteuer_mtl = case when coalesce(v.grundsteuer_mtl::text,'') in ('','0','0.00') then m.gst else v.grundsteuer_mtl::numeric end
from rentals_apartments a, m
where v.apartment_id::text = a.id::text and a.name ilike m.pat;

update rentals_apartments a set flaeche_m2 = m.m2
from (values ('%studio one%',68),('%adam%08%',28),('%adam%10%',35)) as m (pat, m2)
where a.name ilike m.pat and coalesce(a.flaeche_m2::text,'') in ('','0');

-- Fixed order of the Wohnungen = purchase order (build 3)
alter table ctrl_properties add column if not exists sort_order smallint;
update ctrl_properties p set sort_order = m.o
from (values ('Kostheim',1), ('Kaiserstr. WHG 507',2), ('Campo Novo',3), ('Kaiserstr. WHG 516',4), ('Kaiser-W-R 17',5),
             ('Wallaustr. 44',6), ('Casa Castel',7), ('Adam-K-S. 1-3, WHG 08',8), ('Adam-K-S. 1-3, WHG 10',9), ('Studio One',10)) as m (name, o)
where p.name = m.name;
