/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · LYNN'S APP
   pv-admin.js — shell (gate · tabs with dots · strip · card ·
   chat read view) + People modal + New job + Preview (read-only
   provider view) · Phase 2: planning card states, Agenda tool
   (pv-agenda.js) · Phase 4: review card states + actions, reports,
   chat compose, History (pv-review.js).

   Gate + authenticated client: controlling-auth.js (_ctlSupa,
   ctlGetSession) — the same login as the other management apps.

   Depends on: constants.js, utils.js (esc, ccDialog, ccConfirm,
               ccCopyText), cc-german-format.js, controlling-auth.js,
               pv-core.js
   ───────────────────────────────────────────────────────────── */

let _pvaData    = null;      // last pv_admin_load payload
let _pvaJob     = localStorage.getItem('pva_job') || null;
let _pvaBusy    = false;
let _pvaLastLoad = 0;
let _pvaEditJob = false;     // People modal: job section in edit mode
let _pvaEditPerson = null;   // person id being edited
let _pvaNewPerson = false;   // "+ Person" form open

const $a = id => document.getElementById(id);

/* ── AUTHENTICATED RPC (Lynn's login) ───────────────────── */
async function pvaRpc(fn, args) {
  try {
    const { data, error } = await _ctlSupa.rpc(fn, args || {});
    if (error) return { error: error.message || 'network' };
    return { data };
  } catch (e) { return { error: 'network' }; }
}

/* ── PASSWORD GENERATOR (word-word-NN) ──────────────────── */
const _PV_WORDS = ['sonne','kiwi','wolke','mango','regen','birne','apfel','blume','stern','honig',
  'zebra','tiger','panda','koala','delfin','falke','biene','igel','otter','robbe',
  'minze','salbei','nelke','tulpe','rose','flieder','kirsche','pflaume','traube','melone',
  'berg','fluss','wiese','insel','strand','wald','mond','komet','anker','segel'];
function pvaGenPassword() {
  const w = () => _PV_WORDS[Math.floor(Math.random() * _PV_WORDS.length)];
  let a = w(), b = w();
  while (b === a) b = w();
  return a + '-' + b + '-' + (10 + Math.floor(Math.random() * 90));
}

/* ── BOOT ───────────────────────────────────────────────── */
(async function pvaBoot() {
  const session = await ctlGetSession();
  if (!session) { location.replace('login.html'); return; }
  /* Log out is wired by controlling-auth.js (#logoutBtn → ctlSignOut) */
  $a('pvaRefresh').onclick = () => pvaLoad();
  $a('pvaPreviewBtn').onclick = () => pvaOpenPreview();
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    const shut = id => { $a(id).classList.add('pv-hidden'); if (id === 'pvaAgendaScrim') pvaLoad(); };   /* Agenda closed → card + strip fresh */
    if (c) { shut(c.getAttribute('data-close')); return; }
    if (e.target.classList && e.target.classList.contains('pv-scrim')) shut(e.target.id);
    if (!e.target.closest('.nav-actions')) $a('navProfileMenu').classList.remove('open');
  });
  document.querySelectorAll('.pv-tool').forEach(b => b.onclick = () => {
    const t = b.getAttribute('data-tool');
    if (t === 'people') pvaOpenPeople();
    else if (t === 'agenda') pvaOpenAgenda();
    else if (t === 'history') pvaOpenHistory();
    else pvaToast('The list editor follows with Phase 5.');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - _pvaLastLoad > 60000) pvaLoad();
  });
  $a('pvApp').style.display = '';
  try {                                   /* last view shows at once, fresh data follows */
    const copy = JSON.parse(localStorage.getItem('pva_copy') || 'null');
    if (copy && copy.jobs) { _pvaData = copy; pvaRenderShell(); }
  } catch (e) {}
  if (typeof pvaMountCompose === 'function') pvaMountCompose();
  pvaLoad().then(() => { if (typeof pvaCleanup === 'function') pvaCleanup(); });
})();

