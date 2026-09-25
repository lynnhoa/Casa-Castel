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
  });

  /* Wire save button */
  document.getElementById('abs-save')?.addEventListener('click', absSaveAbsence);
})();

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
    const overlaps = curStart && a.from_date <= curEnd && a.to_date >= curStart;
    const thisWeek = overlaps ? `<span style="font-size:10px;color:#8C5A30;margin-left:4px;">· this week</span>` : '';
    const note = a.note ? ` · <span style="color:var(--cc-stone);">${esc(a.note)}</span>` : '';
    const canDelete = isLandlord || a.room === _absMyRoom();
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
    if (overlapping.length) {
      await sbL.from('kitchen_absences').delete().in('id', overlapping.map(a=>a.id));
    }
    const payload = { room: myRoom, from_date: mergedFrom, to_date: mergedTo };
    if (mergedNote) payload.note = mergedNote;
    const { error: insErr } = await sbL.from('kitchen_absences').insert(payload);
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
  // Notify both tabs to re-render rotation
  if (typeof loadHouseCleaning === 'function') loadHouseCleaning();
}

/* ─────────────────────────────────────────────────────────────
   js/tab-cleaning.js  (LANDLORD)

   Layout changes (logic unchanged):
   - Removed standalone "Send reminder" section
   - Mail icon added inline to each rotation row
   - Absence sub-section moved out of card body into action strip
   - Section labels use sep-line style
   ───────────────────────────────────────────────────────────── */

/* ── INJECT HTML ────────────────────────────────────────── */
document.getElementById('tab-cleaning').innerHTML = `
  <h1 class="cc-h1 cc-mb-24">House Cleaning</h1>

  <div class="cc-section" style="padding-top:0;">
    <p class="hc-section-title">This week</p>
    <div id="hc-current-week"></div>
  </div>

  <div class="cc-section">
    <p class="hc-section-title">Rotation — all rooms</p>
    <div id="hc-rotation-list"></div>
  </div>

`;

/* ── HC ROTATION CONSTANTS ──────────────────────────────── */
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
let _hcChannel = null;
function _hcSubscribe() {
  if (!sbL) return;
  if (_hcChannel) { sbL.removeChannel(_hcChannel); _hcChannel = null; }
  _hcChannel = sbL.channel('cleaning-landlord-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_weeks' }, async () => {
      loadHouseCleaning();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_absences' }, async () => {
      loadHouseCleaning();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, async () => {
      if (typeof loadRoomsData === 'function') await loadRoomsData();
      loadHouseCleaning();
    })
    .subscribe();
}

