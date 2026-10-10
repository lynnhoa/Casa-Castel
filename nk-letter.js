/* ─────────────────────────────────────────────────────────────
   NK LETTER · shared frame for all NK-Abrechnungen
   nk-letter.js

   Same page frame, fonts and colours as the Rentals NK letter
   (srLetterHtml): A4, Playfair Display + Lato, beige header band,
   small return line above the address, result box, bank block,
   Hinweise with § 556 BGB, page numbers in the footer.
   German text — the letter goes to tenants.

   nkLetterHtml(d)  d = {   (one-page layout, Oct 2026)
     brand (left of the header; '' for Rentals), unitLabel, unitName, footer,
     sender[], vermieter, ort, date, names[], addr[], title, facts1[[label, value, small]],
     greeting, introHtml, closing, du (Casa: "du" where needed),
     costs{ cols:[{label, w, cls}], rows:[[…]], sumLabel, sumMid }, vzMonths[{label, part, amt}],
     sum, vz, saldo (> 0 Nachzahlung · < 0 Guthaben), via ('zahlung'|'kaution'|'miete'), einbehalt,
     due, bank{inhaber, iban}, verwendung, tenantIban, tenantHolder, former,
     extraHtml, hints[], anlagen,
     extra{ title, intro, rows:[[date, desc, company, amount]], sum } | null (Belegliste, page 2), listOnly
   }
   */

'use strict';

/* Design system (Oct 2026 redesign)
   Colours   ink #2b2520 (names, amounts, titles) · text #4a433c (body) · muted #8c8379 (labels, notes)
             accent #7a5c30 (wordmark, result) · gold #b08d57 (small caps labels)
             rule #e3dbcf · hairline #efe9e0 · band #f0e8da · soft fill #f5efe5
   Type      Playfair Display: wordmark 26 · titles 24 / 20
             Lato 400: body 11.5 / 1.65 · table 10.5 · labels 7–7.5 caps · notes 9–9.5
   Space     content from 150 px (was 122) · sections 30 px apart · table rows 7 px padding
   Register  d.du = true → "du" where a person must act (Casa Castel); otherwise neutral       */
