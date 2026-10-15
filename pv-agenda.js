/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · LYNN'S AGENDA (board M5) · Phase 2
   pv-agenda.js — ONE modal, one level:
     Rhythms (tap one to change · + Rhythm)
     Coming visits (tap one: move / replan · who · list · extra
       task · cancel / restore) · pauses inline · + Pause · + Extra date
     Hessen holidays marked red (display only, never auto-moved).
   One load: pv_admin_agenda. Save returns to the read view.

   Depends on: utils.js (esc, ccConfirm), pv-core.js (pvWdDM, pvDM,
               pvHoliday, pvAddDays), pv-pics.js (pvPic),
               pv-admin.js (pvaRpc, pvaToast, pvaLoad, _pvaData,
               _pvaJob, _PVA_AV)
   ───────────────────────────────────────────────────────────── */

let _pvag     = null;     // pv_admin_agenda payload (+ .job)
let _pvagEdit = null;     // open edit row {kind:'rhythm'|'visit'|'pause', id|null}
let _pvagSel  = {};       // chip choices inside the open edit row
let _pvagBusy = false;

const _PVAG_WD  = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _PVAG_ORD = ['', '1st', '2nd', '3rd', '4th', 'last'];
const _PVAG_WHY = { krank: 'sick', termin: 'other plans', anderes: 'other' };

/* ── OPEN / LOAD ────────────────────────────────────────── */
async function pvaOpenAgenda(visitId) {
  if (!_pvaData || !_pvaData.job) { pvaToast('Create a job first.'); return; }
  $a('pvaAgendaTitle').innerHTML = `Agenda · <b>${esc(_pvaData.job.name)}</b>`;
  _pvagEdit = null;
  if (!_pvag || _pvag.job !== _pvaJob) {                      /* last agenda from this phone, shown instantly */
    try { const c = JSON.parse(localStorage.getItem('pvag_copy_' + _pvaJob) || 'null'); if (c) _pvag = c; } catch (e) {}
  }
  if (_pvag && _pvag.job === _pvaJob) pvagRender();
  else $a('pvaAgendaBody').innerHTML = pvaSkeleton();
  pvaSheetOpen('pvaAgendaScrim');
  await pvagLoad();
  if (visitId) pvagOpen('visit', visitId);
}

async function pvagLoad() {
  const job = _pvaJob;
  const { data, error } = await pvaRpc('pv_admin_agenda', { p_job: job });
  if (error || !data || data.error) { pvaToast('Could not load the agenda — try again.'); return; }
  _pvag = Object.assign(data, { job });
  try { localStorage.setItem('pvag_copy_' + job, JSON.stringify(_pvag)); } catch (e) {}
  pvagRender();
}

