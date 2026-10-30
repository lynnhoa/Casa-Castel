/* ─────────────────────────────────────────────────────────────
   CONTROLLING — YEAR EXPORT from the Dashboard (Excel · PDF)
   controlling-report.js

   "Export <Jahr>" at the bottom of the Dashboard opens ONE pop-up:
     Format (PDF · Excel) · Properties (All · Rentals · Casa Castel)
   The export is always the whole year shown on the Dashboard.

   One data function (cxRepData) → every sheet / page, so Excel and PDF
   always show the same numbers — and the same numbers as the Dashboard:
     Dashboard YEAR · MONTHS · General  = _cxDashProp (the Dashboard's own math)
     Income          units ctlUnitsFor · Soll ctlUnitSoll · Ist ctrl_income_months
     Expense         Soll ctlCostRows (loans from Properties) · Ist ctrl_expense_apartments
     Expense Castel  Soll ctlCasaCostRows (dated Soll) · Ist ctrl_expense_castel
     Expense One Time  cxInvoiceData (One-off export: no Abrechnungen,
                     Kaufnebenkosten in their own block, never in the cashflow)
     Hausgeld- / Nebenkostenausgleich = booked Abrechnung results, month paid
   Rules: purchase order (sort_order) · a property only from its purchase
   date · months still ahead: Soll only · German formats · "Stand" = today.

   Bucket 1 (30.10.2026): data + Excel in the look of
     Real_Estate_Portfolio_Management_2026 (same sheet names, colours,
     columns; sums and Gesamt as formulas; name columns frozen).
     ExcelJS loads only when the pop-up opens; the file is prepared in the
     background, so the tap can open the iPhone share sheet right away.
   Bucket 2: PDF in the Casa Castel document design (A4 landscape).
   Bucket 3: double rent — one rent per day and unit, you choose whose.
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX_EXCELJS_URL = window.CX_EXCELJS_URL || 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const CXR_COLORS = ['FFFF99', 'CCFF99', 'CCECFF', 'CC99FF', 'F6C6AD', 'A6CAEC', 'FFCCFF', '8ED973', 'D9F2D0', 'FF7C80'];   // your Excel, in purchase order
const CXR_SHEETS = ['Dashboard YEAR', 'Dashboard MONTHS', 'Income', 'Expense', 'Expense Castel', 'Expense One Time', 'General'];
const CXR_EUR = '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-';                         // your Excel's € format
if (!CX.rep) CX.rep = { fmt: 'xlsx', scope: 'all' };

/* ── which sheets a scope gets ── */
function cxRepSheets(scope) {
  return CXR_SHEETS.filter(s => !(scope === 'r' && s === 'Expense Castel') && !(scope === 'c' && s === 'Expense'));
}
function cxRepFileName(y, scope, ext) {
  return 'Controlling_' + y + (scope === 'r' ? '_Rentals' : scope === 'c' ? '_Casa_Castel' : '') + '.' + ext;
}