function pvaToast(msg) {
  const el = $a('ctToast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

/* ── LOAD + RENDER SHELL ────────────────────────────────── */
async function pvaLoad(jobId) {
  if (jobId !== undefined) _pvaJob = jobId;
  _pvaLastLoad = Date.now();
  const { data, error } = await pvaRpc('pv_admin_load', { p_job: _pvaJob });
  if (error && String(error).indexOf('pv_admin_only') !== -1) { location.replace('login.html'); return; }
  if (error || !data) { pvaToast('No connection — showing the last view.'); return; }
  _pvaData = data;
  if (data.job) { _pvaJob = data.job.id; localStorage.setItem('pva_job', _pvaJob); }
  try { localStorage.setItem('pva_copy', JSON.stringify(data)); } catch (e) {}
  pvaRenderShell();
  if (!$a('pvaPeopleScrim').classList.contains('pv-hidden')) pvaRenderPeople();  // keep the open modal fresh
}

function pvaRenderShell() {
  const d = _pvaData;
  /* tabs */
  const tabs = (d.jobs || []).map(j =>
    `<button class="cc-tab${j.id === (d.job && d.job.id) ? ' active' : ''}${j.dot ? ' cc-tab--dot' : ''}" type="button" onclick="pvaLoad('${j.id}')">${esc(j.name)}</button>`).join('');
  $a('pvaTabs').innerHTML = tabs +
    `<button class="cc-tab cc-tab--add" type="button" aria-label="New job" onclick="pvaOpenNewJob()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg></button>`;

  if (!d.job) {
    $a('pvaStrip').style.display = 'none';
    $a('pvaCardWrap').setAttribute('data-turn', '');
    $a('pvaCard').innerHTML = `<div class="k-mob-week-top-row"><span class="k-mob-status-chip">No jobs yet</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left"><span class="k-mob-week-room">Create the first job with +</span></div></div>`;
    $a('pvaFeed').innerHTML = '';
    $a('pvaReports').innerHTML = '';
    return;
  }

  const s = d.state;
  const stripHtml = pvStripHTML(s.strip, s.today, true);
  $a('pvaStrip').innerHTML = stripHtml;
  $a('pvaStrip').style.display = stripHtml ? '' : 'none';
  const card = _pvaCardHTML(s);
  $a('pvaCard').innerHTML = card.html;
  $a('pvaCardWrap').setAttribute('data-turn', card.turn);
  $a('pvaReports').innerHTML = typeof pvaReportsHTML === 'function' ? pvaReportsHTML(s) : '';
  $a('pvaFeed').innerHTML = pvFeedHTML(s, { en: true, canDelete: true, onDelete: 'pvaDeleteMsg' });
  const feed = $a('pvaFeed');
  feed.scrollTop = feed.scrollHeight;
}

function _pvaNpNote(v) {                   /* "Bad 2 – WC: not possible (occupied)" — red on Lynn's side */
  const why = { besetzt: 'occupied', kaputt: 'broken' };
  const nps = (v.points || []).filter(p => p.np);
  if (!nps.length) return '';
  return `<span class="k-note k-note--flag">${nps.map(p => `${p.room_de && p.room_de !== p.de ? esc(p.room_de) + ' – ' : ''}${esc(p.de)}: not possible (${esc(why[p.np] || p.np_note || 'other')})`).join(' · ')}</span>`;
}
function _pvaCardHTML(s) {
  const v = s.card;
  const cal = pvPic('chip_next', 13);
  if (!v) {
    return { turn: '', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip">${cal}No visit planned</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">Nothing planned yet</span>
        <span class="k-mob-week-dates-sm">Set a rhythm or an extra date in the Agenda.</span>
      </div></div>` };
  }
  const counts = v.counts || {};
  const cov = (counts.done || 0) + (counts.np || 0);
  const who = v.person ? esc(v.person) : 'anyone';
  const extra = v.extra_task && v.extra_task.de ? `<span class="k-note" style="color:#A3512A;">Extra: ${esc(v.extra_task.de)}${v.extra_task.photo ? ' · photo' : ''}</span>` : '';
  const acts = typeof pvaCardActs === 'function' ? pvaCardActs(v, s.today) : '';
  const actsHtml = acts ? `<div class="k-mob-week-acts">${acts}</div>` : '';
  const span = (pvHM(v.first_photo_at || v.started_at) && pvHM(v.sent_at)) ? pvHM(v.first_photo_at || v.started_at) + '–' + pvHM(v.sent_at) : '';
  const reopen = v.reopen_until && new Date(v.reopen_until) > new Date() ? `<span class="k-note">Reopened until ${pvWdDM(String(v.reopen_until).slice(0, 10), true)} ${pvHM(v.reopen_until)}.</span>` : '';
  const body = (left, turn) => ({ turn, html: left + '' });

  if (v.status === 'in_progress') {
    const pct = counts.total ? Math.round(cov / counts.total * 1000) / 10 : 0;
    return { turn: 'turn', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip now"><span class="pv-live"></span>Today · in progress</span><span class="k-mob-week-dates-sm">last photo ${pvHM(v.last_photo_at)}</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
        <span class="k-mob-week-dates-sm">${cov} / ${counts.total || 0} areas · since ${pvHM(v.started_at)}</span>
        <div class="pv-prog"><span style="width:${pct}%"></span></div>${_pvaNpNote(v)}${extra}${reopen}
      </div></div>` };
  }
  if (v.status === 'cancelled_by_provider') {
    const why = { krank: 'sick', termin: 'other plans', anderes: 'other' }[v.cancel_reason] || 'cancelled';
    return { turn: 'redo', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip missed">${pvPic('chip_cancel_by', 13)}Cancelled by ${esc(v.cancelled_person || 'provider')}</span></div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
          <span class="k-mob-week-dates-sm">${v.time ? v.time + ' · ' : ''}reason: ${why}${v.cancel_note ? ' · „' + esc(v.cancel_note) + '“' : ''}</span>
          <span class="k-note k-note--flag">Plan a new date: move it in the Agenda.</span></div>
        <div class="k-mob-week-acts"><button class="k-mob-wact blue" type="button" aria-label="Open Agenda" onclick="pvaOpenAgenda('${v.id}')">${pvPic('agenda', 14)}<span>Agenda</span></button></div>
      </div>` };
  }
  if (v.status === 'planned' && v.date <= s.today) {
    return { turn: 'turn', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip now">${pvPic('chip_now', 13)}${v.date === s.today ? 'Today' : 'Open'} · not started</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
        <span class="k-mob-week-dates-sm">${v.time ? v.time + ' · ' : ''}${who} · no photos yet</span>
        <span class="k-note">${reopen ? '' : 'Closes as Missed after ' + pvWdDM(pvAddDays(v.date, 1), true) + ', 23:59.'}</span>${reopen}${extra}
      </div>${actsHtml}</div>` };
  }
  if (v.status === 'planned') {
    const n = pvDaysUntil(v.date, s.today);
    return { turn: '', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip next">${cal}Next visit</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
        <span class="k-mob-week-dates-sm">${v.time ? v.time + ' · ' : ''}${who} · ${n === 1 ? 'tomorrow' : 'in ' + n + ' days'}</span>${extra}
      </div></div>` };
  }
  if (v.status === 'sent') {
    const due = v.auto_due_at ? `Auto-approves ${pvWdDM(String(v.auto_due_at).slice(0, 10), true)} ${pvHM(v.auto_due_at)}` : 'Waiting for your review.';
    return { turn: 'wait', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip submitted">${pvPic('chip_sent', 13)}${v.unplanned ? 'Unplanned visit' : 'Submitted'}</span><span class="k-mob-week-dates-sm">sent ${pvHM(v.sent_at)}</span></div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
          <span class="k-mob-week-dates-sm">${counts.total || 0} areas${span ? ' · ' + span : ''}${counts.np ? ' · ' + counts.np + ' not possible' : ''}</span>
          ${_pvaNpNote(v)}
          <span class="k-note k-note--wait">${v.unplanned ? 'No visit was planned. Approve to count it.' : due}</span></div>
        ${actsHtml}
      </div>` };
  }
  if (v.status === 'done') {
    return { turn: 'done', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip approved">${pvPic('chip_done', 13)}Done</span></div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
          <span class="k-mob-week-dates-sm">${counts.total || 0} photos${span ? ' · ' + span : ''}</span>
          <span class="k-note k-note--done">Approved ${pvTs(v.done_at)}.</span></div>
        ${actsHtml}
      </div>` };
  }
  if (v.status === 'redo') {
    const fl = (v.points || []).filter(p => p.flagged);
    return { turn: 'redo', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip flagged">${pvPic('chip_flagged', 13)}Redo · ${fl.length} ${fl.length === 1 ? 'area' : 'areas'}</span></div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
          <span class="k-mob-week-dates-sm">${esc(fl.map(p => p.de).join(', '))}</span>
          <span class="k-note k-note--flag">${v.flag_note ? '„' + esc(v.flag_note) + '“ ' : ''}${v.redo_until ? 'Open until ' + pvDM(v.redo_until) + '.' : ''}</span></div>
        ${actsHtml}
      </div>` };
  }
  if (v.status === 'missed') {
    return { turn: 'redo', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip missed">${pvPic('chip_missed', 13)}Missed</span></div>
      <div class="k-mob-week-body">
        <div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
          <span class="k-mob-week-dates-sm">${cov ? cov + ' / ' + (counts.total || 0) + ' photos, not sent' : 'No photos sent'}</span>
          <span class="k-note k-note--flag">Nothing sent by ${pvWdDM(pvAddDays(v.date, 1), true)}, 23:59.</span></div>
        ${actsHtml}
      </div>` };
  }
  if (v.status === 'rejected') {
    return { turn: '', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip" style="background:#EDE8E0;border:1px solid #E0DAD0;color:#6B5E4E;">Not counted</span></div>
      <div class="k-mob-week-body"><div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span>
        <span class="k-note">Rejected unplanned visit — no invoice possible.</span></div></div>` };
  }
  return { turn: '', html: `<div class="k-mob-week-top-row"><span class="k-mob-status-chip">${cal}${esc(v.status)}</span></div>
    <div class="k-mob-week-body"><div class="k-mob-week-left"><span class="k-mob-week-room">${pvWdDM(v.date, true)}</span></div></div>` };
}

/* ── PEOPLE MODAL ───────────────────────────────────────── */
const _PVA_AV = [['#E2EEFC','#1E5A9A'],['#EEE8FB','#5B3FA6'],['#E1F1EA','#2F6B55'],['#FCEFC9','#7A5600'],['#FDE4D0','#8A3E12'],['#F6E3EA','#9A3558']];

function pvaOpenPeople() {
  if (!_pvaData || !_pvaData.job) { pvaToast('Create a job first.'); return; }
  _pvaEditJob = false; _pvaEditPerson = null; _pvaNewPerson = false;
  pvaRenderPeople();
  $a('pvaPeopleScrim').classList.remove('pv-hidden');
}

function pvaRenderPeople() {
  const d = _pvaData, j = d.job;
  $a('pvaPeopleTitle').innerHTML = `People · <b>${esc(j.name)}</b>`;

  /* ── job section ── */
  const modeChip = (val, label) => {
    const sel = (j.next_mode || j.invoice_mode) === val;
    return `<span class="k-mob-n-chip${sel ? ' selected' : ''}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;" onclick="pvaSetMode('${val}')">${label}</span>`;
  };
  const modeNote = j.next_mode && j.next_mode !== j.invoice_mode
    ? `<span class="k-note" style="margin-top:6px;">Switches to ${j.next_mode === 'per_visit' ? 'per visit' : j.next_mode} from ${pvDM(j.next_mode_from)}${String(j.next_mode_from).slice(0,4)} — the open month keeps its rules.</span>` : '';

  let jobHtml;
  if (_pvaEditJob) {
    jobHtml = `
      <div class="pv-kv">
        <div><label class="pv-k" for="pvaJobName">Name (tab)</label><input id="pvaJobName" class="pv-field" value="${esc(j.name)}" maxlength="40"/></div>
        <div><label class="pv-k" for="pvaJobSender">Invoice sender</label><input id="pvaJobSender" class="pv-field" value="${esc(j.sender_name || '')}" maxlength="80" placeholder="company / name"/></div>
      </div>
      <div style="margin-top:10px;"><label class="pv-k" for="pvaJobAddr">Address</label><input id="pvaJobAddr" class="pv-field" value="${esc(j.sender_address || '')}" maxlength="160" placeholder="street, town"/></div>
      <div class="cc-sec-foot"><button class="cc-foot-btn" type="button" onclick="_pvaEditJob=false;pvaRenderPeople()">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaSaveJob()">Save</button></div>`;
  } else {
    jobHtml = `
      <div class="pv-kv">
        <div><p class="pv-k">Name (tab)</p><p class="pv-v">${esc(j.name)}</p></div>
        <div><p class="pv-k">Link</p><p class="pv-v" style="font-size:12.5px;">…vercel.app/providers <button class="cc-foot-btn" type="button" style="margin-left:4px;" onclick="pvaCopy(location.origin + '/providers')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>Copy</button></p></div>
        <div><p class="pv-k">Invoice sender</p><p class="pv-v"${j.sender_name ? '' : ' style="color:#9A8E7E;"'}>${j.sender_name ? esc(j.sender_name) : '+ company / name'}</p></div>
        <div><p class="pv-k">Address</p><p class="pv-v"${j.sender_address ? '' : ' style="color:#9A8E7E;"'}>${j.sender_address ? esc(j.sender_address) : '+ address'}</p></div>
      </div>
      <div style="margin-top:10px;"><p class="pv-k">Invoices</p><div class="pv-chips">${modeChip('per_visit', 'Per visit')}${modeChip('monthly', 'Monthly')}${modeChip('none', 'None')}</div>${modeNote}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;">
        <div><p class="pv-v">Tell tenants</p><p class="pv-k">Next cleaning in the tenant app + reminder the evening before</p></div>
        <span class="pv-toggle${j.tell_tenants ? '' : ' pv-toggle--off'}" role="button" tabindex="0" aria-label="Tell tenants" onclick="pvaToggleTellTenants()"></span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px;padding:8px 10px;border-radius:10px;background:#F5F2ED;">
        <span class="pic pic--c" style="width:30px;height:30px;border-radius:9px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3v4a1 1 0 0 0 1 1h4"></path><path class="pf" d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"></path></svg></span>
        <p style="flex:1;font-size:13px;color:#1E1B18;">Contract <span style="color:#9A8E7E;">· PDF</span></p>
        ${j.contract_path
          ? `<button class="cc-foot-btn" type="button" onclick="pvaOpenContract()">View</button><button class="cc-foot-btn cc-foot-btn--danger" type="button" onclick="pvaDeleteContract()">Delete</button>`
          : `<button class="cc-foot-btn" type="button" onclick="document.getElementById('pvaContractFile').click()">Upload</button>`}
        <input type="file" id="pvaContractFile" accept="application/pdf" style="display:none;" onchange="pvaUploadContract(this)"/>
      </div>
      <div class="cc-sec-foot"><button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvaDeleteJob()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"></path></svg>Delete job</button><button class="cc-foot-btn" type="button" onclick="_pvaEditJob=true;pvaRenderPeople()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4"></path><path d="M13.5 6.5l4 4"></path></svg>Edit</button></div>`;
  }

  /* ── requests ── */
  const reqHtml = (d.requests || []).map(r => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 10px;margin-bottom:4px;border-radius:10px;background:#FDF0D8;border:.5px solid #E8C97A;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;color:#633806;"><circle cx="8" cy="15" r="4"></circle><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2"></path></svg>
      <p style="flex:1;font-size:12.5px;color:#633806;line-height:1.35;">${esc(r.name)} asked for a new password · ${pvTs(r.at)}${r.note ? `<span style="display:block;color:#8A6A2E;">„${esc(r.note)}“</span>` : ''}${r.person_id ? '' : '<span style="display:block;color:#8A6A2E;">No person with this name — check it.</span>'}</p>
      ${r.person_id ? `<button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaNewPassword('${r.person_id}')">New password</button>` : ''}
      <button class="cc-foot-btn" type="button" aria-label="Dismiss" onclick="pvaDismissRequest('${r.id}')">✕</button>
    </div>`).join('');

  /* ── people ── */
  const peopleHtml = (d.people || []).map((p, i) => {
    const av = _PVA_AV[i % _PVA_AV.length];
    const off = !!p.switched_off_at;
    const edit = _pvaEditPerson === p.id;
    const head = edit ? `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="width:32px;height:32px;border-radius:50%;background:${av[0]};color:${av[1]};font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;">${esc((p.name || '?')[0].toUpperCase())}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
          <input class="pv-field" id="pvaPn-${p.id}" value="${esc(p.name)}" maxlength="40" placeholder="Name"/>
          <input class="pv-field" id="pvaPp-${p.id}" value="${esc(p.phone || '')}" maxlength="30" placeholder="Phone (optional)"/>
        </div>
      </div>
      <div class="cc-sec-foot" style="margin-top:8px;"><button class="cc-foot-btn" type="button" onclick="_pvaEditPerson=null;pvaRenderPeople()">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaSavePerson('${p.id}')">Save</button></div>`
    : `
      <div style="display:flex;align-items:center;gap:10px;${off ? 'opacity:.55;' : ''}">
        <span style="width:32px;height:32px;border-radius:50%;background:${av[0]};color:${av[1]};font-size:13px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;">${esc((p.name || '?')[0].toUpperCase())}</span>
        <div style="flex:1;min-width:0;"><p class="pv-v" style="font-weight:500;">${esc(p.name)}${off ? ' <span style="font-weight:400;color:#9A8E7E;">· switched off</span>' : ''}</p>
        <p class="pv-k">${p.phone ? esc(p.phone) : '+ phone'} · ${p.last_login ? 'last login ' + pvTs(p.last_login) : 'never logged in'}</p></div>
        ${off ? `<button class="cc-foot-btn" type="button" onclick="pvaSwitchPerson('${p.id}', false)">Switch on</button>`
              : `<button class="cc-foot-btn" type="button" onclick="_pvaEditPerson='${p.id}';pvaRenderPeople()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4"></path><path d="M13.5 6.5l4 4"></path></svg>Edit</button>`}
      </div>`;
    const body = (edit || off) ? '' : `
      <div class="pv-kv" style="margin-top:8px;">
        <div><p class="pv-k">Password</p><p class="pv-v pv-v--mono" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${esc(p.password || '—')} <button class="cc-foot-btn" type="button" onclick="pvaCopyPw('${p.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>Copy</button></p></div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;"><span class="pv-k">Login on</span><span class="pv-toggle${p.login_on ? '' : ' pv-toggle--off'}" role="button" tabindex="0" aria-label="Login" onclick="pvaFlags('${p.id}', ${!p.login_on}, null)"></span></div>
          <div style="display:flex;align-items:center;justify-content:space-between;"><span class="pv-k">Sends invoices</span><span class="pv-toggle${p.sends_invoices ? '' : ' pv-toggle--off'}" role="button" tabindex="0" aria-label="Sends invoices" onclick="pvaFlags('${p.id}', null, ${!p.sends_invoices})"></span></div>
        </div>
      </div>
      <div class="cc-sec-foot" style="margin-top:8px;">
        <button class="cc-foot-btn cc-foot-btn--danger is-left" type="button" onclick="pvaDeletePerson('${p.id}')">Delete</button>
        <button class="cc-foot-btn" type="button" onclick="pvaShareLogin('${p.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2"></path><path d="M12 14V3M8.5 6.5 12 3l3.5 3.5"></path></svg>Share login</button>
        <button class="cc-foot-btn" type="button" onclick="pvaNewPassword('${p.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"></circle><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2"></path></svg>New</button>
      </div>`;
    return `<div style="padding:10px 0;border-top:.5px solid #E0DAD0;">${head}${body}</div>`;
  }).join('');

  /* ── + Person form ── */
  let addHtml;
  if (_pvaNewPerson) {
    const pw = $a('pvaNpPw') ? $a('pvaNpPw').value : pvaGenPassword();
    addHtml = `
      <div style="padding:10px 0;border-top:.5px solid #E0DAD0;">
        <div class="pv-kv">
          <div><label class="pv-k" for="pvaNpName">Name</label><input id="pvaNpName" class="pv-field" maxlength="40"/></div>
          <div><label class="pv-k" for="pvaNpPhone">Phone (optional)</label><input id="pvaNpPhone" class="pv-field" maxlength="30"/></div>
        </div>
        <div style="margin-top:12px;"><label class="pv-k" for="pvaNpPw">Password (made for you)</label>
          <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
            <input id="pvaNpPw" class="pv-field pv-v--mono" value="${esc(pw)}" style="flex:1;" readonly/>
            <button class="cc-foot-btn" type="button" onclick="pvaCopy(document.getElementById('pvaNpPw').value)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>Copy</button>
            <button class="cc-foot-btn" type="button" onclick="document.getElementById('pvaNpPw').value = pvaGenPassword()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"></circle><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2"></path></svg>New</button>
          </div></div>
        <div class="cc-sec-foot" style="margin-top:12px;"><button class="cc-foot-btn" type="button" onclick="_pvaNewPerson=false;pvaRenderPeople()">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaAddPerson()">Add</button></div>
      </div>`;
  } else {
    addHtml = `<div class="cc-sec-foot"><button class="cc-foot-btn" type="button" onclick="_pvaNewPerson=true;pvaRenderPeople()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>Person</button></div>`;
  }

  $a('pvaPeopleBody').innerHTML = `
    <div class="pv-sec"><p class="pv-sec__t">Job</p>${jobHtml}</div>
    <div class="pv-sec"><p class="pv-sec__t">People</p>${reqHtml}${peopleHtml || '<p class="pv-k" style="padding:8px 0;">No people yet — add the first one below.</p>'}${addHtml}</div>`;
}

/* ── PEOPLE ACTIONS ─────────────────────────────────────── */
async function pvaCopy(text) {
  const ok = await ccCopyText(text);
  pvaToast(ok ? 'Copied.' : 'Could not copy — select it by hand.');
}

function pvaCopyPw(id) {
  const p = (_pvaData.people || []).find(x => x.id === id);
  if (p && p.password) pvaCopy(p.password);
}

async function pvaSetMode(mode) {
  if (_pvaBusy) return; _pvaBusy = true;
  const { data, error } = await pvaRpc('pv_admin_set_mode', { p_job: _pvaJob, p_mode: mode });
  _pvaBusy = false;
  if (error || (data && data.error)) { pvaToast('Could not switch — try again.'); return; }
  await pvaLoad();
  if (data.from) pvaToast('Switches from ' + pvDM(data.from) + String(data.from).slice(0, 4) + ' — the open month keeps its rules.');
}

async function pvaToggleTellTenants() {
  const j = _pvaData.job;
  const { data, error } = await pvaRpc('pv_admin_save_job', { p_job: j.id, p_name: j.name, p_sender_name: j.sender_name, p_sender_address: j.sender_address, p_tell_tenants: !j.tell_tenants });
  if (error || (data && data.error)) { pvaToast('Could not save — try again.'); return; }
  pvaLoad();
}

async function pvaSaveJob() {
  const name = $a('pvaJobName').value.trim();
  if (!name) { pvaToast('The job needs a name.'); return; }
  const { data, error } = await pvaRpc('pv_admin_save_job', { p_job: _pvaJob, p_name: name, p_sender_name: $a('pvaJobSender').value, p_sender_address: $a('pvaJobAddr').value, p_tell_tenants: _pvaData.job.tell_tenants });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data.error === 'name_taken') { pvaToast('A job with this name already exists.'); return; }
  if (data.error) { pvaToast('Could not save — try again.'); return; }
  _pvaEditJob = false;
  pvaLoad();
}

