/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DASHBOARD TAB
   controlling-tab-dashboard.js

   M/Y toggle · KPI cards (Gesamt + Netto-Kaltcashflow) ·
   month tile strip · per-property table.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlDashView  = 'year';       // 'year' | 'month'
let _ctlDashMonth = new Date().getMonth() + 1;  // 1..12

document.getElementById('tab-dashboard').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title" id="ctDashTitle">Controlling</h1>
        <div class="ct-sub" id="ctDashSub">Portfolio · 2026</div>
      </div>
      <div class="ct-yr-switch" role="group">
        <button data-view="year"  class="active">Year</button>
        <button data-view="month">Month</button>
      </div>
    </div>

    <div class="ct-kpis">
      <div class="ct-kpi">
        <div class="ct-kpi__label">Gesamt-Cashflow</div>
        <div class="ct-kpi__val"   id="ctKpiGesamt">—</div>
        <div class="ct-kpi__sub">Warmmiete − alle Ausgaben</div>
      </div>
      <div class="ct-kpi">
        <div class="ct-kpi__label">Netto-Kaltcashflow</div>
        <div class="ct-kpi__val"   id="ctKpiNetto">—</div>
        <div class="ct-kpi__sub">Kaltmiete − Ausgaben ohne Hausgeld</div>
      </div>
    </div>

    <div class="ct-months" id="ctMonths"></div>

    <table class="ct-tbl" id="ctPropTbl">
      <thead>
        <tr>
          <th style="width:20px;">#</th>
          <th>Immobilie</th>
          <th class="num">Kaltmiete</th>
          <th class="num">Ausgaben</th>
          <th class="num">Gesamt</th>
          <th class="num">Netto-Kalt</th>
        </tr>
      </thead>
      <tbody id="ctPropTblBody"></tbody>
    </table>
  </div>
