/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PROVIDERS · SERVICE APP (the provider's phone)
   pv-service.js — Phase 1: login · install help · Abmelden ·
   Today screen (strip, card, chat read view).

   Device keys (this app only — never the management keys):
     pv_token · pv_person · pv_person_name · pv_job · pv_job_name
     pv_install_seen (install-help modal shown once per device)

   Depends on: constants.js, cc-german-format.js, pv-core.js
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
  _pvState = null;
  ['pv_token', 'pv_person', 'pv_person_name', 'pv_job_name', 'pv_state_copy'].forEach(k => localStorage.removeItem(k));
  pvCloseScrim('pv-install-scrim');
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

  /* card */
  $id('pv-card').innerHTML = _pvCardHTML(s);
  const card = s.card;
  $id('pv-card').setAttribute('data-turn',
    card && (card.status === 'in_progress' || card.status === 'redo' || (card.status === 'planned' && card.date === s.today)) ? 'turn' : '');

  /* feed */
  $id('pv-feed').innerHTML = pvFeedHTML(s, {});
  const feed = $id('pv-feed');
  feed.scrollTop = feed.scrollHeight;
}

function _pvCardHTML(s) {
  const v = s.card;
  const chipCal = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M4 11h16"></path></svg>';
  const chipCam = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h6a1 1 0 0 1 1 1 2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"></path><circle cx="12" cy="13" r="3"></circle></svg>';

  const lastLine = () => {
    const lv = v && v.last_visit;
    if (!lv || lv.status !== 'done') return '';
    return `<span class="k-note k-note--done">Letzter Termin ${pvDM(lv.date)}: erledigt ✓ · Last visit: done</span>`;
  };

  if (!v) {
    return `
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip">${chipCal}Kein Termin <span class="en">· No visit</span></span>
      </div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">Kein Termin geplant</span>
        <span class="k-mob-week-dates-sm">No visit planned</span>
      </div></div>`;
  }

  const today = v.date === s.today;
  const n = pvDaysUntil(v.date, s.today);
  const counts = v.counts || {};
  const fotos = counts.total ? `${counts.total} Fotos · ${counts.total} photos` : '';

  if (v.status === 'planned' && !today) {
    const inDays = n === 1 ? 'morgen · tomorrow' : `in ${n} Tagen · in ${n} days`;
    return `
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip next">${chipCal}Nächster Termin <span class="en">· Next visit</span></span>
      </div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${v.time ? 'ab ' + pvEsc(v.time) + ' · ' : ''}${inDays}</span>
        ${lastLine()}
      </div></div>`;
  }

  if (v.status === 'planned' && today) {
    return `
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip myturn">${chipCam}Heute <span class="en">· Today</span></span>
      </div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${v.time ? 'ab ' + pvEsc(v.time) : ''}${fotos ? ' · ' + fotos : ''}</span>
        <span class="k-note">Erst putzen, dann fotografieren. · Clean first, then take photos.</span>
      </div></div>`;
  }

  if (v.status === 'in_progress') {
    return `
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip myturn">${chipCam}Heute <span class="en">· Today</span></span>
      </div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">${counts.done || 0} / ${counts.total || 0} · ab ${pvHM(v.started_at)}</span>
      </div></div>`;
  }

  if (v.status === 'sent') {
    return `
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip submitted">↑ Gesendet <span class="en">· Sent</span></span>
      </div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">Gesendet ${pvTs(v.sent_at)} · Casa Castel schaut es an. · Casa Castel is checking.</span>
      </div></div>`;
  }

  if (v.status === 'cancelled_by_provider') {
    return `
      <div class="k-mob-week-top-row">
        <span class="k-mob-status-chip">${chipCal}Abgesagt <span class="en">· Cancelled</span></span>
      </div>
      <div class="k-mob-week-body"><div class="k-mob-week-left">
        <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
        <span class="k-mob-week-dates-sm">Du hast abgesagt. · You cancelled.</span>
      </div></div>`;
  }

  /* redo / done / other states get their full cards in later phases — show the facts */
  return `
    <div class="k-mob-week-top-row">
      <span class="k-mob-status-chip">${chipCal}${pvEsc(v.status)}</span>
    </div>
    <div class="k-mob-week-body"><div class="k-mob-week-left">
      <span class="k-mob-week-room">${pvEsc(pvWdFull(v.date))}</span>
    </div></div>`;
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !localStorage.getItem('pv_token')) return;
    if (Date.now() - _pvLastLoad > 60000) _pvLoad(); else _pvPing();
  });
  setInterval(_pvPing, 60000);

  if (localStorage.getItem('pv_token')) _pvEnterApp(false);
  else _pvFillJobs();
})();
