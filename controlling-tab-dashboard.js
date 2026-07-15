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

/* ── Persistent state (localStorage) ────────────────────────── */
function _ctlLoadDash() {
  try {
    return {
      view:    localStorage.getItem('ctl_view')  || 'year',
      mode:    localStorage.getItem('ctl_mode')  || 'warm',
      oneTime: localStorage.getItem('ctl_ot')    === '1',
      month:   Number(localStorage.getItem('ctl_month')) || (new Date().getMonth() + 1),
    };
  } catch (e) {
    return { view: 'year', mode: 'warm', oneTime: false, month: new Date().getMonth() + 1 };
  }
}
function _ctlSaveDash() {
  try {
    localStorage.setItem('ctl_view',  _ctlDashView);
    localStorage.setItem('ctl_mode',  _ctlDashMode);
    localStorage.setItem('ctl_ot',    _ctlDashOneTime ? '1' : '0');
    localStorage.setItem('ctl_month', String(_ctlDashMonth));
  } catch (e) {}
}

const _saved = _ctlLoadDash();
let _ctlDashView    = _saved.view;
let _ctlDashMode    = _saved.mode;
let _ctlDashOneTime = _saved.oneTime;
let _ctlDashMonth   = _saved.month;

document.getElementById('tab-dashboard').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Controlling</h1>
        <div class="ct-sub" id="ctDashSub">Portfolio · 2026</div>
      </div>
    </div>

    <div class="ct-toolbar" role="toolbar" aria-label="Ansicht">
      <div class="ct-yr-switch" role="group" aria-label="Zeitraum">
        <button data-view="year">Year</button>
        <button data-view="month">Month</button>
      </div>
      <div class="ct-yr-switch" role="group" aria-label="Miete">
        <button data-mode="warm">Warm</button>
        <button data-mode="kalt">Kalt</button>
      </div>
      <div class="ct-yr-switch" role="group" aria-label="Einmalige">
        <button data-ot="off">Laufend</button>
        <button data-ot="on">+ Einmalig</button>
      </div>
    </div>

    <div class="ct-kpis" style="grid-template-columns:1fr;">
      <div class="ct-kpi">
        <div class="ct-kpi__label" id="ctKpiLbl">Cashflow (Warm · Laufend)</div>
        <div class="ct-kpi__val"   id="ctKpiVal">—</div>
        <div class="ct-kpi__sub"   id="ctKpiSub">Warmmiete − laufende Ausgaben</div>
      </div>
    </div>

    <div class="ct-months" id="ctMonths"></div>

    <div class="ct-cardhead" aria-hidden="true">
      <span>Immobilie</span>
      <span>Cashflow</span>
    </div>

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

/* Apply active state from persisted preferences */
document.querySelectorAll('#tab-dashboard [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === _ctlDashView));
document.querySelectorAll('#tab-dashboard [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === _ctlDashMode));
document.querySelectorAll('#tab-dashboard [data-ot]  ').forEach(b => b.classList.toggle('active', (b.dataset.ot === 'on') === _ctlDashOneTime));

/* ── Toggle wiring ──────────────────────────────────────────── */
document.querySelectorAll('#tab-dashboard [data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlDashView = btn.dataset.view;
    document.querySelectorAll('#tab-dashboard [data-view]')
      .forEach(b => b.classList.toggle('active', b.dataset.view === _ctlDashView));
    _ctlSaveDash();
    window.renderDashboard();
  });
});
document.querySelectorAll('#tab-dashboard [data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlDashMode = btn.dataset.mode;
    document.querySelectorAll('#tab-dashboard [data-mode]')
      .forEach(b => b.classList.toggle('active', b.dataset.mode === _ctlDashMode));
    _ctlSaveDash();
    window.renderDashboard();
  });
});
document.querySelectorAll('#tab-dashboard [data-ot]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlDashOneTime = btn.dataset.ot === 'on';
    document.querySelectorAll('#tab-dashboard [data-ot]')
      .forEach(b => b.classList.toggle('active', (b.dataset.ot === 'on') === _ctlDashOneTime));
    _ctlSaveDash();
    window.renderDashboard();
  });
});

