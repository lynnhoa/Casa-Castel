/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EXPORT (One-off invoices of one year): Excel · PDF A4
   controlling-export.js

   Export panel in One-off: Format (Excel · PDF) · Objekte (alle · eines)
   Both formats come from ONE data function (cxInvoiceData) → identical numbers:
     Nr. · Produkt · Geschäft · Preis · Rechnungsdatum
     · sorted by Rechnungsdatum, Nr. = 1, 2, 3 … per property in that order
     · Rein (refund) → negative Preis · NK / Hausgeld Abrechnungen are not included
   Excel  Rechnungen_2026[_Objekt].xlsx — one sheet per property, Summe as formula,
          € format, real dates, filter; iPhone share sheet
   PDF    Rechnungen_2026[_Objekt].pdf — A4 portrait, real text (sharp, small,
          searchable): overview page (all properties), then one page per property,
          column heads repeat on every page, "Seite x von y".
          Opens like the contracts (pdf-open.js): iPhone viewer on top of the app;
          installed app → "Open PDF" + "Save / Share" appear in place of the button.
   Libraries load in the background when the panel opens, so the tap can open
   the viewer / share sheet right away (iPhone only allows that from a tap).
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX_XLSX_URL   = window.CX_XLSX_URL   || 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const CX_JSPDF_URL  = window.CX_JSPDF_URL  || 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const CX_ATABLE_URL = window.CX_ATABLE_URL || 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const _cxLibs = {};
function _cxLoadScript(url) {
  if (_cxLibs[url]) return _cxLibs[url];
  _cxLibs[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => { delete _cxLibs[url]; reject(new Error('Bibliothek konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return _cxLibs[url];
}
function cxXlsxPreload() { return window.XLSX ? Promise.resolve() : _cxLoadScript(CX_XLSX_URL); }
function cxPdfPreload() {
  const ready = () => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable;
  if (ready()) return Promise.resolve();
  return (window.jspdf ? Promise.resolve() : _cxLoadScript(CX_JSPDF_URL)).then(() => ready() ? null : _cxLoadScript(CX_ATABLE_URL));
}
const _cxPdfReady = () => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable);

/* ── the one data source for Excel and PDF ── */
function cxInvoiceData(year, pid) {
  const rows = (window._ctrl.one_time || []).filter(o =>
    !(typeof CX_ABR_KINDS !== 'undefined' && CX_ABR_KINDS.includes(o.kind)) && Number(String(o.invoice_date || '').slice(0, 4)) === year &&
    (!pid || Number(o.property_id) === Number(pid)));
  const order = window._ctrl.properties.slice().sort((a, b) => (b.active === a.active ? 0 : a.active ? -1 : 1) || a.id - b.id);
  const groups = [];
  for (const p of order) {
    const list = rows.filter(o => Number(o.property_id) === p.id)
      .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || (Number(a.id) || 0) - (Number(b.id) || 0));
    if (!list.length) continue;
    // Kaufnebenkosten (Notar, Grundbuch, Grunderwerbsteuer, Makler) get their own list and sum: part of the purchase
    const mk = arr => { let nr = 0, total = 0;
      const items = arr.map(o => {
        const price = Math.round((Number(o.direction) === 1 ? -1 : 1) * (Number(o.amount) || 0) * 100) / 100;
        total += price;
        return { nr: ++nr, item: o.item || '', company: o.company || '', price, date: String(o.invoice_date).slice(0, 10) };
      });
      return { items, total: Math.round(total * 100) / 100 }; };
    const reg = mk(list.filter(o => o.kind !== 'Kaufnebenkosten')), knk = mk(list.filter(o => o.kind === 'Kaufnebenkosten'));
    groups.push({ p, items: reg.items, total: reg.total, knk: knk.items, knkTotal: knk.total });
  }
  return groups;
}
/* properties that have invoices in the year (for the Objekte choice) */
function cxInvoiceProps(year) { return cxInvoiceData(year, null).map(g => g.p); }

function _cxExportName(year, pid, ext) {
  const p = pid ? ctlProp(Number(pid)) : null;
  const base = ['Rechnungen', year, p ? p.name : ''].filter(Boolean).join('_');
  return base.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') + '.' + ext;
}
const _cxSay = t => { if (typeof ctlToast === 'function') ctlToast(t); };

/* ── EXCEL ─────────────────────────────────────────────────── */
function _cxSheetName(name, used) {
  let n = String(name || 'Objekt').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Objekt';
  const base = n; let i = 2;
  while (used.has(n.toLowerCase())) { const suf = ' (' + i++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase());
  return n;
}
function cxBuildInvoiceWorkbook(year, pid) {
  const X = window.XLSX, wb = X.utils.book_new(), used = new Set();
  const groups = cxInvoiceData(year, pid);
  let count = 0;
  for (const g of groups) {
    count += g.items.length + g.knk.length;
    const dt = d => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
    const aoa = [['Nr.', 'Produkt', 'Geschäft', 'Preis', 'Rechnungsdatum']];
    for (const it of g.items) aoa.push([it.nr, it.item, it.company, it.price, dt(it.date)]);
    const last = aoa.length;
    aoa.push([]);
    aoa.push(['', 'Summe', '', null, '']);
    let kFirst = 0, kLast = 0;
    if (g.knk.length) {                                              // Kaufnebenkosten: own block, own sum (not in the Summe above)
      aoa.push([]);
      aoa.push(['', 'Kaufnebenkosten (Anschaffungsnebenkosten, nicht im Cashflow)', '', '', '']);
      kFirst = aoa.length + 1;
      for (const it of g.knk) aoa.push([it.nr, it.item, it.company, it.price, dt(it.date)]);
      kLast = aoa.length;
      aoa.push(['', 'Summe Kaufnebenkosten', '', null, '']);
    }
    const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws[X.utils.encode_cell({ r: last + 1, c: 3 })] = { t: 'n', f: g.items.length ? 'SUM(D2:D' + last + ')' : '0', v: g.total };
    if (g.knk.length) ws[X.utils.encode_cell({ r: kLast, c: 3 })] = { t: 'n', f: 'SUM(D' + kFirst + ':D' + kLast + ')', v: g.knkTotal };
    for (let r = 1; r < aoa.length; r++) {
      const c = ws[X.utils.encode_cell({ r, c: 3 })]; if (c && c.t === 'n') c.z = '#,##0.00 "€";-#,##0.00 "€"';
      const d = ws[X.utils.encode_cell({ r, c: 4 })]; if (d && (d.t === 'd' || d.t === 'n')) d.z = 'dd.mm.yyyy';
    }
    ws['!cols'] = [{ wch: 5 }, { wch: 36 }, { wch: 24 }, { wch: 12 }, { wch: 15 }];
    ws['!autofilter'] = { ref: 'A1:E' + last };
    X.utils.book_append_sheet(wb, ws, _cxSheetName(g.p.name, used));
  }
  return { wb, count, name: _cxExportName(year, pid, 'xlsx') };
}
async function cxExportInvoices(year, pid) {
  if (!window.XLSX) {
    _cxSay('Excel wird vorbereitet …');
    try { await cxXlsxPreload(); _cxSay('Bereit – bitte noch einmal tippen'); } catch (e) { _cxSay(e.message + ' – Internet prüfen'); }
    return;
  }
  const { wb, count, name } = cxBuildInvoiceWorkbook(year, pid);
  if (!count) { _cxSay('Keine Rechnungen in ' + year); return; }
  const data = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const file = typeof File === 'function' ? new File([data], name, { type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  _cxSay(count + (count === 1 ? ' Rechnung' : ' Rechnungen') + ' exportiert');
}

/* ── PDF (A4 portrait, real text) ─────────────────────────── */
const _CX_PDF = { ink: [61, 48, 39], txt: [58, 53, 48], mut: [154, 142, 126], line: [232, 226, 216], head: [243, 238, 230], acc: [184, 151, 106], neg: [165, 80, 56] };
// standard PDF fonts only know Latin-1 (+ €): no narrow spaces, typographic quotes are replaced
const _cxPdfTxt = s => String(s == null ? '' : s).replace(/[\u202f\u00a0]/g, ' ').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[^\x20-\x7E\u00A0-\u00FF€–—•…]/g, '');
const _cxPdfEur = n => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const _cxPdfDate = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';

function cxBuildInvoicePdf(year, pid) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const C = _CX_PDF, W = 210, M = 18;
  const groups = cxInvoiceData(year, pid);
  const stand = _cxPdfDate(cxToday());
  const single = pid ? ctlProp(Number(pid)) : null;
  const titleOf = () => 'Rechnungen ' + year + (single ? ' · ' + single.name : '');

  const pageTitle = (t, sub) => {
    doc.setFont('times', 'normal'); doc.setFontSize(22); doc.setTextColor(...C.ink);
    doc.text(_cxPdfTxt(t), M, 34);
    if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C.mut); doc.text(_cxPdfTxt(sub), M, 41); }
  };
  const table = (startY, head, body, foot, colStyles) => doc.autoTable({
    startY, head: [head], body, foot: foot ? [foot] : undefined, showFoot: 'lastPage',
    margin: { left: M, right: M, top: 26, bottom: 20 },
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: C.txt, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, lineColor: C.line, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' },
    headStyles: { fillColor: C.head, textColor: C.mut, fontStyle: 'bold', fontSize: 7.5, lineWidth: 0 },
    footStyles: { fontStyle: 'bold', textColor: C.ink, fontSize: 9.5, lineWidth: { top: 0.4 }, lineColor: C.acc },
    columnStyles: colStyles,
    didParseCell: d => {
      const cs = colStyles[d.column.index];
      if (cs && cs.halign && d.section !== 'body') d.cell.styles.halign = cs.halign;          // heads + Summe line up with their column
      if (d.section === 'body' && d.column.index === (head.length === 5 ? 3 : 2) && String(d.cell.raw).startsWith('-')) d.cell.styles.textColor = C.neg;
    },
  });

  // Page 1 · overview (all properties) — a single-property export starts with its table
  if (!single) {
    pageTitle('Rechnungen ' + year, 'Alle Objekte · Stand ' + stand);
    const tot = groups.reduce((s, g) => s + g.total, 0), n = groups.reduce((s, g) => s + g.items.length, 0);
    const kTot = groups.reduce((s, g) => s + g.knkTotal, 0), hasK = groups.some(g => g.knk.length);
    if (hasK) table(50, ['Objekt', 'Rechnungen', 'Summe', 'Kaufnebenkosten'],
      groups.map(g => [_cxPdfTxt(g.p.name), String(g.items.length), _cxPdfEur(g.total), g.knk.length ? _cxPdfEur(g.knkTotal) : '–']),
      ['Gesamt', String(n), _cxPdfEur(tot), _cxPdfEur(kTot)],
      { 1: { halign: 'right', cellWidth: 26 }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 36 } });
    else table(50, ['Objekt', 'Rechnungen', 'Summe'],
      groups.map(g => [_cxPdfTxt(g.p.name), String(g.items.length), _cxPdfEur(g.total)]),
      ['Gesamt', String(n), _cxPdfEur(tot)],
      { 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 38 } });
    if (hasK) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.mut);
      doc.text(_cxPdfTxt('Kaufnebenkosten (Notar, Grundbuch, Grunderwerbsteuer, Makler) sind Anschaffungsnebenkosten und in der Summe nicht enthalten.'),
        M, doc.lastAutoTable.finalY + 8, { maxWidth: W - 2 * M });
    }
  }
  const pageProp = {};                                    // page → property (continuation pages keep its name in the header)
  groups.forEach((g, i) => {
    if (!single || i > 0) doc.addPage();
    const first = doc.getNumberOfPages();
    pageTitle(g.p.name, [g.items.length ? g.items.length + (g.items.length === 1 ? ' Rechnung' : ' Rechnungen') : '',
      g.knk.length ? g.knk.length + ' Kaufnebenkosten' : '', String(year), 'Stand ' + stand].filter(Boolean).join(' · '));
    const cols = { 0: { cellWidth: 11, textColor: C.mut }, 2: { cellWidth: 42 }, 3: { halign: 'right', cellWidth: 27 }, 4: { halign: 'right', cellWidth: 29 } };
    let y = 50;
    if (g.items.length) {
      table(y, ['Nr.', 'Produkt', 'Geschäft', 'Preis', 'Rechnungsdatum'],
        g.items.map(it => [String(it.nr), _cxPdfTxt(it.item), _cxPdfTxt(it.company), _cxPdfEur(it.price), _cxPdfDate(it.date)]),
        ['', 'Summe', '', _cxPdfEur(g.total), ''], cols);
      y = doc.lastAutoTable.finalY + 14;
    }
    if (g.knk.length) {                                    // Kaufnebenkosten: own table, own sum, clearly labelled
      if (y > 235) { doc.addPage(); y = 34; }
      doc.setFont('times', 'normal'); doc.setFontSize(14); doc.setTextColor(...C.ink);
      doc.text('Kaufnebenkosten', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C.mut);
      doc.text(_cxPdfTxt('Anschaffungsnebenkosten · nicht im Cashflow, nicht in der Summe oben'), M, y + 5);
      table(y + 9, ['Nr.', 'Produkt', 'Geschäft', 'Preis', 'Rechnungsdatum'],
        g.knk.map(it => [String(it.nr), _cxPdfTxt(it.item), _cxPdfTxt(it.company), _cxPdfEur(it.price), _cxPdfDate(it.date)]),
        ['', 'Summe Kaufnebenkosten', '', _cxPdfEur(g.knkTotal), ''], cols);
    }
    for (let pg = first; pg <= doc.getNumberOfPages(); pg++) pageProp[pg] = g.p.name;
  });

  // header + footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C.mut);
    const hdr = 'Rechnungen ' + year + (pageProp[i] ? ' · ' + pageProp[i] : '');
    doc.text(_cxPdfTxt(hdr.toUpperCase()), M, 14, { charSpace: 0.6 });
    doc.text('Stand ' + stand, W - M, 14, { align: 'right' });
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(M, 17, W - M, 17);
    doc.text(_cxPdfTxt(titleOf()) + ' · Seite ' + i + ' von ' + pages, W / 2, 287, { align: 'center' });
  }
  return { doc, count: groups.reduce((s, g) => s + g.items.length + g.knk.length, 0), name: _cxExportName(year, pid, 'pdf') };
}