/* ── MAIN LOAD ──────────────────────────────────────────── */
async function loadHouseCleaning() {
  // Ensure rooms are loaded so _hcGetRoomList() has data
  if (typeof appRooms !== 'undefined' && appRooms.length === 0 && typeof loadRoomsData === 'function') {
    await loadRoomsData();
  }

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
      sbL.from('cleaning_weeks').select('week_index,room,status,done_at,done_by').eq('status','done'),
      sbL.from('kitchen_absences').select('*')
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

  const wDone  = curInfo ? (hcDoneMap[curIdx + '_' + curInfo.room] || null) : null;
  const isDone = !!wDone;

  // Absences covering this week
  const curWStart = curInfo ? _hcYmd(curInfo.start) : null;
  const curWEnd   = curInfo ? _hcYmd(curInfo.end)   : null;
  const weekAbsences = curWStart ? absRows.filter(a => a.from_date <= curWEnd && a.to_date >= curWStart) : [];
  // Is the current week's assigned room itself absent?
  const isCurrentRoomAbsent = curInfo ? weekAbsences.some(a => a.room === curInfo.room) : false;

  /* ── This week card ── */
  const cwEl = document.getElementById('hc-current-week');
  if (!curInfo) {
    cwEl.innerHTML = '<p class="cc-note">Not started yet.</p>';
  } else {
    cwEl.innerHTML = `
      <div class="hc-current-card${isDone ? ' hc-current-card--done' : ''}">
        <div class="hc-current-top">
          <div>
            <p class="hc-current-kw">${esc(curInfo.room)}</p>
          </div>
          <span class="k-pill ${isDone ? 'k-pill--done' : isCurrentRoomAbsent ? 'k-pill--skipped' : 'k-pill--pending'}" style="font-size:10px;padding:3px 8px;">
            <span class="k-dot ${isDone ? 'k-dot--done' : isCurrentRoomAbsent ? 'k-dot--skipped' : 'k-dot--pending'}"></span>
            ${isDone ? 'Done' : isCurrentRoomAbsent ? '— Away' : 'Pending'}
          </span>
        </div>
        <p class="hc-current-dates">${curInfo.dateRange} · ${curInfo.daysLeft} days left</p>
        ${isDone
          ? `<div class="hc-done-confirm visible">
               <span class="k-pill k-pill--done" style="font-size:10px;padding:3px 8px;">
                 <span class="k-dot k-dot--done"></span>
                 Marked done by ${esc(wDone.room)}
               </span>
               <span class="hc-done-ts">${fmtTs(wDone.ts)}</span>
             </div>`
          : isCurrentRoomAbsent ? `<p class="cc-note" style="margin-top:4px;">${esc(curInfo.room)} is away this week.</p>` : `<p class="cc-note" style="margin-top:4px;">${esc(curInfo.room)} is responsible this week.</p>`
        }
      </div>

      <!-- Action strip: absences button + week-absence notices -->
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button onclick="absOpenModal('list')" style="flex:1;height:34px;display:flex;align-items:center;justify-content:center;gap:5px;background:var(--cc-notice-bg);border:0.5px solid var(--cc-notice-bdr);border-radius:var(--cc-r-sm);color:var(--cc-notice-text);font-size:10px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;font-family:inherit;">
          <i class="ti ti-calendar-off" style="font-size:13px;" aria-hidden="true"></i>
          View absences
        </button>
      </div>
      ${weekAbsences.length ? `<div style="margin-top:6px;">` + weekAbsences.map(a => {
        const note = a.note ? ` · ${esc(a.note)}` : '';
        return `<div style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--cc-notice-bg);border:0.5px solid var(--cc-notice-bdr);border-radius:var(--cc-r-sm);margin-bottom:6px;">
          <i class="ti ti-calendar-off" style="font-size:14px;color:#8C5A30;flex-shrink:0;" aria-hidden="true"></i>
          <span style="flex:1;font-size:11px;color:#8C5A30;">${esc(a.room)} is away this week${note}</span>
        </div>`;
      }).join('') + `</div>` : ''}`;
  }

  /* ── Rotation timeline ── */
  _renderHcRotation(cycleStart, cyclePos, hcDoneMap, absRows, rot);

  /* ── Start realtime if not already running ── */
  _hcSubscribe();

  /* ── Rerender when rooms tab changes (new room, sort_order, vacant) ── */
  if (typeof onRoomsChange === 'function' && !loadHouseCleaning._roomsWired) {
    loadHouseCleaning._roomsWired = true;
    onRoomsChange(() => loadHouseCleaning());
  }
}

