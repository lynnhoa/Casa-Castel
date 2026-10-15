-- ═══ Unterzeichnungsort = the city of the property (safe to run twice) ═══

-- 1 · Apartment cards: Mainz-Kostheim / -Kastel / -Amöneburg belong to Wiesbaden, all others are Mainz
update public.rentals_apartments
set unterschrift_ort = case when plz_ort ~* 'kostheim|kastel|am(ö|oe)neburg' then 'Wiesbaden' else 'Mainz' end
where coalesce(unterschrift_ort, '') is distinct from
      case when plz_ort ~* 'kostheim|kastel|am(ö|oe)neburg' then 'Wiesbaden' else 'Mainz' end;

-- 2 · Maintenance: a Schadensbericht that remembered "Wiesbaden" for a Mainz property starts fresh
update public.maint_cases
set report_ort = null
where report_ort = 'Wiesbaden' and property_id <> 7 and coalesce(property_name, '') !~* 'kostheim|casa castel';

-- Check
select name, plz_ort, unterschrift_ort from public.rentals_apartments order by name;