/* ── SMALL PARTS ────────────────────────────────────────── */
function _pvagFirstList() { const l = (_pvaData && _pvaData.lists) || []; return l[0] ? l[0].id : null; }
function _pvagListName(id) {
  const l = ((_pvaData && _pvaData.lists) || []).find(x => x.id === (id || _pvagFirstList()));
  return l ? l.name : '—';
}
function _pvagActive() { return ((_pvaData && _pvaData.people) || []).filter(p => !p.switched_off_at); }
function _pvagDate(iso) { return pvWdDM(iso, true) + String(iso).slice(0, 4); }      /* Fri 16.10.2026 */
function _pvagIsoDow(iso) { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; }
function _pvagAvatar(pid) {
  const people = (_pvaData && _pvaData.people) || [];
  const i = people.findIndex(p => p.id === pid);
  if (!pid || i < 0) return '<span class="hc-pill hc-pill--later">anyone</span>';
  const c = _PVA_AV[i % _PVA_AV.length];
  return `<span title="${esc(people[i].name)}" style="width:24px;height:24px;border-radius:50%;background:${c[0]};color:${c[1]};font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;">${esc((people[i].name || '?')[0].toUpperCase())}</span>`;
}
function _pvagRhythmText(r) {
  const every = r.unit === 'month' ? (r.every === 1 ? 'Every month' : `Every ${r.every} months`)
                                   : (r.every === 1 ? 'Every week' : `Every ${r.every} weeks`);
  const day = r.unit === 'month' ? `${_PVAG_ORD[r.week_of_month] || ''} ${_PVAG_WD[r.weekday]}`.trim() : _PVAG_WD[r.weekday];
  return `${every} · ${day}${r.time ? ' · ' + r.time : ''}`;
}
function _pvagTime(v) {                    /* "10" → 10:00 · "930" → 09:30 · "" → null · bad → undefined */
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[:.]?(\d{2})?$/);
  if (!m || +m[1] > 23 || (m[2] && +m[2] > 59)) return undefined;
  return String(+m[1]).padStart(2, '0') + ':' + (m[2] || '00');
}
function _pvagIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : ''; }
function _pvagChips(grp, opts, sel) {
  return `<div class="pv-chips" data-grp="${grp}">` + opts.map(o =>
    `<span class="k-mob-n-chip${String(o[0]) === String(sel) ? ' selected' : ''}" data-v="${esc(String(o[0]))}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">${esc(o[1])}</span>`).join('') + '</div>';
}
function _pvagWhoChips(sel) {
  return _pvagChips('who', _pvagActive().map(p => [p.id, p.name]).concat([['', 'anyone']]), sel || '');
}
function _pvagListChips(sel) {
  return _pvagChips('list', ((_pvaData && _pvaData.lists) || []).map(l => [l.id, l.name]), sel || _pvagFirstList());
}
function _pvagFoot(left, saveFn) {
  return `<div class="cc-sec-foot" style="margin-top:10px;">${left || ''}<button class="cc-foot-btn" type="button" onclick="pvagClose()">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="${saveFn}">Save</button></div>`;
}

