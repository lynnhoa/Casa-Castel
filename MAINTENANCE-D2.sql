-- ═══ Maintenance · D2: end date + returns (safe to run twice) ═══

-- 1 · End date of an entry (optional; never before the start)
alter table public.maint_cases add column if not exists end_date date;
alter table public.maint_cases drop constraint if exists maint_cases_end_after_start;
alter table public.maint_cases add constraint maint_cases_end_after_start
  check (end_date is null or case_date is null or end_date >= case_date);

-- 2 · Returns: rows that point to their receipt (column from D1) — quick lookup
create index if not exists maint_costs_return on public.maint_costs (return_of);

-- Check: entries with an end date · returns so far
select 'entries with an end date' as t, count(*) from public.maint_cases where end_date is not null
union all select 'returns', count(*) from public.maint_costs where return_of is not null;
