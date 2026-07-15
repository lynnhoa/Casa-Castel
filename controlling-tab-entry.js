/* ─────────────────────────────────────────────────────────────
   CONTROLLING — MONTHLY ENTRY TAB + DRAWER
   controlling-tab-entry.js

   Landing: property list × month picker. Tap a cell → drawer.
   Drawer sections:
     · Income (per unit)
     · Expenses (apartment cols OR Casa categories)
     · One-Time (list + add)
   Two big actions:
     · Confirm as expected  — fills empty fields from defaults
     · Copy from previous   — fills empty fields from last month
   All inputs save on blur.

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlEntryMonth = new Date().getMonth() + 1;

document.getElementById('tab-entry').innerHTML = `
  <div class="ct-page">
    <div class="ct-hdr">
      <div>
        <h1 class="ct-title">Monthly Entry</h1>
        <div class="ct-sub" id="ctEntrySub">— · Tippe eine Immobilie</div>
      </div>
    </div>

    <!-- Month picker -->
    <div class="ct-months" id="ctEntryMonths" style="margin-bottom:16px;"></div>

    <!-- Property list — same table as dashboard, but every row opens the drawer -->
    <table class="ct-tbl">
      <thead>
        <tr>
          <th style="width:20px;">#</th>
          <th>Immobilie</th>
          <th class="num">Kaltmiete</th>
          <th class="num">Ausgaben</th>
          <th class="num">Status</th>
        </tr>
      </thead>
      <tbody id="ctEntryTblBody"></tbody>
    </table>
  </div>
`;

window.renderEntry = function () {
  document.getElementById('ctEntrySub').textContent =
    ctlMonthName(_ctlEntryMonth) + ' ' + window._ctrl.year + ' · Tippe eine Immobilie';
  // month strip
  const strip = document.getElementById('ctEntryMonths');
  strip.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const status = ctlMonthStatus(m);
    const tile = document.createElement('div');
    tile.className = 'ct-month ' + status + (m === _ctlEntryMonth ? ' active' : '');
    tile.innerHTML =
      '<div class="ct-month__lbl">' + ctlMonthName(m) + '</div>' +
      '<div class="ct-month__val">' +
        (status === 'done' ? '<i class="ti ti-check"></i>' :
         status === 'pending' ? '<i class="ti ti-point-filled" style="color:var(--cc-gold);"></i>' :
         '—') +
      '</div>';
    tile.addEventListener('click', () => { _ctlEntryMonth = m; window.renderEntry(); });
    strip.appendChild(tile);
  }
  // property table
  const tbody = document.getElementById('ctEntryTblBody');
  let rows = '';
  for (const p of window._ctrl.properties.filter(x => x.active)) {
    const s = ctlPropertyMonth(p.id, _ctlEntryMonth);
    const filled = hasEntriesFor(p.id, _ctlEntryMonth);
    rows +=
      '<tr style="cursor:pointer;" onclick="ctlOpenEntry(' + p.id + ',' + _ctlEntryMonth + ')">' +
        '<td>' + p.id + '</td>' +
        '<td>' + p.name + '</td>' +
        '<td class="num">' + ctlEur0(s.kalt) + '</td>' +
        '<td class="num">' + ctlEur0(s.exp_total) + '</td>' +
        '<td class="num" style="color:' + (filled ? 'var(--cc-gold-dk,#7A5A2A)' : 'var(--cc-taupe)') + ';">' +
          (filled ? '<i class="ti ti-check"></i>' : '<i class="ti ti-pencil"></i>') +
        '</td>' +
      '</tr>';
  }
  tbody.innerHTML = rows;
};

function hasEntriesFor(pid, month) {
  const y = window._ctrl.year;
  const unitIds = ctlUnitsOf(pid).map(u => u.id);
  const inc = window._ctrl.income.some(r => r.year === y && r.month === month && unitIds.includes(r.unit_id));
  if (pid === CASA_PROP_ID) {
    const cst = window._ctrl.castel_expenses.some(r => r.year === y && r.month === month);
    return inc && cst;
  }
  const apt = window._ctrl.apt_expenses.some(r => r.year === y && r.month === month && r.property_id === pid);
  return inc && apt;
}

/* ══ DRAWER ═══════════════════════════════════════════════════ */

let _ctlDrawer = { pid: null, month: null };

