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
      for (const e of window._ctrl.castel_expenses) {
        if (e.year !== y || e.month !== m) continue;
        if (rateCat && e.category_id === rateCat.id) r.rate += Number(e.amount) || 0;   // Kreditrate as booked
        else r.kosten += Number(e.amount) || 0;
      }
    } else {
      const row = window._ctrl.apt_expenses.find(e => e.property_id === p.id && e.year === y && e.month === m) || {};
      r.kosten += (Number(row.hausgeld) || 0) + (Number(row.grundsteuer) || 0) + (Number(row.strom) || 0);
      r.rate   += Number(row.rate) || 0;                                                  // Kreditrate as booked
      if (row.zinsen !== null && row.zinsen !== undefined) { r.zinsB = (r.zinsB || 0) + (Number(row.zinsen) || 0); r.tilgB = (r.tilgB || 0) + (Number(row.tilgung) || 0); }
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
  // Kreditrate = what you confirmed in Expenses (Soll comes from Properties). It is split into
  // Zinsen and Tilgung in the ratio Properties gives for the loan; without that ratio it stays one amount.
  const loan = ctlPropLinks(p).loan;
  if (loan) r.loan = loan;
  if (r.rate > 0) {
    const L = Number(loan && loan.rate) || 0, z = Number(loan && loan.zinsen) || 0, t = Number(loan && loan.tilgung) || 0;
    if (r.zinsB !== undefined && Math.abs((r.zinsB || 0) + (r.tilgB || 0) - r.rate) < 0.05) { r.zins = r.zinsB; r.tilg = r.tilgB; }   // booked per month (bank debits / monthly estimate)
    else if (L > 0 && z > 0 && t > 0) { r.zins = r.rate * z / (z + t); r.tilg = r.rate - r.zins; }
    else { r.unknown = r.rate; r.split = false; }
  }
  delete r.zinsB; delete r.tilgB;
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
  const D = '\u2014', n = v => cxW(v);                     // always with €
  const st = (l, k, w) => '<div class="cxd-tr cxd-st"><span>' + l + '</span><span>' + k + '</span><span>' + w + '</span></div>';
  const res = (l, sub, k, w, fin) => '<div class="cxd-tr cxd-res' + (fin ? ' cxd-fin' : '') + '"><span>' + l + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
    '<span' + (k < 0 ? ' style="color:var(--cx-neg)"' : '') + '>' + n(k) + '</span><span' + (w < 0 ? ' style="color:var(--cx-neg)"' : '') + '>' + n(w) + '</span></div>';
  return '<div class="cxd-tbl">' +
    '<div class="cxd-tr cxd-th"><span></span><span>KALT<small>without NK</small></span><span>WARM<small>incl. NK</small></span></div>' +
    st('Rent', n(t.kalt), n(t.warm)) +
    st('\u2212 Hausgeld, house costs', D, n(t.kosten)) +
    st('\u2212 Kreditraten', n(t.rate), n(t.rate)) +
    res('Running cashflow', 'before one-offs & Abrechnungen', t.lfKalt, t.lfWarm) +
    st('\u2212 One-offs', n(t.einmalig), n(t.einmalig)) +
    res('After one-offs', '', t.eiKalt, t.eiWarm) +
    st('\u00b1 Abrechnungen', D, (t.abr > 0 ? '+ ' : t.abr < 0 ? '\u2212 ' : '') + n(Math.abs(t.abr))) +
    res('Cashflow', 'after everything', t.freiKalt, t.freiWarm, true) +
  '</div>' + (note ? '<div class="cxd-tnote">' + note + '</div>' : '');
}

/* The property rows bring their own styles, so they look right even if an
   older controlling-ui.js is still cached */
