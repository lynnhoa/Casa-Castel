/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — ROOMS DATA
   js/rooms-data.js

   Global source of truth for all room data.
   Fetches from Supabase rooms table, caches in appRooms[].
   Exposes getters used by any tab or contract flow.

   NOT yet wired to other tabs (cleaning, kitchen, lounge) —
   those still use constants.js ALL_ROOMS / KITCHEN_ROOMS.
   That migration happens in a future phase.

   Depends on: constants.js, supabase-client.js
   Load order: after supabase-client.js, before tab modules
   ───────────────────────────────────────────────────────────── */


/* ── CACHE ───────────────────────────────────────────────── */
let appRooms = [];

/* ── CHANGE LISTENERS ────────────────────────────────────── */
const _roomsListeners = [];

function onRoomsChange(cb) {
  if (typeof cb === 'function') _roomsListeners.push(cb);
}

function _notifyRoomsListeners(event, room) {
  _roomsListeners.forEach(cb => {
    try { cb(appRooms, event, room); } catch(e) { console.warn('[rooms-data] listener error:', e); }
  });
}


/* ── FETCH ───────────────────────────────────────────────── */
async function loadRoomsData() {
  if (!sbL) return appRooms;

  const { data, error } = await sbL
    .from('rooms')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('[rooms-data] fetch error:', error.message);
    return appRooms;
  }

  appRooms = data || [];
  return appRooms;
}


/* ── GETTERS ─────────────────────────────────────────────── */
function getActiveRooms()  { return appRooms.filter(r => r.active); }
function getVacantRooms()  { return appRooms.filter(r => r.vacant && r.active); }
function getOccupiedRooms(){ return appRooms.filter(r => !r.vacant && r.active); }
function getRoomByName(name){ return appRooms.find(r => r.name === name) || null; }
function getRoomById(id)   { return appRooms.find(r => r.id === id) || null; }


/* ── WRITE HELPERS ───────────────────────────────────────── */

// Upsert a full room (insert or update)
async function saveRoom(roomData) {
  if (!sbL) return { ok: false, error: 'No database connection.' };

  const isNew = !roomData.id;
  let result;

  if (isNew) {
    // Assign sort_order at end of list
    const maxOrder = appRooms.length > 0
      ? Math.max(...appRooms.map(r => r.sort_order || 0))
      : -1;
    roomData.sort_order = maxOrder + 1;
    result = await sbL.from('rooms').insert(roomData).select().single();
  } else {
    result = await sbL.from('rooms').update(roomData).eq('id', roomData.id).select().single();
  }

  if (result.error) {
    console.warn('[rooms-data] save error:', result.error.message);
    return { ok: false, error: result.error.message };
  }

  // Update cache
  if (isNew) {
    appRooms.push(result.data);
  } else {
    const idx = appRooms.findIndex(r => r.id === roomData.id);
    if (idx !== -1) appRooms[idx] = result.data;
  }
  _notifyRoomsListeners(isNew ? 'INSERT' : 'UPDATE', result.data);
  return { ok: true, room: result.data };
}

// Toggle vacant state — instant, no full save needed
async function toggleRoomVacant(roomId) {
  if (!sbL) return { ok: false };
  const room = getRoomById(roomId);
  if (!room) return { ok: false };

  const newVacant = !room.vacant;
  const { error } = await sbL
    .from('rooms')
    .update({ vacant: newVacant, updated_at: new Date().toISOString() })
    .eq('id', roomId);

  if (error) return { ok: false, error: error.message };

  room.vacant = newVacant;
  await roomAfterVacancyChange(room, newVacant);
  return { ok: true, vacant: newVacant };
}

/* Follow-up after a vacancy change was saved: kitchen reset (when occupied) + tell the other tabs */
async function roomAfterVacancyChange(room, newVacant) {
  // When marking occupied: reset any stale 'skipped' kitchen_weeks row for this week
  if (!newVacant && typeof kWeekIdx === 'function') {
    try {
      const idx = kWeekIdx();
      if (idx >= 0) {
        const { data: kRow } = await sbL
          .from('kitchen_weeks')
          .select('id, status, room')
          .eq('week_index', idx)
          .maybeSingle();
        if (kRow && kRow.status === 'skipped' && kRow.room === room.name) {
          await sbL.from('kitchen_weeks').update({ status: 'pending' }).eq('id', kRow.id);
        }
      }
    } catch(e) { console.warn('[rooms-data] kitchen reset error:', e); }
  }

  _notifyRoomsListeners('UPDATE', room);
}

