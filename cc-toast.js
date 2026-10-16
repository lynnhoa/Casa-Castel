/* ─────────────────────────────────────────────────────────────
   CC-TOAST.JS · P3 + P4 (16.10.2026) · management apps only
   The grey iPhone alert box ("casa-castel.vercel.app says …") becomes the
   app's own small toast at the bottom — same look as the "Saved" toasts.
   · only alert() — OK/Cancel questions (confirm / prompt) stay as they are (P4)
   · several messages in a row are shown one after the other
   · longer messages stay longer (3–9 s)
   · NOT loaded by the tenant app or the cleaners' app
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__ccAlertToast) return;
  window.__ccAlertToast = true;

  var queue = [], busy = false, el = null;

  function node() {
    if (el && el.isConnected) return el;
    el = document.createElement('div');
    el.id = 'ccAlertToast';
    el.className = 'cc-alert-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  function next() {
    if (!queue.length) { busy = false; return; }
    busy = true;
    var msg = queue.shift(), t = node();
    t.textContent = msg;
    t.classList.add('show');
    var ms = Math.min(9000, Math.max(3000, 1800 + msg.length * 45));
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(next, 260);
    }, ms);
  }

  window.alert = function (msg) {
    var m = String(msg == null ? '' : msg).trim();
    if (!m) return;
    if (queue[queue.length - 1] === m) return;      // the same message twice in a row → once
    queue.push(m);
    if (!busy) next();
  };
})();

/* ── P4 (16.10.2026) · questions: the in-app dialog instead of the iPhone OK/Cancel box ──
   ccDialog / ccConfirm are copied 1:1 from utils.js, so apps without utils.js
   (Controlling · Settlements · Maintenance · Rentals · Properties) get the very same
   dialog Casa Castel and Providers already use. Where utils.js is loaded it replaces these. */