/* ── Mode-aware pickers ─────────────────────────────────────── */
function pickMiete(s) { return _ctlDashMode === 'warm' ? (Number(s.warm) || 0) : (Number(s.kalt) || 0); }
function pickExp(s) {
  const base = _ctlDashMode === 'warm' ? (Number(s.exp_total) || 0) : (Number(s.exp_net) || 0);
  const ot   = Number(s.one_time) || 0;
  return _ctlDashOneTime ? base + ot : base;
}
function pickCash(s) {
  const base = _ctlDashMode === 'warm' ? (Number(s.gesamt) || 0) : (Number(s.netto_kalt) || 0);
  const ot   = Number(s.one_time) || 0;
  return _ctlDashOneTime ? base - ot : base;
}

/* ── Public entrypoint ──────────────────────────────────────── */
window.renderDashboard = function () {
  const y       = window._ctrl.year;
  const modeLbl = _ctlDashMode === 'warm' ? 'Warm' : 'Kalt';
  const otLbl   = _ctlDashOneTime ? '+Einmalig' : 'Laufend';

  document.getElementById('ctDashSub').textContent =
    'Portfolio · ' + (_ctlDashView === 'month' ? ctlMonthName(_ctlDashMonth) + ' ' + y : y);

  document.getElementById('ctKpiLbl').textContent = 'Cashflow (' + modeLbl + ' · ' + otLbl + ')';

  // Sub-label matrix
  let sub;
  if (_ctlDashMode === 'warm' && !_ctlDashOneTime) sub = 'Warmmiete − laufende Ausgaben';
  else if (_ctlDashMode === 'warm' &&  _ctlDashOneTime) sub = 'Warmmiete − laufende + einmalige Ausgaben';
  else if (_ctlDashMode === 'kalt' && !_ctlDashOneTime) sub = 'Kaltmiete − laufende Ausgaben ohne Hausgeld';
  else                                                  sub = 'Kaltmiete − laufende + einmalige Ausgaben ohne Hausgeld';
  document.getElementById('ctKpiSub').textContent = sub;

  document.getElementById('ctThMiete').textContent = _ctlDashMode === 'warm' ? 'Warmmiete'   : 'Kaltmiete';
  document.getElementById('ctThAusg').textContent  = _ctlDashMode === 'warm' ? 'Ausgaben'    : 'Ausg. o. HG';

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
      _ctlSaveDash();
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
  // Desktop shows just the icon (narrow column); mobile expanded card also shows a word via .ct-statusword
  return filled
    ? '<span class="ct-statusword" style="color:var(--cc-avail-text);">erfasst</span><i class="ti ti-check" style="color:var(--cc-avail-text);"></i>'
    : '<span class="ct-statusword" style="color:var(--cc-notice-text);">offen</span><i class="ti ti-point-filled" style="color:var(--cc-gold);"></i>';
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
    const mLbl = _ctlDashMode === 'warm' ? 'Warmmiete' : 'Kaltmiete';
    const aLbl = _ctlDashMode === 'warm' ? 'Ausgaben' : 'Ausgaben (ohne Hausgeld)';
    html +=
      '<tr class="ct-proprow" onclick="ctlPropRowExpand(event)">' +
        '<td data-label="#">' + p.id + '</td>' +
        '<td data-label="Immobilie" class="ct-cell-name">' + p.name + '</td>' +
        '<td class="num" data-label="' + mLbl + '">' + ctlEur0(pMiete) + '</td>' +
        '<td class="num" data-label="' + aLbl + '">' + ctlEur0(pExp)   + '</td>' +
        '<td class="num ct-cell-cash ' + (pCash < 0 ? 'neg' : '') + '" data-label="Cashflow">' + ctlEur0Signed(pCash) + '</td>' +
      '</tr>';
  }
  html +=
    '<tr class="total">' +
      '<td data-label="#"></td><td data-label="Immobilie" class="ct-cell-name">Gesamt</td>' +
      '<td class="num" data-label="Miete">' + ctlEur0(tMiete) + '</td>' +
      '<td class="num" data-label="Ausgaben">' + ctlEur0(tExp)   + '</td>' +
      '<td class="num ct-cell-cash ' + (tCash < 0 ? 'neg' : '') + '" data-label="Cashflow">' + ctlEur0(tCash) + '</td>' +
    '</tr>';
  document.getElementById('ctPropTblBody').innerHTML = html;
}

