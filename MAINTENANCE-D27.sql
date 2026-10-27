-- ═══ Maintenance · D27: your own "No." per receipt + the No. written on the receipt PDF (safe to run twice) ═══
-- Run this BEFORE you upload the D27 files.

-- 1 · Your own number for a receipt / return (field "No." in the receipt pop-up)
alter table public.maint_costs add column if not exists own_no    text;

-- 2 · A receipt PDF with your No. on it: the untouched original stays (orig_path),
--     stamp_no = the No. written on the copy you open (file_path)
alter table public.maint_docs  add column if not exists orig_path text;
alter table public.maint_docs  add column if not exists stamp_no  text;

-- 3 · Supabase sees the new columns right away
notify pgrst, 'reload schema';
