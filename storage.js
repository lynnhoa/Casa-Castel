/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — STORAGE
   js/storage.js

   In-memory state helpers. No localStorage for room or kitchen state.
   Source of truth is always Supabase via appRooms[] and kitchenRooms[].
   Depends on: constants.js, supabase-client.js
   ───────────────────────────────────────────────────────────── */

/* ── GENERIC WRAPPER ────────────────────────────────────── */
const S = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem('cc_' + k);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem('cc_' + k, JSON.stringify(v)); } catch {}
  },
  remove(k) {
    try { localStorage.removeItem('cc_' + k); } catch {}
  }
};

/* ── VACANCY HELPERS ────────────────────────────────────── */
// Reads appRooms[] in memory only — no localStorage fallback.
// appRooms is populated by loadRoomsData() and kept live by initRoomsRealtime().
function isVacant(room) {
  if (typeof appRooms !== 'undefined') {
    const r = appRooms.find(r => r.name === room);
    if (r) return !!r.vacant;
  }
  return false;
}

/* ── KITCHEN ROOMS (landlord-configurable, Supabase-synced) ─ */
// Single in-memory array — no localStorage. Populated by loadKitchenRoomsFromSupabase().
// Updated live when a lounge_data kitchen_config INSERT arrives via realtime.
let kitchenRooms = [...KITCHEN_ROOMS];

function getKitchenRooms() {
  return kitchenRooms;
}

async function loadKitchenRoomsFromSupabase() {
  if (!sbL) return;
  const { data } = await sbL.from('lounge_data').select('body')
    .eq('type', 'kitchen_config').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (data && data.body) {
    try {
      const rooms = JSON.parse(data.body);
      if (Array.isArray(rooms)) kitchenRooms = rooms;
    } catch {}
  }
}

// Called from realtime handler when a kitchen_config row is inserted/updated.
function _applyKitchenConfig(body) {
  try {
    const rooms = JSON.parse(body);
    if (Array.isArray(rooms)) kitchenRooms = rooms;
  } catch {}
}

/* Save the kitchen list (management app only — the tenant app never calls this).
   Safe order (Oct 2026): 1) write the NEW list  2) only if that worked, delete the lists
   OLDER than it. Everyone reads "the newest list", so there is always one valid list —
   a dropped connection can never leave the kitchen without a list.
   Saves run one after another (two quick toggles never overlap).
   Rejects when the new list was not saved → the caller shows "Not saved" and goes back. */
let _kcQueue = Promise.resolve();
function syncKitchenRoomsToSupabase(rooms) {
  if (!sbL) return Promise.resolve();
  const prev = kitchenRooms;
  const mine = (rooms || []).slice();
  kitchenRooms = mine;                                   // on screen at once
  const run = async () => {
    const write = () => sbL.from('lounge_data')
      .insert({ type: 'kitchen_config', body: JSON.stringify(mine) })
      .select('id, created_at').single();
    let res;
    try { res = typeof ccPersist === 'function' ? await ccPersist(write) : await write(); }
    catch (e) { res = { error: e }; }
    if (!res || res.error || !res.data) {
      if (kitchenRooms === mine) kitchenRooms = prev;    // nothing newer meanwhile → old list back
      throw (res && res.error) || new Error('kitchen list not saved');
    }
    // Clean-up: only lists older than the one just written (a failure here is harmless —
    // the new list is already the newest; the next save cleans up again)
    try {
      let del = sbL.from('lounge_data').delete().eq('type', 'kitchen_config');
      del = res.data.created_at ? del.lt('created_at', res.data.created_at) : del.neq('id', res.data.id);
      const d = await del;
      if (d && d.error) console.warn('[kitchen] old lists not cleaned up:', d.error.message);
    } catch (e) { console.warn('[kitchen] old lists not cleaned up:', e); }
  };
  const p = _kcQueue.then(run, run);
  _kcQueue = p.catch(() => {});
  return p;
}