/* ── ROTATION STATE ─────────────────────────────────────── */
function _hcRotState({ isNow, isPast, isNext, slotDone, room, weekStart, absRows }) {
  // 1. Absence — overrides everything including now/next
  if (absRows && weekStart) {
    const wStart = _hcYmd(weekStart);
    const wEnd   = _hcYmd(_hcAddDays(weekStart, 6));
    if (absRows.some(a => a.room === room && a.from_date <= wEnd && a.to_date >= wStart)) return 'absent';
  }
  // 2. Vacant room
  if (isVacant(room)) return 'skipped';
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

/* ── ROTATION TIMELINE ──────────────────────────────────── */
function _renderHcRotation(cycleStart, cyclePos, hcDoneMap, absRows, rot) {
  rot = rot || _hcGetRoomList();
  const rotEl = document.getElementById('hc-rotation-list');
  const pad   = n => String(n).padStart(2, '0');
  const fmtD  = dt => pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '.' + dt.getFullYear();

  /* ── Find the true "next" cycle index ──
     Walk forward from cyclePos+1, skipping any slot that would be
     absent or skipped (vacant), until we find one that is actionable. */
  let trueNextI = -1;
  for (let offset = 1; offset <= rot.length; offset++) {
    const candidateI    = (cyclePos + offset) % rot.length;
    const candidateSlot = cycleStart + cyclePos + offset;
    const candidateRoom = rot[candidateI];
    const candidateWs   = _hcAddDays(HC_W1_START, candidateSlot * 7);
    const cwStart = _hcYmd(candidateWs);
    const cwEnd   = _hcYmd(_hcAddDays(candidateWs, 6));
    const isAbsent  = (absRows || []).some(a => a.room === candidateRoom && a.from_date <= cwEnd && a.to_date >= cwStart);
    const isSkipped = isVacant(candidateRoom);
    if (!isAbsent && !isSkipped) { trueNextI = candidateI; break; }
  }

  rotEl.innerHTML = '<div class="rot-tl">' + rot.map((r, i) => {
    // Rows up to the true "next" row belong to the NEXT round once the rotation wraps
    const inNextRound = trueNextI !== -1 && trueNextI < cyclePos && i <= trueNextI;
    const slotIdx  = inNextRound ? cycleStart + rot.length + i : cycleStart + i;
    const ws       = _hcAddDays(HC_W1_START, slotIdx * 7);
    const we       = _hcAddDays(ws, 6);
    const dateStr  = fmtD(ws) + ' – ' + fmtD(we);
    const isPast   = !inNextRound && i < cyclePos;
    const isNow    = i === cyclePos;
    const isNext   = i === trueNextI;
    const slotDone = hcDoneMap[slotIdx + '_' + r] || null;

    const state = _hcRotState({ isNow, isPast, isNext, slotDone, room: r, weekStart: ws, absRows: absRows || [] });

    const rowClass = 'rot-tl-row'
      + (state === 'now'     ? ' rot-tl-row--now'     : '')
      + (state === 'next'    ? ' rot-tl-row--next'    : '')
      + (state === 'missed'  ? ' rot-tl-row--missed'  : '')
      + (state === 'skipped' ? ' rot-tl-row--skipped' : '')
      + (state === 'absent'  ? ' rot-tl-row--absent'  : '');

    const dotClass = {
      done:'rot-dot--done', now:'rot-dot--now', next:'rot-dot--next',
      missed:'rot-dot--missed', skipped:'rot-dot--skipped', absent:'rot-dot--absent'
    }[state] || 'rot-dot--none';

    const topLine = state === 'done' || state === 'now' ? 'rot-line-done'
                  : state === 'skipped' ? 'rot-line-skipped'
                  : state === 'absent'  ? 'rot-line-absent'
                  : state === 'missed'  ? 'rot-line-missed'
                  : 'rot-line-faded';
    const botLine = state === 'done' && i < cyclePos ? 'rot-line-done' : 'rot-line-faded';

    const badge = {
      done:     '<span class="rot-badge rot-badge--done">Done</span>',
      now:      '<span class="rot-badge rot-badge--now">This week</span>',
      next:     '<span class="rot-badge rot-badge--next">Next</span>',
      missed:   '<span class="rot-badge rot-badge--missed">Missed</span>',
      skipped:  '<span class="rot-badge rot-badge--skipped">Skipped</span>',
      absent:   '<span class="rot-badge rot-badge--absent">Away</span>',
      upcoming: '<span class="rot-badge rot-badge--none">—</span>',
    }[state] || '<span class="rot-badge rot-badge--none">—</span>';

    /* Mail icon button — builds mailto link from tenantEmail() utility */
    const email   = tenantEmail(r);
    const profile = S.get('room_profile_' + r, {});
    const name    = profile.firstName || r;
    const subject = encodeURIComponent('Casa Castel — House Cleaning Reminder');
    const body    = encodeURIComponent(`Hi ${name},\n\nThis is a reminder to complete the house cleaning for your assigned week.\n\nPlease make sure the shared areas are cleaned by Sunday 23:59.\n\nCasa Castel`);
    const mailHref = email ? `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}` : '#';
    const mailBtn  = `<a href="${mailHref}" target="_blank" title="Send reminder to ${esc(r)}" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:var(--cc-r-sm);background:var(--cc-surface);border:0.5px solid var(--cc-rule);color:var(--cc-taupe);text-decoration:none;flex-shrink:0;margin-left:6px;" aria-label="Send reminder to ${esc(r)}">
      <i class="ti ti-mail" style="font-size:13px;" aria-hidden="true"></i>
    </a>`;

    return `<div class="${rowClass}">
      <div class="rot-spine">
        <div class="rot-spine-top ${topLine}"></div>
        <div class="rot-dot ${dotClass}"></div>
        <div class="rot-spine-bot ${botLine}"></div>
      </div>
      <div class="rot-tl-body">
        <div class="rot-tl-info">
          <p class="rot-tl-room">${r}</p>
          <p class="rot-tl-dates">${dateStr}</p>
        </div>
        <div style="display:flex;align-items:center;gap:0;">
          ${badge}
          ${mailBtn}
        </div>
      </div>
    </div>`;
  }).join('') + '</div>';
}