window.ccEscHtml = window.ccEscHtml || function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
};
(function () {
  'use strict';
  function _ccDlgCss() {
    if (document.getElementById('cc-dlg-css')) return;
    const st = document.createElement('style'); st.id = 'cc-dlg-css';
    st.textContent = `
  .cc-dlg-ov { position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center;
    padding:24px; background:rgba(30,27,24,.35); -webkit-tap-highlight-color:transparent; }
  .cc-dlg { background:var(--cc-white,#FDFCFA); border-radius:var(--cc-r-lg,12px); padding:24px 20px 18px;
    width:100%; max-width:320px; box-shadow:0 10px 40px rgba(30,27,24,.18); font-family:'Inter',system-ui,sans-serif;
    animation:ccDlgPop .2s cubic-bezier(.32,.72,0,1); }
  @keyframes ccDlgPop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
  .cc-dlg__icon { font-size:26px; color:var(--cc-gold,#B8956A); margin-bottom:10px; }
  .cc-dlg--danger .cc-dlg__icon { color:#C4705A; }
  .cc-dlg__title { font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; font-weight:400;
    color:var(--cc-ink,#1E1B18); margin:0 0 6px; }
  .cc-dlg__body { font-size:13px; color:var(--cc-taupe,#9A8E7E); line-height:1.55; margin:0 0 18px; }
  .cc-dlg__body strong { color:var(--cc-charcoal,#3A3530); font-weight:500; }
  .cc-dlg__btns { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
  .cc-dlg__btn { height:36px; padding:0 14px; border-radius:18px; font:inherit; font-size:12px; font-weight:500;
    display:inline-flex; align-items:center; gap:5px; cursor:pointer; border:.5px solid var(--cc-rule,#E0DAD0);
    background:var(--cc-white,#FDFCFA); color:var(--cc-taupe,#9A8E7E); }
  .cc-dlg__btn:active { opacity:.75; }
  .cc-dlg__btn--primary { background:var(--cc-ink,#1E1B18); border-color:var(--cc-ink,#1E1B18); color:var(--cc-white,#FDFCFA); }
  .cc-dlg__btn--danger  { background:none; color:#A32D2D; border-color:#F09595; }
  .cc-dlg__pw { display:flex; align-items:center; gap:10px; margin:4px 0 12px; padding:12px 12px 12px 14px;
    background:var(--cc-surface,#EDE8E0); border-radius:var(--cc-r-md,8px); }
  .cc-dlg__pwtxt { flex:1; font-size:19px; letter-spacing:.04em; color:var(--cc-ink,#1E1B18);
    font-variant-numeric:tabular-nums; user-select:all; -webkit-user-select:all; word-break:break-all; }
  .cc-dlg__copy { flex-shrink:0; height:34px; padding:0 11px; border-radius:17px; border:.5px solid var(--cc-rule,#E0DAD0);
    background:var(--cc-white,#FDFCFA); color:var(--cc-taupe,#9A8E7E); font:inherit; font-size:11px; font-weight:500;
    display:inline-flex; align-items:center; gap:5px; cursor:pointer; }
  .cc-dlg__copy i { font-size:15px; }
  .cc-dlg__copy.is-done { background:#EAF3DE; border-color:#97C459; color:#27500A; }`;
    document.head.appendChild(st);
  }
  function ccDialog(opts) {
    _ccDlgCss();
    const o = opts || {};
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'cc-dlg-ov';
      const acts = (o.actions && o.actions.length) ? o.actions : [{ label: 'OK', primary: true, value: true }];
      ov.innerHTML = `<div class="cc-dlg${o.tone === 'danger' ? ' cc-dlg--danger' : ''}" role="dialog" aria-modal="true">
        ${o.icon ? `<div class="cc-dlg__icon"><i class="ti ${o.icon}" aria-hidden="true"></i></div>` : ''}
        <p class="cc-dlg__title">${o.title || ''}</p>
        ${o.body ? `<div class="cc-dlg__body">${o.body}</div>` : ''}
        <div class="cc-dlg__btns">${acts.map((a, i) =>
          `<button type="button" class="cc-dlg__btn${a.primary ? ' cc-dlg__btn--primary' : ''}${a.danger ? ' cc-dlg__btn--danger' : ''}" data-i="${i}">${a.icon ? `<i class="ti ${a.icon}" aria-hidden="true"></i>` : ''}${a.label}</button>`).join('')}</div>
      </div>`;
      const close = v => { ov.remove(); resolve(v); };
      ov.addEventListener('click', e => { if (e.target === ov && !o.modal) close(null); });
      ov.querySelectorAll('.cc-dlg__btn').forEach(b => b.addEventListener('click', () => {
        const a = acts[+b.dataset.i]; close(a.value === undefined ? null : a.value);
      }));
      document.body.appendChild(ov);
      if (typeof o.onOpen === 'function') o.onOpen(ov);
    });
  }
  /* Yes / no question in the app's own style → true / false */
  async function ccConfirm(title, body, okLabel, danger) {
    const v = await ccDialog({ icon: danger ? 'ti-alert-triangle' : 'ti-help-circle', tone: danger ? 'danger' : '',
      title, body, actions: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, primary: !danger, danger: !!danger, icon: danger ? 'ti-trash' : '' }] });
    return v === true;
  }
  if (typeof window.ccDialog !== 'function') window.ccDialog = ccDialog;
  if (typeof window.ccConfirm !== 'function') window.ccConfirm = ccConfirm;
})();

/* ccPrompt — in-app version of prompt(): one field, Cancel / OK.
   Returns the typed text, or null on Cancel / tap outside (like prompt()). */
window.ccPrompt = window.ccPrompt || async function (title, label, value, okLabel) {
  var inp = null;
  var v = await window.ccDialog({
    title: title,
    body: (label ? '<label class="cc-dlg__lbl" for="ccDlgIn">' + ccEscHtml(label) + '</label>' : '') +
          '<input class="cc-dlg__in" id="ccDlgIn" type="text" autocomplete="off" value="' + ccEscHtml(value == null ? '' : value) + '">',
    actions: [{ label: 'Cancel', value: false }, { label: okLabel || 'OK', value: true, primary: true }],
    onOpen: function (ov) {
      inp = ov.querySelector('.cc-dlg__in');
      if (!inp) return;
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 60);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); var b = ov.querySelector('.cc-dlg__btn--primary'); if (b) b.click(); }
      });
    }
  });
  return v === true ? (inp ? inp.value : '') : null;
};
