/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · SERVICE APP (the provider's phone)
   pv-service.js — login · install help · Abmelden · Today screen
   (strip, card, chat read view) · Phase 2: Putzliste view,
   Kann nicht kommen + Rückgängig · Phase 3: Fotos starten /
   Weiter / Nochmal / Trotzdem starten → camera (pv-camera.js) ·
   Phase 4: chat compose, Fehlt etwas?, Verlauf (read-only), redo strip ·
   Phase 6a: invoice blocks + sheet (pv-invoice.js).

   Device keys (this app only — never the management keys):
     pv_token · pv_person · pv_person_name · pv_job · pv_job_name
     pv_install_seen (install-help modal shown once per device)

   Depends on: constants.js, cc-german-format.js, pv-core.js, pv-pics.js,
               pv-putzliste.js
   ───────────────────────────────────────────────────────────── */

let _pvState   = null;    // last pv_state payload
let _pvBusy    = false;
let _pvLastLoad = 0;

const $id = id => document.getElementById(id);

/* ── DEVICE COPY (no blinks: last screen shows instantly) ── */
function _pvSaveCopy(s)  { try { localStorage.setItem('pv_state_copy', JSON.stringify(s)); } catch (e) {} }
function _pvLoadCopy()   { try { return JSON.parse(localStorage.getItem('pv_state_copy') || 'null'); } catch (e) { return null; } }

/* ── SCRIMS ─────────────────────────────────────────────── */
function pvOpenScrim(id)  { $id(id).classList.remove('pv-hidden'); }
function pvCloseScrim(id) { $id(id).classList.add('pv-hidden'); }
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) pvCloseScrim(c.getAttribute('data-close'));
  else if (e.target.classList && e.target.classList.contains('pv-scrim')) e.target.classList.add('pv-hidden');
});

/* ── LOGIN ──────────────────────────────────────────────── */
async function _pvFillJobs() {
  const sel = $id('pv-login-job');
  const { data } = await pvRpc('pv_jobs');
  const jobs = (data || []);
  sel.innerHTML = jobs.length
    ? jobs.map(j => `<option value="${pvEsc(j.id)}">${pvEsc(j.name)}</option>`).join('')
    : '<option value="">—</option>';
  const last = localStorage.getItem('pv_job');
  if (last && jobs.some(j => j.id === last)) sel.value = last;
}

function _pvLoginError(code, extra) {
  const el = $id('pv-login-err'), tx = $id('pv-login-err-text');
  const pw = $id('pv-login-pw');
  let de = '', en = '';
  if (code === 'wrong') {
    de = `Falsches Passwort. Noch ${extra} ${extra === 1 ? 'Versuch' : 'Versuche'}, dann 10 Min. Pause.`;
    en = `Wrong password. ${extra} ${extra === 1 ? 'try' : 'tries'} left, then a 10-min pause.`;
  } else if (code === 'locked') {
    de = `Zu oft falsch. Bitte warte ${extra} Min. und versuche es nochmal.`;
    en = `Too many tries. Please wait ${extra} min and try again.`;
  } else if (code === 'off') {
    de = 'Dieser Zugang ist nicht aktiv. Bitte melde dich bei Casa Castel.';
    en = 'This login is not active. Please contact Casa Castel.';
  } else if (code === 'network') {
    de = 'Keine Verbindung. Bitte versuche es gleich nochmal.';
    en = 'No connection. Please try again in a moment.';
  } else {
    de = 'Anmeldung nicht möglich. Bitte versuche es nochmal.';
    en = 'Login not possible. Please try again.';
  }
  tx.innerHTML = pvEsc(de) + `<span style="display:block;color:#9A8E7E;">${pvEsc(en)}</span>`;
  el.classList.remove('pv-hidden');
  pw.style.borderColor = '#E3A39B';
}
function _pvLoginErrorClear() {
  $id('pv-login-err').classList.add('pv-hidden');
  $id('pv-login-pw').style.borderColor = '';
}

