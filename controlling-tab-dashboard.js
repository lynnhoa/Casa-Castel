/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DASHBOARD (read only)
   controlling-tab-dashboard.js

   Read top to bottom:
     1  Cashflow · Konto — everything that came in minus everything
        that went out (rent incl. NK, all running costs incl. Hausgeld
        and Kreditrate, one-time in/out). Rein/Raus bar.
        "X Posten offen → Erfassen" jumps to the tab where they are.
     2  One card per property: cashflow, "rein · raus", open pill;
        tap for the details.
     3  Year so far.
   Entering happens only in Einnahmen, Ausgaben and Einmalig.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxDashOpenInc = 0;                                 // for the jump: Einnahmen first if rent is open

function _cxIsFuture(y, m) {
  const t = cxToday(), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7));
  return y > ty || (y === ty && m > tm);
}

/* Open items of one property in a month: { inc, exp } */
function _cxOpenOf(p, y, m) {
  let inc = 0, exp = 0;
  for (const u of ctlUnitsFor(p.id)) {
    const s = ctlUnitSoll(u, p.id, y, m);
    if (!s.soll) continue;
    const has = u.id != null && window._ctrl.income.some(r => r.unit_id === u.id && r.year === y && r.month === m);
    if (!has) inc++;
  }
  if (p.id === CASA_PROP_ID) {
    for (const r of ctlCasaCostRows(p, y, m).rows)
      if (r.soll && !window._ctrl.castel_expenses.some(e => e.category_id === r.catId && e.year === y && e.month === m)) exp++;
  } else {
    const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m);
    for (const r of ctlCostRows(p, y, m).rows)
      if (r.soll && (!row || row[r.key] === null || row[r.key] === undefined)) exp++;
  }
  return { inc, exp };
}

