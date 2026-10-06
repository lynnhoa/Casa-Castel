/* ─────────────────────────────────────────────────────────────
   NK LETTER · shared frame for all NK-Abrechnungen
   nk-letter.js

   Same page frame, fonts and colours as the Rentals NK letter
   (srLetterHtml): A4, Playfair Display + Lato, beige header band,
   small return line above the address, result box, bank block,
   Hinweise with § 556 BGB, page numbers in the footer.
   German text — the letter goes to tenants.

   nkLetterHtml(d)  d = {
     brand, unitLabel, unitName, footer,
     sender[], vermieter, ort, date, names[], addr[],
     title, subtitle, greeting, introHtml,
     sum, vz, saldo (> 0 Nachzahlung · < 0 Guthaben), via ('zahlung'|'kaution'|'miete'),
     due, bank{inhaber,bank,iban,bic}, verwendung, tenantIban, former,
     table{ cols:[{label, w, cls}], rows:[[…]], sumLabel, vzLabel },
     intro2, note2, anlagen,
     extra{ title, intro, rows:[[date, desc, company, amount]], sum } | null,
     listOnly (only the Belegliste page)
   }
   ───────────────────────────────────────────────────────────── */

'use strict';

function nkLetterHtml(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac';
  const dt = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };
  const nb = s => String(s).replace(/§ /g, '§\u00a0').replace(/Abs\. /g, 'Abs.\u00a0').replace(/Satz /g, 'Satz\u00a0');
  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');`;
  const CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
    .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
    .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#7a5c30; letter-spacing:0.05em; line-height:1; }
    .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
    .ftr__rule { border:none; border-top:0.5px solid #e8dbc5; margin-bottom:7px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:300; color:#aaa59e; line-height:1; }
    .content { position:absolute; top:122px; left:80px; right:80px; bottom:62px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:#1a1a1a; line-height:1.15; margin-bottom:4px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#aaa59e; line-height:1.5; margin-bottom:20px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:#4a4540; margin-top:20px; padding-bottom:5px; border-bottom:0.6px solid #d8d3cc; }
    .sec--first { margin-top:0; }
    .addr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:34px; }
    .addr__l { width:360px; }
    .addr__ret { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#6f6a63; padding-bottom:4px; border-bottom:0.5px solid #e8dbc5; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .addr__line { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; line-height:1.5; }
    .meta { text-align:right; }
    .meta__k { font-family:'Lato',sans-serif; font-size:7px; font-weight:400; letter-spacing:0.16em; text-transform:uppercase; color:#b8975a; line-height:1; }
    .meta__v { font-family:'Lato',sans-serif; font-size:11px; font-weight:400; color:#3a3530; line-height:1.3; margin-top:3px; }
    .p { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; line-height:1.6; margin-top:10px; }
    .p strong { font-weight:700; color:#1a1a1a; }
    .sum { width:360px; margin-top:4px; }
    .sum__r { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; padding:5px 0; border-bottom:0.5px solid #f0ede8; }
    .sum__r span:last-child { font-weight:400; color:#1a1a1a; font-variant-numeric:tabular-nums; }
    .total-box { background:#f0e8d8; border-radius:3px; padding:10px 12px; display:flex; justify-content:space-between; margin-top:8px; font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:#8a6535; line-height:1; }
    .kv { display:flex; padding:3px 0; font-family:'Lato',sans-serif; font-size:12px; }
    .kv__k { font-weight:300; color:#3a3530; width:150px; flex-shrink:0; }
    .kv__v { font-weight:400; color:#1a1a1a; }
    .bank { margin-top:8px; }
    .hint { display:flex; gap:8px; font-family:'Lato',sans-serif; font-size:10px; font-weight:300; color:#3a3530; line-height:1.55; padding:2px 0; }
    .hint::before { content:'\\2013'; color:#b8975a; flex-shrink:0; }
    .greet { font-family:'Lato',sans-serif; font-size:12px; font-weight:300; color:#3a3530; margin-top:24px; }
    .greet__name { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:#1a1a1a; margin-top:26px; }
    .anl { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#888780; margin-top:18px; }
    .intro2 { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#3a3530; line-height:1.55; margin:8px 0 6px; }
    .nk { width:100%; border-collapse:collapse; table-layout:fixed; margin-top:4px; }
    .nk th { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#888780; text-align:left; padding:4px 0 6px; border-bottom:0.5px solid #d8d3cc; vertical-align:bottom; line-height:1.3; }
    .nk td { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:300; color:#1a1a1a; padding:4px 0 5px; vertical-align:top; line-height:1.4; }
    .nk .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .nk td.k { font-size:9.5px; color:#4a4540; padding-left:14px; }
    .nk th.k { padding-left:14px; }
    .nk tr.s td { font-weight:700; border-top:0.6px solid #d8d3cc; padding-top:9px; }
    .res2 { margin-top:10px; }
    .note2 { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:300; color:#6f6a63; line-height:1.55; margin-top:14px; }
  `;
  const hdr = `<div class="hdr"><span class="hdr__wordmark">${esc(d.brand)}</span><div class="hdr__room"><span class="hdr__room-label">${esc(d.unitLabel || '')}</span><span class="hdr__room-name">${esc(d.unitName || '')}</span></div></div>`;
  const ftr = () => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer || '')}</span><span>Seite <span class="pgn">1</span> von <span class="pgt">1</span></span></div></div>`;
  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const bankBlock = () => `<div class="bank">${kv('Kontoinhaber', esc(d.bank.inhaber))}${d.bank.bank ? kv('Bank', esc(d.bank.bank)) : ''}${kv('IBAN', esc(d.bank.iban))}${d.bank.bic ? kv('BIC', esc(d.bank.bic)) : ''}${kv('Verwendungszweck', esc(d.verwendung))}</div>`;

  const amt = Math.abs(Number(d.saldo) || 0);
  const resLabel = d.saldo > 0 ? 'Nachzahlung' : d.saldo < 0 ? 'Guthaben' : 'Ergebnis';
  let pay;
  const E = Number(d.einbehalt) || 0;
  if (d.saldo > 0 && d.via === 'kaution' && E > 0) {
    const rest = Math.round((E - amt) * 100) / 100;
    pay = rest >= 0
      ? `<p class="p">Den Betrag von <strong>${eur(amt)}</strong> verrechnen wir mit dem einbehaltenen Teil Ihrer Mietkaution (${eur(E)}).${rest > 0 ? ` Den verbleibenden Betrag von <strong>${eur(rest)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong>${d.tenantIban ? ' auf Ihr Konto ' + esc(d.tenantIban) : d.former ? ' – bitte teilen Sie uns dafür Ihre aktuelle Bankverbindung (IBAN) mit' : ' auf Ihr uns bekanntes Konto'}.` : ' Damit ist die Kaution vollständig abgerechnet.'}</p>`
      : `<p class="p">Den Betrag von <strong>${eur(amt)}</strong> verrechnen wir mit dem einbehaltenen Teil Ihrer Mietkaution (${eur(E)}). Bitte überweisen Sie den verbleibenden Betrag von <strong>${eur(-rest)}</strong> bis zum <strong>${dt(d.due)}</strong> auf folgendes Konto:</p>${bankBlock()}`;
  }
  else if (d.saldo < 0 && E > 0) pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> zahlen wir Ihnen zusammen mit dem einbehaltenen Teil Ihrer Mietkaution (${eur(E)}), insgesamt <strong>${eur(amt + E)}</strong>, bis zum <strong>${dt(d.due)}</strong>${d.tenantIban ? ' auf Ihr Konto ' + esc(d.tenantIban) : d.former ? ' – bitte teilen Sie uns dafür Ihre aktuelle Bankverbindung (IBAN) mit' : ' auf Ihr uns bekanntes Konto'}.</p>`;
  else if (!d.saldo && E > 0) pay = `<p class="p">Ihre Vorauszahlungen decken Ihren Kostenanteil genau. Den einbehaltenen Teil Ihrer Mietkaution von <strong>${eur(E)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong>${d.tenantIban ? ' auf Ihr Konto ' + esc(d.tenantIban) : ' auf Ihr uns bekanntes Konto'}.</p>`;
  else if (d.saldo > 0 && d.via === 'kaution') pay = `<p class="p">Den Betrag von <strong>${eur(amt)}</strong> verrechnen wir mit Ihrer Mietkaution. Sie müssen nichts überweisen.</p>`;
  else if (d.saldo > 0 && d.via === 'miete') pay = `<p class="p">Bitte zahlen Sie den Betrag von <strong>${eur(amt)}</strong> zusammen mit Ihrer nächsten Miete, spätestens bis zum <strong>${dt(d.due)}</strong> (Verwendungszweck: ${esc(d.verwendung)}).</p>`;
  else if (d.saldo > 0) pay = `<p class="p">Bitte überweisen Sie den Betrag von <strong>${eur(amt)}</strong> bis zum <strong>${dt(d.due)}</strong> auf folgendes Konto:</p>${bankBlock()}`;
  else if (d.saldo < 0 && d.via === 'miete') pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> können Sie mit Ihrer nächsten Mietzahlung verrechnen: Überweisen Sie die nächste Miete um diesen Betrag gekürzt.</p>`;
  else if (d.saldo < 0 && d.via === 'kaution') pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> berücksichtigen wir bei der Abrechnung Ihrer Mietkaution.</p>`;
  else if (d.saldo < 0 && d.tenantIban) pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong> auf Ihr Konto ${esc(d.tenantIban)}.</p>`;
  else if (d.saldo < 0 && d.former) pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> überweisen wir Ihnen gern. Bitte teilen Sie uns dafür Ihre aktuelle Bankverbindung (IBAN) mit.</p>`;
  else if (d.saldo < 0) pay = `<p class="p">Das Guthaben von <strong>${eur(amt)}</strong> überweisen wir Ihnen bis zum <strong>${dt(d.due)}</strong> auf Ihr uns bekanntes Konto. Hat sich Ihre Bankverbindung geändert, teilen Sie uns die neue bitte kurz mit.</p>`;
  else pay = `<p class="p">Ihre Vorauszahlungen decken Ihren Kostenanteil genau – es ergibt sich weder eine Nachzahlung noch ein Guthaben.</p>`;

  const page1 = `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="addr"><div class="addr__l">
      <div class="addr__ret">${esc((d.sender || []).join(' \u00b7 '))}</div>
      ${(d.names || []).map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}${(d.addr || []).map(n => `<div class="addr__line">${esc(n)}</div>`).join('')}
    </div><div class="meta"><div class="meta__k">Datum</div><div class="meta__v">${esc((d.ort ? d.ort + ', ' : '') + dt(d.date))}</div></div></div>
    <div class="doc-title">${esc(d.title)}</div>
    <div class="doc-subtitle">${d.subtitle || ''}</div>
    <p class="p" style="margin-top:0">${esc(d.greeting)}</p>
    <p class="p">${d.introHtml || ''}</p>
    <div class="sec">Ergebnis</div>
    <div class="sum">
      <div class="sum__r"><span>Ihr Anteil an den Betriebskosten</span><span>${eur(d.sum)}</span></div>
      <div class="sum__r"><span>abzüglich Ihrer Vorauszahlungen</span><span>\u2212\u00a0${eur(d.vz)}</span></div>
      <div class="total-box"><span>${resLabel}</span><span>${d.saldo ? eur(amt) : 'ausgeglichen'}</span></div>
    </div>
    ${pay}
    <div class="sec">Hinweise</div>
    <div style="margin-top:6px">${(d.hinweise || []).map(h => `<div class="hint"><span>${esc(nb(h))}</span></div>`).join('')}</div>
    <p class="greet">Mit freundlichen Grüßen</p>
    <p class="greet__name">${esc(d.vermieter)}</p>
    ${d.anlagen ? `<p class="anl">Anlage: ${esc(d.anlagen)}</p>` : ''}
  </div></div>`;

  const T = d.table;
  const page2 = T ? `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="sec sec--first">Aufstellung der Betriebskosten</div>
    <p class="intro2">${d.intro2 || ''}</p>
    <table class="nk"><colgroup>${T.cols.map(c => `<col style="width:${c.w}"/>`).join('')}</colgroup>
      <thead><tr>${T.cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${T.rows.map(r => `<tr>${r.map((v, i) => `<td class="${T.cols[i].cls || ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
        <tr class="s"><td colspan="${T.cols.length - 1}">Summe Ihr Anteil</td><td class="r">${eur(d.sum)}</td></tr>
        <tr><td colspan="${T.cols.length - 1}">${esc(T.vzLabel || 'abzüglich geleisteter Vorauszahlungen')}</td><td class="r">\u2212\u00a0${eur(d.vz)}</td></tr>
      </tbody></table>
    <div class="total-box res2"><span>${resLabel}</span><span>${d.saldo ? eur(amt) : 'ausgeglichen'}</span></div>
    ${d.note2 ? `<p class="note2">${esc(d.note2)}</p>` : ''}
  </div></div>` : '';

  const X = d.extra;
  const page3 = X && X.rows && X.rows.length ? `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="sec sec--first">${esc(X.title)}</div>
    <p class="intro2">${esc(X.intro || '')}</p>
    <table class="nk"><colgroup><col style="width:15%"/><col style="width:41%"/><col style="width:24%"/><col style="width:20%"/></colgroup>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Firma</th><th class="r">Betrag</th></tr></thead>
      <tbody>${X.rows.map(r => `<tr><td>${esc(dt(r[0]))}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="r">${eur(r[3])}</td></tr>`).join('')}
        <tr class="s"><td colspan="3">Summe Einzelrechnungen</td><td class="r">${eur(X.sum)}</td></tr>
      </tbody></table>
  </div></div>` : '';

  const scoped = CSS.replace(/([^{}]+)\{/g, (m, sel) => sel.split(',').map(x => '.nk-letter ' + x.trim()).join(', ') + ' {');
  return `<div class="nk-letter"><style>${FONTS}</style><style>${scoped}</style>${d.listOnly ? page3 : page1 + page2 + page3}</div>`;
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
