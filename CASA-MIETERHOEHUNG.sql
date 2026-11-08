-- ═══ Casa Castel · Mieterhöhungen (Nov 2026 · safe to run twice · nothing is deleted) ═══
-- Tenants › Change rent › Mieterhöhung saves into this table, and Controlling applies the new rent from its date.
-- It was missing in the project, so saving a Mieterhöhung failed with "Not saved". Run this once in
-- Supabase › SQL Editor; afterwards Mieterhöhung, "Adjusted", "Skip" and Delete work.

create table if not exists casa_mieterhoehung_history (
  id uuid primary key default gen_random_uuid(),
  room text not null,                                  -- the room's name (moves with a room rename)
  tenant_id text,                                      -- the tenancy it belongs to
  effective_date date not null,                        -- "Gilt ab"
  amount numeric not null,                             -- the new Kaltmiete (Kalt + NK) or Pauschalmiete
  kind text not null default 'mieterhoehung',          -- mieterhoehung · korrektur · staffel · index · start · verlaengerung
  tenant_adjusted boolean not null default false,      -- "Adjusted" (the tenant pays the new rent)
  adjusted_date date,
  ignored boolean not null default false,              -- "Skip" (never charged)
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists casa_mh_room_idx   on casa_mieterhoehung_history (room, effective_date);
create index if not exists casa_mh_tenant_idx on casa_mieterhoehung_history (tenant_id);

-- the same access as the other rent tables (rent_periods, nk_vorauszahlung_history)
alter table casa_mieterhoehung_history enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'casa_mieterhoehung_history' and policyname = 'anon_all') then
    create policy anon_all on casa_mieterhoehung_history for all using (true) with check (true);
  end if;
end $$;
grant all on casa_mieterhoehung_history to anon, authenticated;

notify pgrst, 'reload schema';