/* ══ THE ONE DATA FUNCTION ══════════════════════════════════════ */
function cxRepData(scope) {
  const C = window._ctrl, y = C.year, r2 = cxR;
  const ym = typeof _cxYearMonths === 'function' ? _cxYearMonths(y) : Array.from({ length: 12 }, (_, i) => i + 1);
  const counted = new Set(ym);                              // months with Ist (= the Dashboard's months)
  const M12 = Array.from({ length: 12 }, (_, i) => i + 1);
  const pos = p => (p.sort_order !== null && p.sort_order !== undefined && Number.isFinite(Number(p.sort_order))) ? Number(p.sort_order) : 999;
  const all = C.properties.filter(p => p.active).slice().sort((a, b) => pos(a) - pos(b) || a.id - b.id);
  const props = all.map((p, i) => ({ p, no: i + 1, color: CXR_COLORS[i % CXR_COLORS.length], casa: p.id === CASA_PROP_ID }))
    .filter(x => ctlPropOwnedYear(x.p, y) && (scope === 'all' || (scope === 'c') === x.casa));
  const owned = (x, m) => ctlPropOwned(x.p, y, m);
  const sum = (a, f) => a.reduce((s, v) => s + (Number(f ? f(v) : v) || 0), 0);
  const valOrNull = v => (v === null || v === undefined || v === '' ? null : r2(v));

  // Abrechnungen split by kind (same months and signs as the Dashboard)
  const abr = x => {
    let hg = 0, nk = 0;
    for (const o of (C.one_time || [])) {
      if (Number(o.property_id) !== x.p.id || !CX_ABR_KINDS.includes(o.kind)) continue;
      const d = ctlParseDate(o.invoice_date);
      if (d.year !== y || !counted.has(d.month) || !owned(x, d.month)) continue;
      const v = (Number(o.direction) === 1 ? 1 : -1) * (Number(o.amount) || 0);
      if (o.kind === 'Hausgeldabrechnung') hg += v; else nk += v;
    }
    return { hg: r2(hg), nk: r2(nk) };
  };

  // Dashboard YEAR · MONTHS · General — the Dashboard's own calculation
  const dash = props.map(x => {
    const mon = {};
    for (const m of M12) {
      if (!counted.has(m) || !owned(x, m)) { mon[m] = null; continue; }
      const r = _cxDashProp(x.p, [m]);
      mon[m] = { inc: r.warm, exp: r2(r.kosten + r.rate), ges: r.lfWarm };
    }
    const R = _cxDashProp(x.p, ym), a = abr(x);
    return { x, mon, R, year: { income: R.lfWarm, oneoff: R.einmalig, hg: a.hg, nk: a.nk, ges: R.freiWarm } };
  });
  const area = list => ({ k: r2(sum(list, d => d.R.freiKalt)), w: r2(sum(list, d => d.R.freiWarm)) });
  const kw = {
    ren: dash.some(d => !d.x.casa) ? area(dash.filter(d => !d.x.casa)) : null,
    casa: dash.some(d => d.x.casa) ? area(dash.filter(d => d.x.casa)) : null,
  };
  const general = dash.map(d => ({ x: d.x, kalt: d.R.kalt, rate: d.R.rate, cfK: d.R.lfKalt, nk: d.R.nk, hk: d.R.kosten, cfW: d.R.lfWarm }));

  // Income — one row per unit (rooms and parking too)
  const income = [];
  for (const x of props) {
    for (const u of ctlUnitsFor(x.p.id)) {
      const mon = {};
      for (const m of M12) {
        if (!owned(x, m)) { mon[m] = null; continue; }
        const s = ctlUnitSoll(u, x.p.id, y, m) || {};
        const rows = counted.has(m) && u.id != null ? C.income.filter(r => r.unit_id === u.id && r.year === y && r.month === m) : [];
        mon[m] = { sW: r2(s.soll), sK: r2(s.k),
                   k: rows.length ? r2(sum(rows, r => r.kaltmiete)) : null,
                   nk: rows.length ? r2(sum(rows, r => r.nebenkosten)) : null };
      }
      income.push({ x, name: u.name || '', mon });
    }
  }

  // Expense — apartments (Casa Castel = one line, its costs follow in Expense Castel)
  const castelRows = {};                                     // m → ctlCasaCostRows(...).rows
  const casaX = props.find(x => x.casa);
  if (casaX) for (const m of M12) castelRows[m] = owned(casaX, m) ? ctlCasaCostRows(casaX.p, y, m).rows : null;
  const rateCat = (C.categories || []).find(c => c.code === 'RATE');
  const castelIst = (catId, m) => {
    const rows = (C.castel_expenses || []).filter(e => e.category_id === catId && e.year === y && e.month === m);
    return rows.length ? r2(sum(rows, e => e.amount)) : null;
  };
  const expense = props.map(x => {
    const mon = {};
    for (const m of M12) {
      if (!owned(x, m)) { mon[m] = null; continue; }
      if (x.casa) {
        const rows = (C.castel_expenses || []).filter(e => e.year === y && e.month === m);
        const any = counted.has(m) && rows.length > 0;
        mon[m] = { soll: r2(sum(castelRows[m] || [], r => r.soll)), casa: true,
                   ges: any ? r2(sum(rows, e => e.amount)) : null,
                   rate: any && rateCat ? castelIst(rateCat.id, m) : null };
        continue;
      }
      const row = counted.has(m) ? (C.apt_expenses || []).find(e => e.property_id === x.p.id && e.year === y && e.month === m) : null;
      const v = k => (row ? valOrNull(row[k]) : null);
      const parts = ['rate', 'hausgeld', 'grundsteuer', 'strom'].map(v);
      mon[m] = { soll: r2(sum(ctlCostRows(x.p, y, m).rows, r => r.soll)),
                 ges: parts.some(p => p !== null) ? r2(sum(parts)) : null,
                 rate: v('rate'), zins: v('zinsen'), tilg: v('tilgung'), hg: v('hausgeld'), grst: v('grundsteuer'), strom: v('strom') };
    }
    return { x, mon };
  });

  // Expense Castel — every Casa Castel cost type
  let castel = null;
  if (casaX) {
    const ref = ym.length ? ym[ym.length - 1] : 1;            // "Kosten" = the Soll amount valid at the Stand
    const loan = ctlPropLinks(casaX.p).loan;
    castel = (C.categories || []).filter(c => c.active !== false).map(c => {
      const isRate = c.code === 'RATE';
      const base = isRate && loan ? r2(loan.rate) : r2(ctlCastelAmountAt(c, y, ref).amount);
      const mon = {};
      for (const m of M12) {
        if (!castelRows[m]) { mon[m] = null; continue; }
        const row = castelRows[m].find(r => r.catId === c.id);
        mon[m] = { soll: row ? r2(row.soll) : 0, ist: counted.has(m) ? castelIst(c.id, m) : null };
      }
      return { name: c.name || (isRate ? 'Kreditrate' : 'Kosten'), base, freq: c.frequency || 'monatlich', mon };
    });
  }

  // Expense One Time — the One-off export's data (invoices of the year; Kaufnebenkosten apart)
  const groups = typeof cxInvoiceData === 'function' ? cxInvoiceData(y, null) : [];
  const oneoff = props.map(x => ({ x, g: groups.find(g => g.p.id === x.p.id) })).filter(o => o.g);

  return { y, scope, today: cxToday(), stand: cxFmtDate(cxToday()), counted, ym, props, dash, kw, general, income, expense, castel, oneoff,
           sheets: cxRepSheets(scope).filter(s => (s !== 'Expense Castel' || castel) && (s !== 'Expense' || props.some(x => !x.casa))) };
}

