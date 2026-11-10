/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINNAHMEN (enter income)
   controlling-tab-income.js

   One list per month, one card per property, one row per unit:
     Soll (from the tenant tabs, bold)  │  →  │  Ist field  │  pill
   · "Alle offenen wie geplant" takes over every open row at once.
   · One amount per unit (what arrived on the account). It is split in the
     ratio of the Soll (Kalt : NK); Pauschal is stored as Kalt only (B16).
   · Real Ist (Oct 2026): every amount is saved with its tenant (split), also in
     a month with one tenant — so it stays theirs if a second line appears later.
   · An empty field = "offen" again (row removed).
   · Casa Castel rooms without a unit yet (e.g. Berlin) show
     automatically; the unit is created on the first save.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxIncIndex = {};                                   // row id → { p, u, s }

function _cxIncModel() {
  const y = window._ctrl.year, m = CX.month;
  const marks = ctlDiffOn('inc');                         // CP2: C1 SQL run → rows can be marked "On purpose"
  _cxIncIndex = {};
  return window._ctrl.properties.filter(p => p.active && cxAreaOk(p) && ctlPropOwned(p, y, m)).map(p => {   // from the purchase month on
    const rows = [];
    for (const u of ctlUnitsFor(p.id)) {
      const s = ctlUnitSoll(u, p.id, y, m);
      const inc = u.id != null ? window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === m) : null;
      const base = 'inc:' + p.id + ':' + (u.id != null ? u.id : 'v:' + u.name);
      const tenantParts = (s.parts || []).filter(pt => pt.tid !== 'room');
      const mark = marks ? (ctlDiffMark(inc) || { ok: false }) : undefined;   // one mark per unit and month (a tenant change: both lines)
      if (tenantParts.length > 1) {
        // G1: tenant change in the month → one line per tenant, each with its own Soll and Ist
        tenantParts.forEach((pt, i) => {
          const id = base + ':t:' + pt.tid;
          _cxIncIndex[id] = { p, u, s, part: pt, inc };
          rows.push({ id, u, s, part: pt, first: i === 0, soll: pt.amount, ist: typeof ctlIstFor === 'function' ? ctlIstFor(inc, s, pt.tid) : null, mark });
        });
      } else {
        const ist = inc ? cxR((Number(inc.kaltmiete) || 0) + (Number(inc.nebenkosten) || 0)) : null;
        _cxIncIndex[base] = { p, u, s };
        rows.push({ id: base, u, s, soll: s.soll, ist, mark });
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
  const future = cxFuture(window._ctrl.year, CX.month);   // CP2 (#4): nothing due yet → no "Book all"
  if (future && CX.bulk === 'income') CX.bulk = null;
  let done = 0, plan = 0, open = 0, partialOpen = 0;
  const difRows = [];                                     // CP2 (#10): every row, for "2 differences · 1 on purpose"
  model.forEach(g => g.rows.forEach(r => { plan += r.soll; if (r.ist !== null) done += r.ist; else if (r.soll) { open++; if (r.s.partial) partialOpen++; } }));

  const cards = model.map(g => {
    const src = g.p.id === CASA_PROP_ID ? 'from Casa Castel' : (g.rows.some(r => r.s.link) ? 'from Rentals' : 'plan value');
    // #11: "Änderung" only for a real change (Einzug, Auszug, new rent, Staffel, NK) — not for info notes
    const changed = g.rows.some(r => r.s.changed !== undefined ? r.s.changed : r.s.notes.some(n => /^(Tenant change|Newly let|Move-out|Staffel|Mieterhöhung|NK changed|Renewal|New rent)/.test(n)));
    const vis = r => ctlVisibleCheck(g.p.name, r.u.name, r.s.check);      // × in Setup hides a hint here too
    const warned = g.rows.some(r => vis(r) || (!r.soll && r.ist));
    const body = g.rows.map(r => {
      if (r.part) {                                          // one line per tenant (G1)
        const pt = r.part;
        return cxRow({ id: r.id, label: r.u.name + ' · ' + pt.name, badge: null, soll: r.soll, ist: r.ist, dir: 1, mark: r.u.id != null ? r.mark : undefined,
                       sub: pt.from + '.–' + pt.to + '. · ' + (pt.mode === 'pauschal' ? 'Pauschal' + (pt.nk ? ' · davon NK ' + cxEur(pt.nk) : '') : cxEur(pt.k) + ' Kalt + ' + cxEur(pt.nk) + ' NK'),
                       pills: cxPill('beige', 'partial'), notes: r.first ? r.s.notes : [], emptyText: 'empty', allowEmpty: true,
                       warn: r.first ? vis(r) : null });
      }
      // tenant change in the month → both parts, each at its own rent
      const sub = r.soll
        ? (r.s.parts && r.s.parts.length > 1
            ? r.s.parts.map(pt => pt.from + '.–' + pt.to + '.: ' + cxEur(pt.amount)).join(' · ')
            : (r.s.parts && r.s.parts[0] && r.s.parts[0].mode === 'pauschal' ? cxEur(r.soll) + ' Pauschal' + (r.s.nk ? ' · davon NK ' + cxEur(r.s.nk) : '')
              : (_cxIsParking(r.u) && !r.s.nk ? 'Rent ' + cxEur(r.s.k) : cxEur(r.s.k) + ' Kalt + ' + cxEur(r.s.nk) + ' NK')))
        : (r.s.free ? 'Rent 0,00\u202f€' : r.s.noRent ? 'no rent this month (contract dates)' : r.s.link ? 'not let' : 'no plan value');
      const pills = r.s.partial ? cxPill('beige', r.s.parts && r.s.parts.length > 1 ? 'partial' : 'partial ' + r.s.days + '/' + r.s.N) : '';
      return cxRow({ id: r.id, label: r.u.name, badge: null, soll: r.soll, ist: r.ist, sub, pills, dir: 1, mark: r.u.id != null ? r.mark : undefined,   // #20: the note says "Newly let"
                     notes: r.s.notes, emptyText: r.s.free ? 'free' : 'empty', allowEmpty: true,
                     warn: vis(r) || (!r.soll && r.ist ? (r.s.noRent ? 'Rent entered, but no rent is due by the contract dates – check Rent from / Rent until in the tenant tab'
                                                                 : 'Rent entered, but the tenant data says not let – please check the tenant tab') : null) });
    }).join('');
    // NK Nachzahlung vom Mieter · Hausgeld Guthaben von WEG — only finished results (controlling-abr.js)
    const abr = ctlAbrRows(g.p.id, window._ctrl.year, CX.month, 1).filter(r => !r.info);
    const all = g.rows.concat(abr);
    difRows.push(...all);
    return cxCard({ key: 'inc:' + g.p.id, title: g.p.name, sub: src, status: cxGroupStatus(all, 1), statusWas: cxGroupStatus(all.map(cxUnmarked), 1),
                    sum: all.reduce((s, r) => s + (r.ist || 0), 0), plan: all.reduce((s, r) => s + (r.soll || 0), 0),
                    extraPill: warned ? cxPill('open', 'check') : (changed ? cxPill('beige', 'change') : ''),
                    body: body + cxAbrSection(g.p, window._ctrl.year, CX.month, 1) });   // one extra pill at most
  }).join('');

  cxPaint(host, '<div class="cx-page">' + cxMonthBar() +
    cxSummary({ label: 'Rent received', dir: 1, done, plan, open, bulk: open - partialOpen, partial: partialOpen, split: _cxIncSplitHTML(model),
                future, diffs: cxDiffCount(difRows),
                confirm: CX.bulk === 'income' ? _cxIncBulkList() : null, undo: cxUndoFor('income'), note: _cxAbrNote(1) }) +
    '<div class="cx-head"><span class="cx-lbl">Soll · from the tenant tabs</span><span class="cx-lbl">Ist</span></div>' +
    cards + '</div>');   // B18: only what changed

  cxWire(host, {
    render: () => window.renderIncome(),
    click: async (a, b) => {
      if (await cxAbrClick(a, b, () => window.renderIncome())) return;
      if (a === 'take') { const e = _cxIncIndex[b.dataset.id]; CX.undo = null; if (e) await _cxIncSave(e, e.part ? e.part.amount : e.s.soll); cxKeepRow(b.dataset.id, () => window.renderIncome()); }
      // #6: ask first, then book, then offer undo
      if (a === 'all') { if (!cxFuture(window._ctrl.year, CX.month)) CX.bulk = 'income'; return window.renderIncome(); }
      if (a === 'allNo') { CX.bulk = null; return window.renderIncome(); }
      if (a === 'allYes') {
        if (cxFuture(window._ctrl.year, CX.month)) { CX.bulk = null; return window.renderIncome(); }   // CP2 (#4): not due yet
        b.disabled = true;
        const area = CX.area, y = window._ctrl.year, m = CX.month;   // C1 #2: the Undo belongs to where you booked
        const L = _cxIncBulkList(), done = [];
        for (const e of L.list) {
          // x8: each item goes into the month you booked, also when the month arrow is tapped meanwhile;
          // another year opened meanwhile → stop (the rest stays open in its own month)
          if (window._ctrl.year !== y) break;
          await _cxIncSave(e, e.s.soll, y, m); if (e.u.id != null) done.push(e.u.id);
        }
        // switched area / month / year while saving: that screen keeps its own state, no Undo appears there
        if (CX.area === area && window._ctrl.year === y && CX.month === m) { CX.bulk = null; CX.undo = { tab: 'income', y, m, items: done, n: done.length }; }
        return window.renderIncome();
      }
      if (a === 'undo') {
        const u = cxUndoFor('income'); if (!u) return;
        b.disabled = true;
        for (const uid of u.items) {
          if (window._ctrl.year !== u.y) break;                // x8: never clear a month of another year
          try { await ctlDeleteIncome(uid, u.m); } catch (err) { cxToastErr(err); }
        }
        CX.undo = null;
        return window.renderIncome();
      }
    },
    input: async (id, val) => { if (await cxAbrInput(id, val, () => window.renderIncome())) return; const e = _cxIncIndex[id]; if (!e) return; CX.undo = null; await _cxIncSave(e, val); cxKeepRow(id, () => window.renderIncome()); },
    // CP2 (#10): "On purpose" — the mark belongs to the unit's month row (a tenant change: both lines); amounts stay
    mark: async (id, mark) => { const e = _cxIncIndex[id]; if (!e || e.u.id == null) return; await ctlSetIncomeMark(e.u.id, CX.month, mark); },
  });
};

/* Kalt / NK / Warm totals for the month (eingegangen · geplant).
   Same split as the bookings: Kalt+NK units in the ratio of their Soll;
   Pauschal rents shown on their own line (no Kalt/NK split exists for them). */
function _cxIncSplitHTML(model) {
  const t = { kI: 0, nI: 0, pI: 0, kP: 0, nP: 0, pP: 0 };
  model.forEach(g => g.rows.forEach(r => {
    const src  = r.part || (r.s.parts && r.s.parts[0]) || {};
    const paus = src.mode === 'pauschal';
    const k    = Number(r.part ? r.part.k  : r.s.k)  || 0;
    const nk   = Number(r.part ? r.part.nk : r.s.nk) || 0;
    const kShare = k + nk > 0 ? k / (k + nk) : 1;           // no NK (e.g. parking) → all Kalt
    const soll = Number(r.soll) || 0, ist = r.ist == null ? 0 : Number(r.ist) || 0;
    if (paus) { t.pP += soll; t.pI += ist; return; }
    t.kP += soll * kShare; t.nP += soll - soll * kShare;
    t.kI += ist * kShare;  t.nI += ist - ist * kShare;
  }));
  const cell = (v, muted) => '<span style="width:84px;text-align:right;font-variant-numeric:tabular-nums;' + (muted ? 'color:var(--cx-mut,#9A8E7E);' : '') + '">' + cxW(v) + '</span>';
  const row  = (lbl, i, p, total) =>
    '<div style="display:flex;align-items:center;gap:6px;padding:' + (total ? '7px 0 0;margin-top:3px;border-top:0.5px solid var(--cx-line,#EDE8E0);font-weight:500;' : '3px 0;') + '">' +
    '<span style="flex:1">' + lbl + '</span>' + cell(i) + cell(p, true) + '</div>';
  return '<div style="margin:12px 0 4px;font-size:12px;color:var(--cc-charcoal,#3A3530);">' +
    '<div style="display:flex;gap:6px;font-size:9px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--cc-taupe,#9A8E7E);padding-bottom:2px;">' +
      '<span style="flex:1"></span><span style="width:84px;text-align:right">Received</span><span style="width:84px;text-align:right">Planned</span></div>' +
    row('Kaltmiete', t.kI, t.kP) +
    row('Nebenkosten', t.nI, t.nP) +
    (t.pP || t.pI ? row('Pauschal', t.pI, t.pP) : '') +
    row('Warmmiete (total)', t.kI + t.nI + t.pI, t.kP + t.nP + t.pP, true) +
  '</div>';
}

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

/* C1 #3: a room without a Controlling unit yet (e.g. Berlin) gets its unit on the first save — ONCE.
   A second tap while the first save is still on its way (mobile data) waits for that same unit; it created a
   second one (Berlin listed twice every month, planned rent too high, 'Book all' booked it twice). */
const _cxIncNew = {};                                   // property|source_type|source_ref → the pending create
async function _cxIncUnit(e) {
  if (e.u.id != null) return;
  const st = e.u.source_type || null, ref = e.u.source_ref || null;
  const have = ref !== null && window._ctrl.units.find(u => u.property_id === e.p.id && (u.source_type || null) === st && String(u.source_ref) === String(ref));
  if (have) { e.u = have; return; }                      // made meanwhile (an earlier tap)
  const k = e.p.id + '|' + (st || '') + '|' + (ref !== null ? ref : 'name:' + e.u.name);
  const p = _cxIncNew[k] || (_cxIncNew[k] = ctlCreateUnit({ property_id: e.p.id, name: e.u.name, unit_type: e.u.unit_type || 'Zimmer',
                                                               source_type: st, source_ref: ref })
    .finally(() => { delete _cxIncNew[k]; }));
  e.u = await p;
  if (typeof ctlSollReset === 'function') ctlSollReset();
}

/* Save one unit's income (null = delete → "offen").
   x8: y / m = the month the amount belongs to (Book all passes them: the month arrow can be tapped while it saves).
   The data layer writes into the year on screen → nothing is written once another year is open. */
async function _cxIncSave(e, ist, y = window._ctrl.year, m = CX.month) {
  if (e.part) return _cxIncSavePart(e, ist, y, m);
  try {
    if (window._ctrl.year !== y) return;
    if (ist === null || ist === undefined) { if (e.u.id != null) await ctlDeleteIncome(e.u.id, m); return; }
    await _cxIncUnit(e);
    if (window._ctrl.year !== y) return;
    const nk = _cxIncNkShare(e.s, ist);
    // real Ist: the amount belongs to the one tenant of this month (no tenant → nothing to attach)
    const tp = (e.s.parts || []).filter(pt => pt.tid !== 'room');
    await ctlUpsertIncome(e.u.id, m, cxR(ist - nk), nk, tp.length === 1 ? { [tp[0].tid]: cxR(ist) } : null);
  } catch (err) { cxToastErr(err); }
}

/* B16: one amount per unit is split in the ratio of the Soll (Kalt : NK) —
   a short payment is short on both, not only on the Kaltmiete. Pauschal: rent : davon NK (Oct 2026). */
function _cxIncNkShare(s, ist) {
  if (!s || !s.soll || !s.nk) return 0;
  return Math.max(0, cxR(ist * s.nk / s.soll));
}

/* One tenant's line in a change month (G1): stored as split[tenant] + the unit total.
   x9: one save at a time per unit and month — the next tenant's line waits for the save on its way and then
   reads the row it wrote (two quick taps lost the first tenant's payment: both read the row before either landed) */
const _cxIncPartQ = {};                                 // unit|year|month → the save on its way
async function _cxIncSavePart(e, ist, y = window._ctrl.year, m = CX.month) {
  try {
    if (window._ctrl.year !== y) return;
    await _cxIncUnit(e);
  } catch (err) { cxToastErr(err); return; }
  const k = e.u.id + '|' + y + '|' + m;
  const job = (_cxIncPartQ[k] || Promise.resolve()).then(() => _cxIncSavePartNow(e, ist, y, m));
  _cxIncPartQ[k] = job;
  try { await job; } finally { if (_cxIncPartQ[k] === job) delete _cxIncPartQ[k]; }
}
async function _cxIncSavePartNow(e, ist, y, m) {
  try {
    if (window._ctrl.year !== y) return;                     // another year is open now: nothing is written
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
    // Nov 2026 fix: each tenant's payment is split in the ratio of THEIR Soll (Kalt : NK, Pauschal: rent : davon NK) —
    // the whole unit's ratio mixed them (Ana's 300 = 250 + 50 NK was saved as 276,92 + 23,08 while Ben, Pauschal, was open)
    const nk = Math.min(total, cxR(keys.reduce((a, k) => {
      const pt = (e.s.parts || []).find(p => p.tid === k);
      return a + (pt && pt.amount ? Math.max(0, split[k] * (pt.nk || 0) / pt.amount) : _cxIncNkShare(e.s, split[k]));   // no Soll part: the unit's ratio, as before
    }, 0)));
    await ctlUpsertIncome(e.u.id, m, cxR(total - nk), nk, split);
  } catch (err) { cxToastErr(err); }
}

/* C5 (#32): one drawing = one snapshot — a figure asked for again while it is drawn is worked out once (controlling-data.js ctlScope) */
window.renderIncome = ctlScope(window.renderIncome);
