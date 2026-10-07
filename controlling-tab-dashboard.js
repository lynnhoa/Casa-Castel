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
   Oct 2026: Cashflow number — Month = running cashflow (Warmmiete − running
   costs; one-offs & Abrechnungen only shown for info, chips faded) · Year =
   after one-offs & Abrechnungen. Tap the number → calculation sheet
   (Rentals · Casa Castel · Total); it replaces the "Show calculation" card.
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

/* How many one-off bills / refunds and Abrechnungen results fall in the period (dashboard tiles) */
function _cxDashCounts(props, months) {
  const y = window._ctrl.year, ids = new Set(props.map(p => p.id)), ms = new Set(months);
  const c = { bills: 0, refunds: 0, weg: 0, nk: 0 };
  for (const o of (window._ctrl.one_time || [])) {
    if (!ids.has(Number(o.property_id))) continue;
    const d = ctlParseDate(o.invoice_date);
    if (d.year !== y || !ms.has(d.month)) continue;
    if (o.kind === 'Kaufnebenkosten') continue;                   // part of the purchase, not the cashflow
    if (CX_ABR_KINDS.includes(o.kind)) { if (o.kind === 'NK-Abrechnung') c.nk++; else c.weg++; }
    else if (Number(o.direction) === 1) c.refunds++;
    else c.bills++;
  }
  return c;
}

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
      if (Number(o.property_id) !== p.id || o.kind === 'Kaufnebenkosten') continue;   // Kaufnebenkosten: not in the cashflow
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
function _cxDashCalc(t, note, month) {
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
    (month
      // Month: one-offs & Abrechnungen only for info — the month's cashflow is the running one
      ? '<div class="cxd-tr cxd-st cxd-info"><span>\u2212 One-offs<em>Info \u00b7 not counted</em></span><span>' + n(t.einmalig) + '</span><span>' + n(t.einmalig) + '</span></div>' +
        '<div class="cxd-tr cxd-st cxd-info"><span>\u00b1 Abrechnungen<em>Info \u00b7 not counted</em></span><span>' + D + '</span><span>' + cxWS(t.abr) + '</span></div>' +
        res('Cashflow', 'this month = running cashflow', t.lfKalt, t.lfWarm, true)
      : st('\u2212 One-offs', n(t.einmalig), n(t.einmalig)) +
        res('After one-offs', '', t.eiKalt, t.eiWarm) +
        st('\u00b1 Abrechnungen', D, (t.abr > 0 ? '+ ' : t.abr < 0 ? '\u2212 ' : '') + n(Math.abs(t.abr))) +
        res('Cashflow', 'after everything', t.freiKalt, t.freiWarm, true)) +
  '</div>' + (note ? '<div class="cxd-tnote">' + note + '</div>' : '');
}

/* ── Calculation sheet (tap on the Cashflow number) ─────────────
   Full-screen drawer: Rentals · Casa Castel · Total. Month: one-offs and
   Abrechnungen only for info (the cashflow is the running one); Year:
   both counted. Same layout for both, only values change. */