`;

/* View toggle */
document.querySelectorAll('#tab-dashboard .ct-yr-switch button').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlDashView = btn.dataset.view;
    document.querySelectorAll('#tab-dashboard .ct-yr-switch button')
      .forEach(b => b.classList.toggle('active', b.dataset.view === _ctlDashView));
    window.renderDashboard();
  });
});

/* Public entrypoint */
window.renderDashboard = function () {
  const y = window._ctrl.year;
  document.getElementById('ctDashSub').textContent =
    'Portfolio · ' + y + (_ctlDashView === 'month' ? ' · ' + ctlMonthName(_ctlDashMonth) : '');

  renderMonthStrip();
  if (_ctlDashView === 'year') renderYear();
  else renderMonth(_ctlDashMonth);
};

/* ── Month strip ────────────────────────────────────────────── */
function renderMonthStrip() {
  const strip = document.getElementById('ctMonths');
  const showValues = _ctlDashView === 'month';
  strip.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const status = ctlMonthStatus(m);
    const tile = document.createElement('div');
    tile.className = 'ct-month ' + status + (_ctlDashView === 'month' && m === _ctlDashMonth ? ' active' : '');
    const g = ctlPortfolioMonth(m).gesamt;
    tile.innerHTML =
      '<div class="ct-month__lbl">' + ctlMonthName(m) + '</div>' +
      (status === 'future'
        ? '<div class="ct-month__val" style="color:var(--cc-taupe);">—</div>'
        : '<div class="ct-month__val">' + ctlEur0(g) + '</div>');
    tile.addEventListener('click', () => {
      if (_ctlDashView === 'year') {
        _ctlDashView = 'month';
        document.querySelectorAll('#tab-dashboard .ct-yr-switch button')
          .forEach(b => b.classList.toggle('active', b.dataset.view === 'month'));
      }
      _ctlDashMonth = m;
      window.renderDashboard();
    });
    strip.appendChild(tile);
  }
}

/* ── Year view ──────────────────────────────────────────────── */
function renderYear() {
  const y = ctlPortfolioYear();
  document.getElementById('ctKpiGesamt').textContent = ctlEur(y.gesamt);
  document.getElementById('ctKpiGesamt').classList.toggle('neg', y.gesamt < 0);
  document.getElementById('ctKpiNetto').textContent  = ctlEur(y.netto_kalt);
  document.getElementById('ctKpiNetto').classList.toggle('neg', y.netto_kalt < 0);

  const tbody = document.getElementById('ctPropTblBody');
  let rows = '';
  let tKalt = 0, tExp = 0, tG = 0, tN = 0;
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    let pKalt = 0, pExp = 0, pG = 0, pN = 0;
    for (let m = 1; m <= 12; m++) {
      const s = ctlPropertyMonth(p.id, m);
      pKalt += s.kalt;
      pExp  += s.exp_total;
      pG    += s.gesamt;
      pN    += s.netto_kalt;
    }
    // subtract this property's one-time expenses from Gesamt + Netto-Kalt
    const ot = window._ctrl.one_time
      .filter(o => o.property_id === p.id)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    pG -= ot; pN -= ot; pExp += ot;

    tKalt += pKalt; tExp += pExp; tG += pG; tN += pN;
    rows +=
      '<tr>' +
        '<td>' + p.id + '</td>' +
        '<td>' + p.name + '</td>' +
        '<td class="num">' + ctlEur0(pKalt) + '</td>' +
        '<td class="num">' + ctlEur0(pExp) + '</td>' +
        '<td class="num ' + (pG < 0 ? 'neg' : '') + '">' + ctlEur0(pG) + '</td>' +
        '<td class="num ' + (pN < 0 ? 'neg' : '') + '">' + ctlEur0(pN) + '</td>' +
      '</tr>';
  }
  rows +=
    '<tr class="total">' +
      '<td></td><td>Gesamt</td>' +
      '<td class="num">' + ctlEur0(tKalt) + '</td>' +
      '<td class="num">' + ctlEur0(tExp)  + '</td>' +
      '<td class="num ' + (tG < 0 ? 'neg' : '') + '">' + ctlEur0(tG) + '</td>' +
      '<td class="num ' + (tN < 0 ? 'neg' : '') + '">' + ctlEur0(tN) + '</td>' +
    '</tr>';
  tbody.innerHTML = rows;
}

/* ── Month view ─────────────────────────────────────────────── */
function renderMonth(m) {
  const p = ctlPortfolioMonth(m);
  document.getElementById('ctKpiGesamt').textContent = ctlEur(p.gesamt);
  document.getElementById('ctKpiGesamt').classList.toggle('neg', p.gesamt < 0);
  document.getElementById('ctKpiNetto').textContent  = ctlEur(p.netto_kalt);
  document.getElementById('ctKpiNetto').classList.toggle('neg', p.netto_kalt < 0);

  const tbody = document.getElementById('ctPropTblBody');
  let rows = '';
  let tKalt = 0, tExp = 0, tG = 0, tN = 0;
  for (const pr of window._ctrl.properties.filter(x => x.active)) {
    const s = ctlPropertyMonth(pr.id, m);
    tKalt += s.kalt; tExp += s.exp_total; tG += s.gesamt; tN += s.netto_kalt;
    rows +=
      '<tr style="cursor:pointer;" onclick="ctlOpenEntry(' + pr.id + ',' + m + ')">' +
        '<td>' + pr.id + '</td>' +
        '<td>' + pr.name + '</td>' +
        '<td class="num">' + ctlEur0(s.kalt) + '</td>' +
        '<td class="num">' + ctlEur0(s.exp_total) + '</td>' +
        '<td class="num ' + (s.gesamt < 0 ? 'neg' : '') + '">' + ctlEur0(s.gesamt) + '</td>' +
        '<td class="num ' + (s.netto_kalt < 0 ? 'neg' : '') + '">' + ctlEur0(s.netto_kalt) + '</td>' +
      '</tr>';
  }
  rows +=
    '<tr class="total">' +
      '<td></td><td>Gesamt</td>' +
      '<td class="num">' + ctlEur0(tKalt) + '</td>' +
      '<td class="num">' + ctlEur0(tExp)  + '</td>' +
      '<td class="num ' + (tG < 0 ? 'neg' : '') + '">' + ctlEur0(tG) + '</td>' +
      '<td class="num ' + (tN < 0 ? 'neg' : '') + '">' + ctlEur0(tN) + '</td>' +
    '</tr>';
  tbody.innerHTML = rows;
}