window.ctlOpenEntry = function (pid, month) {
  _ctlDrawer = { pid, month };
  const prop = ctlProp(pid);
  document.getElementById('ctDrawerTitle').textContent = prop.name + ' · ' + ctlMonthName(month) + ' ' + window._ctrl.year;
  document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(pid, month);
  document.getElementById('ctDrawer').classList.add('open');
  wireDrawerActions();
};

document.getElementById('ctDrawerClose').addEventListener('click', () => {
  document.getElementById('ctDrawer').classList.remove('open');
  // Refresh dashboard + entry view because numbers likely changed
  window.renderDashboard?.();
  window.renderEntry?.();
});

function renderDrawerBody(pid, month) {
  const y = window._ctrl.year;
  const units = ctlUnitsOf(pid);
  const isCasa = pid === CASA_PROP_ID;

  /* Income section — one row per unit */
  let incomeHtml = '';
  incomeHtml += '<div class="ct-col-hdr"><div>Einheit</div><div>Kaltmiete</div><div>Nebenkosten</div></div>';
  for (const u of units) {
    const row = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month);
    const prev = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month - 1);
    const kalt  = row?.kaltmiete   ?? '';
    const neben = row?.nebenkosten ?? '';
    const defK  = row?.kaltmiete   ?? prev?.kaltmiete   ?? u.def_kaltmiete   ?? '';
    const defN  = row?.nebenkosten ?? prev?.nebenkosten ?? u.def_nebenkosten ?? '';
    incomeHtml +=
      '<div class="ct-row">' +
        '<div class="ct-row__lbl">' + u.name + '<small>' + (u.unit_type || '') + '</small></div>' +
        '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
          'data-kind="income-kalt" data-unit="' + u.id + '" ' +
          'value="' + (kalt === '' ? '' : kalt) + '" placeholder="' + (defK === '' ? '0' : defK) + '"/>' +
        '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
          'data-kind="income-neben" data-unit="' + u.id + '" ' +
          'value="' + (neben === '' ? '' : neben) + '" placeholder="' + (defN === '' ? '0' : defN) + '"/>' +
      '</div>';
  }

  /* Expense section */
  let expenseHtml = '';
  if (isCasa) {
    expenseHtml += '<div class="ct-col-hdr"><div>Kategorie</div><div>Betrag</div><div></div></div>';
    for (const c of window._ctrl.categories) {
      const row  = window._ctrl.castel_expenses.find(r => r.category_id === c.id && r.year === y && r.month === month);
      const prev = window._ctrl.castel_expenses.find(r => r.category_id === c.id && r.year === y && r.month === month - 1);
      const val  = row?.amount ?? '';
      const def  = row?.amount ?? prev?.amount ?? c.default_amount ?? '';
      expenseHtml +=
        '<div class="ct-row">' +
          '<div class="ct-row__lbl">' + c.name + '<small>' + (c.frequency || '') + '</small></div>' +
          '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
            'data-kind="castel" data-cat="' + c.id + '" ' +
            'value="' + (val === '' ? '' : val) + '" placeholder="' + (def === '' ? '0' : def) + '"/>' +
          '<div></div>' +
        '</div>';
    }
  } else {
    const p = ctlProp(pid);
    const row  = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month);
    const prev = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month - 1);
    const fields = [
      { key: 'rate',        lbl: 'Rate',        sub: 'Zinsen + Tilgung' },
      { key: 'zinsen',      lbl: 'Zinsen',      sub: '' },
      { key: 'tilgung',     lbl: 'Tilgung',     sub: '' },
      { key: 'hausgeld',    lbl: 'Hausgeld',    sub: 'passthrough' },
      { key: 'grundsteuer', lbl: 'Grundsteuer', sub: '' },
      { key: 'strom',       lbl: 'Strom',       sub: '' },
    ];
    expenseHtml += '<div class="ct-col-hdr"><div></div><div>Aktuell</div><div></div></div>';
    for (const f of fields) {
      const val = row?.[f.key] ?? '';
      const def = row?.[f.key] ?? prev?.[f.key] ?? p['def_' + f.key] ?? '';
      expenseHtml +=
        '<div class="ct-row">' +
          '<div class="ct-row__lbl">' + f.lbl + (f.sub ? '<small>' + f.sub + '</small>' : '') + '</div>' +
          '<input class="ct-input" type="number" step="0.01" inputmode="decimal" ' +
            'data-kind="apt" data-field="' + f.key + '" ' +
            'value="' + (val === '' ? '' : val) + '" placeholder="' + (def === '' ? '0' : def) + '"/>' +
          '<div></div>' +
        '</div>';
    }
  }

  /* One-time section */
  const ots = window._ctrl.one_time
    .filter(o => o.property_id === pid && new Date(o.invoice_date).getMonth() + 1 === month && new Date(o.invoice_date).getFullYear() === y)
    .sort((a, b) => (a.invoice_date < b.invoice_date ? -1 : 1));
  let oneTimeHtml = '';
  if (ots.length) {
    oneTimeHtml += '<div class="ct-col-hdr"><div>Datum · Item</div><div>Betrag</div><div></div></div>';
    for (const o of ots) {
      oneTimeHtml +=
        '<div class="ct-row">' +
          '<div class="ct-row__lbl">' + o.invoice_date + '<small>' + (o.item || '') + '</small></div>' +
          '<div class="ct-row__lbl" style="text-align:right;font-variant-numeric:tabular-nums;">' + ctlEur(o.amount) + '</div>' +
          '<div style="text-align:right;"><button class="ct-btn-sm" onclick="ctlRemoveOneTime(' + o.id + ')"><i class="ti ti-trash"></i></button></div>' +
        '</div>';
    }
  }
  oneTimeHtml +=
    '<div style="display:grid;grid-template-columns:110px 1fr 90px 40px;gap:6px;margin-top:10px;align-items:center;">' +
      '<input class="ct-input" type="date"   id="ctOtDate" style="text-align:left;" value="' + window._ctrl.year + '-' + String(month).padStart(2,'0') + '-01"/>' +
      '<input class="ct-input" type="text"   id="ctOtItem" style="text-align:left;" placeholder="Item"/>' +
      '<input class="ct-input" type="number" id="ctOtAmt"  step="0.01" inputmode="decimal" placeholder="0,00"/>' +
      '<button class="ct-btn-sm primary" id="ctOtAdd"><i class="ti ti-plus"></i></button>' +
    '</div>';

  return `
    <div class="ct-section">
      <div class="ct-section__ttl">
        <span>Income</span>
        <div class="ct-section__actions">
          <button class="ct-btn-sm" id="ctFillIncomeDefaults">Confirm as expected</button>
          <button class="ct-btn-sm" id="ctFillIncomePrev">Copy previous</button>
        </div>
      </div>
      ${incomeHtml}
    </div>

    <div class="ct-section">
      <div class="ct-section__ttl">
        <span>${isCasa ? 'Casa Castel — Kosten' : 'Ausgaben'}</span>
        <div class="ct-section__actions">
          <button class="ct-btn-sm" id="ctFillExpDefaults">Confirm as expected</button>
          <button class="ct-btn-sm" id="ctFillExpPrev">Copy previous</button>
        </div>
      </div>
      ${expenseHtml}
    </div>

    <div class="ct-section">
      <div class="ct-section__ttl">
        <span>Einmalige Ausgaben</span>
      </div>
      ${oneTimeHtml}
    </div>
  `;
}