/* ══ EXCEL — the look of your own controlling sheet ══════════════ */
const _xFill = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } });
const _xBd = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
function _xCol(n) { let s = ''; while (n > 0) { const k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = Math.floor((n - 1) / 26); } return s; }
const _xA = (r, c) => _xCol(c) + r;
/* one cell: value + your sheet's style. o: fill · b(old) · w(hite text) · bd(border, default on) · al(ign) · fmt · sz · grey · i(talic) */
function _xSet(ws, r, c, v, o = {}) {
  const cell = ws.getCell(r, c);
  if (v !== null && v !== undefined && v !== '') cell.value = v;
  cell.font = { name: 'Calibri', size: o.sz || 11, bold: !!o.b, italic: !!o.i,
                color: { argb: o.w ? 'FFFFFFFF' : o.grey ? 'FF7F7F7F' : 'FF000000' } };
  if (o.fill) cell.fill = _xFill(o.fill);
  if (o.bd !== false) cell.border = _xBd;
  cell.alignment = { horizontal: o.al || 'center', vertical: 'middle' };
  if (o.fmt) cell.numFmt = o.fmt;
  return cell;
}
const _xNum = (ws, r, c, v, o = {}) => _xSet(ws, r, c, v === null || v === undefined ? null : typeof v === 'object' ? v : cxR(v), Object.assign({ fmt: CXR_EUR }, o));   // a formula stays a formula
const _xF = (formula, result) => ({ formula, result: cxR(result) });
const _xMonth = (y, m) => new Date(Date.UTC(y, m - 1, 1, 12));    // noon UTC → never the day before in any time zone
function _xBand(ws, r, c, n, y, m) {                               // month band over n columns
  for (let k = 0; k < n; k++) _xSet(ws, r, c + k, k ? null : _xMonth(y, m), { fill: m % 2 ? '78206E' : 'D86ECC', w: 1, b: 1, fmt: 'mmmm yyyy' });
  if (n > 1) ws.mergeCells(r, c, r, c + n - 1);
}
function _xTitle(ws, d, text, at = 2) {
  _xSet(ws, at, 2, text, { b: 1, sz: 14, bd: false, al: 'left' });
  _xSet(ws, at + 1, 2, 'Stand ' + d.stand + ' · ' + (d.scope === 'r' ? 'Rentals' : d.scope === 'c' ? 'Casa Castel' : 'Alle Objekte'), { sz: 9, grey: 1, i: 1, bd: false, al: 'left' });
}
const _xNo = (ws, r, no, fill = '3B7D23') => _xSet(ws, r, 2, no, { fill, w: 1, b: 1 });
const _xName = (ws, r, x) => _xSet(ws, r, 3, x.p.name, { fill: x.color, b: 1, al: 'left' });
const _xHead = (ws, r, c, t, fill = '215F9A') => _xSet(ws, r, c, t, { fill, w: 1, b: 1 });
function _xWidths(ws, list) { list.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = w; }); }

