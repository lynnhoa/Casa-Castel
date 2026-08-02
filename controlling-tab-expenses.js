/* ─────────────────────────────────────────────────────────────
   CONTROLLING — AUSGABEN (EXPENSES) TAB
   controlling-tab-expenses.js

   Expenses-only view that answers the core question the Dashboard
   buries: how much is monthly-recurring vs one-time.

   Two totals kept strictly apart:
     · Laufend   = recurring monthly expenses (exp_total)
                   Apartments → Rate/Zinsen/Tilgung/Hausgeld/Grundsteuer/Strom
                   Casa Castel → per-category amounts (with Häufigkeit)
                   Mirrors the Excel "Expense" + "Expense Castel" sheets.
     · Einmalig  = one-time expenses (managed on the Einmalig tab)

   Read-only surface; drilldown shows the per-category breakdown plus
   a clearly-separated one-time subtotal that links to the Einmalig tab.

   Depends on: controlling-data.js, controlling-tab-onetime.js (deep link)
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlExpView  = (function(){ try { return localStorage.getItem('ctl_exp_view') || 'year'; } catch(e){ return 'year'; } })();
let _ctlExpMonth = (function(){ try { return Number(localStorage.getItem('ctl_exp_month')) || (new Date().getMonth()+1); } catch(e){ return new Date().getMonth()+1; } })();
function _ctlExpSave(){ try { localStorage.setItem('ctl_exp_view', _ctlExpView); localStorage.setItem('ctl_exp_month', String(_ctlExpMonth)); } catch(e){} }

document.getElementById('tab-expenses').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Ausgaben</h1>
        <div class="ct-sub" id="ctExpSub">Portfolio · 2026</div>
      </div>
    </div>

    <div class="ct-toolbar" role="toolbar" aria-label="Ansicht">
      <div class="ct-yr-switch" role="group" aria-label="Zeitraum">
        <button data-expview="year">Year</button>
        <button data-expview="month">Month</button>
      </div>
    </div>

    <div class="ct-kpis">
      <div class="ct-kpi">
        <div class="ct-kpi__label">Laufend · monatlich</div>
        <div class="ct-kpi__val" id="ctExpKpiLaufend">—</div>
        <div class="ct-kpi__sub">Wiederkehrende Ausgaben</div>
      </div>
      <div class="ct-kpi">
        <div class="ct-kpi__label">Einmalig</div>
        <div class="ct-kpi__val" id="ctExpKpiEinmalig">—</div>
        <div class="ct-kpi__sub">Einmalige Ausgaben</div>
      </div>
    </div>

    <div class="ct-months" id="ctExpMonths"></div>

    <div class="ct-cardhead" aria-hidden="true"><span>Immobilie</span><span>Laufend</span></div>

    <table class="ct-tbl ct-listtbl" id="ctExpTbl">
      <thead>
        <tr>
          <th style="width:20px;">#</th>
          <th>Immobilie</th>
          <th class="num">Laufend</th>
          <th class="num">Einmalig</th>
          <th style="width:24px;"></th>
        </tr>
      </thead>
      <tbody id="ctExpTblBody"></tbody>
    </table>
  </div>
`;

document.querySelectorAll('#tab-expenses [data-expview]').forEach(b => b.classList.toggle('active', b.dataset.expview === _ctlExpView));
document.querySelectorAll('#tab-expenses [data-expview]').forEach(btn => {
  btn.addEventListener('click', () => {
    _ctlExpView = btn.dataset.expview;
    document.querySelectorAll('#tab-expenses [data-expview]').forEach(b => b.classList.toggle('active', b.dataset.expview === _ctlExpView));
    _ctlExpSave();
    window.renderExpenses();
  });
});

function _ctlExpMonths() {
  return _ctlExpView === 'month' ? [_ctlExpMonth] : [1,2,3,4,5,6,7,8,9,10,11,12];
}

/* Period recurring + one-time for one property → {laufend, einmalig} */
function _ctlExpProp(pid) {
  let laufend = 0, einmalig = 0;
  for (const m of _ctlExpMonths()) {
    const s = ctlPropertyMonth(pid, m);
    laufend += s.exp_total;
    einmalig += s.one_time;
  }
  return { laufend, einmalig };
}

/* Recurring breakdown for the drawer (mirrors Excel Expense / Expense Castel).
   Apartments → fixed category fields. Casa Castel → per-category with frequency. */
