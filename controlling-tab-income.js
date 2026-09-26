/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EINNAHMEN (enter income)
   controlling-tab-income.js

   One list per month, one card per property, one row per unit:
     Soll (from the tenant tabs, bold)  │  →  │  Ist field  │  pill
   · "Alle offenen wie geplant" takes over every open row at once.
   · One amount per unit (what arrived on the account). It is stored
     as Nebenkosten first (up to the planned NK), the rest as Kaltmiete.
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
    const rows = ctlUnitsFor(p.id).map(u => {
      const s = ctlUnitSoll(u, p.id, y, m);
      const inc = u.id != null ? window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === m) : null;
      const ist = inc ? cxR((Number(inc.kaltmiete) || 0) + (Number(inc.nebenkosten) || 0)) : null;
      const id = 'inc:' + p.id + ':' + (u.id != null ? u.id : 'v:' + u.name);
      _cxIncIndex[id] = { p, u, s };
      return { id, u, s, soll: s.soll, ist };
    });
    return { p, rows };
  });
}

window.renderIncome = function () {
  const host = document.getElementById('tab-income');
  if (!host) return;
  CX.tab = 'income';
  const model = _cxIncModel();
  let done = 0, plan = 0, open = 0;
  model.forEach(g => g.rows.forEach(r => { plan += r.soll; if (r.ist !== null) done += r.ist; else if (r.soll) open++; }));

  const cards = model.map(g => {
    const src = g.p.id === CASA_PROP_ID ? 'aus Casa Castel' : (g.rows.some(r => r.s.link) ? 'aus Rentals' : 'Planwert');
    const changed = g.rows.some(r => r.s.notes.length);
    const warned = g.rows.some(r => r.s.check);
    const body = g.rows.map(r => {
      const sub = r.soll ? cxEur(r.s.k) + ' kalt + ' + cxEur(r.s.nk) + ' NK' + (r.s.partial ? ' · anteilig' : '')
                         : (r.s.link ? 'nicht vermietet' : 'kein Planwert');
      return cxRow({ id: r.id, label: r.u.name, badge: r.s.badge, soll: r.soll, ist: r.ist, sub,
                     notes: r.s.notes, warn: r.s.check, emptyText: 'leer', allowEmpty: true });
    }).join('');
    return cxCard({ key: 'inc:' + g.p.id, title: g.p.name, sub: src, status: cxGroupStatus(g.rows),
                    sum: g.rows.reduce((s, r) => s + (r.ist || 0), 0),
                    extraPill: (warned ? cxPill('open', 'prüfen') : '') + (changed ? cxPill('beige', 'Änderung') : ''), body });
  }).join('');

  host.innerHTML = '<div class="cx-page">' + cxMonthBar() +
    cxSummary({ label: 'Mieten eingegangen', done, plan, open }) +
    '<div class="cx-head"><span class="cx-lbl">Soll · aus den Mieter-Tabs</span><span class="cx-lbl">Ist</span></div>' +
    cards + '</div>';

  cxWire(host, {
    render: () => window.renderIncome(),
    click: async (a, b) => {
      if (a === 'take') { const e = _cxIncIndex[b.dataset.id]; if (e) await _cxIncSave(e, e.s.soll); window.renderIncome(); }
      if (a === 'all') {
        b.disabled = true;
        for (const id of Object.keys(_cxIncIndex)) {
          const e = _cxIncIndex[id];
          const has = e.u.id != null && window._ctrl.income.some(r => r.unit_id === e.u.id && r.year === window._ctrl.year && r.month === CX.month);
          if (!has && e.s.soll) await _cxIncSave(e, e.s.soll);
        }
        window.renderIncome();
      }
    },
    input: async (id, val) => { const e = _cxIncIndex[id]; if (!e) return; await _cxIncSave(e, val); window.renderIncome(); },
  });
};

/* Save one unit's income (null = delete → "offen") */
async function _cxIncSave(e, ist) {
  const m = CX.month;
  try {
    if (ist === null || ist === undefined) { if (e.u.id != null) await ctlDeleteIncome(e.u.id, m); return; }
    if (e.u.id == null) {
      const nu = await ctlCreateUnit({ property_id: e.p.id, name: e.u.name, unit_type: e.u.unit_type || 'Zimmer',
                                       source_type: e.u.source_type || null, source_ref: e.u.source_ref || null });
      e.u = nu;
      if (typeof ctlSollReset === 'function') ctlSollReset();
    }
    const nkPlan = cxR(e.s.nk || 0);
    const nk = ist >= nkPlan ? nkPlan : Math.max(0, cxR(ist));
    await ctlUpsertIncome(e.u.id, m, cxR(ist - nk), nk);
  } catch (err) { cxToastErr(err); }
}