/* Year-view row: mobile tap just expands the breakdown (no drawer). */
window.ctlPropRowExpand = function (ev) {
  if (!window.matchMedia('(max-width: 640px)').matches) return;
  const row = ev.currentTarget;
  const was = row.classList.contains('expanded');
  document.querySelectorAll('#ctPropTblBody .ct-proprow.expanded').forEach(r => { if (r !== row) r.classList.remove('expanded'); });
  row.classList.toggle('expanded', !was);
};

/* ── Month view ─────────────────────────────────────────────── */
/* Row click behavior differs by viewport:
   · Desktop (>640px): open the entry drawer directly
   · Mobile (<=640px): first tap expands the card; the revealed
     "Erfassen" button opens the drawer                          */
window.ctlPropRowClick = function (ev, pid, month) {
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  if (!isMobile) { ctlOpenEntry(pid, month); return; }
  // Don't toggle if the Erfassen button itself was tapped
  if (ev.target.closest('.ct-erfassen-btn')) return;
  const row = ev.currentTarget;
  const wasExpanded = row.classList.contains('expanded');
  // Collapse siblings for a clean accordion feel
  document.querySelectorAll('#ctPropTblBody .ct-proprow.expanded').forEach(r => {
    if (r !== row) { r.classList.remove('expanded'); r.querySelector('.ct-erfassen-row')?.remove(); }
  });
  if (wasExpanded) {
    row.classList.remove('expanded');
    row.querySelector('.ct-erfassen-row')?.remove();
  } else {
    row.classList.add('expanded');
    if (!row.querySelector('.ct-erfassen-row')) {
      const td = document.createElement('td');
      td.className = 'ct-erfassen-row';
      td.setAttribute('colspan', '6');
      td.innerHTML = '<button class="ct-btn-sm primary ct-erfassen-btn" ' +
        'onclick="ctlOpenEntry(' + pid + ',' + month + ')" ' +
        'style="width:100%;margin-top:10px;padding:9px;display:flex;align-items:center;justify-content:center;gap:6px;">' +
        '<i class="ti ti-pencil"></i> Erfassen</button>';
      row.appendChild(td);
    }
  }
};

function renderMonth(m) {
  let tMiete = 0, tExp = 0, tCash = 0;
  let html = '';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const s     = ctlPropertyMonth(p.id, m);
    const miete = pickMiete(s), exp = pickExp(s), cash = pickCash(s);
    tMiete += miete; tExp += exp; tCash += cash;
    const mLbl = _ctlDashMode === 'warm' ? 'Warmmiete' : 'Kaltmiete';
    const aLbl = _ctlDashMode === 'warm' ? 'Ausgaben' : 'Ausgaben (ohne Hausgeld)';
    html +=
      '<tr class="ct-proprow" data-pid="' + p.id + '" data-month="' + m + '" onclick="ctlPropRowClick(event, ' + p.id + ',' + m + ')">' +
        '<td data-label="#">' + p.id + '</td>' +
        '<td data-label="Immobilie" class="ct-cell-name">' + p.name + '</td>' +
        '<td class="num" data-label="' + mLbl + '">' + ctlEur0(miete) + '</td>' +
        '<td class="num" data-label="' + aLbl + '">' + ctlEur0(exp)   + '</td>' +
        '<td class="num ct-cell-cash ' + (cash < 0 ? 'neg' : '') + '" data-label="Cashflow">' + ctlEur0Signed(cash) + '</td>' +
        '<td class="ctr" data-label="Status">' + statusIcon(p.id, m) + '</td>' +
      '</tr>';
  }
  document.getElementById('ctKpiVal').textContent = ctlEur(tCash);
  document.getElementById('ctKpiVal').classList.toggle('neg', tCash < 0);
  html +=
    '<tr class="total">' +
      '<td data-label="#"></td><td data-label="Immobilie" class="ct-cell-name">Gesamt</td>' +
      '<td class="num" data-label="Miete">' + ctlEur0(tMiete) + '</td>' +
      '<td class="num" data-label="Ausgaben">' + ctlEur0(tExp)   + '</td>' +
      '<td class="num ct-cell-cash ' + (tCash < 0 ? 'neg' : '') + '" data-label="Cashflow">' + ctlEur0(tCash) + '</td>' +
      '<td data-label="Status"></td>' +
    '</tr>';
  document.getElementById('ctPropTblBody').innerHTML = html;
}
