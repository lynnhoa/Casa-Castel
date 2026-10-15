-- ═══ Maintenance · D13: clean-up (run AFTER the D9–D12 files are live · safe to run twice) ═══
-- "Paid by", insurance and the unused Schaden fields: the app no longer reads or writes them.
alter table public.maint_cases drop column if exists paid_by;
alter table public.maint_cases drop column if exists schadennummer;
alter table public.maint_cases drop column if exists verursacher;
alter table public.maint_cases drop column if exists mieter_informiert;
alter table public.maint_cases drop column if exists eigentum;
alter table public.maint_cases drop column if exists report_mieter_sig;
alter table public.maint_cases drop column if exists report_anlagen;
drop table if exists public.maint_props;

-- Check: the columns Maintenance keeps
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'maint_cases' order by ordinal_position;