window.renderDashboard = function () {
  const host = document.getElementById('tab-dashboard');
  if (!host) return;
  CX.tab = 'dashboard';
  const y = window._ctrl.year, m = CX.month, future = _cxIsFuture(y, m);
  const props = window._ctrl.properties.filter(p => p.active);
  const tot = ctlPortfolioMonth(m);
  let openInc = 0, openExp = 0;
  const per = props.map(p => {
    const s = ctlPropertyMonth(p.id, m);
    const o = future ? { inc: 0, exp: 0 } : _cxOpenOf(p, y, m);
    openInc += o.inc; openExp += o.exp;
    return { p, s, open: o.inc + o.exp };
  });
  const open = openInc + openExp;
  _cxDashOpenInc = openInc;
  const pct = tot.rein > 0 ? Math.min(100, tot.raus / tot.rein * 100) : (tot.raus > 0 ? 100 : 0);

  const status = future
    ? '<div class="cx-stat cx-stat--muted"><span class="cx-dot"></span>Monat liegt in der Zukunft</div>'
    : open
      ? '<button class="cx-stat cx-stat--open" data-cx="gotoOpen"><span><span class="cx-dot"></span>' + (open === 1 ? '1 Posten noch offen' : open + ' Posten noch offen') + '</span><span class="cx-stat__go">Erfassen ›</span></button>'
      : '<div class="cx-stat cx-stat--ok"><span class="cx-dot"></span>' + CX_MONTHS[m - 1] + ' vollständig erfasst</div>';

  const hero = '<div class="cx-card cx-hero">' +
    '<div class="cx-lbl" style="text-align:center">Cashflow · Konto</div>' +
    '<div class="cx-hero__v' + (!future && tot.konto < 0 ? ' neg' : '') + '">' + (future ? '\u2014' : cxWS(tot.konto)) + '</div>' +
    '<div class="cx-hero__c">alles was reinkam, minus alles was rausging</div>' +
    '<div class="cx-bar"><div class="' + (tot.raus > tot.rein ? 'over' : '') + '" style="width:' + (future ? 0 : pct) + '%"></div></div>' +
    '<div class="cx-io"><div><div class="cx-lbl"><span class="cx-sw cx-sw--in"></span>Rein</div><div class="cx-io__v">' + (future ? '\u2014' : cxW(tot.rein)) + '</div></div>' +
    '<div style="text-align:right"><div class="cx-lbl"><span class="cx-sw cx-sw--out"></span>Raus</div><div class="cx-io__v">' + (future ? '\u2014' : cxW(tot.raus)) + '</div></div></div>' +
    status + '</div>';

  const cards = per.map(({ p, s, open }) => {
    const k = 'dash:' + p.id, isOpen = !!CX.open[k];
    let details = '';
    if (isOpen) {
      const lines = [];
      for (const u of ctlUnitsFor(p.id)) {
        const inc = u.id != null ? window._ctrl.income.find(r => r.unit_id === u.id && r.year === y && r.month === m) : null;
        const sl = ctlUnitSoll(u, p.id, y, m);
        if (!inc && !sl.soll) continue;
        lines.push([u.name + ' · Miete', inc ? cxEur((Number(inc.kaltmiete) || 0) + (Number(inc.nebenkosten) || 0)) : 'offen', !inc]);
        if (inc && (Number(inc.nebenkosten) || 0)) lines.push(['  davon Nebenkosten', cxEur(inc.nebenkosten), false, true]);
      }
      if (p.id === CASA_PROP_ID) {
        for (const r of ctlCasaCostRows(p, y, m).rows) {
          const x = window._ctrl.castel_expenses.find(e => e.category_id === r.catId && e.year === y && e.month === m);
          lines.push([r.label, x ? cxEur(x.amount) : 'offen', !x]);
        }
      } else {
        const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m);
        for (const r of ctlCostRows(p, y, m).rows) {
          const v = row ? row[r.key] : null;
          lines.push([r.label, v !== null && v !== undefined ? cxEur(v) : 'offen', v === null || v === undefined]);
        }
      }
      for (const o of (window._ctrl.one_time || []).filter(o => o.property_id === p.id && Number(String(o.invoice_date).slice(0, 4)) === y && Number(String(o.invoice_date).slice(5, 7)) === m))
        lines.push([([o.company, o.item].filter(Boolean).join(' · ') || 'Einmalig'), (Number(o.direction) === 1 ? '+ ' : '\u2212 ') + cxEur(o.amount), false]);
      details = '<div class="cx-det">' + (lines.length ? lines.map(l => '<div class="cx-kv' + (l[3] ? ' cx-kv--sub' : '') + '"><span>' + cxEsc(l[0]) + '</span><span class="' + (l[2] ? 'cx-kv--open' : '') + '">' + cxEsc(l[1]) + '</span></div>').join('') : '<div class="cx-kv"><span>Keine Buchungen</span><span></span></div>') + '</div>';
    }
    const nothing = !future && !s.rein && !s.raus;                 // nothing entered yet → "—", not a fake 0 €
    return '<div class="cx-card">' +
      '<button class="cx-ph" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
        '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(p.name) + '</span>' +
          '<span class="cx-src">' + (future ? 'noch nicht fällig' : nothing ? 'noch nichts erfasst' : 'rein ' + cxW(s.rein) + ' · raus ' + cxW(s.raus)) + '</span></span>' +
        '<span class="cx-ph__r">' + (open ? cxPill('open', open + ' offen') : '') +
          '<span class="cx-cf' + (!future && !nothing && s.konto < 0 ? ' neg' : '') + '">' + (future || nothing ? '\u2014' : cxWS(s.konto)) + '</span></span>' +
      '</button>' + details + '</div>';
  }).join('');

  // Year so far (up to today's month in the current year)
  const t = cxToday(), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7));
  const last = y < ty ? 12 : y > ty ? 0 : tm;
  let yr = 0;
  for (let i = 1; i <= last; i++) yr += Number(ctlPortfolioMonth(i).konto) || 0;
  const yLbl = y + (last === 12 ? '' : last ? ' bisher · Jan – ' + ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][last - 1] : '');

  host.innerHTML = '<div class="cx-page">' + cxMonthBar() + hero +
    '<div class="cx-head"><span class="cx-lbl">Immobilien</span><span class="cx-lbl">Cashflow</span></div>' + cards +
    '<div class="cx-card cx-year"><span class="cx-lbl">' + cxEsc(yLbl) + '</span><span class="cx-year__v' + (yr < 0 ? ' neg' : '') + '">' + cxWS(yr) + '</span></div>' +
    '</div>';

  cxWire(host, {
    render: () => window.renderDashboard(),
    click: (a) => { if (a === 'gotoOpen') cxGoto(_cxDashOpenInc ? 'income' : 'expenses'); },
  });
};
