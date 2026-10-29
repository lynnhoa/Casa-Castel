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
   · D32: every invoice page is the same A4 (beige band: Objekt · NR. · BELEG-/BESTELL-NR. ·
     DATUM, the invoice trimmed and fitted into one box, footer with address · page x / y) —
     for the receipt PDF of a cost row and for “Invoices”. The all-tabs Rechnungsübersicht:
     header “Rechnungsübersicht <Jahr>” · STAND, title “Renovierungen und Schäden” ·
     “Alle Objekte”; a tab heading moves to the next page with its first block.
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
    footer: casa ? mtAddr(S.objekt_adresse, S.objekt_plz_ort) : (apt ? mtAddr(apt.adresse, apt.plz_ort) : ''),
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
  const head = cols => `<tr><th>Nr.</th><th>${esc(cols[0])}</th><th>${esc(cols[1])}</th><th>${esc(cols[2])}</th><th class="d">Datum</th><th class="n">Betrag</th></tr>`;   // Betrag last: every sum lines up under it
  const line = l => l.net
    ? `<tr class="net"><td></td><td></td><td>Netto</td><td></td><td class="d"></td><td class="n">${amt(l.amt)}</td></tr>`
    : `<tr${l.ret ? ' class="ret"' : ''}><td class="own">${esc(l.own)}${l.nofile ? '<span class="nf">keine Datei</span>' : ''}</td><td>${esc(l.no)}</td><td>${esc(l.desc)}</td><td>${esc(l.who)}</td><td class="d">${esc(mtDate(l.date))}</td><td class="n">${amt(l.amt)}</td></tr>`;
  let body = '';
  const yg = groups => groups.map(g => `<div class="sec"><span>${esc(g.name)}</span><span class="sec__r">${amt(g.sum)}</span></div>
      <table class="t">${colg}${head(d.cols)}${g.ents.map(e =>
        `<tr class="grp"><td colspan="4">${esc(e.title)}${e.span ? `<span>${esc(e.span)}</span>` : ''}</td><td></td><td class="n">${amt(e.sum)}</td></tr>` +
        e.lines.map(line).join('')).join('')}</table>`).join('');
  if (d.mode === 'year2') {                                  // D22: Renovierungen, then Schäden
    body = (d.parts || []).map(pt => `<div class="tab" data-keep-next><span>${esc(pt.title)}</span><span>${amt(pt.sum)}</span></div>` + yg(pt.groups)).join('');
    if (!(d.parts || []).length) body = '<p class="empty">Keine Belege in diesem Jahr.</p>';
  } else if (d.mode === 'year') {
    body = d.groups.map(g => `<div class="sec"><span>${esc(g.name)}</span><span class="sec__r">${amt(g.sum)}</span></div>
      <table class="t">${colg}${head(d.cols)}${g.ents.map(e =>
        `<tr class="grp"><td colspan="4">${esc(e.title)}${e.span ? `<span>${esc(e.span)}</span>` : ''}</td><td></td><td class="n">${amt(e.sum)}</td></tr>` +
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
  const parts = Object.keys(MT_KIND).map(k => ({ k, d: mtCpYearData(k, year) })).filter(x => x.d.groups.length)   // D30: + Sonstiges
    .map(x => ({ title: MT_KIND[x.k].title, sum: x.d.groups.reduce((s2, g) => s2 + g.sum, 0), groups: x.d.groups }));
  const nm = parts.map(x => x.title), what = nm.length > 1 ? nm.slice(0, -1).join(', ') + ' und ' + nm[nm.length - 1] : (nm[0] || 'Renovierungen und Schäden');
  return {
    mode: 'year2', family: 'rentals', wordmark: 'Rechnungsübersicht ' + y, rl: 'Stand', rv: stand,   // D32: the header names it, the title says what is in it
    title: what, subtitle: 'Alle Objekte',
    cols: ['Beleg-/Bestell-Nr.', 'Beschreibung', 'Geschäft / Dienstleister'],
    totals: Object.keys(MT_KIND).filter(k => k !== 'sonstiges' || all.some(r => (mtCase(r.case_id) || {}).kind === k)).map(k => [MT_KIND[k].title, mtEur(sumOf(k))]).concat([['Gesamt', mtEur(mtCpSum(all))], ['Belege', String(all.filter(r => !r.return_of).length)]]),
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
   each receipt's files one after another (then its returns' files) — always from the
   untouched original — merged into one PDF. A receipt without a file is left out
   (its line says "keine Datei").
   D32: every page is an invoice page (below): same A4, same band, page x / y over
   the whole PDF.
   ───────────────────────────────────────────────────────────── */
function mtInvIds(d) {                                      // the list's row ids, in its order
  const ids = [], take = lines => lines.forEach(l => { if (l.id && !l.net) ids.push(String(l.id)); });
  if (d.mode === 'entry') d.blocks.forEach(b => take(b.lines));
  else if (d.mode === 'year2') (d.parts || []).forEach(pt => pt.groups.forEach(g => g.ents.forEach(e => take(e.lines))));
  else (d.groups || []).forEach(g => g.ents.forEach(e => take(e.lines)));
  return ids;
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
    await mtFrPrep();
    const ready = [];                                       // per file: its pages + its band (page numbers need the total)
    let k = 0, missed = 0;
    for (const { id, f } of files) {
      say(`${++k} / ${files.length}`);
      const path = f.orig_path || f.file_path;            // the untouched original
      if (!mtFrFrameable(path)) { missed++; continue; }
      const r = await mtTry(() => store.download(path));
      if (r.error || !r.data) { missed++; continue; }
      try {
        const head = mtFrHead(id) || {};
        const pages = await mtFrSource(out, new Uint8Array(await r.data.arrayBuffer()), path, f.file_name);
        if (!pages || !pages.length) { missed++; continue; }
        ready.push({ pages, addr: head.addr || '', band: await out.embedPng(await mtFrPng(mtFrBand(head))) });
      } catch (e) { console.warn('[maintenance] invoice not added:', path, e); missed++; }
    }
    const total = ready.reduce((n, x) => n + x.pages.length, 0);
    if (!total) throw new Error('no pages');
    let no = 0;
    for (const x of ready) for (const it of x.pages) await mtFrPage(L, out, it, x.band, x.addr, `${++no} / ${total}`);
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
   D32 · INVOICE PAGES — every invoice page is the same A4, however the invoice came
   in (an uploaded PDF of any size, a photo, a scan, a locked PDF):
   · the beige band of the other PDFs: the Objekt on the left · NR. (bold) ·
     BELEG-/BESTELL-NR. · DATUM on the right, in the list's order
   · the invoice in one fixed box below it: its white margins trimmed, scaled to fit
     (nothing cut off), always starting at the same height, a thin edge around it
   · the footer of the other PDFs: the Objekt's address · page x / y
   One style for every page (no Casa variant). Band and footer text are drawn with the
   PDF fonts (Playfair Display · Lato); the invoice itself stays what it is (a PDF page
   stays sharp text, a photo stays a photo). Used for the receipt PDF you open from a
   cost row (mtStampSync, always from the untouched original) and for "Invoices".
   A photo receipt saved as an old beige page (D19) gives only its photo; a locked PDF
   goes in as a picture of its pages. pdf.js finds the white margins (the text always counts,
   also when a font could not be drawn) and draws locked PDFs.
   ───────────────────────────────────────────────────────────── */
const MT_FR = {
  W: 595.28, H: 841.89, band: 62.3625,                      // A4 · the beige band (83.15 px)
  box: { x: 60, top: 84, w: 475.28, h: 706 },               // the invoice (pt, from the top of the page)
  foot: { x: 60, top: 806.265, w: 475.2825, h: 11.625 },    // rule + address · page (80 px in, 32 px up)
  S: 3,                                                     // canvas pixels per CSS px for band / footer (≈ 288 dpi)
  old: [0.098, 0.170, 0.902, 0.876],                        // where the photo sits on an old D19 page (left, top, right, bottom)
};
const MT_PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/';
const MT_FR_PF = '"Playfair Display", Georgia, serif', MT_FR_LA = 'Lato, "Helvetica Neue", Arial, sans-serif';
const mtFrImgPath = p => /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(String(p || ''));
const mtFrFrameable = p => mtIsPdfPath(p) || mtFrImgPath(p);
const mtFrMime = p => (/\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : /\.gif$/i.test(p) ? 'image/gif' : /\.hei[cf]$/i.test(p) ? 'image/heic' : 'image/jpeg');

async function mtPdfJs() {
  if (!window.pdfjsLib) await mtLoadScript(MT_PDFJS + 'build/pdf.min.js');
  const P = window.pdfjsLib;
  if (!P) throw new Error('pdf.js not loaded');
  if (P.GlobalWorkerOptions && !P.GlobalWorkerOptions.workerSrc) P.GlobalWorkerOptions.workerSrc = MT_PDFJS + 'build/pdf.worker.min.js';
  return P;
}
function mtFrDocOpts() {                                    // + the fonts a PDF names but does not carry (Helvetica, Arial …)
  return { isEvalSupported: false, standardFontDataUrl: MT_PDFJS + 'standard_fonts/', cMapUrl: MT_PDFJS + 'cmaps/', cMapPacked: true };
}
async function mtFrPrep() {                                 // the fonts on the canvas + the apartment addresses
  await mtPdfFonts();
  if (!MT.sbData) { try { await mtSbLoad(); } catch (e) { console.warn('[maintenance] addresses not loaded:', e); } }
}

/* What the band and footer say for one receipt / return */
function mtFrHead(costId) {
  const r = mtCostById(costId), c = r ? mtCase(r.case_id) : null;
  if (!r || !c) return null;
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const casa = mtIsCasa(c.property_id), apt = casa ? null : mtSbApt(c);
  const n = mtNumbers().cases.get(String(c.id)), no = mtCostNo(costId);
  return {
    objekt: casa ? 'Casa Castel' : mtPropName(c),
    nr: no ? [no, n && n.year].filter(Boolean).join(' \u00b7 ') : '',
    beleg: String(r.receipt_no || '').trim(),
    datum: mtDate(r.cost_date),
    addr: casa ? mtAddr(S.objekt_adresse, S.objekt_plz_ort) : (apt ? mtAddr(apt.adresse, apt.plz_ort) : ''),
  };
}
/* stamp_no of a receipt's A4 copy — when what the band says changes, the copy is made again */
function mtFrameKey(costId) {
  const h = mtFrHead(costId);
  return h ? 'A4 ' + [h.nr, h.objekt, h.beleg, h.datum].join(' | ') : '';
}

/* ── band + footer: drawn on a canvas in CSS px (the sizes of the other PDFs' header) ── */
function mtFrCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * MT_FR.S); cv.height = Math.round(h * MT_FR.S);
  const ctx = cv.getContext('2d');
  ctx.scale(MT_FR.S, MT_FR.S);
  return { cv, ctx };
}
function mtFrWidth(ctx, s, ls) {                            // letter-spacing like CSS: after every letter
  if (!ls) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + ls;
  return w;
}
function mtFrText(ctx, s, x, y, font, color, ls, right) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let cx = right ? x - mtFrWidth(ctx, s, ls) : x;
  if (!ls) { ctx.fillText(s, cx, y); return; }
  for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; }
}
function mtFrFit(ctx, s, max, ls) {                         // too long for its place → cut with …
  s = String(s || '');
  if (mtFrWidth(ctx, s, ls) <= max) return s;
  while (s.length > 1 && mtFrWidth(ctx, s + '\u2026', ls) > max) s = s.slice(0, -1);
  return s.replace(/\s+$/, '') + '\u2026';
}
function mtFrBand(h) {                                      // Objekt · NR. · BELEG-/BESTELL-NR. · DATUM
  const W = 793.71, H = 83.15, { cv, ctx } = mtFrCanvas(W, H);
  ctx.fillStyle = '#f0e8da'; ctx.fillRect(0, 0, W, H);
  const LBL = '700 7px ' + MT_FR_LA, LS = 1.12, GAP = 29.33;
  const pairs = [
    ['NR.', h.nr, '700 18px ' + MT_FR_LA, '#1a1a1a', 150],
    ['BELEG-/BESTELL-NR.', h.beleg, '400 12px ' + MT_FR_PF, '#6e5128', 170],
    ['DATUM', h.datum, '400 12px ' + MT_FR_PF, '#6e5128', 110],
  ].filter(p => p[1]);
  let r = W - 80;                                           // from the right edge, pair by pair
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [k, v, font, col, max] = pairs[i];
    ctx.font = font;
    const val = mtFrFit(ctx, v, max, 0), vw = ctx.measureText(val).width;
    ctx.font = LBL;
    const kw = mtFrWidth(ctx, k, LS);
    mtFrText(ctx, k, r, 33.33, LBL, '#8a6535', LS, true);
    mtFrText(ctx, val, r, 52, font, col, 0, true);
    r -= Math.max(kw, vw) + GAP;
  }
  const room = r + GAP - 24 - 80, f = s => `400 ${s}px ${MT_FR_PF}`;   // the Objekt as big as there is room (26 → 18 px)
  let size = 26;
  ctx.font = f(size);
  while (size > 18 && mtFrWidth(ctx, h.objekt || '', size * 0.05) > room) { size--; ctx.font = f(size); }
  const txt = mtFrFit(ctx, h.objekt || '', room, size * 0.05);
  mtFrText(ctx, txt, 80, 41.575 + 0.4155 * size, f(size), '#6e5128', size * 0.05, false);   // centred in the band like the other PDFs
  return cv;
}
function mtFrFooter(addr, page) {                           // rule · address … page
  const W = 633.71, H = 15.5, { cv, ctx } = mtFrCanvas(W, H);
  ctx.fillStyle = '#c9c2b8'; ctx.fillRect(0, 0, W, 0.5);
  const F = '400 8px ' + MT_FR_LA;
  ctx.font = F;
  const pw = ctx.measureText(page).width;
  mtFrText(ctx, page, W, 14.6, F, '#6b645c', 0, true);
  mtFrText(ctx, mtFrFit(ctx, addr || '', W - pw - 24, 0), 0, 14.6, F, '#6b645c', 0, false);
  return cv;
}
const mtFrBytes = (cv, type, q) => new Promise((res, rej) => cv.toBlob(b => (b ? b.arrayBuffer().then(x => res(new Uint8Array(x)), rej) : rej(new Error(type))), type, q));
const mtFrPng = cv => mtFrBytes(cv, 'image/png');
const mtFrJpeg = (cv, q) => mtFrBytes(cv, 'image/jpeg', q);
const mtFrFree = cv => { try { cv.width = cv.height = 0; } catch (e) {} };   // big canvases: give the memory back (iPhone)

/* ── the invoice: where its ink is, trimmed, embedded ── */
/* the ink (not white) as parts of the page: [left, top, right, bottom] · null = nothing there */
function mtFrInk(ctx, w, h, area) {
  const a = area || [0, 0, 1, 1];
  const X0 = Math.max(0, Math.floor(a[0] * w)), Y0 = Math.max(0, Math.floor(a[1] * h));
  const X1 = Math.min(w, Math.ceil(a[2] * w)), Y1 = Math.min(h, Math.ceil(a[3] * h)), cw = X1 - X0, ch = Y1 - Y0;
  if (cw < 1 || ch < 1) return null;
  const d = ctx.getImageData(X0, Y0, cw, ch).data;
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (let y = 0, i = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++, i += 4) {
      if (d[i] < 238 || d[i + 1] < 238 || d[i + 2] < 238) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : [(X0 + x0) / w, (Y0 + y0) / h, (X0 + x1 + 1) / w, (Y0 + y1 + 1) / h];
}
const mtFrJoin = (a, b) => (a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : a || b || null);
async function mtFrTextInk(pg, v1) {                        // where the page's text is, as parts of the shown page
  let tc;
  try { tc = await pg.getTextContent(); } catch (e) { return null; }
  let b = null;
  for (const it of (tc && tc.items) || []) {
    if (!it.str || !it.str.trim() || !it.transform) continue;
    const [a, q, c, d, e, f] = it.transform;
    const la = Math.hypot(a, q) || 1, lc = Math.hypot(c, d) || 1, w = Number(it.width) || 0, h = Number(it.height) || lc;
    [[0, -0.3 * h], [w, -0.3 * h], [0, 1.1 * h], [w, 1.1 * h]].forEach(([u, v]) => {
      const [x, y] = v1.convertToViewportPoint(e + (a / la) * u + (c / lc) * v, f + (q / la) * u + (d / lc) * v);
      const fx = Math.min(1, Math.max(0, x / v1.width)), fy = Math.min(1, Math.max(0, y / v1.height));
      b = mtFrJoin(b, [fx, fy, fx, fy]);
    });
  }
  return b;
}
const mtFrPad = (f, k, lim) => {
  const m = lim || [0, 0, 1, 1];
  return [Math.max(m[0], f[0] - k), Math.max(m[1], f[1] - k), Math.min(m[2], f[2] + k), Math.min(m[3], f[3] + k)];
};
/* an old D19 photo receipt: A4 with the beige band on top */
function mtFrOldBeleg(ctx, w, h) {
  if (Math.abs(w / h - 0.7071) > 0.012) return false;
  const x0 = Math.round(w * 0.02), x1 = Math.round(w * 0.98), y0 = Math.round(h * 0.012), y1 = Math.round(h * 0.06);
  if (x1 - x0 < 1 || y1 - y0 < 1) return false;
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let hit = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { n++; if (Math.abs(d[i] - 240) < 14 && Math.abs(d[i + 1] - 232) < 14 && Math.abs(d[i + 2] - 218) < 14) hit++; }
  return n > 0 && hit / n > 0.8;
}
async function mtFrRender(pg, long) {                       // a PDF page as it is shown, longest side = long px
  const v1 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: long / Math.max(v1.width, v1.height) });
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(vp.width)); cv.height = Math.max(1, Math.round(vp.height));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  return { cv, ctx, v1 };
}
function mtFrUser(v1, f) {                                  // parts of the shown page → the page's own PDF coordinates
  const pts = [[f[0], f[1]], [f[2], f[1]], [f[0], f[3]], [f[2], f[3]]].map(([x, y]) => v1.convertToPdfPoint(x * v1.width, y * v1.height));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { left: Math.min(...xs), bottom: Math.min(...ys), right: Math.max(...xs), top: Math.max(...ys) };
}
function mtFrDecode(bytes, max, type) {                     // an image file → a canvas, upright as the phone shows it
  return new Promise(resolve => {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      resolve(cv);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function mtFrPicture(out, cv, keep) {                 // a picture (photo / drawn page) → trimmed → embedded · keep = parts that must stay
  let c = cv;
  const k = Math.min(1, 560 / Math.max(cv.width, cv.height));
  const sm = document.createElement('canvas');
  sm.width = Math.max(1, Math.round(cv.width * k)); sm.height = Math.max(1, Math.round(cv.height * k));
  const sx = sm.getContext('2d', { willReadFrequently: true });
  sx.drawImage(cv, 0, 0, sm.width, sm.height);
  const ink = mtFrJoin(mtFrInk(sx, sm.width, sm.height), keep), f = ink && mtFrPad(ink, 0.012);
  mtFrFree(sm);
  if (f && (f[0] > 0.01 || f[1] > 0.01 || f[2] < 0.99 || f[3] < 0.99)) {
    const x = Math.floor(f[0] * cv.width), y = Math.floor(f[1] * cv.height);
    const w = Math.max(1, Math.ceil((f[2] - f[0]) * cv.width)), h = Math.max(1, Math.ceil((f[3] - f[1]) * cv.height));
    c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, w, h);
  }
  const img = await out.embedJpg(await mtFrJpeg(c, 0.9));
  const it = { img, w: c.width, h: c.height };
  if (c !== cv) mtFrFree(c);
  mtFrFree(cv);
  return it;
}
/* One invoice file → its pages, embedded in `out` and ready for the box · null = not possible (password / damaged) */
async function mtFrSource(out, bytes, path, name) {
  if (!mtIsPdfPath(path)) {
    const cv = await mtFrDecode(bytes, 2400, mtFrMime(path));
    return cv ? [await mtFrPicture(out, cv)] : null;
  }
  const L = await mtPdfLib(), P = await mtPdfJs();           // pdf.js not there (offline) → the caller tries again later
  let src = null, pj = null;
  try { src = await L.PDFDocument.load(bytes); } catch (e) { src = null; }          // locked / damaged → pdf.js draws it
  try { pj = await P.getDocument({ data: bytes.slice(), ...mtFrDocOpts() }).promise; } catch (e) { pj = null; }
  try {
    if (!src || !src.getPageCount()) {                       // a picture of each page
      if (!pj) return null;
      const pages = [];
      for (let i = 1; i <= pj.numPages; i++) {
        const pg = await pj.getPage(i), r = await mtFrRender(pg, 2000);
        pages.push(await mtFrPicture(out, r.cv, await mtFrTextInk(pg, r.v1)));
      }
      return pages.length ? pages : null;
    }
    const n = src.getPageCount(), named = /^beleg\b/i.test(String(name || ''));
    const looks = [];                                        // per page: what pdf.js sees
    if (pj && pj.numPages === n) {
      for (let i = 1; i <= n; i++) {
        const pg = await pj.getPage(i), { cv, ctx, v1 } = await mtFrRender(pg, 560);
        const old = named && mtFrOldBeleg(ctx, cv.width, cv.height);
        looks.push({ v1, old, ink: old ? mtFrInk(ctx, cv.width, cv.height, MT_FR.old) : mtFrJoin(mtFrInk(ctx, cv.width, cv.height), await mtFrTextInk(pg, v1)) });
        mtFrFree(cv);
      }
    }
    // one frame for all pages of a document (page 2 as big as page 1) · an old photo page: just its photo
    let all = null;
    looks.forEach(x => { if (!x.old && x.ink) all = all ? [Math.min(all[0], x.ink[0]), Math.min(all[1], x.ink[1]), Math.max(all[2], x.ink[2]), Math.max(all[3], x.ink[3])] : x.ink.slice(); });
    const pages = [];
    for (let i = 0; i < n; i++) {
      const p = src.getPage(i), x = looks[i];
      const rot = (((Number(p.getRotation().angle) || 0) % 360) + 360) % 360, side = rot === 90 || rot === 270;
      const cb = p.getCropBox();                             // what a viewer shows
      let bb = { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height };
      const f = x ? (x.old ? (x.ink ? mtFrPad(x.ink, 0.006, MT_FR.old) : MT_FR.old) : (all ? mtFrPad(all, 0.015) : null)) : null;
      if (f) bb = mtFrUser(x.v1, f);
      let emb = null;
      try { emb = await out.embedPage(p, bb); } catch (e) { emb = null; }
      if (!emb) {                                            // this page can't be taken over → a picture of it
        if (!pj) return null;
        const pg = await pj.getPage(i + 1), r = await mtFrRender(pg, 2000);
        pages.push(await mtFrPicture(out, r.cv, await mtFrTextInk(pg, r.v1)));
        continue;
      }
      const ew = bb.right - bb.left, eh = bb.top - bb.bottom;
      pages.push({ emb, rot, w: side ? eh : ew, h: side ? ew : eh, max: x && x.old ? Infinity : 1.5 });   // a small PDF page grows at most 1.5×
    }
    return pages;
  } finally { if (pj) { try { pj.destroy(); } catch (e) {} } }
}
/* One finished A4 page: the invoice in the box, the band, the footer */
async function mtFrPage(L, out, it, band, addr, no) {
  const pg = out.addPage([MT_FR.W, MT_FR.H]), B = MT_FR.box;
  const s = Math.min(B.w / it.w, B.h / it.h, it.max || Infinity);
  const w = it.w * s, h = it.h * s, x = B.x + (B.w - w) / 2, y = MT_FR.H - B.top - h;   // centred, from the top of the box
  if (it.img) pg.drawImage(it.img, { x, y, width: w, height: h });
  else {
    const at = it.rot === 90 ? { x, y: y + h, rotate: L.degrees(-90) }                 // a turned page comes out upright
             : it.rot === 180 ? { x: x + w, y: y + h, rotate: L.degrees(180) }
             : it.rot === 270 ? { x: x + w, y, rotate: L.degrees(90) }
             : { x, y };
    pg.drawPage(it.emb, { ...at, xScale: s, yScale: s });
  }
  pg.drawRectangle({ x, y, width: w, height: h, borderColor: L.rgb(230 / 255, 224 / 255, 214 / 255), borderWidth: 0.375 });
  pg.drawImage(band, { x: 0, y: MT_FR.H - MT_FR.band, width: MT_FR.W, height: MT_FR.band });
  const foot = await out.embedPng(await mtFrPng(mtFrFooter(addr, no)));
  pg.drawImage(foot, { x: MT_FR.foot.x, y: MT_FR.H - MT_FR.foot.top - MT_FR.foot.h, width: MT_FR.foot.w, height: MT_FR.foot.h });
}
/* One receipt file → its A4 copy (bytes), pages 1 / n … · null = not possible */
async function mtFrameFile(bytes, d) {
  const L = await mtPdfLib(), out = await L.PDFDocument.create();
  await mtFrPrep();
  const head = mtFrHead(d.cost_id) || {};
  const pages = await mtFrSource(out, new Uint8Array(bytes), d.orig_path || d.file_path, d.file_name);
  if (!pages || !pages.length) return null;
  const band = await out.embedPng(await mtFrPng(mtFrBand(head)));
  for (let i = 0; i < pages.length; i++) await mtFrPage(L, out, pages[i], band, head.addr || '', (i + 1) + ' / ' + pages.length);
  return out.save();
}
/* The photos of a receipt as they are (each photo one page of its own size) = the original of a photo receipt */
async function mtPhotoOrigPdf(files) {
  const L = await mtPdfLib(), doc = await L.PDFDocument.create();
  for (const f of files) {
    const p = await mtImageData(f, 2000, 0.85);
    if (!p) throw new Error('photo');
    const img = await doc.embedJpg(p.url), w = p.w * 0.75, h = p.h * 0.75;
    doc.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return new Blob([await doc.save()], { type: 'application/pdf' });
}