function _cxCalcClose() {
  const el = document.getElementById('cxd-calc');
  if (!el || !el.classList.contains('open')) return;
  el.classList.remove('open');
  document.body.style.overflow = '';
  const b = document.querySelector('[data-cx="calc"]');
  if (b) b.focus();
}
function _cxCalcSheet(o) {
  if (!o) return;
  let el = document.getElementById('cxd-calc');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cxd-calc';
    el.className = 'ct-drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'cxd-calc-t');
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cxs]');
      if (!b) return;
      if (b.dataset.cxs === 'close') return _cxCalcClose();
      if (b.dataset.cxs === 'toProps') { location.href = 'properties.html'; }
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') _cxCalcClose(); });
    document.body.appendChild(el);
  }
  const month = !o.isYear, cols = [o.ren, o.casa, o.tot];
  const sgn = v => (v < -0.004 ? ' neg' : v > 0.004 ? ' pos' : '');
  const lab = (l, sub, info) => '<span class="cxs-l"><span>' + l + '</span>' +
    (sub ? '<small>' + cxEsc(sub) + '</small>' : '') + (info ? '<em>Info \u00b7 not counted</em>' : '') + '</span>';
  const plain = (l, sub, k) => '<div class="cxs-tr">' + lab(l, sub) +
    cols.map(c => '<span class="cxs-v">' + cxW(c[k]) + '</span>').join('') + '</div>';
  const cost = (l, sub, f, info) => '<div class="cxs-tr' + (info ? ' cxs-info' : '') + '">' + lab(l, sub, info) +
    cols.map(c => { const v = f(c); return '<span class="cxs-v' + (info ? '' : sgn(v)) + '">' + cxWS(v) + '</span>'; }).join('') + '</div>';
  const res = (l, sub, k, fin, fmt) => '<div class="cxs-tr cxs-res' + (fin ? ' cxs-fin' : '') + '">' + lab(l, sub) +
    cols.map(c => '<span class="cxs-v' + (c[k] < -0.004 ? ' neg' : '') + '">' + (fmt || cxWS)(c[k]) + '</span>').join('') + '</div>';
  const t = o.tot, cnt = o.cnt;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const rateSub = t.rate ? ['Zinsen ' + cxW(t.zins), 'Tilgung ' + cxW(t.tilg), t.unknown ? cxW(t.unknown) + ' not split' : ''].filter(Boolean).join(' \u00b7 ') : '';
  const oneSub = [cnt.bills ? plural(cnt.bills, 'bill', 'bills') : '', cnt.refunds ? plural(cnt.refunds, 'refund', 'refunds') : ''].filter(Boolean).join(' \u00b7 ');
  const abrN = cnt.weg + cnt.nk;
  const abrSub = abrN ? [cnt.weg ? cnt.weg + ' WEG' : '', cnt.nk ? cnt.nk + ' NK' : ''].filter(Boolean).join(' \u00b7 ') + (abrN === 1 ? ' result' : ' results') : '';
  const th = '<div class="cxs-tr cxs-th"><span>How it adds up</span><span>Rentals</span><span>Casa<br>Castel</span><span class="cxs-tot">Total</span></div>';
  const hint = t.noSplit ? '<button class="cxd-hint" data-cxs="toProps">' + t.noSplit + (t.noSplit === 1 ? ' loan' : ' loans') +
    ' without Zinsen/Tilgung \u00b7 add in Properties \u203a</button>' : '';
  const note = month
    ? 'One-offs and Abrechnungen are shown for info only \u2014 they count in the Year view. Only booked amounts count; Kaution and Kaufnebenkosten stay out.'
    : 'Only booked amounts count; Kaution and Kaufnebenkosten stay out. Abrechnungen count in the month they were paid or received.';
  el.innerHTML =
    '<div class="ct-drawer__hdr"><span class="ct-drawer__ttl" id="cxd-calc-t">' + cxEsc(o.title) + '</span>' +
      '<button class="ct-drawer__close" data-cxs="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
    '<div class="ct-drawer__body"><div class="cxs-wrap">' +
      '<div class="cxs-hero"><div class="cxd-hero__l">' + cxEsc(o.label) + '</div>' +
        '<div class="cxs-hero__v' + (o.hero < 0 ? ' neg' : '') + '">' + cxWS(o.hero) + '</div></div>' +
      '<div class="cx-card cxs-card">' + th +
        plain('Kaltmiete', '', 'kalt') +
        plain('+ Nebenkosten', 'paid by tenants', 'nk') +
        res('Warmmiete', '', 'warm', false, cxW) +
        cost('\u2212 Hausgeld / house costs', '', c => -c.kosten) +
        cost('\u2212 Kreditraten', rateSub, c => -c.rate) +
        res('Running cashflow', 'Warmmiete \u2212 running costs', 'lfWarm') +
        cost('\u2212 One-offs', oneSub, c => -c.einmalig, month) +
        cost('\u00b1 Abrechnungen', abrSub, c => c.abr, month) +
        (month ? res('= Cashflow', 'this month = running cashflow', 'lfWarm', true)
               : res('= Cashflow', 'after one-offs & Abrechnungen', 'freiWarm', true)) +
      '</div>' + hint +
      '<div class="cxd-tnote">' + note + '</div>' +
    '</div></div>';
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  const x = el.querySelector('.ct-drawer__close');
  if (x) x.focus();

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
    .cxd-kw { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:10px 0 2px; text-align:center; }
    .cxd-kw__t { background:#FDFCFA; border:.5px solid #E0DAD0; border-radius:12px; padding:7px 6px; display:flex; flex-direction:column; gap:0; }
    .cxd-kw__l { font-size:9.5px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:#9A8E7E; }
    .cxd-kw__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:21px; font-weight:500; color:#3D3027; line-height:1.15; }
    .cxd-kw__s { font-size:10.5px; color:#9A8E7E; }
    .cxd-kwbar { display:flex; height:22px; border-radius:7px; overflow:hidden; margin:8px 0 0; background:#EDE8E0; }
    .cxd-kwbar span { display:flex; align-items:center; justify-content:center; font-family:'Inter',system-ui,sans-serif; font-size:10.5px; font-weight:500; white-space:nowrap; overflow:hidden; min-width:0; }
    .cxd-kwbar__k { background:#B8956A; color:#fff; }
    .cxd-kwbar__n { background:#E3D5BF; color:#6B5E4E; min-width:64px; }
    .cxd-kwbar__k { min-width:64px; }
    /* costs: running · one-offs · Abrechnungen — with the Warmmiete they add up to the cashflow */
    .cxd-cost { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:12px 0 2px; text-align:center; }
    .cxd-ct { background:#FDFCFA; border:.5px solid #E0DAD0; border-radius:12px; padding:7px 4px; display:flex; flex-direction:column; gap:0; min-width:0; }
    .cxd-ct .cxd-kw__l { font-size:9px; letter-spacing:.08em; }
    .cxd-ct__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:19px; font-weight:500; line-height:1.2; color:#3D3027; white-space:nowrap; }
    .cxd-ct__v.neg { color:#A0533A; } .cxd-ct__v.pos { color:#3B6D11; } .cxd-ct__v.mut { color:#C8BFB0; }
    .cxd-ct__s { font-size:10px; line-height:1.3; color:#9A8E7E; }
    .cxd-tr { grid-template-columns:1fr 90px 90px !important; }
    .cxd-res > span:not(:first-child) { font-size:19px !important; white-space:nowrap; }
    .cxd-st > span:not(:first-child) { white-space:nowrap; }
    .cxd-kwleg { display:flex; justify-content:space-between; gap:8px; margin-top:6px; font-size:11.5px; color:#6B5E4E; text-align:left; }
    .cxd-kwleg i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
    .cxd-kwleg i.k { background:#B8956A; } .cxd-kwleg i.n { background:#E3D5BF; }
    .cxd-th small { display:block; font-size:9px; letter-spacing:.02em; text-transform:none; font-weight:400; color:#B4A890; }
    /* hero: tap the Cashflow number → calculation sheet */
    .cxd-hero__btn { display:flex; flex-direction:column; align-items:center; width:100%; margin:0; padding:0; border:none; background:none; -webkit-appearance:none; appearance:none; font-family:'Inter',system-ui,sans-serif; color:#3D3027; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cxd-hero__btn > span { display:block; }
    .cxd-hero__how { font-size:11.5px; color:#9A8E7E; text-decoration:underline; text-underline-offset:2px; margin-top:2px; }
    .cxd-hero__how i { font-size:12px; vertical-align:-1px; }
    /* Month: one-offs & Abrechnungen only for info */
    .cxd-ct--info { background:transparent; border:.5px dashed #D4CBBC; }
    .cxd-ct--info .cxd-kw__l { color:#B4A890; }
    .cxd-ct--info .cxd-ct__v, .cxd-ct--info .cxd-ct__v.neg, .cxd-ct--info .cxd-ct__v.pos { color:#9A8E7E; font-weight:400; }
    .cxd-info > span:first-child em, .cxs-l em { display:inline-block; font-style:normal; font-size:8.5px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; color:#9A8E7E; background:#EFE9E0; border:.5px solid #E0DAD0; border-radius:20px; padding:1px 7px; }
    .cxd-info > span:first-child em { margin-left:6px; vertical-align:1px; }
    .cxd-info > span:not(:first-child) { color:#B4A890; }
    /* calculation sheet */
    #cxd-calc .ct-drawer__close { color:#3A3530; }
    #cxd-calc .ct-drawer__close i { font-size:16px; }
    .cxs-wrap { max-width:560px; margin:0 auto; display:flex; flex-direction:column; gap:10px; font-family:'Inter',system-ui,sans-serif; color:#3D3027; }
    .cxs-hero { text-align:center; padding:2px 0 4px; }
    .cxs-hero__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:40px; font-weight:500; line-height:1.05; color:#3D3027; }
    .cxs-hero__v.neg { color:#A0533A; }
    .cxs-card { padding:10px 12px 0; }
    .cxs-tr { display:grid; grid-template-columns:minmax(0,1fr) minmax(62px,88px) minmax(62px,88px) minmax(70px,96px); align-items:center; column-gap:6px; padding:6px 0; border-top:.5px solid #EDE8E0; }
    .cxs-th { align-items:end; border-top:none; padding:0 0 6px; }
    .cxs-th > span { font-size:8.5px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; color:#9A8E7E; text-align:right; line-height:1.25; }
    .cxs-th > span:first-child { font-size:9px; letter-spacing:.14em; text-align:left; }
    .cxs-th > span.cxs-tot { color:#3D3027; }
    .cxs-l { display:flex; flex-direction:column; align-items:flex-start; gap:1px; min-width:0; font-size:12.5px; }
    .cxs-l small { font-size:10.5px; color:#9A8E7E; }
    .cxs-l em { margin-top:2px; }
    .cxs-v { font-size:12px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; color:#3D3027; }
    .cxs-v.neg { color:#A0533A; } .cxs-v.pos { color:#3B6D11; }
    .cxs-info { border-top-style:dashed; border-top-color:#E0DAD0; }
    .cxs-info .cxs-l > span, .cxs-info .cxs-v { color:#9A8E7E; }
    .cxs-res { padding:9px 0; border-top-color:#E0DAD0; }
    .cxs-res .cxs-l > span { font-size:13px; font-weight:500; }
    .cxs-res .cxs-v { font-family:'Cormorant Garamond',Georgia,serif; font-size:17px; font-weight:500; }
    .cxs-fin { background:#F6FAF1; margin:2px -12px 0; padding:11px 12px; border-top:1px solid #97C459; }
    .cxs-fin .cxs-l > span { font-size:13.5px; color:#27500A; }
    .cxs-fin .cxs-l small { color:#6B5E4E; }
    .cxs-fin .cxs-v { font-size:18px; }`;
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
  // ── Costs: running · one-offs · Abrechnungen (Warmmiete − these = the cashflow)
  const cnt = _cxDashCounts(props, months), running = cxR(t.kosten + t.rate), abrN = cnt.weg + cnt.nk, oneN = cnt.bills + cnt.refunds;
  const heroVal = isYear ? t.freiWarm : t.lfWarm;           // Month: running cashflow · Year: after one-offs & Abrechnungen
  const info = isYear ? '' : ' \u00b7 info only';             // Month: one-offs & Abrechnungen are not counted
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const tile = (lbl, val, cls, sub, muted) => '<div class="cxd-ct' + (muted ? ' cxd-ct--info' : '') + '"><span class="cxd-kw__l">' + lbl + '</span>' +
    '<span class="cxd-ct__v ' + cls + '">' + val + '</span><span class="cxd-ct__s">' + cxEsc(sub) + '</span></div>';
  const costTiles = '<div class="cxd-cost">' +
    tile('Running costs', running ? cxWS(-running) : D, running > 0 ? 'neg' : running < 0 ? 'pos' : 'mut',
         t.tilg > 0 ? 'incl. ' + cxW(t.tilg) + ' Tilgung' : 'loans, Hausgeld, house costs') +
    tile('One-offs', oneN || t.einmalig ? cxWS(-t.einmalig) : D, t.einmalig > 0 ? 'neg' : t.einmalig < 0 ? 'pos' : 'mut',
         (oneN ? [cnt.bills ? plural(cnt.bills, 'bill', 'bills') : '', cnt.refunds ? plural(cnt.refunds, 'refund', 'refunds') : ''].filter(Boolean).join(' · ') : 'none') + info, !isYear) +
    tile('Abrechnungen', abrN || t.abr ? cxWS(t.abr) : D, t.abr > 0 ? 'pos' : t.abr < 0 ? 'neg' : 'mut',
         (abrN ? [cnt.weg ? cnt.weg + ' WEG' : '', cnt.nk ? cnt.nk + ' NK' : ''].filter(Boolean).join(' · ') + (abrN === 1 ? ' result' : ' results') : 'none') + info, !isYear) +
  '</div>';
  const nkPart = cxR(Math.max(0, t.warm - t.kalt));
  const kwBar = t.warm > 0
    ? '<div class="cxd-kwbar">' +
        (t.kalt > 0 ? '<span class="cxd-kwbar__k" style="flex:' + Math.round(t.kalt) + '">' + cxW(t.kalt) + '</span>' : '') +
        (nkPart > 0 ? '<span class="cxd-kwbar__n" style="flex:' + Math.round(nkPart) + '">' + cxW(nkPart) + '</span>' : '') +
      '</div>'
    : '';
  const heroLbl = 'Cashflow · ' + periodWord + (open ? ' · preliminary' : '');
  const hint = !future && t.noSplit ? '<button class="cxd-hint" data-cx="toProps">' + t.noSplit + (t.noSplit === 1 ? ' loan' : ' loans') +
    ' without Zinsen/Tilgung · add in Properties ›</button>' : '';
  const hero = '<div class="cxd-hero">' +
    (future
      ? '<div class="cxd-hero__l">' + cxEsc(heroLbl) + '</div><div class="cxd-hero__v">' + D + '</div>'
      : '<button class="cxd-hero__btn" data-cx="calc" aria-haspopup="dialog">' +
          '<span class="cxd-hero__l">' + cxEsc(heroLbl) + '</span>' +
          '<span class="cxd-hero__v' + (heroVal < 0 ? ' neg' : '') + '">' + cxWS(heroVal) + '</span>' +
          '<span class="cxd-hero__how">How it\u2019s calculated <i class="ti ti-chevron-right" aria-hidden="true"></i></span></button>') +
    (future ? '<div class="cxd-hero__s">This ' + (isYear ? 'year' : 'month') + ' is still ahead</div>'
            : '<div class="cxd-kw">' +
                '<div class="cxd-kw__t"><span class="cxd-kw__l">Kaltmiete</span><span class="cxd-kw__v">' + cxW(t.kalt) + '</span><span class="cxd-kw__s">rent without Nebenkosten</span></div>' +
                '<div class="cxd-kw__t"><span class="cxd-kw__l">Warmmiete</span><span class="cxd-kw__v">' + cxW(t.warm) + '</span><span class="cxd-kw__s">rent incl. Nebenkosten</span></div>' +
              '</div>' + kwBar + costTiles + hint) +
    (open ? '<button class="cxd-open" data-cx="gotoOpen"><i class="ti ti-point-filled" aria-hidden="true"></i> ' + open + (open === 1 ? ' item' : ' items') + ' still open · <u>enter</u></button>' : '') +
  '</div>';

  // ── Calculation sheet data (opened by tapping the Cashflow number)
  const isCasa = x => x.p.id === CASA_PROP_ID;
  _cxDash.calc = future ? null : {
    isYear, title: 'Cashflow · ' + (isYear ? periodWord : periodTitle), label: heroLbl, hero: heroVal, cnt,
    ren: _cxDashSum(per.filter(x => !isCasa(x)).map(x => x.r)), casa: _cxDashSum(per.filter(isCasa).map(x => x.r)), tot: t,
  };

  // ── Per property: one bar each, tap → its calculation
  let propCard = '';
  if (!future) {
    // One plain row per property: name · what came in · what went out → cashflow (no bars)
    // your purchase order (Setup sort order if set, else the id) — the same everywhere, never by amount
    const pos = p => (p.sort_order !== null && p.sort_order !== undefined && Number.isFinite(Number(p.sort_order))) ? Number(p.sort_order) : 999;
    const order = per.slice().sort((a, b) => pos(a.p) - pos(b.p) || a.p.id - b.p.id);
    const rows = order.map(({ p, r }) => {
      const val = isYear ? r.freiWarm : r.lfWarm;               // Month: running · Year: after everything
      const k = 'dash:p:' + p.id, isOpen = !!CX.open[k], neg = val < 0;
      const out = cxR(r.warm - val);                            // everything that went out (net)
      return '<button class="cxd-prow" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
          '<span class="cxd-prow__l"><span class="cxd-prow__n">' + cxEsc(p.name) + '</span>' +
            '<span class="cxd-prow__s">in ' + cxW(r.warm) + ' · out ' + cxW(out) + '</span></span>' +
          '<span class="cxd-prow__v' + (neg ? ' neg' : ' pos') + '">' + cxWS(val) + '</span>' +
          '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cxd-prow__c" aria-hidden="true"></i></button>' +
        (isOpen ? '<div class="cxd-pdet">' + _cxDashCalc(r, r.loan && !r.split ? 'Loan without Zinsen/Tilgung in Properties.' : '', !isYear) + '</div>' : '');
    }).join('');
    propCard = '<div class="cx-card" style="padding:12px 14px 4px">' +
      '<div class="cx-row-sb"><span class="cx-lbl">Cashflow per property</span><span class="cx-lbl">' + cxEsc(isYear ? String(y) : EN_M[m - 1]) + '</span></div>' +
      '<div style="margin-top:2px">' + rows + '</div></div>';
  }

  host.innerHTML = '<div class="cx-page">' + top + hero + propCard + '</div>';

  cxWire(host, {
    render: () => window.renderDashboard(),
    click: async (a, b) => {
      if (a === 'view') { CX.dashView = b.dataset.v; return window.renderDashboard(); }
      if (a === 'calc') return _cxCalcSheet(_cxDash.calc);
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
