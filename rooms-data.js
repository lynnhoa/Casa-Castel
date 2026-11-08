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

  const read = () => sbL.from('rooms').select('*').order('sort_order', { ascending: true });
  let { data, error } = await read();
  // #16: a cold connection often fails the first read — one more try before "could not be loaded"
  if (error) { await new Promise(r => setTimeout(r, 800)); ({ data, error } = await read()); }

  if (error) {
    console.warn('[rooms-data] fetch error:', error.message);
    loadRoomsData.lastOk = false;          // a failed load is never "no rooms"
    return appRooms;
  }

  loadRoomsData.lastOk = true;
  appRooms = _roomOrderApplyHold(data || []);   // #33
  return appRooms;
}


/* ── GETTERS ─────────────────────────────────────────────── */
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

/* Follow-up after a vacancy change was saved: kitchen reset (when occupied) + tell the other tabs */

// Update sort order after drag (#33, Nov 2026, after review): the WHOLE dragged order is written (every room's place —
// a phone that missed another device's change never saves a mixed order); drags queue, and a newer drag replaces a
// waiting older one (it writes everything anyway). Still failing after one retry → the order the database really
// has comes back (reloaded; offline: the order from before the unsaved drags) and { ok:false } → "Not saved".
const _roomOrderHold = new Map();            // id → the place this device shows while its order is saved (+2 s for late echoes)
let _roomOrderQ = Promise.resolve(), _roomOrderTick = 0, _roomOrderPending = 0, _roomOrderBase = null;
function _roomOrderApplyHold(rows) {
  if (!_roomOrderHold.size) return rows;
  rows.forEach(r => { const o = _roomOrderHold.get(String(r.id)); if (o !== undefined) r.sort_order = o; });
  return rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}
function saveRoomOrder(orderedIds) {
  const k = id => String(id);
  if (!_roomOrderPending) _roomOrderBase = new Map(appRooms.map(r => [k(r.id), r.sort_order]));   // before the unsaved drags
  orderedIds.forEach((id, i) => { const r = appRooms.find(x => k(x.id) === k(id)); if (r) r.sort_order = i; });
  appRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (!sbL || !orderedIds.length) return Promise.resolve({ ok: true });
  _roomOrderHold.clear(); orderedIds.forEach((id, i) => _roomOrderHold.set(k(id), i));
  const want = orderedIds.slice(), tick = ++_roomOrderTick;
  _roomOrderPending++;
  const run = async () => {
    try {
      if (tick !== _roomOrderTick) return { ok: true, superseded: true };        // a newer drag writes the whole order
      const wrote = new Set();                                                    // rows this run has saved
      const res = await ccPersist(async () => {
        const rs = await Promise.all(want.map((id, i) => wrote.has(k(id)) ? {} : sbL.from('rooms').update({ sort_order: i }).eq('id', id)
          .then(r => { if (r && !r.error) wrote.add(k(id)); return r || {}; }, e => ({ error: e }))));
        return { error: (rs.find(r => r.error) || {}).error || null };
      });
      if (tick !== _roomOrderTick) return { ok: true, superseded: true };        // a newer drag came meanwhile — it writes everything
      if (res.error) {
        _roomOrderHold.clear();
        // the rows this run did save go back to their place from before (never a half-saved order in the database)
        if (_roomOrderBase && wrote.size) await Promise.all([...wrote].filter(id => _roomOrderBase.has(id)).map(id =>
          ccPersist(() => sbL.from('rooms').update({ sort_order: _roomOrderBase.get(id) }).eq('id', id))));
        await loadRoomsData();                                                    // the order the database really has
        if (loadRoomsData.lastOk === false && _roomOrderBase) {                   // offline: the order before the unsaved drags
          appRooms.forEach(r => { if (_roomOrderBase.has(k(r.id))) r.sort_order = _roomOrderBase.get(k(r.id)); });
          appRooms.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        }
        return { ok: false, error: res.error };
      }
      setTimeout(() => { if (tick === _roomOrderTick) _roomOrderHold.clear(); }, 2000);
      return { ok: true };
    } finally { _roomOrderPending--; }
  };
  const p = _roomOrderQ.then(run, run);
  _roomOrderQ = p.catch(() => {});
  return p;
}

