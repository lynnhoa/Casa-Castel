/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · LYNN: REVIEW & CONTROL · Phase 4
   pv-review.js
     Card actions in place: Approve · Flag · Undo · Unflag · Missed ·
       Reopen · Approve / Reject (unplanned) — a stale button answers
       "Already changed" and the card refreshes.
     Reports under the card: Missing supplies / Damage → Got it (+ Open).
     Review grid = the "Submitted" block in the chat (every photo);
       tap = Viewer (M3b, swipe) → "Flag this area" → Flag sheet (M4).
     History (M8): months, filters (status, person), every visit line.
     Chat: compose as "Casa Castel" (text + photo), delete any message.
     12-month photo clean-up: once a day when the app opens.

   Depends on: utils.js (esc, ccConfirm), chat-compose.js (ccCompose),
               pv-core.js, pv-pics.js, pv-admin.js (pvaRpc, pvaToast,
               pvaLoad, _pvaData, _pvaJob, _PVA_AV), controlling-auth.js
   ───────────────────────────────────────────────────────────── */

/* ── CARD ACTIONS ───────────────────────────────────────── */
const _PVA_ACT = {
  approve: ['pv_admin_approve', 'Approved.'],
  reject:  ['pv_admin_reject', 'Not counted.'],
  undo:    ['pv_admin_undo', 'Back to review — waiting for you.'],
  unflag:  ['pv_admin_unflag', 'Redo removed — waiting for you.'],
  missed:  ['pv_admin_missed', 'Marked as missed.'],
  reopen:  ['pv_admin_reopen', 'Reopened for 24 h.']
};
let _pvaActBusy = false;
async function pvaAct(kind, visitId) {
  if (_pvaActBusy) return;
  if (kind === 'flag') { pvaOpenFlag(visitId, null); return; }
  if (kind === 'missed' && !(await ccConfirm('Mark as missed?', 'Today\u2019s visit has no photos yet. It turns red; you can reopen it later.', 'Missed', true))) return;
  if (kind === 'reject' && !(await ccConfirm('Don\u2019t count this visit?', 'It is not counted. An invoice already sent goes back to the provider, who sees “Nicht gezählt”.', 'Don\u2019t count', true))) return;
  const a = _PVA_ACT[kind];
  if (!a) return;
  _pvaActBusy = true;
  const btns = Array.from(document.querySelectorAll('#pvaCardWrap .k-mob-wact'));
  btns.forEach(b => { b.disabled = true; b.style.opacity = '.55'; });
  const { data, error } = await pvaRpc(a[0], { p_visit: visitId });
  btns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
  _pvaActBusy = false;
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data && data.error) pvaToast(data.error === 'closed' ? 'That month is closed — reopen the month first.' : 'Already changed — refreshed.');
  else pvaToast(a[1]);
  pvaLoad();
}
function _pvaWact(kind, color, icon, label, id) {
  return `<button class="k-mob-wact ${color}" type="button" aria-label="${label}" onclick="pvaAct('${kind}','${id}')">${pvPic(icon, 14)}<span>${label}</span></button>`;
}
/* the action buttons for the card (used by _pvaCardHTML in pv-admin.js) */
function pvaCardActs(v, today) {
  if (!v) return '';
  if (v.status === 'sent') return _pvaWact('approve', 'green', 'act_approve', 'Approve', v.id) + _pvaWact('flag', 'red', 'act_flag', 'Flag', v.id);   /* Build 1: the kitchen pattern */
  if (v.status === 'done') return _pvaWact('undo', 'amber', 'act_undo', 'Undo', v.id);
  if (v.status === 'redo') return _pvaWact('unflag', 'amber', 'act_unflag', 'Unflag', v.id) + _pvaWact('reject', 'red', 'act_reject', 'Don’t count', v.id);
  if (v.status === 'missed') return _pvaWact('reopen', 'amber', 'act_reopen', 'Reopen', v.id);
  if (v.status === 'planned' && v.date === today && !v.started_at) return _pvaWact('missed', 'red', 'act_missed', 'Missed', v.id);
  return '';
}

