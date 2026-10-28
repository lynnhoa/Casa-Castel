/* ─────────────────────────────────────────────────────────────
   MAINTENANCE — COST OVERVIEW PDFs (D12)
   maint-cost-pdf.js

   · Rechnungsübersicht <Jahr> (summary row › year › PDF): every receipt /
     invoice / return of the tab dated in that year — each line counts in
     the year of its own date (= Controlling) · per property (purchase
     order) → per entry with its subtotal · totals on top, Gesamt at the end
   · Kostenübersicht – <Eintrag> (PDF next to the title): all receipts,
     invoices and returns of one entry · Selbst gekauft / Dienstleister
     like the app · returns under their receipt with Netto · split per
     year when the entry spans more than one
   · D27: first column “Nr.” = your own No. (bold); “Beleg-Nr.” → “Beleg-/Bestell-Nr.”
   · D29: “Nr.” = the automatic number (R1.2 · S1.1 · a return R1.2.1), everything in number
     order; a receipt without a file says “keine Datei”. The Kostenübersicht is one list in
     number order (the Selbst gekauft / Dienstleister subtotals stay on top).
     “Invoices”: only the invoice files, in exactly the list's order, each with its number.
   Same frame as the Schadensbericht (A4, beige header, Playfair Display +
   Lato, footer); pdf-open.js flows long tables onto the next page (the
   table header repeats). Opened directly, not saved in Documents.
   ───────────────────────────────────────────────────────────── */

'use strict';

