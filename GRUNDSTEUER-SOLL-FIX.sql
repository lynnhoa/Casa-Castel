-- GRUNDSTEUER-SOLL-FIX.sql · Grundsteuer Soll = the DKB figures 2026 · paste ALL of it into Supabase › SQL editor › Run
-- Changes ONLY the Grundsteuer plan, nothing else:
--   · Rentals › Apartments › Verwaltung "Grundsteuer (€/Quartal)"   (Controlling › Setup "Grundsteuer/Q" for a property not linked)
--   · Controlling › Setup "Grundsteuer due" (Studio One: January only)
--   · Casa Castel: the Grundsteuer price in Providers › Utilities (87,99 € in February, 87,98 € from May 2026), due Feb May Aug Nov
-- Bookings (Ist), letters, results, rents, Kaution: untouched. Safe to run again: what is already right stays as it is.
-- The table at the end shows every property: before → now. Nothing at all is changed if anything fails (one transaction).

alter table public.ctrl_properties add column if not exists grundsteuer_months jsonb;   -- Setup › "Grundsteuer due" (Studio One)

drop table if exists _gs_fix;
create temp table _gs_fix (o int, property text, change text, note text);
create or replace function pg_temp.gs_num(t text) returns numeric language sql immutable as   -- a number, else null ('' or text)
  $n$ select case when trim(coalesce(t, '')) ~ '^[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)$' then trim(t)::numeric end $n$;

do $fix$
declare
  bank constant jsonb := '[
    {"k":1, "b":"Kostheim",           "q":18.98, "kind":"q",    "inc":"kostheim",                      "num":null,                      "exc":null},
    {"k":2, "b":"Kaiserstr. WHG 507", "q":26.78, "kind":"q",    "inc":"",                              "num":"(^|[^0-9])507([^0-9]|$)", "exc":null},
    {"k":3, "b":"Campo Novo",         "q":40.06, "kind":"q",    "inc":"campo",                         "num":null,                      "exc":null},
    {"k":4, "b":"Kaiserstr. WHG 516", "q":67.52, "kind":"q",    "inc":"",                              "num":"(^|[^0-9])516([^0-9]|$)", "exc":null},
    {"k":5, "b":"Kaiser-W-R 17",      "q":74.13, "kind":"q",    "inc":"kaiser[^a-z0-9]*w|wilhelm|kwr", "num":"(^|[^0-9])17([^0-9]|$)",  "exc":"kaiser[^a-z0-9]*str"},
    {"k":6, "b":"Wallaustr. 44",      "q":47.47, "kind":"q",    "inc":"wallau",                        "num":null,                      "exc":null},
    {"k":7, "b":"Casa Castel",        "q":87.98, "kind":"casa", "inc":"casa[^a-z0-9]*castel",          "num":null,                      "exc":null},
    {"k":8, "b":"Adam-K-S. WHG 08",   "q":null,  "kind":"none", "inc":"adam",                          "num":"(^|[^0-9])0?8([^0-9]|$)", "exc":null},
    {"k":9, "b":"Adam-K-S. WHG 10",   "q":null,  "kind":"none", "inc":"adam",                          "num":"(^|[^0-9])10([^0-9]|$)",  "exc":null},
    {"k":10,"b":"Studio One",         "q":77.68, "kind":"year", "inc":"studio",                        "num":null,                      "exc":null}]';
  b jsonb; p record; n int; pid text; pname text; aid text; q numeric; kind text; hid text;
  nv int; cur numeric; gm jsonb; want jsonb; t_gm text; t_dm text; has_def boolean; has_hist boolean;
  cat record; ncat int; eff int[]; pf numeric; px numeric; nh int; did text; frq text;
  norm text;