async function pvaDeleteJob() {
  const j = _pvaData.job;
  const ok = await ccConfirm('Delete job?', `“${esc(j.name)}” disappears from the tabs and its logins stop. Invoices and history are kept.`, 'Delete job', true);
  if (!ok) return;
  const { data, error } = await pvaRpc('pv_admin_delete_job', { p_job: j.id });
  if (error || (data && data.error)) { pvaToast('Could not delete — try again.'); return; }
  $a('pvaPeopleScrim').classList.add('pv-hidden');
  _pvaJob = null;
  pvaLoad();
}

/* contract PDF (private bucket, contracts/ folder) */
async function pvaUploadContract(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.type !== 'application/pdf') { pvaToast('Please choose a PDF.'); return; }
  const path = 'contracts/' + _pvaJob + '.pdf';
  const { error } = await _ctlSupa.storage.from('provider-invoices').upload(path, file, { upsert: true, contentType: 'application/pdf' });
  if (error) { pvaToast('Upload failed — try again.'); return; }
  const r = await pvaRpc('pv_admin_set_contract', { p_job: _pvaJob, p_path: path });
  if (r.error || (r.data && r.data.error)) { pvaToast('Saved the file but not the link — try again.'); return; }
  pvaLoad();
}
async function pvaOpenContract() {
  const { data, error } = await _ctlSupa.storage.from('provider-invoices').createSignedUrl(_pvaData.job.contract_path, 300);
  if (error || !data || !data.signedUrl) { pvaToast('Could not open the contract.'); return; }
  window.open(data.signedUrl, '_blank');
}
async function pvaDeleteContract() {
  const ok = await ccConfirm('Delete contract?', 'The PDF is removed from the job.', 'Delete', true);
  if (!ok) return;
  const path = _pvaData.job.contract_path;
  await pvaRpc('pv_admin_set_contract', { p_job: _pvaJob, p_path: null });
  try { await _ctlSupa.storage.from('provider-invoices').remove([path]); } catch (e) {}
  pvaLoad();
}

