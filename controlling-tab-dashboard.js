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
    const rateCat = (window._ctrl.categories || []).find(c => c.code === 'RATE');
    for (const r of ctlCasaCostRows(p, y, m).rows)
      if (r.soll && !(rateCat && r.catId === rateCat.id) &&
          !window._ctrl.castel_expenses.some(e => e.category_id === r.catId && e.year === y && e.month === m)) exp++;
  } else {
    const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m);
    for (const r of ctlCostRows(p, y, m).rows)
      if (r.key !== 'rate' && r.soll && (!row || row[r.key] === null || row[r.key] === undefined)) exp++;   // Kreditrate: from Properties
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

/* ══════════════════════════════════════════════════════════════
   DASHBOARD v2 (Oct 2026) — one question: what is freely available?
   · only switch: Monat | Jahr
   · big number: Frei verfügbar (warm, after everything) · warm + kalt rent
   · one bar "Wohin die Miete geht": house costs · Zinsen · Tilgung ·
     Kreditrate (no split known) · Einmalig · Frei — line = Kaltmiete
   · "Rechnung anzeigen": the calculation, Kalt | Warm, three results:
     laufend → nach Einmalig → nach Abrechnungen (= frei verfügbar)
   · per property: one bar each, tap → the same calculation for it
   Kreditraten come from Properties (rate, Zinsen, Tilgung) — not entered.
   ══════════════════════════════════════════════════════════════ */

/* One property over some months (all Ist values; loans from Properties) */
function _cxDashProp(p, months) {
  const y = window._ctrl.year, casa = p.id === CASA_PROP_ID;
  const rateCat = (window._ctrl.categories || []).find(c => c.code === 'RATE');
  const r = { kalt: 0, nk: 0, kosten: 0, einmalig: 0, abr: 0, rate: 0, zins: 0, tilg: 0, unknown: 0, split: true, loan: null };
  for (const m of months) {
    const x = ctlPropertyMonth(p.id, m);
    r.kalt += x.kalt; r.nk += x.neben;
    if (casa) {
      for (const e of window._ctrl.castel_expenses)
        if (e.year === y && e.month === m && !(rateCat && e.category_id === rateCat.id)) r.kosten += Number(e.amount) || 0;
    } else {
      const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m) || {};
      r.kosten += (Number(row.hausgeld) || 0) + (Number(row.grundsteuer) || 0) + (Number(row.strom) || 0);
    }
    for (const o of (window._ctrl.one_time || [])) {
      if (Number(o.property_id) !== p.id) continue;
      const d = ctlParseDate(o.invoice_date);
      if (d.year !== y || d.month !== m) continue;
      const signed = (Number(o.direction) === 1 ? 1 : -1) * (Number(o.amount) || 0);
      if (CX_ABR_KINDS.includes(o.kind)) r.abr += signed;     // Hausgeld / NK results
      else r.einmalig -= signed;                                // one-off costs (a refund lowers them)
    }
  }
  // Kreditrate from Properties: Zinsen + Tilgung when both are known there
  const loan = ctlPropLinks(p).loan;
  if (loan && Number(loan.rate) > 0 && months.length) {
    const n = months.length, rate = Number(loan.rate), z = Number(loan.zinsen) || 0, t = Number(loan.tilgung) || 0;
    r.loan = loan; r.rate = rate * n;
    if (z > 0 && t > 0) { r.zins = z * n; r.tilg = Math.max(0, rate - z) * n; }
    else { r.unknown = rate * n; r.split = false; }
  }
  for (const k of ['kalt', 'nk', 'kosten', 'einmalig', 'abr', 'rate', 'zins', 'tilg', 'unknown']) r[k] = cxR(r[k]);
  r.warm      = cxR(r.kalt + r.nk);
  r.lfWarm    = cxR(r.warm - r.kosten - r.rate);          // Bleibt laufend
  r.lfKalt    = cxR(r.kalt - r.rate);
  r.eiWarm    = cxR(r.lfWarm - r.einmalig);               // Nach Einmalig
  r.eiKalt    = cxR(r.lfKalt - r.einmalig);
  r.freiWarm  = cxR(r.eiWarm + r.abr);                    // Frei verfügbar (after Abrechnungen)
  r.freiKalt  = r.eiKalt;                                 // Abrechnungen are Nebenkosten money → warm only
  return r;
}
function _cxDashSum(list) {
  const t = { kalt: 0, nk: 0, kosten: 0, einmalig: 0, abr: 0, rate: 0, zins: 0, tilg: 0, unknown: 0, warm: 0,
              lfWarm: 0, lfKalt: 0, eiWarm: 0, eiKalt: 0, freiWarm: 0, freiKalt: 0, noSplit: 0 };
  for (const r of list) { for (const k in t) if (k !== 'noSplit') t[k] += r[k] || 0; if (r.loan && !r.split) t.noSplit++; }
  for (const k in t) if (k !== 'noSplit') t[k] = cxR(t[k]);
  return t;
}