/* ── REPORTS UNDER THE CARD ─────────────────────────────── */
function pvaReportsHTML(s) {
  return _pvaReportCards(s);                     /* invoices live in the Invoices sheet now */
}
function _pvaReportCards(s) {                /* FIX11 · one thin line per report — Got it right there */
  const reps = (s && s.reports) || [];
  return reps.map(r => {
    const pl = r.payload || {};
    const sup = r.kind === 'supplies';
    const txt = sup ? `<b>Missing supplies</b> · ${esc(pvSuppliesText(pl, true))}`
                    : `<b>Damage reported</b>${pl.note ? ' · „' + esc(pl.note) + '“' : ''}`;
    const open = !sup && pl.path ? `<button class="pva-rep-open" type="button" onclick="pvaViewPhoto('${esc(pl.path)}', 'Damage reported', '${esc((r.name || '') + ' · ' + pvTs(r.at))}')">Open</button>` : '';
    return `<div class="pva-rep-line${sup ? '' : ' pva-rep-line--dmg'}">${pvPic(sup ? 'chip_supplies' : 'chip_damage', 14)}<span class="pva-rep-txt">${txt}<span class="pva-rep-at"> · ${pvTs(r.at)}${r.name ? ' · ' + esc(r.name) : ''}</span></span>${open}<button class="pva-rep-ok" type="button" onclick="pvaAck('${r.id}')">Got it</button></div>`;
  }).join('');
}
function _pvagAvatarByName(name) {
  const people = (_pvaData && _pvaData.people) || [];
  const i = people.findIndex(p => p.name === name);
  const c = _PVA_AV[(i < 0 ? 0 : i) % _PVA_AV.length];
  return `<span title="${esc(name)}" style="width:20px;height:20px;border-radius:50%;background:${c[0]};color:${c[1]};font-size:8px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;">${esc(String(name).charAt(0).toUpperCase())}</span>`;
}
async function pvaAck(id) {
  const { data, error } = await pvaRpc('pv_admin_ack', { p_id: id });
  if (error || (data && data.error)) { pvaToast('Could not save — try again.'); return; }
  pvaLoad();
}