async function pvaSavePerson(id) {
  const name = $a('pvaPn-' + id).value.trim();
  if (!name) { pvaToast('The person needs a name.'); return; }
  const { data, error } = await pvaRpc('pv_admin_save_person', { p_person: id, p_name: name, p_phone: $a('pvaPp-' + id).value });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data.error === 'name_taken') { pvaToast('Someone in this job already has this name.'); return; }
  if (data.error) { pvaToast('Could not save — try again.'); return; }
  _pvaEditPerson = null;
  pvaLoad();
}

async function pvaFlags(id, loginOn, sendsInvoices) {
  const { data, error } = await pvaRpc('pv_admin_set_person_flags', { p_person: id, p_login_on: loginOn, p_sends_invoices: sendsInvoices });
  if (error || (data && data.error)) { pvaToast('Could not save — try again.'); return; }
  if (loginOn === false) pvaToast('Login off — that phone is logged out.');
  pvaLoad();
}

async function pvaNewPassword(personId) {
  const p = (_pvaData.people || []).find(x => x.id === personId);
  if (!p) return;
  let pw = pvaGenPassword();
  for (let tries = 0; tries < 5; tries++) {
    const { data, error } = await pvaRpc('pv_admin_new_password', { p_person: personId, p_password: pw });
    if (error) { pvaToast('No connection — try again.'); return; }
    if (data.error === 'pw_taken') { pw = pvaGenPassword(); continue; }
    if (data.error) { pvaToast('Could not set the password — try again.'); return; }
    await ccDialog({
      icon: 'ti-key', modal: true,
      title: 'New password · ' + esc(p.name),
      body: `<div class="cc-dlg__pw"><span class="cc-dlg__pwtxt">${esc(data.password)}</span>
               <button type="button" class="cc-dlg__copy" aria-label="Copy password"><i class="ti ti-copy" aria-hidden="true"></i><span>Copy</span></button></div>
             Old phones are logged out. It stays visible in the People card.`,
      actions: [{ label: 'Done', primary: true, value: true }],
      onOpen: ov => {
        const btn = ov.querySelector('.cc-dlg__copy');
        btn.addEventListener('click', async () => {
          const ok = await ccCopyText(data.password);
          btn.innerHTML = ok ? '<i class="ti ti-check" aria-hidden="true"></i><span>Copied</span>' : '<i class="ti ti-copy" aria-hidden="true"></i><span>Select it</span>';
        });
      }
    });
    pvaLoad();
    return;
  }
  pvaToast('Could not find a free password — try again.');
}

