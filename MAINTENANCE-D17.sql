-- ═══ Maintenance · D17: Berichte (run BEFORE you upload the D17 files · safe to run twice) ═══
-- Besichtigung as date · time · durch
alter table public.maint_cases add column if not exists besichtigung_am    date;
alter table public.maint_cases add column if not exists besichtigung_zeit  text;
alter table public.maint_cases add column if not exists besichtigung_durch text;
-- "Points | Text" per text box (e.g. {"schadensbild":"list","ursache":"text"})
alter table public.maint_cases add column if not exists report_style jsonb;
-- Renovierungsbericht
alter table public.maint_cases add column if not exists rb_anlass   text;
alter table public.maint_cases add column if not exists rb_arbeiten text;
alter table public.maint_cases add column if not exists rb_ergebnis text;
alter table public.maint_cases add column if not exists rb_hinweise text;
alter table public.maint_cases add column if not exists rb_kosten   boolean not null default false;
-- Photos: Vorher / Nachher
alter table public.maint_docs add column if not exists phase text;
alter table public.maint_docs drop constraint if exists maint_docs_phase_check;
alter table public.maint_docs add constraint maint_docs_phase_check check (phase is null or phase in ('vorher', 'nachher'));
-- The Renovierungsbericht is a document type of its own
alter table public.maint_docs drop constraint if exists maint_docs_doc_type_check;
alter table public.maint_docs add constraint maint_docs_doc_type_check
  check (doc_type in ('photo','rechnung','angebot','schadenbericht','renovierungsbericht','other','receipt','video','email'));

-- Your Besichtigung text → date · time · durch (once; the old text stays as it was)
update public.maint_cases set
  besichtigung_am    = to_date(substring(besichtigung from '(\d{1,2}\.\d{1,2}\.\d{4})'), 'DD.MM.YYYY'),
  besichtigung_zeit  = substring(besichtigung from '(\d{1,2}:\d{2})'),
  besichtigung_durch = nullif(btrim(substring(besichtigung from 'durch\s+(.*)$')), '')
where nullif(btrim(besichtigung), '') is not null
  and besichtigung_am is null and besichtigung_zeit is null and besichtigung_durch is null;

-- Check: the Besichtigung split
select title, besichtigung, besichtigung_am, besichtigung_zeit, besichtigung_durch
from public.maint_cases where nullif(btrim(besichtigung), '') is not null;
