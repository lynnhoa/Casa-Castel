/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DASHBOARD (read only)
   controlling-tab-dashboard.js

   One switch "Monat | Jahr" — one layout, only the values change:
     · period selector   ‹ September 2026 ›  /  ‹ 2026 ›
     · main card         Cashflow of the period (the only big number),
                         Rein / Raus bar, davon Tilgung, davon Einmalig,
                         status line (open items → Erfassen / vorläufig)
     · one card per property with the period's values; tap for details
                         (Monat: the month's items · Jahr: month by month)
   Jahr = 1 January up to the current month (whole year for past years).
   Entering happens only in Einnahmen, Ausgaben and Einmalig.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxDash = { openInc: 0, openMonth: 0 };           // for the jump targets
if (!CX.dashView) CX.dashView = 'm';                    // default: Monat

function _cxIsFuture(y, m) {
  const t = cxToday(), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7));
  return y > ty || (y === ty && m > tm);
}
function _cxYearMonths(y) {                             // 1 … current month (all 12 for past years)
  const t = cxToday(), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7));
  const last = y < ty ? 12 : y > ty ? 0 : tm;
  return Array.from({ length: last }, (_, i) => i + 1);
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

/* Tilgung paid in a month (from the Kreditrate entries).
   Apartments store it with the rate; Casa Castel stores only the amount →
   split by the loan's Zins/Tilgung ratio from Properties.                */
function _cxTilgung(pid, y, m) {
  let t = 0;
  if (pid === CASA_PROP_ID) {
    const p = ctlProp(pid), loan = p ? ctlPropLinks(p).loan : null;
    const rate = loan ? Number(loan.rate) || 0 : 0, share = rate ? (Number(loan.tilgung) || 0) / rate : 0;
    const rateCat = (window._ctrl.categories || []).find(c => c.code === 'RATE');
    if (rateCat && share) for (const e of window._ctrl.castel_expenses)
      if (e.category_id === rateCat.id && e.year === y && e.month === m) t += (Number(e.amount) || 0) * share;
  } else {
    for (const e of window._ctrl.apt_expenses)
      if (e.property_id === pid && e.year === y && e.month === m) t += Number(e.tilgung) || 0;
  }
  return t;
}

function _cxSum(pids, months) {
  const s = { rein: 0, raus: 0, konto: 0, tilg: 0, ein: 0 };
  for (const m of months) for (const pid of pids) {
    const x = ctlPropertyMonth(pid, m);
    s.rein += x.rein; s.raus += x.raus; s.konto += x.konto; s.ein += x.one_time;
    s.tilg += _cxTilgung(pid, window._ctrl.year, m);
  }
  return s;
}

