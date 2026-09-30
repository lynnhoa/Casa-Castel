-- ═══════════════════════════════════════════════════════════
-- Settlements › Rentals — NK-Abrechnung der Wohnungen (30.09.2026)
-- One row per Wohnung (ctrl_properties) and Abrechnungszeitraum:
-- the HV-Jahresabrechnung (positions, Verteilerschlüssel) plus the
-- per-tenant letter settings. Safe to run twice. Nothing is deleted.
-- ═══════════════════════════════════════════════════════════

create table if not exists nk_abrechnung_rentals (
  id           uuid primary key default gen_random_uuid(),
  property_id  bigint not null,                 -- ctrl_properties.id
  apartment_id text,                            -- rentals_apartments.id (for reference)
  period_from  date not null,
  period_to    date not null,
  hv_date      date,                            -- date of the HV Jahresabrechnung
  key_mode     text not null default 'flaeche' check (key_mode in ('flaeche','weg')),
  keys         jsonb not null default '{}'::jsonb,   -- flaeche_t · mea_u/mea_t · einh_u/einh_t
  positions    jsonb not null default '[]'::jsonb,   -- [{id, kind, label, u, total, key, ku, kt, amount, split}]
  tenants      jsonb not null default '{}'::jsonb,   -- tenant_id → {vz, direct{}, addr, date, days, via, new_vz, new_vz_from, anlagen}
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create unique index if not exists nk_abrechnung_rentals_uq on nk_abrechnung_rentals (property_id, period_from);

alter table nk_abrechnung_rentals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nk_abrechnung_rentals' and policyname = 'anon_all') then
    create policy anon_all on nk_abrechnung_rentals for all using (true) with check (true);
  end if;
end $$;
grant all on nk_abrechnung_rentals to anon, authenticated;