async function pvaDeletePerson(id) {
  const p = (_pvaData.people || []).find(x => x.id === id);
  if (!p) return;
  if (p.has_history) {
    const off = await ccConfirm('„' + esc(p.name) + '“ has history', 'Photos, visits or messages carry this name, so the person cannot be deleted. Switch the login off instead — the history keeps the name.', 'Switch off', false);
    if (off) pvaSwitchPerson(id, true);
    return;
  }
  const ok = await ccConfirm('Delete ' + esc(p.name) + '?', 'The person and the password are removed.', 'Delete', true);
  if (!ok) return;
  const { data, error } = await pvaRpc('pv_admin_delete_person', { p_person: id });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data.error === 'has_history') { pvaToast('Has history by now — switch the login off instead.'); pvaLoad(); return; }
  if (data.error) { pvaToast('Could not delete — try again.'); return; }
  pvaLoad();
}

async function pvaSwitchPerson(id, off) {
  const { data, error } = await pvaRpc('pv_admin_switch_person', { p_person: id, p_off: off });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data.error === 'name_taken') { pvaToast('Someone active already has this name — rename first.'); return; }
  if (data.error) { pvaToast('Could not switch — try again.'); return; }
  pvaLoad();
}

async function pvaShareLogin(id) {
  const p = (_pvaData.people || []).find(x => x.id === id);
  if (!p) return;
  const text = 'Casa Castel · ' + _pvaData.job.name + '\n' + location.origin + '/providers\nPasswort · password: ' + (p.password || '');
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  pvaCopy(text);
}

