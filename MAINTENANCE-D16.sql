-- ═══ Maintenance · D16: Schaden like Renovierung (run BEFORE you upload the D16 files · safe to run twice) ═══
-- The report text gets its own field (Schadensbild, filled in the Schadensbericht pop-up).
-- A Schaden's long text moves from Description into it → the card stays slim, nothing is lost.
alter table public.maint_cases add column if not exists schadensbild text;
update public.maint_cases
   set schadensbild = description, description = null
 where kind = 'schaden' and schadensbild is null and nullif(btrim(description), '') is not null;

-- Check: Schäden with a Schadensbild · Schäden with a Description left (0 right after the move)
select count(*) filter (where kind = 'schaden' and schadensbild is not null) as schaeden_with_schadensbild,
       count(*) filter (where kind = 'schaden' and description is not null)  as schaeden_with_description
from public.maint_cases;