/* ── VIEWER (M3b) ───────────────────────────────────────── */
const _pvv = { items: [], i: 0, visit: null, status: null, x0: null };
async function pvaView(visitId, key) {
  const { data, error } = await pvaRpc('pv_admin_visit_detail', { p_visit: visitId });
  if (error || !data || data.error) { pvaToast('Could not open the photos.'); return; }
  const items = (data.points || []).filter(p => p.path || p.np).map(p => ({
    key: p.key, path: p.path, np: p.np, note: p.np_note, pic: p.pic, zone: p.zone, floor: p.floor,
    title: [p.floor, p.room_de !== p.de ? p.room_de : ''].filter(Boolean).join(' ') + ' · ' + p.de,
    sub: [p.by, pvWdDM(data.date, true) + String(data.date).slice(0, 4), p.at ? pvHM(p.at) : ''].filter(Boolean).join(' · '),
    flag: !p.extra }))
    .concat((data.extras || []).filter(x => x.path).map(x => ({
      key: x.key, path: x.path, pic: x.kind === 'damage' ? 'damage' : 'extras', zone: 'x',
      title: x.kind === 'damage' ? 'Damage' : 'Extra photo', sub: [x.by, pvTs(x.at)].filter(Boolean).join(' · '), flag: false })));
  if (!items.length) { pvaToast('No photos in this visit.'); return; }
  Object.assign(_pvv, { items, visit: visitId, status: data.status, i: Math.max(0, items.findIndex(x => x.key === key)) });
  _pvvRender();
  $a('pvaViewer').classList.remove('pv-hidden');
}
function pvaViewPhoto(path, title, sub) {
  Object.assign(_pvv, { items: [{ key: 'one', path, pic: 'damage', zone: 'x', title, sub, flag: false }], visit: null, status: null, i: 0 });
  _pvvRender();
  $a('pvaViewer').classList.remove('pv-hidden');
}
function _pvvRender() {
  const it = _pvv.items[_pvv.i];
  if (!it) return;
  const n = _pvv.items.length;
  const fl = String(it.floor || '').replace(/\.\s*OG$/i, '').trim();
  const why = { besetzt: 'occupied', kaputt: 'broken', anderes: 'other' };
  $a('pvaViewer').innerHTML = `
    <div class="scr-top" style="background:#1E1B18;"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 8px;flex-shrink:0;color:#FDFCFA;">
      <button type="button" aria-label="Close" onclick="pvaViewClose()" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#FDFCFA;">${pvPic('v_close', 20)}</button>
      <span style="font-size:14px;font-weight:600;">${_pvv.i + 1} <span style="font-weight:400;opacity:.6;">/ ${n}</span></span>
      <span style="width:44px;"></span>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:4px 16px 14px;flex-shrink:0;">
      <span class="pic pic--${esc(it.zone || 'x')}" style="width:44px;height:44px;border-radius:13px;">${pvPic(it.pic, 26)}${fl ? `<span class="pic__fl">${pvPic('fl_badge', 9)}${esc(fl)}</span>` : ''}</span>
      <div style="min-width:0;"><p style="font-size:16px;font-weight:500;color:#FDFCFA;line-height:1.2;">${esc(it.title)}</p>
        <p style="font-size:12px;color:rgba(253,252,250,.6);line-height:1.3;">${esc(it.sub || '')}</p></div>
    </div>
    <div id="pvaViewerPhoto" style="flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;margin:0 12px;border-radius:14px;background:#2B2622;overflow:hidden;color:rgba(253,252,250,.9);">
      ${it.path ? `<img src="${esc(pvProofUrl(it.path))}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"/>`
                : `<div style="text-align:center;padding:20px;"><p style="font-size:40px;line-height:1;">–</p><p style="margin-top:8px;font-size:15px;color:#FAC8C4;">Not possible (${esc(why[it.np] || it.np || '')})</p>${it.note ? `<p style="margin-top:4px;font-size:13px;color:rgba(253,252,250,.7);">„${esc(it.note)}“</p>` : ''}</div>`}
      ${n > 1 ? `<button type="button" aria-label="Previous" onclick="pvaViewStep(-1)" style="position:absolute;left:8px;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:22px;border:none;background:rgba(30,27,24,.45);color:#FDFCFA;display:flex;align-items:center;justify-content:center;">${pvPic('v_prev', 20)}</button>
      <button type="button" aria-label="Next" onclick="pvaViewStep(1)" style="position:absolute;right:8px;top:50%;margin-top:-22px;width:44px;height:44px;border-radius:22px;border:none;background:rgba(30,27,24,.45);color:#FDFCFA;display:flex;align-items:center;justify-content:center;">${pvPic('v_next', 20)}</button>` : ''}
    </div>
    <p style="flex-shrink:0;text-align:center;font-size:11px;color:rgba(253,252,250,.55);padding:10px 0 0;">${n > 1 ? 'Swipe for the next photo' : ''}</p>
    <div style="flex-shrink:0;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px));">
      ${_pvv.status === 'sent' && it.flag ? `<button type="button" onclick="pvaViewFlag()" style="width:100%;min-height:50px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:14px;border:1.5px solid #F5A8A5;background:rgba(250,200,196,.12);color:#FAC8C4;font-size:15px;font-weight:500;">${pvPic('v_flag', 18)}Flag this area</button>` : ''}
    </div>`;
  const ph = $a('pvaViewerPhoto');
  ph.addEventListener('touchstart', e => { _pvv.x0 = e.touches[0].clientX; }, { passive: true });
  ph.addEventListener('touchend', e => {
    if (_pvv.x0 == null) return;
    const dx = e.changedTouches[0].clientX - _pvv.x0; _pvv.x0 = null;
    if (Math.abs(dx) > 40) pvaViewStep(dx < 0 ? 1 : -1);
  });
}
function pvaViewStep(d) {
  const n = _pvv.items.length;
  if (n < 2) return;
  _pvv.i = (_pvv.i + d + n) % n;
  _pvvRender();
}
function pvaViewClose() { $a('pvaViewer').classList.add('pv-hidden'); $a('pvaViewer').innerHTML = ''; }
function pvaViewFlag() {                     /* one level only: the viewer closes, the flag sheet opens */
  const it = _pvv.items[_pvv.i], visit = _pvv.visit;
  pvaViewClose();
  if (visit && it) pvaOpenFlag(visit, it.key);
}
document.addEventListener('keydown', e => {
  if (!$a('pvaViewer') || $a('pvaViewer').classList.contains('pv-hidden')) return;
  if (e.key === 'ArrowRight') pvaViewStep(1);
  else if (e.key === 'ArrowLeft') pvaViewStep(-1);
  else if (e.key === 'Escape') pvaViewClose();
});