function _xSheetYear(wb, d) {
  const ws = wb.addWorksheet('Dashboard YEAR', { views: [{ showGridLines: false }] });
  _xTitle(ws, d, 'Dashboard ' + d.y);
  for (let c = 4; c <= 8; c++) _xSet(ws, 4, c, c === 4 ? d.y : null, { fill: 'CC99FF', w: 1, b: 1, fmt: '0' });
  ws.mergeCells(4, 4, 4, 8);
  ['No.', 'Immobilie', 'Gesamt', 'Income', 'Expenses One Time', 'Hausgeldausgleich', 'Nebenkostenausgleich'].forEach((t, i) => _xHead(ws, 5, i + 2, t));
  let r = 6;
  for (const x of d.dash) {
    const Y = x.year;
    _xNo(ws, r, x.x.no); _xName(ws, r, x.x);
    _xNum(ws, r, 4, _xF('E' + r + '-F' + r + '+G' + r + '+H' + r, Y.income - Y.oneoff + Y.hg + Y.nk), { b: 1, fill: 'F2F2F2' });
    _xNum(ws, r, 5, Y.income, { fill: 'F2F2F2' });
    _xNum(ws, r, 6, Y.oneoff); _xNum(ws, r, 7, Y.hg); _xNum(ws, r, 8, Y.nk);
    r++;
  }
  const last = r - 1, tot = k => d.dash.reduce((s, x) => s + (x.year[k] || 0), 0);
  [[4, tot('income') - tot('oneoff') + tot('hg') + tot('nk')], [5, tot('income')], [6, tot('oneoff')], [7, tot('hg')], [8, tot('nk')]]
    .forEach(([c, v]) => _xNum(ws, r, c, _xF('SUM(' + _xA(6, c) + ':' + _xA(last, c) + ')', v), { b: 1, bd: false }));
  // Cashflow Kalt | Warm — the Dashboard's Year view (after one-offs; warm also after Abrechnungen)
  r += 2;
  _xHead(ws, r, 3, 'Cashflow'); _xHead(ws, r, 4, 'Kalt'); _xHead(ws, r, 5, 'Warm');
  const first = r + 1, rows = [];
  if (d.kw.ren) rows.push(['Rentals', d.kw.ren, 'F2F2F2']);
  if (d.kw.casa) rows.push(['Casa Castel', d.kw.casa, (d.props.find(x => x.casa) || {}).color || 'FFCCFF']);
  for (const [t, v, f] of rows) { r++; _xSet(ws, r, 3, t, { fill: f, b: 1, al: 'left' }); _xNum(ws, r, 4, v.k); _xNum(ws, r, 5, v.w); }
  r++;
  _xSet(ws, r, 3, 'Total', { b: 1, al: 'left' });
  _xNum(ws, r, 4, _xF('SUM(D' + first + ':D' + (r - 1) + ')', rows.reduce((s, x) => s + x[1].k, 0)), { b: 1 });
  _xNum(ws, r, 5, _xF('SUM(E' + first + ':E' + (r - 1) + ')', rows.reduce((s, x) => s + x[1].w, 0)), { b: 1 });
  _xWidths(ws, [5, 4.7, 22, 13.6, 13.6, 18.2, 18, 21]);
}

function _xSheetMonths(wb, d) {
  const ws = wb.addWorksheet('Dashboard MONTHS', { views: [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: false }] });
  _xTitle(ws, d, 'Dashboard');
  _xHead(ws, 5, 2, 'No.'); _xHead(ws, 5, 3, 'Immobilie');
  for (let m = 1; m <= 12; m++) {
    const c = 4 + (m - 1) * 3;
    _xBand(ws, 4, c, 3, d.y, m);
    ['Gesamt', 'Income', 'Expenses'].forEach((t, k) => _xHead(ws, 5, c + k, t));
  }
  let r = 6;
  for (const x of d.dash) {
    _xNo(ws, r, x.x.no); _xName(ws, r, x.x);
    for (let m = 1; m <= 12; m++) {
      const c = 4 + (m - 1) * 3, v = x.mon[m];
      _xNum(ws, r, c, v ? _xF(_xA(r, c + 1) + '-' + _xA(r, c + 2), v.ges) : null, { fill: '4E95D9', w: 1, b: 1 });
      _xNum(ws, r, c + 1, v ? v.inc : null, { fill: 'DCEAF7' });
      _xNum(ws, r, c + 2, v ? v.exp : null, { fill: 'DCEAF7' });
    }
    r++;
  }
  const last = r - 1;
  for (let m = 1; m <= 12; m++) {
    if (!d.counted.has(m)) continue;
    const c = 4 + (m - 1) * 3;
    ['ges', 'inc', 'exp'].forEach((k, j) => _xNum(ws, r, c + j,
      _xF('SUM(' + _xA(6, c + j) + ':' + _xA(last, c + j) + ')', d.dash.reduce((s, x) => s + (x.mon[m] ? x.mon[m][k] : 0), 0)), { b: 1, bd: false }));
  }
  _xWidths(ws, [5, 6.1, 22].concat(Array(36).fill(12)));
}

