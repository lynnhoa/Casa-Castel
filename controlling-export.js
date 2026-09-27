/* ─────────────────────────────────────────────────────────────
   CONTROLLING — EXCEL EXPORT (One-off invoices of one year)
   controlling-export.js

   One file per year: Rechnungen_2026.xlsx
   · one sheet per property (only properties with invoices)
   · columns: Produkt · Geschäft · Preis · Rechnungsdatum
   · sorted by Rechnungsdatum, total at the bottom
   · Preis is a real number (€ format), Rechnungsdatum a real date (TT.MM.JJJJ)
   · Rein (refund) → negative Preis, so the total is what you really paid
   · NK / Hausgeld Abrechnungen are not included
   The Excel library (SheetJS) is loaded in the background when One-off opens,
   so the tap on "Excel export" can open the share sheet right away (iPhone).
   ───────────────────────────────────────────────────────────── */

'use strict';

const CX_XLSX_URL = window.CX_XLSX_URL || 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let _cxXlsxLoading = null;

function cxXlsxPreload() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_cxXlsxLoading) return _cxXlsxLoading;
  _cxXlsxLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CX_XLSX_URL;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { _cxXlsxLoading = null; reject(new Error('Excel-Bibliothek konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return _cxXlsxLoading;
}

/* Sheet names: max 31 characters, none of  [ ] : * ? / \  and unique */
function _cxSheetName(name, used) {
  let n = String(name || 'Objekt').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Objekt';
  let base = n, i = 2;
  while (used.has(n.toLowerCase())) { const suf = ' (' + i++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase());
  return n;
}

/* Build the workbook for a year → { wb, count, name } */
function cxBuildInvoiceWorkbook(year) {
  const X = window.XLSX;
  const rows = (window._ctrl.one_time || []).filter(o =>
    !(typeof CX_ABR_KINDS !== 'undefined' && CX_ABR_KINDS.includes(o.kind)) && Number(String(o.invoice_date || '').slice(0, 4)) === year);
  const wb = X.utils.book_new();
  const used = new Set();
  const order = window._ctrl.properties.slice().sort((a, b) => (b.active === a.active ? 0 : a.active ? -1 : 1) || a.id - b.id);
  let count = 0;
  for (const p of order) {
    const list = rows.filter(o => Number(o.property_id) === p.id)
      .sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || (Number(a.id) || 0) - (Number(b.id) || 0));
    if (!list.length) continue;
    count += list.length;
    const aoa = [['Produkt', 'Geschäft', 'Preis', 'Rechnungsdatum']];
    for (const o of list) {
      const d = String(o.invoice_date).slice(0, 10);
      const price = (Number(o.direction) === 1 ? -1 : 1) * (Number(o.amount) || 0);
      aoa.push([o.item || '', o.company || '', Math.round(price * 100) / 100, new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))]);
    }
    const last = aoa.length;                                     // Excel row number of the last invoice
    aoa.push([]);
    aoa.push(['Summe', '', null, '']);
    const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true });
    // total as a formula, so it stays right when the file is edited in Excel
    const tot = X.utils.encode_cell({ r: last + 1, c: 2 });
    ws[tot] = { t: 'n', f: 'SUM(C2:C' + last + ')', v: list.reduce((s, o) => s + (Number(o.direction) === 1 ? -1 : 1) * (Number(o.amount) || 0), 0) };
    // formats: € for Preis, TT.MM.JJJJ for Rechnungsdatum
    for (let r = 1; r <= last + 1; r++) {
      const c = ws[X.utils.encode_cell({ r, c: 2 })]; if (c && c.t === 'n') c.z = '#,##0.00 "€";-#,##0.00 "€"';
      const d = ws[X.utils.encode_cell({ r, c: 3 })]; if (d && (d.t === 'd' || d.t === 'n')) d.z = 'dd.mm.yyyy';
    }
    ws['!cols'] = [{ wch: 36 }, { wch: 24 }, { wch: 12 }, { wch: 15 }];
    ws['!autofilter'] = { ref: 'A1:D' + last };
    X.utils.book_append_sheet(wb, ws, _cxSheetName(p.name, used));
  }
  return { wb, count, name: 'Rechnungen_' + year + '.xlsx' };
}

/* Tap on "Excel export": share sheet on the iPhone (save to Files, Mail …), download elsewhere */
async function cxExportInvoices(year) {
  const say = t => { if (typeof ctlToast === 'function') ctlToast(t); };
  if (!window.XLSX) {                                            // not loaded yet: load, then ask for one more tap
    say('Excel wird vorbereitet …');
    try { await cxXlsxPreload(); say('Bereit – bitte noch einmal auf „Excel export“ tippen'); }
    catch (e) { say(e.message + ' – Internetverbindung prüfen'); }
    return;
  }
  const { wb, count, name } = cxBuildInvoiceWorkbook(year);
  if (!count) { say('Keine Rechnungen in ' + year); return; }
  const data = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const file = typeof File === 'function' ? new File([data], name, { type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }      // closed the share sheet → nothing to do
  }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  say(count + (count === 1 ? ' Rechnung' : ' Rechnungen') + ' exportiert');
}