/* ── FLAG SHEET (M4) ────────────────────────────────────── */
const _pvf = { visit: null, pts: [], sel: new Set(), date: null };
async function pvaOpenFlag(visitId, preKey) {
  const { data, error } = await pvaRpc('pv_admin_visit_detail', { p_visit: visitId });
  if (error || !data || data.error) { pvaToast('Could not open the visit.'); return; }
  if (data.status !== 'sent') { pvaToast('Already changed — refreshed.'); pvaLoad(); return; }
  _pvf.visit = visitId; _pvf.date = data.date;
  _pvf.pts = (data.points || []).filter(p => p.mode === 'required' && !p.extra);
  _pvf.sel = new Set(preKey && _pvf.pts.some(p => p.key === preKey) ? [preKey] : []);
  $a('pvaFlagTitle').innerHTML = `Flag · <b>${pvWdDM(data.date, true)}</b>`;
  _pvfRender();
  $a('pvaFlagScrim').classList.remove('pv-hidden');
}
function _pvfRender() {
  const groups = [];
  _pvf.pts.forEach(p => {
    const g = [p.floor, p.room_de].filter(Boolean).join(' · ');
    let gr = groups.find(x => x.g === g);
    if (!gr) { gr = { g, pts: [] }; groups.push(gr); }
    gr.pts.push(p);
  });
  const n = _pvf.sel.size, rest = _pvf.pts.length - n;
  const note = $a('pvaFlagNote') ? $a('pvaFlagNote').value : '';
  $a('pvaFlagBody').innerHTML = `
    <p class="pv-intro" style="margin:0 0 2px;">Which areas need new photos?</p>
    ${groups.map(gr => `<p class="pv-k" style="font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin:10px 0 6px;">${esc(gr.g)}</p>
      <div class="pv-chips">${gr.pts.map(p => `<button class="k-mob-n-chip${_pvf.sel.has(p.key) ? ' selected' : ''}" type="button" aria-pressed="${_pvf.sel.has(p.key)}" onclick="pvaFlagToggle('${p.key}')">${esc(p.de)}</button>`).join('')}</div>`).join('')}
    <label class="pv-k" for="pvaFlagNote" style="display:block;margin:14px 0 4px;">Note (shown to the provider)</label>
    <textarea id="pvaFlagNote" class="pv-field pv-textarea" rows="2" maxlength="500" style="height:auto;padding:8px 9px;">${esc(note)}</textarea>
    <span class="k-note">${n ? `Only ${n === 1 ? 'this area gets' : 'these ' + n + ' areas get'} new photos. The other ${rest} stay done.` : 'Tap the areas that need new photos.'}</span>
    <div class="cc-sec-foot" style="margin-top:14px;">
      <button class="cc-foot-btn" type="button" data-close="pvaFlagScrim">Cancel</button>
      <button class="cc-foot-btn cc-foot-btn--red" type="button" onclick="pvaFlagSend()"${n ? '' : ' disabled style="opacity:.45;"'}>${pvPic('send_redo', 12)}Send redo · ${n}</button>
    </div>
    <button class="pv-dontcount" type="button" onclick="pvaFlagDontCount()">Don’t count this visit</button>`;
}
function pvaFlagToggle(key) {
  if (_pvf.sel.has(key)) _pvf.sel.delete(key); else _pvf.sel.add(key);
  _pvfRender();
}
async function pvaFlagDontCount() {           /* Build 1 · the only extra compared with the kitchen */
  const id = _pvf.visit;
  if (!id || _pvaActBusy) return;
  if (!(await ccConfirm('Don\u2019t count this visit?', 'It is not counted. An invoice already sent goes back to the provider, who sees \u201cNicht gez\u00e4hlt\u201d.', 'Don\u2019t count', true))) return;
  _pvaActBusy = true;
  const { data, error } = await pvaRpc('pv_admin_reject', { p_visit: id });
  _pvaActBusy = false;
  if (error) { pvaToast('No connection — try again.'); return; }
  $a('pvaFlagScrim').classList.add('pv-hidden');
  pvaToast(data && data.error ? 'Already changed — refreshed.' : 'Not counted.');
  pvaLoad();
}
async function pvaFlagSend() {
  if (!_pvf.sel.size || _pvaActBusy) return;
  _pvaActBusy = true;
  const { data, error } = await pvaRpc('pv_admin_flag', { p_visit: _pvf.visit, p_points: Array.from(_pvf.sel), p_note: $a('pvaFlagNote').value.trim() || null });
  _pvaActBusy = false;
  if (error) { pvaToast('No connection — try again.'); return; }
  $a('pvaFlagScrim').classList.add('pv-hidden');
  pvaToast(data && data.error ? 'Already changed — refreshed. (Undo first, then flag.)' : `Redo sent · ${_pvf.sel.size} ${_pvf.sel.size === 1 ? 'area' : 'areas'}.`);
  pvaLoad();
}