function _xSheetIncome(wb, d) {
  const ws = wb.addWorksheet('Income', { views: [{ state: 'frozen', xSplit: 4, ySplit: 5, showGridLines: false }] });
  _xTitle(ws, d, 'Income');
  _xHead(ws, 5, 2, 'No.'); _xHead(ws, 5, 3, 'Immobilie'); _xHead(ws, 5, 4, 'Unit');
  for (let m = 1; m <= 12; m++) {
    const c = 5 + (m - 1) * 5;
    _xBand(ws, 4, c, 5, d.y, m);
    ['Soll Warm', 'Soll Kalt', 'Warmmiete', 'Kaltmiete', 'Nebenkosten'].forEach((t, k) => _xHead(ws, 5, c + k, t));
  }
  let r = 6;
  for (const u of d.income) {
    _xNo(ws, r, u.x.no); _xName(ws, r, u.x);
    _xSet(ws, r, 4, u.name, { fill: 'D9F2D0', b: 1 });
    for (let m = 1; m <= 12; m++) {
      const c = 5 + (m - 1) * 5, v = u.mon[m], ist = v && v.k !== null;
      _xNum(ws, r, c, v ? v.sW : null, { fill: '50164A', w: 1, b: 1 });
      _xNum(ws, r, c + 1, v ? v.sK : null, { fill: '50164A', w: 1, b: 1 });
      _xNum(ws, r, c + 2, ist ? _xF(_xA(r, c + 3) + '+' + _xA(r, c + 4), v.k + (v.nk || 0)) : null, { fill: 'F2CFEE' });
      _xNum(ws, r, c + 3, ist ? v.k : null);
      _xNum(ws, r, c + 4, ist ? (v.nk || 0) : null);
    }
    r++;
  }
  const last = r - 1, tot = r;
  for (let m = 1; m <= 12; m++) {
    const c = 5 + (m - 1) * 5, has = d.income.some(u => u.mon[m]);
    if (!has) continue;
    const S = f => d.income.reduce((s, u) => s + (u.mon[m] ? f(u.mon[m]) || 0 : 0), 0);
    const sumCell = (k, v) => _xNum(ws, tot, c + k, _xF('SUM(' + _xA(6, c + k) + ':' + _xA(last, c + k) + ')', v), { b: 1, bd: false });
    sumCell(0, S(v => v.sW)); sumCell(1, S(v => v.sK));
    if (d.counted.has(m)) {
      sumCell(2, S(v => (v.k === null ? 0 : v.k + (v.nk || 0)))); sumCell(3, S(v => v.k)); sumCell(4, S(v => v.nk));
      // like your row 30: "Kaltmiete fehlt" = Soll Kalt − Kaltmiete
      _xSet(ws, tot + 3, c, 'Kaltmiete fehlt', { b: 1, bd: false });
      _xNum(ws, tot + 3, c + 1, _xF(_xA(tot, c + 1) + '-' + _xA(tot, c + 3), S(v => v.sK) - S(v => v.k)), { bd: false });
    }
  }
  const w = [2.2, 4.7, 22, 14];
  for (let m = 0; m < 12; m++) w.push(13.6, 13.6, 11.7, 11.7, 12.2);
  _xWidths(ws, w);
}

function _xSheetExpense(wb, d) {
  const ws = wb.addWorksheet('Expense', { views: [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: false }] });
  _xTitle(ws, d, 'Expense ALL');
  _xHead(ws, 5, 2, 'No.'); _xHead(ws, 5, 3, 'Immobilie');
  const COLS = ['Soll', 'Gesamt', 'Rate', 'Zinsen', 'Tilgung', 'Hausgeld', 'Grundsteuer', 'Strom'];
  const KEYS = ['rate', 'zins', 'tilg', 'hg', 'grst', 'strom'];
  for (let m = 1; m <= 12; m++) {
    const c = 4 + (m - 1) * 8;
    _xBand(ws, 4, c, 8, d.y, m);
    COLS.forEach((t, k) => _xHead(ws, 5, c + k, t));
  }
  let r = 6;
  for (const e of d.expense) {
    _xNo(ws, r, e.x.no); _xName(ws, r, e.x);
    for (let m = 1; m <= 12; m++) {
      const c = 4 + (m - 1) * 8, v = e.mon[m];
      _xNum(ws, r, c, v ? v.soll : null, { fill: '50164A', w: 1, b: 1 });
      if (e.x.casa) {                                          // Casa Castel: Gesamt from Expense Castel
        _xNum(ws, r, c + 1, v ? v.ges : null, { fill: '92D050', w: 1, b: 1 });
        _xNum(ws, r, c + 2, v ? v.rate : null, { fill: '92D050' });
        for (let k = 3; k < 8; k++) _xNum(ws, r, c + k, null, { fill: '92D050' });
        continue;
      }
      _xNum(ws, r, c + 1, v && v.ges !== null ? _xF('SUM(' + [2, 5, 6, 7].map(k => _xA(r, c + k)).join(',') + ')', v.ges) : null,
        { fill: 'E59EDD', w: 1, b: 1 });
      KEYS.forEach((k, j) => _xNum(ws, r, c + 2 + j, v ? v[k] : null));
    }
    r++;
  }
  const last = r - 1;
  for (let m = 1; m <= 12; m++) {
    const c = 4 + (m - 1) * 8;
    if (!d.expense.some(e => e.mon[m])) continue;
    const S = f => d.expense.reduce((s, e) => s + (e.mon[m] ? f(e.mon[m]) || 0 : 0), 0);
    const cols = [0].concat(d.counted.has(m) ? [1, 2, 3, 4, 5, 6, 7] : []);
    const val = [S(v => v.soll), S(v => v.ges), S(v => v.rate), S(v => v.zins), S(v => v.tilg), S(v => v.hg), S(v => v.grst), S(v => v.strom)];
    cols.forEach(k => _xNum(ws, r, c + k, _xF('SUM(' + _xA(6, c + k) + ':' + _xA(last, c + k) + ')', val[k]), { b: 1, bd: false }));
  }
  if (d.expense.some(e => e.x.casa)) _xSet(ws, r + 2, 3, 'Casa Castel: Gesamt aus Expense Castel · Rate = Kreditrate', { sz: 9, grey: 1, i: 1, bd: false, al: 'left' });
  _xWidths(ws, [5, 4.7, 22].concat(Array(96).fill(11.7)));
}