async function _pvDoLogin() {
  if (_pvBusy) return;
  const job = $id('pv-login-job').value;
  const pw  = $id('pv-login-pw').value;
  if (!job) { _pvLoginError('other'); return; }
  _pvBusy = true;
  const btn = $id('pv-login-btn');
  btn.innerHTML = '<b><span class="pv-spin"></span></b><small>Anmelden · Log in</small>';
  const { data, error } = await pvRpc('pv_login', { p_job: job, p_password: pw });
  _pvBusy = false;
  btn.innerHTML = '<b>Anmelden</b><small>Log in</small>';
  if (error)        { _pvLoginError('network'); return; }
  if (data.error)   { _pvLoginError(data.error, data.left != null ? data.left : data.minutes); return; }
  _pvLoginErrorClear();
  localStorage.setItem('pv_token', data.token);
  localStorage.setItem('pv_person', data.person.id);
  localStorage.setItem('pv_person_name', data.person.name);
  localStorage.setItem('pv_job', data.job.id);
  localStorage.setItem('pv_job_name', data.job.name);
  $id('pv-login-pw').value = '';
  _pvEnterApp(true);
}

/* ── FORGOT PASSWORD ────────────────────────────────────── */
function _pvForgotOpen() {
  const jobSel = $id('pv-login-job');
  const jobName = jobSel.options[jobSel.selectedIndex] ? jobSel.options[jobSel.selectedIndex].text : '';
  $id('pv-forgot-body').innerHTML = `
    <p style="font-size:13px;line-height:1.45;color:#3A3530;">Casa Castel bekommt deine Anfrage und schickt dir ein neues Passwort.<span style="display:block;font-size:11.5px;color:#9A8E7E;margin-top:2px;">Casa Castel gets your request and sends you a new password.</span></p>
    <div style="margin-top:14px;">
      <label class="pv-lbl" for="pv-forgot-name">Dein Name <span class="en">Your name</span></label>
      <input id="pv-forgot-name" class="cc-input" type="text" maxlength="40" style="font-family:inherit;" autocomplete="name"/>
    </div>
    <div style="margin-top:12px;">
      <label class="pv-lbl" for="pv-forgot-note">Nachricht (optional) <span class="en">Message (optional)</span></label>
      <textarea id="pv-forgot-note" class="cc-input pv-textarea" maxlength="300" rows="2" style="font-family:inherit;height:auto;padding-top:10px;"></textarea>
    </div>
    <p id="pv-forgot-msg" class="pv-hidden" style="margin-top:12px;padding:9px 12px;border-radius:6px;background:#F5EEE8;border:.5px solid #D4A87A;font-size:12px;line-height:1.4;color:#8C5A30;"></p>
    <button class="pv-big" type="button" id="pv-forgot-send" style="justify-content:center;min-height:52px;margin-top:14px;"><span class="pv-big__txt" style="flex:0 1 auto;align-items:center;"><span class="pv-big__de">Anfrage senden</span><span class="pv-big__en">Send request</span></span></button>
    <p style="text-align:center;font-size:11px;color:#9A8E7E;margin-top:8px;">${pvEsc(jobName)}</p>`;
  $id('pv-forgot-send').onclick = _pvForgotSend;
  pvOpenScrim('pv-forgot-scrim');
}
async function _pvForgotSend() {
  if (_pvBusy) return;
  const name = $id('pv-forgot-name').value.trim();
  const note = $id('pv-forgot-note').value.trim();
  const msg  = $id('pv-forgot-msg');
  const show = (de, en, good) => {
    msg.innerHTML = pvEsc(de) + `<span style="display:block;color:#9A8E7E;">${pvEsc(en)}</span>`;
    msg.style.background = good ? '#EAF3DE' : '#F5EEE8';
    msg.style.borderColor = good ? '#9CC27A' : '#D4A87A';
    msg.style.color = good ? '#27500A' : '#8C5A30';
    msg.classList.remove('pv-hidden');
  };
  if (!name) { show('Bitte gib deinen Namen ein.', 'Please enter your name.', false); return; }
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_request_password', { p_job: $id('pv-login-job').value, p_name: name, p_note: note || null });
  _pvBusy = false;
  if (error)            { show('Keine Verbindung. Bitte versuche es gleich nochmal.', 'No connection. Please try again in a moment.', false); return; }
  if (data === 'ok')    { show('Anfrage gesendet. Casa Castel meldet sich bei dir.', 'Request sent. Casa Castel will get back to you.', true); $id('pv-forgot-send').classList.add('pv-big--off'); $id('pv-forgot-send').disabled = true; return; }
  if (data === 'open')  { show('Deine Anfrage ist schon da. Casa Castel meldet sich bei dir.', 'Your request is already there. Casa Castel will get back to you.', true); return; }
  if (data === 'limit') { show('Zu viele Anfragen heute. Bitte versuche es morgen nochmal.', 'Too many requests today. Please try again tomorrow.', false); return; }
  show('Anfrage nicht möglich. Bitte prüfe deinen Namen.', 'Request not possible. Please check your name.', false);
}

