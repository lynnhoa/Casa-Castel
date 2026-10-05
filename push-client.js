/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PUSH NOTIFICATIONS (tenant app only)
   push-client.js   (loaded last in tenant.html)

   · registers sw.js (push only, no caching)
   · "Notifications" in the profile menu + a one-time question
     after login → turns pushes on / off for this phone
   · one tap "Turn on" (no password): the phone is saved for its
     room together with the room's current password (hash); after a
     password reset (new tenant) the old phone gets no more pushes
   · opening Lounge / Kitchen resets that part of the red number
   · House Cleaning / Kitchen tab report this room's open turn (+1)
   · tapping a notification opens the right tab

   Public: ccPushLogout() (auth.js logout), ccPushRefresh()
           (after a password change), ccPushTurn(kind, week, open)
           (tab-cleaning-tenant.js / tab-kitchen-tenant.js)
   Depends on: constants.js (SB_URL, SB_KEY), supabase-client.js,
               utils.js (ccHashPassword), layout.js (switchTab)
   ───────────────────────────────────────────────────────────── */

const CC_VAPID_PUBLIC = 'BE2AxWBOQCC02UHpV0UlzmZWwY-Ln2MrqhQG7w12Uql78fQhlZZgIaYncl_SxKGpBceAHzt9T3HF-CV54FV2MSQ';

