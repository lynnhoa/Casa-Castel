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
   Oct 2026 (DB1): a later month counts as soon as something is booked for it
   (Rentals or Casa Castel: income, expenses, one-off, Abrechnung) — Month shows
   it ("preliminary"), Jahr runs on to the last month with a booking. Nothing in a
   later month counts as open (not due yet). Without a booking: "still ahead".
   Oct 2026: Cashflow number — Month = running cashflow (Warmmiete − running
   costs; one-offs & Abrechnungen only shown for info, chips faded) · Year =
   after one-offs & Abrechnungen. Tap the number → calculation sheet
   (Rentals · Casa Castel · Total); it replaces the "Show calculation" card.
   Entering happens only in Einnahmen, Ausgaben and Einmalig.
   Oct 2026 (R1): "Export <Jahr>" at the end of the page → year export pop-up
   (Excel like the original controlling sheet · PDF) — controlling-report.js.
   ───────────────────────────────────────────────────────────── */

'use strict';

let _cxDash = { openInc: 0, openMonth: 0 };           // for the jump targets
if (!CX.dashView) CX.dashView = 'm';                    // default: Monat
if (CX.dashMode !== 'konto' && CX.dashMode !== 'tats') CX.dashMode = 'konto';   // Konto | Tatsächlich (D18)

/* Konto / Tatsächlich of several properties over several months (change round 3) */

