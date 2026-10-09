/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PASSWORD REQUEST (tenant login page)
   pw-request-tenant.js   (tenant.html, after auth.js)

   "First time here?" / "Forgot password?" → room, name, birthday →
   Casa Castel approves in the management app → the password shows up
   right here on THIS phone (Copy / Fill in & log in).
     · this phone keeps a secret code (localStorage cc_pwreq); only the
       phone with that code can pick the password up
     · checks every few seconds while the login page is open
     · after a successful login the password leaves the request
       (ccPwReqLoggedIn, called by auth.js); pickup expires after 24 h
   ───────────────────────────────────────────────────────────── */

(function () {
  const KEY = 'cc_pwreq';
  const POLL_MS = 6000;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const loggedIn = () => localStorage.getItem('cc_role') === 'tenant' && !!localStorage.getItem('cc_room');

  const getReq = () => { try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && r.token ? r : null; } catch (e) { return null; } };
  const setReq = r => { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY); };
  function newToken() {
    const b = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  /* ── Login card: links or the request card in the same spot ── */
  const links = () => document.getElementById('pwrLinks');
  const card  = () => document.getElementById('pwrCard');
  const EVER_IN = 'cc_ever_in';      // this phone has logged in before → only "Forgot password?"
  function showLinks(on) {
    const l = links(); if (!l) return;
    l.style.display = on ? '' : 'none';
    const been = localStorage.getItem(EVER_IN) === '1';
    l.querySelectorAll('[data-pwr="first"], .pwr-dot').forEach(el => { el.style.display = been ? 'none' : ''; });
  }
  function setCard(html) { const c = card(); if (c) c.innerHTML = html; showLinks(!html); }

  function waitingHtml(r) {
    return `<div class="pwr-card">
      <p class="pwr-card__title">⏳ Request sent · ${esc(r.room)}</p>
      <p class="pwr-card__text">Casa Castel checks it and your password appears <b>right here</b> — usually between 12:00 and 20:00. You can close the app meanwhile.</p>
      <button type="button" class="pwr-textbtn" data-pwr-act="cancel">Cancel request</button>
    </div>`;
  }
  function passwordHtml(r, pw) {
    return `<div class="pwr-card pwr-card--ok">
      <p class="pwr-card__title">🔑 Your password · ${esc(r.room)}</p>
      <div class="pwr-pw" id="pwrPw">${esc(pw)}</div>
      <button type="button" class="cc-btn cc-btn--primary cc-mb-12" data-pwr-act="fill">Fill in &amp; log in</button>
      <button type="button" class="cc-btn cc-btn--secondary" data-pwr-act="copy">Copy</button>
      <p class="pwr-card__hint">Keep it somewhere safe — it stays your password. This card disappears after you log in.</p>
    </div>`;
  }
  function infoHtml(title, text, btn) {
    return `<div class="pwr-card pwr-card--warn">
      <p class="pwr-card__title">${title}</p>
      <p class="pwr-card__text">${text}</p>
      <button type="button" class="pwr-textbtn" data-pwr-act="${btn.act}">${btn.label}</button>
    </div>`;
  }

  let _pw = null;
  function render(st) {
    const r = getReq();
    if (!r) { _pw = null; setCard(''); return; }
    const s = st && st.status;
    if (s === 'pending') { setCard(waitingHtml(r)); return; }
    if (s === 'approved' && st.password) { _pw = st.password; setCard(passwordHtml(r, st.password)); return; }
    if (s === 'declined') {
      setCard(infoHtml('Request declined', 'Please contact Casa Castel directly.', { act: 'clear', label: 'OK' }));
      return;
    }
    if (s === 'expired') {
      setCard(infoHtml('Pickup expired', 'The password was ready for 24 hours. Just send a new request.', { act: 'again', label: 'Request again' }));
      return;
    }
    // done / cancelled / none → nothing open on this phone any more
    setReq(null); _pw = null; setCard('');
  }

  /* ── Ask the database (only this phone's request) ── */
  let _busy = false;
  async function poll() {
    const r = getReq();
    if (!r || loggedIn() || _busy || typeof sbL === 'undefined' || !sbL) return;
    _busy = true;
    try {
      const { data, error } = await sbL.rpc('pw_request_status', { p_token: r.token });
      if (!error && data) render(data);
    } catch (e) { /* offline → try again */ }
    finally { _busy = false; }
  }

  /* ── Request sheet ── */
  function sheet() {
    let o = document.getElementById('pwrModal');
    if (o) return o;
    o = document.createElement('div');
    o.className = 'cc-modal-overlay'; o.id = 'pwrModal';
    o.innerHTML = `<div class="cc-modal-sheet" style="max-height:90vh;max-height:90svh;">
        <div class="cc-modal-hdr"><span class="cc-modal-title" id="pwrTitle">Password</span>
          <button class="cc-modal-close" type="button" data-pwr-close>✕</button></div>
        <div class="cc-modal-body" id="pwrBody" style="overflow-y:auto;"></div></div>`;
    document.body.appendChild(o);
    o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-pwr-close]')) o.classList.remove('open'); });
    return o;
  }

  async function roomOptions(selected) {
    let names = [...(document.getElementById('tenantRoom')?.options || [])].map(x => x.value).filter(Boolean);
    if (!names.length && sbL) {
      try { const { data } = await sbL.from('rooms').select('name,sort_order').eq('active', true).order('sort_order'); names = (data || []).map(r => r.name); } catch (e) {}
    }
    return `<option value="">Select your room</option>` + names.map(n => `<option value="${esc(n)}"${n === selected ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  async function openSheet(kind) {
    const o = sheet();
    const first = kind === 'first';
    document.getElementById('pwrTitle').textContent = first ? 'First time here?' : 'Forgot your password?';
    const pre = document.getElementById('tenantRoom')?.value || '';
    document.getElementById('pwrBody').innerHTML = `
      <p class="cc-note cc-mb-16">${first
        ? 'Welcome! 👋 Tell us who you are — Casa Castel checks it and sends your password <b>right here on this phone</b>.'
        : 'No worries 🙂 Casa Castel checks it and sends your password <b>right here on this phone</b>.'}</p>
      <div class="cc-input-wrap cc-mb-12"><label class="cc-input-label" for="pwrRoom">Your room</label>
        <select class="cc-select" id="pwrRoom">${await roomOptions(pre)}</select></div>
      <div style="display:flex;gap:10px;" class="cc-mb-12">
        <div class="cc-input-wrap" style="flex:1;min-width:0;"><label class="cc-input-label" for="pwrFirst">First name</label>
          <input class="cc-input" id="pwrFirst" type="text" autocomplete="given-name" maxlength="40"/></div>
        <div class="cc-input-wrap" style="flex:1;min-width:0;"><label class="cc-input-label" for="pwrLast">Last name</label>
          <input class="cc-input" id="pwrLast" type="text" autocomplete="family-name" maxlength="40"/></div>
      </div>
      <div class="cc-input-wrap cc-mb-12"><label class="cc-input-label" for="pwrBday">Birthday</label>
        <input class="cc-input" id="pwrBday" type="text" inputmode="numeric" placeholder="TT.MM.JJJJ" maxlength="10" autocomplete="bday"/></div>
      <div class="cc-input-wrap cc-mb-16"><label class="cc-input-label" for="pwrMsg">Message (optional)</label>
        <textarea class="cc-input" id="pwrMsg" rows="2" maxlength="300" placeholder="${first ? 'e.g. moved in on 01.10.' : 'e.g. new phone'}" style="height:auto;resize:none;"></textarea></div>
      <div class="login-error" id="pwrErr" style="margin-bottom:12px;"></div>
      <button class="cc-btn cc-btn--primary" type="button" id="pwrSend">Send request</button>
      <p class="cc-note" style="margin-top:10px;text-align:center;">Name + birthday as in your rental contract.</p>`;
    o.classList.add('open');

    const bd = document.getElementById('pwrBday');
    bd.addEventListener('input', () => {        // 14032003 → 14.03.2003
      const d = bd.value.replace(/\D/g, '').slice(0, 8);
      bd.value = d.length > 4 ? d.slice(0, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '.' + d.slice(2) : d;
    });
    document.getElementById('pwrSend').addEventListener('click', () => send(kind));
  }

  async function send(kind) {
    const v = id => (document.getElementById(id)?.value || '').trim();
    const err = msg => { const e = document.getElementById('pwrErr'); if (e) { e.textContent = msg; e.classList.add('visible'); } };
    const room = v('pwrRoom'), first = v('pwrFirst'), last = v('pwrLast'), bday = v('pwrBday'), msg = v('pwrMsg');
    if (!room) return err('Please choose your room.');
    if (!first || !last) return err('Please enter your first and last name.');
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(bday)) return err('Please enter your birthday as TT.MM.JJJJ.');
    const btn = document.getElementById('pwrSend');
    btn.disabled = true; btn.textContent = '…';
    const token = newToken();
    let res = null;
    try {
      const { data, error } = await sbL.rpc('pw_request_create', {
        p_room: room, p_kind: kind, p_first: first, p_last: last, p_birthday: bday, p_message: msg || null, p_token: token,
      });
      if (error) throw error;
      res = data;
    } catch (e) { res = 'error'; }
    btn.disabled = false; btn.textContent = 'Send request';
    if (res === 'ok') {
      setReq({ token, room, kind, at: Date.now() });
      document.getElementById('pwrModal')?.classList.remove('open');
      render({ status: 'pending' });
      return;
    }
    err(res === 'open'    ? 'There is already an open request for this room. Please wait for Casa Castel — or contact Casa Castel directly.'
      : res === 'limit'   ? 'Too many requests for this room today. Please try again tomorrow.'
      : res === 'invalid' ? 'Please check your room, name and birthday.'
      :                     'No connection — please try again.');
  }

  /* ── Card buttons ── */
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-pwr], [data-pwr-act]');
    if (!b) return;
    if (b.dataset.pwr) { openSheet(b.dataset.pwr); return; }
    const act = b.dataset.pwrAct, r = getReq();
    if (act === 'cancel' && r) {
      try { await sbL.rpc('pw_request_cancel', { p_token: r.token }); } catch (x) {}
      setReq(null); render(null);
    }
    if (act === 'clear') { if (r) { try { await sbL.rpc('pw_request_cancel', { p_token: r.token }); } catch (x) {} } setReq(null); render(null); }
    if (act === 'again') { if (r) { try { await sbL.rpc('pw_request_cancel', { p_token: r.token }); } catch (x) {} } const k = r ? r.kind : 'forgot'; setReq(null); render(null); openSheet(k); }
    if (act === 'copy' && _pw) {
      const ok = typeof ccCopyText === 'function' ? await ccCopyText(_pw) : false;
      b.textContent = ok ? 'Copied ✓' : 'Select it above';
      if (!ok) { const el = document.getElementById('pwrPw'); const rg = document.createRange(); rg.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); }
      setTimeout(() => { b.textContent = 'Copy'; }, 2500);
    }
    if (act === 'fill' && _pw && r) {
      const sel = document.getElementById('tenantRoom'), inp = document.getElementById('tenantPass');
      if (sel) sel.value = r.room;
      if (inp) inp.value = _pw;
      document.getElementById('tenantLoginBtn')?.click();
    }
  });

  /* ── Called by auth.js after a successful login on this phone ── */
  window.ccPwReqLoggedIn = function () {
    localStorage.setItem(EVER_IN, '1');                       // from now on: "Forgot password?" only
    const r = getReq(); if (!r) return;
    // .then() makes the call actually run (Supabase calls only start when awaited / then-ed)
    try { if (sbL) sbL.rpc('pw_request_done', { p_token: r.token }).then(() => {}, () => {}); } catch (e) {}
    setReq(null); _pw = null;
    const c = card(); if (c) c.innerHTML = ''; showLinks(true);
  };

  /* ── Start ── */
  if (loggedIn()) localStorage.setItem(EVER_IN, '1');       // already in on this phone
  showLinks(true);
  if (getReq() && !loggedIn()) { render({ status: 'pending' }); poll(); }
  setInterval(() => { if (document.visibilityState === 'visible') poll(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
})();