async function pvaAddPerson() {
  const name = $a('pvaNpName').value.trim();
  const pw = $a('pvaNpPw').value.trim();
  if (!name) { pvaToast('The person needs a name.'); return; }
  const { data, error } = await pvaRpc('pv_admin_add_person', { p_job: _pvaJob, p_name: name, p_phone: $a('pvaNpPhone').value, p_password: pw });
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data.error === 'name_taken') { pvaToast('Someone in this job already has this name.'); return; }
  if (data.error === 'pw_taken') { $a('pvaNpPw').value = pvaGenPassword(); pvaToast('Password was taken — here is a new one.'); return; }
  if (data.error) { pvaToast('Could not add — try again.'); return; }
  _pvaNewPerson = false;
  pvaLoad();
}

async function pvaDismissRequest(id) {
  await pvaRpc('pv_admin_dismiss_request', { p_id: id });
  pvaLoad();
}

/* ── NEW JOB ────────────────────────────────────────────── */
function pvaOpenNewJob() {
  const lists = (_pvaData && _pvaData.lists) || [];
  const jobName = _pvaData && _pvaData.job ? _pvaData.job.name : '';
  $a('pvaNewJobBody').innerHTML = `
    <div class="pv-kv">
      <div><label class="pv-k" for="pvaNjName">Job name (tab)</label><input id="pvaNjName" class="pv-field" maxlength="40"/></div>
      <div><label class="pv-k" for="pvaNjPerson">First person</label><input id="pvaNjPerson" class="pv-field" maxlength="40"/></div>
    </div>
    <div style="margin-top:12px;"><label class="pv-k" for="pvaNjPw">Password (made for you)</label>
      <div style="display:flex;gap:6px;align-items:center;margin-top:2px;">
        <input id="pvaNjPw" class="pv-field pv-v--mono" value="${esc(pvaGenPassword())}" style="flex:1;" readonly/>
        <button class="cc-foot-btn" type="button" onclick="pvaCopy(document.getElementById('pvaNjPw').value)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>Copy</button>
        <button class="cc-foot-btn" type="button" onclick="document.getElementById('pvaNjPw').value = pvaGenPassword()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"></circle><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2"></path></svg>New</button>
      </div></div>
    <div style="margin-top:12px;"><p class="pv-k">Invoices</p><div class="pv-chips" id="pvaNjMode">
      <span class="k-mob-n-chip selected" data-v="per_visit" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">Per visit</span>
      <span class="k-mob-n-chip" data-v="monthly" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">Monthly</span>
      <span class="k-mob-n-chip" data-v="none" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">None</span>
    </div></div>
    <div style="margin-top:12px;"><p class="pv-k">List</p><div class="pv-chips" id="pvaNjList">
      <span class="k-mob-n-chip selected" data-v="" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">Start empty</span>
      ${lists.map(l => `<span class="k-mob-n-chip" data-v="${l.id}" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">Copy ${esc(jobName)}${lists.length > 1 ? ' · ' + esc(l.name) : ''}</span>`).join('')}
    </div></div>
    <span class="k-note" style="margin-top:12px;">The tab and its login at /providers appear right away. Agenda and list follow next.</span>
    <div class="cc-sec-foot" style="margin-top:16px;"><button class="cc-foot-btn" type="button" data-close="pvaNewJobScrim">Cancel</button><button class="cc-foot-btn cc-foot-btn--save" type="button" onclick="pvaCreateJob()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>Create</button></div>`;
  ['pvaNjMode', 'pvaNjList'].forEach(gid => {
    $a(gid).querySelectorAll('.k-mob-n-chip').forEach(c => c.onclick = () => {
      $a(gid).querySelectorAll('.k-mob-n-chip').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
    });
  });
  $a('pvaNewJobScrim').classList.remove('pv-hidden');
}

