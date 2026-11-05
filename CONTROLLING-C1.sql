-- ═══ Controlling · C1: "On purpose" for differences between Soll and Ist (run BEFORE you upload the Controlling package 2 files · safe to run twice) ═══
-- Most differences are on purpose (an agreed amount, a rent reduction, paid with the Kaution, pays the rest later);
-- some are mistakes. In Income and Expenses a row whose Ist differs from its Soll gets a small "On purpose" button.
-- A row you mark is shown in grey with its reason ("− 80,00 € · Agreed") and no longer counts as a difference.
-- Changing its amount again clears the mark, because the difference is new.
-- Without this file Controlling works as before; it just offers no "On purpose".
-- Nothing is deleted. Old rows have no mark, so their differences show as unclear once, until you mark them.

-- 1 · Rent per unit and month (Income)
--     diff_ok      true = the difference of this month is on purpose
--                  (a tenant change month: one mark for the whole unit, both tenants)
--     diff_reason  agreed = Agreed · reduction = Rent reduction · kaution = paid with the Kaution
--                  later = pays later · other = Other · empty = on purpose without a reason
alter table public.ctrl_income_months add column if not exists diff_ok     boolean not null default false;
alter table public.ctrl_income_months add column if not exists diff_reason text;
alter table public.ctrl_income_months drop constraint if exists ctrl_income_months_diff_reason_check;
alter table public.ctrl_income_months add constraint ctrl_income_months_diff_reason_check
  check (diff_reason is null or (diff_ok and diff_reason in ('agreed', 'reduction', 'kaution', 'later', 'other')));

-- 2 · Casa Castel costs per cost type and month (Expenses): the same two columns
alter table public.ctrl_expense_castel add column if not exists diff_ok     boolean not null default false;
alter table public.ctrl_expense_castel add column if not exists diff_reason text;
alter table public.ctrl_expense_castel drop constraint if exists ctrl_expense_castel_diff_reason_check;
alter table public.ctrl_expense_castel add constraint ctrl_expense_castel_diff_reason_check
  check (diff_reason is null or (diff_ok and diff_reason in ('agreed', 'reduction', 'kaution', 'later', 'other')));

-- 3 · Apartment costs per property and month (Expenses). One row holds several lines (Kreditrate, Zinsen, Tilgung,
--     Hausgeld, Grundsteuer, Strom), and each line has its own mark — marking the Hausgeld must not hide a wrong Kreditrate.
--     diff_marks   the lines that are on purpose, each with its reason: {"hausgeld": "agreed", "strom": null}
--                  (null = without a reason) · empty = nothing marked
create or replace function public.ctrl_diff_marks_ok(m jsonb) returns boolean
language sql immutable set search_path = public as $$
  select case
    when m is null then true
    when jsonb_typeof(m) <> 'object' then false
    else not exists (select 1 from jsonb_each(m) e
                      where e.key not in ('rate', 'zinsen', 'tilgung', 'hausgeld', 'grundsteuer', 'strom')
                         or not (jsonb_typeof(e.value) = 'null'
                                 or (jsonb_typeof(e.value) = 'string'
                                     and e.value #>> '{}' in ('agreed', 'reduction', 'kaution', 'later', 'other'))))
  end
$$;
alter table public.ctrl_expense_apartments add column if not exists diff_marks jsonb;
alter table public.ctrl_expense_apartments drop constraint if exists ctrl_expense_apartments_diff_marks_check;
alter table public.ctrl_expense_apartments add constraint ctrl_expense_apartments_diff_marks_check
  check (public.ctrl_diff_marks_ok(diff_marks));

-- 4 · A changed amount clears its mark — also when Settlements or Providers change it (they write the
--     Casa Castel running costs too). Controlling clears it in the same save already; this is the safety net.
--     A save that sets or clears the mark itself is left alone. The same amount saved again keeps the mark.
create or replace function public.ctrl_diff_clear() returns trigger
language plpgsql set search_path = public as $$
declare
  k text;
  m jsonb;
begin
  if tg_table_name = 'ctrl_expense_apartments' then
    if new.diff_marks is not null and new.diff_marks is not distinct from old.diff_marks then
      m := new.diff_marks;
      foreach k in array array['rate', 'zinsen', 'tilgung', 'hausgeld', 'grundsteuer', 'strom'] loop
        if (m -> k) is not null and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then m := m - k; end if;
      end loop;
      new.diff_marks := case when m = '{}'::jsonb then null else m end;
    end if;
    return new;
  end if;
  if new.diff_ok and old.diff_ok and new.diff_reason is not distinct from old.diff_reason then
    if tg_table_name = 'ctrl_income_months' then
      -- the unit's total, or one tenant's part in a change month (split · read via jsonb, so a table without it works too)
      if round(coalesce(new.kaltmiete, 0)::numeric + coalesce(new.nebenkosten, 0)::numeric, 2)
           <> round(coalesce(old.kaltmiete, 0)::numeric + coalesce(old.nebenkosten, 0)::numeric, 2)
         or (to_jsonb(new) -> 'split') is distinct from (to_jsonb(old) -> 'split')
            and jsonb_typeof(to_jsonb(new) -> 'split') = 'object' and jsonb_typeof(to_jsonb(old) -> 'split') = 'object' then
        new.diff_ok := false;
        new.diff_reason := null;
      end if;
    elsif round(coalesce(new.amount, 0)::numeric, 2) <> round(coalesce(old.amount, 0)::numeric, 2) then
      new.diff_ok := false;
      new.diff_reason := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ctrl_income_months_diff_clear on public.ctrl_income_months;
create trigger ctrl_income_months_diff_clear before update on public.ctrl_income_months
  for each row execute function public.ctrl_diff_clear();
drop trigger if exists ctrl_expense_castel_diff_clear on public.ctrl_expense_castel;
create trigger ctrl_expense_castel_diff_clear before update on public.ctrl_expense_castel
  for each row execute function public.ctrl_diff_clear();
drop trigger if exists ctrl_expense_apartments_diff_clear on public.ctrl_expense_apartments;
create trigger ctrl_expense_apartments_diff_clear before update on public.ctrl_expense_apartments
  for each row execute function public.ctrl_diff_clear();

-- 5 · Supabase sees the new columns right away
notify pgrst, 'reload schema';

-- Check (one row):
--   income_cols  = 2   (diff_ok and diff_reason on ctrl_income_months)
--   castel_cols  = 2   (the same on ctrl_expense_castel)
--   apt_cols     = 1   (diff_marks on ctrl_expense_apartments)
--   triggers     = 3   (a changed amount clears its mark, on all three tables)
--   marked       = 0   right after the first run (later: the rows and lines you marked "On purpose")
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_income_months'
     and column_name in ('diff_ok', 'diff_reason')) as income_cols,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_expense_castel'
     and column_name in ('diff_ok', 'diff_reason')) as castel_cols,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_expense_apartments'
     and column_name = 'diff_marks') as apt_cols,
  (select count(*) from pg_trigger where not tgisinternal and tgname in
     ('ctrl_income_months_diff_clear', 'ctrl_expense_castel_diff_clear', 'ctrl_expense_apartments_diff_clear')) as triggers,
  (select count(*) from public.ctrl_income_months where diff_ok)
    + (select count(*) from public.ctrl_expense_castel where diff_ok)
    + (select count(*) from public.ctrl_expense_apartments a, jsonb_object_keys(a.diff_marks) k) as marked;