function _xSheetCastel(wb, d) {
  const ws = wb.addWorksheet('Expense Castel', { views: [{ state: 'frozen', xSplit: 5, ySplit: 5, showGridLines: false }] });
  _xTitle(ws, d, 'Expense Castel');
  ['No.', 'Kostenart', 'Kosten', 'Häufigkeit'].forEach((t, i) => _xHead(ws, 5, i + 2, t));
  for (let m = 1; m <= 12; m++) {
    const c = 6 + (m - 1) * 2;
    _xBand(ws, 4, c, 2, d.y, m);
    _xHead(ws, 5, c, 'Soll'); _xHead(ws, 5, c + 1, 'Ist');
  }
  let r = 6;
  d.castel.forEach((k, i) => {
    _xNo(ws, r, i + 1, '4E95D9');
    _xSet(ws, r, 3, k.name, { al: 'left', sz: 10 });
    _xNum(ws, r, 4, k.base, { sz: 10 });
    _xSet(ws, r, 5, k.freq, { sz: 10 });
    for (let m = 1; m <= 12; m++) {
      const c = 6 + (m - 1) * 2, v = k.mon[m];
      _xNum(ws, r, c, v ? v.soll : null, { fill: '50164A', w: 1, b: 1 });
      _xNum(ws, r, c + 1, v ? v.ist : null);
    }
    r++;
  });
  const last = r - 1;
  for (let m = 1; m <= 12; m++) {
    const c = 6 + (m - 1) * 2;
    if (!d.castel.some(k => k.mon[m])) continue;
    _xNum(ws, r, c, _xF('SUM(' + _xA(6, c) + ':' + _xA(last, c) + ')', d.castel.reduce((s, k) => s + (k.mon[m] ? k.mon[m].soll : 0), 0)), { b: 1, bd: false });
    if (d.counted.has(m)) _xNum(ws, r, c + 1, _xF('SUM(' + _xA(6, c + 1) + ':' + _xA(last, c + 1) + ')',
      d.castel.reduce((s, k) => s + (k.mon[m] && k.mon[m].ist ? k.mon[m].ist : 0), 0)), { b: 1, bd: false });
  }
  _xWidths(ws, [5, 4.7, 32, 11.7, 14.5].concat(Array(24).fill(11.7)));
}

function _xSheetOneOff(wb, d) {
  const ws = wb.addWorksheet('Expense One Time');
  _xTitle(ws, d, 'Expense One Time');
  if (!d.oneoff.length) { _xSet(ws, 5, 2, 'Keine Rechnungen in ' + d.y, { bd: false, al: 'left' }); return; }
  const date = s => { const t = String(s || ''); return t ? new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10), 12)) : null; };
  const widths = [6.7];
  d.oneoff.forEach((o, b) => {
    const c = 2 + b * 6;                                       // 5 columns + one free column per property, side by side
    for (let k = 0; k < 5; k++) _xSet(ws, 4, c + k, k ? null : o.x.p.name, { fill: o.x.color, b: 1 });
    ws.mergeCells(4, c, 4, c + 4);
    const block = (row0, items, total) => {
      ['No.', 'Item', 'Geschäft', 'Kosten', 'Rechnungsdatum'].forEach((t, k) => _xHead(ws, row0, c + k, t));
      items.forEach((it, i) => {
        const rr = row0 + 1 + i;
        _xSet(ws, rr, c, it.nr, { fill: '4E95D9', w: 1, b: 1 });
        _xSet(ws, rr, c + 1, it.item, { al: 'left' });
        _xSet(ws, rr, c + 2, it.company, { al: 'left' });
        _xNum(ws, rr, c + 3, it.price);
        _xSet(ws, rr, c + 4, date(it.date), { fmt: 'dd.mm.yyyy' });
      });
      return { first: row0 + 1, last: row0 + items.length, total };
    };
    const g = o.g, main = block(6, g.items, g.total);
    // sum under the name, like your sheet
    for (let k = 0; k < 5; k++) _xNum(ws, 5, c + k, k ? null : (g.items.length ? _xF('SUM(' + _xA(main.first, c + 3) + ':' + _xA(main.last, c + 3) + ')', g.total) : 0), { al: 'right' });
    ws.mergeCells(5, c, 5, c + 4);
    if (g.knk && g.knk.length) {                               // Kaufnebenkosten: part of the purchase, never in the cashflow
      const at = main.last + 2;
      _xSet(ws, at, c, 'Kaufnebenkosten · nicht im Cashflow', { b: 1, bd: false, al: 'left' });
      const kb = block(at + 1, g.knk, g.knkTotal);
      _xSet(ws, kb.last + 1, c + 2, 'Summe', { b: 1, bd: false, al: 'right' });
      _xNum(ws, kb.last + 1, c + 3, _xF('SUM(' + _xA(kb.first, c + 3) + ':' + _xA(kb.last, c + 3) + ')', g.knkTotal), { b: 1, bd: false });
    }
    widths.push(6.5, 28, 18, 13, 15.5, 4);
  });
  _xWidths(ws, widths);
}