/* shared by every NK letter (Casa Castel · Rentals · manual) — one design */
const NK_LETTER_CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:24px; font-weight:400; color:#2b2520; line-height:1.2; margin-bottom:6px; }
    .doc-title--s { font-size:21px; color:#1a1a1a; line-height:1.15; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#8c8379; line-height:1.55; margin-bottom:26px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#7a5c30; margin-top:30px; padding-bottom:6px; border-bottom:0.6px solid #e3dbcf; }
    .sec--first { margin-top:0; }
    .addr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .addr__l { width:340px; }
    .addr__ret { font-family:'Lato',sans-serif; font-size:8.5px; font-weight:400; color:#8c8379; padding-bottom:5px; border-bottom:0.5px solid #e3dbcf; margin-bottom:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .addr__line { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:400; color:#2b2520; line-height:1.55; }
    .meta { text-align:right; padding-top:2px; }
    .meta__k { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#b08d57; line-height:1; }
    .meta__v { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#4a433c; line-height:1.3; margin-top:5px; }
    .p { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:400; color:#4a433c; line-height:1.65; margin-top:12px; }
    .p strong { font-weight:700; color:#2b2520; }
    .sum { margin-top:6px; }
    .sum__r { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:11.5px; font-weight:400; color:#4a433c; padding:8px 0; border-bottom:0.5px solid #efe9e0; }
    .sum__r span:last-child { color:#2b2520; font-variant-numeric:tabular-nums; }
    .total-box { background:#f3ecdf; border-radius:4px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-family:'Lato',sans-serif; font-size:12.5px; font-weight:700; color:#7a5c30; line-height:1; }
    .total-box span:last-child { font-variant-numeric:tabular-nums; }
    .kv { display:flex; align-items:flex-end; padding:2px 0; font-family:'Lato',sans-serif; font-size:11px; }
    .kv__k { font-weight:400; color:#8c8379; width:140px; flex-shrink:0; }
    .kv__v { font-weight:400; color:#2b2520; }
    .fill { display:inline-block; width:230px; border-bottom:0.6px solid #c9bfb1; height:13px; vertical-align:bottom; }
    .bank { margin-top:6px; padding:6px 14px; border:0.6px solid #e3dbcf; border-radius:4px; }
    .hints { margin-top:8px; }
    .hint { display:flex; gap:8px; font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#4a433c; line-height:1.6; padding:2px 0; }
    .hint::before { content:'\\2013'; color:#b08d57; flex-shrink:0; }
    .hint--s { font-size:9.5px; color:#6f675e; line-height:1.55; }
    .greet { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:400; color:#4a433c; margin-top:12px; }
    .greet__name { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:700; color:#2b2520; margin-top:8px; }
    .anl { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#8c8379; margin-top:8px; }
    .facts { display:flex; margin:10px 0 18px; border-top:0.6px solid #e3dbcf; border-bottom:0.6px solid #e3dbcf; }
    .fact { flex:1; padding:11px 0 10px; }
    .fact + .fact { padding-left:16px; border-left:0.5px solid #efe9e0; }
    .fact__k { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#b08d57; line-height:1; }
    .fact__v { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#2b2520; line-height:1.35; margin-top:5px; }
    .fact__s { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#8c8379; line-height:1.35; }
    .intro2 { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#4a433c; line-height:1.6; margin:0 0 14px; }
    .nk { width:100%; border-collapse:collapse; table-layout:fixed; }
    .nk th { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#8c8379; text-align:left; padding:0 0 8px; border-bottom:0.6px solid #d9d0c3; vertical-align:bottom; line-height:1.3; }
    .nk td { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#2b2520; padding:7px 0 7px; vertical-align:top; line-height:1.4; }
    .nk tr:first-child td { border-top:none; }
    .nk .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .nk th.r { text-align:right; }
    .nk td.k { font-size:9.5px; color:#8c8379; padding-left:14px; padding-top:8px; }
    .nk th.k { padding-left:14px; }
    .nk td.m { color:#4a433c; }
    .nk td .sub { display:block; font-size:8.5px; color:#8c8379; line-height:1.35; margin-top:1px; white-space:normal; }
    .nk tr.sub td { border-top:none; padding:0 0 8px; font-size:8.5px; color:#8c8379; line-height:1.35; }
    .nk tr.s td { font-weight:700; padding-top:14px; }
    .nk tr.v td { color:#4a433c; }
    .res2 { margin-top:12px; }
    .two { display:flex; gap:34px; align-items:flex-start; margin-top:18px; }
    .two__l { flex:1 1 58%; min-width:0; } .two__r { flex:0 0 36%; }
    .two .nk td { padding:3.2px 0; }
    .two .nk tr.s td { padding-top:9px; border-top:0.6px solid #d9d0c3; }
    .calc { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#8c8379; margin-left:10px; }
    .note2 { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#6f675e; line-height:1.55; margin-top:14px; }
  `;

function nkLetterHtml(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const eur = n => { const v = Number(n) || 0; return (v < -0.004 ? '\u2212\u00a0' : '') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac'; };
  const dt = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };
  const nb = s => String(s).replace(/§ /g, '§\u00a0').replace(/Abs\. /g, 'Abs.\u00a0').replace(/Satz /g, 'Satz\u00a0');
  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');`;
  const CSS = NK_LETTER_CSS;
  const hdr = `<div class="hdr"><span class="hdr__wordmark">${esc(d.brand || '')}</span>${d.unitName ? `<div class="hdr__room"><span class="hdr__room-label">${esc(d.unitLabel || '')}</span><span class="hdr__room-name">${esc(d.unitName)}</span></div>` : ''}</div>`;
  const ftr = () => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer || '')}</span><span>Seite <span class="pgn">1</span> von <span class="pgt">1</span></span></div></div>`;
  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const line = '<span class="fill"></span>';
  const du = !!d.du, E = Number(d.einbehalt) || 0;
  const amt = Math.abs(Number(d.saldo) || 0);
  const resLabel = d.saldo > 0 ? 'Nachzahlung' : d.saldo < 0 ? 'Guthaben' : 'Ausgeglichen';
  const due = `<strong>${dt(d.due)}</strong>`;
  // bank boxes: the landlord's account (money to pay) · the tenant's account (money back)
  const ourBank = () => `<div class="bank">${kv('Kontoinhaber', esc(d.bank.inhaber))}${kv('IBAN', esc(d.bank.iban))}${kv('Verwendungszweck', esc(d.verwendung))}</div>`;
  const theirBank = () => `<div class="bank">${kv('Kontoinhaber', esc(d.tenantHolder || (d.names || []).join(', ')) || line)}${kv('IBAN', d.tenantIban ? esc(d.tenantIban) : line)}${d.tenantIban ? kv('Verwendungszweck', esc(d.verwendung)) : kv('Bank', line)}</div>`;

  // ── Payment: the amount stands in the result box, the text only says how and until when
  // neutral (Rentals) · "du" only where somebody must act (Casa Castel, d.du)
  const back = what => (d.tenantIban || d.former)
    ? `<p class="p">${what} bis zum ${due} auf folgendes ${du ? 'Bankkonto zurücküberwiesen' : 'Konto überwiesen'}:</p>${theirBank()}`
    : du ? `<p class="p">${what} bis zum ${due} auf folgendes Bankkonto zurücküberwiesen:</p>${theirBank()}`
         : `<p class="p">${what} bis zum ${due} auf das bekannte Konto überwiesen. Bei einer geänderten Bankverbindung bitte kurz Bescheid geben.</p>`;
  const payTo = () => du ? `<p class="p">Bitte überweise uns den Betrag bis zum ${due} auf folgendes Bankkonto:</p>${ourBank()}`
                         : `<p class="p">Der Betrag ist bis zum ${due} auf folgendes Konto zu überweisen:</p>${ourBank()}`;
  const kau = du ? 'deiner Mietkaution' : 'der Mietkaution';
  let pay;
  if (d.saldo > 0 && d.via === 'kaution' && E > 0) {
    const rest = Math.round((E - amt) * 100) / 100;
    const head = `Die Nachzahlung wird mit dem einbehaltenen Teil ${kau} (${eur(E)}) verrechnet.`;
    pay = rest > 0 ? `<p class="p">${head}</p>` + back(`Der Restbetrag von <strong>${eur(rest)}</strong> wird${du ? ' dir' : ''}`)
      : rest === 0 ? `<p class="p">${head} Damit ist die Kaution vollständig abgerechnet.</p>`
      : `<p class="p">${head} ${du ? `Bitte überweise uns den Restbetrag von <strong>${eur(-rest)}</strong> bis zum ${due} auf folgendes Bankkonto:` : `Der Restbetrag von <strong>${eur(-rest)}</strong> ist bis zum ${due} auf folgendes Konto zu überweisen:`}</p>${ourBank()}`;
  }
  else if (d.saldo < 0 && E > 0) pay = back(`Das Guthaben und der einbehaltene Teil ${kau} (${eur(E)}), zusammen <strong>${eur(amt + E)}</strong>, werden${du ? ' dir' : ''}`);
  else if (!d.saldo && E > 0) pay = back(`Der einbehaltene Teil ${kau} von <strong>${eur(E)}</strong> wird${du ? ' dir' : ''}`);
  else if (d.saldo > 0 && d.via === 'kaution') pay = `<p class="p">Die Nachzahlung wird mit ${kau} verrechnet${du ? ' – du musst nichts überweisen' : ' – eine Überweisung ist nicht nötig'}.</p>`;
  else if (d.saldo > 0 && d.via === 'miete') pay = `<p class="p">${du ? `Bitte überweise uns den Betrag zusammen mit der nächsten Miete, spätestens bis zum ${due}` : `Der Betrag ist zusammen mit der nächsten Miete zu zahlen, spätestens bis zum ${due}`} (Verwendungszweck: ${esc(d.verwendung)}).</p>`;
  else if (d.saldo > 0) pay = payTo();
  else if (d.saldo < 0 && d.via === 'miete') pay = `<p class="p">${du ? 'Du kannst das Guthaben mit der nächsten Miete verrechnen: Überweise die nächste Miete einfach um diesen Betrag gekürzt.' : 'Das Guthaben kann mit der nächsten Mietzahlung verrechnet werden: Die nächste Miete wird um diesen Betrag gekürzt überwiesen.'}</p>`;
  else if (d.saldo < 0 && d.via === 'kaution') pay = `<p class="p">Das Guthaben wird bei der Abrechnung ${kau} berücksichtigt.</p>`;
  else if (d.saldo < 0) pay = back(du ? 'Dein Guthaben wird dir' : 'Das Guthaben wird');
  else pay = `<p class="p">Die Vorauszahlungen decken den Kostenanteil genau – es entsteht weder eine Nachzahlung noch ein Guthaben.</p>`;

  // ── Costs (left) · monthly Vorauszahlungen (right)
  const C = d.costs || { cols: [{ label: 'Kostenart', w: '70%' }, { label: 'Betrag', w: '30%', cls: 'r' }], rows: [] };
  const sumRow = C.cols.map((c, i) => i === 0 ? `<td>${esc(C.sumLabel || 'Summe Kosten')}</td>` : i === C.cols.length - 1 ? `<td class="r">${eur(d.sum)}</td>` : `<td class="r m">${C.sumMid !== undefined ? eur(C.sumMid) : ''}</td>`).join('');
  const costTable = `<table class="nk"><colgroup>${C.cols.map(c => `<col style="width:${c.w}"/>`).join('')}</colgroup>
    <thead><tr>${C.cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${C.rows.map(r => `<tr>${r.map((v, i) => `<td class="${(C.cols[i].cls || '').replace('k', 'm')}">${esc(v)}</td>`).join('')}</tr>`).join('')}<tr class="s">${sumRow}</tr></tbody></table>`;
  let VZ = (d.vzMonths || []).map(v => Object.assign({}, v));
  if (VZ.length) {
    const tot = Math.round(VZ.reduce((a, v) => a + (Number(v.amt) || 0), 0) * 100) / 100, diff = Math.round(((Number(d.vz) || 0) - tot) * 100) / 100;
    if (Math.abs(diff) >= 0.005 && Math.abs(diff) < 0.05) VZ[VZ.length - 1].amt = Math.round((VZ[VZ.length - 1].amt + diff) * 100) / 100;
    else if (Math.abs(diff) >= 0.05) VZ.push({ label: 'Korrektur', amt: diff });
  } else VZ = [{ label: 'Vorauszahlungen', amt: Number(d.vz) || 0 }];
  const vzTable = `<table class="nk"><colgroup><col style="width:56%"/><col style="width:44%"/></colgroup>
    <thead><tr><th>Monat</th><th class="r">Vorauszahlung</th></tr></thead>
    <tbody>${VZ.map(v => `<tr><td class="m">${esc(v.label)}${v.part ? `<span class="sub">${esc(v.part)}</span>` : ''}</td><td class="r">${eur(v.amt)}</td></tr>`).join('')}
    <tr class="s"><td>Summe</td><td class="r">${eur(d.vz)}</td></tr></tbody></table>`;
  const facts = (d.facts1 || []).length ? `<div class="facts">${d.facts1.map(f => `<div class="fact"><div class="fact__k">${esc(f[0])}</div><div class="fact__v">${esc(f[1])}</div>${f[2] ? `<div class="fact__s">${esc(f[2])}</div>` : ''}</div>`).join('')}</div>` : '';
  const calc = `<span class="calc">${eur(d.vz)} Vorauszahlungen \u2212 ${eur(d.sum)} Kosten</span>`;

  const page1 = `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="addr"><div class="addr__l">
      <div class="addr__ret">${esc((d.sender || []).join(' \u00b7 '))}</div>
      ${(d.names || []).map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}${(d.addr || []).map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}
    </div><div class="meta"><div class="meta__k">Datum</div><div class="meta__v">${esc((d.ort ? d.ort + ', ' : '') + dt(d.date))}</div></div></div>
    <div class="doc-title doc-title--s">${esc(d.title)}</div>
    ${facts}
    <p class="p" style="margin-top:0">${esc(d.greeting)}</p>
    <p class="p" style="margin-top:6px">${d.introHtml || ''}</p>
    <div class="two"><div class="two__l">${costTable}</div><div class="two__r">${vzTable}</div></div>
    <div class="total-box"><span>${resLabel}${d.saldo ? calc : ''}</span><span>${d.saldo ? eur(amt) : eur(0)}</span></div>
    ${pay}
    ${d.extraHtml || ''}
    ${(d.hints || []).length ? `<div class="hints">${d.hints.map(h => `<div class="hint hint--s"><span>${esc(nb(h))}</span></div>`).join('')}</div>` : ''}
    <p class="greet">${esc(d.closing || 'Mit freundlichen Grüßen')}</p>
    <p class="greet__name">${esc(d.vermieter)}</p>
    ${d.anlagen ? `<p class="anl">Anlage: ${esc(d.anlagen)}</p>` : ''}
  </div></div>`;

  // Belegliste (optional, own page)
  const X = d.extra;
  const pageX = X && X.rows && X.rows.length ? `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="doc-title doc-title--s">${esc(X.title)}</div>
    <div class="doc-subtitle">${esc(X.intro || '')}</div>
    <table class="nk"><colgroup><col style="width:15%"/><col style="width:41%"/><col style="width:24%"/><col style="width:20%"/></colgroup>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Firma</th><th class="r">Betrag</th></tr></thead>
      <tbody>${X.rows.map(r => `<tr><td class="m">${esc(dt(r[0]))}</td><td>${esc(r[1])}</td><td class="m">${esc(r[2])}</td><td class="r">${eur(r[3])}</td></tr>`).join('')}
        <tr class="s"><td colspan="3">${esc(X.sumLabel || 'Summe')}</td><td class="r">${eur(X.sum)}</td></tr>
      </tbody></table>
  </div></div>` : '';

  const scoped = CSS.replace(/([^{}]+)\{/g, (m, sel) => sel.split(',').map(x => '.nk-letter ' + x.trim()).join(', ') + ' {');
  return `<div class="nk-letter"><style>${FONTS}</style><style>${scoped}</style>${d.listOnly ? pageX : page1 + pageX}</div>`;
}

/* Render the letter → { blob, name } (does not open it). Same pipeline as the Rentals letters. */
async function nkLetterPdf(d, fileName) {
  let box = document.getElementById('_pdfRenderContainer'); if (box) box.remove();
  box = document.createElement('div');
  box.id = '_pdfRenderContainer';
  box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;font-size:11.33px;';
  box.innerHTML = nkLetterHtml(d);
  document.body.appendChild(box);
  try {
    try { await document.fonts.ready; } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
    try { await ccFlowPages(box); } catch (e) {}
    const pages = box.querySelectorAll('.pdf-page');
    pages.forEach((pg, i) => { const a = pg.querySelector('.pgn'), b = pg.querySelector('.pgt'); if (a) a.textContent = String(i + 1); if (b) b.textContent = String(pages.length); });
    const pdf = await ccRenderPagesToPdf(box);
    return { blob: pdf.output('blob'), name: ccPdfSafeName(fileName) };
  } finally { box.remove(); }
}
