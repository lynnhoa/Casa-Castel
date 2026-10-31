-- ═══ Controlling · Build A: Casa Castel rooms linked by their ID (safe to run twice) ═══
-- After this, renaming a room never touches its link: Controlling finds the room by its ID.

-- 1 · Casa units linked to a room by the room's name → the room's ID
update public.ctrl_units u
   set source_ref = r.id::text
  from public.rooms r
 where u.source_type = 'casa_room'
   and lower(trim(u.source_ref)) = lower(trim(r.name));

-- 2 · Casa units with no link that were matched by their unit name → linked by the room's ID
update public.ctrl_units u
   set source_type = 'casa_room', source_ref = r.id::text
  from public.rooms r
 where u.property_id = 7
   and coalesce(u.source_type, '') = ''
   and lower(trim(u.name)) = lower(trim(r.name));

-- Check: Casa units (not parking) whose link is not a room ID — should be empty
select u.id, u.name, u.source_type, u.source_ref
  from public.ctrl_units u
 where u.property_id = 7
   and coalesce(u.source_type, '') <> 'rentals_parking'
   and not exists (select 1 from public.rooms r where u.source_type = 'casa_room' and r.id::text = u.source_ref)
 order by u.name;
