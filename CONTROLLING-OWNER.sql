-- ═══ Controlling · Fix 2: one owner per Casa Castel cost type (run BEFORE you upload the files · safe to run twice) ═══
--   utilities  = price, dates, rhythm and NK split in Providers › Utilities
--   properties = the Rate (from the Properties loan)
--   providers  = a Providers job: from owner_from on, its Soll comes only from the months you close in Providers
-- Nothing else changes: amounts, rhythms, due months and NK settings stay as they are.

-- 1 · two new fields on every cost type
alter table public.ctrl_castel_categories add column if not exists owner_app  text;
alter table public.ctrl_castel_categories add column if not exists owner_from date;

-- 2 · who owns what (Gärtner and Regeneriersalz stay with Utilities)
update public.ctrl_castel_categories set owner_app = 'properties', owner_from = null
 where upper(coalesce(code, '')) = 'RATE';
update public.ctrl_castel_categories set owner_app = 'providers', owner_from = coalesce(owner_from, date '2026-11-01')
 where upper(coalesce(code, '')) in ('PUTZDIENST', 'WINTERDIENST');
update public.ctrl_castel_categories set owner_app = 'utilities'
 where owner_app is null;

-- 3 · new cost types (added in Utilities) belong to Utilities; only the three owners are allowed
alter table public.ctrl_castel_categories alter column owner_app set default 'utilities';
alter table public.ctrl_castel_categories alter column owner_app set not null;
alter table public.ctrl_castel_categories drop constraint if exists ctrl_castel_categories_owner_app_check;
alter table public.ctrl_castel_categories add constraint ctrl_castel_categories_owner_app_check
  check (owner_app in ('utilities', 'properties', 'providers'));

-- 4 · Providers › People: the cost-type list now says who owns each type
create or replace function pv_admin_ctrl_categories() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform pv_admin_guard();
  if to_regclass('public.ctrl_castel_categories') is null then return '[]'::jsonb; end if;
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'', c.id::text, ''name'', c.name, ''owner_app'', c.owner_app)'
       || ' order by c.sort_order nulls last, c.name), ''[]''::jsonb) from public.ctrl_castel_categories c' into r;
  return r;
end $$;
revoke all on function pv_admin_ctrl_categories() from public, anon, authenticated;
grant execute on function pv_admin_ctrl_categories() to authenticated;

notify pgrst, 'reload schema';

-- Check: Rate = properties · Putzdienst, Winterdienst = providers from 01.11.2026 · everything else = utilities
select code, name, owner_app, owner_from, frequency, due_months
from public.ctrl_castel_categories
order by sort_order nulls last, name;