const mtCpSpan = c => {
  const a = mtDate(c.case_date), b = mtDate(c.end_date);
  return a && b ? (a === b ? a : a + ' – ' + b) : a ? 'seit ' + a : b ? 'bis ' + b : '';
};
const mtCpByDate = (a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')) ||
  (a.return_of ? 1 : 0) - (b.return_of ? 1 : 0) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
const mtCpKindOf = r => (r.return_of ? (mtCostById(r.return_of) || r).kind : r.kind);
const mtCpSigned = r => (r.return_of ? -1 : 1) * Math.abs(Number(r.amount) || 0);
const mtCpSum = rows => rows.reduce((s, r) => s + mtCpSigned(r), 0);

/* one cost row → one table line (a return names its receipt) */
function mtCpLine(r) {
  if (!r.return_of) return { id: r.id, own: mtCostNo(r.id), nofile: !mtCostFiles(r.id).length, no: r.receipt_no || '', desc: r.description || '', who: r.brand || '', amt: mtCpSigned(r), date: r.cost_date };
  const p = mtCostById(r.return_of), pk = (p || r).kind === 'provider';
  return {
    id: r.id, ret: true, own: mtCostNo(r.id), no: 'Rückgabe' + (r.receipt_no ? ' · Bon ' + r.receipt_no : ''),
    desc: ['zu ' + (pk ? 'Rechnung' : 'Beleg') + (p && p.receipt_no ? ' ' + p.receipt_no : ''), r.description].filter(Boolean).join(' · '),
    who: p ? p.brand || '' : '', amt: mtCpSigned(r), date: r.cost_date,
  };
}
function mtCpTotals(rows) {
  const self = rows.filter(r => mtCpKindOf(r) === 'self'), prov = rows.filter(r => mtCpKindOf(r) === 'provider');
  const rets = rows.filter(r => r.return_of);
  return [
    ['Gesamt', mtEur(mtCpSum(rows))],
    self.length ? ['Selbst gekauft', mtEur(mtCpSum(self))] : null,
    prov.length ? ['Dienstleister', mtEur(mtCpSum(prov))] : null,
    rets.length ? ['Rückgaben', '\u2212' + mtEur(Math.abs(mtCpSum(rets)))] : null,
    ['Belege', String(rows.filter(r => !r.return_of).length)],
  ].filter(Boolean);
}

/* Rechnungsübersicht: one tab, one year */
function mtCpYearData(kind, year) {
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const stand = mtDate(ccTodayISO()), y = String(year);
  const cases = MT.cases.filter(c => c.kind === kind);
  const all = MT.costs.filter(r => cases.some(c => String(c.id) === String(r.case_id)) && String(r.cost_date || '').slice(0, 4) === y);
  const groups = mtGroups(kind).map(g => {
    const ents = g.cases.slice().sort(mtCaseCmp).map(c => {             // D29: R1, R2 … in number order
      const rows = all.filter(r => String(r.case_id) === String(c.id)).sort(mtNoCmp);
      return { title: [mtCaseNo(c), c.title].filter(Boolean).join(' · '), span: mtCpSpan(c), lines: rows.map(mtCpLine), sum: mtCpSum(rows) };
    }).filter(e => e.lines.length);
    return { name: g.name, ents, sum: ents.reduce((s, e) => s + e.sum, 0) };
  }).filter(g => g.ents.length);
  return {
    mode: 'year', family: 'rentals', wordmark: MT_KIND[kind].title, rl: 'Jahr', rv: y,
    title: 'Rechnungsübersicht ' + y, subtitle: [MT_KIND[kind].title, 'alle Objekte', 'Stand ' + stand].join(' · '),
    cols: ['Beleg-/Bestell-Nr.', 'Beschreibung', 'Geschäft / Dienstleister'],
    totals: mtCpTotals(all), groups, gesamt: mtEur(mtCpSum(all)), footer: S.vermieter_name || '',
    fileName: ccPdfFileName('Rechnungsuebersicht', MT_KIND[kind].title, y, 'Stand ' + stand),
  };
}

/* Kostenübersicht: one entry, all years */
function mtCpEntryData(c) {
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const stand = mtDate(ccTodayISO());
  const casa = mtIsCasa(c.property_id), apt = casa ? null : mtSbApt(c);
  const rows = MT.costs.filter(r => String(r.case_id) === String(c.id));
  // D29: one list in number order (= the order of the Invoices PDF); returns under their receipt, then Netto
  const lines = [];
  rows.filter(r => !r.return_of).sort(mtNoCmp).forEach(r => {
    lines.push(mtCpLine(r));
    const rets = rows.filter(x => String(x.return_of) === String(r.id)).sort(mtNoCmp);
    if (rets.length) { rets.forEach(x => lines.push(mtCpLine(x))); lines.push({ net: true, amt: mtCpSigned(r) + mtCpSum(rets) }); }
  });
  const blocks = lines.length ? [{ title: [mtCaseNo(c), 'Belege'].filter(Boolean).join(' · '),
    cols: ['Beleg-/Rechnungs-Nr.', 'Beschreibung / Leistung', 'Geschäft / Dienstleister'], lines, sum: mtCpSum(rows) }] : [];
  const totals = mtCpTotals(rows);
  const years = [...new Set(rows.map(r => String(r.cost_date || '').slice(0, 4)).filter(Boolean))].sort();
  if (years.length > 1) totals.splice(1, 0, ['davon', years.map(y => y + ': ' + mtEur(mtCpSum(rows.filter(r => String(r.cost_date || '').startsWith(y))))).join(' · ')]);
  const room = casa ? c.report_room : '';
  const nr = apt && apt.wohnungsnummer ? String(apt.wohnungsnummer).trim() : '';
  const name = casa ? 'Casa Castel' : ((apt && apt.name) || mtPropName(c));
  return {
    mode: 'entry', family: casa ? 'casa' : 'rentals', wordmark: name,
    rl: casa ? (room ? (room === MT_SB_ALL ? 'Bereich' : 'Zimmer') : '') : (nr ? 'Wohnung' : ''),
    rv: casa ? mtRoomLabel(room) : nr,
    title: 'Kostenübersicht – ' + c.title, subtitle: [mtCaseLabel(c), MT_KIND[c.kind].one, mtCpSpan(c), 'Stand ' + stand].filter(Boolean).join(' · '),
    totals, blocks, gesamt: mtEur(mtCpSum(rows)),
    footer: casa ? [S.objekt_adresse, S.objekt_plz_ort].filter(Boolean).join(', ') : (apt ? [apt.adresse, apt.plz_ort].filter(Boolean).join(', ') : ''),
    fileName: ccPdfFileName('Kostenuebersicht', c.title, 'Stand ' + stand),
  };
}

function mtCostPdfHTML(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const R = d.family === 'rentals';
  const F = R ? { lbl: 700, ftr: '#c9c2b8', sec: '#c9c2b8' } : { lbl: 400, ftr: '#e8dbc5', sec: '#d8d3cc' };
  const amt = v => (v < 0 ? '\u2212' + mtEur(Math.abs(v)) : mtEur(v));
  const CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:#ffffff; }
    .pdf-page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da;
      display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#6e5128; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:${F.lbl}; letter-spacing:0.16em; text-transform:uppercase; color:#8a6535; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#6e5128; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid ${F.ftr}; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:400; color:#6b645c; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#6b645c; margin-bottom:14px; }
    .sum { display:flex; flex-wrap:wrap; gap:6px 26px; padding:10px 0 12px; border-top:0.6px solid ${F.sec}; border-bottom:0.6px solid ${F.sec}; }
    .sum__k { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#8a6535; line-height:1; }
    .sum__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:#1a1a1a; margin-top:5px; line-height:1.2; }
    .sec { display:flex; justify-content:space-between; align-items:baseline; font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700;
      letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:18px; padding-top:2px; padding-bottom:5px; border-bottom:0.6px solid ${F.sec}; }
    .sec__r { letter-spacing:0.04em; color:#1a1a1a; }
    table.t { width:100%; border-collapse:collapse; table-layout:fixed; font-family:'Lato',sans-serif; font-size:10.5px; color:#1a1a1a; }
    table.t th { text-align:left; font-size:7px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#6b645c;
      padding:7px 8px 5px 0; border-bottom:0.5px solid #d9d3cb; }
    table.t td { padding:5px 8px 5px 0; border-bottom:0.4px solid #ece7e0; vertical-align:top; line-height:1.4; overflow-wrap:anywhere; }
    table.t .n { text-align:right; white-space:nowrap; padding-right:0; }
    table.t td.own { font-weight:700; }
    table.t td.own .nf { display:block; font-size:7px; font-weight:400; letter-spacing:0.04em; color:#a39a8e; }
    table.t .d { white-space:nowrap; padding-left:10px; padding-right:0; text-align:right; }
    table.t tr.ret td { color:#3f6b35; }
    table.t tr.net td { font-style:italic; color:#6b645c; border-bottom:0.5px solid #d9d3cb; }
    table.t tr.grp td { padding-top:11px; font-weight:700; color:#2b2722; border-bottom:0.5px solid #d9d3cb; }
    table.t tr.grp td span { font-weight:400; color:#6b645c; margin-left:6px; }
    .total { display:flex; justify-content:space-between; margin-top:16px; padding-top:8px; border-top:1px solid #6e5128;
      font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:#1a1a1a; }
    .tab { display:flex; justify-content:space-between; align-items:baseline; margin-top:24px; padding-bottom:6px; border-bottom:1px solid #6e5128;
      font-family:'Lato',sans-serif; font-size:9px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#6e5128; }
    .empty { margin-top:16px; font-family:'Lato',sans-serif; font-size:11px; color:#6b645c; }
  `;
  const colg = '<colgroup><col style="width:10%"><col style="width:15%"><col><col style="width:19%"><col style="width:12%"><col style="width:12%"></colgroup>';
  const head = cols => `<tr><th>Nr.</th><th>${esc(cols[0])}</th><th>${esc(cols[1])}</th><th>${esc(cols[2])}</th><th class="n">Betrag</th><th class="d">Datum</th></tr>`;
  const line = l => l.net
    ? `<tr class="net"><td></td><td></td><td>Netto</td><td></td><td class="n">${amt(l.amt)}</td><td class="d"></td></tr>`
    : `<tr${l.ret ? ' class="ret"' : ''}><td class="own">${esc(l.own)}${l.nofile ? '<span class="nf">keine Datei</span>' : ''}</td><td>${esc(l.no)}</td><td>${esc(l.desc)}</td><td>${esc(l.who)}</td><td class="n">${amt(l.amt)}</td><td class="d">${esc(mtDate(l.date))}</td></tr>`;
  let body = '';
  const yg = groups => groups.map(g => `<div class="sec"><span>${esc(g.name)}</span><span class="sec__r">${amt(g.sum)}</span></div>
      <table class="t">${colg}${head(d.cols)}${g.ents.map(e =>
        `<tr class="grp"><td colspan="4">${esc(e.title)}${e.span ? `<span>${esc(e.span)}</span>` : ''}</td><td class="n">${amt(e.sum)}</td><td></td></tr>` +
        e.lines.map(line).join('')).join('')}</table>`).join('');
  if (d.mode === 'year2') {                                  // D22: Renovierungen, then Schäden
    body = (d.parts || []).map(pt => `<div class="tab"><span>${esc(pt.title)}</span><span>${amt(pt.sum)}</span></div>` + yg(pt.groups)).join('');
    if (!(d.parts || []).length) body = '<p class="empty">Keine Belege in diesem Jahr.</p>';
  } else if (d.mode === 'year') {
    body = d.groups.map(g => `<div class="sec"><span>${esc(g.name)}</span><span class="sec__r">${amt(g.sum)}</span></div>
      <table class="t">${colg}${head(d.cols)}${g.ents.map(e =>
        `<tr class="grp"><td colspan="4">${esc(e.title)}${e.span ? `<span>${esc(e.span)}</span>` : ''}</td><td class="n">${amt(e.sum)}</td><td></td></tr>` +
        e.lines.map(line).join('')).join('')}</table>`).join('');
    if (!d.groups.length) body = '<p class="empty">Keine Belege in diesem Jahr.</p>';
  } else {
    body = d.blocks.map(b => `<div class="sec"><span>${esc(b.title)}</span><span class="sec__r">${amt(b.sum)}</span></div>
      <table class="t">${colg}${head(b.cols)}${b.lines.map(line).join('')}</table>`).join('');
    if (!d.blocks.length) body = '<p class="empty">Noch keine Belege.</p>';
  }
  return `<style>${CSS}</style>
    <div class="pdf-page">
      <div class="hdr"><span class="hdr__wordmark">${esc(d.wordmark)}</span>
        ${d.rv ? `<div class="hdr__room"><span class="hdr__room-label">${esc(d.rl)}</span><span class="hdr__room-name">${esc(d.rv)}</span></div>` : ''}</div>
      <div class="content">
        <div class="doc-title">${esc(d.title)}</div>
        <div class="doc-subtitle">${esc(d.subtitle)}</div>
        <div class="sum">${d.totals.map(([k, v]) => `<div><div class="sum__k">${esc(k)}</div><div class="sum__v">${esc(v)}</div></div>`).join('')}</div>
        ${body}
        <div class="total"><span>Gesamt</span><span>${esc(d.gesamt)}</span></div>
      </div>
      <div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer)}</span><span>1</span></div></div>
    </div>`;
}

/* Make + open (the button stays in place → the installed app shows "Open PDF" right there) */
async function mtCpMake(btn, build) {
  if (MT.pdfBusy) return;
  MT.pdfBusy = true;
  const keep = btn ? btn.innerHTML : '';
  if (btn) { btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true'); btn.innerHTML = '<span class="mt-spin" aria-hidden="true"></span>' + mtEsc(btn.dataset.label || 'PDF'); }
  let box = null, fix = null;
  try {
    await mtSbLibs();
    await mtSbLoad();
    const d = build();
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
    box.innerHTML = mtCostPdfHTML(d);
    document.body.appendChild(box);
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 250));
    fix = document.createElement('style');
    fix.textContent = 'body > div[style*="visibility: hidden"] > img { display:inline !important; }';
    document.head.appendChild(fix);
    const pdf = await ccRenderPagesToPdf(box, { strict: true, only: true });
    if (btn) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); btn.innerHTML = keep; }
    await ccOpenPdf(pdf, d.fileName);
  } catch (e) {
    console.error('[maintenance] cost PDF:', e);
    if (typeof ccCancelPdf === 'function') ccCancelPdf();
    const m = String((e && e.message) || '');
    mtSay(/did not fit/.test(m) ? m : 'The PDF could not be created. Check the connection and try again.');
  } finally {
    MT.pdfBusy = false;
    if (fix) fix.remove();
    if (box) box.remove();
    if (btn && btn.classList.contains('is-busy')) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); btn.innerHTML = keep; }
  }
}
function mtPdfYear(btn) {                                 // D22: one overview for both tabs
  const y = mtSumYear();
  if (btn && btn.classList.contains('off')) { mtSay(`No receipts in ${y} yet.`); return; }
  return mtCpMake(btn, () => mtCpYearDataAll(y));
}
function mtCpYearDataAll(year) {
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const stand = mtDate(ccTodayISO()), y = String(year);
  const all = MT.costs.filter(r => String(r.cost_date || '').slice(0, 4) === y && MT.cases.some(c => String(c.id) === String(r.case_id)));
  const sumOf = k => mtCpSum(all.filter(r => (mtCase(r.case_id) || {}).kind === k));
  const parts = ['renovierung', 'schaden'].map(k => ({ k, d: mtCpYearData(k, year) })).filter(x => x.d.groups.length)
    .map(x => ({ title: MT_KIND[x.k].title, sum: x.d.groups.reduce((s2, g) => s2 + g.sum, 0), groups: x.d.groups }));
  return {
    mode: 'year2', family: 'rentals', wordmark: 'Maintenance', rl: 'Jahr', rv: y,
    title: 'Rechnungsübersicht ' + y, subtitle: ['Renovierungen und Schäden', 'alle Objekte', 'Stand ' + stand].join(' · '),
    cols: ['Beleg-/Bestell-Nr.', 'Beschreibung', 'Geschäft / Dienstleister'],
    totals: [['Renovierungen', mtEur(sumOf('renovierung'))], ['Schäden', mtEur(sumOf('schaden'))], ['Gesamt', mtEur(mtCpSum(all))], ['Belege', String(all.filter(r => !r.return_of).length)]],
    parts, gesamt: mtEur(mtCpSum(all)), footer: S.vermieter_name || '',
    fileName: ccPdfFileName('Rechnungsuebersicht', y, 'Stand ' + stand),
  };
}
function mtPdfEntry(id, btn) {
  const c = mtCase(id);
  if (!c) return;
  if (btn && btn.classList.contains('off')) { mtSay('No receipts in this entry yet.'); return; }
  return mtCpMake(btn, () => mtCpEntryData(c));
}

/* ─────────────────────────────────────────────────────────────
   D29 · INVOICES — only the invoice files, in exactly the order of the list next to
   the button (Kostenübersicht of a case · Rechnungsübersicht of the year, both tabs):
   each receipt's files one after another (then its returns' files), page 1 of each
   with "Nr. R1.2 · 2026 · <Objekt>" on top — always from the untouched original —
   merged into one PDF. A receipt without a file is left out (its line says
   "keine Datei"); a locked PDF goes in as it is.
   ───────────────────────────────────────────────────────────── */
function mtInvIds(d) {                                      // the list's row ids, in its order
  const ids = [], take = lines => lines.forEach(l => { if (l.id && !l.net) ids.push(String(l.id)); });
  if (d.mode === 'entry') d.blocks.forEach(b => take(b.lines));
  else if (d.mode === 'year2') (d.parts || []).forEach(pt => pt.groups.forEach(g => g.ents.forEach(e => take(e.lines))));
  else (d.groups || []).forEach(g => g.ents.forEach(e => take(e.lines)));
  return ids;
}
async function mtInvImagePdf(L, bytes, path) {             // a photo / image of an invoice → one A4 page
  const doc = await L.PDFDocument.create();
  const img = /\.png$/i.test(path) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const W = 595.28, H = 841.89, m = 28, s = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height, 1);
  const pg = doc.addPage([W, H]);
  pg.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
  return doc.save();
}
async function mtInvMake(btn, build) {
  if (MT.pdfBusy) return;
  MT.pdfBusy = true;
  const keep = btn ? btn.innerHTML : '';
  const say = t => { if (btn) btn.innerHTML = '<span class="mt-spin" aria-hidden="true"></span>' + mtEsc(t); };
  if (btn) { btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true'); }
  try {
    say(btn && btn.dataset.label || 'Invoices');
    const d = build(), ids = mtInvIds(d);
    const files = [];
    ids.forEach(id => mtCostFiles(id).slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .forEach(f => files.push({ id, f })));
    if (!files.length) { mtSay('No invoice files here yet.'); return; }
    const L = await mtPdfLib(), out = await L.PDFDocument.create(), store = _ctlSupa.storage.from(MT_BUCKET);
    let k = 0, missed = 0;
    for (const { id, f } of files) {
      say(`${++k} / ${files.length}`);
      const path = f.orig_path || f.file_path;            // the untouched original
      const r = await mtTry(() => store.download(path));
      if (r.error || !r.data) { missed++; continue; }
      let bytes = new Uint8Array(await r.data.arrayBuffer());
      try {
        if (!mtIsPdfPath(path)) {
          if (!/\.(jpe?g|png)$/i.test(path)) { missed++; continue; }
          bytes = await mtInvImagePdf(L, bytes, path);
        }
        const lbl = mtNoLabel(id);
        const st = lbl ? await mtStampNo(bytes, lbl) : null;
        const src = await L.PDFDocument.load(st || bytes, { ignoreEncryption: true });
        (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg));
      } catch (e) { console.warn('[maintenance] invoice not added:', path, e); missed++; }
    }
    if (!out.getPageCount()) throw new Error('no pages');
    const blob = new Blob([await out.save()], { type: 'application/pdf' });
    if (btn) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); btn.innerHTML = keep; }
    await ccOpenPdf(blob, d.invName);
    if (missed) mtSay(missed === 1 ? '1 file could not be added (not a PDF or photo, or not loaded).' : `${missed} files could not be added (not a PDF or photo, or not loaded).`);
  } catch (e) {
    console.error('[maintenance] invoices PDF:', e);
    if (typeof ccCancelPdf === 'function') ccCancelPdf();
    mtSay('The invoices PDF could not be created. Check the connection and try again.');
  } finally {
    MT.pdfBusy = false;
    if (btn && btn.classList.contains('is-busy')) { btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); btn.innerHTML = keep; }
  }
}
function mtPdfInvYear(btn) {                               // the strip: both tabs, the chosen year
  const y = mtSumYear();
  if (btn && btn.classList.contains('off')) { mtSay(`No invoice files in ${y} yet.`); return; }
  return mtInvMake(btn, () => Object.assign(mtCpYearDataAll(y), { invName: ccPdfFileName('Invoices', y, 'Stand ' + mtDate(ccTodayISO())) }));
}
function mtPdfInvEntry(id, btn) {                          // one case
  const c = mtCase(id);
  if (!c) return;
  if (btn && btn.classList.contains('off')) { mtSay('No invoice files in this entry yet.'); return; }
  return mtInvMake(btn, () => Object.assign(mtCpEntryData(c), { invName: ccPdfFileName('Invoices', c.title, 'Stand ' + mtDate(ccTodayISO())) }));
}

/* ─────────────────────────────────────────────────────────────
   D19 · BELEG PDF — the photos of one receipt as one PDF in the apps' style:
   beige header (property · Beleg-/Bestell-Nr.), "Rechnung", when the photo was taken,
   the photo below — one page per photo. Plain photo PDF if this fails.
   ───────────────────────────────────────────────────────────── */
async function mtBelegPdf(files, c, no) {
  await mtSbLibs();
  if (!MT.sbData) await mtSbLoad();
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const casa = mtIsCasa(c.property_id), apt = casa ? null : mtSbApt(c);
  const pages = [];
  for (const file of files) {
    const img = await mtImageData(file, 1800, 0.85);
    if (!img) throw new Error('photo');
    let t = null;
    try { if (typeof _ccUbExifTime === 'function') t = await _ccUbExifTime(file); } catch (e) {}
    const ms = t instanceof Date ? t.getTime() : (typeof t === 'number' && t > 0 ? t : (Date.parse(t) || file.lastModified || Date.now()));
    pages.push({ img, when: new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr' });
  }
  const d = {
    family: casa ? 'casa' : 'rentals', wordmark: casa ? 'Casa Castel' : ((apt && apt.name) || mtPropName(c)), no: String(no || '').trim(),
    footer: casa ? [S.objekt_adresse, S.objekt_plz_ort].filter(Boolean).join(', ') : (apt ? [apt.adresse, apt.plz_ort].filter(Boolean).join(', ') : ''),
    pages,
  };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
  box.innerHTML = mtBelegHTML(d);
  document.body.appendChild(box);
  try {
    await document.fonts.ready;
    await Promise.all([...box.querySelectorAll('img')].map(i => (i.decode ? i.decode().catch(() => {}) : null)));
    await new Promise(r => setTimeout(r, 150));
    const pdf = await ccRenderPagesToPdf(box, { strict: false, only: true });
    return pdf.output('blob');
  } finally { box.remove(); }
}
function mtBelegHTML(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const R = d.family === 'rentals';
  const F = R ? { lbl: 700, ftr: '#c9c2b8' } : { lbl: 400, ftr: '#e8dbc5' };
  const CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    .pdf-page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#6e5128; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:${F.lbl}; letter-spacing:0.16em; text-transform:uppercase; color:#8a6535; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#6e5128; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid ${F.ftr}; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; color:#6b645c; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; color:#6b645c; margin-bottom:16px; }
    .ph { height:780px; display:flex; align-items:flex-start; justify-content:center; }
    .ph img { display:block; max-width:100%; max-height:100%; object-fit:contain; border:0.5px solid #e6e0d6; }
  `;
  const n = d.pages.length;
  return `<style>${CSS}</style>` + d.pages.map((p, i) => `
<div class="pdf-page">
  <div class="hdr"><span class="hdr__wordmark">${esc(d.wordmark)}</span>
    ${d.no ? `<div class="hdr__room"><span class="hdr__room-label">Beleg-/Bestell-Nr.</span><span class="hdr__room-name">${esc(d.no)}</span></div>` : ''}</div>
  <div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer)}</span><span>${n > 1 ? (i + 1) + ' / ' + n : '1'}</span></div></div>
  <div class="content">
    <div class="doc-title">Rechnung</div>
    <div class="doc-subtitle">Aufgenommen am ${esc(p.when)}</div>
    <div class="ph"><img src="${p.img.url}" alt=""/></div>
  </div>
</div>`).join('');
}
