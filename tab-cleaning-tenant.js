/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — ABSENCE MANAGEMENT
   (formerly js/tab-absence.js, now embedded here)

   Absence functionality. The same block exists in tab-cleaning.js
   (landlord) and tab-cleaning-tenant.js (tenant): keep both in sync.
   Writes to kitchen_absences table — shared by kitchen and
   cleaning tabs for rotation strip state.

   Public API:
     absOpenModal(name)       — 'register' or 'list'
     absCloseModal(name)
   Depends on: constants.js, supabase-client.js, utils.js
   ───────────────────────────────────────────────────────────── */

/* ── INJECT MODAL HTML ──────────────────────────────────────── */
(function _absInjectModals() {
  const wrap = document.createElement('div');
  wrap.id = 'absence-modals';
  wrap.innerHTML = `
    <!-- Register absence modal (tenant only) -->
    <div class="cc-modal-overlay" id="absence-modal-register" onclick="if(event.target===this)absCloseModal('register')">
      <div class="cc-modal-sheet" style="max-height:80vh;">
        <div class="cc-modal-hdr">
          <span class="cc-modal-title">Register absence</span>
          <button class="cc-modal-close" onclick="absCloseModal('register')">✕</button>
        </div>
        <div class="cc-modal-body">
          <div id="abs-room-pill" style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:500;padding:3px 10px;border-radius:8px;background:var(--cc-notice-bg);border:0.5px solid var(--cc-notice-bdr);color:var(--cc-notice-text);margin-bottom:14px;"></div>
          <p style="font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:6px;">Dates</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <p style="font-size:11px;color:var(--cc-taupe);width:36px;flex-shrink:0;">From</p>
              <input type="date" id="abs-from" style="flex:1;min-width:0;height:40px;border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-sm);padding:0 10px;font-size:12px;color:var(--cc-taupe);background:var(--cc-white);font-family:inherit;"/>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <p style="font-size:11px;color:var(--cc-taupe);width:36px;flex-shrink:0;">To</p>
              <input type="date" id="abs-to" style="flex:1;min-width:0;height:40px;border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-sm);padding:0 10px;font-size:12px;color:var(--cc-taupe);background:var(--cc-white);font-family:inherit;"/>
            </div>
          </div>
          <div class="abs-rule" id="abs-rule">
            <p class="abs-rule__hint">Only full weeks (Mon–Sun) excuse your cleaning turn.</p>
            <p class="abs-rule__preview" id="abs-preview"></p>
          </div>
          <p style="font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:6px;">Note (optional)</p>
          <textarea id="abs-note" rows="2" placeholder="e.g. holiday, work trip…" style="width:100%;border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-sm);padding:8px 10px;font-size:12px;color:var(--cc-ink);background:var(--cc-white);font-family:inherit;resize:none;margin-bottom:14px;"></textarea>
          <p id="abs-error" style="font-size:11px;color:#7A2020;margin-bottom:8px;display:none;"></p>
          <button id="abs-save" style="width:100%;height:42px;background:var(--cc-notice-bg);border:0.5px solid var(--cc-notice-bdr);border-radius:var(--cc-r-sm);color:var(--cc-notice-text);font-size:11px;font-weight:500;letter-spacing:0.06em;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="ti ti-calendar-plus" style="font-size:14px;" aria-hidden="true"></i>
            Save absence
          </button>
        </div>
      </div>
    </div>

    <!-- All absences list modal (tenant + landlord) -->
    <div class="cc-modal-overlay" id="absence-modal-list" onclick="if(event.target===this)absCloseModal('list')">
      <div class="cc-modal-sheet" style="max-height:75vh;">
        <div class="cc-modal-hdr">
          <span class="cc-modal-title">Absences</span>
          <button class="cc-modal-close" onclick="absCloseModal('list')">✕</button>
        </div>
        <div class="cc-modal-body">
          <div id="abs-list-body"><p class="cc-note">Loading…</p></div>
          <div id="abs-list-add" style="margin-top:14px;display:none;">
            <button onclick="absCloseModal('list');absOpenModal('register');" style="width:100%;height:40px;background:var(--cc-notice-bg);border:0.5px solid var(--cc-notice-bdr);border-radius:var(--cc-r-sm);color:var(--cc-notice-text);font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;">
              <i class="ti ti-plus" style="font-size:14px;" aria-hidden="true"></i>
              Add absence
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  /* Wire from-date change → update to-date min */
  document.getElementById('abs-from')?.addEventListener('change', e => {
    const toEl = document.getElementById('abs-to');
    if (toEl) { toEl.min = e.target.value; if (toEl.value < e.target.value) toEl.value = e.target.value; }
    _absUpdatePreview();
  });
  document.getElementById('abs-to')?.addEventListener('change', _absUpdatePreview);

  /* Wire save button */
  document.getElementById('abs-save')?.addEventListener('click', absSaveAbsence);
})();

/* ── WHICH WEEKS DOES THIS ABSENCE EXCUSE? ─────────────────────
   Lists every full Monday–Sunday week inside the chosen dates.   */
function _absExcusedWeeks(fromYmd, toYmd) {
  if (!fromYmd || !toYmd || toYmd < fromYmd) return [];
  const [y, m, d] = fromYmd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const toMon = (8 - start.getDay()) % 7;                 // days until the next Monday (0 = already Monday)
  let mon = new Date(y, m - 1, d + toMon);
  const out = [];
  for (let i = 0; i < 60; i++) {
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    if (_hcYmd(sun) > toYmd) break;
    out.push([mon, sun]);
    mon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
  }
  return out;
}
function _absUpdatePreview() {
  const el = document.getElementById('abs-preview'); if (!el) return;
  const from = document.getElementById('abs-from')?.value;
  const to   = document.getElementById('abs-to')?.value;
  const p = n => String(n).padStart(2, '0');
  const f = dt => p(dt.getDate()) + '.' + p(dt.getMonth() + 1);
  const weeks = _absExcusedWeeks(from, to);
  el.classList.toggle('abs-rule__preview--none', !weeks.length);
  el.textContent = weeks.length
    ? 'Excused: ' + weeks.map(([a, b]) => f(a) + ' – ' + f(b)).join(', ')
    : 'No full week in these dates — your turns still count.';
}

/* ── ROLE DETECTION ─────────────────────────────────────────── */
function _absRole() { return localStorage.getItem('cc_role') || 'tenant'; }
function _absMyRoom() {
  return (typeof currentRoom !== 'undefined' ? currentRoom : '') || localStorage.getItem('cc_room') || '';
}

/* ── OPEN / CLOSE ───────────────────────────────────────────── */
function absOpenModal(name) {
  document.getElementById('absence-modal-' + name)?.classList.add('open');
  if (name === 'list') _absPopulateList();
  if (name === 'register') {
    const myRoom = _absMyRoom();
    const pill = document.getElementById('abs-room-pill');
    if (pill) pill.textContent = myRoom;
    // Pre-fill to next Mon–Sun
    const today = new Date();
    const day = today.getDay();
    const daysToMon = day === 0 ? 1 : 8 - day;
    const nextMon = new Date(today); nextMon.setDate(today.getDate() + daysToMon);
    const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6);
    const fmt = d => _hcYmd(d);
    const today10 = fmt(today);
    const fromEl = document.getElementById('abs-from');
    const toEl   = document.getElementById('abs-to');
    if (fromEl) { fromEl.min = today10; fromEl.value = fmt(nextMon); }
    if (toEl)   { toEl.min = fmt(nextMon); toEl.value = fmt(nextSun); }
    const errEl = document.getElementById('abs-error');
    if (errEl) errEl.style.display = 'none';
    const noteEl = document.getElementById('abs-note');
    if (noteEl) noteEl.value = '';
    _absUpdatePreview();
  }
}
function absCloseModal(name) {
  document.getElementById('absence-modal-' + name)?.classList.remove('open');
}

/* ── LIST POPULATOR ─────────────────────────────────────────── */
async function _absPopulateList() {
  const el = document.getElementById('abs-list-body');
  const addBtn = document.getElementById('abs-list-add');
  if (!el) return;
  if (!sbL) { el.innerHTML = '<p class="cc-note">Connect Supabase.</p>'; return; }
  const isLandlord = _absRole() === 'landlord';
  // Show Add button for tenants only
  if (addBtn) addBtn.style.display = isLandlord ? 'none' : '';
  const { data } = await sbL.from('kitchen_absences').select('*').order('from_date', { ascending: true });
  if (!data || !data.length) { el.innerHTML = '<p class="cc-note">No absences registered.</p>'; return; }
  const fmtD = s => { const [y,m,d] = s.split('-'); return `${d}.${m}.${y}`; };
  // Current cleaning week dates for "this week" indicator
  const curIdx = typeof _hcWeekIndex === 'function' ? _hcWeekIndex(new Date()) : -1;
  const curInfo = curIdx >= 0 && typeof _hcWeekInfo === 'function' ? _hcWeekInfo(curIdx) : null;
  const curStart = curInfo ? _hcYmd(curInfo.start) : null;
  const curEnd   = curInfo ? _hcYmd(curInfo.end)   : null;
  const badge = `<span style="font-size:9px;font-weight:500;padding:2px 8px;border-radius:8px;background:#F5EEE8;border:0.5px solid #D4A87A;color:#8C5A30;white-space:nowrap;flex-shrink:0;">Away</span>`;
  el.innerHTML = data.map(a => {
    const covers   = curStart && absCoversWeek(a, curStart, curEnd);
    const overlaps = curStart && absOverlapsWeek(a, curStart, curEnd);
    const thisWeek = covers   ? `<span style="font-size:10px;color:#8C5A30;margin-left:4px;">· away this week</span>`
                   : overlaps ? `<span style="font-size:10px;color:var(--cc-taupe);margin-left:4px;">· part of this week — turn still counts</span>` : '';
    const note = a.note ? ` · <span style="color:var(--cc-stone);">${esc(a.note)}</span>` : '';
    // Tenants can only remove absences that haven't started yet (you can remove any)
    const canDelete = isLandlord || (a.room === _absMyRoom() && a.from_date > _hcYmd(new Date()));
    return `<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">${badge}<span style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(a.room)}</span>${thisWeek}</div>
        <div style="font-size:11px;color:var(--cc-taupe);">${fmtD(a.from_date)} – ${fmtD(a.to_date)}${note}</div>
      </div>
      ${canDelete ? `<button onclick="absDeleteAbsence('${a.id}')" style="font-size:11px;color:var(--cc-stone);background:none;border:none;cursor:pointer;padding:4px;flex-shrink:0;">✕</button>` : ''}
    </div>`;
  }).join('');
}

/* ── SAVE (tenant only, with merge) ─────────────────────────── */
let _absSaveBusy = false;
async function absSaveAbsence() {
  if (_absSaveBusy) return; _absSaveBusy = true;
  try {
    if (!sbL) return;
    const myRoom  = _absMyRoom();
    const fromVal = document.getElementById('abs-from')?.value;
    const toVal   = document.getElementById('abs-to')?.value;
    const noteRaw = document.getElementById('abs-note')?.value.trim() || '';
    const errEl   = document.getElementById('abs-error');
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
    if (!fromVal || !toVal) { showErr('Please select both dates.'); return; }
    const today = _hcYmd(new Date());
    if (fromVal < today) { showErr('From date must be today or later.'); return; }
    if (toVal < fromVal) { showErr('To date must be on or after from date.'); return; }
    const saveBtn = document.getElementById('abs-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    // Fetch existing for merge
    const { data: existing, error: fetchErr } = await sbL.from('kitchen_absences').select('*').eq('room', myRoom);
    if (fetchErr) {
      showErr('Could not save — ' + (fetchErr.message || 'please try again.'));
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ti ti-calendar-plus" style="font-size:14px;margin-right:6px;" aria-hidden="true"></i>Save absence'; }
      return;
    }
    // Merge overlapping/adjacent
    const _shift    = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return _hcYmd(new Date(y, m - 1, dd + n)); };
    const dayAfter  = d => _shift(d, 1);
    const dayBefore = d => _shift(d, -1);
    const overlapping = (existing||[]).filter(a => a.from_date <= dayAfter(toVal) && a.to_date >= dayBefore(fromVal));
    const allFrom = [fromVal, ...overlapping.map(a=>a.from_date)];
    const allTo   = [toVal,   ...overlapping.map(a=>a.to_date)];
    const mergedFrom = allFrom.reduce((a,b) => a<b?a:b);
    const mergedTo   = allTo.reduce((a,b) => a>b?a:b);
    const existingNote = overlapping.find(a=>a.note)?.note || null;
    const mergedNote   = noteRaw || existingNote;
    // An absence that already started can't be replaced — it is extended instead
    const started = overlapping.filter(a => a.from_date <= today).sort((a, b) => a.from_date < b.from_date ? -1 : 1)[0];
    const others  = overlapping.filter(a => !started || a.id !== started.id);
    if (others.length) {
      await sbL.from('kitchen_absences').delete().in('id', others.map(a=>a.id));
    }
    let insErr = null;
    if (started) {
      const patch = { to_date: mergedTo };
      if (mergedNote) patch.note = mergedNote;
      ({ error: insErr } = await sbL.from('kitchen_absences').update(patch).eq('id', started.id));
    } else {
      const payload = { room: myRoom, from_date: mergedFrom, to_date: mergedTo };
      if (mergedNote) payload.note = mergedNote;
      ({ error: insErr } = await sbL.from('kitchen_absences').insert(payload));
    }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="ti ti-calendar-plus" style="font-size:14px;margin-right:6px;" aria-hidden="true"></i>Save absence'; }
    if (insErr) { showErr('Could not save — ' + (insErr.message || 'please try again.')); return; }
    absCloseModal('register');
    absOpenModal('list');
  } finally { _absSaveBusy = false; }
}

/* ── DELETE ─────────────────────────────────────────────────── */
async function absDeleteAbsence(id) {
  if (!sbL) return;
  await sbL.from('kitchen_absences').delete().eq('id', id);
  _absPopulateList();
  // Notify both tabs to re-render rotation — pass room so tenant view stays correct
  const _absRoom = (typeof currentRoom !== 'undefined' && currentRoom) ? currentRoom : undefined;
  if (typeof loadHouseCleaning === 'function') loadHouseCleaning(_absRoom);
}

/* ─────────────────────────────────────────────────────────────
   js/tab-cleaning-tenant.js  (TENANT)

   Layout changes (logic unchanged):
   - "Mark absence" button moved out of card body into action strip
   - Action strip (Mark absence + View absences) always visible below card
   - "Your next turn" callout added below card when turn is coming up
   - Absence sub-section notices remain inline below action strip
   ───────────────────────────────────────────────────────────── */

/* ── INJECT HTML ────────────────────────────────────────── */
document.getElementById('tab-cleaning').innerHTML = `
  <h1 class="cc-h1 cc-mb-24">House Cleaning</h1>

  <div class="cc-section" style="padding-top:0;">
    <p class="hc-section-title">This week</p>
    <div id="hc-next-turn"></div>
    <div id="hc-current-week"></div>
  </div>

  <div class="cc-section">
    <p class="hc-section-title">Rotation</p>
    <div id="hc-rotation-list"></div>
  </div>

  <!-- History modal (last 12 weeks) -->
  <div class="cc-modal-overlay" id="hc-modal-history" onclick="if(event.target===this)hcCloseHistory()">
    <div class="cc-modal-sheet" style="max-height:70vh;">
      <div class="cc-modal-hdr">
        <span class="cc-modal-title">History</span>
        <button class="cc-modal-close" onclick="hcCloseHistory()">✕</button>
      </div>
      <div class="cc-modal-body" id="hc-history-body"><p class="cc-note">Loading…</p></div>
    </div>
  </div>

`;

/* ── HC ROTATION CONSTANTS (same as landlord) ───────────── */
const HC_ROTATION = ['Copenhagen','Paris','Los Angeles','New York','London','Oslo','Stockholm'];
const HC_W1_START = new Date('2026-01-05T00:00:00');

/* Local calendar helpers: a cleaning week is Monday 00:00 to Sunday 23:59 (German time) */
function _hcYmd(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function _hcAddDays(dt, n) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); }


function _hcGetRoomList() {
  // Always use appRooms as source of truth — same logic as kitchen.
  // New rooms appear at their sort_order position immediately, no holdback.
  if (typeof appRooms !== 'undefined' && appRooms.length > 0) {
    return [...appRooms]
      .filter(r => r.active)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(r => r.name);
  }
  return HC_ROTATION;
}



function _hcWeekIndex(d) {
  const now = d || new Date();
  // Count calendar days (not milliseconds) so summer/winter time never shifts the week change
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const w1    = Date.UTC(HC_W1_START.getFullYear(), HC_W1_START.getMonth(), HC_W1_START.getDate());
  if (today < w1) return -1;
  return Math.floor((today - w1) / (7 * 24 * 60 * 60 * 1000));
}

function _hcWeekInfo(idx) {
  if (idx < 0) return null;
  const rot   = _hcGetRoomList();
  const room  = rot[idx % rot.length];
  const pad   = n => String(n).padStart(2, '0');
  const fmtD  = dt => pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '.' + dt.getFullYear();
  const start = _hcAddDays(HC_W1_START, idx * 7);
  const end   = _hcAddDays(start, 6);
  end.setHours(23, 59, 59, 999);
  const daysLeft = Math.max(0, Math.ceil((end - new Date()) / (24 * 60 * 60 * 1000)));
  return { room, start, end, daysLeft, dateRange: fmtD(start) + ' – ' + fmtD(end), idx };
}

/* ── REALTIME ───────────────────────────────────────────── */
let _hcTenChannel = null;
function _hcTenSubscribe(room) {
  if (!sbL) return;
  if (_hcTenChannel) { sbL.removeChannel(_hcTenChannel); _hcTenChannel = null; }
  _hcTenChannel = sbL.channel('cleaning-tenant-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_weeks' }, async () => {
      loadHouseCleaning(room);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_absences' }, async () => {
      loadHouseCleaning(room);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, async () => {
      if (typeof loadRoomsData === 'function') await loadRoomsData();
      loadHouseCleaning(room);
    })
    .subscribe();
}

/* ── MAIN LOAD ──────────────────────────────────────────── */
async function loadHouseCleaning(room) {

  const curIdx    = _hcWeekIndex(new Date());
  const rot       = _hcGetRoomList();
  const curInfo   = _hcWeekInfo(curIdx);
  const cyclePos  = ((curIdx % rot.length) + rot.length) % rot.length;
  const cycleStart= curIdx - cyclePos;

  /* ── Fetch cleaning_weeks + absences in parallel ── */
  let hcDoneMap = {};
  let absRows   = [];
  if (sbL) {
    const [doneRes, absRes] = await Promise.all([
      // only this rotation round onward (older weeks live in the history)
      sbL.from('cleaning_weeks').select('week_index,room,status,done_at,done_by').eq('status','done').gte('week_index', Math.min(cycleStart, curIdx - 1)),
      sbL.from('kitchen_absences').select('*').gte('to_date', _hcYmd(_hcAddDays(HC_W1_START, Math.min(cycleStart, curIdx - 1) * 7))),
      kLoadWeekVacancy(Math.min(cycleStart, curIdx - 1), curIdx + 2 * rot.length, 'room_vacancy_range'),   // vacant per week from move-in / move-out dates
    ]);
    if (doneRes.data) doneRes.data.forEach(row => {
      const key = row.week_index + '_' + row.room;
      if (!hcDoneMap[key]) hcDoneMap[key] = { room: row.done_by || row.room, ts: row.done_at ? new Date(row.done_at).getTime() : Date.now() };
    });
    absRows = absRes.data || [];
  } else {
    for (let i = 0; i < rot.length; i++) {
      const si = cycleStart + i;
      const v  = S.get('hc_done_' + si, null);
      if (v) hcDoneMap[si + '_' + rot[i]] = v;
    }
  }

  const wDone    = curInfo ? (hcDoneMap[curIdx + '_' + curInfo.room] || null) : null;
  const isDone   = !!wDone;
  const isMyTurn = curInfo?.room === room;

  // Absences covering this week
  const curWStart = curInfo ? _hcYmd(curInfo.start) : null;
  const curWEnd   = curInfo ? _hcYmd(curInfo.end)   : null;
  // Away only when one absence covers the whole Mon–Sun week; shorter ones are shown as info
  const weekAbsences = curWStart ? absRows.filter(a => absCoversWeek(a, curWStart, curWEnd)) : [];
  const partAbsences = curWStart ? absRows.filter(a => absOverlapsWeek(a, curWStart, curWEnd) && !absCoversWeek(a, curWStart, curWEnd)) : [];
  // Is the current week's assigned room itself absent?
  const isCurrentRoomAbsent = curInfo ? weekAbsences.some(a => a.room === curInfo.room) : false;
  const isCurrentRoomVacant = curInfo && !isCurrentRoomAbsent ? kVacantInWeek(curInfo.room, curIdx) : false;
  // Tab marker (blue broom) while this room's turn this week is open (turn-markers.js)
  if (typeof ccTabMarker === 'function' && curInfo) ccTabMarker('cleaning', isMyTurn && !isDone && !isCurrentRoomAbsent && !isCurrentRoomVacant);

  /* ── Your next turn (weeks you are away are skipped) — shown inside the card ── */
  let mineHtml = '';
  if (curInfo && (!isMyTurn || isCurrentRoomAbsent)) {
    for (let offset = 1; offset <= rot.length * 2; offset++) {
      const fi = _hcWeekInfo(curIdx + offset);
      if (!fi || fi.room !== room) continue;
      if (absRows.some(a => a.room === room && absCoversWeek(a, _hcYmd(fi.start), _hcYmd(fi.end)))) continue;
      mineHtml = `<span class="turn-mine"><i class="ti ti-calendar-due" aria-hidden="true"></i><span>Your turn <b>${offset === 1 ? 'next week' : 'in ' + offset + ' weeks'}</b> · ${_hcFmtDM(fi.start)} – ${_hcFmtDM(fi.end)}</span></span>`;
      break;
    }
  }

  /* ── "Your next turn" callout — rendered above the card ── */
  /* ── Done (late): until Monday 12:00 the room can still mark LAST week as done ── */
  let lateHtml = '', lateIdx = -1, lateRoom = null;
  {
    const now = new Date(), li = curIdx - 1, lInfo = li >= HC_HISTORY_FROM ? _hcWeekInfo(li) : null;
    if (lInfo && lInfo.room === room && now.getDay() === 1 && now.getHours() < 12
        && _hcWeekState(li, room, curIdx, hcDoneMap, absRows).state === 'missed') {
      lateIdx = li; lateRoom = lInfo.room;
      lateHtml = `<div class="hc-late">
        <span class="hc-late__text">Last week (${_hcFmtDM(lInfo.start)} – ${_hcFmtDM(lInfo.end)}) is not marked as done. Cleaned it? You can still mark it until 12:00 today.</span>
        <button class="hc-late__btn" id="hc-late-btn"><i class="ti ti-check" aria-hidden="true"></i>Done (late)</button>
      </div>`;
    }
  }
  const ntEl = document.getElementById('hc-next-turn');
  if (ntEl) ntEl.innerHTML = lateHtml;
  document.getElementById('hc-late-btn')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Saving…';
    if (sbL) {
      const { error } = await sbL.from('cleaning_weeks').upsert(
        { week_index: lateIdx, room: lateRoom, status: 'done', done_at: new Date().toISOString(), done_by: room },
        { onConflict: 'week_index,room' });
      if (error) { alert('Could not save — ' + (error.message || 'please try again.')); }
    }
    await loadHouseCleaning(room);
  });

  /* ── This week card ── */
  const cwEl = document.getElementById('hc-current-week');
  if (!curInfo) {
    if (ntEl) ntEl.innerHTML = '';
    cwEl.innerHTML = '<p class="cc-note">Not started yet.</p>';
  } else {
    cwEl.innerHTML = `
      <div class="hc-current-card${isMyTurn && isDone ? ' hc-current-card--done' : ''}" data-turn="${!isMyTurn ? '' : isDone ? 'done' : (!isCurrentRoomAbsent && !isCurrentRoomVacant) ? 'turn' : ''}">
        <div class="hc-current-top">
          <span class="k-mob-status-chip ${!isMyTurn ? 'not-your-turn' : isDone ? 'approved' : isCurrentRoomAbsent ? 'away' : isCurrentRoomVacant ? 'skipped' : 'myturn'}">
            ${!isMyTurn ? '<i class="ti ti-coffee" aria-hidden="true"></i>Free this week'
              : isDone ? '<i class="ti ti-check" aria-hidden="true"></i>Done'
              : isCurrentRoomAbsent ? '<i class="ti ti-calendar-off" aria-hidden="true"></i>Away'
              : isCurrentRoomVacant ? 'Vacant'
              : '<i class="ti ti-broom" aria-hidden="true"></i>Your turn'}
          </span>
          <button onclick="hcOpenHistory()" style="font-size:9px;color:var(--cc-stone);text-decoration:underline;text-underline-offset:2px;cursor:pointer;background:none;border:none;padding:0;font-family:inherit;-webkit-tap-highlight-color:transparent;">history</button>
        </div>
        <div class="k-mob-week-body" style="margin-top:8px;">
          <div class="k-mob-week-left">
            <span class="k-mob-week-room">${isMyTurn ? esc(room) + '<span class="cc-turn-you">you</span>' : 'Not your turn'}</span>
            <span class="k-mob-week-dates-sm">${isMyTurn
              ? `${curInfo.dateRange} · ${curInfo.daysLeft} day${curInfo.daysLeft !== 1 ? 's' : ''} left`
              : `This week: <span class="turn-who">${esc(curInfo.room)}</span> · ${isDone ? '<span class="turn-st turn-st--done">Done</span>'
                  : isCurrentRoomAbsent ? '<span class="turn-st turn-st--away">Away</span>'
                  : isCurrentRoomVacant ? '<span class="turn-st turn-st--vacant">Vacant</span>'
                  : curInfo.dateRange}`}</span>
            ${isMyTurn && isCurrentRoomAbsent ? `<span class="k-note">You're away this week — no cleaning turn.</span>`
              : isMyTurn && !isDone && !isCurrentRoomVacant ? `<span class="k-note">Clean by Sunday, then tap Done.</span>` : ''}
            ${mineHtml}
          </div>
          ${isMyTurn && !isDone && !isCurrentRoomAbsent
            ? `<button class="k-mob-wact ink" id="hc-done-btn" aria-label="Mark as done">
                 <i class="ti ti-check"></i><span>Done</span>
               </button>`
            : isMyTurn && isDone
              ? `<div style="font-size:10px;color:var(--cc-stone);text-align:right;line-height:1.3;">${esc(wDone.room)}<br>${fmtTs(wDone.ts)}</div>`
              : ''
          }
        </div>
      </div>

      <!-- Action strip: always-visible absence buttons outside the card -->
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button onclick="absOpenModal('register')" style="flex:1;height:34px;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--cc-gold);border:none;border-radius:var(--cc-r-sm);color:#fff;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;font-family:inherit;">
          <i class="ti ti-calendar-plus" style="font-size:13px;" aria-hidden="true"></i>
          Mark absence
        </button>
        <button onclick="absOpenModal('list')" style="flex:1;height:34px;display:flex;align-items:center;justify-content:center;gap:5px;background:none;border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-sm);color:var(--cc-taupe);font-size:10px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;font-family:inherit;">
          <i class="ti ti-list" style="font-size:13px;" aria-hidden="true"></i>
          View absences
        </button>
      </div>

      <!-- Week-absence notices below action strip -->
      ${weekAbsences.length ? `<div style="margin-top:6px;">` + weekAbsences.map(a => {
        const note = a.note ? ` · ${esc(a.note)}` : '';
        return `<div style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--cc-notice-bg);border:0.5px solid var(--cc-notice-bdr);border-radius:var(--cc-r-sm);margin-bottom:6px;">
          <i class="ti ti-calendar-off" style="font-size:14px;color:#8C5A30;flex-shrink:0;" aria-hidden="true"></i>
          <span style="flex:1;font-size:11px;color:#8C5A30;">${esc(a.room)} is away this week${note}</span>
        </div>`;
      }).join('') + `</div>` : ''}
      ${partAbsences.length ? `<div style="margin-top:2px;">` + partAbsences.map(a => {
        const f = s => { const [y, m, d] = s.split('-'); return d + '.' + m; };
        return `<div style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--cc-surface);border:0.5px solid var(--cc-rule);border-radius:var(--cc-r-sm);margin-bottom:6px;">
          <i class="ti ti-calendar-event" style="font-size:14px;color:var(--cc-taupe);flex-shrink:0;" aria-hidden="true"></i>
          <span style="flex:1;font-size:11px;color:var(--cc-taupe);">${esc(a.room)} is away ${f(a.from_date)} – ${f(a.to_date)} · turn still counts</span>
        </div>`;
      }).join('') + `</div>` : ''}`;

    /* Wire mark-done button */
    if (isMyTurn && !isDone && !isCurrentRoomAbsent) {
      document.getElementById('hc-done-btn')?.addEventListener('click', async () => {
        const ts = Date.now();
        const btn = document.getElementById('hc-done-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        // Persist to cleaning_weeks — realtime will re-render for all
        if (sbL) {
          await sbL.from('cleaning_weeks').upsert({
            week_index: curIdx,
            room: curInfo.room,
            status: 'done',
            done_at: new Date(ts).toISOString(),
            done_by: room
          }, { onConflict: 'week_index,room' });
        }
        // Also write locally for offline fallback
        S.set('hc_done_' + curIdx, { room, ts });
        // Re-render immediately so this tenant sees update without waiting for realtime
        await loadHouseCleaning(room);
      });
    }
  }

  /* ── Rotation timeline ── */
  _renderHcRotation(curIdx, hcDoneMap, absRows, room);
  requestAnimationFrame(_hcFitScreen);   // hold the page still when everything fits

  /* ── Start realtime if not already running ── */
  _hcTenSubscribe(room);
}

/* ── HISTORY (last 12 weeks) ────────────────────────────────
   "history" link on the This-week card → the last 12 weeks, newest
   first: Done / Missed / Away / Skipped (vacant) / This week.
   Weeks older than 12 are deleted by the management app (_hcTrimHistory). */
const HC_HISTORY_WEEKS = 12;   // current week included
const HC_HISTORY_FROM  = 40;   // history starts with the week 12.10 – 18.10.2026 (earlier weeks were tests)
function hcOpenHistory()  { document.getElementById('hc-modal-history')?.classList.add('open'); _hcPopulateHistory(); }
function hcCloseHistory() { document.getElementById('hc-modal-history')?.classList.remove('open'); }
async function _hcPopulateHistory() {
  const el = document.getElementById('hc-history-body'); if (!el) return;
  if (!sbL) { el.innerHTML = '<p class="cc-note">No connection.</p>'; return; }
  const curIdx = _hcWeekIndex(new Date());
  if (curIdx < HC_HISTORY_FROM) { el.innerHTML = '<p class="cc-note">No history yet.</p>'; return; }
  const from    = Math.max(HC_HISTORY_FROM, curIdx - (HC_HISTORY_WEEKS - 1));
  const fromYmd = _hcYmd(_hcAddDays(HC_W1_START, from * 7));
  const [doneRes, absRes] = await Promise.all([
    sbL.from('cleaning_weeks').select('week_index,room,done_at,done_by').eq('status', 'done').gte('week_index', from).lte('week_index', curIdx),
    sbL.from('kitchen_absences').select('room,from_date,to_date').gte('to_date', fromYmd),
    kLoadWeekVacancy(from, curIdx, 'room_vacancy_range'),
  ]);
  const doneBy = {};
  (doneRes.data || []).forEach(r => { if (!doneBy[r.week_index]) doneBy[r.week_index] = r; });
  const absRows = absRes.data || [];
  const nowPill = '<span style="font-size:10px;padding:2px 9px;border-radius:20px;font-weight:500;white-space:nowrap;border:0.5px solid #E8C97A;display:inline-block;background:#FDF5E8;color:#c8a84b;">This week</span>';
  const rows = [];
  for (let idx = curIdx; idx >= from; idx--) {
    const info = _hcWeekInfo(idx); if (!info) continue;
    const d    = doneBy[idx] || null;
    const room = d ? d.room : info.room;   // the saved week wins over the formula
    const state = _hcRotState({ isNow: idx === curIdx, isPast: idx < curIdx, isNext: false,
                                slotDone: d, room, weekStart: info.start, absRows });
    const late = !!(d && d.done_at && new Date(d.done_at).getTime() >= _hcAddDays(info.start, 7).getTime());
    const pill = state === 'done'    ? kHistPill('approved', '', { is_late: late })
               : state === 'missed'  ? kHistPill('missed')
               : state === 'skipped' ? kHistPill('skipped')
               : state === 'absent'  ? kHistPill('absent')
               : state === 'now'     ? nowPill
               : kHistPill(null);
    const tap  = typeof hcCorrectWeek === 'function' && state !== 'skipped' && state !== 'absent';   // management app: correct a week
    rows.push(`<div${tap ? ` onclick="hcCorrectWeek(${idx})"` : ''} style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:0.5px solid var(--cc-rule);${tap ? 'cursor:pointer;' : ''}">
      <div><p style="font-size:13px;font-weight:500;color:var(--cc-ink);">${esc(room)}</p>
      <p style="font-size:11px;color:var(--cc-taupe);">${info.dateRange}</p></div>
      ${pill}</div>`);
  }
  el.innerHTML = rows.length ? rows.join('') : '<p class="cc-note">No history yet.</p>';
}

/* ── ROTATION STATE ─────────────────────────────────────── */
function _hcRotState({ isNow, isPast, isNext, slotDone, room, weekStart, absRows }) {
  // 1. Absence — overrides everything including now/next
  if (absRows && weekStart) {
    const wStart = _hcYmd(weekStart);
    const wEnd   = _hcYmd(_hcAddDays(weekStart, 6));
    if (absRows.some(a => a.room === room && absCoversWeek(a, wStart, wEnd))) return 'absent';
  }
  // 2. Vacant room
  if (kVacantInWeek(room, weekStart ? _hcWeekIndex(weekStart) : _hcWeekIndex())) return 'skipped';   // nobody lived there any day of that week
  // 3. Done — check before isNow so current week shows done correctly
  if (slotDone) return 'done';
  // 4. Current week, not done yet
  if (isNow) return 'now';
  // 5. Immediate next slot
  if (isNext) return 'next';
  // 6. Past week, no done = missed
  if (isPast) return 'missed';
  // 7. Future beyond next
  return 'upcoming';
}

/* ── ROTATION — schedule in time order ──────────────────────
   Last week (faded, with its result) · This week · then the rest of the
   round in time order. The room order never changes (Rooms tab); the list
   only rolls forward one row each week. Blue = the next real turn
   (the first coming week whose room is not away / vacant).
   Management app (hcCorrectWeek defined): last + this week can be tapped
   to set Done / Not done, and each open / coming week has a mail button. */
function _hcFmtDM(dt) { const p = n => String(n).padStart(2, '0'); return p(dt.getDate()) + '.' + p(dt.getMonth() + 1); }
function _hcWeekState(idx, room, curIdx, hcDoneMap, absRows) {
  const ws  = _hcAddDays(HC_W1_START, idx * 7);
  const wsY = _hcYmd(ws), weY = _hcYmd(_hcAddDays(ws, 6));
  if ((absRows || []).some(a => a.room === room && absCoversWeek(a, wsY, weY))) return { state: 'away' };
  if (kVacantInWeek(room, idx)) return { state: 'vacant' };
  const d = hcDoneMap[idx + '_' + room];
  if (d) return { state: 'done', late: d.ts >= _hcAddDays(ws, 7).getTime(), done: d };   // marked after Sunday = late
  if (idx < curIdx)  return { state: 'missed' };
  if (idx === curIdx) return { state: 'open' };
  return { state: 'upcoming' };
}
function _renderHcRotation(curIdx, hcDoneMap, absRows, myRoom) {
  const rotEl = document.getElementById('hc-rotation-list'); if (!rotEl) return;
  if (curIdx < 0) { rotEl.innerHTML = ''; return; }
  const n      = _hcGetRoomList().length || 1;
  const isMgmt = typeof hcCorrectWeek === 'function';
  const LABEL  = { done: 'Done', late: 'Done (late)', missed: 'Missed', away: 'Away', vacant: 'Vacant' };
  const weeks  = [];
  if (curIdx - 1 >= HC_HISTORY_FROM) weeks.push(curIdx - 1);   // test weeks before the start never show
  // this week + the rest of one round — every room exactly once (last week's room is not repeated)
  const ahead = weeks.length ? n - 1 : n;
  for (let i = 0; i < ahead; i++) weeks.push(curIdx + i);
  let nextSet = false;
  rotEl.innerHTML = '<div class="hc-sch">' + weeks.map(idx => {
    const info = _hcWeekInfo(idx); if (!info) return '';
    const room = info.room;
    const s    = _hcWeekState(idx, room, curIdx, hcDoneMap, absRows);
    const off  = s.state === 'away' || s.state === 'vacant';
    const when = idx < curIdx ? 'Last week' : idx === curIdx ? 'This week'
               : idx === curIdx + 1 ? 'Next week' : 'In ' + (idx - curIdx) + ' weeks';
    let tone = '';
    if (idx < curIdx)        tone = 'last';
    else if (idx === curIdx) tone = s.state === 'done' ? 'done' : 'now';
    else if (!off && !nextSet) { tone = 'next'; nextSet = true; }
    const key   = s.state === 'done' ? (s.late ? 'late' : 'done')
                : (off || s.state === 'missed') ? s.state : null;
    const right = key
      ? `<span class="hc-sch-badge hc-sch-badge--${key === 'late' ? 'done' : key}">${LABEL[key]}</span>`
      : `<span class="hc-sch-dates">${_hcFmtDM(info.start)} – ${_hcFmtDM(info.end)}</span>`;
    const you    = myRoom && room === myRoom ? '<span class="cc-turn-you">you</span>' : '';
    const canFix = isMgmt && idx <= curIdx && !off;
    const mail   = isMgmt && typeof _hcMailBtn === 'function' ? _hcMailBtn(room, idx >= curIdx && s.state !== 'done' && !off) : '';
    return `<div class="hc-sch-row${tone ? ' hc-sch-row--' + tone : ''}${off ? ' hc-sch-row--off' : ''}${canFix ? ' hc-sch-row--tap' : ''}"${canFix ? ` onclick="hcCorrectWeek(${idx})"` : ''}>
      <span class="hc-sch-when">${when}</span>
      <span class="hc-sch-name">${esc(room)}${you}</span>
      ${right}${mail}
    </div>`;
  }).join('') + '</div>';

  if (myRoom && typeof onRoomsChange === 'function' && !loadHouseCleaning._roomsWired) {
    loadHouseCleaning._roomsWired = true;
    onRoomsChange(() => loadHouseCleaning(myRoom));
  }
}

/* ── NO EMPTY SCROLL (phone) ───────────────────────────────
   When everything on the House Cleaning tab fits on the screen, the page
   is held still (no scrolling into empty space). As soon as it does not fit
   (small iPhone, extra notes, more rooms) normal scrolling is back, so
   nothing is ever cut off. Re-checked after every redraw and on rotate /
   resize; leaving the tab resets it (switchTab in layout.js). */
function _hcFitScreen() {
  const tab = document.getElementById('tab-cleaning');
  if (!tab || tab.style.display === 'none') return;
  const de = document.documentElement, b = document.body;
  if (!(typeof kIsMobile === 'function' ? kIsMobile() : window.innerWidth <= 700)) {
    de.style.overflow = ''; b.style.overflow = ''; return;
  }
  const bottom = tab.getBoundingClientRect().bottom + window.scrollY;   // where the content really ends
  const fits = bottom <= window.innerHeight + 1;
  de.style.overflow = fits ? 'hidden' : '';
  b.style.overflow  = fits ? 'hidden' : '';
  if (fits && window.scrollY) window.scrollTo(0, 0);
}
if (!window._hcFitWired) {
  window._hcFitWired = true;
  window.addEventListener('resize', () => setTimeout(_hcFitScreen, 150));
}