function _ctlExpBreakdown(pid) {
  const y = window._ctrl.year;
  const months = _ctlExpMonths();
  if (pid === CASA_PROP_ID) {
    const rows = window._ctrl.categories.map(c => {
      let amt = 0;
      for (const r of window._ctrl.castel_expenses) {
        if (r.category_id !== c.id || r.year !== y || !months.includes(r.month)) continue;
        amt += Number(r.amount || 0);
      }
      return { name: c.name, freq: c.frequency || '', amt };
    });
    return { kind: 'casa', rows, total: rows.reduce((s, r) => s + r.amt, 0) };
  }
  const f = { rate: 0, zinsen: 0, tilgung: 0, hausgeld: 0, grundsteuer: 0, strom: 0 };
  for (const r of window._ctrl.apt_expenses) {
    if (r.property_id !== pid || r.year !== y || !months.includes(r.month)) continue;
    for (const k in f) f[k] += Number(r[k] || 0);
  }
  // exp_total is rate + hausgeld + grundsteuer + strom (Rate already = Zinsen + Tilgung)
  return { kind: 'apt', f, total: f.rate + f.hausgeld + f.grundsteuer + f.strom };
}

window.renderExpenses = function () {
  const y = window._ctrl.year;
  document.getElementById('ctExpSub').textContent =
    'Portfolio · ' + (_ctlExpView === 'month' ? ctlMonthName(_ctlExpMonth) + ' ' + y : y);

  /* Month strip — portfolio recurring (laufend) per month */
  const strip = document.getElementById('ctExpMonths');
  strip.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const status = ctlMonthStatus(m);
    const tile = document.createElement('div');
    tile.className = 'ct-month ' + status + (_ctlExpView === 'month' && m === _ctlExpMonth ? ' active' : '');
    const s = ctlPortfolioMonth(m);
    tile.innerHTML =
      '<div class="ct-month__lbl">' + ctlMonthName(m) + '</div>' +
      (status === 'future'
        ? '<div class="ct-month__val" style="color:var(--cc-taupe);">—</div>'
        : '<div class="ct-month__val">' + ctlEur0(s.exp_total) + '</div>');
    tile.addEventListener('click', () => {
      if (_ctlExpView === 'year') {
        _ctlExpView = 'month';
        document.querySelectorAll('#tab-expenses [data-expview]').forEach(b => b.classList.toggle('active', b.dataset.expview === 'month'));
      }
      _ctlExpMonth = m;
      _ctlExpSave();
      window.renderExpenses();
    });
    strip.appendChild(tile);
  }

  /* Property rows */
  let tL = 0, tE = 0, html = '';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const s = _ctlExpProp(p.id);
    tL += s.laufend; tE += s.einmalig;
    const eStyle = s.einmalig > 0 ? '' : ' style="color:var(--cc-stone);"';
    html +=
      '<tr class="ct-proprow" style="cursor:pointer;" onclick="ctlExpOpen(' + p.id + ')">' +
        '<td data-label="#">' + p.id + '</td>' +
        '<td data-label="Immobilie" class="ct-cell-name">' + p.name + '</td>' +
        '<td class="num ct-cell-head" data-label="Laufend">' + ctlEur0(s.laufend) + '</td>' +
        '<td class="num" data-label="Einmalig"' + eStyle + '>' + (s.einmalig > 0 ? ctlEur0(s.einmalig) : '—') + '</td>' +
        '<td style="text-align:right;color:var(--cc-taupe);"><i class="ti ti-chevron-right"></i></td>' +
      '</tr>';
  }
  html +=
    '<tr class="total">' +
      '<td data-label="#"></td><td data-label="Immobilie" class="ct-cell-name">Gesamt</td>' +
      '<td class="num ct-cell-head" data-label="Laufend">' + ctlEur0(tL) + '</td>' +
      '<td class="num ct-total-detail" data-label="Einmalig">' + ctlEur0(tE) + '</td>' +
      '<td></td>' +
    '</tr>';
  document.getElementById('ctExpTblBody').innerHTML = html;

  document.getElementById('ctExpKpiLaufend').textContent = ctlEur(tL);
  document.getElementById('ctExpKpiEinmalig').textContent = ctlEur(tE);
};

