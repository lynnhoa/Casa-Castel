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
  return window._ctrl.properties.filter(p => p.active && cxAreaOk(p)).map(p => {
    const casa = p.id === CASA_PROP_ID;
    const plan = casa ? ctlCasaCostRows(p, y, m) : ctlCostRows(p, y, m);
    const rows = plan.rows.map(r => Object.assign({}, r));   // incl. Kreditrate: Soll from Properties, you confirm when it's booked
    if (casa) {
      for (const r of rows) {
        const x = window._ctrl.castel_expenses.find(e => e.category_id === r.catId && e.year === y && e.month === m);
        r.ist = x ? cxR(x.amount) : null;
      }
      // entered although not planned this month → still shown
      for (const x of window._ctrl.castel_expenses.filter(e => e.year === y && e.month === m)) {
        if (rows.some(r => r.catId === x.category_id)) continue;
        const c = ctlCat(x.category_id);
        rows.push({ key: 'cat:' + x.category_id, catId: x.category_id, label: (c && c.name) || 'Cost', soll: 0, sub: typeof _cxFreqLbl === 'function' ? _cxFreqLbl((c && c.frequency) || '') : ((c && c.frequency) || ''), src: 'Setup', ist: cxR(x.amount) });
      }
      // sporadic costs without a plan this month: always enterable, no Soll (B18)
      for (const bd of (plan.bedarf || [])) {
        if (rows.some(r => r.catId === bd.catId)) continue;
        rows.push({ key: 'cat:' + bd.catId, catId: bd.catId, label: bd.label, soll: 0, sub: 'as needed', src: '', ist: null, bedarf: true });
      }
      // quarterly / yearly without due months: shown as a check, never silently gone (B19)
      if (plan.checks && plan.checks.length) rows.warn = 'Due months missing: ' + plan.checks.join(', ') + ' – choose the months in Setup';
    } else {
      const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m);
      for (const r of rows) r.ist = row && row[r.key] !== null && row[r.key] !== undefined ? cxR(row[r.key]) : null;
      if (row) for (const k of ['rate', 'hausgeld', 'grundsteuer', 'strom']) {
        if (rows.some(r => r.key === k) || row[k] === null || row[k] === undefined || Number(row[k]) === 0) continue;
        rows.push({ key: k, label: _CX_APT_LABEL[k], soll: 0, sub: 'not planned', src: '', ist: cxR(row[k]) });
      }
    }
    for (const r of rows) { r.id = 'exp:' + p.id + ':' + r.key; _cxExpIndex[r.id] = { p, row: r }; }
    return { p, rows, notDue: plan.notDue, warn: rows.warn || null };
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
    const regular = g.rows.filter(r => !r.bedarf), bedarf = g.rows.filter(r => r.bedarf);
    const row = r => cxRow({ id: r.id, label: r.label, soll: r.soll, ist: r.ist,
        sub: cxEsc(r.sub || '') + (r.src ? ' · <span class="cx-from">from ' + cxEsc(r.src) + '</span>' : ''),
        notes: r.note ? [r.note] : [], info: r.info || null, emptyText: r.bedarf ? 'as needed' : 'not planned', allowEmpty: true });
    const bk = 'expb:' + g.p.id + ':' + CX.month, bOpen = !!CX.open[bk];
    const body = (g.warn ? '<div class="cx-r"><div class="cx-r__l"><div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ' + cxEsc(g.warn) + '</div></div></div>' : '') +
      regular.map(row).join('') + cxNotDue(g.notDue) +
      (bedarf.length ? '<button class="cx-link" data-cx="fold" data-k="' + bk + '" aria-expanded="' + bOpen + '"><i class="ti ti-chevron-' + (bOpen ? 'up' : 'down') + '" aria-hidden="true"></i> As needed · ' + bedarf.map(r => cxEsc(r.label)).join(', ') + '</button>' +
        (bOpen ? bedarf.map(row).join('') : '') : '');
    const n = g.rows.length;
    // NK Guthaben an Mieter · Hausgeld Nachzahlung an WEG — only finished results (controlling-abr.js)
    const abr = ctlAbrRows(g.p.id, window._ctrl.year, CX.month, -1).filter(r => !r.info);
    const all = g.rows.concat(abr);
    return cxCard({ key: 'exp:' + g.p.id, title: g.p.name, sub: n === 1 ? '1 item' : n + ' items',
                    status: cxGroupStatus(all), sum: all.reduce((s, r) => s + (r.ist || 0), 0), plan: all.reduce((s, r) => s + (r.soll || 0), 0),
                    extraPill: g.rows.some(r => r.note) ? cxPill('beige', 'change') : '', body: body + cxAbrSection(g.p, window._ctrl.year, CX.month, -1) });
  }).join('');

  host.innerHTML = '<div class="cx-page">' + cxMonthBar() +
    cxSummary({ label: 'Running costs paid', done, plan, open,
                confirm: CX.bulk === 'expenses' ? _cxExpBulkList() : null, undo: cxUndoFor('expenses'), note: _cxAbrNote(-1) }) +
    '<div class="cx-head"><span class="cx-lbl">Soll · from Rentals, Properties, Setup</span><span class="cx-lbl">Ist</span></div>' +
    cards +
    '<button class="cx-link" data-cx="gotoOt"><i class="ti ti-receipt" aria-hidden="true"></i> Invoices: in the One-off tab</button>' +
    '</div>';

  cxWire(host, {
    render: () => window.renderExpenses(),
    click: async (a, b) => {
      if (await cxAbrClick(a, b, () => window.renderExpenses())) return;
      if (a === 'gotoOt') return cxGoto('onetime');
      if (a === 'take') { const e = _cxExpIndex[b.dataset.id]; CX.undo = null; if (e) await _cxExpSave(e, e.row.soll); window.renderExpenses(); }
      // #6: ask first, then book, then offer undo
      if (a === 'all') { CX.bulk = 'expenses'; return window.renderExpenses(); }
      if (a === 'allNo') { CX.bulk = null; return window.renderExpenses(); }
      if (a === 'allYes') {
        b.disabled = true;
        const L = _cxExpBulkList(), done = [];
        for (const e of L.list) { await _cxExpSave(e, e.row.soll); if (e.row.ist !== null && e.row.ist !== undefined) done.push({ pid: e.p.id, catId: e.row.catId || null, key: e.row.key }); }
        CX.bulk = null;
        CX.undo = { tab: 'expenses', y: window._ctrl.year, m: CX.month, items: done, n: done.length };
        return window.renderExpenses();
      }
      if (a === 'undo') {
        const u = cxUndoFor('expenses'); if (!u) return;
        b.disabled = true;
        for (const it of u.items) {
          try {
            if (it.catId) await ctlDeleteCastel(it.catId, u.m);
            else if (it.key === 'rate') await ctlUpsertApt(it.pid, u.m, { rate: null, zinsen: null, tilgung: null });
            else await ctlUpsertApt(it.pid, u.m, { [it.key]: null });
          } catch (err) { cxToastErr(err); }
        }
        CX.undo = null;
        return window.renderExpenses();
      }
    },
    input: async (id, val) => { if (await cxAbrInput(id, val, () => window.renderExpenses())) return; const e = _cxExpIndex[id]; if (!e) return; CX.undo = null; await _cxExpSave(e, val); window.renderExpenses(); },
  });
};

/* What "Alle offenen wie geplant" would book: open planned rows without a data check */
function _cxExpBulkList() {
  const list = [];
  let skipped = 0;
  for (const id of Object.keys(_cxExpIndex)) {
    const e = _cxExpIndex[id];
    if (!((e.row.ist === null || e.row.ist === undefined) && e.row.soll)) continue;
    if (e.row.check) { skipped++; continue; }
    list.push(e);
  }
  return { list, n: list.length, sum: cxR(list.reduce((a, e) => a + e.row.soll, 0)), skipped };
}

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
        if (!r.split) await ctlUpsertApt(e.p.id, m, { rate: cxR(v), zinsen: null, tilgung: null });   // #7: split unknown
        else {
          const zinsen = Math.min(cxR(r.split.zinsen), cxR(v));
          await ctlUpsertApt(e.p.id, m, { rate: cxR(v), zinsen, tilgung: cxR(v - zinsen) });
        }
      }
    } else {
      await ctlUpsertApt(e.p.id, m, { [r.key]: v === null || v === undefined ? null : cxR(v) });
    }
    r.ist = v === null || v === undefined ? null : cxR(v);
  } catch (err) { cxToastErr(err); }
}
