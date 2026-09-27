/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINNAHMEN (enter income)
   controlling-tab-income.js

   One list per month, one card per property, one row per unit:
     Soll (from the tenant tabs, bold)  │  →  │  Ist field  │  pill
   · "Alle offenen wie geplant" takes over every open row at once.
   · One amount per unit (what arrived on the account). It is split in the
     ratio of the Soll (Kalt : NK); Pauschal is stored as Kalt only (B16).
   · An empty field = "offen" again (row removed).
   · Casa Castel rooms without a unit yet (e.g. Berlin) show
     automatically; the unit is created on the first save.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxIncIndex = {};                                   // row id → { p, u, s }

function _cxIncModel() {
  const y = window._ctrl.year, m = CX.month;
  _cxIncIndex = {};
  return window._ctrl.properties.filter(p => p.active).map(p => {
    const rows = [];
    for (const u of ctlUnitsFor(p.id)) {
      const s = ctlUnitSoll(u, p.id, y, m);
      const inc = u.id != null ? window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === m) : null;
      const base = 'inc:' + p.id + ':' + (u.id != null ? u.id : 'v:' + u.name);
      const tenantParts = (s.parts || []).filter(pt => pt.tid !== 'room');
      if (tenantParts.length > 1) {
        // G1: tenant change in the month → one line per tenant, each with its own Soll and Ist
        tenantParts.forEach((pt, i) => {
          const id = base + ':t:' + pt.tid;
          _cxIncIndex[id] = { p, u, s, part: pt, inc };
          rows.push({ id, u, s, part: pt, first: i === 0, soll: pt.amount, ist: typeof ctlIstFor === 'function' ? ctlIstFor(inc, s, pt.tid) : null });
        });
      } else {
        const ist = inc ? cxR((Number(inc.kaltmiete) || 0) + (Number(inc.nebenkosten) || 0)) : null;
        _cxIncIndex[base] = { p, u, s };
        rows.push({ id: base, u, s, soll: s.soll, ist });
      }
    }
    return { p, rows };
  });
}

window.renderIncome = function () {
  const host = document.getElementById('tab-income');
  if (!host) return;
  CX.tab = 'income';
  const model = _cxIncModel();
  let done = 0, plan = 0, open = 0, partialOpen = 0;
  model.forEach(g => g.rows.forEach(r => { plan += r.soll; if (r.ist !== null) done += r.ist; else if (r.soll) { open++; if (r.s.partial) partialOpen++; } }));

  const cards = model.map(g => {
    const src = g.p.id === CASA_PROP_ID ? 'aus Casa Castel' : (g.rows.some(r => r.s.link) ? 'aus Rentals' : 'Planwert');
    // #11: "Änderung" only for a real change (Einzug, Auszug, new rent, Staffel, NK) — not for info notes
    const changed = g.rows.some(r => r.s.changed !== undefined ? r.s.changed : r.s.notes.some(n => /^(Mieterwechsel|Neu vermietet|Auszug|Staffel|NK angepasst|Verlängerung|Neue Miete)/.test(n)));
    const vis = r => ctlVisibleCheck(g.p.name, r.u.name, r.s.check);      // × in Setup hides a hint here too
    const warned = g.rows.some(r => vis(r) || (!r.soll && r.ist));
    const body = g.rows.map(r => {
      if (r.part) {                                          // one line per tenant (G1)
        const pt = r.part;
        return cxRow({ id: r.id, label: r.u.name + ' · ' + pt.name, badge: null, soll: r.soll, ist: r.ist,
                       sub: pt.from + '.–' + pt.to + '. · ' + (pt.mode === 'pauschal' ? 'pauschal' : cxEur(pt.k) + ' kalt + ' + cxEur(pt.nk) + ' NK'),
                       pills: cxPill('beige', 'anteilig'), notes: r.first ? r.s.notes : [], emptyText: 'leer', allowEmpty: true,
                       warn: r.first ? vis(r) : null });
      }
      // tenant change in the month → both parts, each at its own rent
      const sub = r.soll
        ? (r.s.parts && r.s.parts.length > 1
            ? r.s.parts.map(pt => pt.from + '.–' + pt.to + '.: ' + cxEur(pt.amount)).join(' · ')
            : (r.s.parts && r.s.parts[0] && r.s.parts[0].mode === 'pauschal' ? cxEur(r.soll) + ' pauschal'
              : (_cxIsParking(r.u) && !r.s.nk ? 'Miete ' + cxEur(r.s.k) : cxEur(r.s.k) + ' kalt + ' + cxEur(r.s.nk) + ' NK')))
        : (r.s.link ? 'nicht vermietet' : 'kein Planwert');
      const pills = r.s.partial ? cxPill('beige', r.s.parts && r.s.parts.length > 1 ? 'anteilig' : 'anteilig ' + r.s.days + '/' + r.s.N) : '';
      return cxRow({ id: r.id, label: r.u.name, badge: null, soll: r.soll, ist: r.ist, sub, pills,   // #20: the note says "Neu vermietet"
                     notes: r.s.notes, emptyText: 'leer', allowEmpty: true,
                     warn: vis(r) || (!r.soll && r.ist ? 'Miete erfasst, aber laut Mieter-Daten nicht vermietet – bitte Mieter-Tab prüfen' : null) });
    }).join('');
    return cxCard({ key: 'inc:' + g.p.id, title: g.p.name, sub: src, status: cxGroupStatus(g.rows),
                    sum: g.rows.reduce((s, r) => s + (r.ist || 0), 0), plan: g.rows.reduce((s, r) => s + (r.soll || 0), 0),
                    extraPill: warned ? cxPill('open', 'prüfen') : (changed ? cxPill('beige', 'Änderung') : ''), body });   // one extra pill at most
  }).join('');

  host.innerHTML = '<div class="cx-page">' + cxMonthBar() +
    cxSummary({ label: 'Mieten eingegangen', done, plan, open, bulk: open - partialOpen, partial: partialOpen,
                confirm: CX.bulk === 'income' ? _cxIncBulkList() : null, undo: cxUndoFor('income') }) +
    '<div class="cx-head"><span class="cx-lbl">Soll · aus den Mieter-Tabs</span><span class="cx-lbl">Ist</span></div>' +
    cards + '</div>';

  cxWire(host, {
    render: () => window.renderIncome(),
    click: async (a, b) => {
      if (a === 'take') { const e = _cxIncIndex[b.dataset.id]; CX.undo = null; if (e) await _cxIncSave(e, e.part ? e.part.amount : e.s.soll); window.renderIncome(); }
      // #6: ask first, then book, then offer undo
      if (a === 'all') { CX.bulk = 'income'; return window.renderIncome(); }
      if (a === 'allNo') { CX.bulk = null; return window.renderIncome(); }
      if (a === 'allYes') {
        b.disabled = true;
        const L = _cxIncBulkList(), done = [];
        for (const e of L.list) { await _cxIncSave(e, e.s.soll); if (e.u.id != null) done.push(e.u.id); }
        CX.bulk = null;
        CX.undo = { tab: 'income', y: window._ctrl.year, m: CX.month, items: done, n: done.length };
        return window.renderIncome();
      }
      if (a === 'undo') {
        const u = cxUndoFor('income'); if (!u) return;
        b.disabled = true;
        for (const uid of u.items) { try { await ctlDeleteIncome(uid, u.m); } catch (err) { cxToastErr(err); } }
        CX.undo = null;
        return window.renderIncome();
      }
    },
    input: async (id, val) => { const e = _cxIncIndex[id]; if (!e) return; CX.undo = null; await _cxIncSave(e, val); window.renderIncome(); },
  });
};

