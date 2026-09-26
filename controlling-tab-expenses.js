/* ─────────────────────────────────────────────────────────────
   CONTROLLING — AUSGABEN (enter running costs)
   controlling-tab-expenses.js

   Same pattern as Einnahmen. Per property:
     Apartments   Kreditrate (Properties) · Hausgeld (Rentals) ·
                  Grundsteuer (Rentals, only in its months) · Strom
     Casa Castel  cost types by frequency / due months (Setup);
                  Kreditrate from the Properties loan
   · Costs not due this month: one grey "nicht fällig" line.
   · Kreditrate: one field; Zins and Tilgung are stored from the loan.
   · One-time costs live only in the Einmalig tab.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxExpIndex = {};                                   // row id → { p, row }
const _CX_APT_LABEL = { rate: 'Kreditrate', hausgeld: 'Hausgeld', grundsteuer: 'Grundsteuer', strom: 'Strom' };

function _cxExpModel() {
  const y = window._ctrl.year, m = CX.month;
  _cxExpIndex = {};
  return window._ctrl.properties.filter(p => p.active).map(p => {
    const casa = p.id === CASA_PROP_ID;
    const plan = casa ? ctlCasaCostRows(p, y, m) : ctlCostRows(p, y, m);
    const rows = plan.rows.map(r => Object.assign({}, r));
    if (casa) {
      for (const r of rows) {
        const x = window._ctrl.castel_expenses.find(e => e.category_id === r.catId && e.year === y && e.month === m);
        r.ist = x ? cxR(x.amount) : null;
      }
      // entered although not planned this month → still shown
      for (const x of window._ctrl.castel_expenses.filter(e => e.year === y && e.month === m)) {
        if (rows.some(r => r.catId === x.category_id)) continue;
        const c = ctlCat(x.category_id);
        rows.push({ key: 'cat:' + x.category_id, catId: x.category_id, label: (c && c.name) || 'Kosten', soll: 0, sub: (c && c.frequency) || '', src: 'Setup', ist: cxR(x.amount) });
      }
    } else {
      const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m);
      for (const r of rows) r.ist = row && row[r.key] !== null && row[r.key] !== undefined ? cxR(row[r.key]) : null;
      if (row) for (const k of ['rate', 'hausgeld', 'grundsteuer', 'strom']) {
        if (rows.some(r => r.key === k) || row[k] === null || row[k] === undefined || Number(row[k]) === 0) continue;
        rows.push({ key: k, label: _CX_APT_LABEL[k], soll: 0, sub: 'nicht geplant', src: '', ist: cxR(row[k]) });
      }
    }
    for (const r of rows) { r.id = 'exp:' + p.id + ':' + r.key; _cxExpIndex[r.id] = { p, row: r }; }
    return { p, rows, notDue: plan.notDue };
  });
}

window.renderExpenses = function () {
  const host = document.getElementById('tab-expenses');
  if (!host) return;
  CX.tab = 'expenses';
  const model = _cxExpModel();
  let done = 0, plan = 0, open = 0;
  model.forEach(g => g.rows.forEach(r => { plan += r.soll; if (r.ist !== null) done += r.ist; else if (r.soll) open++; }));

  const cards = model.map(g => {
    const body = g.rows.map(r => cxRow({ id: r.id, label: r.label, soll: r.soll, ist: r.ist,
        sub: cxEsc(r.sub || '') + (r.src ? ' · <span class="cx-from">aus ' + cxEsc(r.src) + '</span>' : ''),
        notes: r.note ? [r.note] : [], emptyText: 'nicht geplant', allowEmpty: true })).join('') + cxNotDue(g.notDue);
    const n = g.rows.length;
    return cxCard({ key: 'exp:' + g.p.id, title: g.p.name, sub: n === 1 ? '1 Posten' : n + ' Posten',
                    status: cxGroupStatus(g.rows), sum: g.rows.reduce((s, r) => s + (r.ist || 0), 0),
                    extraPill: g.rows.some(r => r.note) ? cxPill('beige', 'Änderung') : '', body });
  }).join('');

  host.innerHTML = '<div class="cx-page">' + cxMonthBar() +
    cxSummary({ label: 'Laufende Kosten bezahlt', done, plan, open }) +
    '<div class="cx-head"><span class="cx-lbl">Soll · aus Rentals, Properties, Setup</span><span class="cx-lbl">Ist</span></div>' +
    cards +
    '<button class="cx-link" data-cx="gotoOt"><i class="ti ti-receipt" aria-hidden="true"></i> Rechnungen und Abrechnungen: im Tab Einmalig</button>' +
    '</div>';

  cxWire(host, {
    render: () => window.renderExpenses(),
    click: async (a, b) => {
      if (a === 'gotoOt') return cxGoto('onetime');
      if (a === 'take') { const e = _cxExpIndex[b.dataset.id]; if (e) await _cxExpSave(e, e.row.soll); window.renderExpenses(); }
      if (a === 'all') {
        b.disabled = true;
        for (const id of Object.keys(_cxExpIndex)) {
          const e = _cxExpIndex[id];
          if ((e.row.ist === null || e.row.ist === undefined) && e.row.soll) await _cxExpSave(e, e.row.soll);
        }
        window.renderExpenses();
      }
    },
    input: async (id, val) => { const e = _cxExpIndex[id]; if (!e) return; await _cxExpSave(e, val); window.renderExpenses(); },
  });
};

/* Save one cost line (null = empty → "offen") */
async function _cxExpSave(e, v) {
  const m = CX.month, r = e.row;
  try {
    if (r.catId) {
      if (v === null || v === undefined) await ctlDeleteCastel(r.catId, m);
      else await ctlUpsertCastel(r.catId, m, cxR(v));
    } else if (r.key === 'rate') {
      if (v === null || v === undefined) await ctlUpsertApt(e.p.id, m, { rate: null, zinsen: null, tilgung: null });
      else {
        const zPlan = r.split ? cxR(r.split.zinsen) : 0;
        const zinsen = Math.min(zPlan, cxR(v));
        await ctlUpsertApt(e.p.id, m, { rate: cxR(v), zinsen, tilgung: cxR(v - zinsen) });
      }
    } else {
      await ctlUpsertApt(e.p.id, m, { [r.key]: v === null || v === undefined ? null : cxR(v) });
    }
    r.ist = v === null || v === undefined ? null : cxR(v);
  } catch (err) { cxToastErr(err); }
}
