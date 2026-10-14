/* ─────────────────────────────────────────────────────────────
   MAINTENANCE LINK — maint-link.js
   Loaded last in controlling.html and settlements.html.

   Lines that Maintenance books into Controlling One-off (field
   maint_cost_id, source_ref "maint:<id>") are changed only in Maintenance:
   · Controlling: they carry a "Maintenance" tag and are read-only — a tap
     offers "Open in Maintenance" (that entry, at that receipt)
   · Settlements: they are never taken by the automatic payment matching
     (NK payment of a tenant, WEG Hausgeld) — same amount ≠ same payment
   Nothing else in Controlling changes: they count in the Dashboard, the
   month result and the invoice export like every invoice.
   ───────────────────────────────────────────────────────────── */

'use strict';

(function () {
  const isMaint = o => !!o && (!!o.maint_cost_id || /^maint:/.test(String(o.source_ref || '')));
  window.mtIsMaintLine = isMaint;
  const lines = () => (window._ctrl && Array.isArray(window._ctrl.one_time) ? window._ctrl.one_time : []);
  const byId = id => lines().find(o => String(o.id) === String(id)) || null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const costId = o => o.maint_cost_id || String(o.source_ref || '').replace(/^maint:/, '');

  /* ── 1 · Settlements: the automatic matchers never see Maintenance lines ── */
  function shield(name) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn._mtShielded) return;
    const wrapped = function () {
      const ct = window._ctrl, all = ct && ct.one_time;
      if (!Array.isArray(all)) return fn.apply(this, arguments);
      ct.one_time = all.filter(o => !isMaint(o));
      try { return fn.apply(this, arguments); }
      finally { ct.one_time = all; }
    };
    wrapped._mtShielded = true;
    window[name] = wrapped;
  }
  ['_stFindManualNk', '_srFindBooking'].forEach(shield);

  /* ── 2 · Controlling One-off: tag + read-only ── */
  const st = document.createElement('style');
  st.textContent =
    '.cx-pill--maint{background:#E9EAF3;color:#5D6390;border-color:#C9CCE2;}' +
    '.mtl{position:fixed;inset:0;z-index:2000;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;}' +
    '.mtl__bg{position:absolute;inset:0;background:rgba(30,27,24,.34);}' +
    '.mtl__s{box-sizing:border-box;position:relative;width:100%;max-width:460px;background:var(--cc-white,#FDFCFA);border-radius:16px 16px 0 0;' +
      'padding:20px 16px calc(14px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:6px;box-shadow:0 -6px 24px rgba(30,27,24,.14);}' +
    '.mtl__t{margin:0;font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;line-height:1.1;color:#3D3027;}' +
    '.mtl__x{margin:0 0 10px;font-size:13px;line-height:1.5;color:#6E6357;}' +
    '.mtl__b{display:flex;flex-direction:column;gap:8px;}' +
    '.mtl__btn{width:100%;height:46px;border-radius:8px;border:.5px solid transparent;font-family:inherit;font-size:12px;font-weight:500;' +
      'letter-spacing:.07em;text-transform:uppercase;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;}' +
    '.mtl__btn--p{background:var(--cc-ink,#1E1B18);color:var(--cc-white,#FDFCFA);border-color:var(--cc-ink,#1E1B18);}' +
    '.mtl__btn--s{background:transparent;color:var(--cc-taupe,#9A8E7E);border-color:var(--cc-rule,#E0DAD0);}' +
    '@media (min-width:701px){.mtl{justify-content:center;}.mtl__s{border-radius:16px;padding-bottom:16px;}}';
  (document.head || document.documentElement).appendChild(st);

  function sheet(o) {
    document.getElementById('mtlSheet')?.remove();
    const h = document.createElement('div');
    h.id = 'mtlSheet';
    h.className = 'mtl';
    h.innerHTML = '<div class="mtl__bg" data-v="0"></div>' +
      '<div class="mtl__s" role="dialog" aria-modal="true" aria-labelledby="mtlT">' +
        '<p class="mtl__t" id="mtlT">From Maintenance</p>' +
        '<p class="mtl__x">' + esc(o.item || 'This invoice') + '<br>It is kept in Maintenance, so it is changed or deleted there — and both apps always show the same.</p>' +
        '<div class="mtl__b">' +
          '<button type="button" class="mtl__btn mtl__btn--p" data-v="open">Open in Maintenance</button>' +
          '<button type="button" class="mtl__btn mtl__btn--s" data-v="0">Close</button>' +
        '</div></div>';
    document.body.appendChild(h);
    const done = () => { document.removeEventListener('keydown', key, true); h.remove(); };
    const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); done(); } };
    document.addEventListener('keydown', key, true);
    h.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      if (b.dataset.v === 'open') { location.href = 'maintenance.html#cost=' + encodeURIComponent(costId(o)); return; }
      done();
    });
    setTimeout(() => h.querySelector('[data-v="open"]')?.focus(), 0);
  }

  // a tap on a Maintenance line never opens the edit form (runs before Controlling's own handler)
  window.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('[data-cx="otEdit"][data-id]') : null;
    if (!b) return;
    const o = byId(b.dataset.id);
    if (!isMaint(o)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    sheet(o);
  }, true);

  // the "Maintenance" tag on its rows (rows are redrawn often → tag whatever is new)
  function tag() {
    document.querySelectorAll('[data-cx="otEdit"][data-id]:not([data-mt-tag])').forEach(b => {
      const o = byId(b.dataset.id);
      b.setAttribute('data-mt-tag', isMaint(o) ? '1' : '0');
      if (!isMaint(o)) return;
      const p = b.querySelector('.cx-r__p');
      if (p) p.insertAdjacentHTML('afterbegin', '<span class="cx-pill cx-pill--maint">Maintenance</span>');
      b.setAttribute('aria-label', 'From Maintenance: ' + (o.item || 'invoice'));
    });
  }
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(tag, 0); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