begin
  select data_type into t_gm from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_properties' and column_name = 'grundsteuer_months';
  select data_type into t_dm from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_castel_categories' and column_name = 'due_months';
  has_def := exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ctrl_properties' and column_name = 'def_grundsteuer');
  has_hist := to_regclass('public.ctrl_castel_amount_history') is not null;

  for b in select * from jsonb_array_elements(bank) loop
    q := (b ->> 'q')::numeric; kind := b ->> 'kind';
    -- the active property this bank figure belongs to (Casa Castel is always property 7)
    select count(*) into n from public.ctrl_properties x
     where coalesce((to_jsonb(x) ->> 'active')::boolean, false)
       and (case when kind = 'casa' then x.id = 7
                 else x.id <> 7 and lower(coalesce(x.name, '')) ~ (b ->> 'inc')
                      and (b ->> 'num' is null or coalesce(x.name, '') ~ (b ->> 'num'))
                      and (b ->> 'exc' is null or lower(coalesce(x.name, '')) !~ (b ->> 'exc')) end);
    if n <> 1 then
      insert into _gs_fix values ((b ->> 'k')::int, b ->> 'b', 'nothing changed',
        case when n = 0 then 'no active property found for this name (switched off, or named differently)' else n || ' active properties match this name – check the names in Controlling › Setup' end);
      continue;
    end if;
    select x.id, x.name, to_jsonb(x) as j into p from public.ctrl_properties x
     where coalesce((to_jsonb(x) ->> 'active')::boolean, false)
       and (case when kind = 'casa' then x.id = 7
                 else x.id <> 7 and lower(coalesce(x.name, '')) ~ (b ->> 'inc')
                      and (b ->> 'num' is null or coalesce(x.name, '') ~ (b ->> 'num'))
                      and (b ->> 'exc' is null or lower(coalesce(x.name, '')) !~ (b ->> 'exc')) end);
    pid := p.id::text; pname := p.name;

    if kind = 'casa' then
      -- ── Casa Castel: its Grundsteuer cost type in Providers › Utilities ──
      -- the Grundsteuer cost type; with more than one (e.g. a one-off "Grundsteuer Nachzahlung"), the one called just "Grundsteuer"
      select count(*) into ncat from public.ctrl_castel_categories c
       where upper(coalesce(to_jsonb(c) ->> 'code', '')) <> 'RATE' and coalesce(to_jsonb(c) ->> 'active', '') <> 'false'
         and (upper(coalesce(to_jsonb(c) ->> 'code', '')) like '%GRUNDSTEUER%' or lower(coalesce(c.name, '')) like '%grundsteuer%');
      if ncat > 1 then
        select count(*) into ncat from public.ctrl_castel_categories c
         where upper(coalesce(to_jsonb(c) ->> 'code', '')) <> 'RATE' and coalesce(to_jsonb(c) ->> 'active', '') <> 'false'
           and (upper(trim(coalesce(to_jsonb(c) ->> 'code', ''))) = 'GRUNDSTEUER' or lower(trim(coalesce(c.name, ''))) = 'grundsteuer');
        if ncat = 1 then ncat := -1; else ncat := greatest(ncat, 2); end if;      -- -1: one plain "Grundsteuer" among several
      end if;
      if ncat not in (1, -1) then
        insert into _gs_fix values (7, pname, 'nothing changed',
          case when ncat = 0 then 'no Grundsteuer cost type in Providers › Utilities' else 'several Grundsteuer cost types – change the right one in Providers › Utilities' end);
        continue;
      end if;
      select c.id, c.name, to_jsonb(c) as j into cat from public.ctrl_castel_categories c
       where upper(coalesce(to_jsonb(c) ->> 'code', '')) <> 'RATE' and coalesce(to_jsonb(c) ->> 'active', '') <> 'false'
         and (case when ncat = -1 then upper(trim(coalesce(to_jsonb(c) ->> 'code', ''))) = 'GRUNDSTEUER' or lower(trim(coalesce(c.name, ''))) = 'grundsteuer'
                   else upper(coalesce(to_jsonb(c) ->> 'code', '')) like '%GRUNDSTEUER%' or lower(coalesce(c.name, '')) like '%grundsteuer%' end);
      did := '';
      -- rhythm: due in Feb May Aug Nov (as the app reads it: monthly = every month, or only its months if set)
      frq := lower(coalesce(nullif(cat.j ->> 'frequency', ''), 'monatlich'));
      eff := case when jsonb_typeof(cat.j -> 'due_months') = 'array'
                  then array(select distinct (e)::numeric::int from jsonb_array_elements_text(cat.j -> 'due_months') e where e ~ '^[0-9]+([.][0-9]+)?$' order by 1)
                  else '{}'::int[] end;
      if frq = 'monatlich' and cardinality(eff) = 0 then eff := array[1,2,3,4,5,6,7,8,9,10,11,12]; end if;
      if eff is distinct from array[2,5,8,11] then
        execute format('update public.ctrl_castel_categories set frequency = %L, due_months = %s where id::text = %L', 'vierteljährlich',
                       case when t_dm = 'jsonb' or t_dm = 'json' then quote_literal('[2,5,8,11]') || '::' || t_dm
                            when t_dm = 'ARRAY' then quote_literal('{2,5,8,11}') else quote_literal('[2,5,8,11]') end, cat.id::text);
        did := did || 'due Feb May Aug Nov (was ' || coalesce(nullif(array_to_string(eff, ' '), ''), 'none') || '); ';
      end if;
      if has_hist then
        -- the price of a month as Controlling reads it: the last price from that month or earlier, else the first one, else the default
        select count(*) into nh from public.ctrl_castel_amount_history h where h.category_id = cat.id;
        if nh = 0 then
          execute format('insert into public.ctrl_castel_amount_history (category_id, valid_from, amount, reason) values (%L, %L, %L, %L)',
                         cat.id, '2000-01-01', coalesce(pg_temp.gs_num(cat.j ->> 'default_amount'), 0), 'Start');
        end if;
        for n in select unnest(array[2, 5]) loop
          px := case n when 2 then 87.99 else 87.98 end;
          select pg_temp.gs_num(h.amount::text) into cur from public.ctrl_castel_amount_history h
           where h.category_id = cat.id and left(h.valid_from::text, 7) <= '2026-' || lpad(n::text, 2, '0')
           order by h.valid_from desc, h.id desc limit 1;
          if cur is distinct from px then
            if exists (select 1 from public.ctrl_castel_amount_history h where h.category_id = cat.id and left(h.valid_from::text, 7) = '2026-' || lpad(n::text, 2, '0')) then
              update public.ctrl_castel_amount_history h set amount = px
               where h.category_id = cat.id and left(h.valid_from::text, 7) = '2026-' || lpad(n::text, 2, '0');
            else
              execute format('insert into public.ctrl_castel_amount_history (category_id, valid_from, amount, reason) values (%L, %L, %L, %L)',
                             cat.id, '2026-' || lpad(n::text, 2, '0') || '-01', px, 'Neuer Abschlag');
            end if;
            did := did || to_char(make_date(2026, n, 1), 'Mon') || ' ' || replace(px::text, '.', ',') || ' € (was ' || coalesce(replace(cur::text, '.', ','), '–') || '); ';
          end if;
        end loop;
        -- a later price in 2026 that is not the bank's 87,98 €
        for cur, hid in select pg_temp.gs_num(h.amount::text), h.id::text from public.ctrl_castel_amount_history h
                        where h.category_id = cat.id and left(h.valid_from::text, 7) between '2026-06' and '2026-12' and pg_temp.gs_num(h.amount::text) is distinct from 87.98 loop
          update public.ctrl_castel_amount_history set amount = 87.98 where id::text = hid;
          did := did || 'a later 2026 price ' || replace(cur::text, '.', ',') || ' → 87,98 €; ';
        end loop;
      else
        if coalesce(pg_temp.gs_num(cat.j ->> 'default_amount'), -1) <> 87.98 then
          update public.ctrl_castel_categories set default_amount = 87.98 where id = cat.id;
          did := did || 'price 87,98 € (was ' || coalesce(replace(cat.j ->> 'default_amount', '.', ','), '–') || '); ';
        end if;
      end if;
      insert into _gs_fix values (7, pname, coalesce(nullif(rtrim(did, '; '), ''), 'already right'),
        'Providers › Utilities · ' || cat.name || ' · Feb 87,99 · May Aug Nov 87,98');
      continue;
    end if;

    -- ── a flat: Rentals › Apartments › Verwaltung (saved link, else the same name), else Controlling › Setup ──
    norm := regexp_replace(lower(coalesce(pname, '')), '[^a-z0-9äöüß]', '', 'g');
    aid := null;
    if nullif(p.j ->> 'rentals_apartment_ref', '') is not null then
      select a.id::text into aid from public.rentals_apartments a where a.id::text = p.j ->> 'rentals_apartment_ref' order by a.ctid limit 1;
    else
      select a.id::text into aid from public.rentals_apartments a
       where regexp_replace(lower(coalesce(a.name, '')), '[^a-z0-9äöüß]', '', 'g') = norm order by a.ctid limit 1;
    end if;
    did := '';
    if aid is not null then
      select count(*) into nv from public.rentals_verwaltung v where v.apartment_id::text = aid;
      select pg_temp.gs_num(to_jsonb(v) ->> 'grundsteuer_mtl') into cur from public.rentals_verwaltung v where v.apartment_id::text = aid order by v.ctid limit 1;
      if nv = 0 then
        if q is not null then                                   -- the flat has no Verwaltung row yet: one with only the Grundsteuer
          begin
            execute format('insert into public.rentals_verwaltung (apartment_id, grundsteuer_mtl) values (%L, %L)', aid, q);
            did := did || 'Grundsteuer ' || replace(q::text, '.', ',') || ' € (was empty); ';
          exception when others then
            insert into _gs_fix values ((b ->> 'k')::int, pname, 'nothing changed',
              'no Verwaltung row in Rentals yet – type ' || replace(q::text, '.', ',') || ' € in Rentals › Apartments › Verwaltung › Grundsteuer');
            continue;
          end;
        end if;
      elsif (q is null and coalesce(cur, 0) <> 0) or (q is not null and cur is distinct from q) then
        update public.rentals_verwaltung v set grundsteuer_mtl = q where v.apartment_id::text = aid;
        did := did || 'Grundsteuer ' || coalesce(replace(q::text, '.', ',') || ' €', 'empty') || ' (was ' || coalesce(replace(cur::text, '.', ',') || ' €', 'empty') || '); ';
      end if;
    else
      if not has_def then
        if q is not null then
          insert into _gs_fix values ((b ->> 'k')::int, pname, 'nothing changed', 'not linked to a Rentals flat – link it in Controlling › Setup');
          continue;
        end if;
      else
        cur := pg_temp.gs_num(p.j ->> 'def_grundsteuer');
        if (q is null and coalesce(cur, 0) <> 0) or (q is not null and cur is distinct from q) then
          update public.ctrl_properties set def_grundsteuer = q where id::text = pid;
          did := did || 'Grundsteuer/Q ' || coalesce(replace(q::text, '.', ',') || ' €', 'empty') || ' (was ' || coalesce(replace(cur::text, '.', ',') || ' €', 'empty') || '); ';
        end if;
      end if;
    end if;
    -- due months: Studio One January only · the others Feb May Aug Nov (empty = Feb May Aug Nov)
    gm := p.j -> 'grundsteuer_months';
    want := case kind when 'year' then '[1]'::jsonb when 'q' then '[2,5,8,11]'::jsonb else null end;
    if want is not null then
      if (kind = 'year' and (gm is null or jsonb_typeof(gm) <> 'array' or (select coalesce(jsonb_agg((e)::numeric::int order by (e)::numeric), '[]') from jsonb_array_elements_text(gm) e) <> want))
         or (kind = 'q' and jsonb_typeof(gm) = 'array' and gm <> '[]'::jsonb
             and (select coalesce(jsonb_agg((e)::numeric::int order by (e)::numeric), '[]') from jsonb_array_elements_text(gm) e) <> want) then
        execute format('update public.ctrl_properties set grundsteuer_months = %s where id::text = %L',
                       case when t_gm = 'ARRAY' then quote_literal(case kind when 'year' then '{1}' else '{2,5,8,11}' end)
                            else quote_literal(want::text) || '::' || coalesce(t_gm, 'jsonb') end, pid);
        did := did || 'due ' || case kind when 'year' then 'January only' else 'Feb May Aug Nov' end || '; ';
      end if;
    end if;
    insert into _gs_fix values ((b ->> 'k')::int, pname, coalesce(nullif(rtrim(did, '; '), ''), 'already right'),
      case kind when 'q' then replace(q::text, '.', ',') || ' € a quarter · Feb May Aug Nov'
                when 'year' then '77,68 € once a year · January (2026 was paid in January)'
                else 'no Grundsteuer debited in 2026 – nothing planned' end
      || case when aid is not null then ' · Rentals › Verwaltung' else ' · Controlling › Setup' end);
  end loop;
end
$fix$;

notify pgrst, 'reload schema';

select property, change, note from _gs_fix order by o;