/* ══ PROPERTY DRAWER — recurring breakdown + one-time subtotal ═══ */
window.ctlExpOpen = function (pid) {
  const prop = ctlProp(pid);
  document.getElementById('ctDrawerTitle').textContent = prop.name + ' · Ausgaben';
  document.getElementById('ctDrawer').dataset.opener = 'expenses';

  const bd = _ctlExpBreakdown(pid);
  const { einmalig } = _ctlExpProp(pid);
  const scope = _ctlExpView === 'month' ? ctlMonthName(_ctlExpMonth) + ' ' + window._ctrl.year : window._ctrl.year;

  const line = (lbl, val, sub, muted) =>
    '<div class="ct-row" style="grid-template-columns:1fr auto;">' +
      '<div class="ct-row__lbl"' + (muted ? ' style="color:var(--cc-stone);"' : '') + '>' + lbl + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
      '<div class="ct-row__lbl" style="text-align:right;font-variant-numeric:tabular-nums;' + (muted ? 'color:var(--cc-stone);' : '') + '">' + ctlEur(val) + '</div>' +
    '</div>';

  /* Laufend summary card */
  let body =
    '<div class="ct-section" style="margin-bottom:14px;"><div style="text-align:center;padding:4px 0;">' +
      '<div style="font-size:10px;font-weight:500;letter-spacing:.11em;text-transform:uppercase;color:var(--cc-taupe);margin-bottom:6px;">Laufend · ' + scope + '</div>' +
      '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:28px;color:var(--cc-ink);font-variant-numeric:lining-nums tabular-nums;">' + ctlEur(bd.total) + '</div>' +
      '<div style="font-size:11px;color:var(--cc-taupe);margin-top:4px;">Wiederkehrende Ausgaben</div>' +
    '</div></div>';

  /* Recurring breakdown */
  body += '<div class="ct-section"><div class="ct-section__ttl"><span>Laufende Ausgaben</span></div>';
  if (bd.kind === 'casa') {
    const active = bd.rows.filter(r => r.amt !== 0);
    if (!active.length) {
      body += '<div style="padding:20px 0;text-align:center;color:var(--cc-stone);font-size:12px;">Keine laufenden Ausgaben erfasst</div>';
    } else {
      for (const r of active) body += line(r.name, r.amt, r.freq, false);
    }
  } else {
    const f = bd.f;
    body += line('Rate', f.rate, 'Zinsen ' + ctlEur(f.zinsen) + ' · Tilgung ' + ctlEur(f.tilgung), f.rate === 0);
    body += line('Hausgeld', f.hausgeld, 'durchlaufend', f.hausgeld === 0);
    body += line('Grundsteuer', f.grundsteuer, '', f.grundsteuer === 0);
    body += line('Strom', f.strom, '', f.strom === 0);
  }
  body += '</div>';

  /* One-time — clearly separated, links to the Einmalig tab */
  body +=
    '<div class="ct-section">' +
      '<div class="ct-section__ttl"><span>Einmalig</span></div>' +
      '<div class="ct-row" style="grid-template-columns:1fr auto;border-bottom:0;">' +
        '<div class="ct-row__lbl"' + (einmalig > 0 ? '' : ' style="color:var(--cc-stone);"') + '>Einmalige Ausgaben<small>' + scope + '</small></div>' +
        '<div class="ct-row__lbl" style="text-align:right;font-variant-numeric:tabular-nums;' + (einmalig > 0 ? '' : 'color:var(--cc-stone);') + '">' + ctlEur(einmalig) + '</div>' +
      '</div>' +
      '<button class="ct-btn-sm" style="width:100%;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px;" onclick="ctlExpOpenEinmalig(' + pid + ')">' +
        '<i class="ti ti-external-link"></i> In Einmalig öffnen</button>' +
    '</div>';

  document.getElementById('ctDrawerBody').innerHTML = body;
  document.getElementById('ctDrawer').classList.add('open');
};

/* Hand off to the Einmalig tab, scoped to the same period + this property */
window.ctlExpOpenEinmalig = function (pid) {
  document.getElementById('ctDrawer').classList.remove('open');
  if (typeof window.ctlOtDeepLink === 'function') {
    window.ctlOtDeepLink(pid, _ctlExpView === 'month' ? _ctlExpMonth : 'all');
  }
  if (typeof switchTab === 'function') switchTab('onetime');
  setTimeout(() => window.ctlOtOpenProperty?.(pid), 60);
};
