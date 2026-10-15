-- ═══ Maintenance · D7: videos + e-mails as documents → Anlagen fill themselves (safe to run twice) ═══

-- 1 · Two more document types: Video · E-Mail
alter table public.maint_docs drop constraint if exists maint_docs_doc_type_check;
alter table public.maint_docs add constraint maint_docs_doc_type_check
  check (doc_type in ('photo','rechnung','angebot','schadenbericht','other','receipt','video','email'));

-- 2 · Length of a video in seconds ("IMG_9009.mov (20 Sek.)")
alter table public.maint_docs add column if not exists media_seconds integer;

-- Check
select doc_type, count(*) from public.maint_docs group by doc_type order by doc_type;