/* ── EDIT ROWS ──────────────────────────────────────────── */
function _pvagRhythmForm(r) {
  return `<div class="pv-edit-row">
      <div><p class="pv-k">Repeat</p>${_pvagChips('unit', [['week', 'Weeks'], ['month', 'Months']], _pvagSel.unit)}</div>
      <div class="pv-kv" style="margin-top:10px;">
        <div><label class="pv-k" for="pvagEvery">Every</label><input id="pvagEvery" class="pv-field" inputmode="numeric" maxlength="2" value="${r ? r.every : 1}"/></div>
        <div><label class="pv-k" for="pvagTime">Time</label><input id="pvagTime" class="pv-field" inputmode="numeric" placeholder="10:00" value="${esc(r ? (r.time || '') : '10:00')}"/></div>
      </div>
      <div style="margin-top:10px;"><p class="pv-k">Weekday</p>${_pvagChips('wd', [1, 2, 3, 4, 5, 6, 7].map(d => [d, _PVAG_WD[d]]), _pvagSel.wd)}</div>
      <div style="margin-top:10px;"><label class="pv-k" for="pvagStart">Start date</label><input id="pvagStart" class="pv-field" type="date" value="${esc(r ? r.start : _pvag.today)}"/></div>
      <div style="margin-top:10px;"><p class="pv-k">Who</p>${_pvagWhoChips(_pvagSel.who)}</div>
      <div style="margin-top:10px;"><p class="pv-k">List</p>${_pvagListChips(_pvagSel.list)}</div>
      <span class="k-note" style="margin-top:10px;">Months: same weekday + week of the month as the start date (e.g. 1st Sat). Saving replaces only future visits you haven't changed.</span>
      ${_pvagFoot(r ? `<button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvagDeleteRhythm('${r.id}')">Delete</button>` : '', `pvagSaveRhythm(${r ? `'${r.id}'` : 'null'})`)}
    </div>`;
}

function _pvagVisitForm(v) {
  const x = v && v.extra_task && v.extra_task.de ? v.extra_task : null;
  const running = v && v.status === 'in_progress';
  let left = '';
  if (v && v.status === 'planned') left = `<button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvagCancelVisit('${v.id}')">Cancel visit</button>`;
  if (v && v.status === 'cancelled' && v.cancelled_by !== 'pause') left = `<button class="cc-foot-btn is-left" type="button" onclick="pvagRestore('${v.id}')">Restore</button>`;
  return `<div class="pv-edit-row">
      ${running ? '<span class="k-note" style="margin-top:0;">Running now — only the extra task can change.</span>' : `
      <div class="pv-kv">
        <div><label class="pv-k" for="pvagDate">${v ? 'New date' : 'Date'}</label><input id="pvagDate" class="pv-field" type="date" value="${esc(v ? v.date : _pvag.today)}"/></div>
        <div><label class="pv-k" for="pvagTime">Time</label><input id="pvagTime" class="pv-field" inputmode="numeric" placeholder="10:00" value="${esc(v ? (v.time || '') : '10:00')}"/></div>
      </div>
      <div style="margin-top:10px;"><p class="pv-k">Who</p>${_pvagWhoChips(_pvagSel.who)}</div>
      <div style="margin-top:10px;"><p class="pv-k">List</p>${_pvagListChips(_pvagSel.list)}</div>`}
      <div style="margin-top:10px;"><p class="pv-k">Extra task · only this visit</p>
        <div class="pv-kv">
          <div><input id="pvagXde" class="pv-field" maxlength="120" placeholder="Deutsch" value="${esc(x ? x.de : '')}"/></div>
          <div><input id="pvagXen" class="pv-field" maxlength="120" placeholder="English" value="${esc(x ? (x.en || '') : '')}"/></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;"><span class="pv-k">Photo</span><span id="pvagXph" class="pv-toggle${_pvagSel.xph ? '' : ' pv-toggle--off'}" role="button" tabindex="0" aria-label="Photo" onclick="pvagTogglePhoto()"></span></div>
      </div>
      ${v && v.status === 'cancelled_by_provider' ? '<span class="k-note k-note--flag" style="margin-top:10px;">Save = planned again (the history keeps the cancel).</span>' : ''}
      ${v && v.status === 'cancelled' && v.cancelled_by === 'pause' ? '<span class="k-note" style="margin-top:10px;">Inside a pause: shorten or end the pause to bring it back, or move it to another date.</span>' : ''}
      ${_pvagFoot(left, `pvagSaveVisit(${v ? `'${v.id}'` : 'null'})`)}
    </div>`;
}

