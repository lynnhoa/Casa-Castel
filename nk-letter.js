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
     intro2, note2 | notes2[] (+ notes2Title), anlagen, closing, du (Casa: "du" where needed),
     title2, subtitle2, facts[[label, value, small]] (page 2 head),
     extra{ title, intro, rows:[[date, desc, company, amount]], sum } | null,
     listOnly (only the Belegliste page)
   }
   ───────────────────────────────────────────────────────────── */

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
    .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#b08d57; line-height:1; }
    .hdr__room-name { font-family:'Playfair Display',serif; font-size:13px; font-weight:400; color:#7a5c30; line-height:1; }
    .ftr { position:absolute; left:80px; right:80px; bottom:34px; }
    .ftr__rule { border:none; border-top:0.5px solid #e3dbcf; margin-bottom:8px; }
    .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:400; color:#a39a8f; line-height:1; }
    .content { position:absolute; top:150px; left:80px; right:80px; bottom:72px; overflow:hidden; }
    .doc-title { font-family:'Playfair Display',serif; font-size:24px; font-weight:400; color:#2b2520; line-height:1.2; margin-bottom:6px; }
    .doc-title--s { font-size:20px; }
    .doc-subtitle { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#8c8379; line-height:1.55; margin-bottom:26px; }
    .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:#7a5c30; margin-top:30px; padding-bottom:6px; border-bottom:0.6px solid #e3dbcf; }
    .sec--first { margin-top:0; }
    .addr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:44px; }
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
    .total-box { background:#f3ecdf; border-radius:4px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-family:'Lato',sans-serif; font-size:12.5px; font-weight:700; color:#7a5c30; line-height:1; }
    .total-box span:last-child { font-variant-numeric:tabular-nums; }
    .kv { display:flex; align-items:flex-end; padding:4px 0; font-family:'Lato',sans-serif; font-size:11px; }
    .kv__k { font-weight:400; color:#8c8379; width:140px; flex-shrink:0; }
    .kv__v { font-weight:400; color:#2b2520; }
    .fill { display:inline-block; width:230px; border-bottom:0.6px solid #c9bfb1; height:13px; vertical-align:bottom; }
    .bank { margin-top:10px; padding:10px 14px; border:0.6px solid #e3dbcf; border-radius:4px; }
    .hints { margin-top:8px; }
    .hint { display:flex; gap:8px; font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#4a433c; line-height:1.6; padding:2px 0; }
    .hint::before { content:'\\2013'; color:#b08d57; flex-shrink:0; }
    .hint--s { font-size:9.5px; color:#6f675e; line-height:1.55; }
    .greet { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:400; color:#4a433c; margin-top:34px; }
    .greet__name { font-family:'Lato',sans-serif; font-size:11.5px; font-weight:700; color:#2b2520; margin-top:22px; }
    .anl { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#8c8379; margin-top:22px; }
    .facts { display:flex; margin:0 0 22px; border-top:0.6px solid #e3dbcf; border-bottom:0.6px solid #e3dbcf; }
    .fact { flex:1; padding:11px 0 10px; }
    .fact + .fact { padding-left:16px; border-left:0.5px solid #efe9e0; }
    .fact__k { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#b08d57; line-height:1; }
    .fact__v { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#2b2520; line-height:1.35; margin-top:5px; }
    .fact__s { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:#8c8379; line-height:1.35; }
    .intro2 { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#4a433c; line-height:1.6; margin:0 0 14px; }
    .nk { width:100%; border-collapse:collapse; table-layout:fixed; }
    .nk th { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#8c8379; text-align:left; padding:0 0 8px; border-bottom:0.6px solid #d9d0c3; vertical-align:bottom; line-height:1.3; }
    .nk td { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:#2b2520; padding:7px 0 7px; vertical-align:top; line-height:1.4; border-top:0.5px solid #efe9e0; }
    .nk tr:first-child td { border-top:none; }
    .nk .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .nk th.r { text-align:right; }
    .nk td.k { font-size:9.5px; color:#8c8379; padding-left:14px; padding-top:8px; }
    .nk th.k { padding-left:14px; }
    .nk td.m { color:#4a433c; }
    .nk td .sub { display:block; font-size:8.5px; color:#8c8379; line-height:1.35; margin-top:1px; white-space:normal; }
    .nk tr.sub td { border-top:none; padding:0 0 8px; font-size:8.5px; color:#8c8379; line-height:1.35; }
    .nk tr.s td { font-weight:700; border-top:0.6px solid #d9d0c3; padding-top:11px; }
    .nk tr.v td { color:#4a433c; }
    .res2 { margin-top:12px; }
    .note2 { font-family:'Lato',sans-serif; font-size:9.5px; font-weight:400; color:#6f675e; line-height:1.55; margin-top:14px; }
  `;

function nkLetterHtml(d) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const eur = n => { const v = Number(n) || 0; return (v < -0.004 ? '\u2212\u00a0' : '') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0\u20ac'; };
  const dt = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };
  const nb = s => String(s).replace(/§ /g, '§\u00a0').replace(/Abs\. /g, 'Abs.\u00a0').replace(/Satz /g, 'Satz\u00a0');
  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap');`;
  const CSS = NK_LETTER_CSS;
  const hdr = `<div class="hdr"><span class="hdr__wordmark">${esc(d.brand)}</span><div class="hdr__room"><span class="hdr__room-label">${esc(d.unitLabel || '')}</span><span class="hdr__room-name">${esc(d.unitName || '')}</span></div></div>`;
  const ftr = () => `<div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footer || '')}</span><span>Seite <span class="pgn">1</span> von <span class="pgt">1</span></span></div></div>`;
  const kv = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
  const bankBlock = () => `<div class="bank">${kv('Kontoinhaber', esc(d.bank.inhaber))}${d.bank.bank ? kv('Bank', esc(d.bank.bank)) : ''}${kv('IBAN', esc(d.bank.iban))}${d.bank.bic ? kv('BIC', esc(d.bank.bic)) : ''}${kv('Verwendungszweck', esc(d.verwendung))}</div>`;

  // ── Payment text: result neutral ("Es entsteht …"); where somebody must act, "du" for Casa Castel (d.du), else neutral
  const amt = Math.abs(Number(d.saldo) || 0);
  const resLabel = d.saldo > 0 ? 'Nachzahlung' : d.saldo < 0 ? 'Guthaben' : 'Ergebnis';
  const E = Number(d.einbehalt) || 0, du = !!d.du, due = `<strong>${dt(d.due)}</strong>`;
  const res = d.saldo > 0 ? `Es entsteht eine Nachzahlung von <strong>${eur(amt)}</strong>.` : d.saldo < 0 ? `Es entsteht ein Guthaben von <strong>${eur(amt)}</strong>.` : '';
  const T_ = {
    payTo:   du ? `Bitte überweise den Betrag bis zum ${due} auf folgendes Konto:` : `Der Betrag ist bis zum ${due} auf folgendes Konto zu überweisen:`,
    payRest: x => du ? `Bitte überweise den verbleibenden Betrag von <strong>${eur(x)}</strong> bis zum ${due} auf folgendes Konto:` : `Der verbleibende Betrag von <strong>${eur(x)}</strong> ist bis zum ${due} auf folgendes Konto zu überweisen:`,
    withRent: du ? `Bitte zahle den Betrag zusammen mit der nächsten Miete, spätestens bis zum ${due} (Verwendungszweck: ${esc(d.verwendung)}).` : `Der Betrag ist zusammen mit der nächsten Miete zu zahlen, spätestens bis zum ${due} (Verwendungszweck: ${esc(d.verwendung)}).`,
    rentLess: du ? 'Das Guthaben kann mit der nächsten Miete verrechnet werden: Überweise die nächste Miete einfach um diesen Betrag gekürzt.' : 'Das Guthaben kann mit der nächsten Mietzahlung verrechnet werden: Die nächste Miete wird um diesen Betrag gekürzt überwiesen.',
    // money back: where it goes
    back: (what, when) => d.tenantIban ? `${what} überweisen wir${when} auf ${du ? 'dein' : 'das'} Konto ${esc(d.tenantIban)}.`
      : d.former ? (du ? `${what} überweisen wir gern – bitte teile uns dafür kurz deine aktuelle Bankverbindung (IBAN) mit.` : `${what} wird überwiesen, sobald die aktuelle Bankverbindung (IBAN) vorliegt.`)
      : `${what} überweisen wir${when} auf ${du ? 'dein bekanntes Konto. Hat sich die Bankverbindung geändert, teile uns bitte kurz die neue mit.' : 'das bekannte Konto. Bei einer geänderten Bankverbindung bitte kurz Bescheid geben.'}`,
  };
  const when = d.due ? ` bis zum ${due}` : '';
  let pay;
  if (d.saldo > 0 && d.via === 'kaution' && E > 0) {
    const rest = Math.round((E - amt) * 100) / 100;
    pay = rest >= 0
      ? `<p class="p">${res} Der Betrag wird mit dem einbehaltenen Teil der Mietkaution (${eur(E)}) verrechnet.${rest > 0 ? ' ' + T_.back(`Den verbleibenden Betrag von <strong>${eur(rest)}</strong>`, when) : ' Damit ist die Kaution vollständig abgerechnet.'}</p>`
      : `<p class="p">${res} Der Betrag wird mit dem einbehaltenen Teil der Mietkaution (${eur(E)}) verrechnet. ${T_.payRest(-rest)}</p>${bankBlock()}`;
  }
  else if (d.saldo < 0 && E > 0) pay = `<p class="p">${res} ${T_.back(`Das Guthaben und den einbehaltenen Teil der Mietkaution (${eur(E)}), insgesamt <strong>${eur(amt + E)}</strong>,`, when)}</p>`;
  else if (!d.saldo && E > 0) pay = `<p class="p">Die Vorauszahlungen decken den Kostenanteil genau – es entsteht weder eine Nachzahlung noch ein Guthaben. ${T_.back(`Den einbehaltenen Teil der Mietkaution von <strong>${eur(E)}</strong>`, when)}</p>`;
  else if (d.saldo > 0 && d.via === 'kaution') pay = `<p class="p">${res} Der Betrag wird mit der Mietkaution verrechnet – eine Überweisung ist nicht nötig.</p>`;
  else if (d.saldo > 0 && d.via === 'miete') pay = `<p class="p">${res} ${T_.withRent}</p>`;
  else if (d.saldo > 0) pay = `<p class="p">${res} ${T_.payTo}</p>${bankBlock()}`;
  else if (d.saldo < 0 && d.via === 'miete') pay = `<p class="p">${res} ${T_.rentLess}</p>`;
  else if (d.saldo < 0 && d.via === 'kaution') pay = `<p class="p">${res} Das Guthaben wird bei der Abrechnung der Mietkaution berücksichtigt.</p>`;
  else if (d.saldo < 0) pay = `<p class="p">${res} ${T_.back('Das Guthaben', when)}</p>`;
  else pay = `<p class="p">Die Vorauszahlungen decken den Kostenanteil genau – es entsteht weder eine Nachzahlung noch ein Guthaben.</p>`;

  // Casa Castel ("du"): money back → the tenant's account right below (IBAN from the letter settings, else lines to fill in);
  // money to pay → the landlord's account from the profile
  if (du) {
    const line = '<span class="fill"></span>';
    const tenantBank = () => `<div class="bank">${kv('Kontoinhaber', d.tenantHolder ? esc(d.tenantHolder) : esc((d.names || [])[0] || '') || line)}${kv('IBAN', d.tenantIban ? esc(d.tenantIban) : line)}${d.tenantIban ? '' : kv('Bank', line)}</div>`;
    const ourBank = bankBlock;
    const back = (what) => `<p class="p">${what} bis zum ${due} auf folgendes Bankkonto zurücküberwiesen:</p>${tenantBank()}`;
    if (d.saldo > 0 && d.via === 'kaution' && E > 0) {
      const rest = Math.round((E - amt) * 100) / 100;
      const head = `Die Nachzahlung von <strong>${eur(amt)}</strong> wird mit dem einbehaltenen Teil deiner Mietkaution (${eur(E)}) verrechnet.`;
      pay = rest > 0 ? `<p class="p">${head}</p>` + back(`Der Restbetrag von <strong>${eur(rest)}</strong> wird dir`)
        : rest === 0 ? `<p class="p">${head} Damit ist die Kaution vollständig abgerechnet.</p>`
        : `<p class="p">${head} Bitte überweise uns den Restbetrag von <strong>${eur(-rest)}</strong> bis zum ${due} auf folgendes Bankkonto:</p>${ourBank()}`;
    }
    else if (d.saldo < 0 && E > 0) pay = back(`Dein Guthaben von <strong>${eur(amt)}</strong> und der einbehaltene Teil deiner Mietkaution (${eur(E)}), insgesamt <strong>${eur(amt + E)}</strong>, werden dir`);
    else if (!d.saldo && E > 0) pay = `<p class="p">Deine Vorauszahlungen decken den Kostenanteil genau.</p>` + back(`Der einbehaltene Teil deiner Mietkaution von <strong>${eur(E)}</strong> wird dir`);
    else if (d.saldo > 0 && d.via === 'kaution') pay = `<p class="p">Die Nachzahlung von <strong>${eur(amt)}</strong> wird mit deiner Mietkaution verrechnet – du musst nichts überweisen.</p>`;
    else if (d.saldo > 0 && d.via === 'miete') pay = `<p class="p">Bitte überweise uns die Nachzahlung von <strong>${eur(amt)}</strong> zusammen mit der nächsten Miete, spätestens bis zum ${due} (Verwendungszweck: ${esc(d.verwendung)}).</p>`;
    else if (d.saldo > 0) pay = `<p class="p">Bitte überweise uns den Betrag von <strong>${eur(amt)}</strong> bis zum ${due} auf folgendes Bankkonto:</p>${ourBank()}`;
    else if (d.saldo < 0 && d.via === 'miete') pay = `<p class="p">Dein Guthaben von <strong>${eur(amt)}</strong> kannst du mit der nächsten Miete verrechnen: Überweise die nächste Miete einfach um diesen Betrag gekürzt.</p>`;
    else if (d.saldo < 0 && d.via === 'kaution') pay = `<p class="p">Dein Guthaben von <strong>${eur(amt)}</strong> wird bei der Abrechnung deiner Mietkaution berücksichtigt.</p>`;
    else if (d.saldo < 0) pay = back(`Dein Guthaben von <strong>${eur(amt)}</strong> wird dir`);
    else pay = `<p class="p">Deine Vorauszahlungen decken den Kostenanteil genau – es entsteht weder eine Nachzahlung noch ein Guthaben.</p>`;
  }

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
      <div class="sum__r"><span>Anteil an den Betriebskosten</span><span>${eur(d.sum)}</span></div>
      <div class="sum__r"><span>abzüglich geleisteter Vorauszahlungen</span><span>\u2212\u00a0${eur(d.vz)}</span></div>
      <div class="total-box"><span>${resLabel}</span><span>${d.saldo ? eur(amt) : 'ausgeglichen'}</span></div>
    </div>
    ${pay}
    ${d.outro ? `<p class="p" style="margin-top:18px">${esc(d.outro)}</p>` : ''}
    ${(d.hinweise || []).length ? `<div class="sec">Hinweise</div>
    <div class="hints">${d.hinweise.map(h => `<div class="hint"><span>${esc(nb(h))}</span></div>`).join('')}</div>` : ''}
    <p class="greet">${esc(d.closing || 'Mit freundlichen Grüßen')}</p>
    <p class="greet__name">${esc(d.vermieter)}</p>
    ${d.anlagen ? `<p class="anl">Anlage: ${esc(d.anlagen)}</p>` : ''}
  </div></div>`;

  const T = d.table;
  // a cell is text, or { t, s } = text with a small second line; a row { sub } = a small full-width line under the row before
  const cell = v => (v && typeof v === 'object') ? `${esc(v.t)}<span class="sub">${esc(v.s || '')}</span>` : esc(v);
  const row = r => (r && !Array.isArray(r) && r.sub !== undefined)
    ? `<tr class="sub"><td colspan="${T.cols.length}">${esc(r.sub)}</td></tr>`
    : `<tr>${r.map((v, i) => `<td class="${T.cols[i].cls || ''}">${cell(v)}</td>`).join('')}</tr>`;
  const facts = (d.facts || []).length ? `<div class="facts">${d.facts.map(f => `<div class="fact"><div class="fact__k">${esc(f[0])}</div><div class="fact__v">${esc(f[1])}</div>${f[2] ? `<div class="fact__s">${esc(f[2])}</div>` : ''}</div>`).join('')}</div>` : '';
  const notes = (d.notes2 || []).length ? `<div class="sec">${esc(d.notes2Title || 'So wird gerechnet')}</div><div class="hints">${d.notes2.map(h => `<div class="hint hint--s"><span>${esc(h)}</span></div>`).join('')}</div>`
    : (d.note2 ? `<p class="note2">${esc(d.note2)}</p>` : '');
  const page2 = T ? `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    ${d.title2 ? `<div class="doc-title doc-title--s">${esc(d.title2)}</div><div class="doc-subtitle">${esc(d.subtitle2 || '')}</div>` : '<div class="sec sec--first" style="margin-bottom:12px">Aufstellung der Betriebskosten</div>'}
    ${facts}
    ${d.intro2 ? `<p class="intro2">${d.intro2}</p>` : ''}
    <table class="nk"><colgroup>${T.cols.map(c => `<col style="width:${c.w}"/>`).join('')}</colgroup>
      <thead><tr>${T.cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${T.rows.map(row).join('')}
        <tr class="s"><td colspan="${T.cols.length - 1}">${esc(T.sumLabel || 'Summe Anteil')}</td><td class="r">${eur(d.sum)}</td></tr>
        <tr class="v"><td colspan="${T.cols.length - 1}">${esc(T.vzLabel || 'abzüglich geleisteter Vorauszahlungen')}</td><td class="r">\u2212\u00a0${eur(d.vz)}</td></tr>
      </tbody></table>
    <div class="total-box res2"><span>${resLabel}</span><span>${d.saldo ? eur(amt) : 'ausgeglichen'}</span></div>
    ${notes}
  </div></div>` : '';

  const X = d.extra;
  const page3 = X && X.rows && X.rows.length ? `<div class="pdf-page page">${hdr}${ftr()}<div class="content">
    <div class="doc-title doc-title--s">${esc(X.title)}</div>
    <div class="doc-subtitle">${esc(X.intro || '')}</div>
    <table class="nk"><colgroup><col style="width:15%"/><col style="width:41%"/><col style="width:24%"/><col style="width:20%"/></colgroup>
      <thead><tr><th>Datum</th><th>Beschreibung</th><th>Firma</th><th class="r">Betrag</th></tr></thead>
      <tbody>${X.rows.map(r => `<tr><td class="m">${esc(dt(r[0]))}</td><td>${esc(r[1])}</td><td class="m">${esc(r[2])}</td><td class="r">${eur(r[3])}</td></tr>`).join('')}
        <tr class="s"><td colspan="3">${esc(X.sumLabel || 'Summe')}</td><td class="r">${eur(X.sum)}</td></tr>
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