/* ── HISTORY (M8) ───────────────────────────────────────── */
const _pvh = { visits: [], next: null, filter: 'all', job: null };
async function pvaOpenHistory() {
  if (!_pvaData || !_pvaData.job) { pvaToast('Create a job first.'); return; }
  $a('pvaHistoryTitle').innerHTML = `History · <b>${esc(_pvaData.job.name)}</b>`;
  if (_pvh.job !== _pvaJob) {
    _pvh.visits = []; _pvh.next = null; _pvh.filter = 'all'; _pvh.job = _pvaJob;
    try { const c = JSON.parse(localStorage.getItem('pvh_copy_' + _pvaJob) || 'null'); if (c) Object.assign(_pvh, c); } catch (e) {}
  }
  if (_pvh.visits && _pvh.visits.length) _pvhRender();        /* last history, shown instantly */
  else $a('pvaHistoryBody').innerHTML = pvaSkeleton();
  pvaSheetOpen('pvaHistoryScrim');
  const { data, error } = await pvaRpc('pv_admin_history', { p_job: _pvaJob, p_before: null, p_months: 3 });
  if (error || !data || data.error) { pvaToast('Could not load the history.'); return; }
  Object.assign(_pvh, { visits: data.visits || [], next: data.next_before, invoices: data.invoices || [], months: data.months || [], today: data.today, monthsLoaded: 3 });
  try { localStorage.setItem('pvh_copy_' + _pvaJob, JSON.stringify({ visits: _pvh.visits.slice(0, 40), next: _pvh.next, invoices: _pvh.invoices, months: _pvh.months, today: _pvh.today, monthsLoaded: 3 })); } catch (e) {}
  _pvhRender();
}
async function pvaHistoryMore() {
  if (!_pvh.next) return;
  const { data, error } = await pvaRpc('pv_admin_history', { p_job: _pvaJob, p_before: _pvh.next, p_months: 6 });
  if (error || !data || data.error) { pvaToast('Could not load more.'); return; }
  _pvh.visits = _pvh.visits.concat(data.visits || []); _pvh.next = data.next_before;
  _pvh.invoices = (data.invoices || []).concat((_pvh.invoices || []).filter(i => !(data.invoices || []).some(x => x.id === i.id)));
  _pvh.months = (_pvh.months || []).concat((data.months || []).filter(m => !(_pvh.months || []).some(x => x.month === m.month)));
  _pvh.monthsLoaded = (_pvh.monthsLoaded || 3) + 6;
  _pvhRender();
}
function pvaHistoryFilter(f) { _pvh.filter = f; _pvhRender(); }
function _pvhRender() {
  const people = Array.from(new Set(_pvh.visits.flatMap(v => v.people || []))).sort();
  const chips = [['all', 'All']].concat(people.map(n => ['p:' + n, n]));   /* History = archive: people only */
  const f = _pvh.filter;
  const list = _pvh.visits.filter(v => f === 'all' ? true
    : f === 'review' ? v.status === 'sent'
    : f === 'issues' ? ['redo', 'missed', 'cancelled_by_provider', 'rejected'].includes(v.status) || (v.counts && v.counts.np) || (v.flagged_names || []).length
    : f === 'inv' ? pvaVisitInvoiceOpen(v)
    : (v.people || []).includes(f.slice(2)));
  $a('pvaHistoryBody').innerHTML = `
    <div class="pv-chips" style="margin-bottom:10px;">${chips.map(c => `<span class="k-mob-n-chip${f === c[0] ? ' selected' : ''}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;" onclick="pvaHistoryFilter('${esc(c[0])}')">${esc(c[1])}</span>`).join('')}</div>
    ${typeof pvaHistoryMoneyHTML === 'function' ? pvaHistoryMoneyHTML(list, _pvh) : pvHistoryHTML(list, true, n => _pvagAvatarByName(n).replace('width:20px;height:20px', 'width:22px;height:22px').replace('font-size:8px', 'font-size:9px'))}
    ${_pvh.next ? `<div class="cc-sec-foot" style="justify-content:center;"><button class="cc-foot-btn" type="button" onclick="pvaHistoryMore()">Load older</button></div>` : ''}`;
}

