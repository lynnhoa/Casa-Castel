-- Adds the Identity-section columns that rentals-tab-apartments.js writes to
-- via _aptSaveIdentity(), but which may be missing from rentals_apartments.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE rentals_apartments
  ADD COLUMN IF NOT EXISTS floor              text,
  ADD COLUMN IF NOT EXISTS plz_ort            text,
  ADD COLUMN IF NOT EXISTS gerichtsstand      text,
  ADD COLUMN IF NOT EXISTS unterschrift_ort   text,
  ADD COLUMN IF NOT EXISTS flaeche_m2         numeric,
  ADD COLUMN IF NOT EXISTS zimmer_type        text,
  ADD COLUMN IF NOT EXISTS heizungsart        text,
  ADD COLUMN IF NOT EXISTS energieklasse      text,
  ADD COLUMN IF NOT EXISTS endenergiebedarf   text,
  ADD COLUMN IF NOT EXISTS energieausweisart  text;

-- After running this, ask PostgREST to reload its schema cache
-- (Supabase usually does this automatically within a few seconds,
-- or you can run NOTIFY pgrst, 'reload schema'; manually below).
NOTIFY pgrst, 'reload schema';
