-- ═══ Maintenance · D6: slim Schadensbericht (safe to run twice) ═══

-- Content of a Schaden (Details): Besichtigung vor Ort · Bitte an die Hausverwaltung
-- Report form (remembered for next time): Ort · Dringend · Weitere Anlagen
alter table public.maint_cases
  add column if not exists besichtigung    text,
  add column if not exists bitte_hv        text,
  add column if not exists report_ort      text,
  add column if not exists report_dringend text,
  add column if not exists report_anlagen  text;

-- Check
select count(*) as schaeden from public.maint_cases where kind = 'schaden';
