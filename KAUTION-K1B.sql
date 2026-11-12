-- ═══ Kaution K1b: rent owed and damage kept from the Kaution count in Controlling (Nov 2026 · safe to run twice · no data changed) ═══
-- You enter them ONCE, on the Kaution card of the tenant who moved out (Casa Castel and Rentals):
--   "Rent owed" + Month → that month counts as received in Controlling › Income
--   "Damage" + Reason   → one line "<Zimmer/flat> · Erstattung Mieter · <Reason> · aus Kaution" in Controlling › One-off
-- Without this file the Kaution card works exactly as before and shows no new rows. Nothing is deleted or changed.
-- 1 · What the Kaution card kept at move-out (shown again when you open the card, needed to change or clear it later)
--     {"rent":[{"m":"2026-09","a":1000}], "dmg":{"a":400,"r":"Maler Wand · 05.10.2026","cost":"<maint_costs.id or null>"}}
alter table public.kaution     add column if not exists kept jsonb;
alter table public.rnt_kaution add column if not exists kept jsonb;
-- 2 · The part of a rent month that was paid from the Kaution, per tenant: {"<tenant id>": {"a": 1000, "nk": 200}}
--     Lets the card change or take back exactly its own part (never twice, a bank transfer in the same month stays)
alter table public.ctrl_income_months add column if not exists kau_part jsonb;
notify pgrst, 'reload schema';
-- Check (one row): all three columns exist
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kaution' and column_name = 'kept') as kaution_kept,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rnt_kaution' and column_name = 'kept') as rnt_kaution_kept,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_income_months' and column_name = 'kau_part') as income_kau_part;