// Update sort order after drag
async function saveRoomOrder(orderedIds) {
  if (!sbL) return;

  const updates = orderedIds.map((id, i) =>
    sbL.from('rooms').update({ sort_order: i }).eq('id', id)
  );

  await Promise.all(updates);

  // Update cache order
  orderedIds.forEach((id, i) => {
    const r = getRoomById(id);
    if (r) r.sort_order = i;
  });
  appRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/* ── ROOM NAME = LINK KEY ─────────────────────────────────────
   Tenant records, NK-Vorauszahlungen, the tenant login password, lounge
   messages, Kitchen and Cleaning are stored under the room NAME.
   Renaming a room moves all of them to the new name (safe to repeat:
   it only touches rows that still carry the old name). */
const CC_ROOM_NAME_LINKS = [
  ['tenant_records',           'room'],
  ['nk_vorauszahlung_history', 'room'],
  ['lounge_data',              'room'],      // login password, messages, kitchen nudge
  ['kitchen_weeks',            'room'],
  ['kitchen_comments',         'room'],
  ['kitchen_absences',         'room'],
  ['cleaning_weeks',           'room'],
  ['cleaning_weeks',           'done_by'],
];
async function renameRoomLinks(oldName, newName) {
  if (!sbL || !oldName || !newName || oldName === newName) return { error: null };
  const results = await Promise.all(CC_ROOM_NAME_LINKS.map(([table, col]) =>
    sbL.from(table).update({ [col]: newName }).eq(col, oldName)
      .then(r => ({ table, col, error: r && r.error }), e => ({ table, col, error: e }))));
  const failed = results.filter(r => r.error).map(r => r.table + '.' + r.col);
  // Kitchen rotation list (kept as a list of names)
  try {
    if (typeof getKitchenRooms === 'function' && typeof syncKitchenRoomsToSupabase === 'function'
        && getKitchenRooms().includes(oldName)) {
      await syncKitchenRoomsToSupabase(getKitchenRooms().map(n => (n === oldName ? newName : n)));
    }
  } catch (e) { failed.push('kitchen list'); }
  if (failed.length) console.error('[rooms] rename links failed:', failed, results.filter(r => r.error));
  return failed.length ? { error: { message: 'not moved: ' + failed.join(', ') }, failed } : { error: null };
}

/* Tenant records still stored under this room (active + former) */
async function roomTenantCount(roomName) {
  if (!sbL || !roomName) return { active: 0, former: 0, error: null };
  const { data, error } = await sbL.from('tenant_records').select('id,status').eq('room', roomName);
  if (error) return { active: 0, former: 0, error };
  const rows = data || [];
  const active = rows.filter(r => r.status === 'active').length;
  return { active, former: rows.length - active, error: null };
}

// Delete a room — refused while tenant records are still stored under it
// (they would be hidden for good: nothing else shows them without the room).
async function deleteRoom(roomId) {
  if (!sbL) return { ok: false, error: 'No database connection.' };
  const _room = getRoomById(roomId);
  const _tc = await roomTenantCount(_room?.name);
  if (_tc.error) return { ok: false, error: _tc.error.message || String(_tc.error) };
  if (_tc.active + _tc.former > 0) return { ok: false, blocked: true, active: _tc.active, former: _tc.former, error: 'Room still has tenant records.' };

  const { error } = await sbL.from('rooms').delete().eq('id', roomId);
  if (error) return { ok: false, error: error.message };

  const room = getRoomById(roomId);
  if (typeof ccTplDeleteUnit === 'function') ccTplDeleteUnit('room', roomId);   // its contract templates go too
  appRooms = appRooms.filter(r => r.id !== roomId);
  _notifyRoomsListeners('DELETE', room);
  return { ok: true };
}

// Save inventar only
async function saveRoomInventar(roomId, inventar) {
  if (!sbL) return { ok: false };
  const { error } = await sbL
    .from('rooms')
    .update({ inventar, updated_at: new Date().toISOString() })
    .eq('id', roomId);

  if (error) return { ok: false, error: error.message };

  const room = getRoomById(roomId);
  if (room) room.inventar = inventar;
  return { ok: true };
}


/* ── REALTIME ────────────────────────────────────────────── */
let _roomsChannel = null;

function initRoomsRealtime() {
  if (!sbL || _roomsChannel) return;

  _roomsChannel = sbL
    .channel('rooms-table')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms' },
      payload => {
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === 'INSERT') {
          if (!appRooms.find(r => r.id === newRow.id)) {
            appRooms.push(newRow);
            appRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          }
          _notifyRoomsListeners('INSERT', newRow);

        } else if (eventType === 'UPDATE') {
          const idx = appRooms.findIndex(r => r.id === newRow.id);
          if (idx !== -1) appRooms[idx] = newRow;
          else appRooms.push(newRow);
          appRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          _notifyRoomsListeners('UPDATE', newRow);

        } else if (eventType === 'DELETE') {
          appRooms = appRooms.filter(r => r.id !== oldRow.id);
          _notifyRoomsListeners('DELETE', oldRow);
        }
      }
    )
    .subscribe();
}
