-- ═══ Maintenance · D30: the "Sonstiges" tab (run BEFORE you upload the D30 files · safe to run twice) ═══
-- 1 · a third case type: sonstiges (Hausversammlung, Mieterfest …)
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.maint_cases'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%renovierung%schaden%'
  loop execute format('alter table public.maint_cases drop constraint %I', r.conname); end loop;
end $$;
alter table public.maint_cases add constraint maint_cases_kind_check
  check (kind in ('renovierung','schaden','sonstiges'));

-- 2 · its Bericht: Art · Ort · Uhrzeit · Teilnehmer
--     (the three text boxes and the Kosten switch use the Renovierungsbericht fields)
alter table public.maint_cases add column if not exists so_art        text;
alter table public.maint_cases add column if not exists so_ort        text;
alter table public.maint_cases add column if not exists so_zeit       text;
alter table public.maint_cases add column if not exists so_teilnehmer text;

-- 3 · the saved PDF: document type "bericht"
alter table public.maint_docs drop constraint if exists maint_docs_doc_type_check;
alter table public.maint_docs add constraint maint_docs_doc_type_check
  check (doc_type in ('photo','rechnung','angebot','schadenbericht','renovierungsbericht','bericht','other','receipt','video','email'));

notify pgrst, 'reload schema';

-- Check: the new fields are there (0 Sonstiges entries right after running it)
select count(*) filter (where kind = 'sonstiges') as sonstiges_entries,
       count(so_art) as with_art
from public.maint_cases;