/* ── APP SCREEN ─────────────────────────────────────────── */
function _pvEnterApp(fresh) {
  $id('pv-login-screen').style.display = 'none';
  const app = $id('pv-app');
  app.classList.remove('pv-hidden');
  $id('pv-name-pill').textContent = localStorage.getItem('pv_person_name') || '';
  $id('pv-job-tab').textContent   = localStorage.getItem('pv_job_name') || '';
  const copy = _pvLoadCopy();
  if (copy) _pvRender(copy);
  const installed = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (fresh && !installed && !localStorage.getItem('pv_install_seen')) {
    localStorage.setItem('pv_install_seen', '1');
    pvOpenScrim('pv-install-scrim');
  }
  _pvLoad();
}

function _pvToLogin() {
  if (typeof pvCamKill === 'function') pvCamKill();
  _pvState = null;
  ['pv_token', 'pv_person', 'pv_person_name', 'pv_job_name', 'pv_state_copy'].forEach(k => localStorage.removeItem(k));
  pvCloseScrim('pv-install-scrim');
  pvCloseScrim('pv-cancel-scrim');
  pvCloseScrim('pv-sup-scrim');
  pvCloseScrim('pv-hist-scrim');
  pvCloseScrim('pv-inv-scrim');
  $id('pv-pl').classList.add('pv-hidden');
  $id('pv-app').classList.add('pv-hidden');
  $id('pv-login-screen').style.display = '';
  $id('pv-name-menu').classList.add('pv-hidden');
  _pvFillJobs();
}

async function _pvLoad() {
  const tok = localStorage.getItem('pv_token');
  if (!tok) { _pvToLogin(); return; }
  _pvLastLoad = Date.now();
  const { data, error } = await pvRpc('pv_state', { p_token: tok });
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }   /* this phone was logged out (login off / new password) */
  if (error || !data) { if (!_pvState && !_pvLoadCopy()) pvToast('Keine Verbindung · No connection'); return; }
  _pvState = data;
  _pvSaveCopy(data);
  _pvRender(data);
}

function _pvIsAuthError(err) { return !!err && String(err).indexOf('pv_auth') !== -1; }

/* light check while the app is open: logged out elsewhere → login screen */
async function _pvPing() {
  const tok = localStorage.getItem('pv_token');
  if (!tok || document.hidden) return;
  const { error } = await pvRpc('pv_ping', { p_token: tok });
  if (_pvIsAuthError(error)) _pvToLogin();
}

/* ── RENDER ─────────────────────────────────────────────── */
function _pvRender(s) {
  if (!s) return;
  if (s.person && s.person.name) { $id('pv-name-pill').textContent = s.person.name; localStorage.setItem('pv_person_name', s.person.name); }
  if (s.job && s.job.name)       { $id('pv-job-tab').textContent = s.job.name;      localStorage.setItem('pv_job_name', s.job.name); }

  /* strip */
  const stripEl = $id('pv-strip');
  const stripHtml = pvStripHTML(s.strip, s.today, false);
  pvSetHTML(stripEl, stripHtml);
  stripEl.style.display = stripHtml ? '' : 'none';

  /* card (shared renderer in pv-core.js — Lynn's preview shows the same) */
  const c = pvProviderCardHTML(s);
  pvSetHTML($id('pv-card'), c.html);
  $id('pv-card').setAttribute('data-turn', c.turn);

  /* camera open → it follows the fresh state (2nd phone, window end, cancel) */
  if (typeof pvCamOnState === 'function') pvCamOnState();

  /* feed */
  pvSetFeed($id('pv-feed'), pvFeedHTML(s, {}) + (pvSuppliesOk(s) ? pvSuppliesChipHTML() : ''));
}

