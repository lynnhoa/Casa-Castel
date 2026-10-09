/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PASSWORD REQUESTS + ROOM PASSWORDS (management app)
   pw-requests-admin.js   (landlord.html, after utils.js, before tab-tenants.js)

   · Banner under the tabs while a request is open → sheet with every
     request: what the tenant typed next to your Tenants tab, match
     badge, Send password / Decline (+ "send a new password instead")
   · Room passwords: readable for you, shown in the Tenants card next to
     Reset pw (ccRoomPwLineHTML) with a copy button
   · Your push for password requests (12:00–20:00): switch in the sheet
   Needs PASSWORDS.sql (your login only: pw_requests_list / _approve /
   _decline, room_passwords_all, admin_push_register).
   ───────────────────────────────────────────────────────────── */

const CC_ROOM_PW = {};          // room → current readable password
const CC_ADMIN_VAPID = 'BE2AxWBOQCC02UHpV0UlzmZWwY-Ln2MrqhQG7w12Uql78fQhlZZgIaYncl_SxKGpBceAHzt9T3HF-CV54FV2MSQ';

function _pwaEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _pwaDate(iso) {                       // 2026-10-15 / timestamp → 15.10.2026
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (isNaN(d)) return String(iso);
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}
function _pwaWhen(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '. · ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ══ ROOM PASSWORDS (Tenants card) ═══════════════════════════ */
function ccRoomPwLineHTML(room) {
  const r = _pwaEsc(room);
  return `<div class="tn-pw-test pwa-pwline"><i class="ti ti-key"></i>
    <span>Tenant-app password <b class="pwa-pw" data-cc-pw="${r}">…</b></span>
    <button type="button" class="tn-btn tn-btn-sm" data-cc-pw-copy="${r}"><i class="ti ti-copy"></i> Copy</button></div>`;
}
function ccRoomPwInline(room) {
  return ` · <b class="pwa-pw" data-cc-pw="${_pwaEsc(room)}">…</b>`;
}
function ccPwApply() {
  document.querySelectorAll('[data-cc-pw]').forEach(el => {
    const pw = CC_ROOM_PW[el.dataset.ccPw];
    el.textContent = pw || 'older password, not shown';
    el.classList.toggle('pwa-pw--none', !pw);
  });
  document.querySelectorAll('[data-cc-pw-copy]').forEach(b => { b.style.display = CC_ROOM_PW[b.dataset.ccPwCopy] ? '' : 'none'; });
}
function ccPwRemember(room, pw) { if (room && pw) { CC_ROOM_PW[room] = pw; ccPwApply(); } }
async function ccRoomPwLoad() {
  if (typeof sbL === 'undefined' || !sbL) return;
  try {
    const { data, error } = await sbL.rpc('room_passwords_all');
    if (error) return;
    Object.keys(CC_ROOM_PW).forEach(k => delete CC_ROOM_PW[k]);
    Object.assign(CC_ROOM_PW, data || {});
    ccPwApply();
  } catch (e) {}
}

/* ══ PASSWORD REQUESTS ════════════════════════════════════════ */
let _pwaList = [];
let _pwaJustSent = {};          // id → password shown after Send (this session)

const PWA_MATCH = {
  ok:           { cls: 'ok',   icon: '✅', text: () => 'Matches the current tenant' },
  name_differs: { cls: 'warn', icon: '⚠️', text: () => 'Birthday matches — name differs' },
  no_birthday:  { cls: 'warn', icon: '❔', text: () => 'Name matches — no birthday on file' },
  next:         { cls: 'info', icon: '🕓', text: d => 'Next tenant · moves in ' + _pwaDate(d && d.move_in) },
  former:       { cls: 'bad',  icon: '⛔', text: d => 'Former tenant' + (d && d.move_out ? ' · moved out ' + _pwaDate(d.move_out) : '') },
  no_match:     { cls: 'bad',  icon: '❌', text: () => 'No match' },
};
const PWA_STATUS = {
  approved: 'Sent · waiting for pickup', done: 'Logged in ✓', declined: 'Declined', expired: 'Pickup expired', pending: 'Open',
};

function _pwaOpen() { return _pwaList.filter(q => q.status === 'pending'); }

function _pwaBanner() {
  let b = document.getElementById('pwaBanner');
  const open = _pwaOpen();
  if (!open.length) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.type = 'button'; b.id = 'pwaBanner'; b.className = 'pwa-banner';
    b.addEventListener('click', ccPwRequestsOpen);
    const hdr = document.querySelector('.cc-header');
    if (hdr) hdr.appendChild(b); else document.body.prepend(b);
  }
  const who = open.length === 1
    ? `${_pwaEsc(open[0].room)} · ${_pwaEsc([open[0].first_name, open[0].last_name].filter(Boolean).join(' '))}`
    : `${open.length} requests`;
  b.innerHTML = `<span>🔑 Password request · ${who}</span><span class="pwa-banner__go">Review ›</span>`;
}