/* ── CHAT: compose as Casa Castel · delete · photos open the viewer ── */
let _pvaCompose = null;
function pvaMountCompose() {
  if (_pvaCompose || typeof ccCompose !== 'function') return;
  _pvaCompose = ccCompose($a('pvaCompose'), {
    placeholder: 'Message as Casa Castel…', camera: 'live',
    onSend: async ({ text, photo }) => {
      if (!_pvaJob) return false;
      let path = null;
      if (photo) {
        path = `lynn/${_pvaJob}/chat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
        const { error } = await _ctlSupa.storage.from('provider-proofs').upload(path, photo, { contentType: 'image/jpeg', upsert: false });
        if (error) return false;
      }
      const { data, error } = await pvaRpc('pv_admin_message', { p_job: _pvaJob, p_text: text || null, p_path: path, p_visit: null });
      if (error || (data && data.error)) return false;
      pvaLoad();
      return true;
    }
  });
}
async function pvaDeleteMsg(id) {
  const ok = await ccConfirm('Delete this message?', 'It disappears from the chat for both sides. Photos and history stay.', 'Delete', true);
  if (!ok) return;
  const { data, error } = await pvaRpc('pv_admin_delete_message', { p_id: id });
  if (error || (data && data.error)) { pvaToast('Already changed — refreshed.'); }
  pvaLoad();
}

/* ── 12-MONTH PHOTO CLEAN-UP (once a day) ───────────────── */
async function pvaCleanup() {
  const day = ccTodayISO();
  try { if (localStorage.getItem('pva_cleanup_day') === day) return; } catch (e) {}
  const { data, error } = await pvaRpc('pv_admin_cleanup_due', { p_limit: 200 });
  if (error || !Array.isArray(data)) return;
  if (data.length) {
    const { error: e2 } = await _ctlSupa.storage.from('provider-proofs').remove(data);
    if (e2) return;                            /* try again next time */
    await pvaRpc('pv_admin_cleanup_done', { p_paths: data });
  }
  try { localStorage.setItem('pva_cleanup_day', day); } catch (e) {}
}

/* ── TAPS IN THE FEED / HISTORY ─────────────────────────── */
const _pvrSel = {};                                          /* visit → Set of marked point keys */
let _pvrHold = null, _pvrHeld = false;
function _pvrRow(visit) {
  const set = _pvrSel[visit] || new Set();
  const cnt = document.getElementById('pvr-cnt-' + visit);
  const btn = document.getElementById('pvr-redo-' + visit);
  const note = document.getElementById('pvr-note-' + visit);
  if (cnt) cnt.textContent = set.size;
  if (btn) { btn.disabled = !set.size; btn.style.opacity = set.size ? '' : '.45'; }
  if (note) note.style.display = set.size ? '' : 'none';
}
function _pvrToggle(visit, key, el) {
  const set = _pvrSel[visit] = _pvrSel[visit] || new Set();
  if (set.has(key)) { set.delete(key); el.style.outline = ''; el.style.outlineOffset = ''; }
  else { set.add(key); el.style.outline = '2.5px solid #A32D2D'; el.style.outlineOffset = '2px'; }
  _pvrRow(visit);
}
async function pvaTapRedo(visit) {
  const set = _pvrSel[visit];
  if (!set || !set.size || _pvaActBusy) return;
  const note = (document.getElementById('pvr-note-' + visit) || { value: '' }).value;
  _pvaActBusy = true;
  const { data, error } = await pvaRpc('pv_admin_flag', { p_visit: visit, p_points: Array.from(set), p_note: note });
  _pvaActBusy = false;
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data && data.error) pvaToast(data.error === 'closed' ? 'That month is closed — reopen the month first.' : 'Already changed — refreshed.');
  else pvaToast('Redo sent · ' + set.size);
  delete _pvrSel[visit];
  pvaLoad();
}
document.addEventListener('pointerdown', e => {                /* hold a photo = open it */
  const t = e.target.closest('#pvaFeed [data-anchor="sent"] [data-view]');
  if (!t) return;
  _pvrHeld = false;
  clearTimeout(_pvrHold);
  _pvrHold = setTimeout(() => {
    _pvrHeld = true;
    const [visit, key] = t.getAttribute('data-view').split('|');
    pvaView(visit, key);
  }, 450);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => document.addEventListener(ev, () => clearTimeout(_pvrHold)));
document.addEventListener('click', e => {
  const t = e.target.closest('[data-view]');
  if (t && t.closest('#pvaFeed') && t.closest('[data-anchor="sent"]')) {
    if (_pvrHeld) { _pvrHeld = false; return; }                /* the hold already opened the viewer */
    const [visit, key] = t.getAttribute('data-view').split('|');
    _pvrToggle(visit, key, t);
    return;
  }
  if (t && (t.closest('#pvaFeed') || t.closest('#pvaHistoryBody'))) {
    const [visit, key] = t.getAttribute('data-view').split('|');
    pvaView(visit, key);
    return;
  }
  const ph = e.target.closest('#pvaFeed [data-photo]');
  if (ph) pvaViewPhoto(ph.getAttribute('data-photo'), 'Photo', '');
});

/* compose bar mounts once the page is parsed (this file loads after pv-admin.js) */
document.addEventListener('DOMContentLoaded', () => pvaMountCompose());

function _pvrReapply() {                       /* FIX11 · a refreshed chat keeps the photos you marked */
  Object.keys(_pvrSel).forEach(visit => {
    const box = document.querySelector('#pvaFeed [data-anchor="sent"][data-sent="' + visit + '"]');
    if (!box) { delete _pvrSel[visit]; return; }
    box.querySelectorAll('[data-view]').forEach(el => {
      const on = _pvrSel[visit].has(el.getAttribute('data-view').split('|')[1]);
      el.style.outline = on ? '2.5px solid #A32D2D' : ''; el.style.outlineOffset = on ? '2px' : '';
    });
    _pvrRow(visit);
  });
}