function _xSheetGeneral(wb, d) {
  const ws = wb.addWorksheet('General', { views: [{ showGridLines: false }] });
  _xSet(ws, 3, 2, 'Rental Cashflow Dashboard ' + d.y, { b: 1, sz: 14, bd: false, al: 'left' });
  _xSet(ws, 4, 2, 'Stand ' + d.stand + ' · laufend, ohne One-offs und Abrechnungen', { sz: 9, grey: 1, i: 1, bd: false, al: 'left' });
  ['No.', 'Immobilie', 'Kaltmiete', 'Rate', 'Cashflow Kalt', 'Nebenkosten', 'Hausgeld & Kosten', 'Cashflow Warm']
    .forEach((t, i) => _xHead(ws, 6, i + 2, t, '78206E'));
  let r = 7;
  for (const g of d.general) {
    _xNo(ws, r, g.x.no); _xName(ws, r, g.x);
    _xNum(ws, r, 4, g.kalt); _xNum(ws, r, 5, g.rate);
    _xNum(ws, r, 6, _xF('D' + r + '-E' + r, g.cfK), { b: 1 });
    _xNum(ws, r, 7, g.nk); _xNum(ws, r, 8, g.hk);
    _xNum(ws, r, 9, _xF('F' + r + '+G' + r + '-H' + r, g.cfW), { b: 1 });
    r++;
  }
  const last = r - 1, S = k => d.general.reduce((s, g) => s + (g[k] || 0), 0);
  [['kalt', 4], ['rate', 5], ['cfK', 6], ['nk', 7], ['hk', 8], ['cfW', 9]]       // sums above the header, like your sheet
    .forEach(([k, c]) => _xNum(ws, 5, c, _xF('SUM(' + _xA(7, c) + ':' + _xA(last, c) + ')', S(k)), { b: 1, bd: false }));
  _xWidths(ws, [3, 7.1, 22, 13.6, 13.6, 16.7, 13.6, 18, 16.7]);
}

async function cxRepBuildXlsx(d) {
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'Controlling'; wb.created = new Date();
  const map = { 'Dashboard YEAR': _xSheetYear, 'Dashboard MONTHS': _xSheetMonths, 'Income': _xSheetIncome, 'Expense': _xSheetExpense,
                'Expense Castel': _xSheetCastel, 'Expense One Time': _xSheetOneOff, 'General': _xSheetGeneral };
  for (const s of d.sheets) map[s](wb, d);
  return wb.xlsx.writeBuffer();
}

/* ══ POP-UP ═════════════════════════════════════════════════════
   One modal in the shared pop-up look (cc-modal, restyled by cc-mgmt.css:
   bottom sheet on the iPhone, centred window on iPad / laptop).
   The file is prepared as soon as the pop-up opens or a choice changes;
   the button then hands it over at once (iPhone share sheet / download). */
const _cxRep = { file: null, key: '', busy: '', err: '' };
const CXR_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

(function () {
  if (typeof document === 'undefined' || document.getElementById('cxr-css')) return;
  const s = document.createElement('style');
  s.id = 'cxr-css';
  s.textContent = `
    .cxr-btn { margin-top:12px; }
    .cxr-sheet .cc-modal-body { padding:14px 20px 4px; }
    .cxr-sub { font-size:12px; color:var(--cc-taupe,#9A8E7E); margin-top:2px; }
    .cxr-form { display:flex; flex-direction:column; gap:8px; font-family:'Inter',system-ui,sans-serif; }
    .cxr-form .cx-set__k { margin-top:4px; }
    .cxr-info { margin-top:4px; line-height:1.45; }
    .cxr-info b { font-weight:500; color:var(--cx-ink,#3D3027); }
    .cxr-foot { display:flex; justify-content:flex-end; gap:8px; padding:14px 20px 16px; flex-shrink:0; }`;
  (document.head || document.documentElement).appendChild(s);
})();

function _cxRepKey() { return window._ctrl.year + '|' + CX.rep.scope + '|' + CX.rep.fmt; }

function _cxRepHTML() {
  const y = window._ctrl.year, R = CX.rep, pdf = R.fmt === 'pdf';
  const chip = (act, v, label, on) => '<button class="cx-chip' + (on ? ' on' : '') + '" data-cxr="' + act + '" data-v="' + v + '">' + label + '</button>';
  const sheets = cxRepSheets(R.scope).map(s => s.replace(/ /g, '\u00a0')).join(' · ');
  const name = cxRepFileName(y, R.scope, pdf ? 'pdf' : 'xlsx');
  const ready = !pdf && _cxRep.file && _cxRep.key === _cxRepKey();
  const state = _cxRep.err ? ' · <span style="color:var(--cx-neg,#A0533A)">' + cxEsc(_cxRep.err) + '</span>'
    : pdf ? ' · A4 landscape · comes with the next step'
    : ready ? ' · ' + cxRepSheets(R.scope).length + ' sheets like your Excel' : ' · preparing …';
  return '<div class="cc-modal-sheet cxr-sheet" role="dialog" aria-modal="true" aria-label="Export ' + y + '">' +
    '<div class="cc-modal-hdr"><div><div class="cc-modal-title">Export ' + y + '</div>' +
      '<div class="cxr-sub">Whole year · Stand ' + cxFmtDate(cxToday()) + '</div></div>' +
      '<button class="cc-modal-close" data-cxr="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
    '<div class="cc-modal-body"><div class="cxr-form">' +
      '<div class="cx-set__k">Format</div><div class="cx-chips">' + chip('fmt', 'pdf', 'PDF (A4)', pdf) + chip('fmt', 'xlsx', 'Excel', !pdf) + '</div>' +
      '<div class="cx-set__k">Properties</div><div class="cx-chips">' +
        chip('scope', 'all', 'All properties', R.scope === 'all') + chip('scope', 'r', 'Rentals', R.scope === 'r') + chip('scope', 'c', 'Casa Castel', R.scope === 'c') + '</div>' +
      '<div class="cx-r__sub cxr-info"><b>' + cxEsc(name) + '</b>' + state + '<br>' + sheets + '</div>' +
    '</div></div>' +
    '<div class="cxr-foot"><button class="cx-btn cx-btn--p" data-cxr="go">' + (pdf ? 'Create PDF' : 'Export Excel') + '</button></div>' +
  '</div>';
}
function _cxRepPaint() { const ov = document.getElementById('cxRepOv'); if (ov) ov.innerHTML = _cxRepHTML(); }