function _pvagPauseForm(p) {
  return `<div class="pv-edit-row">
      <div class="pv-kv">
        <div><label class="pv-k" for="pvagFrom">From</label><input id="pvagFrom" class="pv-field" type="date" value="${esc(p ? p.from : _pvag.today)}"/></div>
        <div><label class="pv-k" for="pvagTo">To</label><input id="pvagTo" class="pv-field" type="date" value="${esc(p ? p.to : pvAddDays(_pvag.today, 7))}"/></div>
      </div>
      <span class="k-note" style="margin-top:8px;">Visits inside the pause turn sand. Shortening or ending it brings them back.</span>
      ${_pvagFoot(p ? `<button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvagEndPause('${p.id}')">End pause</button>` : '', `pvagSavePause(${p ? `'${p.id}'` : 'null'})`)}
    </div>`;
}

/* ── READ VIEW ──────────────────────────────────────────── */
function _pvagVisitRow(v) {
  const today = v.date === _pvag.today;
  const smalls = [];
  const pills = [];
  let style = '', cls = 'pv-ag';
  const tap = ['planned', 'cancelled', 'cancelled_by_provider', 'in_progress'].includes(v.status);
  if (v.status === 'cancelled_by_provider') {
    style = 'background:#FEF6F5;border-radius:10px;padding:6px 8px;border-top:none;';
    smalls.push(`${_PVAG_WHY[v.cancel_reason] || 'cancelled'}${v.cancel_note ? ' · „' + esc(v.cancel_note) + '“' : ''} · tap to replan`);
    pills.push(`<span class="hc-pill hc-pill--missed">Cancelled by ${esc(v.cancelled_person || 'provider')}</span>`);
  } else if (v.status === 'cancelled') {
    cls += ' pv-ag--off';
    pills.push(`<span class="hc-pill hc-pill--away">${v.cancelled_by === 'pause' ? 'Pause' : 'Cancelled'}</span>`);
  } else if (v.status === 'in_progress') pills.push('<span class="hc-pill hc-pill--now">In progress</span>');
  else if (v.status === 'sent') pills.push('<span class="hc-pill" style="background:#FDE4D0;border-color:#F0A877;color:#8A3E12;">To review</span>');
  else if (v.status === 'done') pills.push('<span class="hc-pill hc-pill--done">Done</span>');
  else if (v.status === 'missed' || v.status === 'redo') pills.push(`<span class="hc-pill hc-pill--missed">${v.status === 'redo' ? 'Redo' : 'Missed'}</span>`);
  else if (today) pills.push('<span class="hc-pill hc-pill--now">Today</span>');
  if (v.moved_from && v.moved_from !== v.date && v.status === 'planned') smalls.push('moved from ' + pvDM(v.moved_from));
  if (v.extra_task && v.extra_task.de) smalls.push('Extra: ' + esc(v.extra_task.de) + (v.extra_task.photo ? ' · photo' : ''));
  const hol = pvHoliday(v.date);
  if (hol) smalls.push(`<span style="color:#A32D2D;">Holiday · ${esc(hol)}</span>`);
  if (v.list_id && v.list_id !== _pvagFirstList()) pills.unshift(`<span class="hc-pill" style="background:#FCE9DD;border-color:#F6C3A3;color:#A3512A;">${esc(_pvagListName(v.list_id))}</span>`);
  return `<div class="${cls}" style="${style}${tap ? 'cursor:pointer;' : ''}"${tap ? ` onclick="pvagOpen('visit','${v.id}')"` : ''}>
      <p class="pv-ag__d">${_pvagDate(v.date)}${v.time ? ' · ' + v.time : ''}${smalls.map(x => `<small>${x}</small>`).join('')}</p>
      ${_pvagAvatar(v.person_id)}${pills.join('')}
    </div>`;
}

function _pvagPauseRow(p) {
  const n = p.n || 0;
  return `<div class="pv-ag" style="border-top:none;margin:4px 0;padding:8px 10px;border-radius:10px;background:#F5EEE8;border:.5px solid #D4A87A;">
      <span style="color:#8C5A30;display:inline-flex;">${pvPic('pause', 16)}</span>
      <p class="pv-ag__d" style="color:#8C5A30;">Pause ${pvDM(p.from)}${String(p.from).slice(0, 4)} – ${pvDM(p.to)}${String(p.to).slice(0, 4)}<small>${n} visit${n === 1 ? '' : 's'} · restore = end pause</small></p>
      <button class="cc-foot-btn" type="button" onclick="pvagOpen('pause','${p.id}')">Edit</button>
    </div>`;
}

function _pvagGuestRow() {                   /* Build 2 · a guest link for another day */
  const t = (_pvaData && _pvaData.state && _pvaData.state.today) || '';
  return `<div class="pv-sec"><p class="pv-sec__t">Guest link <span class="en">one-time cleaner · no account</span></p>
    <div style="display:flex;gap:8px;align-items:center;"><input type="date" id="pvagGuestDate" class="cc-input" value="${t}" min="${t}" style="flex:1;min-width:0;font-family:inherit;"/>
    <button class="cc-foot-btn" type="button" onclick="pvaGuestQr(document.getElementById('pvagGuestDate').value, 'pvagGuestQr')"><i class="ti ti-qrcode" aria-hidden="true"></i>QR</button>
    <button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaGuestLink(document.getElementById('pvagGuestDate').value)">Share link</button></div>
    <div id="pvagGuestQr"></div></div>`;
}
function pvagRender() {
  const d = _pvag;
  if (!d) return;
  const ed = _pvagEdit || {};
  let h = _pvagGuestRow() + `<div class="pv-sec"><p class="pv-sec__t">Rhythms <span class="en">tap one to change</span></p>`;
  if (ed.kind === 'rhythm' && !ed.id) h += _pvagRhythmForm(null);
  if (!d.rhythms.length && !(ed.kind === 'rhythm' && !ed.id)) h += '<p class="pv-k" style="padding:2px 0 4px;">No rhythm yet. Add one — the visits of the next 12 weeks then appear below.</p>';
  d.rhythms.forEach(r => {
    h += `<div class="pv-ag" style="cursor:pointer;" onclick="pvagOpen('rhythm','${r.id}')"><p class="pv-ag__d">${esc(_pvagRhythmText(r))}<small>from ${pvDM(r.start)}${String(r.start).slice(0, 4)}</small></p>${_pvagAvatar(r.person_id)}<span class="k-mob-n-chip" style="display:inline-flex;align-items:center;gap:5px;">${esc(_pvagListName(r.list_id))}</span></div>`;
    if (ed.kind === 'rhythm' && ed.id === r.id) h += _pvagRhythmForm(r);
  });
  h += `<div class="cc-sec-foot"><button class="cc-foot-btn is-left" type="button" onclick="pvagOpen('rhythm',null)">${pvPic('plus', 12)}Rhythm</button></div></div>`;

  h += `<div class="pv-sec"><p class="pv-sec__t">Coming visits <span class="en">tap one to change</span></p>`;
  if (ed.kind === 'visit' && !ed.id) h += _pvagVisitForm(null);
  if (ed.kind === 'pause' && !ed.id) h += _pvagPauseForm(null);
  const items = d.visits.map(v => ({ t: 'v', date: v.date, o: v }))
    .concat(d.pauses.map(p => ({ t: 'p', date: p.from < d.today ? d.today : p.from, o: p })))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t === 'p' ? -1 : 1));
  if (!items.length) h += '<p class="pv-k" style="padding:2px 0 4px;">No visits planned.</p>';
  items.forEach(it => {
    if (it.t === 'p') {
      h += _pvagPauseRow(it.o);
      if (ed.kind === 'pause' && ed.id === it.o.id) h += _pvagPauseForm(it.o);
    } else {
      h += _pvagVisitRow(it.o);
      if (ed.kind === 'visit' && ed.id === it.o.id) h += _pvagVisitForm(it.o);
    }
  });
  h += `<div class="cc-sec-foot"><button class="cc-foot-btn is-left" type="button" onclick="pvagOpen('pause',null)">${pvPic('pause_add', 12)}Pause from–to</button><button class="cc-foot-btn" type="button" onclick="pvagOpen('visit',null)">${pvPic('extra_date', 12)}Extra date</button></div></div>`;

  const body = $a('pvaAgendaBody');
  const top = body.scrollTop;
  body.innerHTML = h;
  body.scrollTop = top;
  body.querySelectorAll('.pv-chips[data-grp] .k-mob-n-chip').forEach(c => c.onclick = e => {
    e.stopPropagation();
    const g = c.parentNode.getAttribute('data-grp');
    _pvagSel[g] = c.getAttribute('data-v');
    c.parentNode.querySelectorAll('.k-mob-n-chip').forEach(x => x.classList.toggle('selected', x === c));
  });
  body.querySelectorAll('.pv-edit-row').forEach(r => r.addEventListener('click', e => e.stopPropagation()));
}

/* ── OPEN / CLOSE AN EDIT ROW ───────────────────────────── */
function pvagOpen(kind, id) {
  if (_pvagBusy || !_pvag) return;
  id = id || null;
  if (_pvagEdit && _pvagEdit.kind === kind && _pvagEdit.id === id) { pvagClose(); return; }   /* tap again closes */
  const first = _pvagFirstList();
  const active = _pvagActive().map(p => p.id);
  const who = pid => (pid && active.includes(pid)) ? pid : '';
  if (kind === 'rhythm') {
    const r = id ? _pvag.rhythms.find(x => x.id === id) : null;
    _pvagSel = { unit: r ? r.unit : 'week', wd: String(r ? r.weekday : _pvagIsoDow(_pvag.today)), who: who(r && r.person_id), list: (r && r.list_id) || first };
  } else if (kind === 'visit') {
    const v = id ? _pvag.visits.find(x => x.id === id) : null;
    if (id && !v) { pvaToast('That visit is gone — refreshed.'); pvagLoad(); return; }
    _pvagSel = { who: who(v && v.person_id), list: (v && v.list_id) || first, xph: !!(v && v.extra_task && v.extra_task.photo) };
  } else _pvagSel = {};
  _pvagEdit = { kind, id };
  pvagRender();
  const f = $a('pvaAgendaBody').querySelector('.pv-edit-row');
  if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function pvagClose() { _pvagEdit = null; pvagRender(); }
function pvagTogglePhoto() {
  _pvagSel.xph = !_pvagSel.xph;
  $a('pvagXph').classList.toggle('pv-toggle--off', !_pvagSel.xph);
}

/* ── SAVE (every save returns to the read view) ─────────── */
async function _pvagCall(fn, args) {
  const { data, error } = await pvaRpc(fn, args);
  if (error) { pvaToast('No connection — try again.'); return null; }
  if (data && data.error) {
    const m = { past: 'Pick today or a later date.', changed: 'Already changed — refreshed.', pause: 'Inside a pause — shorten or end the pause first.',
                refs: 'That person or list is gone — refreshed.', invalid: 'Check the fields.', job: 'This job is gone — refreshed.' };
    pvaToast(m[data.error] || 'Could not save — try again.');
    if (['changed', 'refs', 'job'].includes(data.error)) { _pvagEdit = null; pvagLoad(); }
    return null;
  }
  return data || {};
}
async function _pvagRun(fn) {
  if (_pvagBusy) return;
  _pvagBusy = true;
  try { await fn(); } finally { _pvagBusy = false; }
}
async function _pvagDone(msg) {
  if (msg) pvaToast(msg);
  _pvagEdit = null;
  await pvagLoad();
  pvaLoad();                      /* card + strip behind the modal */
}

function pvagSaveRhythm(id) {
  _pvagRun(async () => {
    const every = parseInt($a('pvagEvery').value, 10);
    const time = _pvagTime($a('pvagTime').value);
    const start = _pvagIso($a('pvagStart').value);
    if (!(every >= 1 && every <= 52)) { pvaToast('Every: a number from 1 to 52.'); return; }
    if (time === undefined) { pvaToast('Time like 10:00.'); return; }
    if (!start) { pvaToast('Pick a start date.'); return; }
    const r = await _pvagCall('pv_admin_save_rhythm', { p_id: id, p_job: _pvaJob, p_unit: _pvagSel.unit, p_every: every,
      p_weekday: parseInt(_pvagSel.wd, 10), p_time: time, p_start: start, p_person: _pvagSel.who || null, p_list: _pvagSel.list || null, p_active: true });
    if (r) await _pvagDone(`Saved · ${r.created || 0} new visit${r.created === 1 ? '' : 's'} planned.`);
  });
}
async function pvagDeleteRhythm(id) {
  const ok = await ccConfirm('Delete rhythm?', 'Its future visits you haven\u2019t changed disappear. Past, moved and changed visits stay.', 'Delete', true);
  if (!ok) return;
  _pvagRun(async () => { if (await _pvagCall('pv_admin_delete_rhythm', { p_id: id })) await _pvagDone('Rhythm deleted.'); });
}

function pvagSaveVisit(id) {
  _pvagRun(async () => {
    const v = id ? _pvag.visits.find(x => x.id === id) : null;
    const xde = $a('pvagXde').value.trim(), xen = $a('pvagXen').value.trim();
    const task = xde ? { de: xde, en: xen, photo: !!_pvagSel.xph } : null;
    const old = v && v.extra_task && v.extra_task.de ? v.extra_task : null;
    const taskChanged = JSON.stringify(task ? [task.de, task.en, task.photo] : null) !== JSON.stringify(old ? [old.de, old.en || '', !!old.photo] : null);
    let visitId = id;
    if (!v || v.status !== 'in_progress') {
      const date = _pvagIso($a('pvagDate').value);
      const time = _pvagTime($a('pvagTime').value);
      if (!date) { pvaToast('Pick a date.'); return; }
      if (time === undefined) { pvaToast('Time like 10:00.'); return; }
      const who = _pvagSel.who || null;
      const list = _pvagSel.list || null;
      if (!v) {
        let r = await _pvagCall('pv_admin_add_visit', { p_job: _pvaJob, p_date: date, p_time: time, p_person: who, p_list: list });
        if (r && r.confirm === 'day_taken') {
          if (!await ccConfirm('Day already booked', 'There is already a visit on that day. Plan a second one anyway?', 'Plan anyway', false)) return;
          r = await _pvagCall('pv_admin_add_visit', { p_job: _pvaJob, p_date: date, p_time: time, p_person: who, p_list: list, p_force: true });
        }
        if (!r || r.confirm) return;
        visitId = r.id;
      } else if (v.status !== 'planned' || date !== v.date || (time || '') !== (v.time || '') || who !== (v.person_id || null)
                 || (list || _pvagFirstList()) !== (v.list_id || _pvagFirstList())) {
        let mr = await _pvagCall('pv_admin_move_visit', { p_visit: id, p_date: date, p_time: time, p_person: who, p_list: list });
        if (mr && mr.confirm === 'day_taken') {
          if (!await ccConfirm('Day already booked', 'There is already a visit on that day. Move it there anyway?', 'Move anyway', false)) return;
          mr = await _pvagCall('pv_admin_move_visit', { p_visit: id, p_date: date, p_time: time, p_person: who, p_list: list, p_force: true });
        }
        if (!mr || mr.confirm) return;
      }
    }
    if (taskChanged && !await _pvagCall('pv_admin_set_extra_task', { p_visit: visitId, p_task: task })) { await _pvagDone(); return; }
    await _pvagDone(v ? (v.status === 'cancelled_by_provider' ? 'Planned again.' : 'Saved.') : 'Extra date planned.');
  });
}
async function pvagCancelVisit(id) {
  const ok = await ccConfirm('Cancel this visit?', 'It turns sand on both sides. You can restore it until the visit day.', 'Cancel visit', true);
  if (!ok) return;
  _pvagRun(async () => { if (await _pvagCall('pv_admin_cancel_visit', { p_visit: id })) await _pvagDone('Visit cancelled.'); });
}
function pvagRestore(id) {
  _pvagRun(async () => { if (await _pvagCall('pv_admin_restore_visit', { p_visit: id })) await _pvagDone('Visit restored.'); });
}

function pvagSavePause(id) {
  _pvagRun(async () => {
    const from = _pvagIso($a('pvagFrom').value), to = _pvagIso($a('pvagTo').value);
    if (!from || !to) { pvaToast('Pick both dates.'); return; }
    if (to < from) { pvaToast('“To” must be on or after “From”.'); return; }
    const r = await _pvagCall('pv_admin_save_pause', { p_id: id, p_job: _pvaJob, p_from: from, p_to: to });
    if (r) await _pvagDone(`Pause saved · ${r.cancelled || 0} visit${r.cancelled === 1 ? '' : 's'} paused.`);
  });
}
async function pvagEndPause(id) {
  const ok = await ccConfirm('End this pause?', 'Its visits come back as planned (a running pause ends yesterday).', 'End pause', false);
  if (!ok) return;
  _pvagRun(async () => { if (await _pvagCall('pv_admin_end_pause', { p_id: id })) await _pvagDone('Pause ended.'); });
}
