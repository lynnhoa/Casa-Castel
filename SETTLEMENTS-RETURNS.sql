-- ═══ Settlements · Maintenance returns: Counted / Not counted (Nov 2026 · safe to run twice) ═══
-- In Settlements a Maintenance return is never a line of its own: its receipt counts at the net price
-- (receipt − its counted returns), and no letter or PDF ever mentions a return.
-- Each return gets a switch on your Settlements screen — NK (Casa Castel Teil A, Rentals NK) and Teil B Schaden.
-- Kleinreparatur always counts its returns (no switch).
--   settle_count true  = counted (the default: every return, as before)
--   settle_count false = not counted: the receipt counts higher by that return
-- Without this file Settlements counts every return and shows no switch. Nothing is deleted or changed.
alter table public.maint_costs add column if not exists settle_count boolean not null default true;
comment on column public.maint_costs.settle_count is
  'Settlements (Nov 2026): this return lowers its receipt in the NK and in Teil B Schaden. false = not counted. Receipts ignore it.';