/* ── Wire drawer inputs (save on blur) and action buttons ───── */
function wireDrawerActions() {
  const body = document.getElementById('ctDrawerBody');

  body.querySelectorAll('input.ct-input').forEach(inp => {
    inp.addEventListener('focus', () => inp.classList.add('dirty'));
    inp.addEventListener('blur',  () => saveOne(inp));
  });

  document.getElementById('ctFillIncomeDefaults')?.addEventListener('click', () => fillIncome('defaults'));
  document.getElementById('ctFillIncomePrev')    ?.addEventListener('click', () => fillIncome('prev'));
  document.getElementById('ctFillExpDefaults')   ?.addEventListener('click', () => fillExpense('defaults'));
  document.getElementById('ctFillExpPrev')       ?.addEventListener('click', () => fillExpense('prev'));

  document.getElementById('ctOtAdd')?.addEventListener('click', addOneTime);
}

async function saveOne(inp) {
  const { pid, month } = _ctlDrawer;
  const kind = inp.dataset.kind;
  const val  = inp.value === '' ? null : Number(inp.value);
  try {
    if (kind === 'income-kalt' || kind === 'income-neben') {
      const unitId = Number(inp.dataset.unit);
      // read the OTHER field from DOM
      const kaltInp  = document.querySelector('input[data-kind="income-kalt"][data-unit="' + unitId + '"]');
      const nebenInp = document.querySelector('input[data-kind="income-neben"][data-unit="' + unitId + '"]');
      const kalt  = kaltInp.value  === '' ? null : Number(kaltInp.value);
      const neben = nebenInp.value === '' ? null : Number(nebenInp.value);
      await ctlUpsertIncome(unitId, month, kalt, neben);
    }
    else if (kind === 'apt') {
      const field  = inp.dataset.field;
      const fields = {};
      document.querySelectorAll('input[data-kind="apt"]').forEach(x => {
        fields[x.dataset.field] = x.value === '' ? null : Number(x.value);
      });
      await ctlUpsertApt(pid, month, fields);
    }
    else if (kind === 'castel') {
      const catId = Number(inp.dataset.cat);
      await ctlUpsertCastel(catId, month, val);
    }
    inp.classList.remove('dirty');
  } catch (e) {
    console.error('[controlling] save failed:', e);
    ctlToast('Speichern fehlgeschlagen');
  }
}

