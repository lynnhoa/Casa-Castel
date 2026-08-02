/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINNAHMEN (INCOME) TAB
   controlling-tab-income.js

   Income-only view — "what comes in", mirroring the Excel Income
   sheet: Warmmiete headline, Kaltmiete + Nebenkosten broken out,
   per property, drilldown to per-unit.

   Read-only: income is entered via the Dashboard month-entry drawer.
   These are the same numbers the Dashboard nets into Cashflow, shown
   gross so the incoming side is legible on its own.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlIncView  = (function(){ try { return localStorage.getItem('ctl_inc_view') || 'year'; } catch(e){ return 'year'; } })();
let _ctlIncMonth = (function(){ try { return Number(localStorage.getItem('ctl_inc_month')) || (new Date().getMonth()+1); } catch(e){ return new Date().getMonth()+1; } })();
function _ctlIncSave(){ try { localStorage.setItem('ctl_inc_view', _ctlIncView); localStorage.setItem('ctl_inc_month', String(_ctlIncMonth)); } catch(e){} }

document.getElementById('tab-income').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Einnahmen</h1>
        <div class="ct-sub" id="ctIncSub">Portfolio · 2026</div>
      </div>
    </div>

    <div class="ct-toolbar" role="toolbar" aria-label="Ansicht">
      <div class="ct-yr-switch" role="group" aria-label="Zeitraum">
        <button data-incview="year">Year</button>
        <button data-incview="month">Month</button>
      </div>
    </div>

    <div class="ct-kpis" style="grid-template-columns:1fr;">
      <div class="ct-kpi">
        <div class="ct-kpi__label">Einnahmen · Warmmiete</div>
        <div class="ct-kpi__val" id="ctIncKpiVal">—</div>
        <div class="ct-kpi__sub" id="ctIncKpiSub">—</div>
      </div>
    </div>

    <div class="ct-months" id="ctIncMonths"></div>

    <div class="ct-cardhead" aria-hidden="true"><span>Immobilie</span><span>Warmmiete</span></div>

    <table class="ct-tbl ct-listtbl" id="ctIncTbl">
      <thead>
        <tr>
          <th style="width:20px;">#</th>
          <th>Immobilie</th>
          <th class="num">Kaltmiete</th>
          <th class="num">Nebenkosten</th>
          <th class="num">Warmmiete</th>
          <th style="width:24px;"></th>
        </tr>
      </thead>
      <tbody id="ctIncTblBody"></tbody>
    </table>
  </div>
