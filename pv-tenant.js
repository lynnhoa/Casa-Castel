/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — PUTZHILFE CARD · House Cleaning tab (Providers · Phase 6b)
   pv-tenant.js — board T1. Shown only when "Tell tenants" is on for a
   job and its next visit is within 7 days: date, from-time, areas,
   3 tips. Off → nothing is added; the tab stays exactly as it is.
   Reads only date, time and areas (pv_tenant_notice).
   Depends on: supabase-client.js (sbL)
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const IC = {"chip": "<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"5\" width=\"16\" height=\"16\" rx=\"2\"></rect><path d=\"M16 3v4M8 3v4M4 11h16\"></path></svg>", "bath": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect class=\"pf\" x=\"12.8\" y=\"3.5\" width=\"8\" height=\"17.5\" rx=\"1.2\"></rect><path d=\"M14.8 11.2l3.6-3.6M14.8 14.6l4.4-4.4\"></path><path d=\"M4 21V6.5a3 3 0 0 1 6 0v.8\"></path><path class=\"pf\" d=\"M7.6 7.3h4.8l-.9 2h-3z\"></path><path d=\"M8.4 11.4v1.1M10 11.9v1.1M11.6 11.4v1.1\"></path></svg>", "dishes": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle class=\"pf\" cx=\"9.5\" cy=\"13.5\" r=\"6.5\"></circle><circle class=\"pw\" cx=\"9.5\" cy=\"13.5\" r=\"3.6\"></circle><path class=\"pf\" d=\"M16.8 5.5h4.4l-.75 10.2a1.45 1.45 0 0 1-1.45 1.35 1.45 1.45 0 0 1-1.45-1.35L16.8 5.5z\"></path><path d=\"M17.2 9.5h3.6\"></path></svg>", "fridge": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.45\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect class=\"pf\" x=\"5.8\" y=\"2.8\" width=\"12.4\" height=\"18.4\" rx=\"2.2\"></rect><path d=\"M5.8 9.2h12.4\"></path><path d=\"M9 5v2.2M9 11.6v3.6\"></path><path d=\"M8.2 21.2v1M15.8 21.2v1\"></path></svg>"};
  const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function day(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + String(d).padStart(2, '0') + '.' + String(m).padStart(2, '0') + '.';
  }
  const tip = (bg, fg, ic, de, en) => `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;"><span style="width:44px;height:44px;border-radius:13px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;">${ic}</span><span style="font-size:12px;font-weight:500;color:#1E1B18;line-height:1.2;">${de}</span><span style="font-size:10.5px;color:#9A8E7E;line-height:1.2;">${en}</span></div>`;
  function render(n) {
    let el = document.getElementById('pvTenantNotice');
    if (!n || !n.date) { if (el) el.remove(); return; }
    const tab = document.getElementById('tab-cleaning');
    if (!tab) return;
    if (!el) {
      el = document.createElement('div');
      el.id = 'pvTenantNotice';
      const h = tab.querySelector('h1');
      if (h) h.insertAdjacentElement('afterend', el); else tab.prepend(el);
    }
    const a = n.areas || {};
    const line = [n.time ? 'ab ' + esc(n.time) : '', a.de ? esc(a.de) + (a.en ? ' · ' + esc(a.en) : '') : ''].filter(Boolean).join(' · ');
    el.innerHTML = `<div class="k-mob-week" data-turn="turn" style="border:.5px solid #E0DAD0;border-radius:12px;margin:0 0 18px;">
        <div class="k-mob-week-top-row"><span class="k-mob-status-chip now">${IC.chip}Putzhilfe · Cleaning</span></div>
        <div class="k-mob-week-body"><div class="k-mob-week-left"><span class="k-mob-week-room">${day(n.date)}</span>${line ? `<span class="k-mob-week-dates-sm">${line}</span>` : ''}</div></div>
        <p style="font-size:12px;font-weight:600;color:#3A3530;margin-top:10px;">Bitte vorher · please before</p>
        <div style="display:flex;gap:6px;margin-top:8px;">
          ${tip('#E2EEFC', '#1E5A9A', IC.bath, 'Bäder frei', 'Bathrooms free')}
          ${tip('#FBF0D0', '#8A6A10', IC.dishes, 'Geschirr weg', 'Dishes away')}
          ${tip('#FBF0D0', '#8A6A10', IC.fridge, 'Kühlschrank ordnen', 'Tidy your shelf')}
        </div>
      </div>`;
  }
  async function load() {
    if (typeof sbL === 'undefined' || !sbL) return;
    let n = null;
    try { const { data, error } = await sbL.rpc('pv_tenant_notice'); if (!error) n = data; } catch (e) { return; }
    render(n);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  load();
})();