function _cxdCss() {
  if (document.getElementById('cxd-css')) return;
  const st = document.createElement('style');
  st.id = 'cxd-css';
  st.textContent = `
    .cxd-prow { display:flex; align-items:center; gap:10px; width:100%; padding:10px 0; margin:0; border:none; border-top:.5px solid #EDE8E0; border-radius:0; background:none; -webkit-appearance:none; appearance:none; font-family:'Inter',system-ui,sans-serif; text-align:left; cursor:pointer; color:#3D3027; }
    .cxd-prow:first-child { border-top:none; }
    .cxd-prow__l { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .cxd-prow__n { font-size:14px; font-weight:500; line-height:1.25; }
    .cxd-prow__s { font-size:11.5px; color:#9A8E7E; }
    .cxd-prow__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:500; white-space:nowrap; }
    .cxd-prow__v.pos { color:#3B6D11; }
    .cxd-prow__v.neg { color:#A0533A; }
    .cxd-prow__c { color:#C8BFB0; font-size:14px; }
    .cxd-pdet { padding:0 0 8px; border-bottom:.5px solid #EDE8E0; }
    .cxd-kw { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0 2px; text-align:center; }
    .cxd-kw__t { background:#FDFCFA; border:.5px solid #E0DAD0; border-radius:12px; padding:9px 6px; display:flex; flex-direction:column; gap:1px; }
    .cxd-kw__l { font-size:10px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:#9A8E7E; }
    .cxd-kw__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:24px; font-weight:500; color:#3D3027; line-height:1.15; }
    .cxd-kw__s { font-size:11px; color:#9A8E7E; }
    .cxd-kwbar { display:flex; height:30px; border-radius:8px; overflow:hidden; margin:10px 0 0; background:#EDE8E0; }
    .cxd-kwbar span { display:flex; align-items:center; justify-content:center; font-family:'Inter',system-ui,sans-serif; font-size:11px; font-weight:500; white-space:nowrap; overflow:hidden; min-width:0; }
    .cxd-kwbar__k { background:#B8956A; color:#fff; }
    .cxd-kwbar__n { background:#E3D5BF; color:#6B5E4E; min-width:72px; }
    .cxd-kwbar__k { min-width:72px; }
    .cxd-tr { grid-template-columns:1fr 90px 90px !important; }
    .cxd-res > span:not(:first-child) { font-size:19px !important; white-space:nowrap; }
    .cxd-st > span:not(:first-child) { white-space:nowrap; }
    .cxd-kwleg { display:flex; justify-content:space-between; gap:8px; margin-top:6px; font-size:11.5px; color:#6B5E4E; text-align:left; }
    .cxd-kwleg i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
    .cxd-kwleg i.k { background:#B8956A; } .cxd-kwleg i.n { background:#E3D5BF; }
    .cxd-th small { display:block; font-size:9px; letter-spacing:.02em; text-transform:none; font-weight:400; color:#B4A890; }`;
  document.head.appendChild(st);
}

