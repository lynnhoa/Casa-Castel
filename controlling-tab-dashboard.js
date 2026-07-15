/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DASHBOARD TAB
   controlling-tab-dashboard.js

   Two toggles:
     · Year / Month
     · Warm / Kalt
   Month view now shows a Status column per property row (✓ done /
   • pending), replacing the old separate Monthly Entry tab.

   Depends on: controlling-data.js, controlling-tab-entry.js (for
               ctlOpenEntry + hasEntriesFor)
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlDashView  = 'year';                        // 'year' | 'month'
let _ctlDashMode  = 'warm';                        // 'warm' | 'kalt'
let _ctlDashMonth = new Date().getMonth() + 1;

document.getElementById('tab-dashboard').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Controlling</h1>
        <div class="ct-sub" id="ctDashSub">Portfolio · 2026 · Warm</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        <div class="ct-yr-switch" role="group" aria-label="Zeitraum">
          <button data-view="year"  class="active">Year</button>
          <button data-view="month">Month</button>
        </div>
        <div class="ct-yr-switch" role="group" aria-label="Miete">
          <button data-mode="warm"  class="active">Warm</button>
          <button data-mode="kalt">Kalt</button>
        </div>
      </div>
    </div>

    <div class="ct-kpis" style="grid-template-columns:1fr;">
      <div class="ct-kpi">
        <div class="ct-kpi__label" id="ctKpiLbl">Cashflow (Warm)</div>
        <div class="ct-kpi__val"   id="ctKpiVal">—</div>
        <div class="ct-kpi__sub"   id="ctKpiSub">Warmmiete − alle Ausgaben (inkl. Hausgeld)</div>
      </div>
    </div>

    <div class="ct-months" id="ctMonths"></div>

    <table class="ct-tbl" id="ctPropTbl">
      <thead>
        <tr>
          <th style="width:20px;">#</th>
          <th>Immobilie</th>
          <th class="num" id="ctThMiete">Warmmiete</th>
          <th class="num" id="ctThAusg">Ausgaben</th>
          <th class="num">Cashflow</th>
          <th class="ctr" id="ctThStatus" style="width:32px; display:none;"></th>
        </tr>
      </thead>
      <tbody id="ctPropTblBody"></tbody>
    </table>
  </div>