/* Tap on "PDF erstellen" (btn = the tapped button; its parent gets "Open PDF" + "Save / Share" in the installed app) */
async function cxExportInvoicesPdf(year, pid, btn) {
  if (typeof window.sbL === 'undefined' && typeof _ctlSupa !== 'undefined') window.sbL = _ctlSupa;   // pdf-open.js uses sbL (temp storage)
  if (!_cxPdfReady()) {
    _cxSay('PDF wird vorbereitet …');
    try { await cxPdfPreload(); _cxSay('Bereit – bitte noch einmal tippen'); } catch (e) { _cxSay(e.message + ' – Internet prüfen'); }
    return;
  }
  const pre = cxInvoiceData(year, pid);
  if (!pre.length) { _cxSay('Keine Rechnungen in ' + year); return; }
  const viaViewer = typeof ccOpenPdf === 'function';
  if (viaViewer) {                                        // same behaviour as the contracts
    try { _ccLastTrigger = btn || null; } catch (e) {}
    if (typeof CC_STANDALONE !== 'undefined' && !CC_STANDALONE && typeof _ccOpenWaitingTab === 'function') _ccOpenWaitingTab();   // still inside the tap
  }
  let out;
  try { out = cxBuildInvoicePdf(year, pid); }
  catch (e) { if (typeof _ccCloseWaitingTab === 'function') _ccCloseWaitingTab(); _cxSay('PDF fehlgeschlagen: ' + (e.message || e)); return; }
  if (viaViewer) { await ccOpenPdf(out.doc, out.name); return; }
  const blob = out.doc.output('blob');                    // without pdf-open.js: share sheet / download
  const file = typeof File === 'function' ? new File([blob], out.name, { type: 'application/pdf' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: out.name }); } catch (e) {} return; }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = out.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
