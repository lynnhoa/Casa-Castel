/* ─────────────────────────────────────────────────────────────
   SETTLEMENTS — CASA CASTEL TAB (placeholder)
   settlements-tab-calc.js

   Casa Castel has its own settlement structure and comes later. The tab already
   use the final structure — period on top, one card per property / room —
   so the calculation can slot in without changing the layout.
   ───────────────────────────────────────────────────────────── */

'use strict';

/* The period to show: the newest one that has ended (else the running one) */
function _stCalcPeriod(p) {
  const open = typeof ctlSettlementPeriods === 'function' ? ctlSettlementPeriods(p) : [];
  if (open.length) return open[open.length - 1];
  const t = cxToday();
  const cur = ctlPeriodOf(p, t);
  return cur ? { ...cur, frist: null } : null;
}
const _stPeriodText = per => per ? stDM(per.from) + '–' + stDate(per.to) + (per.frist ? ' · Frist ' + stDate(per.frist) : '') : '';
const _stName = t => [t.first_name, t.last_name].filter(Boolean).join(' ') || '—';
const _stOverlaps = (t, from, to) => (!t.mietbeginn || String(t.mietbeginn).slice(0, 10) <= to) && (!t.mietende || String(t.mietende).slice(0, 10) >= from);

function _stPlaceholder(title, sub, cards, note) {
  return '<div class="st-page">' +
    '<div class="st-head"><h1 class="cx-title">' + stEsc(title) + '</h1><p class="cx-title__s">' + stEsc(sub) + '</p></div>' +
    '<div class="st-soon"><i class="ti ti-calculator" aria-hidden="true"></i><div><strong>Berechnung folgt</strong><span>' + stEsc(note) + '</span></div></div>' +
    (cards || '<p class="cx-empty">Noch keine Objekte angelegt.</p>') +
  '</div>';
}

/* ── Casa Castel ── */
function _stRenderCasaPlaceholder() {   // replaced by settlements-tab-casa.js
  const el = document.getElementById('tab-casa'); if (!el) return;
  const p = (window._ctrl.properties || []).find(x => x.id === CASA_PROP_ID && x.active);
  if (!p) { el.innerHTML = _stPlaceholder('Casa Castel', 'NK-Abrechnung der Zimmer', '', 'Casa Castel ist in Controlling noch nicht als Objekt angelegt.'); return; }
  const per = _stCalcPeriod(p);
  const rooms = (window._src.rooms || []).filter(r => r.active !== false).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const rows = rooms.map(r => {
    const ten = per ? (window._src.casaTen || []).filter(t => t.room === r.name && t.mietbeginn && _stOverlaps(t, per.from, per.to)) : [];
    return '<div class="st-prow"><span class="st-prow__a">' + stEsc(r.name) + '</span>' +
      '<span class="st-prow__b">' + (ten.length ? stEsc(ten.map(_stName).join(', ')) : '<em>kein Mieter im Zeitraum</em>') + '</span></div>';
  }).join('');
  const card = '<div class="cx-card st-card">' +
    '<div class="st-card__h"><div class="st-card__t"><span class="cx-pn">Zeitraum ' + stEsc(per ? per.label : '') + '</span>' +
    '<span class="cx-src">' + stEsc(_stPeriodText(per)) + '</span></div>' + cxPill('grey', 'folgt') + '</div>' +
    '<div class="st-colhead st-colhead--2"><span>Zimmer</span><span>Mieter im Zeitraum</span></div>' +
    (rows || '<p class="cx-empty">Keine Zimmer gefunden.</p>') + '</div>';
  el.innerHTML = _stPlaceholder('Casa Castel', 'NK-Abrechnung der Zimmer', card,
    'Hier werden die Hauskosten aus Controlling übernommen, auf die Zimmer verteilt und als Abrechnung (PDF) erstellt.');
}

/* Rentals: settlements-tab-rentals.js */