function cxReportOpen() {
  let ov = document.getElementById('cxRepOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cxRepOv'; ov.className = 'cc-modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', _cxRepClick);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('open')) cxReportClose(); });
  }
  _cxRep.file = null; _cxRep.key = ''; _cxRep.err = '';     // fresh data every time it opens
  _cxRepPaint();
  ov.classList.add('open');
  _cxRepPrepare();
}
function cxReportClose() {
  document.getElementById('cxRepOv')?.classList.remove('open');
  _cxRep.file = null; _cxRep.key = ''; _cxRep.busy = ''; _cxRep.err = '';
}

/* load the library and prepare the file for the current choice (in the background) */
async function _cxRepPrepare() {
  if (CX.rep.fmt !== 'xlsx') return;
  const key = _cxRepKey();
  if ((_cxRep.file && _cxRep.key === key) || _cxRep.busy === key) return;
  _cxRep.busy = key; _cxRep.err = '';
  try {
    if (!window.ExcelJS) await _cxLoadScript(CX_EXCELJS_URL);
    const d = cxRepData(CX.rep.scope);
    if (!d.props.length) throw new Error('No property in ' + d.y);
    const buf = await cxRepBuildXlsx(d);
    if (_cxRep.busy !== key) return;                          // the choice changed meanwhile
    const name = cxRepFileName(d.y, CX.rep.scope, 'xlsx');
    _cxRep.file = typeof File === 'function' ? new File([buf], name, { type: CXR_XLSX_MIME }) : new Blob([buf], { type: CXR_XLSX_MIME });
    _cxRep.file.cxName = name;
    _cxRep.key = key;
  } catch (e) {
    console.error('[controlling] export', e);
    if (_cxRep.busy === key) _cxRep.err = String((e && e.message) || e).slice(0, 80);
  } finally {
    if (_cxRep.busy === key) _cxRep.busy = '';
    if (document.getElementById('cxRepOv')?.classList.contains('open')) _cxRepPaint();
  }
}

function _cxRepClick(ev) {
  const ov = ev.currentTarget;
  if (ev.target === ov) return cxReportClose();             // tap on the dimmed background
  const b = ev.target.closest('[data-cxr]');
  if (!b) return;
  const a = b.dataset.cxr;
  if (a === 'close') return cxReportClose();
  if (a === 'fmt' || a === 'scope') {
    CX.rep[a] = b.dataset.v;
    _cxRep.err = '';
    _cxRepPaint();
    return _cxRepPrepare();
  }
  if (a === 'go') return _cxRepGo();
}

/* Hand the file over — nothing is awaited before the share sheet, so the iPhone allows it */
function _cxRepGo() {
  const say = t => { if (typeof ctlToast === 'function') ctlToast(t); };
  if (CX.rep.fmt === 'pdf') { say('PDF comes with the next step'); return; }
  const f = _cxRep.file;
  if (!f || _cxRep.key !== _cxRepKey()) {
    say(_cxRep.err ? 'Export failed – ' + _cxRep.err : 'Excel wird vorbereitet … bitte gleich noch einmal tippen');
    if (!_cxRep.busy) _cxRepPrepare();
    return;
  }
  const name = f.cxName || cxRepFileName(window._ctrl.year, CX.rep.scope, 'xlsx');
  if (typeof File === 'function' && f instanceof File && navigator.canShare && navigator.canShare({ files: [f] })) {
    navigator.share({ files: [f], title: name }).then(() => cxReportClose()).catch(e => {
      if (e && e.name === 'AbortError') return;               // share sheet closed — the pop-up stays
      _cxRepDownload(f, name);
    });
    return;
  }
  _cxRepDownload(f, name);
}
function _cxRepDownload(f, name) {
  const url = URL.createObjectURL(f), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (typeof ctlToast === 'function') ctlToast(name + ' exportiert');
  cxReportClose();
}