/* ── ROOM NAME = LINK KEY ─────────────────────────────────────
   Tenant records, NK-Vorauszahlungen, the tenant login password, lounge
   messages, Kitchen and Cleaning are stored under the room NAME.
   Renaming a room moves all of them to the new name (safe to repeat:
   it only touches rows that still carry the old name). */
const CC_ROOM_NAME_LINKS = [
  ['tenant_records',             'room'],
  ['nk_vorauszahlung_history',   'room'],
  ['casa_mieterhoehung_history', 'room'],    // Oct 2026: rent increases (Controlling applies them by room)
  ['pw_requests',                'room'],    // Oct 2026: password requests
  ['lounge_data',                'room'],    // login password, messages, kitchen nudge
  ['kitchen_weeks',              'room'],
  ['kitchen_comments',           'room'],
  ['kitchen_absences',           'room'],
  ['cleaning_weeks',             'room'],
  ['cleaning_weeks',             'done_by'],
];
/* Room names are unique and capital letters / spaces don't count ("New York" = "new york").
   A case-only change and a real rename both move every row, whatever spelling it was stored with. */
const _ccRoomNorm = s => String(s || '').trim().toLowerCase();
const _ccIlikeExact = s => String(s || '').trim().replace(/[\\%_]/g, m => '\\' + m);   // ilike pattern without wildcards
async function renameRoomLinks(oldName, newName) {
  if (!sbL || !oldName || !newName || oldName === newName) return { error: null };
  const pat = _ccIlikeExact(oldName);
  const results = await Promise.all(CC_ROOM_NAME_LINKS.map(([table, col]) =>
    sbL.from(table).update({ [col]: newName }).ilike(col, pat)
      .then(r => ({ table, col, error: r && r.error && !/does not exist|schema cache|Could not find/i.test(r.error.message || '') ? r.error : null }),
            e => ({ table, col, error: e }))));
  // Controlling: the unit of this room (its link + its name) — the rent Soll stays with the room
  const units = await Promise.all([
    sbL.from('ctrl_units').update({ source_ref: newName }).eq('source_type', 'casa_room').ilike('source_ref', pat),
    sbL.from('ctrl_units').update({ name: newName }).eq('property_id', 7).ilike('name', pat),
  ].map(q => q.then(r => r, e => ({ error: e }))));
  units.forEach((r, i) => { if (r && r.error && !/does not exist|schema cache|Could not find/i.test(r.error.message || '')) results.push({ table: 'ctrl_units', col: i ? 'name' : 'source_ref', error: r.error }); });
  try {   // #19b: the tenant-app login status (room_logins.room_key = lower-case name) — written by SQL (ROOMS-LOGINS.sql)
    const r = await sbL.rpc('room_logins_rename', { p_old: oldName, p_new: newName });
    if (r && r.error && !/does not exist|schema cache|Could not find/i.test(r.error.message || '')) results.push({ table: 'room_logins', col: 'room_key', error: r.error });
  } catch (e) { results.push({ table: 'room_logins', col: 'room_key', error: e }); }
  const failed = results.filter(r => r.error).map(r => r.table + '.' + r.col);
  // Kitchen rotation list (kept as a list of names)
  try {
    const kr = typeof getKitchenRooms === 'function' ? getKitchenRooms() : [];
    if (typeof syncKitchenRoomsToSupabase === 'function' && kr.some(n => _ccRoomNorm(n) === _ccRoomNorm(oldName))) {
      await syncKitchenRoomsToSupabase(kr.map(n => (_ccRoomNorm(n) === _ccRoomNorm(oldName) ? newName : n)));
    }
  } catch (e) { failed.push('kitchen list'); }
  // #19 (Nov 2026): Maintenance and Settlements keep room names too — "Who pays" (receipts), the reported room,
  // Controlling's snapshot of who pays, and Settlements' tenants not in the app. Safe to repeat (old name only).
  const same = n => _ccRoomNorm(n) === _ccRoomNorm(oldName);
  const swap = arr => Array.isArray(arr) && arr.some(same) ? arr.map(n => (same(n) ? newName : n)) : null;
  const real = e => !!(e && !/does not exist|schema cache|Could not find/i.test(e.message || ''));
  const parse = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (e) { return null; } };
  try {
    const r = await sbL.from('maint_cases').update({ report_room: newName }).ilike('report_room', pat);
    if (real(r && r.error)) failed.push('maint_cases.report_room');
  } catch (e) { failed.push('maint_cases.report_room'); }
  try {
    const { data, error } = await sbL.from('maint_costs').select('id,pay_rooms').not('pay_rooms', 'is', null);
    if (real(error)) failed.push('maint_costs.pay_rooms');
    else for (const row of (data || [])) {
      const nx = swap(row.pay_rooms); if (!nx) continue;
      const { error: e2 } = await sbL.from('maint_costs').update({ pay_rooms: nx }).eq('id', row.id);
      if (real(e2)) { failed.push('maint_costs.pay_rooms'); break; }
    }
  } catch (e) { failed.push('maint_costs.pay_rooms'); }
  try {
    const { data, error } = await sbL.from('ctrl_expense_one_time').select('id,maint_pay').not('maint_pay', 'is', null);
    if (real(error)) failed.push('ctrl_expense_one_time.maint_pay');
    else for (const row of (data || [])) {
      const p = parse(row.maint_pay); const nx = p && typeof p === 'object' ? swap(p.r) : null; if (!nx) continue;
      const v = { ...p, r: nx };
      const { error: e2 } = await sbL.from('ctrl_expense_one_time').update({ maint_pay: typeof row.maint_pay === 'string' ? JSON.stringify(v) : v }).eq('id', row.id);
      if (real(e2)) { failed.push('ctrl_expense_one_time.maint_pay'); break; }
    }
  } catch (e) { failed.push('ctrl_expense_one_time.maint_pay'); }
  try {
    const { data, error } = await sbL.from('nk_abrechnung_casa').select('id,tenants');
    if (real(error)) failed.push('nk_abrechnung_casa.tenants');
    else for (const row of (data || [])) {
      const ts = parse(row.tenants); const ex = ts && Array.isArray(ts.__extra) ? ts.__extra : null;
      if (!ex || !ex.some(x => x && same(x.room))) continue;
      const v = { ...ts, __extra: ex.map(x => (x && same(x.room) ? { ...x, room: newName } : x)) };
      const { error: e2 } = await sbL.from('nk_abrechnung_casa').update({ tenants: typeof row.tenants === 'string' ? JSON.stringify(v) : v }).eq('id', row.id);
      if (real(e2)) { failed.push('nk_abrechnung_casa.tenants'); break; }
    }
  } catch (e) { failed.push('nk_abrechnung_casa.tenants'); }
  try {   // Settlements › Tracking "War leer" confirmations (note 'leer:<room>', Casa property 7)
    const r = await sbL.from('ctrl_settlements').update({ note: 'leer:' + newName }).eq('property_id', 7).is('tenant_id', null).ilike('note', 'leer:' + pat);
    if (real(r && r.error)) failed.push('ctrl_settlements.note');
  } catch (e) { failed.push('ctrl_settlements.note'); }
  try {   // manual NK-Abrechnung drafts of Casa not sent yet (a sent letter stays as it was sent)
    const r = await sbL.from('nk_abrechnung_manual').update({ unit_label: newName }).eq('property_id', 7).neq('status', 'sent').ilike('unit_label', pat);
    if (real(r && r.error)) failed.push('nk_abrechnung_manual.unit_label');
  } catch (e) { failed.push('nk_abrechnung_manual.unit_label'); }
  if (failed.length) console.error('[rooms] rename links failed:', failed, results.filter(r => r.error));
  return failed.length ? { error: { message: 'not moved: ' + failed.join(', ') }, failed } : { error: null };
}