async function pvaCreateJob() {
  if (_pvaBusy) return;
  const name = $a('pvaNjName').value.trim();
  if (!name) { pvaToast('The job needs a name.'); return; }
  const mode = $a('pvaNjMode').querySelector('.selected').getAttribute('data-v');
  const copy = $a('pvaNjList').querySelector('.selected').getAttribute('data-v') || null;
  _pvaBusy = true;
  const { data, error } = await pvaRpc('pv_admin_create_job', { p_name: name, p_person: $a('pvaNjPerson').value.trim() || null, p_password: $a('pvaNjPw').value.trim(), p_mode: mode, p_copy_list: copy });
  _pvaBusy = false;
  if (error) { pvaToast('No connection — try again.'); return; }
  if (data.error === 'name_taken') { pvaToast('A job with this name already exists.'); return; }
  if (data.error === 'pw_taken' || data.error === 'pw_invalid') { $a('pvaNjPw').value = pvaGenPassword(); pvaToast('Password problem — here is a new one, press Create again.'); return; }
  if (data.error) { pvaToast('Could not create — try again.'); return; }
  $a('pvaNewJobScrim').classList.add('pv-hidden');
  pvaLoad(data.job_id);
}

/* ── PREVIEW (read-only provider view) ──────────────────── */
let _pvaPreviewPerson = null;
async function pvaOpenPreview(personId) {
  if (!_pvaData || !_pvaData.job) { pvaToast('Create a job first.'); return; }
  const people = (_pvaData.people || []).filter(p => !p.switched_off_at);
  if (personId === undefined) personId = _pvaPreviewPerson && people.some(p => p.id === _pvaPreviewPerson) ? _pvaPreviewPerson : (people[0] ? people[0].id : null);
  _pvaPreviewPerson = personId;
  const { data, error } = await pvaRpc('pv_admin_preview', { p_job: _pvaJob, p_person: personId });
  if (error || !data || data.error) { pvaToast('Could not load the preview.'); return; }
  const s = data;
  const chips = people.length ? `<div class="pv-chips" style="padding:8px 14px;background:var(--cc-white);border-bottom:.5px solid var(--cc-rule);margin:0;">
      ${people.map(p => `<span class="k-mob-n-chip${p.id === personId ? ' selected' : ''}" style="cursor:pointer;" onclick="pvaOpenPreview('${p.id}')">${esc(p.name)}</span>`).join('')}</div>` : '';
  const stripHtml = pvStripHTML(s.strip, s.today, false);
  const pc = pvProviderCardHTML(s);                         /* the provider's own card renderer */
  $a('pvaPreviewBody').innerHTML = `${chips}
    <div style="padding:8px 14px;background:#FDF0D8;border-bottom:.5px solid #E8C97A;font-size:11px;color:#633806;">What ${s.person ? esc(s.person.name) : 'the provider'} sees · read only</div>
    <div id="pvaPreviewScreen">
      <div class="cc-header"><nav class="cc-nav"><span class="cc-nav__logo">Casa Castel</span>
        <div class="nav-actions"><button class="nav-role-pill" type="button">${esc((s.person && s.person.name) || '—')}</button></div></nav>
        <div class="cc-tabs"><button class="cc-tab active" type="button">${esc(s.job.name)}</button></div></div>
      ${stripHtml ? `<div class="k-mob-rot">${stripHtml}</div>` : ''}
      <div class="k-mob-week" data-turn="${pc.turn}">${pc.html}</div>
      <div class="k-mob-chat" style="min-height:140px;"><div class="k-mob-chat-hdr"><span class="k-mob-chat-lbl">Fotos &amp; Chat · Photos &amp; chat</span></div>
        <div class="k-mob-feed" style="display:flex;flex-direction:column;justify-content:flex-end;">${pvFeedHTML(s, {})}</div></div>
    </div>`;
  $a('pvaPreviewScreen').querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = true; el.style.pointerEvents = 'none'; });
  $a('pvaPreviewScrim').classList.remove('pv-hidden');
}