`;

/* ── Toggle wiring ──────────────────────────────────────────── */
document.querySelectorAll('#tab-dashboard [data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlDashView = btn.dataset.view;
    document.querySelectorAll('#tab-dashboard [data-view]')
      .forEach(b => b.classList.toggle('active', b.dataset.view === _ctlDashView));
    window.renderDashboard();
  });
});
document.querySelectorAll('#tab-dashboard [data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlDashMode = btn.dataset.mode;
    document.querySelectorAll('#tab-dashboard [data-mode]')
      .forEach(b => b.classList.toggle('active', b.dataset.mode === _ctlDashMode));
    window.renderDashboard();
  });
});

/* ── Mode-aware pickers ─────────────────────────────────────── */
function pickMiete(s) { return _ctlDashMode === 'warm' ? s.warm      : s.kalt; }
function pickExp(s)   { return _ctlDashMode === 'warm' ? s.exp_total : s.exp_net; }
function pickCash(s)  { return _ctlDashMode === 'warm' ? s.gesamt    : s.netto_kalt; }

/* ── Public entrypoint ──────────────────────────────────────── */
window.renderDashboard = function () {
  const y       = window._ctrl.year;
  const modeLbl = _ctlDashMode === 'warm' ? 'Warm' : 'Kalt';

  document.getElementById('ctDashSub').textContent =
    'Portfolio · ' + y + ' · ' + modeLbl +
    (_ctlDashView === 'month' ? ' · ' + ctlMonthName(_ctlDashMonth) : '');

  document.getElementById('ctKpiLbl').textContent = 'Cashflow (' + modeLbl + ')';
  document.getElementById('ctKpiSub').textContent = _ctlDashMode === 'warm'
    ? 'Warmmiete − alle Ausgaben (inkl. Hausgeld)'
    : 'Kaltmiete − Ausgaben ohne Hausgeld';

  document.getElementById('ctThMiete').textContent = _ctlDashMode === 'warm' ? 'Warmmiete'   : 'Kaltmiete';
  document.getElementById('ctThAusg').textContent  = _ctlDashMode === 'warm' ? 'Ausgaben'    : 'Ausg. o. HG';

  // Show Status column only in Month view
  document.getElementById('ctThStatus').style.display = (_ctlDashView === 'month') ? '' : 'none';

  renderMonthStrip();
  if (_ctlDashView === 'year') renderYear();
  else renderMonth(_ctlDashMonth);
};

/* ── Month tile strip ───────────────────────────────────────── */
function renderMonthStrip() {
  const strip = document.getElementById('ctMonths');
  strip.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const status = ctlMonthStatus(m);
    const tile   = document.createElement('div');
    tile.className = 'ct-month ' + status + (_ctlDashView === 'month' && m === _ctlDashMonth ? ' active' : '');
    const val = pickCash(ctlPortfolioMonth(m));
    tile.innerHTML =
      '<div class="ct-month__lbl">' + ctlMonthName(m) + '</div>' +
      (status === 'future'
        ? '<div class="ct-month__val" style="color:var(--cc-taupe);">—</div>'
        : '<div class="ct-month__val">' + ctlEur0(val) + '</div>');
    tile.addEventListener('click', () => {
      if (_ctlDashView === 'year') {
        _ctlDashView = 'month';
        document.querySelectorAll('#tab-dashboard [data-view]')
          .forEach(b => b.classList.toggle('active', b.dataset.view === 'month'));
      }
      _ctlDashMonth = m;
      window.renderDashboard();
    });
    strip.appendChild(tile);
  }
}

/* ── Status icon per property row ───────────────────────────── */
function statusIcon(pid, month) {
  const now  = new Date();
  const y    = window._ctrl.year;
  const isFuture = (y > now.getFullYear()) || (y === now.getFullYear() && month > now.getMonth() + 1);
  if (isFuture) return '<span style="color:var(--cc-stone);">—</span>';
  const filled = typeof hasEntriesFor === 'function' && hasEntriesFor(pid, month);
  return filled
    ? '<i class="ti ti-check" style="color:var(--cc-gold-dk,#7A5A2A);"></i>'
    : '<i class="ti ti-point-filled" style="color:var(--cc-gold);"></i>';
}

/* ── Year view ──────────────────────────────────────────────── */
function renderYear() {
  let tMiete = 0, tExp = 0, tCash = 0;
  const rows = window._ctrl.properties.filter(x => x.active).map(p => {
    let pMiete = 0, pExp = 0, pCash = 0;
    for (let m = 1; m <= 12; m++) {
      const s = ctlPropertyMonth(p.id, m);
      pMiete += pickMiete(s);
      pExp   += pickExp(s);
      pCash  += pickCash(s);
    }
    // one-time is already inside ctlPropertyMonth — no manual addition here
    return { p, pMiete, pExp, pCash };
  });
  rows.forEach(r => { tMiete += r.pMiete; tExp += r.pExp; tCash += r.pCash; });

  document.getElementById('ctKpiVal').textContent = ctlEur(tCash);
  document.getElementById('ctKpiVal').classList.toggle('neg', tCash < 0);

  let html = '';
  for (const { p, pMiete, pExp, pCash } of rows) {
    html +=
      '<tr>' +
        '<td>' + p.id + '</td>' +
        '<td>' + p.name + '</td>' +
        '<td class="num">' + ctlEur0(pMiete) + '</td>' +
        '<td class="num">' + ctlEur0(pExp)   + '</td>' +
        '<td class="num ' + (pCash < 0 ? 'neg' : '') + '">' + ctlEur0(pCash) + '</td>' +
      '</tr>';
  }
  html +=
    '<tr class="total">' +
      '<td></td><td>Gesamt</td>' +
      '<td class="num">' + ctlEur0(tMiete) + '</td>' +
      '<td class="num">' + ctlEur0(tExp)   + '</td>' +
      '<td class="num ' + (tCash < 0 ? 'neg' : '') + '">' + ctlEur0(tCash) + '</td>' +
    '</tr>';
  document.getElementById('ctPropTblBody').innerHTML = html;
}

/* ── Month view ─────────────────────────────────────────────── */
function renderMonth(m) {
  let tMiete = 0, tExp = 0, tCash = 0;
  let html = '';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const s     = ctlPropertyMonth(p.id, m);
    const miete = pickMiete(s), exp = pickExp(s), cash = pickCash(s);
    tMiete += miete; tExp += exp; tCash += cash;
    html +=
      '<tr style="cursor:pointer;" onclick="ctlOpenEntry(' + p.id + ',' + m + ')">' +
        '<td>' + p.id + '</td>' +
        '<td>' + p.name + '</td>' +
        '<td class="num">' + ctlEur0(miete) + '</td>' +
        '<td class="num">' + ctlEur0(exp)   + '</td>' +
        '<td class="num ' + (cash < 0 ? 'neg' : '') + '">' + ctlEur0(cash) + '</td>' +
        '<td class="ctr">' + statusIcon(p.id, m) + '</td>' +
      '</tr>';
  }
  document.getElementById('ctKpiVal').textContent = ctlEur(tCash);
  document.getElementById('ctKpiVal').classList.toggle('neg', tCash < 0);
  html +=
    '<tr class="total">' +
      '<td></td><td>Gesamt</td>' +
      '<td class="num">' + ctlEur0(tMiete) + '</td>' +
      '<td class="num">' + ctlEur0(tExp)   + '</td>' +
      '<td class="num ' + (tCash < 0 ? 'neg' : '') + '">' + ctlEur0(tCash) + '</td>' +
      '<td></td>' +
    '</tr>';
  document.getElementById('ctPropTblBody').innerHTML = html;
}