/* The calculation: Kalt | Warm, three results */
function _cxDashCalc(t, note) {
  const D = '\u2014', n = v => (Math.round(Number(v) || 0)).toLocaleString('de-DE');
  const st = (l, k, w) => '<div class="cxd-tr cxd-st"><span>' + l + '</span><span>' + k + '</span><span>' + w + '</span></div>';
  const res = (l, sub, k, w, fin) => '<div class="cxd-tr cxd-res' + (fin ? ' cxd-fin' : '') + '"><span>' + l + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
    '<span' + (k < 0 ? ' style="color:var(--cx-neg)"' : '') + '>' + n(k) + '</span><span' + (w < 0 ? ' style="color:var(--cx-neg)"' : '') + '>' + n(w) + '</span></div>';
  return '<div class="cxd-tbl">' +
    '<div class="cxd-tr cxd-th"><span></span><span>KALT</span><span>WARM</span></div>' +
    st('Miete', n(t.kalt), n(t.warm)) +
    st('\u2212 Hausgeld, Hauskosten', D, n(t.kosten)) +
    st('\u2212 Kreditraten', n(t.rate), n(t.rate)) +
    res('Bleibt laufend', 'vor Einmalig & Abrechnungen', t.lfKalt, t.lfWarm) +
    st('\u2212 Einmalig', n(t.einmalig), n(t.einmalig)) +
    res('Nach Einmalig', '', t.eiKalt, t.eiWarm) +
    st('\u00b1 Abrechnungen', D, (t.abr > 0 ? '+ ' : t.abr < 0 ? '\u2212 ' : '') + n(Math.abs(t.abr))) +
    res('Frei verfügbar', '', t.freiKalt, t.freiWarm, true) +
  '</div>' + (note ? '<div class="cxd-tnote">' + note + '</div>' : '');
}