window.renderDashboard = function () {
  const host = document.getElementById('tab-dashboard');
  if (!host) return;
  CX.tab = 'dashboard';
  _cxdCss();
  const isYear = CX.dashView === 'y';
  const y = window._ctrl.year, m = CX.month;
  const months = isYear ? _cxYearMonths(y) : (_cxIsFuture(y, m) ? [] : [m]);
  const future = !months.length;
  const shortM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const EN_M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
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

  const periodTitle = isYear ? String(y) : EN_M[m - 1] + ' ' + y;
  const periodWord  = isYear ? (months.length && months.length < 12 ? 'Jan – ' + shortM[months.length - 1] + ' ' + y : String(y)) : EN_M[m - 1];

  // ── Top: switch + period
  const top = '<div class="cxd-top">' +
    '<div class="cxd-per">' +
      '<button class="cx-arw" data-cx="' + (isYear ? 'yprev' : 'prev') + '" aria-label="Previous"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="cxd-per__t">' + cxEsc(periodTitle) + '</span>' +
      '<button class="cx-arw" data-cx="' + (isYear ? 'ynext' : 'next') + '" aria-label="Next"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>' +
    '</div>' +
    '<div class="cx-seg cx-seg--view" role="group" aria-label="Period">' +
      '<button class="' + (isYear ? '' : 'on') + '" data-cx="view" data-v="m" aria-pressed="' + !isYear + '">Month</button>' +
      '<button class="' + (isYear ? 'on' : '') + '" data-cx="view" data-v="y" aria-pressed="' + isYear + '">Year</button>' +
    '</div></div>';

  // ── Big number · Kaltmiete | Warmmiete · one bar: Kaltmiete + Nebenkosten
  const tilgKnown = t.tilg > 0 ? '<div class="cxd-hero__t">+ ' + cxW(t.tilg) + ' saved through Tilgung</div>' : '';
  const nkPart = cxR(Math.max(0, t.warm - t.kalt));
  const kwBar = t.warm > 0
    ? '<div class="cxd-kwbar">' +
        (t.kalt > 0 ? '<span class="cxd-kwbar__k" style="flex:' + Math.round(t.kalt) + '">' + cxW(t.kalt) + '</span>' : '') +
        (nkPart > 0 ? '<span class="cxd-kwbar__n" style="flex:' + Math.round(nkPart) + '">' + cxW(nkPart) + '</span>' : '') +
      '</div>'
    : '';
  const hero = '<div class="cxd-hero">' +
    '<div class="cxd-hero__l">Cashflow · ' + cxEsc(periodWord) + (open ? ' · preliminary' : '') + '</div>' +
    '<div class="cxd-hero__v' + (!future && t.freiWarm < 0 ? ' neg' : '') + '">' + (future ? D : cxWS(t.freiWarm)) + '</div>' +
    (future ? '<div class="cxd-hero__s">This ' + (isYear ? 'year' : 'month') + ' is still ahead</div>'
            : '<div class="cxd-kw">' +
                '<div class="cxd-kw__t"><span class="cxd-kw__l">Kaltmiete</span><span class="cxd-kw__v">' + cxW(t.kalt) + '</span><span class="cxd-kw__s">rent without Nebenkosten</span></div>' +
                '<div class="cxd-kw__t"><span class="cxd-kw__l">Warmmiete</span><span class="cxd-kw__v">' + cxW(t.warm) + '</span><span class="cxd-kw__s">rent incl. Nebenkosten</span></div>' +
              '</div>' + kwBar + tilgKnown) +
    (open ? '<button class="cxd-open" data-cx="gotoOpen"><i class="ti ti-point-filled" aria-hidden="true"></i> ' + open + (open === 1 ? ' item' : ' items') + ' still open · <u>enter</u></button>' : '') +
  '</div>';

  // ── Calculation (tap to open)
  let barCard = '';
  if (!future) {
    const hint = t.noSplit ? '<button class="cxd-hint" style="margin:0 0 4px" data-cx="toProps">' + t.noSplit + (t.noSplit === 1 ? ' loan' : ' loans') +
      ' without Zinsen/Tilgung · add in Properties ›</button>' : '';
    const calcOpen = !!CX.open['dash:calc'];
    barCard = '<div class="cx-card" style="padding:10px 14px">' + hint +
      '<button class="cxd-calcbtn" style="margin-top:0;padding-top:0;border-top:none" data-cx="fold" data-k="dash:calc" aria-expanded="' + calcOpen + '"><span>Show calculation' +
        '<small>kalt & warm · costs, Kreditraten, one-offs & Abrechnungen</small></span><i class="ti ti-chevron-' + (calcOpen ? 'up' : 'down') + '" aria-hidden="true"></i></button>' +
      (calcOpen ? _cxDashCalc(t, 'Kalt = only the Kaltmiete, Nebenkosten and house costs left out. Warm = everything that came in and went out, incl. Nebenkosten. Only booked amounts count.') : '') +
    '</div>';
  }

  // ── Per property: one bar each, tap → its calculation
  let propCard = '';
  if (!future) {
    // One plain row per property: name · what came in · what went out → cashflow (no bars)
    // your purchase order (Setup sort order if set, else the id) — the same everywhere, never by amount
    const pos = p => (p.sort_order !== null && p.sort_order !== undefined && Number.isFinite(Number(p.sort_order))) ? Number(p.sort_order) : 999;
    const order = per.slice().sort((a, b) => pos(a.p) - pos(b.p) || a.p.id - b.p.id);
    const rows = order.map(({ p, r }) => {
      const k = 'dash:p:' + p.id, isOpen = !!CX.open[k], neg = r.freiWarm < 0;
      const out = cxR(r.warm - r.freiWarm);                     // everything that went out (net)
      return '<button class="cxd-prow" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
          '<span class="cxd-prow__l"><span class="cxd-prow__n">' + cxEsc(p.name) + '</span>' +
            '<span class="cxd-prow__s">in ' + cxW(r.warm) + ' · out ' + cxW(out) + '</span></span>' +
          '<span class="cxd-prow__v' + (neg ? ' neg' : ' pos') + '">' + cxWS(r.freiWarm) + '</span>' +
          '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cxd-prow__c" aria-hidden="true"></i></button>' +
        (isOpen ? '<div class="cxd-pdet">' + _cxDashCalc(r, r.loan && !r.split ? 'Loan without Zinsen/Tilgung in Properties.' : '') + '</div>' : '');
    }).join('');
    propCard = '<div class="cx-card" style="padding:12px 14px 4px">' +
      '<div class="cx-row-sb"><span class="cx-lbl">Cashflow per property</span><span class="cx-lbl">' + cxEsc(isYear ? String(y) : EN_M[m - 1]) + '</span></div>' +
      '<div style="margin-top:2px">' + rows + '</div></div>';
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