/* ── PUTZLISTE (board P3b) ──────────────────────────────── */
function _pvOpenList() {
  const s = _pvState || _pvLoadCopy();
  if (!s || !s.list) { pvToast('Keine Putzliste · No cleaning list'); return; }
  $id('pv-pl-inner').innerHTML = pvPutzlisteHTML(s.list, s.card);
  $id('pv-pl').classList.remove('pv-hidden');
}

/* ── FOTOS STARTEN · WEITER · NOCHMAL · TROTZDEM STARTEN ── */
async function _pvStartCamera(visitId) {
  const v = _pvState && _pvState.card;
  if (!v || _pvBusy) return;
  const vid = visitId || v.id;
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_start', { p_token: localStorage.getItem('pv_token'), p_visit: vid });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  if (data && data.error === 'window') { pvToast('Fotos erst ab dem Vortag · Photos from the day before'); return; }
  if (data && data.error) { pvToast('Schon geändert · Already changed'); _pvLoad(); return; }
  await _pvLoad();
  pvCamOpen((data && data.visit) || vid);
}
async function _pvStartUnplanned() {
  if (_pvBusy) return;
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_start_unplanned', { p_token: localStorage.getItem('pv_token') });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  if (data && data.error) { pvToast('Schon geändert · Already changed'); _pvLoad(); return; }
  await _pvLoad();
  pvCamOpen(data.visit);
}