/* Fill helpers — write to inputs then trigger the save flow */
async function fillIncome(mode) {
  const { pid, month } = _ctlDrawer;
  const y = window._ctrl.year;
  const units = ctlUnitsOf(pid);
  for (const u of units) {
    const cur    = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month);
    if (cur) continue;  // don't overwrite existing entries
    let k = null, n = null;
    if (mode === 'defaults') {
      k = u.def_kaltmiete   ?? null;
      n = u.def_nebenkosten ?? null;
    } else {
      const prev = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month - 1);
      if (!prev) continue;
      k = prev.kaltmiete   ?? null;
      n = prev.nebenkosten ?? null;
    }
    if (k === null && n === null) continue;
    await ctlUpsertIncome(u.id, month, k, n);
  }
  ctlToast('Income aktualisiert');
  document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(pid, month);
  wireDrawerActions();
}

async function fillExpense(mode) {
  const { pid, month } = _ctlDrawer;
  const y = window._ctrl.year;

  if (pid === CASA_PROP_ID) {
    for (const c of window._ctrl.categories) {
      const cur = window._ctrl.castel_expenses.find(r => r.category_id === c.id && r.year === y && r.month === month);
      if (cur) continue;
      let amt = null;
      if (mode === 'defaults') {
        if (c.frequency === 'monatlich' || c.frequency === 'sporadisch') amt = c.default_amount ?? null;
        // quarterly / annual — skip in default fill; user handles manually
      } else {
        const prev = window._ctrl.castel_expenses.find(r => r.category_id === c.id && r.year === y && r.month === month - 1);
        amt = prev?.amount ?? null;
      }
      if (amt === null) continue;
      await ctlUpsertCastel(c.id, month, amt);
    }
  } else {
    const cur = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month);
    if (!cur) {
      const p = ctlProp(pid);
      const fields = {};
      if (mode === 'defaults') {
        for (const k of ['rate','zinsen','tilgung','hausgeld','grundsteuer','strom']) fields[k] = p['def_' + k] ?? null;
      } else {
        const prev = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month - 1);
        if (!prev) { ctlToast('Kein Vormonat'); return; }
        for (const k of ['rate','zinsen','tilgung','hausgeld','grundsteuer','strom']) fields[k] = prev[k] ?? null;
      }
      await ctlUpsertApt(pid, month, fields);
    }
  }
  ctlToast('Ausgaben aktualisiert');
  document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(_ctlDrawer.pid, _ctlDrawer.month);
  wireDrawerActions();
}

async function addOneTime() {
  const date = document.getElementById('ctOtDate').value;
  const item = document.getElementById('ctOtItem').value.trim();
  const amt  = Number(document.getElementById('ctOtAmt').value);
  if (!date || !item || !amt) { ctlToast('Datum · Item · Betrag'); return; }
  try {
    await ctlInsertOneTime(_ctlDrawer.pid, date, item, amt);
    ctlToast('Hinzugefügt');
    document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(_ctlDrawer.pid, _ctlDrawer.month);
    wireDrawerActions();
  } catch (e) {
    console.error(e); ctlToast('Fehler');
  }
}

window.ctlRemoveOneTime = async function (id) {
  if (!confirm('Löschen?')) return;
  try {
    await ctlDeleteOneTime(id);
    document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(_ctlDrawer.pid, _ctlDrawer.month);
    wireDrawerActions();
  } catch (e) {
    console.error(e); ctlToast('Fehler');
  }
};
