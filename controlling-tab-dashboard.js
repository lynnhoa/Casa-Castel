/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DASHBOARD (read only)
   controlling-tab-dashboard.js

   One switch "Monat | Jahr" — one layout, only the values change:
     · period selector   ‹ September 2026 ›  /  ‹ 2026 ›
     · second switch     "Konto | Tatsächlich" (D18): Warm rein − Warm raus
                         with / without the Kreditrate — same layout
     · main card         the period's result (the only big number),
                         Warm rein / Warm raus, davon lines, status line
     · one card per property with the period's values; tap for details
                         (Monat: the month's items · Jahr: month by month)
   Jahr = 1 January up to the current month (whole year for past years).
   Entering happens only in Einnahmen, Ausgaben and Einmalig.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxDash = { openInc: 0, openMonth: 0 };           // for the jump targets
if (!CX.dashView) CX.dashView = 'm';                    // default: Monat
if (CX.dashMode !== 'konto' && CX.dashMode !== 'tats') CX.dashMode = 'konto';   // Konto | Tatsächlich (D18)

/* Konto / Tatsächlich of several properties over several months (change round 3) */
function _cxActualSum(pids, months) {
  const s = { rein: 0, raus: 0, rausKonto: 0, rate: 0, tats: 0, konto: 0, meineKosten: 0, abr: 0 };
  for (const m of months) for (const pid of pids) {
    const a = ctlActualMonth(pid, m);
    for (const k in s) s[k] += a[k];
  }
  for (const k in s) s[k] = cxR(s[k]);
  return s;
}

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
  if (typeof ctlAbrOpenCount === 'function') { inc += ctlAbrOpenCount(p.id, y, m, 1); exp += ctlAbrOpenCount(p.id, y, m, -1); }   // finished Abrechnungen to confirm
  return { inc, exp };
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
  const isYear = CX.dashView === 'y', tats = CX.dashMode === 'tats';
  const y = window._ctrl.year, m = CX.month;
  const months = isYear ? _cxYearMonths(y) : [m];
  const future = isYear ? months.length === 0 : _cxIsFuture(y, m);
  const props = window._ctrl.properties.filter(p => p.active);
  const tot = _cxActualSum(props.map(p => p.id), future ? [] : months);
  const shortM = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const periodLbl = isYear ? y + (months.length && months.length < 12 ? ' · Jan – ' + shortM[months.length - 1] : '') : CX_MONTHS[m - 1];
  const val = s => (tats ? s.tats : s.konto), out = s => (tats ? s.raus : s.rausKonto);
  const D = '\u2014';

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
    return { p, s: _cxActualSum([p.id], future ? [] : months), open };
  });
  _cxDash.openInc = openInc;
  _cxDash.openMonth = openMonths.size ? Math.max(...openMonths) : 0;
  const pct = tot.rein > 0 ? Math.min(100, out(tot) / tot.rein * 100) : (out(tot) > 0 ? 100 : 0);
  const prelim = !future && (isYear ? openMonths.size > 0 : openInc + openExp > 0);

  const setLine = '';                                       // settlement tracking lives in the Abrechnungen app (later)

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

  // One layout for Konto and Tatsächlich — only labels and values change
  const hero = '<div class="cx-card cx-hero">' +
    '<div class="cx-lbl" style="text-align:center">' + (tats ? 'Tatsächlich' : 'Konto') + ' · ' + cxEsc(periodLbl) + (prelim ? ' · vorläufig' : '') + '</div>' +
    '<div class="cx-hero__v' + (!future && val(tot) < 0 ? ' neg' : '') + '">' + (future ? D : cxWS(val(tot))) + '</div>' +
    '<div class="cx-hero__c">Warm rein − Warm raus, ' + (tats ? 'ohne' : 'inkl.') + ' Kreditrate</div>' +
    '<div class="cx-bar"><div class="' + (out(tot) > tot.rein ? 'over' : '') + '" style="width:' + (future ? 0 : pct) + '%"></div></div>' +
    '<div class="cx-io"><div><div class="cx-lbl"><span class="cx-sw cx-sw--in"></span>Warm rein</div><div class="cx-io__v">' + (future ? D : cxW(tot.rein)) + '</div></div>' +
    '<div style="text-align:right"><div class="cx-lbl"><span class="cx-sw cx-sw--out"></span>Warm raus</div><div class="cx-io__v">' + (future ? D : cxW(out(tot))) + '</div></div></div>' +
    '<div class="cx-davon">' +
      (tats
        ? '<div class="cx-kv"><span>davon meine Kosten <span class="cx-davon__h">· Hausgeld − NK</span></span><span>' + (future ? D : cxW(tot.meineKosten)) + '</span></div>'
        : '<div class="cx-kv"><span>davon Kreditrate</span><span>' + (future ? D : cxW(tot.rate)) + '</span></div>') +
      (!future && tot.abr ? '<div class="cx-kv"><span>davon Abrechnungen</span><span>' + cxWS(tot.abr) + '</span></div>' : '') +
    '</div>' +
    status + setLine + '</div>';

  const cards = per.map(({ p, s, open }) => {
    const k = 'dash:' + CX.dashView + ':' + p.id, isOpen = !!CX.open[k];
    const nothing = !future && !s.rein && !s.rausKonto;
    let details = '';
    if (isOpen) {
      const lines = [];
      if (isYear) {
        for (const mm of months) {
          const a = ctlActualMonth(p.id, mm), o = _cxOpenOf(p, y, mm), op = o.inc + o.exp;
          lines.push([CX_MONTHS[mm - 1] + (op ? ' · ' + op + ' offen' : ''), (!a.rein && !a.rausKonto) ? D : cxWS(tats ? a.tats : a.konto), op > 0]);
        }
      } else if (!future) {
        for (const [label, amt, kontoOnly] of ctlActualMonth(p.id, m).lines)
          if (!(kontoOnly && tats)) lines.push([label, (amt > 0 ? '' : '\u2212 ') + cxEur(Math.abs(amt)), false]);
      }
      details = '<div class="cx-det">' + (lines.length ? lines.map(l => '<div class="cx-kv"><span>' + cxEsc(l[0]) + '</span><span class="' + (l[2] ? 'cx-kv--open' : '') + '">' + cxEsc(l[1]) + '</span></div>').join('') : '<div class="cx-kv"><span>Keine Buchungen</span><span></span></div>') + '</div>';
    }
    const pill = open ? (isYear ? cxPill('open', 'vorläufig') : cxPill('open', open + ' offen')) : '';
    return '<div class="cx-card">' +
      '<button class="cx-ph" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
        '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(p.name) + '</span>' +
          '<span class="cx-src' + (future || nothing ? ' cx-src--empty' : '') + '">' + (future ? 'noch nicht fällig' : nothing ? 'noch nichts erfasst' : 'rein ' + cxW(s.rein) + ' · raus ' + cxW(out(s))) + '</span></span>' +
        '<span class="cx-ph__r">' + pill +
          '<span class="cx-cf' + (!future && !nothing && val(s) < 0 ? ' neg' : '') + '">' + (future || nothing ? D : cxWS(val(s))) + '</span></span>' +
      '</button>' + details + '</div>';
  }).join('');

  host.innerHTML = '<div class="cx-page">' +
    '<div class="cx-views">' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Zeitraum">' +
      '<button class="' + (isYear ? '' : 'on') + '" data-cx="view" data-v="m" aria-pressed="' + !isYear + '">Monat</button>' +
      '<button class="' + (isYear ? 'on' : '') + '" data-cx="view" data-v="y" aria-pressed="' + isYear + '">Jahr</button>' +
    '</div>' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Ansicht">' +
      '<button class="' + (tats ? '' : 'on') + '" data-cx="mode" data-v="konto" aria-pressed="' + !tats + '">Konto</button>' +
      '<button class="' + (tats ? 'on' : '') + '" data-cx="mode" data-v="tats" aria-pressed="' + tats + '">Tatsächlich</button>' +
    '</div></div>' +
    _cxPeriodBar(isYear) + hero +
    '<div class="cx-head"><span class="cx-lbl">Immobilien</span><span class="cx-lbl">' + (tats ? 'Tatsächlich' : 'Konto') + ' · ' + cxEsc(isYear ? String(y) : CX_MONTHS[m - 1]) + '</span></div>' + cards +
    '</div>';

  cxWire(host, {
    render: () => window.renderDashboard(),
    click: async (a, b) => {
      if (a === 'view') { CX.dashView = b.dataset.v; return window.renderDashboard(); }
      if (a === 'mode') { CX.dashMode = b.dataset.v; return window.renderDashboard(); }
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
