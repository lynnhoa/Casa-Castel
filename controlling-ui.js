/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SHARED UI
   controlling-ui.js

   One set of building blocks for every tab, so Dashboard, Einnahmen,
   Ausgaben, Einmalig and Setup look and behave identically:
     · month selector (same place on every tab, "Stand" date)
     · pills (one colour = one meaning, everywhere)
     · Soll │ → │ Ist row
     · summary card, property card with fold-up
     · money formatting / parsing (German)
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX = {
  month: (() => {
    try { const v = Number(localStorage.getItem('cx_month')); if (v >= 1 && v <= 12) return v; } catch (e) {}
    return new Date().getMonth() + 1;
  })(),
  open: {},            // fold state per card key
  tab: 'dashboard',
};

const CX_MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

/* ── Money ── */
const cxR    = v => Math.round((Number(v) || 0) * 100) / 100;
const cxE2   = v => cxR(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cxEur  = v => cxE2(v) + '\u202f€';
const cxW    = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxWS   = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : n > 0 ? '+\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxEsc  = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function cxParse(s) {
  if (typeof ccParseEUR === 'function') { const n = ccParseEUR(s); return (n === null || n === undefined || isNaN(n)) ? null : n; }
  s = String(s ?? '').replace(/[€\s\u202f]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function cxToday() {
  if (typeof ccTodayISO === 'function') return ccTodayISO();
  const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const cxFmtDate = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };

/* ── Pills: one colour = one meaning ── */
const cxPill = (cls, text) => '<span class="cx-pill cx-pill--' + cls + '">' + cxEsc(text) + '</span>';
function cxStatus(soll, ist, emptyText) {
  if (!soll && (ist === null || ist === undefined)) return ['grey', emptyText || 'leer'];
  if (ist === null || ist === undefined) return ['open', 'offen'];
  const d = cxR(ist - soll);
  if (!d) return ['ok', 'bezahlt'];
  return ['diff', (d < 0 ? '\u2212 ' : '+ ') + cxEur(Math.abs(d)) + (d < 0 ? ' weniger' : ' mehr')];
}
function cxGroupStatus(rows) {
  const act = rows.filter(r => r.soll || (r.ist !== null && r.ist !== undefined));
  const open = act.filter(r => r.ist === null || r.ist === undefined).length;
  const diff = act.some(r => r.ist !== null && r.ist !== undefined && cxR(r.ist - r.soll) !== 0);
  if (diff) return ['diff', 'Abweichung'];
  if (open) return ['open', open + ' offen'];
  return act.length ? ['ok', 'erfasst'] : ['grey', 'leer'];
}

/* ── Month selector (same on every tab) ── */
function cxMonthBar() {
  const today = cxFmtDate(cxToday());
  return '<div class="cx-month">' +
    '<button class="cx-arw" data-cx="prev" aria-label="Vorheriger Monat"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + CX_MONTHS[CX.month - 1] + ' ' + window._ctrl.year + '</div>' +
    '<div class="cx-month__s">Stand ' + today + '</div></div>' +
    '<button class="cx-arw" data-cx="next" aria-label="Nächster Monat"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}
async function cxStepMonth(delta) {
  let m = CX.month + delta, y = window._ctrl.year;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  CX.month = m; CX.open = {};
  try { localStorage.setItem('cx_month', String(m)); } catch (e) {}
  if (y !== window._ctrl.year) {
    if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
    try { await ctlLoadAll(y); } catch (e) { cxToastErr(e); }
    if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
  }
  cxRenderActive();
}
function cxRenderActive() {
  const f = { dashboard: 'renderDashboard', income: 'renderIncome', expenses: 'renderExpenses', onetime: 'renderOneTime', setup: 'renderSetup' }[CX.tab];
  if (f && typeof window[f] === 'function') window[f]();
}
function cxGoto(tab) { if (typeof switchTab === 'function') switchTab(tab); }

/* ── Summary card (Einnahmen / Ausgaben) ── */
function cxSummary(o) {
  const pct = o.plan ? Math.min(100, o.done / o.plan * 100) : 0;
  return '<div class="cx-card cx-sum">' +
    '<div class="cx-row-sb"><span class="cx-lbl">' + cxEsc(o.label) + '</span>' + (o.open ? cxPill('open', o.open + ' offen') : cxPill('ok', 'alles erfasst')) + '</div>' +
    '<div class="cx-sum__v"><span class="cx-sum__big">' + cxW(o.done) + '</span><span class="cx-sum__of">von ' + cxW(o.plan) + ' geplant</span></div>' +
    '<div class="cx-bar cx-bar--thin"><div style="width:' + pct + '%"></div></div>' +
    '<button class="cx-btn cx-btn--p cx-btn--full" data-cx="all"' + (o.open ? '' : ' disabled') + '><i class="ti ti-checks" aria-hidden="true"></i>Alle offenen wie geplant</button>' +
  '</div>';
}

/* ── Property card with fold-up ── */
function cxCard(o) {
  const g = o.status;
  const isOpen = CX.open[o.key] !== undefined ? CX.open[o.key] : (g[0] === 'open' || g[0] === 'diff');   // only what needs you
  return '<div class="cx-card">' +
    '<button class="cx-ph" data-cx="fold" data-k="' + cxEsc(o.key) + '" aria-expanded="' + isOpen + '">' +
      '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(o.title) + '</span><span class="cx-src">' + cxEsc(o.sub || '') + '</span></span>' +
      '<span class="cx-ph__r">' + (o.extraPill || '') + (o.sum !== undefined ? '<span class="cx-ph__sum">' + cxW(o.sum) + '</span>' : '') +
        cxPill(g[0], g[1]) + '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span>' +
    '</button>' + (isOpen ? o.body : '') + '</div>';
}

/* ── Soll │ → │ Ist row ── */
function cxRow(o) {
  const s = cxStatus(o.soll, o.ist, o.emptyText);
  const can = !!o.soll || (o.ist !== null && o.ist !== undefined);
  const took = o.ist !== null && o.ist !== undefined && o.soll && cxR(o.ist - o.soll) === 0;
  return '<div class="cx-r">' +
    '<div class="cx-r__l"><div class="cx-r__u">' + cxEsc(o.label) + (o.badge ? ' ' + cxPill('beige', o.badge) : '') + '</div>' +
      '<div class="cx-r__s">' + (o.soll ? cxEur(o.soll) : '\u2014') + '</div>' +
      (o.sub ? '<div class="cx-r__sub">' + o.sub + '</div>' : '') +
      (o.notes || []).map(n => '<div class="cx-r__note"><i class="ti ti-arrow-up-right" aria-hidden="true"></i> ' + cxEsc(n) + '</div>').join('') +
    '</div>' +
    '<button class="cx-take' + (took ? ' on' : '') + '" data-cx="take" data-id="' + cxEsc(o.id) + '" aria-label="Soll übernehmen"' + (o.soll ? '' : ' disabled') + '><i class="ti ti-arrow-right" aria-hidden="true"></i></button>' +
    '<label class="cx-f' + (can || o.allowEmpty ? '' : ' cx-f--off') + '"><input type="text" inputmode="decimal" data-cx-in="' + cxEsc(o.id) + '" value="' + (o.ist === null || o.ist === undefined ? '' : cxE2(o.ist)) + '" placeholder="' + (o.soll || o.allowEmpty ? 'Betrag' : '\u2014') + '"' + (o.soll || o.allowEmpty || can ? '' : ' disabled') + ' aria-label="Ist-Betrag ' + cxEsc(o.label) + '"><span>€</span></label>' +
    '<div class="cx-r__p">' + cxPill(s[0], s[1]) + '</div>' +
  '</div>';
}
function cxNotDue(list) {
  if (!list || !list.length) return '';
  return '<div class="cx-nd">' + cxPill('grey', 'nicht fällig') + '<span>' + list.map(n => cxEsc(n.label) + (n.next ? ' · nächste im ' + n.next : '')).join(' · ') + '</span></div>';
}

/* ── Toasts ── */
function cxToastErr(e) {
  console.error('[controlling]', e);
  if (typeof ctlToast === 'function') ctlToast('Speichern fehlgeschlagen – bitte erneut versuchen');
}

/* ── Wire a tab host once: month arrows, fold, take-over, inputs ── */
function cxWire(host, h) {
  if (host._cxWired) return;
  host._cxWired = true;
  host.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-cx]');
    if (!b || b.disabled) return;
    const a = b.dataset.cx;
    if (a === 'prev') return cxStepMonth(-1);
    if (a === 'next') return cxStepMonth(1);
    if (a === 'fold') { const k = b.dataset.k; const cur = b.getAttribute('aria-expanded') === 'true'; CX.open[k] = !cur; return h.render(); }
    if (h.click) return h.click(a, b, ev);
  });
  host.addEventListener('change', ev => {
    const id = ev.target && ev.target.dataset && ev.target.dataset.cxIn;
    if (id && h.input) h.input(id, cxParse(ev.target.value), ev.target);
  });
  host.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && ev.target.dataset && ev.target.dataset.cxIn) ev.target.blur();
  });
}