function _cxIsFuture(y, m) {
  const t = cxToday(), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7));
  return y > ty || (y === ty && m > tm);
}
/* DB1 · anything booked for this month — Rentals or Casa Castel (a cleared amount is no booking) */
const _CX_APT_KEYS = ['hausgeld', 'grundsteuer', 'strom', 'rate', 'zinsen', 'tilgung'];
function _cxBooked(y, m) {
  const C = window._ctrl, has = v => v !== null && v !== undefined && v !== '';
  if ((C.income || []).some(r => r.year === y && r.month === m)) return true;
  if ((C.castel_expenses || []).some(e => e.year === y && e.month === m)) return true;
  if ((C.apt_expenses || []).some(e => e.year === y && e.month === m && _CX_APT_KEYS.some(k => has(e[k])))) return true;
  return (C.one_time || []).some(o => {
    if (o.kind === 'Kaufnebenkosten') return false;          // never in the cashflow
    const d = ctlParseDate(o.invoice_date);
    return d.year === y && d.month === m;
  });
}
function _cxLastBooked(y) { for (let m = 12; m >= 1; m--) if (_cxBooked(y, m)) return m; return 0; }
function _cxYearMonths(y) {                             // 1 … current month (all 12 for past years) — and on to the last month with a booking
  const t = cxToday(), ty = Number(t.slice(0, 4)), tm = Number(t.slice(5, 7));
  const last = y < ty ? 12 : Math.max(y > ty ? 0 : tm, _cxLastBooked(y));
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

/* One property over some months (all Ist values; loans from Properties) */
function _cxDashProp(p, months) {
  const y = window._ctrl.year, casa = p.id === CASA_PROP_ID;
  const rateCat = (window._ctrl.categories || []).find(c => c.code === 'RATE');
  const r = { kalt: 0, nk: 0, kosten: 0, einmalig: 0, abr: 0, rate: 0, zins: 0, tilg: 0, unknown: 0, split: true, loan: null };
  months = months.filter(m => ctlPropOwned(p, y, m));          // only from the purchase month on
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
      if (CX_ABR_KINDS.includes(o.kind) || ctlIsCasaJa(o)) r.abr += signed;   // Hausgeld / NK results · Fix 3: Casa Jahresabrechnungen
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

/* ── Calculation sheet (tap on the Cashflow number) ─────────────
   Full-screen drawer: Rentals · Casa Castel · Total. Month: one-offs and
   Abrechnungen only for info (the cashflow is the running one); Year:
   both counted. Same layout for both, only values change. */

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
    .cxs-fin .cxs-v { font-size:18px; }
    /* ── Dashboard (Oct 2026): Total · Rentals · Casa Castel, Kalt | Warm ───────── */
    .cxn { font-family:'Inter',system-ui,sans-serif; color:#3A3530; }
    .cxn .cxn-f { font-family:'Cormorant Garamond',Georgia,serif; font-weight:600; font-variant-numeric:lining-nums tabular-nums; letter-spacing:-.01em; }
    .cxn .pos { color:#4F7A2C; } .cxn .neg { color:#A0533A; }
    .cxn-chipw { text-align:center; margin-top:12px; }
    .cxn-chip { display:inline-flex; align-items:center; gap:6px; font:400 12px 'Inter',system-ui,sans-serif; color:#8C5A30; background:#FAEEDA; border:.5px solid #EFC98B; border-radius:14px; padding:5px 11px; cursor:pointer; }
    .cxn-chip u { text-underline-offset:2px; }
    .cxn-dot { width:5px; height:5px; margin:0 2px; border-radius:50%; background:currentColor; flex-shrink:0; }   /* the icon set's filled dot isn't loaded */
    .cxn-card { background:#FDFCFA; border:.5px solid #E0DAD0; border-radius:18px; padding:16px; margin-top:12px; }
    .cxn-empty { text-align:center; color:#9A8E7E; font-size:13px; padding:28px 16px; }
    .cxn-hrow { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
    .cxn-lbl { font-size:10.5px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:#8A6535; }
    .cxn-mut { font-size:11px; color:#9A8E7E; }
    .cxn-kpis { display:grid; grid-template-columns:1fr 1fr; margin-top:12px; }
    .cxn-kpi { text-align:center; padding:2px 6px; min-width:0; } .cxn-kpi + .cxn-kpi { border-left:.5px solid #EDE8E0; }
    .cxn-k { display:block; font-size:10px; font-weight:600; letter-spacing:.16em; color:#9A8E7E; }
    .cxn-v { font-size:clamp(26px, 8.4vw, 34px); line-height:1.05; margin-top:3px; white-space:nowrap; }
    .cxn-d { font-size:11px; margin-top:4px; color:#9A8E7E; min-height:14px; }
    .cxn-wf { margin-top:16px; padding-top:14px; border-top:.5px solid #EDE8E0; }
    .cxn-wr { display:grid; grid-template-columns:66px 1fr 84px; align-items:center; gap:10px; font-size:12.5px; margin:7px 0; }
    .cxn-wn { color:#7A6F62; } .cxn-wn--b { font-weight:600; color:#3D3027; }
    .cxn-wa { text-align:right; font-weight:500; color:#3D3027; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cxn-bar { height:12px; border-radius:6px; background:#F3EEE6; position:relative; }
    .cxn-bar i { position:absolute; top:0; bottom:0; border-radius:6px; }
    .cxn-cap { font-size:10.5px; color:#9A8E7E; text-align:right; margin-top:2px; }
    .cxn-calc { display:flex; align-items:center; justify-content:center; gap:6px; width:100%; margin-top:14px; padding:11px 0 0; border:0; border-top:.5px solid #EDE8E0; background:none; font:500 12.5px 'Inter',system-ui,sans-serif; color:#8A6535; cursor:pointer; }
    .cxn-tbl { margin-top:10px; background:#F8F5F0; border-radius:12px; padding:8px 12px; }
    .cxn-tr { display:grid; grid-template-columns:1fr 84px 84px; align-items:baseline; padding:5px 0; font-size:13px; }
    .cxn-tr > span:nth-child(2), .cxn-tr > span:nth-child(3) { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cxn-th { font-size:9.5px; font-weight:600; letter-spacing:.14em; color:#9A8E7E; }
    .cxn-g1 { font-weight:600; color:#3D3027; } .cxn-g2 > span:first-child { padding-left:12px; color:#7A6F62; }
    .cxn-rs { border-top:.5px solid #E2DBD0; margin-top:4px; padding-top:8px; font-weight:600; color:#3D3027; }
    .cxn-rs > span:nth-child(2), .cxn-rs > span:nth-child(3) { font-family:'Cormorant Garamond',Georgia,serif; font-size:19px; }
    .cxn-inf { font-size:11px; color:#B0A596; }
    .cxn-two { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px; } .cxn-two.cxn-one { grid-template-columns:1fr; }
    .cxn-tile { display:flex; flex-direction:column; align-items:stretch; text-align:left; background:#FDFCFA; border:.5px solid #E0DAD0; border-radius:18px; padding:13px 13px 12px; margin:0; font-family:'Inter',system-ui,sans-serif; color:#3A3530; cursor:pointer; -webkit-appearance:none; appearance:none; transition:border-color .15s, box-shadow .15s; min-width:0; }
    .cxn-tile.on { border-color:#3D3027; box-shadow:0 0 0 1px #3D3027 inset; }
    .cxn-tn { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13.5px; color:#3D3027; }
    .cxn-ic { width:28px; height:28px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:15px; flex:0 0 auto; }
    .cxn-ic--r { background:#EEF2EC; color:#46604A; } .cxn-ic--c { background:#F6EEDD; color:#7A5A22; }
    .cxn-tv { display:flex; flex-direction:column; gap:2px; margin-top:10px; }
    .cxn-tvr { display:flex; align-items:baseline; justify-content:space-between; gap:6px; min-width:0; }
    .cxn-tvr .cxn-k { font-size:9.5px; }
    .cxn-v2 { font-size:clamp(17px, 5vw, 20px); line-height:1.2; white-space:nowrap; }
    .cxn-stay { display:block; margin-top:10px; height:5px; border-radius:3px; background:#EFE8DD; overflow:hidden; }
    .cxn-stay i { display:block; height:100%; }
    .cxn-st { display:flex; justify-content:space-between; gap:6px; font-size:10.5px; color:#9A8E7E; margin-top:5px; white-space:nowrap; }
    .cxn-hint2 { font-size:11px; color:#9A8E7E; text-align:center; margin-top:8px; }
    .cxn-pt { display:flex; align-items:center; gap:8px; }
    .cxn-ph { display:grid; grid-template-columns:1fr 70px 70px 14px; gap:4px; font-size:9.5px; font-weight:600; letter-spacing:.14em; color:#9A8E7E; padding:14px 0 6px; border-bottom:.5px solid #EDE8E0; }
    .cxn-ph span { text-align:right; } .cxn-ph span:first-child { text-align:left; color:#8A6535; }
    .cxn-pr { display:grid; grid-template-columns:1fr 70px 70px 14px; gap:4px; align-items:center; width:100%; padding:10px 0; margin:0; border:0; border-bottom:.5px solid #EDE8E0; background:none; text-align:left; font-family:'Inter',system-ui,sans-serif; cursor:pointer; -webkit-appearance:none; appearance:none; }
    .cxn-pl { display:flex; flex-direction:column; min-width:0; }
    .cxn-pn { font-size:13.5px; font-weight:500; color:#3D3027; } .cxn-ps { font-size:11px; color:#9A8E7E; margin-top:2px; }
    .cxn-pv { font-size:18px; text-align:right; white-space:nowrap; }
    .cxn-ch { color:#C8BFB0; font-size:12px; transition:transform .2s; } .cxn-pr.open .cxn-ch { transform:rotate(90deg); }
    .cxn-pd { padding:0 0 10px; border-bottom:.5px solid #EDE8E0; }
    .cxn-chart { display:flex; align-items:flex-start; gap:7px; margin-top:14px; }
    .cxn-col { flex:1; display:flex; flex-direction:column; align-items:stretch; padding:0; margin:0; border:0; background:none; cursor:pointer; -webkit-appearance:none; appearance:none; min-width:0; }
    .cxn-colp { display:flex; align-items:flex-end; border-bottom:1px solid #E0DAD0; }
    .cxn-stk { display:flex; flex-direction:column; width:100%; border-radius:4px 4px 1px 1px; overflow:hidden; }
    .cxn-stk i { display:block; width:100%; }
    .cxn-coln { display:block; background:#D98B74; border-radius:0 0 4px 4px; }
    .cxn-months { display:flex; gap:7px; font-size:10px; color:#9A8E7E; margin-top:6px; } .cxn-months span { flex:1; text-align:center; }
    .cxn-lg { display:flex; gap:14px; font-size:11px; color:#7A6F62; margin-top:10px; }
    .cxn-lg i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:5px; vertical-align:0; }`;
  document.head.appendChild(st);
}

window.renderDashboard = function () {
  const host = document.getElementById('tab-dashboard');
  if (!host) return;
  CX.tab = 'dashboard';
  _cxdCss();
  const isYear = CX.dashView === 'y';
  const y = window._ctrl.year, m = CX.month;
  const later = !isYear && _cxIsFuture(y, m);                     // DB1: a month after today …
  const months = isYear ? _cxYearMonths(y) : (later && !_cxBooked(y, m) ? [] : [m]);   // … shows once something is booked for it
  const future = !months.length;
  const shortM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const EN_M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  // a property appears from its purchase month (Month) / purchase year (Year) — Properties › Purchase date
  const props = window._ctrl.properties.filter(p => p.active && (isYear ? ctlPropOwnedYear(p, y) : ctlPropOwned(p, y, m)));
  const per = props.map(p => ({ p, r: _cxDashProp(p, months) }));
  const t = _cxDashSum(per.map(x => x.r));
  const D = '\u2014';

  // open items (to enter / confirm) in the period
  let open = 0, openInc = 0, openCasa = 0;
  const openMonths = new Set();
  for (const p of props) for (const mm of months) {
    if (_cxIsFuture(y, mm)) continue;                       // DB1: a later month is not due yet → nothing open
    if (!ctlPropOwned(p, y, mm)) continue;                  // before the purchase: nothing is open
    const o = _cxOpenOf(p, y, mm), k = o.inc + o.exp;
    if (k) openMonths.add(mm);
    open += k; openInc += o.inc;
    if (p.id === CASA_PROP_ID) openCasa += k;
  }
  _cxDash.openInc = openInc; _cxDash.openCasa = openCasa; _cxDash.open = open;
  _cxDash.openMonth = openMonths.size ? Math.max(...openMonths) : 0;

  const periodTitle = isYear ? String(y) : EN_M[m - 1] + ' ' + y;
  const lastM = months.length ? months[months.length - 1] : 0;
  const periodWord  = isYear ? (lastM && lastM < 12 ? 'Jan – ' + shortM[lastM - 1] : String(y)) : EN_M[m - 1];

  // ── Top (Nov 2026, lean): ‹ period › (+ "preliminary") · Month | Year under it · read only, no open-items chip
  const prelim = !isYear && (open || later);
  const top = '<div class="cx2-top">' +
    '<div class="cx2-per">' +
      '<button class="cx-arw" data-cx="' + (isYear ? 'yprev' : 'prev') + '" aria-label="Previous"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="cx2-pt"><b>' + cxEsc(periodTitle) + '</b>' + (prelim ? '<small>preliminary</small>' : isYear && lastM && lastM < 12 ? '<small>' + cxEsc(periodWord) + '</small>' : '') + '</span>' +
      '<button class="cx-arw" data-cx="' + (isYear ? 'ynext' : 'next') + '" aria-label="Next"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>' +
    '</div>' +
    '<div class="cx2-sw" role="group" aria-label="Period">' +
      '<button class="' + (isYear ? '' : 'on') + '" data-cx="view" data-v="m" aria-pressed="' + !isYear + '">Month</button>' +
      '<button class="' + (isYear ? 'on' : '') + '" data-cx="view" data-v="y" aria-pressed="' + isYear + '">Year</button>' +
    '</div></div>';

  // Oct 2026 (R1): the whole year as Excel / PDF — always the year on screen (controlling-report.js)
  const exportBtn = '<button class="cx2-lnk cxr-btn" data-cx="repOpen"><i class="ti ti-download" aria-hidden="true"></i>Export ' + y + '</button>';   // Nov 2026: a small link

  if (future) {
    cxPaint(host, '<div class="cx-page cxn">' + top + '<div class="cxn-card cxn-empty">This ' + (isYear ? 'year' : 'month') + ' is still ahead.</div>' + exportBtn + '</div>');   // B18
  } else {
    const isCasa = x => x.p.id === CASA_PROP_ID;
    const renList = per.filter(x => !isCasa(x)), casaList = per.filter(isCasa);
    const ren = _cxDashSum(renList.map(x => x.r)), casa = _cxDashSum(casaList.map(x => x.r));
    const val = r => isYear ? { k: r.freiKalt, w: r.freiWarm } : { k: r.lfKalt, w: r.lfWarm };
    const cls = v => { const n = Math.round(Number(v) || 0); return n < 0 ? 'neg' : n > 0 ? 'pos' : ''; };   // 0 € (as shown, whole euros) = normal colour
    const tv = val(t);

    // ── vs last month (Month view; January has no loaded December)
    let dK = null, dW = null;
    if (!isYear && m > 1) {
      const pp = window._ctrl.properties.filter(p => p.active && ctlPropOwned(p, y, m - 1));
      const tp = _cxDashSum(pp.map(p => _cxDashProp(p, [m - 1])));
      dK = cxR(tv.k - tp.lfKalt); dW = cxR(tv.w - tp.lfWarm);
    }
    const delta = d => d === null ? '' : Math.round(d) === 0 ? 'same as ' + EN_M[m - 2]
      : '<span class="' + (d > 0 ? 'pos' : 'neg') + '">' + (d > 0 ? '\u25b2 ' : '\u25bc ') + cxW(Math.abs(d)) + '</span> vs ' + EN_M[m - 2];

    // ── Income / Expenses (warm) — the cashflow is the big number above them (Nov 2026)
    const inc = t.warm, cf = tv.w, outW = cxR(inc - cf);
    const scale = Math.max(inc, outW, 1);
    const flow = '<div class="cx2-fl">' +
      '<div class="cx2-fr"><span>Income</span><span class="cx2-bar"><i style="width:' + (inc / scale * 100).toFixed(1) + '%;background:#D9C6AE"></i></span><b>' + cxW(inc) + '</b></div>' +
      '<div class="cx2-fr"><span>Expenses</span><span class="cx2-bar"><i style="width:' + (outW / scale * 100).toFixed(1) + '%;background:#E3A895"></i></span><b class="' + (Math.round(outW) > 0 ? 'neg' : '') + '">' + cxW(-outW) + '</b></div></div>';
    const stays = inc > 0 && cf >= 0 ? Math.round(cf / inc * 100) : null;

    // ── the calculation table: Income · rent − Expenses = Cashflow (same everywhere)
    const D = '\u2014';
    const tbl = (r, kind) => {
      const v = val(r), row = (l, k, w, c) => '<div class="cxn-tr' + (c ? ' ' + c : '') + '"><span>' + l + '</span><span>' + k + '</span><span>' + w + '</span></div>';
      let h = row('', 'KALT', 'WARM', 'cxn-th') +
        row('Income \u00b7 rent', cxW(r.kalt), cxW(r.warm), 'cxn-g1') +
        row('\u2212 Expenses', '', '', 'cxn-g1') +
        row(kind === 'casa' ? 'House costs' : kind === 'total' ? 'Hausgeld &amp; costs' : 'Hausgeld, costs', D, cxW(r.kosten), 'cxn-g2') +
        row(kind === 'casa' || kind === 'prop' ? 'Kreditrate' : 'Kreditraten', cxW(r.rate), cxW(r.rate), 'cxn-g2');
      if (isYear) {
        h += row('One-offs', cxW(r.einmalig), cxW(r.einmalig), 'cxn-g2') +
             row('\u00b1 Abrechnungen', D, '<span class="' + cls(r.abr) + '">' + cxWS(r.abr) + '</span>', 'cxn-g2');
      }
      h += row('= Cashflow', '<span class="' + cls(v.k) + '">' + cxWS(v.k) + '</span>', '<span class="' + cls(v.w) + '">' + cxWS(v.w) + '</span>', 'cxn-rs');
      if (!isYear && (r.einmalig || r.abr)) h += row('One-offs \u00b7 Abrechnungen', 'info only', (r.einmalig ? cxW(-r.einmalig) : '') + (r.einmalig && r.abr ? ' \u00b7 ' : '') + (r.abr ? cxWS(r.abr) : ''), 'cxn-inf');
      return '<div class="cxn-tbl">' + h + '</div>';
    };

    // ── Total card (Nov 2026, lean): the warm cashflow big · Kalt and Stays as two boxes · Income / Expenses · the calculation on tap
    const calcOpen = !!CX.open['dash:calc'];
    const box = (k, v, sub) => '<div class="cx2-st"><div class="cx2-k">' + k + '</div><div class="cx2-v cxn-f ' + (v === null ? '' : cls(v)) + '">' + (v === null ? '\u2014' : cxWS(v)) + '</div><div class="cx2-s">' + sub + '</div></div>';
    const totalCard = '<div class="cxn-card cx2-card">' +
      '<div class="cx2-lb">Cashflow \u00b7 all properties<span>warm</span></div>' +
      '<div class="cx2-big"><b class="cxn-f ' + cls(tv.w) + '">' + cxWS(tv.w) + '</b><small>' + (isYear ? 'after one-offs &amp; Abrechnungen' : delta(dW) || '&nbsp;') + '</small></div>' +
      '<div class="cx2-two">' + box('Kalt', tv.k, isYear ? 'after one-offs' : (delta(dK) || 'without NK')) +
        '<div class="cx2-st"><div class="cx2-k">Stays</div><div class="cx2-v cxn-f">' + (stays === null ? '\u2014' : stays + '\u00a0%') + '</div><div class="cx2-s">' + (stays === null ? (!Math.round(inc) && !Math.round(outW) ? 'nothing booked yet' : 'more went out') : 'of the income') + '</div></div></div>' +
      flow +
      '<button class="cx2-lnk" data-cx="dcalc" aria-expanded="' + calcOpen + '"><i class="ti ti-calculator" aria-hidden="true"></i>' + (calcOpen ? 'Hide' : 'Show') + ' the calculation</button>' +
      (calcOpen ? tbl(t, 'total') : '') +
      (t.noSplit ? '<button class="cxd-hint" data-cx="toProps">' + t.noSplit + (t.noSplit === 1 ? ' loan' : ' loans') + ' without Zinsen/Tilgung \u00b7 add in Properties \u203a</button>' : '') +
    '</div>';

    // ── Rentals · Casa Castel as full-width rows (Nov 2026) · tap → its calculation below
    const sec = CX.open['dash:sec'] || '';
    const roomsN = (window._src && window._src.rooms ? window._src.rooms.filter(r => r.active !== false).length : 0);
    const rowOf = (key, name, icon, r, count, color) => {
      const v = val(r), st = r.warm > 0 && v.w > 0 ? Math.round(v.w / r.warm * 100) : 0;
      return '<button class="cxn-card cx2-pr' + (sec === key ? ' on' : '') + '" data-cx="dsec" data-k="' + key + '" aria-expanded="' + (sec === key) + '">' +
        '<span class="cx2-ph"><span class="cxn-ic cxn-ic--' + key + '"><i class="ti ti-' + icon + '" aria-hidden="true"></i></span>' +
          '<span class="cx2-pn"><b>' + name + '</b><small>' + count + ' \u00b7 ' + (v.w < 0 ? 'out > in' : st + ' % stays') + '</small></span>' +
          '<span class="cx2-net"><small>warm</small><b class="cxn-f ' + cls(v.w) + '">' + cxWS(v.w) + '</b></span>' +
          '<i class="ti ti-chevron-' + (sec === key ? 'up' : 'down') + ' cx2-chv" aria-hidden="true"></i></span>' +
        '<span class="cx2-kv"><span><em>Kalt</em><b class="' + cls(v.k) + '">' + cxWS(v.k) + '</b></span><span><em>Income</em><b>' + cxW(r.warm) + '</b></span></span>' +
        '<span class="cx2-thin"><i style="width:' + Math.min(100, st) + '%;background:' + color + '"></i></span></button>';
    };
    const tiles = (renList.length ? rowOf('r', 'Rentals', 'building', ren, renList.length + (renList.length === 1 ? ' property' : ' properties'), '#8FA88F') : '') +
      (casaList.length ? rowOf('c', 'Casa Castel', 'home-heart', casa, roomsN ? roomsN + ' rooms' : 'one house', '#D9B46A') : '');

    // ── Section panel (one at a time)
    let panel = '';
    if (sec === 'r' && renList.length) {
      const pos = p => (p.sort_order !== null && p.sort_order !== undefined && Number.isFinite(Number(p.sort_order))) ? Number(p.sort_order) : 999;
      const order = renList.slice().sort((a, b) => pos(a.p) - pos(b.p) || a.p.id - b.p.id);
      const rows = order.map(({ p, r }) => {
        const v = val(r), k = 'dash:p:' + p.id, isOpen = !!CX.open[k];
        return '<button class="cxn-pr' + (isOpen ? ' open' : '') + '" data-cx="fold" data-k="' + k + '" aria-expanded="' + isOpen + '">' +
          '<span class="cxn-pl"><span class="cxn-pn">' + cxEsc(p.name) + '</span><span class="cxn-ps">in ' + cxW(r.warm) + ' \u00b7 out ' + cxW(cxR(r.warm - v.w)) + '</span></span>' +
          '<span class="cxn-pv cxn-f ' + cls(v.k) + '">' + cxWS(v.k) + '</span><span class="cxn-pv cxn-f ' + cls(v.w) + '">' + cxWS(v.w) + '</span>' +
          '<i class="ti ti-chevron-right cxn-ch" aria-hidden="true"></i></button>' +
          (isOpen ? '<div class="cxn-pd">' + tbl(r, 'prop') + (r.loan && !r.split ? '<div class="cxd-tnote">Loan without Zinsen/Tilgung in Properties.</div>' : '') + '</div>' : '');
      }).join('');
      panel = '<div class="cxn-card"><div class="cxn-pt"><span class="cxn-ic cxn-ic--r"><i class="ti ti-building" aria-hidden="true"></i></span><span class="cxn-lbl">Rentals \u00b7 calculation</span></div>' +
        tbl(ren, 'ren') +
        '<div class="cxn-ph"><span>PER PROPERTY</span><span>KALT</span><span>WARM</span><span></span></div>' + rows + '</div>';
    } else if (sec === 'c' && casaList.length) {
      panel = '<div class="cxn-card"><div class="cxn-pt"><span class="cxn-ic cxn-ic--c"><i class="ti ti-home-heart" aria-hidden="true"></i></span><span class="cxn-lbl">Casa Castel \u00b7 calculation</span></div>' +
        tbl(casa, 'casa') + '</div>';
    }

    // ── Year: warm cashflow per month (Rentals + Casa Castel), tap → that month
    let chart = '';
    if (isYear && months.length > 1) {
      const ms = months.map(mm => {
        const pp = window._ctrl.properties.filter(p => p.active && ctlPropOwned(p, y, mm));
        let r0 = 0, c0 = 0;
        for (const p of pp) { const rr = _cxDashProp(p, [mm]); if (p.id === CASA_PROP_ID) c0 += rr.freiWarm; else r0 += rr.freiWarm; }
        return { mm, r: cxR(r0), c: cxR(c0), t: cxR(r0 + c0) };
      });
      const maxP = Math.max(1, ...ms.map(x => x.t)), maxN = Math.max(0, ...ms.map(x => -x.t));
      const H = 84, zero = maxN ? Math.round(H * maxP / (maxP + maxN)) : H;
      const bars = ms.map(x => {
        const tip = EN_M[x.mm - 1] + ': ' + cxWS(x.t);
        if (x.t < 0) return '<button class="cxn-col" data-cx="ymonth" data-m="' + x.mm + '" title="' + tip + '" aria-label="' + tip + '"><span class="cxn-colp" style="height:' + zero + 'px"></span><span class="cxn-coln" style="height:' + Math.max(2, Math.round(-x.t / (maxP + maxN) * H)) + 'px"></span></button>';
        const hh = Math.max(2, Math.round(x.t / (maxP + maxN || maxP) * H));
        const rP = x.r > 0 && x.c > 0 ? x.r / (x.r + x.c) * 100 : (x.r > 0 ? 100 : 0);
        return '<button class="cxn-col" data-cx="ymonth" data-m="' + x.mm + '" title="' + tip + '" aria-label="' + tip + '"><span class="cxn-colp" style="height:' + zero + 'px">' +
          '<span class="cxn-stk" style="height:' + hh + 'px"><i style="height:' + (100 - rP).toFixed(1) + '%;background:#D9B46A"></i><i style="height:' + rP.toFixed(1) + '%;background:#8FA88F"></i></span></span></button>';
      }).join('');
      chart = '<div class="cxn-card"><div class="cxn-hrow"><span class="cxn-lbl">Warm cashflow per month</span><span class="cxn-mut">tap a month</span></div>' +
        '<div class="cxn-chart" style="height:' + (H + 4) + 'px">' + bars + '</div>' +
        '<div class="cxn-months">' + ms.map(x => '<span>' + shortM[x.mm - 1].charAt(0) + '</span>').join('') + '</div>' +
        '<div class="cxn-lg"><span><i style="background:#8FA88F"></i>Rentals</span><span><i style="background:#D9B46A"></i>Casa Castel</span></div></div>';
    }

    cxPaint(host, '<div class="cx-page cxn">' + top + '<div class="cxn-cols"><div class="cxn-l">' + totalCard + '</div><div class="cxn-r">' + tiles + panel + '</div></div>' + chart + exportBtn + '</div>');   // B2: two columns on iPad landscape / laptop (invisible on the phone)   // B18: only what changed
  }

  cxWire(host, {
    render: () => window.renderDashboard(),
    click: async (a, b) => {
      if (a === 'repOpen') {                                   // R1: year export pop-up
        if (typeof cxReportOpen === 'function') cxReportOpen();
        else if (typeof ctlToast === 'function') ctlToast('Export could not be loaded – please reload the page');
        return;
      }
      if (a === 'view') { CX.dashView = b.dataset.v; return window.renderDashboard(); }
      if (a === 'dcalc') { CX.open['dash:calc'] = !CX.open['dash:calc']; return window.renderDashboard(); }
      if (a === 'dsec')  { CX.open['dash:sec'] = CX.open['dash:sec'] === b.dataset.k ? '' : b.dataset.k; return window.renderDashboard(); }
      if (a === 'ymonth') {                                    // a month in the Year chart → that month
        CX.month = Number(b.dataset.m); CX.dashView = 'm';
        try { localStorage.setItem('cx_month', String(CX.month)); } catch (e) {}
        return window.renderDashboard();
      }
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

/* ── Nov 2026 · lean dashboard styles (same look as Settlements): one big number · two boxes · full-width rows ── */
(function () {
  if (typeof document === 'undefined' || document.getElementById('cx2-css')) return;
  const st = document.createElement('style'); st.id = 'cx2-css';
  st.textContent = `
.cx2-top { display:flex; flex-direction:column; align-items:center; gap:8px; margin:2px 0 10px; }
.cx2-per { display:flex; align-items:center; justify-content:space-between; width:100%; }
.cx2-pt { text-align:center; display:flex; flex-direction:column; }
.cx2-pt b { font-family:'Cormorant Garamond', Georgia, serif; font-size:24px; font-weight:500; line-height:1.05; color:#3D3027; }
.cx2-pt small { font-size:10.5px; color:#9A8E7E; }
.cx2-sw { display:inline-flex; background:#EAE3D8; border-radius:9px; padding:2px; gap:2px; }
.cx2-sw button { border:0; background:none; border-radius:7px; padding:5px 12px; font:400 11.5px 'Inter', system-ui, sans-serif; color:#7A6F62; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.cx2-sw button.on { background:#FDFCFA; color:#3D3027; font-weight:600; box-shadow:0 1px 2px rgba(61,48,39,.12); }
.cx2-card { padding:13px 15px; }
.cx2-lb { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:10px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:#8A6535; }
.cx2-lb span { font-weight:400; letter-spacing:0; text-transform:none; font-size:11px; color:#9A8E7E; }
.cx2-big { text-align:center; margin:6px 0 2px; }
.cx2-big b { display:block; font-size:40px; line-height:1.05; white-space:nowrap; }
.cx2-big small { display:block; font-size:11px; color:#9A8E7E; margin-top:2px; }
.cx2-two { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px; margin-top:10px; }
.cx2-st { border-radius:12px; background:#F7F3EC; padding:8px 10px; min-width:0; }
.cx2-k { font-size:11px; font-weight:500; color:#8C8072; }
.cx2-v { font-size:22px; line-height:1.15; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#3D3027; }
.cx2-s { font-size:10.5px; color:#9A8E7E; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cx2-fl { display:flex; flex-direction:column; gap:5px; margin-top:10px; }
.cx2-fr { display:grid; grid-template-columns:62px minmax(0,1fr) auto; align-items:center; gap:8px; font-size:11.5px; color:#7A6F62; }
.cx2-fr b { text-align:right; font-weight:600; color:#3D3027; font-variant-numeric:tabular-nums; white-space:nowrap; }
.cx2-bar { height:7px; border-radius:4px; background:#F0EBE3; overflow:hidden; } .cx2-bar i { display:block; height:100%; border-radius:4px; }
.cx2-lnk { display:flex; align-items:center; justify-content:center; gap:5px; width:100%; margin-top:9px; padding:4px 0; border:0; background:none; font:500 11.5px 'Inter', system-ui, sans-serif; color:#8A6535; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.cx2-pr { display:flex; flex-direction:column; gap:8px; width:100%; padding:12px 14px; text-align:left; font:inherit; color:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.cx2-pr.on { border-color:#D9CBB4; }
.cx2-ph { display:flex; align-items:center; gap:9px; }
.cx2-pn { flex:1; min-width:0; display:flex; flex-direction:column; } .cx2-pn b { font-size:14px; font-weight:600; } .cx2-pn small { font-size:11px; color:#9A8E7E; }
.cx2-net { text-align:right; display:flex; flex-direction:column; } .cx2-net small { font-size:10px; color:#9A8E7E; } .cx2-net b { font-size:21px; line-height:1.05; white-space:nowrap; }
.cx2-chv { color:#C8BFB0; font-size:15px; }
.cx2-kv { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:6px; }
.cx2-kv > span { display:flex; justify-content:space-between; align-items:baseline; gap:6px; border-radius:10px; background:#F7F3EC; padding:6px 9px; min-width:0; }
.cx2-kv em { font-style:normal; font-size:10.5px; color:#8C8072; } .cx2-kv b { font-size:12.5px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
.cx2-thin { height:5px; border-radius:3px; background:#F0EBE3; overflow:hidden; display:block; } .cx2-thin i { display:block; height:100%; }
.cx2-big b.pos, .cx2-v.pos, .cx2-net b.pos, .cx2-kv b.pos { color:#3B6D11; } .cx2-big b.neg, .cx2-v.neg, .cx2-net b.neg, .cx2-kv b.neg, .cx2-fr b.neg { color:#8A3B22; }
`;
  document.head.appendChild(st);
})();