/* ── CHAT: text + live photo (chat-compose.js, as in the kitchen) ── */
let _pvCompose = null;
function _pvChatVisit() {                    /* chat photos live in a visit folder: the card's, else the latest */
  const s = _pvState;
  if (!s) return null;
  if (s.card && s.card.id) return s.card.id;
  const past = (s.strip || []).filter(v => v.date <= s.today);
  const v = past.length ? past[past.length - 1] : (s.strip || [])[0];
  return v ? v.id : null;
}
function _pvMountCompose() {
  if (_pvCompose || typeof ccCompose !== 'function') return;
  _pvCompose = ccCompose($id('pv-compose'), {
    placeholder: 'Nachricht · Message', camera: 'live',
    onSend: async ({ text, photo }) => {
      const tok = localStorage.getItem('pv_token');
      if (!tok) return false;
      let path = null;
      if (photo) {
        const vid = _pvChatVisit();
        if (!vid) { pvToast('Foto nur mit Termin · Photo only with a visit'); return false; }
        path = `${vid}/chat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
        const up = await pvSupa.storage.from('provider-proofs').upload(path, photo, { contentType: 'image/jpeg', upsert: false });
        if (up && up.error) return false;
      }
      const { data, error } = await pvRpc('pv_message', { p_token: tok, p_text: text || '', p_path: path });
      if (_pvIsAuthError(error)) { _pvToLogin(); return false; }
      if (error || (data && data.error)) return false;
      _pvLoad();
      return true;
    }
  });
}

/* ── FEHLT ETWAS? (board P9) ────────────────────────────── */
let _pvSupSel = new Set(), _pvSupNote = '';
function _pvOpenSupplies() { _pvSupSel = new Set(); _pvSupNote = ''; _pvSupRender(); pvOpenScrim('pv-sup-scrim'); }
function _pvSupRender() {
  const n = _pvSupSel.size;
  $id('pv-sup-body').innerHTML = `
    <p style="font-size:13px;color:#6B5E4E;">Antippen, was fehlt. · Tap what's missing.</p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;">
      ${PV_SUPPLIES.map(it => { const on = _pvSupSel.has(it[0]); return `<button type="button" data-sup="${it[0]}" style="position:relative;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;border:${on ? '1.5px solid #1E1B18' : '1px solid #E0DAD0'};background:#FDFCFA;text-align:left;"><span class="pic pic--${it[3]}" style="width:40px;height:40px;border-radius:12px;">${pvPic(it[4], 24)}</span><span style="line-height:1.2;"><span style="display:block;font-size:13.5px;font-weight:600;color:#1E1B18;">${it[1]}</span><span style="display:block;font-size:10.5px;color:#9A8E7E;">${it[2]}</span></span>${on ? `<span class="pic__ok" style="top:6px;right:6px;">${pvPic('tile_ok', 9)}</span>` : ''}</button>`; }).join('')}
    </div>
    ${_pvSupSel.has('other') ? `<input id="pv-sup-note" class="cc-input" maxlength="200" placeholder="Was fehlt? · What is missing?" value="${pvEsc(_pvSupNote)}" style="margin-top:10px;font-family:inherit;width:100%;"/>` : ''}
    <p style="display:flex;align-items:center;gap:6px;margin-top:12px;font-size:12px;color:#6B5E4E;">${pvPic('sup_info', 14)}Casa Castel sieht es sofort. · Casa Castel sees it right away.</p>
    <button class="pv-big${n ? '' : ' pv-big--off'}" type="button" id="pv-sup-send" style="justify-content:center;margin-top:12px;"${n ? '' : ' disabled'}><span class="pv-big__ico">${pvPic('sup_send', 20)}</span><span class="pv-big__txt" style="flex:0 1 auto;"><span class="pv-big__de">Senden${n ? ' · ' + n : ''}</span><span class="pv-big__en">Send</span></span></button>`;
  const note = $id('pv-sup-note');
  if (note) note.addEventListener('input', () => { _pvSupNote = note.value; });
}
async function _pvSupSend() {
  if (!_pvSupSel.size || _pvBusy) return;
  const note = _pvSupSel.has('other') ? _pvSupNote.trim() : '';
  if (_pvSupSel.has('other') && !note) { pvToast('Bitte kurz schreiben, was fehlt · Please write what is missing'); return; }
  _pvBusy = true;
  const vid = _pvState && _pvState.card ? _pvState.card.id : null;
  const { data, error } = await pvRpc('pv_report', { p_token: localStorage.getItem('pv_token'), p_kind: 'supplies',
    p_payload: { items: Array.from(_pvSupSel), note: note || null }, p_visit: vid });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error || (data && data.error)) { pvToast('Keine Verbindung · No connection'); return; }
  pvCloseScrim('pv-sup-scrim');
  pvToast('Gesendet · Sent');
  _pvLoad();
}

/* ── VERLAUF (her own visits, read-only) ────────────────── */
const _pvHist = { visits: [], next: null };
async function _pvOpenHistory(more) {
  $id('pv-name-menu').classList.add('pv-hidden');
  if (!more) { _pvHist.visits = []; _pvHist.next = null; $id('pv-hist-body').innerHTML = '<p style="padding:14px 2px;font-size:13px;color:#9A8E7E;">Lädt … · Loading …</p>'; pvOpenScrim('pv-hist-scrim'); }
  const { data, error } = await pvRpc('pv_history', { p_token: localStorage.getItem('pv_token'), p_before: more ? _pvHist.next : null, p_months: more ? 6 : 3 });
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error || !data || data.error) { pvToast('Keine Verbindung · No connection'); return; }
  _pvHist.visits = _pvHist.visits.concat(data.visits || []); _pvHist.next = data.next_before;
  $id('pv-hist-body').innerHTML = pvHistoryHTML(_pvHist.visits, false, null)
    + (_pvHist.next ? `<button class="pv-big pv-big--light" type="button" data-more="1" style="justify-content:center;min-height:46px;margin-top:8px;"><span class="pv-big__txt" style="flex:0 1 auto;align-items:center;"><span class="pv-big__de" style="font-size:14px;">Ältere laden</span><span class="pv-big__en">Load older</span></span></button>` : '');
}

/* ── KANN NICHT KOMMEN (board P8) ───────────────────────── */
let _pvCancelReason = null;
function _pvCancelReady() {
  const note = $id('pv-cancel-note');
  const ok = !!_pvCancelReason && (_pvCancelReason !== 'anderes' || note.value.trim() !== '');
  const btn = $id('pv-cancel-send');
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '.45';
}
function _pvOpenCancel() {
  const s = _pvState; const v = s && s.card;
  if (!v || !v.can_cancel) return;
  _pvCancelReason = null;
  _pvSheetTitle('Termin absagen? · Cancel visit?');
  const reasons = [['krank', 'sick', 'Krank', 'Sick'], ['termin', 'other_date', 'Anderer Termin', 'Other plans'], ['anderes', 'other', 'Anderes', 'Other']];
  $id('pv-cancel-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="pic pic--k" style="width:44px;height:44px;border-radius:13px;">${pvPic('cal_big', 26)}</span>
      <div><p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;line-height:1;color:#1E1B18;">${pvEsc(pvWdFull(v.date))}</p>
        <p style="font-size:12px;color:#9A8E7E;margin-top:3px;">${v.time ? 'ab ' + pvEsc(v.time) + ' · ' : ''}${pvEsc((s.job && s.job.name) || '')}</p></div>
    </div>
    <p style="font-size:13px;font-weight:600;color:#1E1B18;margin-top:16px;">Warum? <span style="font-weight:400;color:#9A8E7E;">· Why?</span></p>
    <div style="display:flex;gap:8px;margin-top:8px;">${reasons.map(r => `<button type="button" data-reason="${r[0]}" style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px 10px;border-radius:14px;border:1px solid #E0DAD0;background:#FDFCFA;"><span class="pic pic--np" style="width:48px;height:48px;border-radius:14px;border-style:solid;">${pvPic(r[1], 28)}</span><span style="font-size:13.5px;font-weight:600;color:#1E1B18;line-height:1.15;">${r[2]}</span><span style="font-size:10.5px;color:#9A8E7E;line-height:1.15;">${r[3]}</span></button>`).join('')}</div>
    <textarea id="pv-cancel-note" class="cc-input pv-textarea pv-hidden" rows="2" maxlength="200" placeholder="Kurz erklären · explain briefly" style="font-family:inherit;height:auto;padding-top:10px;margin-top:10px;width:100%;"></textarea>
    <p style="display:flex;align-items:flex-start;gap:6px;margin-top:12px;font-size:12px;line-height:1.4;color:#6B5E4E;">${pvPic('info', 14)}<span>Casa Castel plant einen neuen Termin.<span style="display:block;color:#9A8E7E;">Casa Castel plans a new date.</span></span></p>
    <button type="button" id="pv-cancel-send" disabled style="width:100%;min-height:54px;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:14px;border:none;background:#A32D2D;color:#FFFFFF;opacity:.45;">${pvPic('btn_cancel', 20)}<span style="text-align:left;line-height:1.2;"><span style="display:block;font-size:16px;font-weight:600;">Absagen</span><span style="display:block;font-size:11px;color:#F7C1C1;">Cancel visit</span></span></button>
    <button class="pv-big pv-big--light" type="button" data-close="pv-cancel-scrim" style="justify-content:center;min-height:48px;margin-top:8px;"><span class="pv-big__txt" style="flex:0 1 auto;align-items:center;"><span class="pv-big__de" style="font-size:15px;">Zurück</span><span class="pv-big__en">Back</span></span></button>`;
  $id('pv-cancel-body').querySelectorAll('[data-reason]').forEach(b => b.onclick = () => {
    _pvCancelReason = b.getAttribute('data-reason');
    $id('pv-cancel-body').querySelectorAll('[data-reason]').forEach(x => {
      const on = x === b;
      x.style.border = on ? '1.5px solid #A32D2D' : '1px solid #E0DAD0';
      x.style.background = on ? '#FCEBEB' : '#FDFCFA';
    });
    $id('pv-cancel-note').classList.toggle('pv-hidden', _pvCancelReason !== 'anderes');
    _pvCancelReady();
  });
  $id('pv-cancel-note').addEventListener('input', _pvCancelReady);
  $id('pv-cancel-send').onclick = _pvCancelSend;
  pvOpenScrim('pv-cancel-scrim');
}
function _pvSheetTitle(t) {
  const el = $id('pv-cancel-scrim') && $id('pv-cancel-scrim').querySelector('.cc-modal-title');
  if (el) el.textContent = t;
}
function _pvOpenAbort() {                    /* FIX11 · "Abbrechen": photos deleted, nothing reaches Casa Castel */
  const s = _pvState; const v = s && s.card;
  if (!v || v.status !== 'in_progress') return;
  _pvSheetTitle('Abbrechen? · Stop?');
  $id('pv-cancel-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="pic pic--k" style="width:44px;height:44px;border-radius:13px;">${pvPic('cal_big', 26)}</span>
      <div><p style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:500;line-height:1;color:#1E1B18;">${pvEsc(pvWdFull(v.date))}</p>
        <p style="font-size:12px;color:#9A8E7E;margin-top:3px;">${_pvCovered(v)} von ${(v.counts && v.counts.total) || 0} Fotos · ${pvEsc((s.job && s.job.name) || '')}</p></div>
    </div>
    <p style="font-size:14px;font-weight:600;color:#1E1B18;margin-top:16px;line-height:1.35;">Alle Fotos von diesem Termin werden gelöscht.<span style="display:block;font-weight:400;font-size:12.5px;color:#9A8E7E;">All photos of this visit will be deleted.</span></p>
    <p style="display:flex;align-items:flex-start;gap:6px;margin-top:10px;font-size:12px;line-height:1.4;color:#6B5E4E;">${pvPic('info', 14)}<span>${v.unplanned
      ? 'Der Besuch ohne Termin wird ganz entfernt.<span style="display:block;color:#9A8E7E;">The unplanned visit is removed completely.</span>'
      : 'Der Termin bleibt – du kannst neu starten.<span style="display:block;color:#9A8E7E;">The visit stays – you can start again.</span>'}</span></p>
    <button type="button" id="pv-abort-send" style="width:100%;min-height:54px;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:14px;border:none;background:#A32D2D;color:#FFFFFF;font-family:inherit;cursor:pointer;">${pvPic('btn_cancel', 18)}<span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;"><span style="font-size:15px;font-weight:600;">Ja, abbrechen</span><span style="font-size:11.5px;opacity:.85;">Yes, stop</span></span></button>
    <button class="pv-big pv-big--light" type="button" data-close="pv-cancel-scrim" style="justify-content:center;min-height:48px;margin-top:8px;"><span class="pv-big__txt" style="flex:0 1 auto;align-items:center;"><span class="pv-big__de">Zurück</span><span class="pv-big__en">Back</span></span></button>`;
  $id('pv-abort-send').onclick = _pvAbortSend;
  pvOpenScrim('pv-cancel-scrim');
}
async function _pvAbortSend() {
  const v = _pvState && _pvState.card;
  if (_pvBusy || !v) return;
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_abort', { p_token: localStorage.getItem('pv_token'), p_visit: v.id });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  pvCloseScrim('pv-cancel-scrim');
  if (data && data.error === 'team') pvToast('Andere Fotos sind dabei – schreib Casa Castel. · Someone else\'s photos are in it.');
  else pvToast(data && data.error ? 'Schon geändert · Already changed' : 'Abgebrochen · Stopped');
  _pvLoad();
}
async function _pvCancelSend() {
  const v = _pvState && _pvState.card;
  if (_pvBusy || !v || !_pvCancelReason) return;
  _pvBusy = true;
  const note = $id('pv-cancel-note').value.trim();
  const { data, error } = await pvRpc('pv_cancel_visit', { p_token: localStorage.getItem('pv_token'), p_visit: v.id, p_reason: _pvCancelReason, p_note: note || null });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  pvCloseScrim('pv-cancel-scrim');
  pvToast(data && data.error ? 'Schon geändert · Already changed' : 'Abgesagt · Cancelled');
  _pvLoad();
}
async function _pvUndoCancel() {
  const v = _pvState && _pvState.card;
  if (_pvBusy || !v) return;
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_undo_cancel', { p_token: localStorage.getItem('pv_token'), p_visit: v.id });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  pvToast(data && data.error ? 'Schon geändert · Already changed' : 'Termin bleibt · Visit is back');
  _pvLoad();
}

async function _pvTakeOver() {
  const v = _pvState && _pvState.card;
  if (_pvBusy || !v) return;
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_take_over', { p_token: localStorage.getItem('pv_token'), p_visit: v.id });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  pvToast(data && data.error ? 'Schon geändert · Already changed' : 'Übernommen · Taken over');
  _pvLoad();
}

/* ── BOOT ───────────────────────────────────────────────── */
(function pvBoot() {
  $id('pv-login-btn').onclick = _pvDoLogin;
  $id('pv-login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') _pvDoLogin(); });
  $id('pv-login-pw').addEventListener('input', _pvLoginErrorClear);
  $id('pv-login-eye').onclick = () => {
    const pw = $id('pv-login-pw');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  };
  $id('pv-forgot-link').onclick = _pvForgotOpen;
  $id('pv-name-pill').onclick = () => {
    const m = $id('pv-name-menu');
    m.classList.toggle('pv-hidden');
    $id('pv-name-pill').setAttribute('aria-expanded', m.classList.contains('pv-hidden') ? 'false' : 'true');
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-actions')) $id('pv-name-menu').classList.add('pv-hidden');
  });
  $id('pv-logout-btn').onclick = async () => {
    const tok = localStorage.getItem('pv_token');
    if (tok) pvRpc('pv_logout', { p_token: tok });
    _pvToLogin();
  };
  $id('pv-refresh').onclick = _pvLoad;
  _pvMountCompose();
  $id('pv-hist-btn').onclick = () => _pvOpenHistory(false);
  $id('pv-hist-body').addEventListener('click', e => { if (e.target.closest('[data-more]')) _pvOpenHistory(true); });
  $id('pv-sup-body').addEventListener('click', e => {
    const b = e.target.closest('[data-sup]');
    if (b) { const k = b.getAttribute('data-sup'); if (_pvSupSel.has(k)) _pvSupSel.delete(k); else _pvSupSel.add(k); _pvSupRender(); return; }
    if (e.target.closest('#pv-sup-send')) _pvSupSend();
  });
  $id('pv-feed').addEventListener('click', e => { if (e.target.closest('[data-act="supplies"]')) _pvOpenSupplies(); });
  $id('pv-card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.getAttribute('data-act');
    const run = fn => {                         /* the button waits while its call runs */
      b.disabled = true; b.style.opacity = '.6';
      Promise.resolve(fn()).finally(() => { b.disabled = false; b.style.opacity = ''; });
    };
    if (a === 'list') _pvOpenList();
    else if (a === 'cancel') _pvOpenCancel();
    else if (a === 'abort') _pvOpenAbort();
    else if (a === 'takeover') {                /* tap once = ask, tap again = take over */
      if (b.getAttribute('data-sure') !== '1') {
        b.setAttribute('data-sure', '1');
        b.innerHTML = 'Sicher? Nochmal tippen <span style="font-weight:400;color:#9A8E7E;">· Tap again to take over</span>';
        return;
      }
      run(_pvTakeOver);
    }
    else if (a === 'undo') run(_pvUndoCancel);
    else if (a === 'start' || a === 'continue' || a === 'redo') run(() => _pvStartCamera());
    else if (a === 'redo-other') run(() => _pvStartCamera(_pvState && _pvState.card && _pvState.card.redo_other && _pvState.card.redo_other.id));
    else if (a === 'unplanned') {              /* FIX11: tap once = ask, tap again = start (no accidental visits) */
      if (b.getAttribute('data-sure') !== '1') {
        const lbl = b.querySelector('[data-lbl]') || b;
        const was = lbl.innerHTML;
        b.setAttribute('data-sure', '1');
        lbl.innerHTML = b.getAttribute('data-sure-label') || 'Sicher?';
        setTimeout(() => { if (b.isConnected) { b.removeAttribute('data-sure'); lbl.innerHTML = was; } }, 5000);
        return;
      }
      run(_pvStartUnplanned);
    }
    else if (a === 'supplies') _pvOpenSupplies();
    else if (a === 'inv') pvInvOpen({ visit: b.getAttribute('data-visit') || null, month: b.getAttribute('data-month'), label: b.getAttribute('data-label') });
  });
  $id('pv-pl').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.getAttribute('data-act') === 'pl-close') $id('pv-pl').classList.add('pv-hidden');
    if (b.getAttribute('data-act') === 'muell') {
      const s = _pvState || _pvLoadCopy();
      const url = s && s.list ? pvMuellUrl(s.list.muell) : '';
      if (url) window.open(url, '_blank');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (typeof _cam !== 'undefined' && _cam.open) {           /* camera off in the background, back on return */
      if (document.hidden) _camStopLive(); else _camStartLive().then(_camRender);
    }
    if (document.hidden || !localStorage.getItem('pv_token')) return;
    if (Date.now() - _pvLastLoad > 60000) _pvLoad(); else _pvPing();
  });
  setInterval(_pvPing, 60000);

  if (localStorage.getItem('pv_token')) _pvEnterApp(false);
  else _pvFillJobs();
})();
