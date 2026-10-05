/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — TURN MARKERS (tenant app only)
   turn-markers.js   (loaded after the tab modules in tenant.html)

   While THIS room's turn in the current week is still open, the tab
   gets a marker after its name: House Cleaning = blue broom, Kitchen
   = yellow sponge (CSS in casa-castel.css, class .turn-open).
   Gone after Done / proof submitted / away / vacant / not your turn.
   Only the current week (a forgotten week shows no marker).
   Works with notifications on or off — it is information in the app.

   Uses the tabs' own functions (same rules as the tab cards, no copy):
     House Cleaning: _hcWeekIndex, _hcWeekInfo, _hcYmd   (tab-cleaning-tenant.js)
     Kitchen:        _kTenWeekInfo, _kRotState            (tab-kitchen-tenant.js)
     shared:         kWeekIdx, absCoversWeek, kLoadWeekVacancy, kVacantInWeek (utils.js)
   Read-only: never creates a week row.

   Checked: at app start, when the app comes back to the front, and
   whenever the House Cleaning / Kitchen tab redraws its week card
   (those call ccTabMarker directly).

   Public: ccTabMarker(kind, open)   kind = 'cleaning' | 'kitchen'
   ───────────────────────────────────────────────────────────── */

(function () {
  const myRoom = () => (typeof currentRoom !== 'undefined' && currentRoom) || null;

  /* Set / clear the marker on one tab */
  window.ccTabMarker = function (kind, open) {
    const btn = document.querySelector(`.cc-tab[data-tab="${kind}"]`);
    if (!btn) return;
    const was = btn.classList.contains('turn-open');
    btn.classList.toggle('turn-open', !!open);
    // just finished (done / away) → its reminder leaves the lock screen too
    if (was && !open && typeof ccPushTurnDone === 'function') ccPushTurnDone(kind);
  };

  async function ensureRooms() {
    if (typeof appRooms !== 'undefined' && !appRooms.length && typeof loadRoomsData === 'function') {
      await loadRoomsData();
    }
  }

  /* House Cleaning: is it this room's week and still open? (null = could not check) */
  async function cleaningOpen(room) {
    if (typeof _hcWeekIndex !== 'function' || typeof _hcWeekInfo !== 'function' || typeof _hcYmd !== 'function') return null;
    const idx  = _hcWeekIndex(new Date());
    const info = _hcWeekInfo(idx);
    if (!info || info.room !== room) return false;
    const ws = _hcYmd(info.start), we = _hcYmd(info.end);
    const [doneRes, absRes] = await Promise.all([
      sbL.from('cleaning_weeks').select('week_index').eq('week_index', idx).eq('room', room).eq('status', 'done').limit(1),
      sbL.from('kitchen_absences').select('room,from_date,to_date').eq('room', room),
      typeof kLoadWeekVacancy === 'function' ? kLoadWeekVacancy(idx, idx, 'room_vacancy_range') : Promise.resolve(),
    ]);
    if (doneRes.error || absRes.error) return null;
    if ((doneRes.data || []).length) return false;                                   // done
    if ((absRes.data || []).some(a => absCoversWeek(a, ws, we))) return false;       // away (full Mon–Sun)
    if (typeof kVacantInWeek === 'function' && kVacantInWeek(room, idx)) return false; // vacant
    return true;
  }

  /* Kitchen: same rule as the Kitchen tab's week card (open = not submitted / approved / away / vacant) */
  async function kitchenOpen(room) {
    if (typeof _kTenWeekInfo !== 'function' || typeof _kRotState !== 'function' || typeof kWeekIdx !== 'function') return null;
    if (typeof loadKitchenRoomsFromSupabase === 'function') await loadKitchenRoomsFromSupabase();
    const idx = kWeekIdx(new Date());
    if (idx < 0) return false;
    const wi = _kTenWeekInfo(idx);
    if (!wi) return false;
    const [rowRes, absRes] = await Promise.all([
      sbL.from('kitchen_weeks').select('*').eq('week_index', idx).order('id', { ascending: true }).limit(1),
      sbL.from('kitchen_absences').select('room,from_date,to_date'),
      typeof kLoadWeekVacancy === 'function' ? kLoadWeekVacancy(idx, idx) : Promise.resolve(),
    ]);
    if (rowRes.error || absRes.error) return null;
    const row = (rowRes.data || [])[0] || null;
    const turnRoom = (row && row.room) || wi.room;          // the saved week decides, like the tab
    if (turnRoom !== room) return false;
    const dbStatus = row ? row.status : null;
    const state = _kRotState({ isNow: true, isPast: false, dbStatus, room: turnRoom, weekStart: wi.start, absenceRows: absRes.data || [] });
    return state === 'now' && dbStatus !== 'submitted';
  }

  let _busy = false, _last = 0;
  async function refresh() {
    const room = myRoom();
    if (!room || typeof sbL === 'undefined' || !sbL || _busy) return;
    const now = Date.now(); if (now - _last < 3000) return; _last = now;
    _busy = true;
    try {
      await ensureRooms();
      const [c, k] = await Promise.all([
        cleaningOpen(room).catch(() => null),
        kitchenOpen(room).catch(() => null),
      ]);
      if (c !== null) ccTabMarker('cleaning', c);   // null = no connection → leave as it is
      if (k !== null) ccTabMarker('kitchen', k);
    } finally { _busy = false; }
  }

  // Start as soon as the tenant is logged in (also after a fresh login on this page)
  const ready = setInterval(() => {
    if (!myRoom()) return;
    clearInterval(ready);
    refresh();
  }, 500);

  // Back to the front (new day / week, done on another phone, …)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
})();