window.renderDashboard = function () {
  const host = document.getElementById('tab-dashboard');
  if (!host) return;
  CX.tab = 'dashboard';
  const isYear = CX.dashView === 'y';
  const y = window._ctrl.year, m = CX.month;
  const months = isYear ? _cxYearMonths(y) : (_cxIsFuture(y, m) ? [] : [m]);
  const future = !months.length;
  const shortM = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const props = window._ctrl.properties.filter(p => p.active);
  const per = props.map(p => ({ p, r: _cxDashProp(p, months) }));
  const t = _cxDashSum(per.map(x => x.r));
  const D = '\u2014';

  // open items (to enter / confirm) in the period
  let open = 0, openInc = 0, openCasa = 0;
  const openMonths = new Set();
  for (const p of props) for (const mm of months) {
    const o = _cxOpenOf(p, y, mm), k = o.inc + o.exp;
    if (k) openMonths.add(mm);
    open += k; openInc += o.inc;
    if (p.id === CASA_PROP_ID) openCasa += k;
  }
  _cxDash.openInc = openInc; _cxDash.openCasa = openCasa; _cxDash.open = open;
  _cxDash.openMonth = openMonths.size ? Math.max(...openMonths) : 0;

  const periodTitle = isYear ? String(y) : CX_MONTHS[m - 1] + ' ' + y;
  const periodWord  = isYear ? (months.length && months.length < 12 ? 'Jan – ' + shortM[months.length - 1] + ' ' + y : String(y)) : 'im ' + CX_MONTHS[m - 1];

  // ── Top: switch + period
  const top = '<div class="cxd-top">' +
    '<div class="cxd-per">' +
      '<button class="cx-arw" data-cx="' + (isYear ? 'yprev' : 'prev') + '" aria-label="Zurück"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="cxd-per__t">' + cxEsc(periodTitle) + '</span>' +
      '<button class="cx-arw" data-cx="' + (isYear ? 'ynext' : 'next') + '" aria-label="Weiter"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>' +
    '</div>' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Zeitraum">' +
      '<button class="' + (isYear ? '' : 'on') + '" data-cx="view" data-v="m" aria-pressed="' + !isYear + '">Monat</button>' +
      '<button class="' + (isYear ? 'on' : '') + '" data-cx="view" data-v="y" aria-pressed="' + isYear + '">Jahr</button>' +
    '</div></div>';

  // ── Big number
  const tilgKnown = t.tilg > 0 ? '<div class="cxd-hero__t">+ ' + cxW(t.tilg) + ' in Tilgung angespart</div>' : '';
  const hero = '<div class="cxd-hero">' +
    '<div class="cxd-hero__l">Frei verfügbar ' + cxEsc(periodWord) + (open ? ' · vorläufig' : '') + '</div>' +
    '<div class="cxd-hero__v' + (!future && t.freiWarm < 0 ? ' neg' : '') + '">' + (future ? D : cxW(t.freiWarm)) + '</div>' +
    (future ? '<div class="cxd-hero__s">' + (isYear ? 'Jahr' : 'Monat') + ' liegt in der Zukunft</div>'
            : '<div class="cxd-hero__s">von ' + cxW(t.warm) + ' Miete warm · <b>kalt ' + cxW(t.kalt) + '</b></div>' + tilgKnown) +
    (open ? '<button class="cxd-open" data-cx="gotoOpen"><i class="ti ti-point-filled" aria-hidden="true"></i> ' + open + (open === 1 ? ' Posten' : ' Posten') + ' noch offen · <u>erfassen</u></button>' : '') +
  '</div>';

  // ── One bar: where the (warm) rent goes
  let barCard = '';
  if (!future) {
    const segs = [
      ['Hausgeld, Hauskosten', t.kosten, '#B8A58C'],
      ['Zinsen', t.zins, '#C0785A'],
      ['Tilgung', t.tilg, '#7A6A58'],
      ['Kreditrate', t.unknown, '#A89C8E'],
      ['Einmalig', t.einmalig, '#D4A87A'],
      ['Frei', Math.max(0, t.freiWarm), '#6E9A5A'],
    ].filter(s => s[1] > 0);
    const base = Math.max(t.warm, segs.reduce((a, s) => a + s[1], 0), 1);
    const bar = '<div class="cxd-bar">' + segs.map(s => '<span style="flex:' + Math.round(s[1]) + ';background:' + s[2] + '">' +
      (s[1] / base > 0.16 ? (Math.round(s[1])).toLocaleString('de-DE') : '') + '</span>').join('') + '</div>';
    const kp = t.kalt > 0 ? Math.min(100, t.kalt / base * 100) : 0;
    const kaltLine = kp ? '<div class="cxd-kalt"><i style="right:0;width:' + kp.toFixed(1) + '%"></i><span>◂ Kaltmiete ' + cxW(t.kalt) + '</span></div>' : '';
    const legend = '<div class="cxd-leg">' + segs.map(s => '<span><i style="background:' + s[2] + '"></i>' +
      (s[0] === 'Kreditrate' ? 'Kreditrate · ohne Aufteilung' : s[0] === 'Frei' ? 'Frei' + (t.abr ? ' · inkl. Abr. ' + cxWS(t.abr) : '') : s[0]) + '</span>').join('') +
      (t.freiWarm < 0 ? '<span style="color:var(--cx-neg)">Minus ' + cxW(-t.freiWarm) + '</span>' : '') + '</div>';
    const hint = t.noSplit ? '<button class="cxd-hint" data-cx="toProps">' + t.noSplit + (t.noSplit === 1 ? ' Darlehen' : ' Darlehen') +
      ' ohne Zinsen/Tilgung · in Properties ergänzen ›</button>' : '';
    const calcOpen = !!CX.open['dash:calc'];
    barCard = '<div class="cx-card" style="padding:12px 14px 10px">' +
      '<div class="cx-lbl">Wohin die Miete geht</div>' + bar + kaltLine + legend + hint +
      '<button class="cxd-calcbtn" data-cx="fold" data-k="dash:calc" aria-expanded="' + calcOpen + '"><span>Rechnung anzeigen' +
        '<small>kalt & warm · vor/nach Einmalig & Abrechnungen</small></span><i class="ti ti-chevron-' + (calcOpen ? 'up' : 'down') + '" aria-hidden="true"></i></button>' +
      (calcOpen ? _cxDashCalc(t, 'Kalt = Kaltmiete ohne Nebenkosten-Geld und Hauskosten · Warm = was wirklich aufs Konto kam und ging. Kreditraten aus Properties.') : '') +
    '</div>';
  }

  // ── Per property: one bar each, tap → its calculation
  let propCard = '';
  if (!future) {
    const order = per.slice().sort((a, b) => b.r.freiWarm - a.r.freiWarm);
    const mx = Math.max(1, ...order.map(x => Math.abs(x.r.freiWarm)));
    const rows = order.map(({ p, r }) => {
      const k = 'dash:p:' + p.id, isOpen = !!CX.open[k], neg = r.freiWarm < 0;
      const w = Math.max(2, Math.abs(r.freiWarm) / mx * 100);
      return '<button class="cxd-pr" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
          '<span class="cxd-pr__n">' + cxEsc(p.name) + '</span>' +
          '<span class="cxd-track"><i class="' + (neg ? 'neg' : '') + '" style="width:' + w.toFixed(1) + '%"></i></span>' +
          '<span class="cxd-pr__v' + (neg ? ' neg' : '') + '">' + (neg ? '\u2212\u202f' : '') + Math.abs(Math.round(r.freiWarm)).toLocaleString('de-DE') + '</span></button>' +
        (isOpen ? '<div class="cxd-pdet">' + _cxDashCalc(r, r.loan && !r.split ? 'Darlehen ohne Zinsen/Tilgung in Properties.' : '') + '</div>' : '');
    }).join('');
    propCard = '<div class="cx-card" style="padding:12px 14px">' +
      '<div class="cx-row-sb"><span class="cx-lbl">Frei je Immobilie</span><span class="cx-lbl">warm · €</span></div>' +
      '<div style="margin-top:4px">' + rows + '</div></div>';
  }

  host.innerHTML = '<div class="cx-page">' + top + hero + barCard + propCard + '</div>';

  cxWire(host, {
    render: () => window.renderDashboard(),
    click: async (a, b) => {
      if (a === 'view') { CX.dashView = b.dataset.v; return window.renderDashboard(); }
      if (a === 'gotoOpen') {
        // wired once → read the live view (CX.dashView), not this render's
        if (CX.dashView === 'y' && _cxDash.openMonth) { CX.month = _cxDash.openMonth; try { localStorage.setItem('cx_month', String(CX.month)); } catch (e) {} }
        CX.sub = _cxDash.openInc ? 'income' : 'expenses';
        return cxGoto(_cxDash.openCasa && _cxDash.openCasa === _cxDash.open ? 'casa' : 'rentals');
      }
      if (a === 'toProps') { location.href = 'properties.html'; return; }
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