function _cxPeriodBar(isYear) {
  if (!isYear) return cxMonthBar();
  return '<div class="cx-month">' +
    '<button class="cx-arw" data-cx="yprev" aria-label="Vorheriges Jahr"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + window._ctrl.year + '</div>' +
    '<div class="cx-month__s">Stand ' + cxFmtDate(cxToday()) + '</div></div>' +
    '<button class="cx-arw" data-cx="ynext" aria-label="Nächstes Jahr"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}

window.renderDashboard = function () {
  const host = document.getElementById('tab-dashboard');
  if (!host) return;
  CX.tab = 'dashboard';
  const isYear = CX.dashView === 'y';
  const y = window._ctrl.year, m = CX.month;
  const months = isYear ? _cxYearMonths(y) : [m];
  const future = isYear ? months.length === 0 : _cxIsFuture(y, m);
  const props = window._ctrl.properties.filter(p => p.active);
  const tot = _cxSum(props.map(p => p.id), future ? [] : months);
  const shortM = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const periodLbl = isYear ? y + (months.length && months.length < 12 ? ' · Jan – ' + shortM[months.length - 1] : '') : CX_MONTHS[m - 1];

  // Open items per property (and which months are open, for Jahr)
  let openInc = 0, openExp = 0;
  const openMonths = new Set();
  const per = props.map(p => {
    let open = 0;
    if (!future) for (const mm of months) {
      const o = _cxOpenOf(p, y, mm);
      if (o.inc + o.exp) openMonths.add(mm);
      open += o.inc + o.exp;
      if (!isYear) { openInc += o.inc; openExp += o.exp; }
    }
    return { p, s: _cxSum([p.id], future ? [] : months), open };
  });
  _cxDash.openInc = openInc;
  _cxDash.openMonth = openMonths.size ? Math.max(...openMonths) : 0;
  const pct = tot.rein > 0 ? Math.min(100, tot.raus / tot.rein * 100) : (tot.raus > 0 ? 100 : 0);

  let status;
  if (future) status = '<div class="cx-stat cx-stat--muted"><span class="cx-dot"></span>' + (isYear ? 'Jahr liegt in der Zukunft' : 'Monat liegt in der Zukunft') + '</div>';
  else if (isYear) {
    const n = openMonths.size;
    status = n
      ? '<button class="cx-stat cx-stat--open" data-cx="gotoOpenMonth"><span><span class="cx-dot"></span>vorläufig · ' + (n === 1 ? CX_MONTHS[_cxDash.openMonth - 1] + ' noch offen' : n + ' Monate noch offen') + '</span><span class="cx-stat__go">Ansehen ›</span></button>'
      : '<div class="cx-stat cx-stat--ok"><span class="cx-dot"></span>' + periodLbl + ' vollständig erfasst</div>';
  } else {
    const open = openInc + openExp;
    status = open
      ? '<button class="cx-stat cx-stat--open" data-cx="gotoOpen"><span><span class="cx-dot"></span>' + (open === 1 ? '1 Posten noch offen' : open + ' Posten noch offen') + '</span><span class="cx-stat__go">Erfassen ›</span></button>'
      : '<div class="cx-stat cx-stat--ok"><span class="cx-dot"></span>' + CX_MONTHS[m - 1] + ' vollständig erfasst</div>';
  }

  const hero = '<div class="cx-card cx-hero">' +
    '<div class="cx-lbl" style="text-align:center">Cashflow · ' + cxEsc(periodLbl) + '</div>' +
    '<div class="cx-hero__v' + (!future && tot.konto < 0 ? ' neg' : '') + '">' + (future ? '\u2014' : cxWS(tot.konto)) + '</div>' +
    '<div class="cx-hero__c">alles was reinkam, minus alles was rausging</div>' +
    '<div class="cx-bar"><div class="' + (tot.raus > tot.rein ? 'over' : '') + '" style="width:' + (future ? 0 : pct) + '%"></div></div>' +
    '<div class="cx-io"><div><div class="cx-lbl"><span class="cx-sw cx-sw--in"></span>Rein</div><div class="cx-io__v">' + (future ? '\u2014' : cxW(tot.rein)) + '</div></div>' +
    '<div style="text-align:right"><div class="cx-lbl"><span class="cx-sw cx-sw--out"></span>Raus</div><div class="cx-io__v">' + (future ? '\u2014' : cxW(tot.raus)) + '</div></div></div>' +
    '<div class="cx-davon">' +
      '<div class="cx-kv"><span>davon Tilgung <span class="cx-davon__h">· baut Vermögen auf</span></span><span class="cx-davon__t">' + (future ? '\u2014' : cxW(tot.tilg)) + '</span></div>' +
      '<div class="cx-kv"><span>davon Einmalig</span><span>' + (future ? '\u2014' : cxW(tot.ein)) + '</span></div>' +
    '</div>' +
    status + '</div>';

  const cards = per.map(({ p, s, open }) => {
    const k = 'dash:' + CX.dashView + ':' + p.id, isOpen = !!CX.open[k];
    const nothing = !future && !s.rein && !s.raus;
    let details = '';
    if (isOpen) {
      const lines = [];
      if (isYear) {
        for (const mm of months) {
          const x = ctlPropertyMonth(p.id, mm);
          const o = _cxOpenOf(p, y, mm), op = o.inc + o.exp;
          lines.push([CX_MONTHS[mm - 1] + (op ? ' · ' + op + ' offen' : ''), (!x.rein && !x.raus) ? '\u2014' : cxWS(x.konto), op > 0]);
        }
      } else {
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
      }
      details = '<div class="cx-det">' + (lines.length ? lines.map(l => '<div class="cx-kv' + (l[3] ? ' cx-kv--sub' : '') + '"><span>' + cxEsc(l[0]) + '</span><span class="' + (l[2] ? 'cx-kv--open' : '') + '">' + cxEsc(l[1]) + '</span></div>').join('') : '<div class="cx-kv"><span>Keine Buchungen</span><span></span></div>') + '</div>';
    }
    const pill = open ? (isYear ? cxPill('open', 'vorläufig') : cxPill('open', open + ' offen')) : '';
    return '<div class="cx-card">' +
      '<button class="cx-ph" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
        '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(p.name) + '</span>' +
          '<span class="cx-src' + (future || nothing ? ' cx-src--empty' : '') + '">' + (future ? 'noch nicht fällig' : nothing ? 'noch nichts erfasst' : 'rein ' + cxW(s.rein) + ' · raus ' + cxW(s.raus)) + '</span></span>' +
        '<span class="cx-ph__r">' + pill +
          '<span class="cx-cf' + (!future && !nothing && s.konto < 0 ? ' neg' : '') + '">' + (future || nothing ? '\u2014' : cxWS(s.konto)) + '</span></span>' +
      '</button>' + details + '</div>';
  }).join('');

  host.innerHTML = '<div class="cx-page">' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Zeitraum">' +
      '<button class="' + (isYear ? '' : 'on') + '" data-cx="view" data-v="m" aria-pressed="' + !isYear + '">Monat</button>' +
      '<button class="' + (isYear ? 'on' : '') + '" data-cx="view" data-v="y" aria-pressed="' + isYear + '">Jahr</button>' +
    '</div>' +
    _cxPeriodBar(isYear) + hero +
    '<div class="cx-head"><span class="cx-lbl">Immobilien</span><span class="cx-lbl">Cashflow · ' + cxEsc(isYear ? String(y) : CX_MONTHS[m - 1]) + '</span></div>' + cards +
    '</div>';

  cxWire(host, {
    render: () => window.renderDashboard(),
    click: async (a, b) => {
      if (a === 'view') { CX.dashView = b.dataset.v; return window.renderDashboard(); }
      if (a === 'gotoOpen') return cxGoto(_cxDash.openInc ? 'income' : 'expenses');
      if (a === 'gotoOpenMonth') { CX.dashView = 'm'; CX.month = _cxDash.openMonth || CX.month; try { localStorage.setItem('cx_month', String(CX.month)); } catch (e) {} return window.renderDashboard(); }
      if (a === 'yprev' || a === 'ynext') {
        const ny = window._ctrl.year + (a === 'yprev' ? -1 : 1);
        if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
        try { await ctlLoadAll(ny); } catch (e) { cxToastErr(e); }
        if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
        return window.renderDashboard();
      }
    },
  });
};
