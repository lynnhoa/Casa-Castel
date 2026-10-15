/* ─────────────────────────────────────────────────────────────
   MAINTENANCE LINK — maint-link.js
   Loaded last in controlling.html and settlements.html.

   Lines that Maintenance books into Controlling One-off (field
   maint_cost_id, source_ref "maint:<id>") are changed only in Maintenance:
   · Controlling: they carry a "Maintenance" tag; a tap opens the normal One-off
     form read-only (amount, date, text belong to Maintenance) — only the NK switch
     of a Casa Castel cost works there (D8) · "Open in Maintenance" (that receipt)
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

  /* ── 2 · Controlling One-off: the "Maintenance" tag · D8: a tap opens the normal form,
        read-only except the NK switch (controlling-tab-onetime.js, _cxOtMaintFormHTML) ── */
  const st = document.createElement('style');
  st.textContent =
    '.cx-pill--maint{background:#E9EAF3;color:#5D6390;border-color:#C9CCE2;}' +
    '.cx-ot-form--mt .cx-ot-mt{display:flex;align-items:flex-start;gap:8px;}' +
    '.cx-ot-form--mt .cx-ot-mt .cx-pill{flex-shrink:0;margin-top:1px;}' +
    '.cx-ot-mt__t{font-size:12px;line-height:1.45;color:var(--cx-mut,#9A8E7E);}' +
    '.cx-ot-mt__ro{display:flex;flex-direction:column;padding:0 12px;border:.5px solid var(--cx-rule,#E0DAD0);' +
      'border-radius:10px;background:var(--cx-card,#FDFCFA);}' +
    '.cx-ot-mt__kv{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;' +
      'border-top:.5px solid var(--cx-line,#EDE8E0);font-size:12.5px;line-height:1.4;}' +
    '.cx-ot-mt__kv:first-child{border-top:none;}' +
    '.cx-ot-mt__kv span{flex-shrink:0;color:var(--cx-mut,#9A8E7E);}' +
    '.cx-ot-mt__kv b{font-weight:500;color:var(--cx-ink,#3D3027);text-align:right;overflow-wrap:anywhere;}' +
    '.cx-ot-mtlink{align-self:center;padding:6px 0 0 !important;color:var(--cx-acc,#B8956A) !important;font-weight:500;}';
  (document.head || document.documentElement).appendChild(st);

  // the "Maintenance" tag on its rows (rows are redrawn often → tag whatever is new)
  function tag() {
    document.querySelectorAll('[data-cx="otEdit"][data-id]:not([data-mt-tag])').forEach(b => {
      const o = byId(b.dataset.id);
      b.setAttribute('data-mt-tag', isMaint(o) ? '1' : '0');
      if (!isMaint(o)) return;
      const p = b.querySelector('.cx-r__p');
      if (p) p.insertAdjacentHTML('afterbegin', '<span class="cx-pill cx-pill--maint">Maintenance</span>');
      b.setAttribute('aria-label', 'From Maintenance: ' + (o.item || 'invoice') + ' · open');
    });
  }
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(tag, 0); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
