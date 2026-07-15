/* ─────────────────────────────────────────────────────────────
   CONTROLLING — ENTRY DRAWER
   controlling-tab-entry.js

   Drawer opens from the Dashboard Month-view row click. No tab
   shell anymore — the Monthly Entry tab was consolidated into
   the Dashboard's Month view (status column).

   Sections in the drawer:
     · Income (per unit)
     · Expenses (apartment cols OR Casa categories)
     · Einmalige Ausgaben (Datum · Firma · Beschreibung · Betrag)

   Depends on: controlling-data.js
   ───────────────────────────────────────────────────────────── */

'use strict';

/* Used by dashboard to draw the Status icon per property row.
   ✓ done requires all recurring items to be filled, not just any one row. */
function hasEntriesFor(pid, month) {
  const y = window._ctrl.year;
  const units = ctlUnitsOf(pid);
  const unitIds = units.map(u => u.id);

  // Income check — at least one income row for this month, OR the property has
  // no rentable units at all (edge case: all def_kaltmiete = 0, permanently vacant).
  const hasRentable = units.some(u => Number(u.def_kaltmiete || 0) > 0);
  const hasIncome   = window._ctrl.income.some(r => r.year === y && r.month === month && unitIds.includes(r.unit_id));
  const incomeOk    = !hasRentable || hasIncome;
  if (!incomeOk) return false;

  // Expense check — every recurring line item must be present.
  if (pid === CASA_PROP_ID) {
    // All monatlich Casa categories must have a row for this month.
    // Vierteljährlich / jährlich / sporadisch are excluded — they don't apply every month.
    const monatlichCats = window._ctrl.categories.filter(c => c.frequency === 'monatlich');
    if (!monatlichCats.length) return true;   // no categories configured yet — don't block
    return monatlichCats.every(c =>
      window._ctrl.castel_expenses.some(r => r.category_id === c.id && r.year === y && r.month === month)
    );
  }

  // Apartments: single row must have rate AND hausgeld populated (0 counts as filled).
  const row = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month);
  if (!row) return false;
  return row.rate !== null && row.rate !== undefined
      && row.hausgeld !== null && row.hausgeld !== undefined;
}

/* ══ DRAWER ═══════════════════════════════════════════════════ */

let _ctlDrawer = { pid: null, month: null };

window.ctlOpenEntry = function (pid, month) {
  _ctlDrawer = { pid, month };
  const prop = ctlProp(pid);
  document.getElementById('ctDrawerTitle').textContent = prop.name + ' · ' + ctlMonthName(month) + ' ' + window._ctrl.year;
  document.getElementById('ctDrawer').dataset.opener = 'dashboard';
  document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(pid, month);
  document.getElementById('ctDrawer').classList.add('open');
  wireDrawerActions();
};

document.getElementById('ctDrawerClose').addEventListener('click', () => {
  const drawer = document.getElementById('ctDrawer');
  const opener = drawer.dataset.opener || 'dashboard';
  drawer.classList.remove('open');
  // Refresh whichever tab opened it — its aggregate numbers likely changed
  if (opener === 'onetime') window.renderOneTime?.();
  else                       window.renderDashboard?.();
});

function renderDrawerBody(pid, month) {
  const y = window._ctrl.year;
  const units = ctlUnitsOf(pid);
  const isCasa = pid === CASA_PROP_ID;

  /* Income section — one row per unit */
  let incomeHtml = '';
  incomeHtml += '<div class="ct-col-hdr"><div>Einheit</div><div>Kaltmiete</div><div>Nebenkosten</div></div>';
  for (const u of units) {
    const row  = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month);
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

  /* One-time section — read-only summary + deep-link to Einmalig tab */
  const ots = window._ctrl.one_time.filter(o => {
    if (o.property_id !== pid) return false;
    const d = ctlParseDate(o.invoice_date);
    return d.year === y && d.month === month;
  });
  const otCount = ots.length;
  const otTotal = ots.reduce((s, o) => s + Number(o.amount || 0), 0);
  const oneTimeSummary =
    '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
      '<div>' +
        '<div style="font-size:13px; color:var(--cc-charcoal);">' +
          (otCount === 0
            ? '<span style="color:var(--cc-stone);">Keine Einträge</span>'
            : otCount + ' Eintrag' + (otCount === 1 ? '' : 'e') + ' · <strong style="font-variant-numeric:tabular-nums;">' + ctlEur(otTotal) + '</strong>') +
        '</div>' +
        '<small style="font-size:10px; letter-spacing:.08em; color:var(--cc-taupe);">Erfassung im Einmalig-Tab</small>' +
      '</div>' +
      '<button class="ct-btn-sm primary" onclick="ctlOpenEinmalig(' + pid + ',' + month + ')" style="display:flex; align-items:center; gap:4px;">' +
        'Öffnen <i class="ti ti-arrow-right"></i>' +
      '</button>' +
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
      ${oneTimeSummary}
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
}

async function saveOne(inp) {
  const { pid, month } = _ctlDrawer;
  const kind = inp.dataset.kind;
  const val  = inp.value === '' ? null : Number(inp.value);
  try {
    if (kind === 'income-kalt' || kind === 'income-neben') {
      const unitId = Number(inp.dataset.unit);
      const kaltInp  = document.querySelector('input[data-kind="income-kalt"][data-unit="' + unitId + '"]');
      const nebenInp = document.querySelector('input[data-kind="income-neben"][data-unit="' + unitId + '"]');
      const kalt  = kaltInp.value  === '' ? null : Number(kaltInp.value);
      const neben = nebenInp.value === '' ? null : Number(nebenInp.value);
      await ctlUpsertIncome(unitId, month, kalt, neben);
    }
    else if (kind === 'apt') {
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

/* Fill helpers */
async function fillIncome(mode) {
  const { pid, month } = _ctlDrawer;
  const y = window._ctrl.year;
  const units = ctlUnitsOf(pid);
  for (const u of units) {
    const cur = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month);
    if (cur) continue;
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

/* Deep-link from drawer's Einmalig section → Einmalig tab, property drawer opens */
window.ctlOpenEinmalig = function (pid, month) {
  document.getElementById('ctDrawer').classList.remove('open');
  window.ctlOtDeepLink?.(pid, month);   // sets month filter
  switchTab('onetime');                 // renders surface with new filter
  window.ctlOtOpenProperty?.(pid);      // then opens the property drawer
};