/* What "Alle offenen wie geplant" would book: open, full-month rows without a data check */
function _cxIncBulkList() {
  const y = window._ctrl.year, m = CX.month, list = [];
  let skipped = 0;
  for (const id of Object.keys(_cxIncIndex)) {
    const e = _cxIncIndex[id];
    if (e.part) continue;                                                    // tenant lines: one tap each
    const has = e.u.id != null && window._ctrl.income.some(r => r.unit_id === e.u.id && r.year === y && r.month === m);
    if (has || !e.s.soll || e.s.partial) continue;                           // part months: one tap each
    if (ctlVisibleCheck(e.p.name, e.u.name, e.s.check)) { skipped++; continue; }                                  // data check: deliberate entry only
    list.push(e);
  }
  return { list, n: list.length, sum: cxR(list.reduce((a, e) => a + e.s.soll, 0)), skipped };
}

/* Save one unit's income (null = delete → "offen") */
async function _cxIncSave(e, ist) {
  if (e.part) return _cxIncSavePart(e, ist);
  const m = CX.month;
  try {
    if (ist === null || ist === undefined) { if (e.u.id != null) await ctlDeleteIncome(e.u.id, m); return; }
    if (e.u.id == null) {
      const nu = await ctlCreateUnit({ property_id: e.p.id, name: e.u.name, unit_type: e.u.unit_type || 'Zimmer',
                                       source_type: e.u.source_type || null, source_ref: e.u.source_ref || null });
      e.u = nu;
      if (typeof ctlSollReset === 'function') ctlSollReset();
    }
    const nk = _cxIncNkShare(e.s, ist);
    await ctlUpsertIncome(e.u.id, m, cxR(ist - nk), nk);
  } catch (err) { cxToastErr(err); }
}

/* B16: one amount per unit is split in the ratio of the Soll (Kalt : NK) —
   a short payment is short on both, not only on the Kaltmiete. Pauschal: all Kalt. */
function _cxIncNkShare(s, ist) {
  if (!s || !s.soll || !s.nk) return 0;
  return Math.max(0, cxR(ist * s.nk / s.soll));
}

/* One tenant's line in a change month (G1): stored as split[tenant] + the unit total */
async function _cxIncSavePart(e, ist) {
  const m = CX.month, y = window._ctrl.year;
  try {
    if (e.u.id == null) {
      const nu = await ctlCreateUnit({ property_id: e.p.id, name: e.u.name, unit_type: e.u.unit_type || 'Zimmer',
                                       source_type: e.u.source_type || null, source_ref: e.u.source_ref || null });
      e.u = nu;
      if (typeof ctlSollReset === 'function') ctlSollReset();
    }
    const inc = window._ctrl.income.find(r => r.unit_id === e.u.id && r.year === y && r.month === m);
    const split = {};
    if (inc) for (const pt of (e.s.parts || [])) {           // keep what the other tenants paid
      if (pt.tid === 'room') continue;
      const v = ctlIstFor(inc, e.s, pt.tid);
      if (v !== null) split[pt.tid] = v;
    }
    if (ist === null || ist === undefined) delete split[e.part.tid]; else split[e.part.tid] = cxR(ist);
    const keys = Object.keys(split);
    if (!keys.length) { await ctlDeleteIncome(e.u.id, m); return; }
    const total = cxR(keys.reduce((a, k) => a + split[k], 0));
    const nk = _cxIncNkShare(e.s, total);
    await ctlUpsertIncome(e.u.id, m, cxR(total - nk), nk, split);
  } catch (err) { cxToastErr(err); }
}
