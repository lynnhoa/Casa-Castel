/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · SERVICE APP (the provider's phone)
   pv-service.js — login · install help · Abmelden · Today screen
   (strip, card, chat read view) · Phase 2: Putzliste view,
   Kann nicht kommen + Rückgängig · Phase 3: Fotos starten /
   Weiter / Nochmal / Trotzdem starten → camera (pv-camera.js).

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
  stripEl.innerHTML = stripHtml;
  stripEl.style.display = stripHtml ? '' : 'none';

  /* card (shared renderer in pv-core.js — Lynn's preview shows the same) */
  const c = pvProviderCardHTML(s);
  $id('pv-card').innerHTML = c.html;
  $id('pv-card').setAttribute('data-turn', c.turn);

  /* camera open → it follows the fresh state (2nd phone, window end, cancel) */
  if (typeof pvCamOnState === 'function') pvCamOnState();

  /* feed */
  $id('pv-feed').innerHTML = pvFeedHTML(s, {});
  const feed = $id('pv-feed');
  feed.scrollTop = feed.scrollHeight;
}

/* ── PUTZLISTE (board P3b) ──────────────────────────────── */
function _pvOpenList() {
  const s = _pvState || _pvLoadCopy();
  if (!s || !s.list) { pvToast('Keine Putzliste · No cleaning list'); return; }
  $id('pv-pl-inner').innerHTML = pvPutzlisteHTML(s.list, s.card);
  $id('pv-pl').classList.remove('pv-hidden');
}

/* ── FOTOS STARTEN · WEITER · NOCHMAL · TROTZDEM STARTEN ── */
async function _pvStartCamera() {
  const v = _pvState && _pvState.card;
  if (!v || _pvBusy) return;
  _pvBusy = true;
  const { data, error } = await pvRpc('pv_start', { p_token: localStorage.getItem('pv_token'), p_visit: v.id });
  _pvBusy = false;
  if (_pvIsAuthError(error)) { _pvToLogin(); return; }
  if (error) { pvToast('Keine Verbindung · No connection'); return; }
  if (data && data.error === 'window') { pvToast('Fotos erst ab dem Vortag · Photos from the day before'); return; }
  if (data && data.error) { pvToast('Schon geändert · Already changed'); _pvLoad(); return; }
  await _pvLoad();
  pvCamOpen((data && data.visit) || v.id);
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
  $id('pv-card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.getAttribute('data-act');
    if (a === 'list') _pvOpenList();
    else if (a === 'cancel') _pvOpenCancel();
    else if (a === 'undo') _pvUndoCancel();
    else if (a === 'start' || a === 'continue' || a === 'redo') _pvStartCamera();
    else if (a === 'unplanned') _pvStartUnplanned();
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
