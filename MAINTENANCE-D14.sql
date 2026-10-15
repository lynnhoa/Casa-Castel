-- ═══ Maintenance · D14: Controlling per receipt (run BEFORE you upload the D14 files · safe to run twice) ═══
-- Entries that are "Not booked" today hand that to their receipts → nothing changes in Controlling.
-- From now on each receipt has its own "Book in Controlling" tick (returns follow their receipt).
update public.maint_costs r set book_ctrl = false
  from public.maint_cases c
 where c.id = r.case_id and c.book_ctrl = false and r.return_of is null and r.book_ctrl is distinct from false;
update public.maint_cases set book_ctrl = true where book_ctrl is distinct from true;

-- Check: entries_not_booked must be 0 · receipts_not_booked = receipts you can tick one by one now
select (select count(*) from public.maint_cases where book_ctrl is distinct from true) as entries_not_booked,
       (select count(*) from public.maint_costs where return_of is null and book_ctrl = false) as receipts_not_booked;
