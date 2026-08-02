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
  if (opener === 'onetime')      window.renderOneTime?.();
  else if (opener === 'setup')   window.renderSetup?.();
  else if (opener === 'income')  window.renderIncome?.();
  else if (opener === 'expenses')window.renderExpenses?.();
  else                           window.renderDashboard?.();
});

function renderDrawerBody(pid, month) {
  const y = window._ctrl.year;
  const units = ctlUnitsOf(pid);
  const isCasa = pid === CASA_PROP_ID;

  const fmtChip = v => (Number(v) % 1 === 0 ? String(Number(v)) : Number(v).toFixed(2).replace('.', ','));

  /* One entry row: input shows ONLY the saved value; suggestions are chips outside. */
  function entryRow(lbl, sub, isOpen, val, chips, dataAttrs) {
    const openTag = isOpen
      ? (sub ? ' · ' : '') + '<span style="color:var(--cc-notice-text);font-weight:600;">offen</span>'
      : '';
    const savedMark = !isOpen
      ? '<i class="ti ti-check" style="color:var(--cc-avail-text);font-size:14px;"></i>'
      : '';
    let chipsHtml = '';
    if (isOpen && chips.length) {
      chipsHtml = chips.map(c =>
        '<button class="ct-btn-sm ct-chip" ' + dataAttrs + ' data-chip-amt="' + c.amount + '" ' +
          'style="font-variant-numeric:tabular-nums;padding:4px 8px;">' + c.label + '</button>'
      ).join('');
    }
    return (
      '<div class="ct-row" style="grid-template-columns:1fr 96px minmax(52px,auto);">' +
        '<div class="ct-row__lbl">' + lbl + (sub || openTag ? '<small>' + (sub || '') + openTag + '</small>' : '') + '</div>' +
        '<input class="ct-input" type="text" inputmode="decimal" ' +
          dataAttrs + ' value="' + (val === '' ? '' : String(val).replace('.', ',')) + '" placeholder=""/>' +
        '<div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">' +
          savedMark + chipsHtml +
        '</div>' +
      '</div>'
    );
  }

  /* ── Einnahmen ──────────────────────────────────────────────── */
  let incomeFilled = 0;
  let incomeHtml = '<div class="ct-col-hdr" style="grid-template-columns:1fr 96px minmax(52px,auto);"><div>Einheit</div><div>Betrag</div><div></div></div>';
  for (const u of units) {
    const row  = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month);
    const prev = window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === month - 1);
    if (row) incomeFilled++;

    const kOpen  = !row || row.kaltmiete === null || row.kaltmiete === undefined;
    const kChips = [];
    if (kOpen) {
      const s = prev?.kaltmiete ?? u.def_kaltmiete;
      if (s !== null && s !== undefined) kChips.push({ amount: s, label: fmtChip(s) });
      if (Number(s) !== 0) kChips.push({ amount: 0, label: '0' });
    }
    incomeHtml += entryRow(u.name, 'Kaltmiete', kOpen, row?.kaltmiete ?? '', kChips.slice(0,2), 'data-kind="income-kalt" data-unit="' + u.id + '"');

    const nOpen  = !row || row.nebenkosten === null || row.nebenkosten === undefined;
    const nChips = [];
    if (nOpen) {
      const s = prev?.nebenkosten ?? u.def_nebenkosten;
      if (s !== null && s !== undefined) nChips.push({ amount: s, label: fmtChip(s) });
      if (Number(s) !== 0) nChips.push({ amount: 0, label: '0' });
    }
    incomeHtml += entryRow('&nbsp;', 'Nebenkosten', nOpen, row?.nebenkosten ?? '', nChips.slice(0,2), 'data-kind="income-neben" data-unit="' + u.id + '"');
  }

  /* ── Ausgaben ───────────────────────────────────────────────── */
  let expenseHtml = '', expFilled = 0, expTotalRows = 0;
  if (isCasa) {
    expTotalRows = window._ctrl.categories.length;
    expenseHtml += '<div class="ct-col-hdr" style="grid-template-columns:1fr 96px minmax(52px,auto);"><div>Kategorie</div><div>Betrag</div><div></div></div>';
    for (const c of window._ctrl.categories) {
      const row  = window._ctrl.castel_expenses.find(r => r.category_id === c.id && r.year === y && r.month === month);
      const prev = window._ctrl.castel_expenses.find(r => r.category_id === c.id && r.year === y && r.month === month - 1);
      if (row) expFilled++;
      const isOpen = !row;
      const chips  = [];
      if (isOpen) {
        const isDue = Array.isArray(c.due_months) && c.due_months.includes(month);
        if (isDue && c.default_amount !== null && c.default_amount !== undefined) {
          chips.push({ amount: c.default_amount, label: fmtChip(c.default_amount) });
          if (Number(c.default_amount) !== 0) chips.push({ amount: 0, label: '0' });
        } else if (!isDue && Array.isArray(c.due_months) && c.due_months.length) {
          chips.push({ amount: 0, label: '0' });
          if (c.default_amount) chips.push({ amount: c.default_amount, label: fmtChip(c.default_amount) });
        } else {
          const s = prev?.amount;
          if (s !== null && s !== undefined && Number(s) !== 0) chips.push({ amount: s, label: fmtChip(s) });
          chips.push({ amount: 0, label: '0' });
        }
      }
      expenseHtml += entryRow(c.name, c.frequency || '', isOpen, row?.amount ?? '', chips.slice(0,2), 'data-kind="castel" data-cat="' + c.id + '"');
    }
  } else {
    const p = ctlProp(pid);
    const row  = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month);
    const prev = window._ctrl.apt_expenses.find(r => r.property_id === pid && r.year === y && r.month === month - 1);
    const fields = [
      { key: 'rate',        lbl: 'Rate',        sub: 'Zinsen + Tilgung' },
      { key: 'zinsen',      lbl: 'Zinsen',      sub: '' },
      { key: 'tilgung',     lbl: 'Tilgung',     sub: '' },
      { key: 'hausgeld',    lbl: 'Hausgeld',    sub: 'durchlaufend' },
      { key: 'grundsteuer', lbl: 'Grundsteuer', sub: '' },
      { key: 'strom',       lbl: 'Strom',       sub: '' },
    ];
    expTotalRows = fields.length;
    expenseHtml += '<div class="ct-col-hdr" style="grid-template-columns:1fr 96px minmax(52px,auto);"><div></div><div>Betrag</div><div></div></div>';
    for (const f of fields) {
      const isOpen = !row || row[f.key] === null || row[f.key] === undefined;
      if (!isOpen) expFilled++;
      const chips = [];
      if (isOpen) {
        const s = prev?.[f.key] ?? p['def_' + f.key];
        if (s !== null && s !== undefined && Number(s) !== 0) chips.push({ amount: s, label: fmtChip(s) });
        chips.push({ amount: 0, label: '0' });
      }
      expenseHtml += entryRow(f.lbl, f.sub, isOpen, row?.[f.key] ?? '', chips.slice(0,2), 'data-kind="apt" data-field="' + f.key + '"');
    }
  }

  /* ── One-time summary ───────────────────────────────────────── */
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
            : (otCount === 1 ? '1 Eintrag' : otCount + ' Einträge') + ' · <strong style="font-variant-numeric:tabular-nums;">' + ctlEur(otTotal) + '</strong>') +
        '</div>' +
        '<small style="font-size:10px; letter-spacing:.08em; color:var(--cc-taupe);">Erfassung im Einmalig-Tab</small>' +
      '</div>' +
      '<button class="ct-btn-sm primary" onclick="ctlOpenEinmalig(' + pid + ',' + month + ')" style="display:flex; align-items:center; gap:4px;">' +
        'Öffnen <i class="ti ti-arrow-right"></i>' +
      '</button>' +
    '</div>';

  const hint = '<div style="font-size:10px;color:var(--cc-taupe);margin:-4px 0 10px;letter-spacing:.03em;">Füllt nur offene Felder — gespeicherte Werte bleiben unverändert.</div>';

  return `
    <div class="ct-section">
      <div class="ct-section__ttl">
        <span>Einnahmen · ${incomeFilled}/${units.length} erfasst</span>
        <div class="ct-section__actions">
          <button class="ct-btn-sm" id="ctFillIncomeDefaults" title="Offene Felder aus Standardplan füllen">Plan übernehmen</button>
          <button class="ct-btn-sm" id="ctFillIncomePrev" title="Offene Felder aus Vormonat füllen">Wie Vormonat</button>
        </div>
      </div>
      ${hint}
      ${incomeHtml}
    </div>

    <div class="ct-section">
      <div class="ct-section__ttl">
        <span>${isCasa ? 'Kosten' : 'Ausgaben'} · ${expFilled}/${expTotalRows} erfasst</span>
        <div class="ct-section__actions">
          <button class="ct-btn-sm" id="ctFillExpDefaults" title="Offene Felder aus Standardplan füllen">Plan übernehmen</button>
          <button class="ct-btn-sm" id="ctFillExpPrev" title="Offene Felder aus Vormonat füllen">Wie Vormonat</button>
        </div>
      </div>
      ${hint}
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

/* ── Wire drawer inputs (save on blur), chips, and action buttons ── */
function wireDrawerActions() {
  const body = document.getElementById('ctDrawerBody');

  body.querySelectorAll('input.ct-input').forEach(inp => {
    inp.addEventListener('focus', () => inp.classList.add('dirty'));
    inp.addEventListener('blur',  () => saveOne(inp));
  });

  // Suggestion chips: write the value into the matching input, then save
  body.querySelectorAll('button.ct-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const amt = Number(chip.dataset.chipAmt);
      // find the sibling input in the same row by matching data attributes
      let sel = 'input.ct-input[data-kind="' + chip.dataset.kind + '"]';
      if (chip.dataset.unit)  sel += '[data-unit="'  + chip.dataset.unit  + '"]';
      if (chip.dataset.cat)   sel += '[data-cat="'   + chip.dataset.cat   + '"]';
      if (chip.dataset.field) sel += '[data-field="' + chip.dataset.field + '"]';
      const inp = body.querySelector(sel);
      if (!inp) return;
      inp.value = String(amt).replace('.', ',');
      await saveOne(inp);
      // re-render so the row flips from "offen" to saved with ✓ and progress count updates
      document.getElementById('ctDrawerBody').innerHTML = renderDrawerBody(_ctlDrawer.pid, _ctlDrawer.month);
      wireDrawerActions();
    });
  });

  document.getElementById('ctFillIncomeDefaults')?.addEventListener('click', () => fillIncome('defaults'));
  document.getElementById('ctFillIncomePrev')    ?.addEventListener('click', () => fillIncome('prev'));
  document.getElementById('ctFillExpDefaults')   ?.addEventListener('click', () => fillExpense('defaults'));
  document.getElementById('ctFillExpPrev')       ?.addEventListener('click', () => fillExpense('prev'));
}

// Parse a user-entered amount, accepting the German decimal comma (e.g. "263,51")
function _ctlNum(el) {
  const v = ((el && el.value) || '').trim();
  return v === '' ? null : Number(v.replace(',', '.'));
}

async function saveOne(inp) {
  const { pid, month } = _ctlDrawer;
  const kind = inp.dataset.kind;
  const val  = _ctlNum(inp);
  try {
    if (kind === 'income-kalt' || kind === 'income-neben') {
      const unitId = Number(inp.dataset.unit);
      const kaltInp  = document.querySelector('input[data-kind="income-kalt"][data-unit="' + unitId + '"]');
      const nebenInp = document.querySelector('input[data-kind="income-neben"][data-unit="' + unitId + '"]');
      const kalt  = _ctlNum(kaltInp);
      const neben = _ctlNum(nebenInp);
      await ctlUpsertIncome(unitId, month, kalt, neben);
    }
    else if (kind === 'apt') {
      const fields = {};
      document.querySelectorAll('input[data-kind="apt"]').forEach(x => {
        fields[x.dataset.field] = _ctlNum(x);
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
        const hasSchedule = Array.isArray(c.due_months) && c.due_months.length;
        const isDue       = hasSchedule && c.due_months.includes(month);
        if (isDue) {
          amt = c.default_amount ?? null;            // due this month → standing amount
        } else if (hasSchedule) {
          amt = 0;                                   // scheduled but not due → explicit 0
        } else if (c.frequency === 'monatlich') {
          amt = c.default_amount ?? null;            // monatlich w/o schedule → default
        } else {
          amt = null;                                // sporadisch → leave open
        }
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