`;

document.querySelectorAll('#tab-income [data-incview]').forEach(b => b.classList.toggle('active', b.dataset.incview === _ctlIncView));
document.querySelectorAll('#tab-income [data-incview]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlIncView = btn.dataset.incview;
    document.querySelectorAll('#tab-income [data-incview]').forEach(b => b.classList.toggle('active', b.dataset.incview === _ctlIncView));
    _ctlIncSave();
    window.renderIncome();
  });
});

/* Period income for one property → {kalt, neben, warm} */
function _ctlIncProp(pid) {
  if (_ctlIncView === 'month') {
    const s = ctlPropertyMonth(pid, _ctlIncMonth);
    return { kalt: s.kalt, neben: s.neben, warm: s.warm };
  }
  let kalt = 0, neben = 0;
  for (let m = 1; m <= 12; m++) { const s = ctlPropertyMonth(pid, m); kalt += s.kalt; neben += s.neben; }
  return { kalt, neben, warm: kalt + neben };
}

/* Per-unit income for the drawer breakdown (mirrors Excel Income sheet rows) */
function _ctlIncUnits(pid) {
  const y = window._ctrl.year;
  const months = _ctlIncView === 'month' ? [_ctlIncMonth] : [1,2,3,4,5,6,7,8,9,10,11,12];
  return ctlUnitsOf(pid).map(u => {
    let kalt = 0, neben = 0;
    for (const row of window._ctrl.income) {
      if (row.unit_id !== u.id || row.year !== y || !months.includes(row.month)) continue;
      kalt += Number(row.kaltmiete || 0);
      neben += Number(row.nebenkosten || 0);
    }
    return { u, kalt, neben, warm: kalt + neben };
  });
}

window.renderIncome = function () {
  const y = window._ctrl.year;
  document.getElementById('ctIncSub').textContent =
    'Portfolio · ' + (_ctlIncView === 'month' ? ctlMonthName(_ctlIncMonth) + ' ' + y : y);

  /* Month strip — portfolio Warmmiete per month */
  const strip = document.getElementById('ctIncMonths');
  strip.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const status = ctlMonthStatus(m);
    const tile = document.createElement('div');
    tile.className = 'ct-month ' + status + (_ctlIncView === 'month' && m === _ctlIncMonth ? ' active' : '');
    const s = ctlPortfolioMonth(m);
    tile.innerHTML =
      '<div class="ct-month__lbl">' + ctlMonthName(m) + '</div>' +
      (status === 'future'
        ? '<div class="ct-month__val" style="color:var(--cc-taupe);">—</div>'
        : '<div class="ct-month__val">' + ctlEur0(s.warm) + '</div>');
    tile.addEventListener('click', () => {
      if (_ctlIncView === 'year') {
        _ctlIncView = 'month';
        document.querySelectorAll('#tab-income [data-incview]').forEach(b => b.classList.toggle('active', b.dataset.incview === 'month'));
      }
      _ctlIncMonth = m;
      _ctlIncSave();
      window.renderIncome();
    });
    strip.appendChild(tile);
  }

  /* Property rows */
  let tK = 0, tN = 0, tW = 0, html = '';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const s = _ctlIncProp(p.id);
    tK += s.kalt; tN += s.neben; tW += s.warm;
    html +=
      '<tr class="ct-proprow" style="cursor:pointer;" onclick="ctlIncOpen(' + p.id + ')">' +
        '<td data-label="#">' + p.id + '</td>' +
        '<td data-label="Immobilie" class="ct-cell-name">' + p.name + '</td>' +
        '<td class="num" data-label="Kaltmiete">' + ctlEur0(s.kalt) + '</td>' +
        '<td class="num" data-label="Nebenkosten">' + ctlEur0(s.neben) + '</td>' +
        '<td class="num ct-cell-head" data-label="Warmmiete">' + ctlEur0(s.warm) + '</td>' +
        '<td style="text-align:right;color:var(--cc-taupe);"><i class="ti ti-chevron-right"></i></td>' +
      '</tr>';
  }
  html +=
    '<tr class="total">' +
      '<td data-label="#"></td><td data-label="Immobilie" class="ct-cell-name">Gesamt</td>' +
      '<td class="num ct-total-detail" data-label="Kaltmiete">' + ctlEur0(tK) + '</td>' +
      '<td class="num ct-total-detail" data-label="Nebenkosten">' + ctlEur0(tN) + '</td>' +
      '<td class="num ct-cell-head" data-label="Warmmiete">' + ctlEur0(tW) + '</td>' +
      '<td></td>' +
    '</tr>';
  document.getElementById('ctIncTblBody').innerHTML = html;

  document.getElementById('ctIncKpiVal').textContent = ctlEur(tW);
  document.getElementById('ctIncKpiSub').textContent = 'Kaltmiete ' + ctlEur0(tK) + ' · Nebenkosten ' + ctlEur0(tN);
};

/* ══ PROPERTY DRAWER — per-unit income ═══════════════════════ */
window.ctlIncOpen = function (pid) {
  const prop = ctlProp(pid);
  document.getElementById('ctDrawerTitle').textContent = prop.name + ' · Einnahmen';
  document.getElementById('ctDrawer').dataset.opener = 'income';

  const units = _ctlIncUnits(pid);
  const tot = units.reduce((a, u) => ({ kalt: a.kalt + u.kalt, neben: a.neben + u.neben, warm: a.warm + u.warm }), { kalt: 0, neben: 0, warm: 0 });
  const scope = _ctlIncView === 'month' ? ctlMonthName(_ctlIncMonth) + ' ' + window._ctrl.year : window._ctrl.year;

  let body =
    '<div class="ct-section" style="margin-bottom:14px;"><div style="text-align:center;padding:4px 0;">' +
      '<div style="font-size:10px;font-weight:500;letter-spacing:.11em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:6px;">Warmmiete · ' + scope + '</div>' +
      '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:28px;color:var(--cc-ink);font-variant-numeric:lining-nums tabular-nums;">' + ctlEur(tot.warm) + '</div>' +
      '<div style="font-size:11px;color:var(--cc-taupe);margin-top:4px;">Kaltmiete ' + ctlEur(tot.kalt) + ' · Nebenkosten ' + ctlEur(tot.neben) + '</div>' +
    '</div></div>';

  body += '<div class="ct-section"><div class="ct-section__ttl"><span>Einheiten</span></div>';
  if (!units.length) {
    body += '<div style="padding:20px 0;text-align:center;color:var(--cc-stone);font-size:12px;">Keine Einheiten hinterlegt</div>';
  } else {
    for (const { u, kalt, neben, warm } of units) {
      body +=
        '<div class="ct-row" style="grid-template-columns:1fr auto;">' +
          '<div class="ct-row__lbl">' + u.name + '<small>Kalt ' + ctlEur(kalt) + ' · NK ' + ctlEur(neben) + '</small></div>' +
          '<div class="ct-row__lbl" style="text-align:right;font-variant-numeric:tabular-nums;">' + ctlEur(warm) + '</div>' +
        '</div>';
    }
  }
  body += '</div>';

  document.getElementById('ctDrawerBody').innerHTML = body;
  document.getElementById('ctDrawer').classList.add('open');
};
