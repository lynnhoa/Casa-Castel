/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — MASTER CONTRACT TEMPLATE
   cc-contract-master.js

   One template for all three Casa Castel contracts:
     kurzzeit    → "Kurzzeitmietvertrag"  (stay under 6 months)
     jahres      → "Mietvertrag"          (Jahresvertrag, ends 31.08.)
     mietvertrag → "Mietvertrag"          (unbefristet · Mindestlaufzeit ·
                                            or befristet with legal reason)

   Shared text everywhere; only these parts differ by type:
     title · page-1 Mietzeit block · page-2 payment block · §1 · §2

   Use:
     const d = ccContractData(input);          // all numbers + texts
     await ccContractRender(container, d);     // pages into container
   ccContractRender lays the paragraphs onto A4 pages by measuring them,
   so a longer text never gets cut off. Every page is a .pdf-page.
   ───────────────────────────────────────────────────────────── */

(function () {

/* ── HELPERS ─────────────────────────────────────────────── */
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtN = n => Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur  = n => fmtN(n) + '\u00a0€';
const r2   = n => Math.round(n * 100) / 100;
function iso(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
const dt   = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const de   = s => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : '';
const dim  = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();   // days in month
const mName = d => MONTHS[d.getMonth()];
const mYear = d => MONTHS[d.getMonth()] + ' ' + d.getFullYear();
function addYearsMinusDay(s, n) {
  const d = dt(s); const e = new Date(d.getFullYear() + n, d.getMonth(), d.getDate() - 1);
  return e.getFullYear() + '-' + String(e.getMonth() + 1).padStart(2, '0') + '-' + String(e.getDate()).padStart(2, '0');
}

const GRUND = {
  eigenbedarf: 'Eigenbedarf (§\u00a0575 Abs.\u00a01 Nr.\u00a01 BGB)',
  abriss:      'Abriss / wesentliche Umbaumaßnahmen (§\u00a0575 Abs.\u00a01 Nr.\u00a02 BGB)',
  dienst:      'Dienstwohnung (§\u00a0575 Abs.\u00a01 Nr.\u00a03 BGB)',
};

/* ── DATA ────────────────────────────────────────────────────
   input = {
     type: 'kurzzeit' | 'jahres' | 'mietvertrag',
     settings: { vermieter_name, vermieter_adresse, vermieter_email, objekt_adresse,
                 objekt_plz_ort, kontoinhaber, bankname, iban, bic, gerichtsstand,
                 unterschrift_ort, energieklasse, endenergiebedarf, energieausweisart },
     room:   { name, flaeche_m2, gemeinschaftsraeume[], haustuerschluessel, zimmerschluessel, inventar[] },
     tenant: { name, address, birthday, email, phone },
     start, end,                         // ISO or TT.MM.JJJJ · end: kurzzeit/jahres always, mietvertrag only if befristet
     rent:   { mode: 'pauschal'|'kalt_nk', kalt, nk },   // pauschal: kalt = rent without NK, nk = NK share
     kaution: { amount, existing: bool },   // due: always sofort nach Unterzeichnung
     firstFull, lastFull,                // "voll" switches for a partial first / last month
     mv: { befristet, grund, person, mindestJahre },     // mietvertrag only
     sigDate,                            // optional
     buergschaft: bool,
   }                                                          */
function ccContractData(inp) {
  const type  = inp.type;
  const s     = inp.settings || {};
  const room  = inp.room || {};
  const t     = inp.tenant || {};
  const mv    = type === 'mietvertrag' ? (inp.mv || {}) : {};
  const start = iso(inp.start);
  const hasEnd = type !== 'mietvertrag' || !!mv.befristet;
  const end   = hasEnd ? iso(inp.end) : null;
  const BLANK = '__.__.____';                       // a date left empty → line to fill in by hand
  const pausch = (inp.rent || {}).mode === 'pauschal';
  const kalt  = Number((inp.rent || {}).kalt) || 0;
  const nk    = Number((inp.rent || {}).nk) || 0;
  const rent  = r2(kalt + nk);

  // ── First / last month (only when the dates are known) ──
  const S = start ? dt(start) : null, E = end ? dt(end) : null;
  const same = !!(E && S && E.getFullYear() === S.getFullYear() && E.getMonth() === S.getMonth());
  const first = { partial: !!S && S.getDate() !== 1, full: !!inp.firstFull, days: 0, amount: rent };
  const last  = { partial: !!E && E.getDate() !== dim(E), full: !!inp.lastFull, days: 0, amount: rent };
  if (first.partial) {
    first.days = dim(S) - S.getDate() + 1;
    first.amount = first.full ? rent : r2(rent / dim(S) * first.days);
  }
  if (last.partial) {
    last.days = E.getDate();
    last.amount = last.full ? rent : r2(rent / dim(E) * last.days);
  }
  if (same) {                                   // stay inside one month: only those days, once
    const stay = E.getDate() - S.getDate() + 1;
    last.partial = false;
    if (stay === dim(S)) { first.partial = false; first.amount = rent; }
    else { first.partial = true; first.days = stay; first.amount = first.full ? rent : r2(rent / dim(S) * stay); }
  }

  // ── Zahlungsplan (Kurzzeit only) ──
  let plan = null;
  if (type === 'kurzzeit' && S && E && E >= S) {
    const months = [];                          // every calendar month of the stay
    for (let d = new Date(S.getFullYear(), S.getMonth(), 1); d <= E; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
    const amountOf = (d, i) => i === 0 ? first.amount : (i === months.length - 1 && last.partial ? last.amount : rent);
    const labelOf  = (d, i) => {
      if (i === 0 && first.partial) return (first.full ? mName(d) + ' (voll)' : 'Anteil ' + mName(d));
      if (i === months.length - 1 && i > 0 && last.partial) return (last.full ? mName(d) + ' (voll)' : 'Anteil ' + mName(d));
      return mName(d);
    };
    // 1. Zahlung: first month, plus the next month when the first is only a part and more follow
    const z1n = first.partial && months.length > 2 ? 2 : 1;
    const z1 = { amount: r2(months.slice(0, z1n).reduce((a, d, i) => a + amountOf(d, i), 0)),
                 label: months.slice(0, z1n).map(labelOf).join(' + '), due: de(start) };
    const rest = months.slice(z1n);
    const lastPay = rest.length ? rest[rest.length - 1] : null;
    const middle = rest.slice(0, -1);
    plan = { z1,
      monthly: middle.length ? { amount: rent, from: mName(middle[0]), to: mName(middle[middle.length - 1]), count: middle.length } : null,
      last: lastPay ? { amount: amountOf(lastPay, months.length - 1), label: labelOf(lastPay, months.length - 1), due: mYear(lastPay) } : null };
  }

  // ── Kaution ──
  const k = inp.kaution || {};
  // Kaution is always due right after signing (decided Oct 2026 — no 5 days / individual anymore)
  const kfShort = 'fällig sofort nach Vertragsunterzeichnung';
  const kfLong  = 'sofort nach Vertragsunterzeichnung';

  // ── Mindestlaufzeit (Mietvertrag, unbefristet) ──
  const mJ = type === 'mietvertrag' && !mv.befristet && Number(mv.mindestJahre) > 0 ? Number(mv.mindestJahre) : 0;

  return {
    type, title: type === 'kurzzeit' ? 'Kurzzeitmietvertrag' : 'Mietvertrag',
    vermieterName: s.vermieter_name || '', vermieterAdresse: s.vermieter_adresse || '', vermieterEmail: s.vermieter_email || '',
    objektAdresse: s.objekt_adresse || '', objektPLZOrt: s.objekt_plz_ort || '',
    footerAdresse: [s.objekt_adresse, s.objekt_plz_ort].filter(Boolean).join(' · '),
    kontoinhaber: s.kontoinhaber || '', bankname: s.bankname || '', iban: s.iban || '', bic: s.bic || '',
    gerichtsstand: s.gerichtsstand || '', unterschriftOrt: s.unterschrift_ort || '',
    energieklasse: s.energieklasse || '', endenergiebedarf: s.endenergiebedarf || '', energieausweisart: s.energieausweisart || '',
    mieterName: t.name || '', mieterAdresse: t.address || '', mieterGeburtsdatum: t.birthday || '',
    mieterEmail: t.email || '', mieterTelefon: t.phone || '',
    zimmerName: room.name || '', zimmerFlaeche: room.flaeche_m2 || '',
    gemeinschaftsraeume: (room.gemeinschaftsraeume || []).join(', '),
    hausstuerschluessel: room.haustuerschluessel || 1, zimmerschluessel: room.zimmerschluessel || 1,
    inventar: (room.inventar || []).filter(i => i && i.gegenstand),
    start, end, mietbeginn: start ? de(start) : BLANK, mietende: end ? de(end) : (hasEnd ? BLANK : ''),
    pausch, kalt, nk, rent, first, last, plan,
    kaution: Number(k.amount) || 0, kautionBestehend: !!k.existing, kfShort, kfLong,
    befristet: type === 'mietvertrag' && !!mv.befristet,
    grundLabel: GRUND[mv.grund] || '', eigenbedarfPerson: mv.person || '',
    mindestJahre: mJ, mindestBis: mJ ? (start ? de(addYearsMinusDay(start, mJ)) : BLANK) : '',
    sigDate: inp.sigDate ? de(iso(inp.sigDate)) : '',
    buergschaft: !!inp.buergschaft,
  };
}

/* ── CSS (the look of the current Casa Castel contracts, darker text for print) ──
   Text colours: body #1a1a1a / #2b2722, labels #4a4540, lines #c9c2b8.
   Lato Regular (400) for all running text — the old Light (300) prints too thin. */
const INK = '#1a1a1a', BODY = '#2b2722', LABEL = '#4a4540', MUTED = '#6b645c', RULE = '#c9c2b8';
const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
.cc-ct { background:#ffffff; }
.cc-ct .page { position:relative; width:793.71px; height:1122.52px; background:#ffffff; overflow:hidden; }
.cc-ct .hdr { position:absolute; top:0; left:0; right:0; height:83.15px; background:#f0e8da; display:flex; align-items:center; justify-content:space-between; padding:0 80px; }
.cc-ct .hdr__wordmark { font-family:'Playfair Display',serif; font-size:26px; font-weight:400; color:#6e5128; letter-spacing:0.05em; line-height:1; }
.cc-ct .hdr__room { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.cc-ct .hdr__room-label { font-family:'Lato',sans-serif; font-size:7px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#8a6535; line-height:1; }
.cc-ct .hdr__room-name { font-family:'Playfair Display',serif; font-size:12px; font-weight:400; color:#6e5128; line-height:1; }
.cc-ct .ftr { position:absolute; left:80px; right:80px; bottom:32px; }
.cc-ct .ftr__rule { border:none; border-top:0.6px solid ${RULE}; margin-bottom:7px; }
.cc-ct .ftr__row { display:flex; justify-content:space-between; font-family:'Lato',sans-serif; font-size:8px; font-weight:400; color:${MUTED}; line-height:1; }
.cc-ct .content { position:absolute; top:143.63px; left:80px; right:80px; bottom:90px; overflow:hidden; }
.cc-ct .doc-title { font-family:'Playfair Display',serif; font-size:21px; font-weight:400; color:${INK}; line-height:1.15; margin-bottom:28px; }
.cc-ct .sec { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${LABEL}; margin-top:14px; padding-top:2px; padding-bottom:5px; border-bottom:0.7px solid ${RULE}; }
.cc-ct .sec--lg { font-size:8.5px; margin-top:22px; }
.cc-ct .content > .sec:first-child, .cc-ct .content > .sec--first { margin-top:0; }
.cc-ct .kv { display:flex; padding:3.5px 0; align-items:baseline; }
.cc-ct .kv__k { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:${MUTED}; min-width:140px; flex-shrink:0; line-height:1.55; padding-right:10px; }
.cc-ct .kv__v { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:${INK}; flex:1; line-height:1.55; }
.cc-ct .kv-gap { height:10px; }
.cc-ct .total-box { background:#f0e8d8; border-radius:3px; padding:9px 10px; display:flex; justify-content:space-between; align-items:center; margin-top:10px; margin-bottom:28px; }
.cc-ct .total-box__label, .cc-ct .total-box__value { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700; color:#6e5128; line-height:1; }
.cc-ct .nk-intro { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:${BODY}; line-height:1.55; margin-top:7px; margin-bottom:10px; }
.cc-ct .nk-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:24px; }
.cc-ct .nk-item { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:${BODY}; padding:2.5px 0; line-height:1.4; }
.cc-ct .nk-item--full { grid-column:1/-1; }
.cc-ct .nk-note { margin-top:6px; border-top:0.6px solid ${RULE}; padding-top:5px; font-style:italic; }
.cc-ct .note { font-family:'Lato',sans-serif; font-size:10.5px; font-weight:400; color:${BODY}; margin-top:10px; line-height:1.55; }
.cc-ct .clause { margin-top:9px; }
.cc-ct .content > .clause:first-child { margin-top:0; }
.cc-ct .clause__title { font-family:'Lato',sans-serif; font-size:12px; font-weight:700; color:${LABEL}; margin-bottom:3px; line-height:1.4; }
.cc-ct .clause__body { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:${BODY}; line-height:1.55; }
.cc-ct .nutzung { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:${BODY}; line-height:1.55; margin-top:7px; margin-bottom:16px; }
.cc-ct .inv-table { width:100%; border-collapse:collapse; margin-top:6px; }
.cc-ct .inv-table th { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${LABEL}; border-bottom:0.6px solid ${RULE}; padding:3px 0 4px; text-align:left; }
.cc-ct .inv-table td { font-family:'Lato',sans-serif; font-size:12px; font-weight:400; color:${INK}; padding:3.5px 0; line-height:1.55; }
.cc-ct .comment-label { font-family:'Lato',sans-serif; font-size:7.5px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${LABEL}; margin-top:40px; padding-top:2px; padding-bottom:5px; border-bottom:0.7px solid ${RULE}; }
.cc-ct .content > .sigwrap:first-child .comment-label { margin-top:0; }
.cc-ct .comment-line { border-bottom:0.6px solid ${RULE}; height:26px; margin-top:2px; }
.cc-ct .sig-block { margin-top:56px; display:flex; justify-content:space-between; }
.cc-ct .sig-col { width:44%; }
.cc-ct .sig-prefill { font-family:'Lato',Georgia,serif; font-size:10px; font-style:italic; font-weight:400; color:${BODY}; margin-bottom:4px; line-height:1.4; }
.cc-ct .sig-date-label { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:${MUTED}; margin-bottom:4px; }
.cc-ct .sig-write-gap { height:88px; }
.cc-ct .sig-write-gap--short { height:84px; }
.cc-ct .sig-ort-gap { height:20px; }
.cc-ct .sig-ort-line, .cc-ct .sig-line { border:none; border-top:0.7px solid ${INK}; margin-bottom:6px; }
.cc-ct .sig-role { font-family:'Lato',sans-serif; font-size:9px; font-weight:700; color:${LABEL}; }
/* Bürgschaft page (cc-buergschaft.js, text unchanged): same darker print colours */
.cc-ct .cc-bg-page, .cc-ct .cc-bg-page p, .cc-ct .cc-bg-page span { color:${INK} !important; font-weight:400 !important; }
.cc-ct .cc-bg-page div[style*="font-size:9.5px"] { color:${MUTED} !important; font-weight:400 !important; }
.cc-ct .cc-bg-page > div:first-child { font-weight:700 !important; }
.cc-ct .sig-name { font-family:'Lato',sans-serif; font-size:9px; font-weight:400; color:${BODY}; margin-top:4px; }
`;

/* ── BLOCKS ──────────────────────────────────────────────────
   The contract is a list of blocks. The renderer places them one after
   the other and starts a new page whenever the next block does not fit:
     { html }            a block that stays in one piece
     { html, keep:true } a heading — always moves to the next page together
                         with the block after it (never alone at a page end)
     { clause:[n,title,body] }  a paragraph; if one paragraph were ever taller
                         than a whole page it is continued sentence by sentence
     { table:{head,rows} }      inventory; continues row by row, header repeated
     { page:true }       start a new page here                                  */
const kv  = (k, v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
const sec = (t, lg) => ({ html: `<div class="sec${lg ? ' sec--lg' : ''}">${t}</div>`, keep: true });
const K   = (k, v) => ({ html: kv(k, v) });
const clauseHTML = (num, title, body, cont) => `<div class="clause">${num ? `<div class="clause__title">§\u00a0${num} ${title}${cont ? ' (Fortsetzung)' : ''}</div>` : ''}<div class="clause__body">${body}</div></div>`;

function pageShell(d, inner) {
  return `<div class="pdf-page page">
  <div class="hdr"><span class="hdr__wordmark">Casa Castel</span>
    <div class="hdr__room"><span class="hdr__room-label">Zimmer</span><span class="hdr__room-name">${esc(d.zimmerName)}</span></div></div>
  <div class="ftr"><hr class="ftr__rule"/><div class="ftr__row"><span>${esc(d.footerAdresse)}</span><span class="ftr__n"></span></div></div>
  <div class="content">${inner}</div>
</div>`;
}

function monthLines(d) {
  const out = [];
  if (d.first.partial) out.push(K(d.first.full ? 'Erster Monat (voll)' : 'Anteil erster Monat',
    eur(d.first.amount) + (d.first.full ? '' : ` (${d.first.days} Tage, Basis ${MONTHS[dt(d.start).getMonth()]})`)));
  if (d.last.partial) out.push(K(d.last.full ? 'Letzter Monat (voll)' : 'Anteil letzter Monat',
    eur(d.last.amount) + (d.last.full ? '' : ` (${d.last.days} Tage, Basis ${MONTHS[dt(d.end).getMonth()]})`)));
  return out;
}

/* Page 1 — parties, room, Mietzeit (type-specific), Miete */
function partOne(d) {
  const b = [{ html: `<div class="doc-title">${d.title}</div>`, keep: true }];
  b.push(sec('Vermieter'), K('Name', esc(d.vermieterName)), K('Adresse', esc(d.vermieterAdresse)), K('E-Mail', esc(d.vermieterEmail)));
  b.push(sec('Mieter'), K('Name', esc(d.mieterName)), K('Adresse', esc(d.mieterAdresse)), K('Geburtsdatum', esc(d.mieterGeburtsdatum)), K('E-Mail', esc(d.mieterEmail)));
  if (d.mieterTelefon) b.push(K('Telefon', esc(d.mieterTelefon)));
  b.push(sec('Mietobjekt'), K('Adresse', esc([d.objektAdresse, d.objektPLZOrt].filter(Boolean).join(', '))), K('Bezeichnung', esc(d.zimmerName)),
    K('Zimmergröße', 'ca.\u00a0' + esc(d.zimmerFlaeche) + '\u00a0m²'), K('Mitgenutzte Räume', esc(d.gemeinschaftsraeume) || '—'),
    K('Möblierung', 'Möbliert\u2002·\u2002Inventar siehe Anlage\u00a0A'));
  b.push(sec('Mietzeit'), K('Mietbeginn', esc(d.mietbeginn)));
  if (d.type === 'mietvertrag' && !d.befristet) {
    if (d.mindestJahre) b.push(K('Mindestlaufzeit', `${d.mindestJahre}\u00a0Jahr${d.mindestJahre > 1 ? 'e' : ''} ab Mietbeginn (bis ${d.mindestBis})`));
    b.push(...monthLines(d), K('Kündigungsfrist', '3\u00a0Monate · Schriftform (§\u00a0573c BGB)'));
  } else {
    b.push(K('Mietende', esc(d.mietende)), ...monthLines(d));
  }
  b.push(sec('Miete', true));
  if (d.pausch) b.push(K('Pauschalmiete', eur(d.rent) + '\u2002/ Monat (inkl. NK)'));
  else b.push(K('Kaltmiete', eur(d.kalt) + '\u2002/ Monat'), K('Nebenkosten VZ', eur(d.nk) + '\u2002/ Monat (Vorauszahlung)'));
  b.push({ html: `<div class="total-box"><span class="total-box__label">Gesamtmiete monatlich:</span><span class="total-box__value">${eur(d.rent)}</span></div>` });
  return b;
}

/* Page 2 — payment (Zahlungsplan for Kurzzeit · Fälligkeit for the others), bank, Betriebskosten */
const NK_ITEMS = ['Grundsteuer','Entsorgungsbetriebe','Wasserversorgung &amp; Entwässerung','Strom','Gas / Heizung (zentrale Heizungsanlage)','Internet (Gemeinschaftsanschluss)','Wohngebäudeversicherung','Haus- &amp; Grundbesitzerhaftpflicht','Wartung Heizungsanlage','Wartung Enthärtungsanlage inkl. Regeneriersalz','Schornsteinfeger','Gartenpflege','Gebäudereinigung / Putzdienst','Winterdienst'];
function partTwo(d) {
  const b = [{ page: true }];
  if (d.type === 'kurzzeit' && d.plan) {
    const p = d.plan;
    b.push(sec('Zahlungsplan &amp; Bankverbindung', true), K('1. Zahlung', `${eur(p.z1.amount)} (${p.z1.label}), fällig am ${p.z1.due}`));
    if (p.monthly) b.push(K('Weitere Zahlungen', `${eur(p.monthly.amount)} monatlich (${p.monthly.count > 1 ? p.monthly.from + '–' + p.monthly.to : p.monthly.from}), jeweils fällig bis 3.\u00a0Werktag`));
    if (p.last) b.push(K('Letzte Zahlung', `${eur(p.last.amount)} (${p.last.label}), fällig bis 3.\u00a0Werktag ${p.last.due}`));
  } else {
    b.push(sec('Bankverbindung', true), K('Fälligkeit', 'Spätestens 3.\u00a0Werktag des Monats (§\u00a0556b BGB)'));
  }
  b.push(d.kautionBestehend
    ? K('Kaution', (d.kaution ? eur(d.kaution) + '\u2002' : '') + '(bereits geleistet)')
    : K('Kaution', eur(d.kaution) + '\u2002(' + d.kfShort + ', §\u00a0551 BGB)'));
  b.push({ html: '<div class="kv-gap"></div>' + kv('Kontoinhaber', esc(d.kontoinhaber)) + kv('Bank', esc(d.bankname)) + kv('IBAN', esc(d.iban)) + kv('BIC', esc(d.bic))
    + `<p class="note">Alle Zahlungen per Überweisung. Verwendungszweck: Casa Castel – ${esc(d.zimmerName)} – Miete Monat Jahr / Kaution.</p>` });
  const intro = d.pausch
    ? 'In der monatlichen Pauschalmiete sind sämtliche nachfolgenden Betriebskosten (§§\u00a01, 2 BetrKV) bereits enthalten. Eine gesonderte Umlage oder Nachforderung erfolgt nicht; die Auflistung dient der Transparenz.'
    : 'Neben der Kaltmiete trägt der Mieter anteilig folgende Betriebskosten. Umlageschlüssel: Gesamtnutzfläche des Mieters (Zimmer + anteilige Gemeinschaftsfläche) im Verhältnis zur Gesamtnutzfläche aller Zimmer. Heizung und Warmwasser nach HeizkostenV.';
  b.push(sec('Betriebskosten gem. §§\u00a01, 2 BetrKV', true), { html: `<p class="nk-intro">${intro}</p>` },
    { html: `<div class="nk-grid">${NK_ITEMS.map(i => `<div class="nk-item">${i}</div>`).join('')}<div class="nk-item nk-item--full">Hauswart / sonstige anfallende Betriebskosten i.\u202fs.\u202fv. §\u00a02 Nr.\u00a017 BetrKV</div></div>` },
    { html: '<p class="nk-intro nk-note">Winterdienst wird grundsätzlich vom Mieter erledigt. Unter Umständen wird dieser gelegentlich organisiert, sofern nicht erledigt, wird dieser in den Nebenkosten berücksichtigt.</p>' });
  return b;
}

/* The paragraphs (shared text; §1 and §2 depend on the contract type) */
function partThree(d) {
  const b = [{ page: true }];
  const C = (n, t, body) => b.push({ clause: [n, t, body] });
  b.push(sec('Nutzungsrechte Gemeinschaftsbereiche', true), { html: `<p class="nutzung">Ab Mietbeginn steht dem Mieter die Mitnutzung folgender Gemeinschaftsbereiche zu: ${esc(d.gemeinschaftsraeume) || '—'}. Die Nutzung erfolgt schonend und rücksichtsvoll. Eine Reinigungspflicht nach jeder Nutzung wird ausdrücklich vereinbart. Der Mieter ist verpflichtet, das Zimmer und die Gemeinschaftsflächen sauber und ordnungsgemäß zu behandeln, ausreichend zu heizen, zu lüften und von Ungeziefer freizuhalten. Mängel sind dem Vermieter unverzüglich in Textform anzuzeigen.</p>` });

  const wohn = 'Das Zimmer darf ausschließlich zu Wohnzwecken durch den namentlich genannten Mieter genutzt werden.';
  if (d.type === 'mietvertrag' && !d.befristet) C('1', 'Mietzeit', `Das Mietverhältnis beginnt am ${d.mietbeginn} und läuft auf unbestimmte Zeit. ${wohn}`);
  else if (d.type === 'mietvertrag') C('1', 'Mietzeit und Befristung', `Das Mietverhältnis beginnt am ${d.mietbeginn}, ist gemäß §\u00a0575 Abs.\u00a01 BGB befristet und endet am ${d.mietende}, ohne dass es einer Kündigung bedarf. Befristungsgrund: ${d.grundLabel}${d.eigenbedarfPerson ? ' — ' + esc(d.eigenbedarfPerson) : ''}. Eine stillschweigende Verlängerung nach §\u00a0545 BGB ist ausgeschlossen. ${wohn}`);
  else C('1', 'Mietzeit und Befristung', `Das Mietverhältnis beginnt am ${d.mietbeginn} und endet am ${d.mietende}, ohne dass es einer Kündigung bedarf. Eine stillschweigende Verlängerung nach §\u00a0545 BGB ist ausgeschlossen. Ein Anspruch auf Verlängerung besteht nicht; eine Verlängerung bedarf einer neuen schriftlichen Vereinbarung. ${wohn}`);

  if (d.type === 'mietvertrag' && !d.befristet) {
    const waiver = d.mindestJahre
      ? `Beide Vertragsparteien verzichten wechselseitig für die Dauer von ${d.mindestJahre === 1 ? 'einem Jahr' : d.mindestJahre + ' Jahren'} ab Mietbeginn (bis ${d.mindestBis}) auf ihr Recht zur ordentlichen Kündigung dieses Mietvertrags. Eine ordentliche Kündigung ist erstmals zum Ablauf dieses Zeitraums zulässig; sie kann bereits innerhalb des Zeitraums so erklärt werden, dass sie zu dessen Ablauf wirksam wird. ` : '';
    C('2', 'Kündigung', `Die ordentliche Kündigung richtet sich nach §\u00a0573c BGB. Kündigungsfrist für den Mieter: 3\u00a0Monate zum Monatsende; für den Vermieter gilt die gesetzliche Frist. Die Kündigung bedarf der Schriftform. Eine stillschweigende Verlängerung nach §\u00a0545 BGB ist ausgeschlossen. ${waiver}Das Recht zur außerordentlichen Kündigung aus wichtigem Grund (§§\u00a0543, 569 BGB) bleibt unberührt.`);
  } else {
    C('2', 'Kündigung', 'Eine ordentliche Kündigung ist während der Mietzeit ausgeschlossen. Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund (§§\u00a0543, 569 BGB) bleibt unberührt.');
  }

  const fi = d.first.partial, la = d.last.partial;
  let pro = '';
  if (fi || la) {
    const vollParts = [fi && d.first.full ? 'erste Monat' : null, la && d.last.full ? 'letzte Monat' : null].filter(Boolean);
    if (vollParts.length) pro += ` Der ${vollParts.join(' und der ')} ${vollParts.length > 1 ? 'werden' : 'wird'} als voller Monat berechnet.`;
    if ((fi && !d.first.full) || (la && !d.last.full)) {
      const when = [fi && !d.first.full ? 'nicht zum ersten eines Monats ein' : null, la && !d.last.full ? 'nicht zum letzten eines Monats aus' : null].filter(Boolean).join(' oder ');
      pro += ` Zieht der Mieter ${when}, werden die Tage anteilig berechnet. Der Tagespreis ergibt sich aus der Gesamtmiete (${eur(d.rent)}) geteilt durch die tatsächliche Anzahl der Kalendertage des jeweiligen Monats.`;
    }
  }
  C('3', 'Miete', (d.pausch
      ? `Die monatliche Pauschalmiete beträgt ${eur(d.rent)}. Alle Nebenkosten (Strom, Wasser, Heizung, WLAN) sind in der Pauschale enthalten.`
      : `Die monatliche Kaltmiete beträgt ${eur(d.kalt)}, zuzüglich einer NK-Vorauszahlung von ${eur(d.nk)}.`)
    + pro + ' Die Miete ist jeweils spätestens bis zum dritten Werktag des Monats zu überweisen (§\u00a0556b BGB); bei Zahlungsverzug kann der Vermieter Verzugszinsen gemäß §\u00a0288 BGB geltend machen.');
  C('4', 'Untervermietung', 'Eine Untervermietung oder sonstige Überlassung des Zimmers an Dritte ist nicht gestattet.');
  C('5', 'Schlüsselübergabe', `Der Mieter erhält bei Einzug ${d.hausstuerschluessel}\u00a0Haustürschlüssel und ${d.zimmerschluessel}\u00a0Zimmerschlüssel. Weitere Schlüssel bedürfen der vorherigen Zustimmung des Vermieters (Textform). Bei Verlust trägt der Mieter die vollständigen Kosten des Schlossaustauschs. Alle Schlüssel sind bei Auszug zurückzugeben.`);
  C('6', 'Kaution', (d.kautionBestehend
      ? `Die vom Mieter bereits geleistete Kaution${d.kaution ? ' von ' + eur(d.kaution) : ''} bleibt bestehen und sichert auch dieses Mietverhältnis; eine erneute Zahlung ist nicht erforderlich.`
      : `Der Mieter überweist die Kaution von ${eur(d.kaution)} ${d.kfLong} auf das oben genannte Konto.`)
    + ' Der Vermieter legt die Kaution getrennt von seinem Vermögen auf einem Treuhandkonto an (§\u00a0551 BGB). Vom Mieter selbstverschuldete Schäden werden zu 100\u00a0% von der Kaution abgezogen. Schäden in Gemeinschaftsbereichen werden anteilig auf alle Bewohner aufgeteilt. Der verbleibende Betrag wird nach Prüfung des Zustands bei Auszug zurückerstattet.');
  C('7', 'Kleinreparaturen', 'Kleinreparaturen an Gegenständen, die dem häufigen Zugriff des Mieters unterliegen, trägt der Mieter bis 150\u00a0€ pro Einzelfall, höchstens jedoch 8\u00a0% der Jahresmiete pro Jahr. Übersteigen die Kosten einer einzelnen Reparatur 150\u00a0€, trägt der Mieter keinen Anteil.');
  C('8', 'Tierhaltung', 'Kleintiere ohne Belästigungspotenzial (Zierfische, Kleinnager) sind erlaubt. Alle weiteren Tiere bedürfen der vorherigen Zustimmung des Vermieters (Textform).');
  C('9', 'Betreten des Mietobjekts', 'Das Zimmer wird nur nach vorheriger Ankündigung (mindestens 2\u00a0Werktage in Textform) betreten, etwa zur Besichtigung bei Verkauf oder Weitervermietung oder für notwendige Instandhaltungsarbeiten. Bei Gefahr im Verzug ist das Betreten jederzeit ohne Vorankündigung zulässig.');
  C('10', 'Rückgabe bei Vertragsende', 'Das Zimmer wird möbliert und in vertragsgemäßem Zustand übergeben; ein Übergabeprotokoll wird bei Ein- und Auszug erstellt und von beiden Parteien unterzeichnet. Bei Vertragsende ist das Zimmer vollständig geräumt, gereinigt und in vertragsgemäßem Zustand zurückzugeben; alle Schlüssel sind auszuhändigen. Bauliche Änderungen sind zurückzubauen.');
  C('11', 'Aufrechnung &amp; Zurückbehaltungsrecht', 'Der Mieter kann gegen Forderungen des Vermieters nur mit unbestrittenen oder rechtskräftig festgestellten Gegenforderungen aufrechnen. Ein Zurückbehaltungsrecht steht dem Mieter nur wegen Mängeln nach §§\u00a0536\u00a0ff. BGB und nach mindestens einmonatiger vorheriger Ankündigung in Textform zu.');
  C('12', 'Haftpflichtversicherung', 'Der Mieter ist verpflichtet, für die Dauer des Mietverhältnisses eine gültige private Haftpflichtversicherung zu unterhalten und dem Vermieter auf Verlangen nachzuweisen.');
  C('13', 'Hausordnung', 'Rauchen ist im gesamten Gebäude nicht gestattet. Nachtruhe gilt von 22:00 bis 07:00\u00a0Uhr.');
  C('14', 'Datenschutz', 'Personenbezogene Daten werden ausschließlich zur Vertragsabwicklung verarbeitet (Art.\u00a06 Abs.\u00a01 lit.\u00a0b DSGVO), nur weitergegeben, soweit dies gesetzlich erforderlich ist, und nach Ablauf der gesetzlichen Aufbewahrungsfristen gelöscht.');
  C('15', 'Sonstige Vereinbarungen', `Mündliche Nebenabreden bestehen nicht. Änderungen und Ergänzungen bedürfen der Schriftform. Sollten einzelne Bestimmungen unwirksam sein, bleibt der Vertrag im Übrigen wirksam. Es gilt deutsches Recht. Gerichtsstand ist ${esc(d.gerichtsstand)}.`);
  if (d.energieklasse || d.endenergiebedarf || d.energieausweisart)
    C('16', 'Energieausweis (§\u00a016a GEG)', `Der Vermieter hat dem Mieter vor Vertragsschluss den Energieausweis vorgelegt. Energieeffizienzklasse: ${esc(d.energieklasse) || '—'}. Endenergiebedarf: ${d.endenergiebedarf ? esc(d.endenergiebedarf) : '—'}. Art des Ausweises: ${esc(d.energieausweisart) || '—'}.`);

  const sigCol = (role, name) => `<div class="sig-col">
      ${d.sigDate ? `<div class="sig-prefill">${esc(d.unterschriftOrt)}, ${d.sigDate}</div><div class="sig-write-gap"></div>`
                  : '<div class="sig-ort-gap"></div><hr class="sig-ort-line"/><div class="sig-date-label">Ort, Datum</div><div class="sig-write-gap sig-write-gap--short"></div>'}
      <hr class="sig-line"/><div class="sig-role">${role}</div><div class="sig-name">${esc(name)}</div></div>`;
  b.push({ html: `<div class="sigwrap"><div class="comment-label">Sonstige Anmerkungen</div>${'<div class="comment-line"></div>'.repeat(5)}
    <div class="sig-block">${sigCol('Vermieter', d.vermieterName)}${sigCol('Mieter', d.mieterName)}</div></div>` });
  return b;
}

function partFour(d) {
  if (!d.inventar.length) return [];
  return [{ page: true }, sec('Anlage A — Inventar', true),
    { table: { head: '<tr><th>Gegenstand</th><th>Anzahl</th></tr>', rows: d.inventar.map(i => `<tr><td>${esc(i.gegenstand)}</td><td>${esc(i.anzahl)}</td></tr>`) } }];
}

/* ── RENDER ──────────────────────────────────────────────────
   Places every block on A4 pages. Rule: nothing is ever cut off —
   a block that does not fit moves to the next page, a heading moves
   with it, and only something taller than a whole page is split
   (paragraph by sentence, inventory by row). Returns { pages, overflow };
   overflow must be 0 (checked before the PDF is made).                   */
let _ccctFontP = null;
function _ccctFonts() {
  if (_ccctFontP) return _ccctFontP;
  _ccctFontP = new Promise(res => {
    const l = document.createElement('link');
    l.id = 'cc-ct-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap';
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
    setTimeout(res, 4000);                                   // offline: fall back after 4 s
  }).then(() => document.fonts ? Promise.all(['400 12px Lato', 'italic 400 12px Lato', '700 12px Lato', '400 21px "Playfair Display"']
      .map(f => document.fonts.load(f).catch(() => null))) : null);
  return _ccctFontP;
}
async function ccContractRender(container, d) {
  if (!document.getElementById('cc-ct-css')) {
    const st = document.createElement('style'); st.id = 'cc-ct-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  container.classList.add('cc-ct');
  container.innerHTML = '';
  await _ccctFonts();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  let content = null, placed = [];            // placed = blocks on the current page: { nodes, keep }
  const newPage = () => {
    const w = document.createElement('div'); w.innerHTML = pageShell(d, '');
    const p = w.firstElementChild; container.appendChild(p);
    content = p.querySelector('.content'); placed = [];
  };
  const over = () => content.scrollHeight > content.clientHeight + 1;
  const nodesOf = html => { const w = document.createElement('div'); w.innerHTML = html; return [...w.childNodes]; };
  const put = (nodes) => nodes.forEach(n => content.appendChild(n));

  // Try to place a piece of HTML; true = it fits on this page
  function tryPlace(html, keep) {
    const nodes = nodesOf(html); put(nodes);
    if (!over()) { placed.push({ nodes, keep }); return true; }
    nodes.forEach(n => n.remove());
    return false;
  }
  // Move the trailing headings of this page onto a fresh page
  function breakPage() {
    let carry = [];
    while (placed.length && placed[placed.length - 1].keep) carry.unshift(placed.pop());
    if (carry.length && !placed.length) carry = [];          // the page holds only headings: leave them
    carry.forEach(c => c.nodes.forEach(n => n.remove()));
    newPage();
    carry.forEach(c => { put(c.nodes); placed.push(c); });
  }

  newPage();
  const blocks = [...partOne(d), ...partTwo(d), ...partThree(d), ...partFour(d)];
  for (const b of blocks) {
    if (b.page) { if (placed.length) newPage(); continue; }
    if (b.html != null) {
      if (tryPlace(b.html, b.keep)) continue;
      breakPage();
      if (!tryPlace(b.html, b.keep)) { put(nodesOf(b.html)); placed.push({ nodes: [], keep: false }); }  // taller than a page: shows up as overflow
      continue;
    }
    if (b.clause) {
      const [n, t, body] = b.clause;
      if (tryPlace(clauseHTML(n, t, body), false)) continue;
      breakPage();
      if (tryPlace(clauseHTML(n, t, body), false)) continue;
      // Taller than a whole page: continue sentence by sentence
      const parts = body.split(/(?<=\.)\s+(?=[A-ZÄÖÜ§])/);
      let chunk = [], cont = false;
      for (const sentence of parts) {
        const tryHtml = clauseHTML(n, t, [...chunk, sentence].join(' '), cont);
        const nodes = nodesOf(tryHtml); put(nodes);
        const fits = !over(); nodes.forEach(x => x.remove());
        if (fits || !chunk.length) { chunk.push(sentence); continue; }
        put(nodesOf(clauseHTML(n, t, chunk.join(' '), cont))); newPage();
        chunk = [sentence]; cont = true;
      }
      if (chunk.length) { put(nodesOf(clauseHTML(n, t, chunk.join(' '), cont))); placed.push({ nodes: [], keep: false }); }
      continue;
    }
    if (b.table) {
      let rows = b.table.rows.slice();
      while (rows.length) {
        let k = rows.length;
        while (k > 0 && !tryPlace(`<table class="inv-table"><thead>${b.table.head}</thead><tbody>${rows.slice(0, k).join('')}</tbody></table>`, false)) k--;
        if (k === 0) { if (!placed.length) { put(nodesOf(`<table class="inv-table"><tbody>${rows[0]}</tbody></table>`)); rows = rows.slice(1); continue; } breakPage(); continue; }
        rows = rows.slice(k);
        if (rows.length) newPage();
      }
    }
  }
  if (d.buergschaft && typeof window.ccBuergschaftPageHTML === 'function') {
    container.insertAdjacentHTML('beforeend', window.ccBuergschaftPageHTML(d, 'Zimmer'));
  }
  container.querySelectorAll('.ftr__n').forEach((el, i) => { el.textContent = String(i + 1); });
  const overflow = [...container.querySelectorAll('.content')].filter(c => c.scrollHeight > c.clientHeight + 1).length;
  return { pages: container.querySelectorAll('.pdf-page').length, overflow };
}

window.ccContractData = ccContractData;
window.ccContractRender = ccContractRender;
window.ccContractFonts = _ccctFonts;
})();
