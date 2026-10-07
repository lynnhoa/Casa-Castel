/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — APP SHELL
   settlements-app.js

   Fifth management app (login tile + profile menus of all apps).
   Tabs: Dashboard (settlements-tab-dashboard.js) · Casa Castel (settlements-tab-casa.js) · Rentals (NK-Abrechnung der Wohnungen —
         settlements-tab-rentals.js)
         · Tracking (every NK- and Hausgeld-Abrechnung: offen → verschickt → erledigt)

   Shares data + rules with Controlling (controlling-data.js /
   controlling-soll.js / controlling-abr.js): one set of Abrechnungs rules.
   Controlling only receives the finished results and confirms the money.
   ───────────────────────────────────────────────────────────── */

'use strict';

const ST = {
  tab: (() => { try { const t = localStorage.getItem('st_last_tab'); return ['dashboard', 'casa', 'rentals'].includes(t) ? t : 'dashboard'; } catch (e) { return 'dashboard'; } })(),
  year: null,                                   // Abrechnungsjahr shown in Tracking
  filter: new Set(['offen', 'verschickt']),     // what needs you first
  open: {},                                     // folded cards
  sel: null,                                    // selected line (panel)
  edit: false,                                  // panel shows the form for an existing result
  checkOpen: false,                             // Datenprüfung unfolded
  loadedAt: 0,
};

const stEsc = s => (typeof cxEsc === 'function' ? cxEsc(s) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
const stDate = iso => (typeof cxFmtDate === 'function' ? cxFmtDate(iso) : String(iso || ''));
const stDM = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' : ''; };
const stEur = v => (typeof cxEur === 'function' ? cxEur(v) : String(v));
function stSay(msg) { if (typeof ctlToast === 'function') ctlToast(msg); }
function stIsWide() { return window.innerWidth >= 1000; }

/* ── Boot ─────────────────────────────────────────────────── */
async function stBoot() {
  ctlShowLoading(true);
  const session = await ctlGetSession();
  if (!session) { ctlShowLoading(false); location.replace('login.html'); return; }
  try { localStorage.setItem('mgmt_last_app', 'settlements.html'); } catch (e) {}
  try {
    await stLoad();
    document.getElementById('appShell').style.display = 'block';
    const link = typeof stReadLink === 'function' ? stReadLink() : null;          // "Open NK-Abrechnung" from a tenant card
    if (link) stOpenLink(link); else stSwitchTab(ST.tab);
  } catch (e) {
    console.error('[settlements] boot failed:', e);
    document.getElementById('appShell').style.display = 'block';
    document.getElementById('tab-tracking').innerHTML =
      '<div class="st-page"><p class="cx-empty">The data could not be loaded. ' +
      '<a href="#" onclick="location.reload();return false;" class="st-inline-link">Try again</a></p>' +
      '<p class="st-muted">' + stEsc((e && e.message) || e) + '</p></div>';
    stSwitchTab('tracking');
  } finally {
    ctlShowLoading(false);
  }
}

/* All data (same sources as Controlling) */
async function stLoad() {
  await Promise.all([ctlLoadAll(), ctlSollLoad(), typeof srLoadRows === 'function' ? srLoadRows() : null]);
  if (typeof ctlSollReset === 'function') ctlSollReset();
  if (typeof ctlSettlementInvalidate === 'function') ctlSettlementInvalidate();
  ST.loadedAt = Date.now();
  if (typeof _stSyncStatus === 'function') _stSyncStatus().catch(() => {});      // done in Settlements = done on the tenant cards
}

/* ── Tabs ─────────────────────────────────────────────────── */
/* Fixed order of the Wohnungen (ctrl_properties.sort_order = your purchase order), then name */
function stPropOrder(a, b) {
  const oa = Number.isFinite(Number(a.sort_order)) && a.sort_order !== null ? Number(a.sort_order) : 999;
  const ob = Number.isFinite(Number(b.sort_order)) && b.sort_order !== null ? Number(b.sort_order) : 999;
  return oa - ob || String(a.name).localeCompare(String(b.name), 'de');
}
function stSwitchTab(tab) {
  ST.tab = tab;
  try { localStorage.setItem('st_last_tab', tab); } catch (e) {}
  document.querySelectorAll('.tab-content').forEach(el => { el.style.display = 'none'; });
  const el = document.getElementById('tab-' + tab);
  if (el) el.style.display = 'block';
  document.querySelectorAll('.cc-tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  stClosePanel(true);
  window.scrollTo(0, 0);
  stRender();
}
function stRender() {
  if (ST.tab === 'dashboard') stRenderDashboard();
  if (ST.tab === 'casa')     stRenderCasa();
  if (ST.tab === 'rentals')  stRenderRentals();
  if (ST.tab === 'tracking') stRenderTracking();
}
document.getElementById('appTabs')?.addEventListener('click', e => {
  const b = e.target.closest('.cc-tab[data-tab]');
  if (b) stSwitchTab(b.dataset.tab);
});

/* Reload when the app comes back to the front (at most once a minute) */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || Date.now() - ST.loadedAt < 60000) return;
  if (document.getElementById('appShell')?.style.display === 'none') return;
  try { await stLoad(); stRender(); } catch (e) {}
});

/* ── Entry panel (Tracking) ───────────────────────────────── */
function stClosePanel(silent) {
  ST.sel = null; ST.edit = false;
  if (typeof SR !== 'undefined') { SR.sel = null; SR.edit = false; SR.draft = null; SR.modal = null; SR.dirty = false; }
  if (typeof SC !== 'undefined' && SC.modal) { SC.modal = null; if (typeof scRenderModal === 'function') scRenderModal(); }
  if (typeof SD !== 'undefined' && SD.modal) { SD.modal = null; SD.d = null; if (typeof sdRenderModal === 'function') sdRenderModal(); }
  document.getElementById('stScrim').hidden = true;
  document.body.classList.remove('st-panel-open');
  if (!silent) stRender();
}
document.getElementById('stScrim')?.addEventListener('click', () => stClosePanel());
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (typeof SR !== 'undefined' && SR.modal) { _srCloseModal(); return; }
  if (ST.sel) stClosePanel();
});