function _pwaCardHtml(q) {
  const d = q.match_detail || {};
  const m = PWA_MATCH[q.match_level] || PWA_MATCH.no_match;
  const typedName = [q.first_name, q.last_name].filter(Boolean).join(' ');
  const recName = d.name || '—', recBday = d.birthday || '—';
  const sent = _pwaJustSent[q.id];
  let actions;
  if (q.status !== 'pending') {
    actions = sent
      ? `<div class="pwa-sent">Sent ✓ — it shows on the tenant's login page now.
           <div class="pwa-sent__pw"><b>${_pwaEsc(sent)}</b>
           <button type="button" class="tn-btn tn-btn-sm" data-pwa-copytxt="${_pwaEsc(sent)}"><i class="ti ti-copy"></i> Copy</button></div></div>`
      : `<p class="pwa-state">${_pwaEsc(PWA_STATUS[q.status] || q.status)}</p>`;
  } else if (q.locked_until) {
    actions = `<p class="pwa-note">Moves in ${_pwaDate(q.locked_until)} — you can send the password from that day (one password per room).</p>
      <button type="button" class="cc-btn cc-btn--ghost" data-pwa="decline" data-id="${q.id}">Decline</button>`;
  } else {
    actions = `${q.readable ? '' : `<p class="pwa-note">This room has no readable password yet → a new one is created. The room's other phones are logged out once.</p>`}
      <div class="pwa-btns">
        <button type="button" class="cc-btn cc-btn--primary" data-pwa="send" data-id="${q.id}">${q.readable ? 'Send password' : 'Create &amp; send password'}</button>
        <button type="button" class="cc-btn cc-btn--secondary" data-pwa="decline" data-id="${q.id}">Decline</button>
      </div>
      ${q.readable ? `<button type="button" class="pwa-link" data-pwa="sendnew" data-id="${q.id}">Send a new password instead</button>` : ''}`;
  }
  return `<div class="pwa-card${q.status === 'pending' ? '' : ' pwa-card--done'}">
    <div class="pwa-card__top">
      <span class="pwa-room">${_pwaEsc(q.room)}</span>
      <span class="pwa-kind">${q.kind === 'first' ? 'First time' : 'Forgot password'}</span>
      <span class="pwa-time">${_pwaWhen(q.created_at)}</span>
    </div>
    ${q.message ? `<p class="pwa-msg">“${_pwaEsc(q.message)}”</p>` : ''}
    <table class="pwa-cmp">
      <tr><th></th><th>Typed</th><th>Tenants tab</th></tr>
      <tr><td>Name</td><td>${_pwaEsc(typedName)}</td><td>${_pwaEsc(recName)}</td></tr>
      <tr><td>Birthday</td><td>${_pwaEsc(q.birthday)}</td><td>${_pwaEsc(recBday)}</td></tr>
    </table>
    <p class="pwa-match pwa-match--${m.cls}">${m.icon} ${_pwaEsc(m.text(d))}</p>
    ${actions}
  </div>`;
}

function _pwaSheet() {
  let o = document.getElementById('pwaModal');
  if (o) return o;
  o = document.createElement('div');
  o.className = 'cc-modal-overlay'; o.id = 'pwaModal';
  o.innerHTML = `<div class="cc-modal-sheet" style="max-height:88vh;max-height:88svh;">
      <div class="cc-modal-hdr"><span class="cc-modal-title">Password requests</span>
        <button class="cc-modal-close" type="button" data-pwa-close>✕</button></div>
      <div class="cc-modal-body" id="pwaBody" style="overflow-y:auto;"></div></div>`;
  document.body.appendChild(o);
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-pwa-close]')) o.classList.remove('open'); });
  return o;
}

function _pwaRender() {
  _pwaBanner();
  const body = document.getElementById('pwaBody');
  if (!body) return;
  const open = _pwaOpen();
  const sentNow = _pwaList.filter(q => q.status !== 'pending' && _pwaJustSent[q.id]);
  const rest = _pwaList.filter(q => q.status !== 'pending' && !_pwaJustSent[q.id]);
  const pushOn = localStorage.getItem('cc_admin_push') === '1';
  body.innerHTML = `
    <button type="button" class="pwa-push" data-pwa="push">🔔 Notify me 12:00–20:00 · <b>${pushOn ? 'On' : 'Off'}</b></button>
    ${open.length || sentNow.length ? [...open, ...sentNow].map(_pwaCardHtml).join('')
      : '<p class="cc-note" style="padding:8px 0 4px;">No open requests. 🎉</p>'}
    ${rest.length ? `<details class="pwa-hist"><summary>Last 30 days · ${rest.length}</summary>
      ${rest.map(q => `<div class="pwa-hist__row"><span>${_pwaEsc(q.room)} · ${_pwaEsc([q.first_name, q.last_name].filter(Boolean).join(' '))}</span>
        <span>${_pwaEsc(PWA_STATUS[q.status] || q.status)} · ${_pwaWhen(q.created_at)}</span></div>`).join('')}</details>` : ''}`;
}

async function ccPwRequestsLoad() {
  if (typeof sbL === 'undefined' || !sbL) return;
  try {
    const { data, error } = await sbL.rpc('pw_requests_list', { p_days: 30 });
    if (error) return;
    _pwaList = Array.isArray(data) ? data : [];
    _pwaRender();
    if (typeof _tnRenderIfChanged === 'function') _tnRenderIfChanged();   // tenant card: "request waiting"
  } catch (e) {}
}
function ccPwRequestsOpen() {
  _pwaSheet().classList.add('open');
  _pwaRender();
  ccPwRequestsLoad();
}

async function _pwaSend(id, makeNew) {
  const q = _pwaList.find(x => x.id === id); if (!q) return;
  if (makeNew && typeof ccDialog === 'function') {
    const ok = await ccDialog({ icon: 'ti-key', title: 'Send a new password?',
      body: `${_pwaEsc(q.room)} gets a new password. All phones of this room are logged out and the old password stops working.`,
      actions: [{ label: 'Cancel', value: false }, { label: 'New password', primary: true, value: true }] });
    if (!ok) return;
  }
  const btns = document.querySelectorAll(`[data-id="${id}"]`); btns.forEach(b => { b.disabled = true; });
  const { data, error } = await sbL.rpc('pw_request_approve', { p_id: id, p_new: !!makeNew });
  if (error) {
    btns.forEach(b => { b.disabled = false; });
    const msg = /next_locked/.test(error.message) ? 'The next tenant can get the password from the move-in day.'
              : /not_pending/.test(error.message) ? 'This request was already handled.' : error.message;
    if (typeof ccDialog === 'function') ccDialog({ title: 'Not sent', body: _pwaEsc(msg) });
    ccPwRequestsLoad();
    return;
  }
  _pwaJustSent[id] = data.password;
  ccPwRemember(q.room, data.password);
  if (typeof _tnLoadPwDates === 'function') await _tnLoadPwDates();         // tenant card: "App · given …"
  await ccPwRequestsLoad();
}
async function _pwaDecline(id) {
  const q = _pwaList.find(x => x.id === id); if (!q) return;
  if (typeof ccDialog === 'function') {
    const ok = await ccDialog({ icon: 'ti-x', tone: 'danger', title: 'Decline request?',
      body: `${_pwaEsc(q.room)} · ${_pwaEsc([q.first_name, q.last_name].filter(Boolean).join(' '))} sees “Request declined — please contact Casa Castel”.`,
      actions: [{ label: 'Cancel', value: false }, { label: 'Decline', danger: true, primary: true, value: true }] });
    if (!ok) return;
  }
  await sbL.rpc('pw_request_decline', { p_id: id });
  ccPwRequestsLoad();
}

/* ══ YOUR PUSH (password requests only) ═══════════════════════ */
let _pwaReg = null;
function _pwaKey(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function _pwaPushToggle(btn) {
  const on = localStorage.getItem('cc_admin_push') === '1';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !_pwaReg) {
    if (typeof ccDialog === 'function') ccDialog({ title: 'Notifications', body: 'Open the management app from your Home Screen (iPhone: iOS 16.4 or newer) to get notifications.' });
    return;
  }
  if (on) {
    (async () => {
      try { const s = await _pwaReg.pushManager.getSubscription(); if (s) { await sbL.rpc('admin_push_unregister', { p_endpoint: s.endpoint }); await s.unsubscribe(); } } catch (e) {}
      localStorage.removeItem('cc_admin_push'); _pwaRender();
    })();
    return;
  }
  const p = _pwaReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _pwaKey(CC_ADMIN_VAPID) });  // inside the tap (iPhone)
  if (btn) btn.textContent = '…';
  (async () => {
    try {
      const sub = await p, j = sub.toJSON();
      const { data, error } = await sbL.rpc('admin_push_register', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
      if (error || data !== 'ok') throw error || new Error(data);
      localStorage.setItem('cc_admin_push', '1');
    } catch (e) {
      if (typeof ccDialog === 'function') ccDialog({ title: 'Notifications', body: Notification.permission === 'denied'
        ? 'Notifications are blocked. Allow them in Settings › Notifications for the management app.'
        : 'Could not turn on notifications. Please try again.' });
    }
    _pwaRender();
  })();
}

/* ══ CLICKS + START ═══════════════════════════════════════════ */
document.addEventListener('click', async e => {
  const c = e.target.closest && e.target.closest('[data-cc-pw-copy], [data-pwa-copytxt]');
  if (c) {
    const txt = c.dataset.pwaCopytxt || CC_ROOM_PW[c.dataset.ccPwCopy] || '';
    const ok = txt && typeof ccCopyText === 'function' ? await ccCopyText(txt) : false;
    const old = c.innerHTML;
    c.innerHTML = ok ? '<i class="ti ti-check"></i> Copied' : 'Select it';
    setTimeout(() => { c.innerHTML = old; }, 2000);
    return;
  }
  const b = e.target.closest && e.target.closest('[data-pwa]');
  if (!b) return;
  const act = b.dataset.pwa, id = b.dataset.id;
  if (act === 'send')    _pwaSend(id, false);
  if (act === 'sendnew') _pwaSend(id, true);
  if (act === 'decline') _pwaDecline(id);
  if (act === 'push')    _pwaPushToggle(b);
});

(function () {
  if (document.body && document.body.classList.contains('tenant-shell')) return;   // management app only
  const start = () => {
    ccRoomPwLoad();
    ccPwRequestsLoad().then(() => {
      if (new URLSearchParams(location.search).has('pwreq')) {
        ccPwRequestsOpen();
        history.replaceState(null, '', location.pathname);
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
  setInterval(() => { if (document.visibilityState === 'visible') ccPwRequestsLoad(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ccPwRequestsLoad(); ccRoomPwLoad(); } });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(r => { _pwaReg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'cc-pwreq') ccPwRequestsOpen(); });
  }
})();