/* Tenant records still stored under this room (active + former) */
async function roomTenantCount(roomName) {
  if (!sbL || !roomName) return { active: 0, former: 0, error: null };
  const { data, error } = await sbL.from('tenant_records').select('id,status').ilike('room', _ccIlikeExact(roomName));   // #34
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

  const { data: gone, error } = await sbL.from('rooms').delete().eq('id', roomId).select('id,name');
  if (error) return { ok: false, error: error.message };

  const room = getRoomById(roomId);
  appRooms = appRooms.filter(r => r.id !== roomId);
  _notifyRoomsListeners('DELETE', room);
  // #20/#34 (Nov 2026): in the background (the confirm closes at once) — only when the database really deleted THIS room,
  // with the name the database had (a phone showing an old card never clears a newer room that has that name)
  const dbRoom = Array.isArray(gone) && gone.find(x => String(x.id) === String(roomId));
  if (dbRoom && dbRoom.name) _roomDeleteLeftovers({ ...room, id: dbRoom.id, name: dbRoom.name }).catch(() => {});
  return { ok: true };
}

/* #20/#34: what only this room used — never history (tenancies, kitchen/cleaning weeks, messages, receipts, letters).
   Each step on its own; a failure only leaves that leftover (console), never blocks the delete. */
async function _roomDeleteLeftovers(room) {
  const pat = _ccIlikeExact(room.name), today = new Date().toLocaleDateString('sv-SE');
  const soft = async (what, f) => { try { const r = await f(); if (r && r.error && !/does not exist|schema cache|Could not find/i.test(r.error.message || '')) console.warn('[rooms] delete leftovers ' + what + ':', r.error.message); } catch (e) { console.warn('[rooms] delete leftovers ' + what + ':', e); } };
  await soft('kitchen list', async () => {
    const kr = typeof getKitchenRooms === 'function' ? getKitchenRooms() : [];
    if (typeof syncKitchenRoomsToSupabase === 'function' && kr.some(n => _ccRoomNorm(n) === _ccRoomNorm(room.name)))
      await syncKitchenRoomsToSupabase(kr.filter(n => _ccRoomNorm(n) !== _ccRoomNorm(room.name)));
  });
  await soft('password', () => sbL.from('lounge_data').delete().eq('type', 'password').ilike('room', pat));
  await soft('absences', () => sbL.from('kitchen_absences').delete().ilike('room', pat).gte('to_date', today));
  await soft('login status', () => sbL.rpc('room_logins_rename', { p_old: room.name, p_new: null }));
  await soft('Controlling unit', async () => {
    const { data: us, error } = await sbL.from('ctrl_units').select('id').eq('property_id', 7).eq('source_type', 'casa_room').eq('source_ref', String(room.id));
    if (error) return { error };
    for (const u of (us || [])) {
      const { data: inc, error: e2 } = await sbL.from('ctrl_income_months').select('id').eq('unit_id', u.id).limit(1);
      if (e2) return { error: e2 };
      if (!(inc || []).length) { const d = await sbL.from('ctrl_units').delete().eq('id', u.id); if (d.error) return d; }   // bookings → the unit stays (history)
    }
  });
}

// Save inventar only
async function saveRoomInventar(roomId, inventar) {
  if (!sbL) return { ok: false };
  // #17 (Nov 2026): the same safety net as every other room save — queued per room, one retry
  const write = () => sbL.from('rooms').update({ inventar, updated_at: new Date().toISOString() }).eq('id', roomId);
  const { error } = typeof ccQueueWrite === 'function' ? await ccQueueWrite('room-inv-' + roomId, write) : await write();

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
          _roomOrderApplyHold([newRow]);                               // #33: an echo never moves a card while its order is saved
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