(function () {
  const PREVIEW   = new URLSearchParams(location.search).has('preview');   // landlord preview: never
  const SUPPORTED = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let _reg = null;          // service worker registration (needed synchronously in the tap)
  let _endpoint = null;     // this phone's push address (for logout)

  const room  = () => (localStorage.getItem('cc_role') === 'tenant' ? localStorage.getItem('cc_room') : null);
  const perm  = () => (SUPPORTED ? Notification.permission : 'unsupported');
  const isOn  = () => localStorage.getItem('cc_push_on') === '1' && perm() === 'granted';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function keyBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  const subscribe = () => _reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CC_VAPID_PUBLIC) });

  async function register(sub, pwh) {
    const j = sub.toJSON();
    _endpoint = j.endpoint;
    const { data, error } = await sbL.rpc('push_register', {
      p_room: room(), p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_pwh: pwh || '', p_ua: navigator.userAgent,
    });
    if (error) throw error;
    return data;   // 'ok' | 'wrong_password' | 'invalid'
  }

  function toSW(msg) {
    if (!SUPPORTED) return;
    navigator.serviceWorker.ready.then(r => { if (r.active) r.active.postMessage(msg); }).catch(() => {});
  }

  /* ── Red number: the tab you are looking at counts as read ── */
  const activeTab = () => document.querySelector('#appTabs .cc-tab.active')?.dataset.tab || null;
  const tabOf = t => (t === 'kitchen' || t === 'cleaning' ? t : 'lounge');
  function clearVisible() {
    if (document.visibilityState !== 'visible' || !room()) return;
    const t = activeTab();
    if (t === 'lounge' || t === 'kitchen') toSW({ type: 'cc-clear', chs: [t] });
  }

  /* ── Sheet (same look as "Change password") ──────────────── */
  function sheet() {
    let o = document.getElementById('pushModal');
    if (o) return o;
    o = document.createElement('div');
    o.className = 'cc-modal-overlay';
    o.id = 'pushModal';
    o.innerHTML = `
      <div class="cc-modal-sheet">
        <div class="cc-modal-hdr">
          <span class="cc-modal-title">Notifications</span>
          <button class="cc-modal-close" type="button" data-push="close">✕</button>
        </div>
        <div class="cc-modal-body" id="pushModalBody"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => {
      if (e.target === o || e.target.closest('[data-push="close"]')) close(true);
    });
    return o;
  }
  function open(html) {
    const o = sheet();
    document.getElementById('pushModalBody').innerHTML = html;
    o.classList.add('open');
    return o;
  }
  function close(asked) {
    if (asked) localStorage.setItem('cc_push_asked', '1');
    document.getElementById('pushModal')?.classList.remove('open');
  }
  function err(msg) {
    const el = document.getElementById('pushErr');
    if (el) { el.textContent = msg; el.classList.add('visible'); }
  }

  /* What the sheet shows depends on the phone's state */
  function showSheet() {
    if (!SUPPORTED) {
      open(`<p class="cc-note cc-mb-16">${isIOS
        ? 'To get notifications, open Casa Castel from your Home Screen (Share › Add to Home Screen). iPhone needs iOS 16.4 or newer.'
        : 'This browser does not support notifications. Open Casa Castel from your Home Screen.'}</p>
        <button class="cc-btn cc-btn--secondary" type="button" data-push="close">OK</button>`);
      return;
    }
    if (perm() === 'denied') {
      open(`<p class="cc-note cc-mb-16">Notifications are blocked for Casa Castel. Turn them on in your phone's Settings › Notifications › Casa Castel, then open the app again.</p>
        <button class="cc-btn cc-btn--secondary" type="button" data-push="close">OK</button>`);
      return;
    }
    if (isOn()) {
      open(`<p class="cc-note cc-mb-16">Notifications are on for this phone: new messages in the Lounge and Kitchen chat, and kitchen reminders. Nothing between 00:00 and 08:00 — those arrive at 8.</p>
        <button class="cc-btn cc-btn--secondary" type="button" id="pushOffBtn">Turn off</button>`);
      document.getElementById('pushOffBtn').addEventListener('click', disable);
      return;
    }
    open(`<p class="cc-note cc-mb-16">Get a notification for new messages in the Lounge and Kitchen chat, kitchen reminders and your cleaning turns. Nothing between 00:00 and 08:00 — those arrive at 8.</p>
      <div class="login-error" id="pushErr" style="margin-bottom:12px;"></div>
      <button class="cc-btn cc-btn--primary cc-mb-12" type="button" id="pushOnBtn">Turn on</button>
      <button class="cc-btn cc-btn--ghost" type="button" data-push="close">Not now</button>`);
    document.getElementById('pushOnBtn').addEventListener('click', enable);
  }

  /* ── Turn on (runs inside the tap — iPhone requires that) ── */
  function enable() {
    const btn = document.getElementById('pushOnBtn');
    const stored = localStorage.getItem('cc_pwh') || '';   // from login; older logins have none → the room's current password is used
    if (!_reg) { err('One moment — please tap again.'); return; }
    let p;
    try { p = subscribe(); }                                   // first call inside the tap → permission prompt
    catch (e) { err('Notifications could not be turned on on this phone.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    (async () => {
      const reset = () => { if (btn) { btn.disabled = false; btn.textContent = 'Turn on'; } };
      let sub;
      try { sub = await p; }
      catch (e) {
        reset();
        err(perm() === 'denied'
          ? 'Notifications are blocked. Allow them in Settings › Notifications › Casa Castel.'
          : 'Notifications could not be turned on. Please try again.');
        return;
      }
      let res = 'error';
      try { res = await register(sub, stored); } catch (e) {}
      if (res === 'ok') {
        localStorage.setItem('cc_push_on', '1');
        close(true);
        updateMenu();
        clearVisible();
      } else if (res === 'wrong_password') {   // this phone's login is older than the room's current password
        try { await sub.unsubscribe(); } catch (e) {}
        reset();
        err('The password for this room has changed. Please log out and log in again, then turn notifications on.');
      } else {
        reset();
        err('No connection — please try again.');
      }
    })();
  }

  /* ── Turn off (this phone only) ── */
  async function disable() {
    localStorage.removeItem('cc_push_on');
    try {
      const sub = _reg && await _reg.pushManager.getSubscription();
      if (sub) {
        const ep = sub.endpoint;
        try { await sub.unsubscribe(); } catch (e) {}
        await sbL.rpc('push_unregister', { p_endpoint: ep });
      }
    } catch (e) {}
    toSW({ type: 'cc-reset' });
    close(true);
    updateMenu();
  }

  /* ── Every app start: keep this phone's registration fresh ── */
  async function refresh() {
    if (!SUPPORTED || PREVIEW || !room() || !_reg) return;
    if (localStorage.getItem('cc_push_on') !== '1') return;
    if (perm() !== 'granted') { localStorage.removeItem('cc_push_on'); updateMenu(); return; }
    let sub = null;
    try { sub = await _reg.pushManager.getSubscription(); } catch (e) {}
    if (!sub) { try { sub = await subscribe(); } catch (e) { return; } }
    const pwh = localStorage.getItem('cc_pwh') || '';
    let res = null;
    try { res = await register(sub, pwh); } catch (e) { return; }
    if (res === 'wrong_password') {          // the room got a new password (new tenant / changed elsewhere)
      try { await sub.unsubscribe(); } catch (e) {}
      localStorage.removeItem('cc_push_on');
      localStorage.removeItem('cc_pwh');
      toSW({ type: 'cc-reset' });
      updateMenu();
    }
  }

  /* ── Profile menu entry ── */
  function updateMenu() {
    const b = document.getElementById('pushMenuBtn');
    if (!b) return;
    b.style.display = PREVIEW ? 'none' : '';
    b.textContent = 'Notifications · ' + (isOn() ? 'On' : 'Off');
  }

  /* ── Logout (called by auth.js before the page reloads) ── */
  window.ccPushLogout = function () {
    const ep = _endpoint;
    if (ep) {
      try {   // keepalive: survives the page reload that follows
        fetch(SB_URL + '/rest/v1/rpc/push_unregister', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
          body: JSON.stringify({ p_endpoint: ep }),
        }).catch(() => {});
      } catch (e) {}
    }
    try { _reg && _reg.pushManager.getSubscription().then(s => s && s.unsubscribe()).catch(() => {}); } catch (e) {}
    toSW({ type: 'cc-reset' });
    ['cc_push_on', 'cc_pwh', 'cc_push_asked', 'cc_push_room'].forEach(k => localStorage.removeItem(k));
  };

  /* ── Cleaning / Kitchen tab: is this room's turn this week still open? ── */
  window.ccPushTurn = function (kind, week, open) {
    if (PREVIEW || !room() || !Number.isFinite(Number(week))) return;
    if (!isOn()) return;                       // notifications off on this phone → no red number at all
    toSW({ type: 'cc-turn', kind, week: Number(week), open: !!open });
  };

  /* ── After the tenant changed the password (tenant.html) ── */
  window.ccPushRefresh = function () { refresh(); };

  /* ── START ─────────────────────────────────────────────── */
  if (PREVIEW) return;

  document.getElementById('pushMenuBtn')?.addEventListener('click', () => {
    if (typeof toggleProfileMenu === 'function') toggleProfileMenu();
    showSheet();
  });
  updateMenu();

  if (SUPPORTED) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)          // subscribe needs an ACTIVE worker
      .then(r => { _reg = r; refresh(); })
      .catch(e => console.warn('[push] service worker:', e));

    navigator.serviceWorker.addEventListener('message', e => {
      const m = e.data || {};
      if (m.type === 'cc-push') clearVisible();
      if (m.type === 'cc-open' && room()) {
        if (typeof switchTab === 'function') switchTab(tabOf(m.ch));
        setTimeout(clearVisible, 0);
      }
    });
  }

  document.addEventListener('visibilitychange', clearVisible);
  document.getElementById('appTabs')?.addEventListener('click', () => setTimeout(clearVisible, 0));

  // Wait until the tenant is logged in (also covers a fresh login on this page)
  const ready = setInterval(() => {
    if (!room()) return;
    clearInterval(ready);
    // Opened by tapping a notification while the app was closed
    const openTab = new URLSearchParams(location.search).get('open');
    if (openTab) {
      if (typeof switchTab === 'function') switchTab(tabOf(openTab));
      history.replaceState(null, '', location.pathname);
    }
    // Red number belongs to this room with notifications on: another room on this phone,
    // or notifications off → start from 0 (leftovers from a test / the previous room)
    if (localStorage.getItem('cc_push_room') !== room() || !isOn()) toSW({ type: 'cc-reset' });
    localStorage.setItem('cc_push_room', room());
    setTimeout(clearVisible, 300);
    refresh();
    // One-time question (only where it can work and nobody decided yet)
    if (SUPPORTED && perm() === 'default' && !localStorage.getItem('cc_push_asked') && !isOn()) {
      setTimeout(() => { if (room() && !document.querySelector('.cc-modal-overlay.open')) showSheet(); }, 1500);
    }
  }, 500);
})();
